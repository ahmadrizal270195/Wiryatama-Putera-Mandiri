// =====================================================================
//  HUBUNGAN FAKTUR <-> SO & URUTAN DAFTAR
//  Faktur biasa nyimpen 1 SO di soId. Faktur gabungan nyimpen semua SO-nya di soIds
//  (soId tetap diisi SO pertama supaya tampilan lama tetap jalan).
// =====================================================================
import { normalizeDeductions } from "./billing";

export function invoiceSoIds(inv) {
  if (!inv) return [];
  if (Array.isArray(inv.soIds) && inv.soIds.length) return inv.soIds;
  return inv.soId ? [inv.soId] : [];
}

export function invoiceHasSO(inv, soId) {
  return !!soId && invoiceSoIds(inv).includes(soId);
}

// Gabung potongan beberapa SO jadi potongan 1 faktur.
// Potongan persen harus sama di semua SO (biasanya SO hasil pecahan 1 order),
// potongan nominal (Rp) dijumlah.
export function mergeDeductions(docs) {
  const lists = (docs || []).map((d) => normalizeDeductions(d));
  const pctSig = (l) => JSON.stringify(l.filter((d) => d.mode !== "amount").map((d) => [d.kind, Number(d.value) || 0]).sort());
  const sig0 = pctSig(lists[0] || []);
  if (lists.some((l) => pctSig(l) !== sig0)) return { ok: false, deductions: [] };
  const pct = (lists[0] || []).filter((d) => d.mode !== "amount").map((d) => ({ ...d }));
  const amtMap = {};
  lists.forEach((l) => l.filter((d) => d.mode === "amount").forEach((d) => {
    const k = `${d.kind}|${d.note || ""}`;
    if (!amtMap[k]) amtMap[k] = { ...d, value: 0 };
    amtMap[k].value += Number(d.value) || 0;
  }));
  return { ok: true, deductions: [...pct, ...Object.values(amtMap)] };
}

// Urutan "terakhir dibuat": dokumen baru selalu ditambah di akhir daftar,
// jadi posisi di daftar = urutan pembuatan.
export function newestFirst(list) {
  return [...(list || [])].reverse();
}
export function createdRank(list) {
  const m = new Map();
  (list || []).forEach((d, i) => m.set(d?.id, i));
  return (d) => (m.has(d?.id) ? m.get(d.id) : -1);
}
