// =====================================================================
//  UTILITAS TANGGAL & ZONA WAKTU LOKAL (INDONESIA / ASIA-JAKARTA)
//
//  Menyelesaikan bug pergeseran tanggal akibat penggunaan method UTC
//  (.toISOString().slice(0, 10)) yang menyebabkan tanggal mundur 1 hari
//  antara pukul 00:00 - 06:59 WIB.
// =====================================================================

/**
 * Mengubah Date atau timestamp menjadi string 'YYYY-MM-DD' sesuai tanggal lokal pengguna.
 */
export function toLocalDateStr(dateInput = new Date()) {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Mendapatkan tanggal hari ini dalam format 'YYYY-MM-DD' (zona waktu lokal).
 */
export function todayISO() {
  return toLocalDateStr(new Date());
}

/**
 * Mendapatkan tanggal pertama di bulan berjalan ('YYYY-MM-01').
 */
export function startOfMonthISO(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Mendapatkan tanggal pertama di bulan lalu ('YYYY-MM-01').
 */
export function startOfLastMonthISO(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return toLocalDateStr(prevMonth);
}

/**
 * Mendapatkan tanggal terakhir di bulan lalu ('YYYY-MM-DD').
 */
export function endOfLastMonthISO(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  // Hari ke-0 dari bulan berjalan adalah hari terakhir dari bulan sebelumnya
  const lastDayOfPrev = new Date(d.getFullYear(), d.getMonth(), 0);
  return toLocalDateStr(lastDayOfPrev);
}

/**
 * Memeriksa apakah string tanggal 'YYYY-MM-DD' berada di bulan berjalan
 * tanpa konversi UTC yang rentan pergeseran jam.
 */
export function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const targetYearMonth = String(dateStr).slice(0, 7);
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return targetYearMonth === currentYearMonth;
}

/**
 * Format tanggal dari 'YYYY-MM-DD' ke 'DD/MM/YYYY' (tampilan Indonesia).
 */
export function fmtDate(d) {
  if (!d) return "-";
  const [year, month, day] = String(d).slice(0, 10).split("-");
  if (year && month && day) return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  return d;
}

/**
 * Menghitung selisih hari dari hari ini ke tanggal tujuan.
 */
export function daysUntil(d) {
  if (!d) return 0;
  const target = new Date(d);
  const today = new Date(todayISO());
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}
