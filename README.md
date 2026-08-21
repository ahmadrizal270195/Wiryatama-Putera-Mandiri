# Mini ERP — Distributor Farmasi & Alkes

Versi standalone dari artifact Claude, supaya bisa dijalankan di domain sendiri
tanpa perlu buka Claude. Perbedaan utama: penyimpanan data sekarang pakai
**Firebase Firestore** (gratis untuk skala UMKM/tim kecil) alih-alih
`window.storage` bawaan Claude.

## 1. Siapkan Firebase (5-10 menit)

1. Buka https://console.firebase.google.com, klik **Add project**, ikuti wizard (boleh matikan Google Analytics).
2. Di dashboard project, klik ikon **</>** ("Add app" → Web) → beri nama bebas → **Register app**.
3. Firebase akan menampilkan blok `firebaseConfig = {...}`. Copy semua isinya.
4. Buka `src/firebase.js` di proyek ini, tempel/ganti nilai `apiKey`, `authDomain`, `projectId`, dst. dengan punya Anda.
5. Di menu kiri Firebase Console, buka **Firestore Database** → **Create database** → pilih **Start in test mode** → pilih lokasi server (mis. `asia-southeast2` untuk Indonesia) → **Enable**.
6. (Opsional tapi disarankan) Tab **Rules** di Firestore → tempel isi file `firestore.rules` dari proyek ini → **Publish**.

## 2. Jalankan di komputer Anda dulu (opsional, untuk tes)

```bash
npm install
npm run dev
```

Buka `http://localhost:5173` — coba tambah produk, buat PO/SO, pastikan datanya muncul juga
di tab Firestore Console (koleksi `erp_data`).

## 3. Deploy ke domain sendiri

Cara termudah: **Vercel** (gratis untuk trafik kecil-menengah).

1. Push folder ini ke sebuah repo GitHub (bisa private).
2. Buka https://vercel.com → **Add New Project** → pilih repo tadi.
3. Vercel otomatis mendeteksi ini project Vite — biarkan default (`npm run build`, output `dist`).
4. Klik **Deploy**. Setelah selesai, Anda dapat link `namaproject.vercel.app`.
5. Untuk pakai domain sendiri (mis. `erp.perusahaananda.com`): masuk ke **Project → Settings → Domains** di Vercel, tambahkan domain Anda, lalu ikuti instruksi menambahkan record DNS (CNAME/A) di penyedia domain Anda.

Alternatif lain: Netlify (caranya mirip), atau hosting sendiri (VPS + Nginx) jika sudah familiar.

## 4. Menambahkan Login Admin (disarankan sebelum dipakai serius)

Saat ini siapa pun yang punya link bisa membuka & mengubah data — cukup aman untuk
tim kecil dengan link yang tidak disebar, tapi kalau mau proper:

1. Di Firebase Console → **Authentication** → **Get started** → aktifkan provider **Email/Password**.
2. Tambahkan akun admin secara manual di tab **Users**.
3. Update `firestore.rules` sesuai komentar di file tersebut (`allow read, write: if request.auth != null;`).
4. Minta bantuan Claude lagi untuk menambahkan halaman login sederhana (form email+password) yang membungkus `<App />` — ini perubahan kecil, bisa dikerjakan kapan saja.

## Struktur data di Firestore

Satu koleksi `erp_data`, satu dokumen per jenis data (produk, supplier, batch stok,
PO, SO, pembayaran, biaya) — persis strukturnya dengan versi Claude artifact, jadi
kalau nanti mau pindah balik ke Claude tinggal ganti isi `src/storage.js`.

## Catatan biaya

Firestore gratis sampai kuota harian tertentu (cukup besar untuk tim <20 orang
input data harian). Vercel gratis untuk trafik wajar. Jadi total biaya bulanan
kemungkinan besar **Rp0** kecuali sudah butuh domain berbayar (~Rp150-250rb/tahun).
