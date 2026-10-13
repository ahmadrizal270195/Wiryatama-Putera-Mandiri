// =====================================================================
//  PENOMORAN DOKUMEN
//  nextDocNumber : nomor urut berikutnya = nomor terbesar yang ada + 1
//                  (bukan jumlah dokumen + 1, supaya nggak dobel kalau ada yang dibatalkan)
//  isNumberTaken : cek nomor sudah dipakai dokumen lain (nggak peka huruf besar/kecil & spasi)
// =====================================================================
export function nextDocNumber(existingNumbers, prefix, year = new Date().getFullYear()) {
  const re = new RegExp(`^${prefix}-\\d{4}-(\\d+)$`);
  const max = (existingNumbers || []).reduce((m, n) => {
    const mm = String(n || "").trim().match(re);
    return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

export function isNumberTaken(list, field, value, excludeId, extraMatch) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  return (list || []).some((d) => d && d.id !== excludeId
    && String(d[field] || "").trim().toLowerCase() === v
    && (!extraMatch || extraMatch(d)));
}
