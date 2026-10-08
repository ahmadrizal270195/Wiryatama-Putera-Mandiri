import React, { useEffect, useMemo, useState } from "react";
import { History, RefreshCw, Search, LogIn, LogOut, PlusCircle, Pencil, Trash2, Activity, Download } from "lucide-react";
import { Eyebrow, Card, Button, TextInput, Select } from "../components/UIComponents";
import { fetchActivityLogs, ACTIVITY_FETCH_LIMIT } from "../activityLog";
import { todayISO, toLocalDateStr } from "../dateUtils";



// Riwayat Aktivitas Sistem (meniru WHISys). Khusus super admin.
const ACTION_META = {
  login: { label: "Login", icon: LogIn, color: "#10B981" },
  logout: { label: "Logout", icon: LogOut, color: "#64748B" },
  create: { label: "Tambah", icon: PlusCircle, color: "#3B82F6" },
  update: { label: "Ubah", icon: Pencil, color: "#F59E0B" },
  delete: { label: "Hapus", icon: Trash2, color: "#EF4444" },
  lainnya: { label: "Lainnya", icon: Activity, color: "#A855F7" },
};
const metaOf = (a) => ACTION_META[a] || ACTION_META.lainnya;

function fmtTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function ActionBadge({ action }) {
  const m = metaOf(action);
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap"
      style={{ color: m.color, borderColor: m.color + "40", background: m.color + "14" }}
    >
      <Icon size={12} /> {m.label}
    </span>
  );
}

export default function ActivityLogView({ users = [], colorConfig: c }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [module, setModule] = useState("all");
  const [user, setUser] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setLogs(await fetchActivityLogs());
    } catch (e) {
      console.error(e);
      setError("Gagal memuat log aktivitas. Pastikan Firestore Rules untuk erp_activity_logs sudah dipublish dan akun ini super admin.");
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const userMap = useMemo(() => {
    const m = {};
    (users || []).forEach((u) => { if (u.email) m[u.email.toLowerCase()] = u; });
    return m;
  }, [users]);
  const nameOf = (l) => l.userName || userMap[l.userEmail]?.name || l.userEmail || "Tidak diketahui";
  const roleOf = (l) => l.userRole || userMap[l.userEmail]?.role || "";

  const moduleOptions = useMemo(() => Array.from(new Set(logs.map((l) => l.module).filter(Boolean))).sort(), [logs]);
  const userOptions = useMemo(() => Array.from(new Set(logs.map((l) => l.userEmail).filter(Boolean))).sort(), [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (module !== "all" && l.module !== module) return false;
      if (user !== "all" && l.userEmail !== user) return false;
      const day = toLocalDateStr(l.createdAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return `${nameOf(l)} ${l.userEmail} ${l.module} ${l.targetLabel} ${l.details}`.toLowerCase().includes(q);
    });
  }, [logs, search, action, module, user, from, to, userMap]);

  function exportCSV() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Waktu", "Pengguna", "Email", "Role", "Aksi", "Modul", "Target", "Keterangan"]];
    filtered.forEach((l) => rows.push([fmtTime(l.createdAt), nameOf(l), l.userEmail, roleOf(l), metaOf(l.action).label, l.module, l.targetLabel, l.details]));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `log-aktivitas-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const soft = { color: c?.inkSoft };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <Eyebrow>Audit</Eyebrow>
          <h2 className="text-xl font-semibold flex items-center gap-2" style={{ color: c?.ink }}>
            <History size={20} style={{ color: c?.primary }} /> Log Aktivitas Sistem
          </h2>
          <div className="text-xs mt-1" style={soft}>
            Catatan login/logout dan setiap tambah, ubah, hapus data oleh seluruh pengguna. Log tidak bisa diubah atau dihapus. Khusus super admin.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={exportCSV} disabled={!filtered.length} colorConfig={c}>
            <Download size={15} /> Export CSV
          </Button>
          <Button onClick={load} disabled={loading} colorConfig={c}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> {loading ? "Memuat..." : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="mb-4 !p-3" colorConfig={c}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="relative md:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={soft} />
            <TextInput placeholder="Cari nama, modul, nomor dokumen, keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" colorConfig={c} />
          </div>
          <Select value={action} onChange={(e) => setAction(e.target.value)} colorConfig={c}>
            <option value="all">Semua Aksi</option>
            {Object.entries(ACTION_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          <Select value={module} onChange={(e) => setModule(e.target.value)} colorConfig={c}>
            <option value="all">Semua Modul</option>
            {moduleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={user} onChange={(e) => setUser(e.target.value)} colorConfig={c}>
            <option value="all">Semua Pengguna</option>
            {userOptions.map((e) => <option key={e} value={e}>{userMap[e]?.name || e}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={soft}>
          <span>Periode:</span>
          <div className="w-40"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Dari tanggal" colorConfig={c} /></div>
          <span>s/d</span>
          <div className="w-40"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Sampai tanggal" colorConfig={c} /></div>
          {(from || to || search || action !== "all" || module !== "all" || user !== "all") && (
            <button type="button" className="ml-1 underline cursor-pointer" style={{ color: c?.primary }}
              onClick={() => { setFrom(""); setTo(""); setSearch(""); setAction("all"); setModule("all"); setUser("all"); }}>
              Reset filter
            </button>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg border text-xs" style={{ color: "#EF4444", borderColor: "#EF444440", background: "#EF444414" }}>{error}</div>
      )}

      {loading ? (
        <Card className="text-center text-sm py-10" colorConfig={c}><span style={soft}>Memuat log aktivitas...</span></Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center text-sm py-10" colorConfig={c}><span style={soft}>Belum ada log yang cocok dengan filter.</span></Card>
      ) : (
        <Card className="!p-0 overflow-hidden" colorConfig={c}>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: c?.cardSoft }}>
                  {["Waktu", "Pengguna", "Aksi", "Modul", "Target", "Keterangan"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-[11px]" style={{ color: c?.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${c?.border}` }}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={soft}>{fmtTime(l.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold" style={{ color: c?.ink }}>{nameOf(l)}</div>
                      <div className="text-[11px]" style={soft}>{roleOf(l) || l.userEmail}</div>
                    </td>
                    <td className="px-3 py-2.5"><ActionBadge action={l.action} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: c?.ink }}>{l.module || "-"}</td>
                    <td className="px-3 py-2.5 font-medium max-w-[220px] break-words" style={{ color: c?.ink }}>{l.targetLabel || "-"}</td>
                    <td className="px-3 py-2.5 max-w-md break-words" style={soft}>{l.details || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="md:hidden p-3 space-y-3">
            {filtered.map((l) => (
              <div key={l.id} className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: c?.border, background: c?.cardSoft }}>
                <div className="flex items-center justify-between gap-2">
                  <ActionBadge action={l.action} />
                  <span className="text-[11px] tabular-nums" style={soft}>{fmtTime(l.createdAt)}</span>
                </div>
                <div className="text-xs font-semibold" style={{ color: c?.ink }}>{nameOf(l)} <span className="font-normal" style={soft}>· {l.module}</span></div>
                {l.targetLabel && <div className="text-xs" style={{ color: c?.ink }}>{l.targetLabel}</div>}
                {l.details && <div className="text-[11px]" style={soft}>{l.details}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="text-[11px] text-center mt-3" style={soft}>
        Menampilkan {filtered.length} dari {logs.length} log terbaru (maks. {ACTIVITY_FETCH_LIMIT}).
      </div>
    </div>
  );
}
