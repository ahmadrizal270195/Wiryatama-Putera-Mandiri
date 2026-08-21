import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./Login";
import App from "./App";

export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined = sedang dicek, null = belum login, object = sudah login

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  if (user === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5C7873",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        Memuat...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <App userEmail={user.email} onLogout={() => signOut(auth)} />;
}
