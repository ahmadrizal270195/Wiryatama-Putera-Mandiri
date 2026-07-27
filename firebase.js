import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 1. Buka https://console.firebase.google.com -> buat project baru (gratis).
// 2. Di project itu, tambahkan sebuah "Web App" -> copy config yang muncul ke bawah ini.
// 3. Di menu kiri, buka "Firestore Database" -> "Create database" -> pilih mode
//    "Start in test mode" dulu (nanti bisa diperketat, lihat firestore.rules.txt).
const firebaseConfig = {
  apiKey: "AIzaSyAVCoDuMez75hwYvvmj2r_5HikjG0giVao",
  authDomain: "gen-lang-client-0289098330.firebaseapp.com",
  projectId: "gen-lang-client-0289098330",
  storageBucket: "gen-lang-client-0289098330.firebasestorage.app",
  messagingSenderId: "276745189986",
  appId: "1:276745189986:web:339db6466d40c4bac22f3b",
  measurementId: "G-QTSJXYM8TL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
