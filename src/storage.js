import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// Semua data ERP disimpan sebagai satu dokumen per "key" di koleksi "erp_data".
// Setiap dokumen menyimpan satu array (produk, supplier, batch stok, dst) sebagai JSON string.

// Kalau simpan gagal, kirim event supaya App bisa kasih peringatan ke user
// (sebelumnya error cuma masuk console, jadi user kira data sudah tersimpan).
function reportSaveError(key, e) {
  console.error("Gagal menyimpan data:", key, e);
  try {
    window.dispatchEvent(new CustomEvent("erp-save-error", { detail: { key, message: e?.message || String(e) } }));
  } catch (_) { /* abaikan */ }
}

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
    return true;
  } catch (e) {
    reportSaveError(key, e);
    return false;
  }
}

export async function deleteKey(key) {
  try {
    await deleteDoc(doc(db, "erp_data", key));
  } catch (e) {
    console.error("Gagal menghapus data:", key, e);
  }
}

// Dengarkan perubahan satu dokumen secara realtime (pengganti polling tiap 5 detik).
// Firestore cuma menghitung read saat dokumen itu benar-benar berubah,
// jadi jauh lebih hemat kuota dibanding baca ulang 16 dokumen tiap 5 detik.
export function subscribeKey(key, onData, onError) {
  return onSnapshot(
    doc(db, "erp_data", key),
    (snap) => {
      try {
        onData(snap.exists() ? JSON.parse(snap.data().value) : []);
      } catch (e) {
        console.error("Data rusak:", key, e);
        if (onError) onError(e);
      }
    },
    (e) => {
      console.error("Gagal sinkron realtime:", key, e);
      if (onError) onError(e);
    }
  );
}
