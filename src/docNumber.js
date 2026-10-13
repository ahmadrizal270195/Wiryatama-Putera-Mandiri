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
