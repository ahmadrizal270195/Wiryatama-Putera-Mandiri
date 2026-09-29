import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// App.jsx sudah punya router + cek login sendiri (/, /login, /app).
// Sebelumnya dibungkus AuthGate juga, jadi landing page publik nggak pernah kelihatan
// dan login-nya dobel.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
