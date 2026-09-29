import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot,
  collection, getDocs, writeBatch, runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";

// =====================================================================
//  PENYIMPANAN DATA ERP
//
//  Ada 2 mode:
//  - "legacy" (v1): satu dokumen per jenis data di koleksi erp_data,
//    isinya seluruh array dalam bentuk JSON. Mentok di batas 1 MB per
//    dokumen, dan kalau 2 orang simpan bareng, salah satunya ketimpa.
//  - "v2": data tetap dikelompokkan per jenis, tapi dipecah jadi
//    beberapa "shard" (maks ~400 KB) di erp_store/{key}/shards/{id}.
//    Tiap simpan cuma mengirim PERUBAHAN (tambah/ubah/hapus per id) dan
//    diterapkan di dalam transaksi ke data terbaru di server, jadi input
//    bareng tidak saling menimpa. User disimpan terpisah di erp_users/{email}
//    supaya role bisa dikunci lewat Firestore rules.
//
//  Mode ditentukan dokumen erp_meta/schema (version: 2 = sudah migrasi).
// =====================================================================

const LEGACY = "erp_data";
const STORE = "erp_store";
const USERS = "erp_users";
const META = "erp_meta";
export const USERS_KEY = "erp-users";
const MAX_SHARD_BYTES = 400 * 1024;

let MODE = "legacy";
export function getStorageMode() { return MODE; }

