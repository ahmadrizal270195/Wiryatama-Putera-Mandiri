import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  onAuthStateChanged
} from "firebase/auth";

// 1. Buka https://console.firebase.google.com -> buat project baru (gratis).
// 2. Di project itu, tambahkan sebuah "Web App" -> copy config yang muncul ke bawah ini.
// 3. Di menu kiri, buka "Firestore Database" -> "Create database" -> pilih mode
//    "Start in test mode" dulu (nanti bisa diperketat, lihat firestore.rules.txt).
const firebaseConfig = {
  apiKey: "AIzaSyCFcBcw0lCl5yGAvGwEM2ylhq4yt5AXZZM",
  authDomain: "mini-erp-system-c6448.firebaseapp.com",
  projectId: "mini-erp-system-c6448",
  storageBucket: "mini-erp-system-c6448.firebasestorage.app",
  messagingSenderId: "44938060261",
  appId: "1:44938060261:web:f79b6831f795d0f0420f0c",
  measurementId: "G-F9T5NY6KDC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Export fungsi autentikasi agar dapat langsung diimpor di App.jsx
export {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged // <--- TAMBAHKAN BARIS INI DI SINI!
};