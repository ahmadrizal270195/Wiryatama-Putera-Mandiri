import { doc, setDoc, getDoc, onSnapshot, collection, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { addSignatureToCache } from "./qa";

// =====================================================================
//  TANDA TANGAN DIGITAL APJ / PJT
//
//  Status "disetujui" di dokumen (qaReview) bisa diubah siapa saja yang
//  bisa nulis dokumennya. Supaya nggak bisa dipalsukan, tiap keputusan
//  APJ/PJT juga dicatat di koleksi erp_qa_signatures. Rules cuma
//  mengizinkan catatan itu dibuat oleh email petugas itu sendiri, dan
//  cuma kalau emailnya terdaftar sebagai APJ/PJT di erp_qa_roles (yang
//  cuma bisa diubah Super Admin). Catatan nggak bisa diubah/dihapus.
//
//  Aplikasi baru menganggap dokumen "disetujui" kalau ada tanda tangannya.
// =====================================================================

const SIGS = "erp_qa_signatures";
const ROLES = "erp_qa_roles";

// Penanda tanda tangan legacy sudah dibuat. Sebelum itu verifikasi belum dinyalakan.
export function watchBackfill(onDone, onError) {
  return onSnapshot(doc(db, "erp_meta", "qaSignatures"), (snap) => onDone(!!(snap.exists() && snap.data().backfilledAt)), (e) => onError && onError(e));
}

export function subscribeSignatures(onData, onError) {
  return onSnapshot(
    collection(db, SIGS),
    (qs) => { const list = []; qs.forEach((d) => list.push({ id: d.id, ...d.data() })); onData(list); },
    (e) => { console.warn("Tanda tangan QA tidak bisa dibaca:", e?.code || e); if (onError) onError(e); }
  );
}

const sigId = () => "sig-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

// Buat tanda tangan keputusan. Mengembalikan id-nya (disimpan di qaReview[cls].sigId).
export async function createSignature({ docKind, docId, cls, status, by, byName, note, reviewCreatedAt }) {
  const id = sigId();
  const data = {
    docKind: String(docKind || ""), docId: String(docId), cls, status,
    by: String(by || "").toLowerCase(), byName: byName || "", note: note || "",
    reviewCreatedAt: reviewCreatedAt || "", at: new Date().toISOString(), legacy: false,
  };
  await setDoc(doc(db, SIGS, id), data);
  addSignatureToCache({ id, ...data });
  return id;
}

// Daftar APJ/PJT aktif per email -> erp_qa_roles. Dijalankan oleh Super Admin.
export function desiredRoles(officers, today = new Date().toISOString().slice(0, 10)) {
  const map = new Map();
  for (const o of officers || []) {
    const email = String(o?.email || "").trim().toLowerCase();
    if (!email || o.active === false) continue;
    if (o.validUntil && o.validUntil < today) continue;
    const classes = o.qaClass === "both" ? ["obat", "alkes"] : o.qaClass ? [o.qaClass] : [];
    const cur = map.get(email) || { classes: new Set(), noExpiry: false, maxUntil: "" };
    classes.forEach((c) => cur.classes.add(c));
    // Masa berlaku: ambil yang paling lama di antara entri petugas dengan email yang sama
    if (!o.validUntil) cur.noExpiry = true;
    else if (o.validUntil > cur.maxUntil) cur.maxUntil = o.validUntil;
    map.set(email, cur);
  }
  const out = {};
  for (const [email, v] of map) {
    if (!v.classes.size) continue;
    out[email] = { classes: [...v.classes].sort(), validUntil: v.noExpiry || !v.maxUntil ? null : new Date(v.maxUntil + "T23:59:59+07:00") };
  }
  return out;
}

export function subscribeRoles(onData, onError) {
  return onSnapshot(
    collection(db, ROLES),
    (qs) => { const m = {}; qs.forEach((d) => { m[d.id] = d.data(); }); onData(m); },
    (e) => { if (onError) onError(e); }
  );
}

const sameRole = (a, b) => {
  if (!a || !b) return false;
  const va = a.validUntil?.toMillis ? a.validUntil.toMillis() : a.validUntil ? new Date(a.validUntil).getTime() : null;
  const vb = b.validUntil?.toMillis ? b.validUntil.toMillis() : b.validUntil ? new Date(b.validUntil).getTime() : null;
  return JSON.stringify(a.classes || []) === JSON.stringify(b.classes || []) && va === vb;
};

export async function syncRoles(officers, current) {
  const want = desiredRoles(officers);
  const batch = writeBatch(db);
  let n = 0;
  for (const [email, r] of Object.entries(want)) {
    if (!sameRole(r, current?.[email])) { batch.set(doc(db, ROLES, email), { ...r, updatedAt: Date.now() }); n++; }
  }
  for (const email of Object.keys(current || {})) if (!want[email]) { batch.delete(doc(db, ROLES, email)); n++; }
  if (n) await batch.commit();
  return n;
}

// Sekali jalan saat fitur ini pertama aktif: persetujuan lama (sebelum ada tanda tangan)
// dicatat sebagai tanda tangan "legacy" oleh Super Admin, supaya dokumen lama tetap dianggap sah.
export async function backfillLegacySignatures(docsByKind) {
  const meta = doc(db, "erp_meta", "qaSignatures");
  const snap = await getDoc(meta);
  if (snap.exists() && snap.data().backfilledAt) return 0;
  const rows = [];
  for (const [kind, list] of Object.entries(docsByKind)) {
    for (const d of list || []) {
      const r = d?.qaReview;
      if (!r || !Array.isArray(r.required)) continue;
      for (const c of r.required) {
        const a = r[c];
        if (a && a.status === "approved" && !a.sigId) {
          rows.push([`legacy__${d.id}__${c}`, { docKind: kind, docId: String(d.id), cls: c, status: "approved", by: String(a.by || "").toLowerCase(), byName: a.byName || "", note: a.note || "", reviewCreatedAt: r.createdAt || "", at: a.at || "", legacy: true }]);
        }
      }
    }
  }
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    rows.slice(i, i + 400).forEach(([id, data]) => batch.set(doc(db, SIGS, id), data));
    await batch.commit();
  }
  await setDoc(meta, { backfilledAt: new Date().toISOString(), count: rows.length });
  rows.forEach(([id, data]) => addSignatureToCache({ id, ...data }));
  return rows.length;
}