function reportSaveError(key, e) {
  console.error("Gagal menyimpan data:", key, e);
  try {
    window.dispatchEvent(new CustomEvent("erp-save-error", { detail: { key, message: e?.message || String(e) } }));
  } catch (_) { /* abaikan */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const genId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const newShardId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const byteLen = (s) => (enc ? enc.encode(s).length : s.length * 3);

// Baca mode penyimpanan sebelum aplikasi dirender. Kalau gagal konek,
// JANGAN diam-diam jatuh ke mode lama (bisa baca data basi) -- lempar error.
export async function initStorage() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const snap = await getDoc(doc(db, META, "schema"));
      MODE = snap.exists() && Number(snap.data().version) >= 2 ? "v2" : "legacy";
      return MODE;
    } catch (e) {
      // Rules lama belum mengizinkan baca erp_meta -> pasti belum migrasi.
      if (e && e.code === "permission-denied") { MODE = "legacy"; return MODE; }
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

// Dipakai klien mode lama untuk tahu kalau migrasi baru saja dijalankan.
export function watchSchema(onVersion) {
  return onSnapshot(
    doc(db, META, "schema"),
    (snap) => onVersion(snap.exists() ? Number(snap.data().version) || 1 : 1),
    () => {}
  );
}

// ---------------------------------------------------------------------
//  API LAMA (dokumen tunggal di erp_data) -- tetap dipakai untuk
//  pengaturan (erp-app-settings) dan untuk membaca data lama saat migrasi.
// ---------------------------------------------------------------------
export async function loadKey(key) {
  try {
    const snap = await getDoc(doc(db, LEGACY, key));
    return snap.exists() ? JSON.parse(snap.data().value) : [];
  } catch (e) {
    console.error("Gagal memuat data:", key, e);
    return [];
  }
}

export async function saveKey(key, value) {
  try {
    await setDoc(doc(db, LEGACY, key), { value: JSON.stringify(value), updatedAt: Date.now() });
    return true;
  } catch (e) {
    reportSaveError(key, e);
    return false;
  }
}

export async function deleteKey(key) {
  try {
    await deleteDoc(doc(db, LEGACY, key));
  } catch (e) {
    console.error("Gagal menghapus data:", key, e);
  }
}

export function subscribeKey(key, onData, onError) {
  return onSnapshot(
    doc(db, LEGACY, key),
    (snap) => {
      try {
        onData(snap.exists() ? JSON.parse(snap.data().value) : []);
      } catch (e) {
        console.error("Data rusak:", key, e);
        if (onError) onError(e);
      }
    },
    (e) => {
      console.error("Gagal sinkron realtime:", key, e);
      if (onError) onError(e);
    }
  );
}

// ---------------------------------------------------------------------
//  HELPER
// ---------------------------------------------------------------------
function diffLists(prev, next) {
  const prevMap = new Map();
  for (const it of prev || []) if (it && it.id != null) prevMap.set(String(it.id), JSON.stringify(it));
  const nextIds = new Set();
  const upserts = [];
  for (let it of next || []) {
    if (!it || typeof it !== "object") continue;
    if (it.id == null) it = { ...it, id: genId() };
    const id = String(it.id);
    nextIds.add(id);
    if (prevMap.get(id) !== JSON.stringify(it)) upserts.push(it);
  }
  const deletes = [];
  for (const id of prevMap.keys()) if (!nextIds.has(id)) deletes.push(id);
  return { upserts, deletes };
}

function chunkItems(items) {
  const out = [];
  let cur = [];
  let size = 2;
  for (const it of items) {
    const s = byteLen(JSON.stringify(it)) + 1;
    if (cur.length && size + s > MAX_SHARD_BYTES) {
      out.push(cur);
      cur = [];
      size = 2;
    }
    cur.push(it);
    size += s;
  }
  if (cur.length || !out.length) out.push(cur);
  return out;
}

const manifestRef = (key) => doc(db, STORE, key);
const shardsCol = (key) => collection(db, STORE, key, "shards");
const shardRef = (key, id) => doc(db, STORE, key, "shards", id);

// Peta id data -> shard tempatnya, diisi dari snapshot terakhir. Dipakai supaya
// saat simpan cukup membaca shard yang berubah, bukan seluruh shard.
const SHARD_INDEX = new Map();

function shardsToList(qs, key) {
  const rows = [];
  qs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (a.order || 0) - (b.order || 0));
  const index = new Map();
  const list = [];
  for (const r of rows) {
    for (const it of JSON.parse(r.value || "[]")) {
      list.push(it);
      if (it && it.id != null) index.set(String(it.id), r.id);
    }
  }
  if (key) SHARD_INDEX.set(key, index);
  return list;
}

function userDocToItem(data) {
  let base = {};
  try { base = JSON.parse(data.value || "{}"); } catch (_) { base = {}; }
  // role & access diambil dari field dokumen (yang dijaga rules), bukan dari JSON.
  return { ...base, email: data.email, role: data.role, access: data.access || [] };
}

function usersToList(qs) {
  const rows = [];
  qs.forEach((d) => rows.push(d.data()));
  rows.sort((a, b) => (a.order || 0) - (b.order || 0));
  return rows.map(userDocToItem);
}

function userDocData(u, order) {
  const email = String(u.email || "").trim().toLowerCase();
  return {
    email,
    role: u.role || "staff",
    access: Array.isArray(u.access) ? u.access : [],
    value: JSON.stringify({ ...u, email }),
    order,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------
//  V2: BACA / DENGARKAN
// ---------------------------------------------------------------------
async function loadListV2(key) {
  if (key === USERS_KEY) return usersToList(await getDocs(collection(db, USERS)));
  return shardsToList(await getDocs(shardsCol(key)), key);
}

function subscribeListV2(key, onData, onError) {
  const target = key === USERS_KEY ? collection(db, USERS) : shardsCol(key);
  const toList = key === USERS_KEY ? usersToList : (qs) => shardsToList(qs, key);
  return onSnapshot(
    target,
    (qs) => {
      try {
        onData(toList(qs));
      } catch (e) {
        console.error("Data rusak:", key, e);
        if (onError) onError(e);
      }
    },
    (e) => {
      console.error("Gagal sinkron realtime:", key, e);
      if (onError) onError(e);
    }
  );
}

// ---------------------------------------------------------------------
//  V2: SIMPAN PERUBAHAN (transaksi)
// ---------------------------------------------------------------------
async function saveShardedDiff(key, upserts, deletes) {
  await runTransaction(db, async (tx) => {
    const manSnap = await tx.get(manifestRef(key));
    const man = manSnap.exists() ? manSnap.data() : {};
    const shardIds = Array.isArray(man.shards) ? man.shards : [];
    const orders = Array.isArray(man.orders) && man.orders.length === shardIds.length ? man.orders : null;

    // items === null artinya shard itu belum dibaca (tidak disentuh, ditulis apa adanya).
    const shards = shardIds.map((id, i) => ({ id, order: orders ? Number(orders[i]) : i, items: null, dirty: false, isNew: false }));
    const byId = new Map(shards.map((s) => [s.id, s]));

    async function readShards(list) {
      const todo = list.filter((s) => s.items === null);
      const snaps = await Promise.all(todo.map((s) => tx.get(shardRef(key, s.id))));
      todo.forEach((s, i) => {
        s.items = snaps[i].exists() ? JSON.parse(snaps[i].data().value || "[]") : [];
        if (!orders && snaps[i].exists()) s.order = Number(snaps[i].data().order) || 0;
      });
    }

    // 1) Tentukan shard yang perlu dibaca dari peta id -> shard.
    const cache = SHARD_INDEX.get(key);
    let full = !cache || !orders;
    const expected = new Map(); // id -> shardId yang diharapkan
    const needed = new Set();
    if (!full) {
      for (const id of deletes) {
        const sid = cache.get(id);
        if (!sid || !byId.has(sid)) { full = true; break; }
        expected.set(id, sid);
        needed.add(sid);
      }
    }
    let hasNew = false;
    if (!full) {
      for (const it of upserts) {
        const id = String(it.id);
        const sid = cache.get(id);
        if (sid && byId.has(sid)) { expected.set(id, sid); needed.add(sid); }
        else if (sid) { full = true; break; } // shard-nya sudah berubah, baca semua
        else hasNew = true;
      }
    }
    if (!full && hasNew && shards.length) {
      const lastShard = shards.reduce((a, b) => (b.order > a.order ? b : a));
      needed.add(lastShard.id);
    }

    if (full) {
      await readShards(shards);
    } else {
      await readShards(shards.filter((s) => needed.has(s.id)));
      // Validasi: data yang diharapkan harus benar-benar ada di shard itu.
      for (const [id, sid] of expected) {
        if (!byId.get(sid).items.some((it) => it && String(it.id) === id)) { full = true; break; }
      }
      if (full) await readShards(shards);
    }
    shards.sort((a, b) => a.order - b.order);

    // 2) Terapkan perubahan.
    const loc = new Map();
    shards.forEach((s, si) => { if (s.items) s.items.forEach((it, ii) => { if (it && it.id != null) loc.set(String(it.id), [si, ii]); }); });

    for (const id of deletes) {
      const l = loc.get(id);
      if (l) { shards[l[0]].items[l[1]] = null; shards[l[0]].dirty = true; loc.delete(id); }
    }
    for (const it of upserts) {
      const id = String(it.id);
      const l = loc.get(id);
      if (l) {
        shards[l[0]].items[l[1]] = it;
        shards[l[0]].dirty = true;
      } else {
        if (!shards.length) shards.push({ id: newShardId(), order: 0, items: [], dirty: true, isNew: true });
        const last = shards[shards.length - 1];
        if (last.items === null) await readShards([last]); // seharusnya sudah terbaca
        last.items.push(it);
        last.dirty = true;
        loc.set(id, [shards.length - 1, last.items.length - 1]);
      }
    }

    // 3) Susun ulang shard yang berubah (pecah kalau kebesaran, buang kalau kosong).
    const result = [];
    const toDelete = [];
    shards.forEach((s, si) => {
      if (!s.dirty) { result.push(s); return; }
      const items = s.items.filter(Boolean);
      if (!items.length) { if (!s.isNew) toDelete.push(s.id); return; }
      const chunks = chunkItems(items);
      const nextOrder = si + 1 < shards.length ? shards[si + 1].order : s.order + 1;
      chunks.forEach((c, ci) => {
        result.push({
          id: ci === 0 ? s.id : newShardId(),
          order: ci === 0 ? s.order : s.order + ((nextOrder - s.order) * ci) / chunks.length,
          items: c,
          dirty: true,
        });
      });
    });

    for (const s of result) {
      if (!s.dirty) continue;
      tx.set(shardRef(key, s.id), { value: JSON.stringify(s.items), order: s.order, count: s.items.length, updatedAt: Date.now() });
    }
    for (const id of toDelete) tx.delete(shardRef(key, id));
    tx.set(manifestRef(key), { shards: result.map((s) => s.id), orders: result.map((s) => s.order), updatedAt: Date.now() });
  });
}

async function saveUsersDiff(prev, next) {
  const { upserts, deletes } = diffLists(prev, next);
  if (!upserts.length && !deletes.length) return;
  const prevEmailById = new Map((prev || []).filter((u) => u && u.id != null).map((u) => [String(u.id), String(u.email || "").trim().toLowerCase()]));
  const orderById = new Map((next || []).map((u, i) => [String(u?.id), i]));
  const batch = writeBatch(db);
  for (const u of upserts) {
    const data = userDocData(u, orderById.get(String(u.id)) ?? Date.now());
    if (!data.email) continue;
    const oldEmail = prevEmailById.get(String(u.id));
    if (oldEmail && oldEmail !== data.email) batch.delete(doc(db, USERS, oldEmail));
    batch.set(doc(db, USERS, data.email), data);
  }
  for (const id of deletes) {
    const email = prevEmailById.get(id);
    if (email) batch.delete(doc(db, USERS, email));
  }
  await batch.commit();
}

// ---------------------------------------------------------------------
//  API YANG DIPAKAI APLIKASI (otomatis pilih mode)
// ---------------------------------------------------------------------
export async function loadList(key) {
  if (MODE !== "v2") return loadKey(key);
  try {
    return await loadListV2(key);
  } catch (e) {
    console.error("Gagal memuat data:", key, e);
    return [];
  }
}

export function subscribeList(key, onData, onError) {
  if (MODE !== "v2") return subscribeKey(key, onData, onError);
  return subscribeListV2(key, onData, onError);
}

// prev = daftar yang dilihat layar sebelum diubah, next = daftar sesudah diubah.
export async function saveList(key, prev, next) {
  if (MODE !== "v2") return saveKey(key, next);
  try {
    if (key === USERS_KEY) {
      await saveUsersDiff(prev, next);
    } else {
      const { upserts, deletes } = diffLists(prev, next);
      if (upserts.length || deletes.length) await saveShardedDiff(key, upserts, deletes);
    }
    return true;
  } catch (e) {
    reportSaveError(key, e);
    return false;
  }
}

// Tulis ulang seluruh isi satu jenis data (dipakai migrasi, restore, backup).
async function writeWholeListV2(key, list) {
  if (key === USERS_KEY) {
    const old = await getDocs(collection(db, USERS));
    const batch = writeBatch(db);
    const keep = new Set();
    (list || []).forEach((u, i) => {
      const data = userDocData(u, i);
      if (!data.email) return;
      keep.add(data.email);
      batch.set(doc(db, USERS, data.email), data);
    });
    old.forEach((d) => { if (!keep.has(d.id)) batch.delete(d.ref); });
    await batch.commit();
    return;
  }
  const manSnap = await getDoc(manifestRef(key));
  const oldIds = manSnap.exists() ? manSnap.data().shards || [] : [];
  const chunks = chunkItems(list || []);
  const ids = chunks.map(() => newShardId());
  // Commit per 15 shard (~6 MB) supaya tidak melewati batas ukuran request.
  const GROUP = 15;
  for (let g = 0; g < chunks.length; g += GROUP) {
    const batch = writeBatch(db);
    for (let i = g; i < Math.min(g + GROUP, chunks.length); i++) {
      batch.set(shardRef(key, ids[i]), { value: JSON.stringify(chunks[i]), order: i, count: chunks[i].length, updatedAt: Date.now() });
    }
    if (g + GROUP >= chunks.length) {
      oldIds.forEach((id) => batch.delete(shardRef(key, id)));
      batch.set(manifestRef(key), { shards: ids, orders: ids.map((_, i) => i), updatedAt: Date.now() });
    }
    await batch.commit();
  }
}

export async function writeWholeList(key, list) {
  if (MODE !== "v2") return saveKey(key, list);
  try {
    await writeWholeListV2(key, list);
    return true;
  } catch (e) {
    reportSaveError(key, e);
    return false;
  }
}

export async function deleteList(key) {
  if (MODE !== "v2") return deleteKey(key);
  try {
    const qs = await getDocs(shardsCol(key));
    const batch = writeBatch(db);
    qs.forEach((d) => batch.delete(d.ref));
    batch.delete(manifestRef(key));
    await batch.commit();
  } catch (e) {
    console.error("Gagal menghapus data:", key, e);
  }
}

// ---------------------------------------------------------------------
//  MIGRASI v1 -> v2
//  Data lama di erp_data TIDAK dihapus (jadi cadangan). Setelah migrasi,
//  rules mengunci penulisan ke data lama.
// ---------------------------------------------------------------------
function normalizeForMigration(key, list) {
  const seen = new Map();
  let noId = 0;
  let dup = 0;
  const out = (Array.isArray(list) ? list : []).filter((it) => it && typeof it === "object").map((it, idx) => {
    let id = it.id == null || it.id === "" ? null : String(it.id);
    if (!id) { id = `legacy-${key}-${idx}`; noId++; }
    if (seen.has(id)) {
      const n = seen.get(id) + 1;
      seen.set(id, n);
      dup++;
      id = `${id}__dup${n}`;
    } else {
      seen.set(id, 0);
    }
    return String(it.id) === id ? it : { ...it, id };
  });
  return { list: out, noId, dup };
}

export async function migrateToV2(listKeys, onProgress = () => {}) {
  if (MODE === "v2") throw new Error("Data sudah dalam format baru.");
  const report = [];
  const all = [...listKeys.filter((k) => k !== USERS_KEY), USERS_KEY];

  for (const key of all) {
    onProgress(`Membaca ${key}...`);
    const snap = await getDoc(doc(db, LEGACY, key)); // lempar error kalau gagal baca -> migrasi batal
    const raw = snap.exists() ? JSON.parse(snap.data().value) : [];
    let list;
    let noId = 0;
    let dup = 0;
    if (key === USERS_KEY) {
      const byEmail = new Map();
      (Array.isArray(raw) ? raw : []).forEach((u) => {
        const email = String(u?.email || "").trim().toLowerCase();
        if (email) byEmail.set(email, { ...u, email, id: u.id != null ? u.id : genId() });
        else noId++;
      });
      list = [...byEmail.values()];
      dup = (Array.isArray(raw) ? raw.length : 0) - list.length - noId;
    } else {
      ({ list, noId, dup } = normalizeForMigration(key, raw));
    }

    onProgress(`Menulis ${key} (${list.length} data)...`);
    await writeWholeListV2(key, list);

    onProgress(`Verifikasi ${key}...`);
    const back = await loadListV2(key);
    const ok = key === USERS_KEY
      ? back.length === list.length && list.every((u) => back.some((b) => b.email === u.email && b.role === (u.role || "staff")))
      : JSON.stringify(back) === JSON.stringify(list);
    if (!ok) throw new Error(`Verifikasi gagal untuk ${key}: data yang tersimpan tidak sama dengan data lama. Migrasi dibatalkan, data lama masih utuh.`);
    report.push({ key, count: list.length, noId, dup });
  }

  onProgress("Mengaktifkan format baru...");
  await setDoc(doc(db, META, "schema"), { version: 2, migratedAt: new Date().toISOString() });
  MODE = "v2";
  return report;
}
