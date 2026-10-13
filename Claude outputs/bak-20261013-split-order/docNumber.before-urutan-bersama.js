// =====================================================================
//  PENOMORAN DOKUMEN PT WPM
//  Format : {nomor}/{KODE}/WPM/{bulan romawi}/{2 digit tahun}
//           contoh 500/SO/WPM/VIII/26
//  Nomor urut jalan terus sepanjang tahun (nggak reset per bulan) dan
//  reset tiap ganti tahun: mulai 500, khusus retur mulai 3.
//  nextDocNumber : nomor terbesar tahun itu + 1 (bukan jumlah dokumen + 1,
//                  supaya nggak dobel kalau ada dokumen yang dibatalkan)
//  isNumberTaken : cek nomor sudah dipakai dokumen lain (nggak peka huruf besar/kecil & spasi)
// =====================================================================
import { qaClassOf } from "./qa";
import { itemsSubtotal } from "./billing";

export const COMPANY_DOC_CODE = "WPM";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date();
}

export function nextDocNumber(existingNumbers, code, { start = 500, date = new Date() } = {}) {
  const d = toDate(date);
  const yy = String(d.getFullYear()).slice(-2);
  const re = new RegExp(`^(\\d+)/${code}/${COMPANY_DOC_CODE}/[IVXLC]+/(\\d{2})$`, "i");
  let max = 0;
  (existingNumbers || []).forEach((n) => {
    const mm = String(n || "").trim().match(re);
    if (mm && mm[2] === yy) max = Math.max(max, parseInt(mm[1], 10));
  });
  const seq = max >= start ? max + 1 : start;
  return `${seq}/${code}/${COMPANY_DOC_CODE}/${ROMAN[d.getMonth()]}/${yy}`;
}

export function isNumberTaken(list, field, value, excludeId, extraMatch) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  return (list || []).some((d) => d && d.id !== excludeId
    && String(d[field] || "").trim().toLowerCase() === v
    && (!extraMatch || extraMatch(d)));
}

// =====================================================================
//  KODE GOLONGAN PRODUK DI NOMOR DOKUMEN
//  Format: 500/SO-OK/WPM/X/26   (OB = Obat Bebas, OK = Obat Keras, AL = Alkes/Dental/Consumables)
//  Satu dokumen = satu golongan. Nomor urut terpisah per golongan (SO-OB, SO-OK, SO-AL
//  masing-masing mulai 500; retur mulai 3).
// =====================================================================
export const GOLONGAN_LABEL = { OB: "Obat Bebas", OK: "Obat Keras", AL: "Alkes" };
const GOL_RANK = { OK: 3, OB: 2, AL: 1 };

export function golonganOf(product) {
  if (!product) return null;
  if (String(product.category || "").trim().toLowerCase() === "obat bebas") return "OB";
  // Obat Keras, kategori obat lama (Generik/Paten), atau produk yang di-set manual sebagai obat
  return qaClassOf(product) === "obat" ? "OK" : "AL";
}

export function golonganOfItems(items, products) {
  const set = new Set();
  (items || []).forEach((it) => {
    const g = golonganOf((products || []).find((p) => p.id === it.productId));
    if (g) set.add(g);
  });
  const codes = [...set];
  const highest = [...codes].sort((a, b) => GOL_RANK[b] - GOL_RANK[a])[0] || null;
  return { codes, mixed: codes.length > 1, code: codes.length === 1 ? codes[0] : null, highest };
}

// Kode dokumen + golongan, mis. docCode("SO", "OK") -> "SO-OK"
export function docCode(base, gol) {
  return gol ? `${base}-${gol}` : base;
}

// Nomor masih format otomatis WPM untuk jenis dokumen ini (boleh diganti otomatis)
export function isAutoFormat(number, base) {
  return new RegExp(`^\\d+/${base}(-(OB|OK|AL))?/${COMPANY_DOC_CODE}/[IVXLC]+/\\d{2}$`, "i").test(String(number || "").trim());
}

// Nomor format otomatis tapi kode golongannya beda sama item
export function numberGolMismatch(number, base, gol) {
  if (!gol || !isAutoFormat(number, base)) return false;
  return !String(number).toUpperCase().includes(`/${docCode(base, gol)}/`);
}

export function mixedMessage(g) {
  return `Item campur golongan (${g.codes.map((c) => GOLONGAN_LABEL[c]).join(", ")}). Satu dokumen cuma boleh satu golongan, pisahkan jadi dokumen terpisah.`;
}

// =====================================================================
//  PECAH ORDER CAMPUR JADI BEBERAPA DOKUMEN (1 dokumen per golongan)
//  - Item dikelompokkan per golongan (urutan: OK, OB, AL)
//  - Potongan persen (%) dipakai sama di tiap dokumen
//  - Potongan nominal (Rp) & ongkir dibagi proporsional ke subtotal tiap dokumen
//    (pembulatan rupiah, sisa pembulatan masuk ke dokumen terakhir supaya totalnya pas)
// =====================================================================
export function splitOrderByGolongan(items, products, deductions = [], ongkir = 0) {
  const order = ["OK", "OB", "AL"];
  const groups = {};
  (items || []).forEach((it) => {
    const g = golonganOf((products || []).find((p) => p.id === it.productId)) || "AL";
    (groups[g] ||= []).push(it);
  });
  const keys = order.filter((k) => groups[k]);
  const totalRaw = itemsSubtotal(items) || 0;
  const shares = keys.map((k) => (totalRaw > 0 ? itemsSubtotal(groups[k]) / totalRaw : 1 / keys.length));

  const splitAmount = (amount) => {
    const a = Number(amount) || 0;
    let used = 0;
    return keys.map((_, i) => {
      if (i === keys.length - 1) return Math.round((a - used) * 100) / 100;
      const v = Math.round(a * shares[i]);
      used += v;
      return v;
    });
  };

  const dedSplits = (deductions || []).map((d) => (d.mode === "amount" ? splitAmount(d.value) : null));
  const ongkirSplit = splitAmount(ongkir);

  return keys.map((gol, i) => ({
    gol,
    items: groups[gol],
    deductions: (deductions || []).map((d, j) => (dedSplits[j] ? { ...d, value: dedSplits[j][i] } : { ...d })),
    ongkir: ongkirSplit[i],
  }));
}

// Nomor untuk beberapa dokumen sekaligus (nomor yang barusan dipakai ikut dihitung)
export function nextDocNumbersForGroups(existingNumbers, base, gols, opts) {
  const used = [...(existingNumbers || [])];
  return gols.map((g) => {
    const n = nextDocNumber(used, docCode(base, g), opts);
    used.push(n);
    return n;
  });
}
