// =====================================================================
//  RUMUS TAGIHAN (satu sumber untuk SO, Faktur Penjualan, PO, Faktur Pembelian)
//
//  Urutan hitung:
//    1. Subtotal  = jumlah (qty x harga - diskon item)        -> diskon item bisa % atau Rp
//    2. Diskon nota / global (boleh lebih dari 1 baris)       -> motong SEBELUM PPN
//    3. DPP & PPN sesuai opsi pajak (none / ppn11 / include11)
//    4. Fee (boleh lebih dari 1 baris)                         -> motong SETELAH PPN, % dihitung dari DPP
//    5. Ongkir (kalau ada)                                     -> nambah tagihan
//
//  Pemotongan disimpan di doc.deductions = [{ id, kind: "diskon"|"fee", mode: "percent"|"amount", value, note }]
//  Dokumen lama yang cuma punya discountType / discountPercent otomatis dibaca sebagai 1 baris diskon.
// =====================================================================

export const DEDUCTION_KINDS = [
  { id: "diskon", label: "Diskon Nota / Global" },
  { id: "fee", label: "Fee" },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function itemDiscountAmount(qty, unitPrice, type, value) {
  const gross = num(qty) * num(unitPrice);
  const v = num(value);
  if (type === "amount") return Math.min(gross, Math.max(0, v));
  return gross * (Math.min(100, Math.max(0, v)) / 100);
}

export function itemLineTotal(it) {
  const gross = num(it?.qty) * num(it?.unitPrice);
  return Math.max(0, gross - itemDiscountAmount(it?.qty, it?.unitPrice, it?.discountType, it?.discountPercent));
}

export function itemsSubtotal(items) {
  return (items || []).reduce((s, it) => s + itemLineTotal(it), 0);
}

export function normalizeDeductions(doc) {
  if (Array.isArray(doc?.deductions)) return doc.deductions.filter((d) => d && (d.kind === "diskon" || d.kind === "fee"));
  const v = num(doc?.discountPercent ?? doc?.discount ?? 0);
  if (v > 0) return [{ id: "legacy", kind: "diskon", mode: doc?.discountType === "amount" ? "amount" : "percent", value: v, note: "" }];
  return [];
}

function lineAmount(d, base) {
  const v = Math.max(0, num(d.value));
  return d.mode === "amount" ? v : base * (Math.min(100, v) / 100);
}

// Hitung tagihan lengkap 1 dokumen. opts.includeOngkir = false untuk SO / PO (tidak punya ongkir).
export function computeBill(doc, opts = {}) {
  const raw = itemsSubtotal(doc?.items);
  const deductions = normalizeDeductions(doc);

  const diskonLines = deductions.filter((d) => d.kind === "diskon").map((d) => ({ ...d, amount: lineAmount(d, raw) }));
  const diskon = Math.min(raw, diskonLines.reduce((s, d) => s + d.amount, 0));
  const afterDisc = Math.max(0, raw - diskon);

  let dpp = afterDisc;
  let ppn = 0;
  let afterTax = afterDisc;
  const taxType = doc?.taxType || "none";
  if (taxType === "ppn11") {
    ppn = dpp * 0.11;
    afterTax = dpp + ppn;
  } else if (taxType === "include11") {
    dpp = afterDisc / 1.11;
    ppn = afterDisc - dpp;
    afterTax = afterDisc;
  }

  const feeLines = deductions.filter((d) => d.kind === "fee").map((d) => ({ ...d, amount: lineAmount(d, dpp) }));
  const fee = Math.min(afterTax, feeLines.reduce((s, d) => s + d.amount, 0));
  const ongkir = opts.includeOngkir === false ? 0 : num(doc?.ongkir);
  const total = Math.max(0, afterTax - fee) + ongkir;

  return { raw, diskon, diskonLines, discHeaderAmount: diskon, dpp, ppn, afterTax, fee, feeLines, ongkir, total, taxType };
}

// Field lama (discountType / discountPercent) tetap diisi supaya kode lama yang belum
// pakai computeBill tetap dapat angka diskon yang sama.
export function legacyDiscountFields(deductions, raw) {
  const dl = (deductions || []).filter((d) => d.kind === "diskon" && num(d.value) > 0);
  if (dl.length === 0) return { discountType: "percent", discountPercent: 0 };
  if (dl.every((d) => d.mode !== "amount")) {
    return { discountType: "percent", discountPercent: Math.min(100, dl.reduce((s, d) => s + num(d.value), 0)) };
  }
  const amt = dl.reduce((s, d) => s + lineAmount(d, raw), 0);
  return { discountType: "amount", discountPercent: Math.round(Math.min(raw, amt)) };
}

// Bersihkan baris kosong sebelum disimpan.
export function cleanDeductions(deductions) {
  return (deductions || [])
    .filter((d) => d && num(d.value) > 0)
    .map((d) => ({ id: d.id, kind: d.kind === "fee" ? "fee" : "diskon", mode: d.mode === "amount" ? "amount" : "percent", value: num(d.value), note: String(d.note || "").trim() }));
}
