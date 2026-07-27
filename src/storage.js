import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Semua data ERP disimpan sebagai satu dokumen per "key" di koleksi "erp_data".
// Setiap dokumen menyimpan satu array (produk, supplier, batch stok, dst) sebagai JSON string,
// persis seperti pola window.storage yang dipakai di versi Claude artifact — jadi App.jsx
// nyaris tidak berubah selain dua fungsi ini.

export async function loadKey(key) {
  try {
    const snap = await getDoc(doc(db, "erp_data", key));
    return snap.exists() ? JSON.parse(snap.data().value) : [];
  } catch (e) {
    console.error("Gagal memuat data:", key, e);
    return [];
  }
}

export async function saveKey(key, value) {
  try {
    await setDoc(doc(db, "erp_data", key), {
      value: JSON.stringify(value),
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.error("Gagal menyimpan data:", key, e);
  }
}
