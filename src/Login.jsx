import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #E2E9E7",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("Email atau password salah.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F8F7",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: "16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: "32px",
          borderRadius: "16px",
          border: "1px solid #E2E9E7",
          width: "100%",
          maxWidth: "360px",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "18px", color: "#15302D", marginBottom: "4px" }}>
          Mini ERP — PT. Wiryatama Putera Mandiri
        </div>
        <div style={{ fontSize: "12px", color: "#5C7873", marginBottom: "20px" }}>Masuk sebagai admin</div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ ...inputStyle, marginTop: 10 }}
        />

        {error && <div style={{ color: "#B84438", fontSize: "12px", marginTop: "8px" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            background: "#0E4749",
            color: "#fff",
            border: "none",
            fontWeight: 500,
            fontSize: "14px",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
