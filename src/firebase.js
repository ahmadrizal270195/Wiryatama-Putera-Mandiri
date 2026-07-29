// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCFcBcw0lCl5yGAvGwEM2ylhq4yt5AXZZM",
  authDomain: "mini-erp-system-c6448.firebaseapp.com",
  projectId: "mini-erp-system-c6448",
  storageBucket: "mini-erp-system-c6448.firebasestorage.app",
  messagingSenderId: "44938060261",
  appId: "1:44938060261:web:f79b6831f795d0f0420f0c",
  measurementId: "G-F9T5NY6KDC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
