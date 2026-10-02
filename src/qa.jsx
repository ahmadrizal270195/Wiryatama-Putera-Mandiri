import React from "react";

// =====================================================================
//  CDOB: REVIEW APJ (OBAT) & PJT (ALKES)
//
//  Alur: Transaksi -> validasi sistem (klasifikasi item) -> review oleh
//  penanggung jawab tiap kategori -> Disetujui = boleh diproses,
//  Ditolak = HOLD. Transaksi campuran butuh persetujuan keduanya.
//
//  Data review disimpan di dokumen transaksinya sendiri:
//    doc.qaReview = {
//      required: ["obat", "alkes"],
//      createdAt,
//      obat:  { status: "pending"|"approved"|"rejected", by, byName, at, note },
//      alkes: { ... },
//    }
//  Dokumen lama (dibuat sebelum fitur ini) tidak punya qaReview dan tidak ditahan.
// =====================================================================

export const QA_CLASSES = {
  obat: { label: "Obat", role: "APJ", roleLong: "Apoteker Penanggung Jawab (APJ)" },
  alkes: { label: "Alkes", role: "PJT", roleLong: "Penanggung Jawab Teknis Alkes (PJT)" },
};

const OBAT_CATEGORIES = ["obat generik", "obat paten"];

// Kategori produk -> kelas CDOB. Bisa ditimpa per produk lewat product.qaClass.
export function qaClassOf(product) {
  if (!product) return "alkes";
  if (product.qaClass === "obat" || product.qaClass === "alkes") return product.qaClass;
  const cat = String(product.category || "").toLowerCase();
  return OBAT_CATEGORIES.includes(cat) || cat.startsWith("obat") ? "obat" : "alkes";
}

export function requiredClasses(items, products) {
  const set = new Set();
  for (const it of items || []) {
    if (!it || !it.productId) continue;
    const p = (products || []).find((x) => x.id === it.productId);
    set.add(qaClassOf(p));
  }
  return ["obat", "alkes"].filter((c) => set.has(c));
}

// Bikin data review baru (semua kategori yang terlibat = menunggu).
export function newReview(items, products) {
  const required = requiredClasses(items, products);
  const review = { required, createdAt: new Date().toISOString() };
  for (const c of required) review[c] = { status: "pending" };
  return review;
}

// "none" = dokumen lama / tidak perlu review, lalu pending | approved | rejected
export function reviewState(doc) {
  const r = doc && doc.qaReview;
  if (!r || !Array.isArray(r.required) || r.required.length === 0) return "none";
  const sts = r.required.map((c) => (r[c] && r[c].status) || "pending");
  if (sts.includes("rejected")) return "rejected";
  if (sts.every((s) => s === "approved")) return "approved";
  return "pending";
}

export function isCleared(doc) {
  const st = reviewState(doc);
  return st === "none" || st === "approved";
}

export function blockedReason(doc, what = "Transaksi") {
  const st = reviewState(doc);
  if (st === "pending") return `${what} masih menunggu persetujuan ${pendingRoles(doc).join(" & ")}.`;
  if (st === "rejected") return `${what} DITAHAN (HOLD) karena ditolak ${rejectedRoles(doc).join(" & ")}.`;
  return "";
}

export function pendingRoles(doc) {
  const r = doc?.qaReview;
  if (!r) return [];
  return r.required.filter((c) => (r[c]?.status || "pending") === "pending").map((c) => QA_CLASSES[c].role);
}

export function rejectedRoles(doc) {
  const r = doc?.qaReview;
  if (!r) return [];
  return r.required.filter((c) => r[c]?.status === "rejected").map((c) => QA_CLASSES[c].role);
}

// Terapkan keputusan satu kategori ke dokumen (mengembalikan dokumen baru).
export function applyDecision(doc, cls, status, officer, note) {
  const r = doc.qaReview || { required: [cls] };
  return {
    ...doc,
    qaReview: {
      ...r,
      [cls]: {
        status,
        by: officer.email || "",
        byName: officer.name || officer.email || "",
        officerId: officer.id || null,
        license: officer.sipa || "",
        // Persetujuan oleh wakil dicatat "a.n." penanggung jawab utama
        delegate: !!officer.delegate,
        onBehalfOf: officer.delegate ? onBehalfOfFor(officer, cls) : "",
        onBehalfOfLicense: officer.delegate ? (principalFor(onBehalfOfFor(officer, cls), cls)?.sipa || "") : "",
        at: new Date().toISOString(),
        note: note || "",
      },
    },
  };
}

// Petugas aktif & masih berlaku untuk email yang sedang login.
export function officerStatus(o, today = new Date().toISOString().slice(0, 10)) {
  if (!o) return "none";
  if (o.active === false) return "inactive";
  if (o.validUntil && o.validUntil < today) return "expired";
  return "ok";
}

