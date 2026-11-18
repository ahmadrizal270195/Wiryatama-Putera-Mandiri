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

// =====================================================================
//  PECAH 1 SO JADI BEBERAPA FAKTUR
//  Faktur hasil pecahan ditandai splitFromSO: true. Item faktur nyimpen soId asalnya.
// =====================================================================
export function itemSoId(inv, it) {
  return it?.soId || inv?.soId || null;
}

// Qty yang sudah diterima pelanggan (SJ status diterima) per produk
export function receivedQtyBySO(deliveryNotes, soId) {
  const m = {};
  (deliveryNotes || []).filter((dn) => dn.soId === soId && dn.status === "diterima")
    .forEach((dn) => (dn.items || []).forEach((it) => {
      m[it.productId] = (m[it.productId] || 0) + (Number(it.receivedQty ?? it.qty) || 0);
    }));
  return m;
}

// Qty yang sudah masuk faktur per produk (dari SO ini saja)
export function invoicedQtyBySO(invoices, soId, excludeInvId) {
  const m = {};
  (invoices || []).filter((inv) => inv.id !== excludeInvId && invoiceHasSO(inv, soId))
    .forEach((inv) => (inv.items || []).forEach((it) => {
      if (itemSoId(inv, it) !== soId) return;
      m[it.productId] = (m[it.productId] || 0) + (Number(it.qty) || 0);
    }));
  return m;
}

// Item SO yang barangnya sudah diterima tapi belum difakturkan (harga & diskon item ikut SO)
export function remainingSOItems(so, deliveryNotes, invoices) {
  const rec = receivedQtyBySO(deliveryNotes, so.id);
  const done = invoicedQtyBySO(invoices, so.id);
  const pool = {};
  Object.keys(rec).forEach((pid) => { pool[pid] = Math.max(0, rec[pid] - (done[pid] || 0)); });
  const out = [];
  const lines = so.items || [];
  lines.forEach((it, idx) => {
    const left = pool[it.productId] || 0;
    if (left <= 0) return;
    const isLastLine = !lines.slice(idx + 1).some((x) => x.productId === it.productId);
    const qty = isLastLine ? left : Math.min(left, Number(it.qty) || 0);
    pool[it.productId] = left - qty;
    if (qty > 0) out.push({ productId: it.productId, qty, unitPrice: it.unitPrice, discountType: it.discountType || "percent", discountPercent: Number(it.discountPercent || 0), soId: so.id });
  });
  return out;
}

// SO ini sudah pernah dipecah fakturnya?
export function soIsSplit(invoices, soId) {
  return (invoices || []).some((inv) => inv.splitFromSO && invoiceHasSO(inv, soId));
}
