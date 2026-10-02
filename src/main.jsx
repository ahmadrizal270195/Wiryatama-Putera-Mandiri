import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initStorage } from "./storage";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

function ConnectionError() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#1E293B", background: "#F1F5F9" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Tidak bisa terhubung ke server</div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>Cek koneksi internet, lalu coba lagi.</div>
        <button onClick={() => window.location.reload()} style={{ background: "#059669", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
          Muat ulang
        </button>
      </div>
    </div>
  );
}

// App.jsx sudah punya router + cek login sendiri (/, /login, /app).
// Mode penyimpanan (lama / format baru) dicek dulu sebelum aplikasi dirender.
initStorage()
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((e) => {
    console.error("Gagal membaca mode penyimpanan:", e);
    root.render(<ConnectionError />);
  });