// qaClass petugas: "obat" | "alkes" | "both" (khusus wakil yang mewakili APJ & PJT sekaligus)
export function officerCovers(o, cls) {
  return o && (o.qaClass === cls || o.qaClass === "both");
}

export function officerRoleLabel(o) {
  if (!o) return "";
  const base = o.qaClass === "both" ? "APJ & PJT" : `${QA_CLASSES[o.qaClass]?.role || ""} ${QA_CLASSES[o.qaClass]?.label || ""}`.trim();
  return o.delegate ? `Wakil ${base}` : base;
}

// Penanggung jawab utama didahulukan; wakil dipakai kalau akun ini memang terdaftar sebagai wakil.
export function myOfficerFor(officers, email, cls) {
  const e = String(email || "").toLowerCase();
  const mine = (officers || []).filter(
    (o) => officerCovers(o, cls) && String(o.email || "").toLowerCase() === e && officerStatus(o) === "ok"
  );
  return mine.find((o) => !o.delegate) || mine[0] || null;
}

// Wakil "APJ & PJT sekaligus" menyimpan nama yang diwakili per kategori.
export function onBehalfOfFor(o, cls) {
  if (!o || !o.delegate) return "";
  return (cls === "obat" ? o.onBehalfOfObat : cls === "alkes" ? o.onBehalfOfAlkes : "") || o.onBehalfOf || "";
}

// Cache master APJ/PJT (diisi App) supaya dokumen cetak bisa ambil SIPA penanggung jawab utama.
let OFFICERS_CACHE = [];
export function setOfficersCache(list) { OFFICERS_CACHE = Array.isArray(list) ? list : []; }

function principalFor(name, cls) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return OFFICERS_CACHE.find((o) => !o.delegate && officerCovers(o, cls) && String(o.name || "").trim().toLowerCase() === n) || null;
}

// Nama & SIPA untuk kolom TTD di dokumen cetak.
// Kalau disetujui wakil, yang tercetak cuma penanggung jawab utama (nama wakil disembunyikan).
// Riwayat audit di aplikasi tetap mencatat "a.n.".
export function printSigner(d, cls) {
  if (!d) return { name: "", license: "" };
  if (!d.delegate) return { name: d.byName || "", license: d.license || "" };
  const p = principalFor(d.onBehalfOf, cls);
  return { name: p?.name || d.onBehalfOf || d.byName || "", license: d.onBehalfOfLicense || p?.sipa || "" };
}

// Nama yang ditampilkan untuk sebuah keputusan: "Nama" atau "Nama (a.n. APJ X)"
export function decisionByText(d) {
  if (!d || !d.byName) return "";
  return d.delegate ? `${d.byName} (a.n. ${d.onBehalfOf || "penanggung jawab"})` : d.byName;
}

export function myClasses(officers, email) {
  return ["obat", "alkes"].filter((c) => myOfficerFor(officers, email, c));
}

// ---------------------------------------------------------------------
//  Badge status review
// ---------------------------------------------------------------------
export function QABadge({ doc, colorConfig, compact = false }) {
  const st = reviewState(doc);
  if (st === "none") return null;
  const r = doc.qaReview;
  const roles = r.required.map((c) => QA_CLASSES[c].role).join("+");
  const map = {
    pending: [colorConfig?.warnSoft || "#FBF1E1", colorConfig?.warn || "#C97F1E", compact ? `${roles}: menunggu` : `Menunggu ${pendingRoles(doc).join(" & ")}`],
    approved: [colorConfig?.goodSoft || "#E9F3ED", colorConfig?.good || "#357A5D", `${roles}: disetujui`],
    rejected: [colorConfig?.dangerSoft || "#FBEAE8", colorConfig?.danger || "#B84438", `HOLD: ditolak ${rejectedRoles(doc).join(" & ")}`],
  };
  const [bg, fg, text] = map[st];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap"
      style={{ background: bg, color: fg, borderColor: fg + "33" }}
      title={r.required.map((c) => {
        const d = r[c] || {};
        return `${QA_CLASSES[c].role} ${QA_CLASSES[c].label}: ${d.status || "pending"}${d.byName ? " oleh " + decisionByText(d) : ""}${d.note ? " (" + d.note + ")" : ""}`;
      }).join("\n")}
    >
      {text}
    </span>
  );
}

// Baris "Disetujui oleh" untuk dicetak di dokumen.
export function qaSignatureText(doc, fmtDate = (d) => d) {
  const r = doc?.qaReview;
  if (!r || !r.required?.length) return "";
  return r.required
    .filter((c) => r[c]?.status === "approved")
    .map((c) => `${QA_CLASSES[c].role} ${QA_CLASSES[c].label}: ${printSigner(r[c], c).name}${printSigner(r[c], c).license ? " (" + printSigner(r[c], c).license + ")" : ""}, ${fmtDate((r[c].at || "").slice(0, 10))}`)
    .join("  |  ");
}
