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

export function myOfficerFor(officers, email, cls) {
  const e = String(email || "").toLowerCase();
  return (officers || []).find(
    (o) => o.qaClass === cls && String(o.email || "").toLowerCase() === e && officerStatus(o) === "ok"
  ) || null;
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
        return `${QA_CLASSES[c].role} ${QA_CLASSES[c].label}: ${d.status || "pending"}${d.byName ? " oleh " + d.byName : ""}${d.note ? " (" + d.note + ")" : ""}`;
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
    .map((c) => `${QA_CLASSES[c].role} ${QA_CLASSES[c].label}: ${r[c].byName}${r[c].license ? " (" + r[c].license + ")" : ""}, ${fmtDate((r[c].at || "").slice(0, 10))}`)
    .join("  |  ");
}
