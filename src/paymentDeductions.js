import { computeBill } from "./billing";

// =====================================================================
//  POTONGAN SAAT PELANGGAN MEMBAYAR
//  Instansi pemerintah / BUMN (pemungut pajak) membayar faktur dikurangi PPN yang
//  mereka pungut & PPh 22 yang mereka potong. Ada juga potongan lain (PPh 23,
//  biaya admin bank, dll). Uang yang masuk (payment.amount) tetap dicatat apa adanya,
//  potongannya dicatat terpisah di payment.potongan supaya:
//    - sisa piutang = tagihan - uang - potongan  -> faktur bisa lunas
//    - kas/bank cuma bertambah sebesar uang yang benar-benar masuk
//    - pajak yang dipotong bisa direkap buat SPT, biaya admin & potongan lain jadi beban
//  payment.potongan = [{ kind, amount, note }], payment.buktiNo = no. bukti potong / SSP
// =====================================================================

export const POTONGAN_KINDS = [
  { id: "ppn", label: "PPN dipungut", tax: true },
  { id: "pph22", label: "PPh 22 dipotong", tax: true },
  { id: "pph23", label: "PPh 23 dipotong", tax: true },
  { id: "admin", label: "Biaya admin bank", expense: true },
  { id: "lain", label: "Potongan lain", expense: true, needNote: true },
];
export const potonganLabel = (k) => POTONGAN_KINDS.find((x) => x.id === k)?.label || k;

// Pemungut pajak di master pelanggan
export const TAX_COLLECTOR_TYPES = [
  { id: "", label: "Bukan pemungut" },
  { id: "pemerintah", label: "Instansi Pemerintah (pungut PPN + PPh 22)" },
  { id: "bumn", label: "BUMN / Pemungut lain (pungut PPN + PPh 22)" },
];
export const isTaxCollector = (customer) => !!customer?.taxCollector;

export const PPH22_RATE = 0.015; // PPh 22 atas penyerahan barang ke pemungut = 1,5% x DPP

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (n) => Math.round(num(n));

export function potonganTotal(p) {
  return (Array.isArray(p?.potongan) ? p.potongan : []).reduce((s, x) => s + num(x.amount), 0);
}
// Nilai yang melunasi tagihan = uang masuk + potongan
export function settledAmount(p) {
  return num(p?.amount) + potonganTotal(p);
}
export function potonganOf(p, kind) {
  return (Array.isArray(p?.potongan) ? p.potongan : []).filter((x) => x.kind === kind).reduce((s, x) => s + num(x.amount), 0);
}

// Usulan potongan pajak untuk faktur ke pemungut: PPN faktur + PPh 22 (1,5% DPP).
// Kalau faktur pecahan / ada retur, DPP & PPN dihitung proporsional terhadap nilai tagihan.
export function suggestTaxPotongan(inv, { returned = 0 } = {}) {
  const bill = computeBill(inv);
  const total = num(bill.total);
  const ratio = total > 0 ? Math.max(0, total - num(returned)) / total : 1;
  const ppn = inv?.taxType && inv.taxType !== "none" ? round(num(bill.ppn) * ratio) : 0;
  const pph22 = round(num(bill.dpp) * ratio * PPH22_RATE);
  return { ppn, pph22 };
}

export function cleanPotongan(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => ({
      kind: x.kind, amount: round(x.amount), note: String(x.note || "").trim(),
      // potongan yang dihitung pakai persen: simpan persen & dasar hitungnya buat jejak audit
      ...(num(x.pct) > 0 ? { pct: num(x.pct), base: round(x.base) } : {}),
    }))
    .filter((x) => x.amount > 0);
}

// Dasar hitung "potongan lain" kalau pakai persen:
//  - pelanggan pemungut (instansi/BUMN): nilai tagihan - retur - PPN dipungut - PPh dipotong
//  - pelanggan biasa                    : nilai tagihan - retur
export function lainBase(inv, { returned = 0, collector = false, ppn = 0, pph22 = 0, pph23 = 0 } = {}) {
  const tagihan = Math.max(0, num(computeBill(inv).total) - num(returned));
  return Math.max(0, tagihan - (collector ? num(ppn) + num(pph22) + num(pph23) : 0));
}

// Baris riwayat pembayaran (dipakai di daftar faktur, laporan pelunasan, dll)
export function potonganHistoryRows(p) {
  return (Array.isArray(p?.potongan) ? p.potongan : []).filter((x) => num(x.amount) > 0).map((x) => ({
    date: p.date, kind: "potongan", label: potonganLabel(x.kind),
    sub: [num(x.pct) > 0 ? `${x.pct}% x Rp${round(x.base).toLocaleString("id-ID")}` : "", x.note, p.buktiNo ? `bukti ${p.buktiNo}` : ""].filter(Boolean).join(" · "), amount: num(x.amount),
  }));
}

// Kata kunci nama pelanggan yang kemungkinan besar instansi pemerintah / BUMN
const INSTANSI_KEYWORDS = [
  "rsud", "rsup", "rs umum daerah", "puskesmas", "dinas", "kementerian", "kemenkes", "badan", "kejaksaan", "kejari", "kejati",
  "kepolisian", "polri", "polda", "polres", "bhayangkara", "tni", "kodam", "korem", "kodim", "lanud", "lantamal", "rumkit", "rumkital",
  "rs tentara", "rs angkatan", "pemerintah", "pemkab", "pemkot", "pemprov", "kabupaten", "kota ", "provinsi", "sekretariat", "setda",
  "universitas negeri", "politeknik negeri", "labkesda", "bpjs", "pertamina", "pln", "persero", "bumn", "rs pertamina", "rs pelni",
  "kemen", "lapas", "rutan", "imigrasi", "bnn", "basarnas", "bpbd", "poliklinik kejaksaan", "klinik pratama polri",
];
export function looksLikeInstansi(name) {
  const n = ` ${String(name || "").toLowerCase()} `;
  return INSTANSI_KEYWORDS.some((k) => n.includes(k.startsWith(" ") || k.endsWith(" ") ? k : k));
}
