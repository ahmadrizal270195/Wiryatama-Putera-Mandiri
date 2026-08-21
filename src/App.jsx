import { useState, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { loadKey, saveKey } from "./storage";
import {
  LayoutDashboard, Package, Truck, Users, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Trash2, Search, Boxes, ArrowUpRight, ArrowDownRight,
  Loader2, Calendar, Printer, Wallet, Receipt, CreditCard, PiggyBank, BarChart3,
  FileText, LogOut, Phone, Mail, MapPin, ShieldCheck, ArrowRight, Lock, MessageSquare, ShieldAlert, Download, Upload
} from "lucide-react";
import { 
  auth, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  onAuthStateChanged // <--- PASTIKAN INI SUDAH ADA
} from "./firebase";
import SuppliersView from "./modules/SuppliersModule";
import CustomersView from "./modules/CustomersModule";
import ProductsView from "./modules/ProductsModule";
import StockView from "./modules/StockModule";
import PurchasesView from "./modules/PurchasesModule";
import SalesView from "./modules/SalesModule";

const THEME = {
  light: {
    bg: "#F5F8F7",
    surface: "#FFFFFF",     // Kotak dashboard berwarna putih di mode terang
    card: "#FFFFFF",
    cardSoft: "#F1F5F9",
    border: "#E2E9E7",
    ink: "#15302D",          // Teks gelap
    inkSoft: "#5C7873",
    primary: "#0E4749",
    primarySoft: "#E8F0EF",
    sidebarBg: "#0E4749",    // Sidebar hijau teal di mode terang
    accent: "#1B6B6E",
    danger: "#B84438",
    dangerSoft: "#FBEAE8",
    warn: "#C97F1E",
    warnSoft: "#FBF1E1",
    good: "#357A5D",
    goodSoft: "#E9F3ED",
  },
  dark: {
    bg: "#080D1A",          // Background paling luar
    surface: "#0F172A",     // KUNCI: Kotak dashboard menjadi abu-abu gelap WHISys
    card: "#0F172A",
    cardSoft: "#1E293B",    // Container sekunder
    border: "#1E293B",      // Border gelap halus
    ink: "#F8FAFC",          // Teks angka & judul jadi putih terang jelas
    inkSoft: "#94A3B8",      // Teks sekunder abu-abu
    primary: "#00C48C",      // Emerald green
    primarySoft: "rgba(0, 196, 140, 0.15)",
    sidebarBg: "#0B101D",    // Sidebar dark slate
    accent: "#10B981",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.15)",
    warn: "#F59E0B",
    warnSoft: "rgba(245, 158, 11, 0.15)",
    good: "#10B981",
    goodSoft: "rgba(16, 185, 129, 0.15)",
  }
};

// Fungsi pembantu skema warna dinamis
const getCOLOR = (isDark = false) => {
  return isDark ? THEME.dark : THEME.light;
};

// Fallback default untuk komponen luar (Light Mode)
const COLOR = getCOLOR(false);

// ---------- CONSTANTS & COMPANY PROFILE CONFIG ----------
const CATEGORIES = ["Dental Material", "Alat Kesehatan", "Obat Generik", "Obat Paten", "Consumables"];
const CUSTOMER_TYPES = ["Apotek", "Rumah Sakit", "Klinik", "Individu/Dokter Pribadi", "Distributor Lain"];
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; 
const ACTIVE_TAB_KEY = "erp-last-active-tab"; 

const ADMIN_FINANCE_EMAILS = [
  "ahmadrizal270195@gmail.com",
  "wawakhayrani@gmail.com",
  "admin@wiryatamaputera.co.id"
];

const COMPANY_PROFILE = {
  name: "PT WIRYATAMA PUTERA MANDIRI",
  tagline: "Distributor Penyalur Farmasi & Alat Kesehatan (Alkes) Terpercaya",
  address: "Ruko New Aruna Residence, Jl. Serua Raya No.9, Bojongsari, Depok, Jawa Barat 16517",
  contact: "Email: wiryatamadentalsupply@yahoo.co.id | Telp: (021) 7437964 / WA: 0815-1003-7199",
  whatsapp: "62817773791",
  npwp: "95.146.576.4-448.000",
  logoUrl: "https://i.imgur.com/EfI1R4p.jpeg",
  // LINK GAMBAR TTD & STEMPEL DIBUAT TRANSPARAN (PNG)
  stampUrl: "https://i.imgur.com/GhQ8U3T.jpeg", // Ganti dengan link Imgur/Drive gambar ttd + stempel PT WPM
  pjtName: "KOMALA SARI", // Nama PJT / Apoteker Penanggung Jawab 
  bankDetails: {
    bankName: "Bank Rakyat Indonesia (BRI)",
    accountNumber: "1173-01-000267-305",
    accountName: "PT WIRYATAMA PUTERA MANDIRI",
  },
  paymentNotes: "Pembayaran dianggap sah apabila uang telah masuk ke rekening atas nama PT Wiryatama Putera Mandiri."
};


const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtIDR = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

const fmtDate = (d) => {
  if (!d) return "-";
  const [year, month, day] = String(d).slice(0, 10).split("-");
  if (year && month && day) return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  return d;
};

const daysUntil = (d) => Math.ceil((new Date(d) - new Date(todayISO())) / (1000 * 60 * 60 * 24));

const KEYS = {
  products: "erp-products",
  suppliers: "erp-suppliers",
  customers: "erp-customers",
  batches: "erp-stock-batches",
  pos: "erp-purchase-orders",
  pReceipts: "erp-purchase-receipts",
  pInvoices: "erp-purchase-invoices",
  pReturns: "erp-purchase-returns",
  sos: "erp-sales-orders",
  paymentsOut: "erp-payments-out",
  paymentsIn: "erp-payments-in",
  expenses: "erp-expenses",
  deliveryNotes: "erp-delivery-notes",
  invoices: "erp-invoices",
  returns: "erp-returns",
  users: "erp-users",
};

const EXPENSE_CATEGORIES = [
  "Sewa Gudang (Bulanan)",
  "Sewa Dibayar di Muka (Prepaid 1 Tahun)",
  "Transportasi & Logistik",
  "Gaji Karyawan",
  "Utilitas",
  "Perizinan & Legalitas",
  "Lainnya"
];
const PAYMENT_METHODS = ["Transfer Bank", "Tunai", "Giro/Cek", "Lainnya"];

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function calcTax(rawSubtotal, taxType, discountPercentHeader = 0) {
  const discHeaderAmount = rawSubtotal * (Number(discountPercentHeader || 0) / 100);
  const dppAfterDiscount = Math.max(0, rawSubtotal - discHeaderAmount);
  
  if (taxType === "ppn11") {
    const ppn = dppAfterDiscount * 0.11;
    return { dpp: dppAfterDiscount, ppn, total: dppAfterDiscount + ppn, discHeaderAmount };
  }
  if (taxType === "include11") {
    const dpp = dppAfterDiscount / 1.11;
    const ppn = dppAfterDiscount - dpp;
    return { dpp, ppn, total: dppAfterDiscount, discHeaderAmount };
  }
  return { dpp: dppAfterDiscount, ppn: 0, total: dppAfterDiscount, discHeaderAmount };
}

// ---------- MAIN APP ROUTER ----------
export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: COLOR.inkSoft, background: COLOR.bg }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Memeriksa status...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLandingPage isLoggedIn={!!user} />} />
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginScreen />} />
        <Route
          path="/app/*"
          element={
            user ? <PharmaERP userEmail={user.email} onLogout={() => { localStorage.removeItem(ACTIVE_TAB_KEY); signOut(auth); }} /> : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// ---------- 1. LANDING PAGE PUBLIK ----------
function PublicLandingPage({ isLoggedIn }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const p = await loadKey(KEYS.products);
      setProducts(p || []);
    })();
  }, []);

  const filtered = (products || []).filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen font-sans" style={{ background: COLOR.bg, color: COLOR.ink }}>
      <nav className="bg-white border-b sticky top-0 z-40" style={{ borderColor: COLOR.border }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={COMPANY_PROFILE.logoUrl} alt="Logo WPM" className="h-10 object-contain rounded" />
            <div>
              <div className="font-bold text-sm" style={{ color: COLOR.primary }}>PT WIRYATAMA PUTERA MANDIRI</div>
              <div className="text-[10px]" style={{ color: COLOR.inkSoft }}>Distributor Farmasi & Alkes</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="#katalog" className="text-xs font-medium hover:opacity-75 hidden sm:block">Katalog Produk</a>
            <a href="#layanan" className="text-xs font-medium hover:opacity-75 hidden sm:block">Keunggulan Kami</a>
            <a href="#kontak" className="text-xs font-medium hover:opacity-75 hidden sm:block">Kontak</a>
            <button
              onClick={() => navigate(isLoggedIn ? "/app" : "/login")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity"
              style={{ background: COLOR.primary }}
            >
              <Lock size={12} /> {isLoggedIn ? "Masuk Portal ERP" : "Login Staff"}
            </button>
          </div>
        </div>
      </nav>

      <header className="py-16 px-4 text-center bg-white border-b" style={{ borderColor: COLOR.border }}>
        <div className="max-w-3xl mx-auto">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-medium mb-3" style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
            PEDAGANG BESAR FARMASI & ALKES
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight" style={{ color: COLOR.primary }}>
            Mitra Distribusi Obat & Alat Kesehatan Terpercaya
          </h1>
          <p className="text-sm sm:text-base mb-8 max-w-2xl mx-auto" style={{ color: COLOR.inkSoft }}>
            Menyuplai kebutuhan Rumah Sakit, Klinik, Apotek, dan Dokter dengan jaminan kualitas standar CDOB (Cara Distribusi Obat yang Baik) serta manajemen sistem stok mutakhir.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href={`https://wa.me/${COMPANY_PROFILE.whatsapp}?text=Halo%20PT%20Wiryatama%20Putera%20Mandiri,%20saya%20ingin%20mengajukan%20pemesanan%20produk.`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white shadow-md hover:opacity-90"
              style={{ background: COLOR.good }}
            >
              <MessageSquare size={16} /> Hubungi Sales via WhatsApp
            </a>
            <a href="#katalog" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border hover:bg-gray-50" style={{ borderColor: COLOR.border }}>
              Lihat Katalog Produk <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </header>

      <section id="layanan" className="py-12 max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <Card className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg shrink-0" style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="font-semibold text-sm mb-1">Standar Kualitas CDOB</div>
              <div className="text-xs" style={{ color: COLOR.inkSoft }}>Seluruh produk farmasi & alkes tersimpan pada kondisi suhu yang terpelihara presisi.</div>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg shrink-0" style={{ background: COLOR.goodSoft, color: COLOR.good }}>
              <Boxes size={20} />
            </div>
            <div>
              <div className="font-semibold text-sm mb-1">Traceability Batch FEFO</div>
              <div className="text-xs" style={{ color: COLOR.inkSoft }}>Jaminan penanganan First-Expire-First-Out untuk memastikan tanggal kedaluwarsa selalu aman.</div>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg shrink-0" style={{ background: COLOR.warnSoft, color: COLOR.warn }}>
              <Truck size={20} />
            </div>
            <div>
              <div className="font-semibold text-sm mb-1">Pengiriman Cepat & Tepat</div>
              <div className="text-xs" style={{ color: COLOR.inkSoft }}>Armada pengiriman siap melayani pengantaran pesanan fasilitas kesehatan harian.</div>
            </div>
          </Card>
        </div>

        <div id="katalog" className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
            <div>
              <Eyebrow>Daftar Didistribusikan</Eyebrow>
              <h2 className="text-xl font-bold" style={{ color: COLOR.primary }}>Katalog Obat & Alat Kesehatan</h2>
            </div>
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-2.5" color={COLOR.inkSoft} />
              <TextInput placeholder="Cari obat / alkes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map(p => (
              <Card key={p.id} className="flex flex-col justify-between">
                <div>
                  <Badge tone="neutral">{p.category}</Badge>
                  <h3 className="font-semibold text-base mt-2" style={{ color: COLOR.ink }}>{p.name}</h3>
                  <div className="text-xs mt-1 font-mono" style={{ color: COLOR.inkSoft }}>Satuan Kemasan: {p.unit}</div>
                </div>
                <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: COLOR.border }}>
                  <div className="text-xs font-semibold" style={{ color: COLOR.good }}>Tersedia / Ready</div>
                  <a
                    href={`https://wa.me/${COMPANY_PROFILE.whatsapp}?text=Halo%20Admin,%20saya%20ingin%20menanyakan%20ketersediaan%20produk:%20${encodeURIComponent(p.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold hover:underline"
                    style={{ color: COLOR.primary }}
                  >
                    Pesan Produk &rarr;
                  </a>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-sm" style={{ color: COLOR.inkSoft }}>
                Belum ada produk yang cocok dengan pencarian Anda.
              </div>
            )}
          </div>
        </div>
      </section>

      <footer id="kontak" className="bg-white border-t mt-16 py-12" style={{ borderColor: COLOR.border }}>
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={COMPANY_PROFILE.logoUrl} alt="Logo WPM" className="h-8 object-contain rounded" />
              <div className="font-bold text-base" style={{ color: COLOR.primary }}>{COMPANY_PROFILE.name}</div>
            </div>
            <p className="text-xs leading-relaxed max-w-sm" style={{ color: COLOR.inkSoft }}>
              {COMPANY_PROFILE.tagline}. Melayani distribusi terpadu produk farmasi dan alat kesehatan resmi untuk mitra fasilitas kesehatan.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs" style={{ color: COLOR.inkSoft }}>
            <div className="font-bold text-sm mb-1 text-gray-900">Alamat Kantor & Gudang</div>
            <div className="flex items-center gap-2"><MapPin size={14} /> {COMPANY_PROFILE.address}</div>
            <div className="flex items-center gap-2"><Mail size={14} /> finance@wiryatamaputera.co.id</div>
            <div className="flex items-center gap-2"><Phone size={14} /> (021) 7437964 / WhatsApp: 0817-773-791</div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 mt-8 pt-4 border-t text-center text-[11px]" style={{ borderColor: COLOR.border, color: COLOR.inkSoft }}>
          &copy; 2026 PT Wiryatama Putera Mandiri. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

// ---------- 2. LOGIN SCREEN ----------
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/app");
    } catch (err) {
      setError("Email atau password salah.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: COLOR.bg }}>
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border w-full max-w-sm shadow-sm" style={{ borderColor: COLOR.border }}>
        <button type="button" onClick={() => navigate("/")} className="text-xs mb-4 hover:underline flex items-center gap-1" style={{ color: COLOR.inkSoft }}>
          &larr; Kembali ke Website Utama
        </button>
        <div className="font-bold text-base mb-0.5" style={{ color: COLOR.primary }}>PT Wiryatama Putera Mandiri</div>
        <div className="text-xs mb-5" style={{ color: COLOR.inkSoft }}>ERP System — Masuk Sebagai Admin/Staff</div>

        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>

        {error && <div className="text-xs mb-3" style={{ color: COLOR.danger }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-white font-medium text-sm mt-2 transition-opacity"
          style={{ background: COLOR.primary, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Memproses..." : "Masuk ke Sistem"}
        </button>
      </form>
    </div>
  );
}

// ---------- UI HELPER COMPONENTS ----------
function Eyebrow({ children }) {
  return <div style={{ color: COLOR.inkSoft, letterSpacing: "0.08em" }} className="text-[11px] font-mono uppercase mb-1">{children}</div>;
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={"rounded-xl p-4 " + className}
      style={{ 
        background: COLOR.surface, 
        border: `1px solid ${COLOR.border}`, 
        color: COLOR.ink, 
        ...style 
      }}
    >
      {children}
    </div>
  );
}

// Hapus ketersambungan hardcode #fff pada input
const inputStyle = {
  border: `1px solid ${COLOR.border}`,
  color: COLOR.ink,
};



function Badge({ tone = "good", children }) {
  const map = {
    good: [COLOR.goodSoft, COLOR.good],
    warn: [COLOR.warnSoft, COLOR.warn],
    danger: [COLOR.dangerSoft, COLOR.danger],
    neutral: [COLOR.primarySoft, COLOR.primary],
  };
  const [bg, fg] = map[tone];

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border"
      style={{ background: bg, color: fg, borderColor: COLOR.border }}
    >
      {children}
    </span>
  );
}

function Button({ children, onClick, variant = "primary", type = "button", className = "", disabled }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40";
  const styles =
    variant === "primary"
      ? { background: COLOR.primary, color: "#fff" }
      : variant === "danger"
      ? { background: COLOR.dangerSoft, color: COLOR.danger }
      : { background: "transparent", color: COLOR.ink, border: `1px solid ${COLOR.border}` };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={base + " " + className} style={styles}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs font-medium mb-1" style={{ color: COLOR.inkSoft }}>{label}</div>
      {children}
    </label>
  );
}


function DateInput(props) {
  const { value, onChange, className = "", required, disabled, style } = props;

  const formatDisplay = (iso) => {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    if (y && m && d) return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    return iso;
  };

  return (
    <div className="relative w-full flex items-center">
      <input
        type="text"
        readOnly
        value={formatDisplay(value)}
        placeholder="dd/mm/yyyy"
        className={"w-full rounded-lg pl-3 pr-9 py-1.5 text-sm outline-none " + className}
        style={{ ...inputStyle, ...style }}
      />
      <Calendar size={15} className="absolute right-3 pointer-events-none" style={{ color: COLOR.inkSoft }} />
      <input
        type="date"
        value={value || ""}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}

// ✅ KODE BARU:
function TextInput(props) {
  if (props.type === "date") {
    return <DateInput {...props} />;
  }

  // TANGANI LOGIKA INPUT ANGKA SECARA GLOBAL
  if (props.type === "number") {
    return (
      <input
        {...props}
        value={props.value === 0 || props.value === "0" ? 0 : props.value || ""}
        onChange={(e) => {
          const val = e.target.value;
          if (!props.onChange) return;

          // Jika dihapus kosong, kirim string kosong "" ke state agar input bisa kosong bersih
          if (val === "") {
            e.target.value = "";
            props.onChange(e);
          } else {
            props.onChange(e);
          }
        }}
        onWheel={(e) => {
          // Lepas fokus saat scroll mouse agar angka tidak bergeser
          e.target.blur();
          if (props.onWheel) props.onWheel(e);
        }}
        className={
          "w-full rounded-lg px-3 py-1.5 text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none " +
          (props.className || "")
        }
        style={{ ...inputStyle, background: COLOR.surface, color: COLOR.ink, ...props.style }}
      />
    );
  }

  return (
    <input 
      {...props} 
      className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} 
      style={{ ...inputStyle, background: COLOR.surface, color: COLOR.ink, ...props.style }} 
    />
  );
}

function Select(props) {
  return (
    <select 
      {...props} 
      className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} 
      style={{ ...inputStyle, background: COLOR.surface, color: COLOR.ink, ...props.style }}
    >
      {props.children}
    </select>
  );
}

function ResponsiveTable({ children, minWidth = 650 }) {
  return (
    <Card className="!p-0 overflow-hidden no-print">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
          {children}
        </table>
      </div>
    </Card>
  );
}

/* DITAMBAHKAN PROPS isSubModal & HIGH Z-INDEX */
function Modal({ title, onClose, children, wide, isSubModal = false }) {
  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center p-4 modal-backdrop ${isSubModal ? 'z-[70]' : 'z-50'}`} 
      style={{ background: "rgba(0,0,0,0.7)" }} 
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={"rounded-2xl w-full " + (wide ? "max-w-3xl" : "max-w-md") + " max-h-[85vh] overflow-y-auto modal-content shadow-2xl"}
        style={{ background: COLOR.surface, color: COLOR.ink, border: `1px solid ${COLOR.border}` }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10 no-print" style={{ background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
          <h3 className="font-semibold text-base" style={{ color: COLOR.ink }}>{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:opacity-60 cursor-pointer"><X size={18} color={COLOR.inkSoft} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function urgencyOf(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d < 0) return { tone: "danger", label: "Kedaluwarsa", color: COLOR.danger };
  if (d <= 30) return { tone: "danger", label: `${d}h lagi`, color: COLOR.danger };
  if (d <= 90) return { tone: "warn", label: `${d}h lagi`, color: COLOR.warn };
  return { tone: "good", label: `${d}h lagi`, color: COLOR.good };
}

function ExpiryRibbon({ productBatches }) {
  const total = (productBatches || []).reduce((s, b) => s + b.qty, 0);
  if (total === 0) return <div className="text-xs" style={{ color: COLOR.inkSoft }}>Tidak ada stok</div>;
  const sorted = [...productBatches].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return (
    <div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden" style={{ background: COLOR.border }}>
        {sorted.map((b) => (
          <div key={b.id} style={{ width: `${(b.qty / total) * 100}%`, background: urgencyOf(b.expiryDate).color }} title={`${b.batchNo}: ${b.qty} unit, exp ${fmtDate(b.expiryDate)}`} />
        ))}
      </div>
    </div>
  );
}

// ---------- 3. INTERNAL PHARMA ERP SYSTEM ----------
function PharmaERP({ userEmail, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  // ---------- NOMOR 2: STATE & FUNGSI SAKELAR TEMA ----------
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("erp-theme") === "dark";
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("erp-theme", next ? "dark" : "light");
      return next;
    });
  };

  // Timpa/Dapatkan warna aktif secara dinamis berdasarkan mode
  const COLOR = getCOLOR(isDarkMode);
  // ------------------------------------------------------------

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isFinanceOrAdmin = ADMIN_FINANCE_EMAILS.includes((userEmail || "").toLowerCase());

  const [tab, setTabState] = useState(() => {
    return localStorage.getItem(ACTIVE_TAB_KEY) || "dashboard";
  });

  const setTab = (newTab) => {
    setTabState(newTab);
    localStorage.setItem(ACTIVE_TAB_KEY, newTab);
    setMobileMenuOpen(false);
  };

  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [pos, setPOs] = useState([]);
  const [pReceipts, setPReceipts] = useState([]);
  const [pInvoices, setPInvoices] = useState([]);
  const [pReturns, setPReturns] = useState([]);
  const [sos, setSOs] = useState([]);
  const [paymentsOut, setPaymentsOut] = useState([]);
  const [paymentsIn, setPaymentsIn] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [returns, setReturns] = useState([]);
  const [toast, setToast] = useState(null);
  const [lastSync, setLastSync] = useState(Date.now());
  const [syncState, setSyncState] = useState("ok");
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);

  const idleTimerRef = useRef(null);

  useEffect(() => {
    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        localStorage.removeItem(ACTIVE_TAB_KEY);
        onLogout();
        alert("Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas selama 60 menit demi keamanan.");
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, resetIdleTimer));
    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [onLogout]);

  async function refreshAll() {
  setSyncState("syncing");
  try {
    const [p, s, c, b, po, pr, pi, pret, so, pout, pin, exp, dn, inv, ret, usr] = await Promise.all([
      loadKey(KEYS.products), loadKey(KEYS.suppliers), loadKey(KEYS.customers),
      loadKey(KEYS.batches), loadKey(KEYS.pos), loadKey(KEYS.pReceipts), loadKey(KEYS.pInvoices), loadKey(KEYS.pReturns), loadKey(KEYS.sos),
      loadKey(KEYS.paymentsOut), loadKey(KEYS.paymentsIn), loadKey(KEYS.expenses),
      loadKey(KEYS.deliveryNotes), loadKey(KEYS.invoices), loadKey(KEYS.returns),
      loadKey(KEYS.users)
    ]);

    const swap = (setter) => (next) => setter((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
    swap(setProducts)(p || []); swap(setSuppliers)(s || []); swap(setCustomers)(c || []); swap(setBatches)(b || []);
    swap(setPOs)(po || []); swap(setPReceipts)(pr || []); swap(setPInvoices)(pi || []); swap(setPReturns)(pret || []); swap(setSOs)(so || []); 
    swap(setPaymentsOut)(pout || []); swap(setPaymentsIn)(pin || []); swap(setExpenses)(exp || []);
    swap(setDeliveryNotes)(dn || []); swap(setInvoices)(inv || []); swap(setReturns)(ret || []);
    
    // --- PERBAIKAN LOGIKA USER DI SINI ---
    if (usr && Array.isArray(usr)) {
      // Jika data users sudah pernah disimpan di storage, pakai data dari storage
      swap(setUsers)(usr);
    } else {
      // Hanya jika BELUM PERNAH ada data (pertama kali aplikasi jalan)
      const defaultUsers = [
        { id: "1", email: "ahmadrizal270195@gmail.com", name: "Ahmad Rizal (Super Admin)", role: "admin", access: ["dashboard", "products", "stock", "suppliers", "customers", "purchases", "sales", "finance", "reports", "settings"] },
        { id: "2", email: "direktur@wiryatamaputera.co.id", name: "Direktur Utama", role: "admin", access: ["dashboard", "products", "stock", "suppliers", "customers", "purchases", "sales", "finance", "reports", "settings"] },
        { id: "3", email: "admin@wiryatamaputera.co.id", name: "Admin Finance", role: "finance", access: ["dashboard", "products", "customers", "sales", "finance", "reports"] }
      ];
      swap(setUsers)(defaultUsers);
      saveKey(KEYS.users, defaultUsers); // Langsung simpan default ke storage agar panggilan berikutnya terbaca
    }

    setLastSync(Date.now());
    setSyncState("ok");
  } catch (e) {
    console.error("refresh failed", e);
    setSyncState("error");
  }
}

  useEffect(() => {
    (async () => {
      await refreshAll();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshAll, 5000);
    return () => clearInterval(interval);
  }, []);

  function notify(msg, tone = "good") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  }

  const persist = {
    products: async (list) => { setProducts(list); await saveKey(KEYS.products, list); },
    suppliers: async (list) => { setSuppliers(list); await saveKey(KEYS.suppliers, list); },
    customers: async (list) => { setCustomers(list); await saveKey(KEYS.customers, list); },
    batches: async (list) => { setBatches(list); await saveKey(KEYS.batches, list); },
    pos: async (list) => { setPOs(list); await saveKey(KEYS.pos, list); },
    pReceipts: async (list) => { setPReceipts(list); await saveKey(KEYS.pReceipts, list); },
    pInvoices: async (list) => { setPInvoices(list); await saveKey(KEYS.pInvoices, list); },
    pReturns: async (list) => { setPReturns(list); await saveKey(KEYS.pReturns, list); },
    sos: async (list) => { setSOs(list); await saveKey(KEYS.sos, list); },
    paymentsOut: async (list) => { setPaymentsOut(list); await saveKey(KEYS.paymentsOut, list); },
    paymentsIn: async (list) => { setPaymentsIn(list); await saveKey(KEYS.paymentsIn, list); },
    expenses: async (list) => { setExpenses(list); await saveKey(KEYS.expenses, list); },
    deliveryNotes: async (list) => { setDeliveryNotes(list); await saveKey(KEYS.deliveryNotes, list); },
    invoices: async (list) => { setInvoices(list); await saveKey(KEYS.invoices, list); },
    returns: async (list) => { setReturns(list); await saveKey(KEYS.returns, list); },
    users: async (list) => { setUsers(list); await saveKey(KEYS.users, list); },
  };

  const stockByProduct = useMemo(() => {
    const map = {};
    for (const p of (products || [])) map[p.id] = { product: p, qty: 0, value: 0, batches: [] };
    for (const b of (batches || [])) {
      if (!map[b.productId]) continue;
      map[b.productId].qty += b.qty;
      map[b.productId].value += b.qty * b.costPrice;
      map[b.productId].batches.push(b);
    }
    return map;
  }, [products, batches]);

  const lowStock = useMemo(() => Object.values(stockByProduct).filter((s) => s.qty < (s.product.minStock || 0)), [stockByProduct]);
  
  const nearExpiry = useMemo(() => (batches || []).filter((b) => Number(b.qty) > 0 && (products || []).some(p => p.id === b.productId) && daysUntil(b.expiryDate) >= 0 && daysUntil(b.expiryDate) <= 90), [batches, products]);
  const expired = useMemo(() => (batches || []).filter((b) => Number(b.qty) > 0 && (products || []).some(p => p.id === b.productId) && daysUntil(b.expiryDate) < 0), [batches, products]);
  
  const totalStockValue = useMemo(() => Object.values(stockByProduct).reduce((s, x) => s + x.value, 0), [stockByProduct]);

  function findName(list, id) {
    const item = (list || []).find((x) => x.id === id);
    return item ? item.name : "-";
  }

  function invoiceRawTotal(inv) {
  return (inv?.items || []).reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmount = gross * (Number(it.discountPercent || 0) / 100);
    return s + Math.max(0, gross - discAmount);
  }, 0);
}

function invoiceTotal(inv) {
  const rawSub = invoiceRawTotal(inv);
  return calcTax(rawSub, inv?.taxType || "none", inv?.discountPercent || inv?.discount || 0).total;
}

  function pInvoiceRawTotal(inv) { 
    return (inv?.items || []).reduce((s, it) => {
      const gross = it.qty * it.unitPrice;
      const discAmount = gross * (Number(it.discountPercent || 0) / 100);
      return s + Math.max(0, gross - discAmount);
    }, 0); 
  }
  function pInvoiceTotal(inv) { 
    const rawSub = pInvoiceRawTotal(inv);
    return calcTax(rawSub, inv?.taxType || "none", inv?.discountPercent || inv?.discount || 0).total; 
  }

  function soTotal(so) {
  const rawSub = (so?.items || []).reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmount = gross * (Number(it.discountPercent || 0) / 100);
    return s + Math.max(0, gross - discAmount);
  }, 0);
  return calcTax(rawSub, so?.taxType || "none", so?.discountPercent || so?.discount || 0).total;
}
  function poTotal(po) {
    const rawSub = (po?.items || []).reduce((s, it) => {
      const gross = it.qty * it.unitPrice;
      const discAmount = gross * (Number(it.discountPercent || 0) / 100);
      return s + Math.max(0, gross - discAmount);
    }, 0);
    return calcTax(rawSub, po?.taxType || "none", po?.discountPercent || po?.discount || 0).total;
  }
  
  function pInvoicePaidAmount(invId) { return (paymentsOut || []).filter((p) => p.pInvoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function pInvoiceReturnedAmount(invId) { return (pReturns || []).filter((r) => r.pInvoiceId === invId).reduce((s, r) => s + (r.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  function pInvoiceSisa(inv) { return Math.max(0, pInvoiceTotal(inv) - pInvoiceReturnedAmount(inv.id) - pInvoicePaidAmount(inv.id)); }

  function soDPAmount(soId) { return (paymentsIn || []).filter((p) => p.soId === soId && p.type === "DP").reduce((s, p) => s + p.amount, 0); }
  function invoicePaidAmount(invId) { return (paymentsIn || []).filter((p) => p.invoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function invoiceReturnedAmount(invId) { return (returns || []).filter((r) => r.invoiceId === invId).reduce((s, r) => s + (r.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  function batchCost(batchId) { const b = (batches || []).find((x) => x.id === batchId); return b ? b.costPrice : 0; }
  
  function invoiceCOGS(inv) {
    let cogs = 0;
    if (inv.isDirect) {
      cogs = (inv.items || []).reduce((s, it) => s + (it.allocations || []).reduce((s2, a) => s2 + a.qty * batchCost(a.batchId), 0), 0);
    } else {
      cogs = (deliveryNotes || []).filter((dn) => dn.soId === inv.soId && dn.status === "diterima")
        .reduce((s, dn) => s + (dn.items || []).reduce((s2, it) => s2 + (it.allocations || []).reduce((s3, a) => s3 + a.qty * batchCost(a.batchId), 0), 0), 0);
    }

    const returList = (returns || []).filter((r) => r.invoiceId === inv.id || (inv.soId && r.soId === inv.soId));
    let returnedCOGS = 0;
    
    returList.forEach((r) => {
      (r.items || []).forEach((it) => {
        if (it.restockedBatches && it.restockedBatches.length > 0) {
          it.restockedBatches.forEach((rb) => {
            returnedCOGS += rb.qty * batchCost(rb.batchId);
          });
        } else {
          const avgCost = (batches || []).filter(b => b.productId === it.productId)[0]?.costPrice || 0;
          returnedCOGS += it.qty * avgCost;
        }
      });
    });

    return Math.max(0, cogs - returnedCOGS);
  }

  function invoiceSisa(inv) {
    return Math.max(0, invoiceTotal(inv) - invoiceReturnedAmount(inv.id) - soDPAmount(inv.soId) - invoicePaidAmount(inv.id));
  }

  const arOutstanding = useMemo(() => (invoices || []).reduce((s, inv) => s + invoiceSisa(inv), 0), [invoices, returns, paymentsIn]);
  const apOutstanding = useMemo(() => (pInvoices || []).reduce((s, inv) => s + pInvoiceSisa(inv), 0), [pInvoices, pReturns, paymentsOut]);
  const cashInMonth = useMemo(() => (paymentsIn || []).filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0), [paymentsIn]);
  const cashOutMonth = useMemo(() => {
    const out = (paymentsOut || []).filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0);
    const exp = (expenses || []).filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0);
    return out + exp;
  }, [paymentsOut, expenses]);
  
  const grossProfitMonth = useMemo(() => {
    return (invoices || []).filter((inv) => isThisMonth(inv.date)).reduce((s, inv) => {
      const dppSales = invoiceRawTotal(inv);             
      const returAmount = invoiceReturnedAmount(inv.id); 
      const netSales = dppSales - returAmount;            
      
      const netCOGS = invoiceCOGS(inv);                   
      
      return s + (netSales - netCOGS);                    
    }, 0);
  }, [invoices, batches, deliveryNotes, returns, products]);

  const expensesMonth = useMemo(() => {
  const now = new Date();
  
  return (expenses || []).reduce((total, e) => {
    // 1. Jika Biaya Sewa Dibayar di Muka (Prepaid Rent Tahunan)
    if (e.category === "Sewa Dibayar di Muka (Prepaid 1 Tahun)") {
      const expDate = new Date(e.date);
      // Dihitung selama 12 bulan sejak tanggal pembayaran
      const monthsDiff = (now.getFullYear() - expDate.getFullYear()) * 12 + (now.getMonth() - expDate.getMonth());
      
      if (monthsDiff >= 0 && monthsDiff < 12) {
        const monthlyAmortization = (Number(e.amount) || 0) / 12; // Beban bulanan (1/12)
        return total + monthlyAmortization;
      }
      return total;
    }

    // 2. Jika Biaya Operasional Biasa (Dihitung penuh di bulan berjalan)
    if (isThisMonth(e.date)) {
      return total + (Number(e.amount) || 0);
    }

    return total;
  }, 0);
}, [expenses]);

  function allocateFEFO(productId, qty) {
    const avail = (batches || []).filter((b) => b.productId === productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    let remaining = qty;
    const allocations = [];
    for (const b of avail) {
      if (remaining <= 0) break;
      const take = Math.min(b.qty, remaining);
      allocations.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take });
      remaining -= take;
    }
    return { allocations, shortfall: remaining };
  }

  const ALL_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, requiresFinance: false },
  { id: "products", label: "Produk", icon: Package, requiresFinance: false },
  { id: "stock", label: "Stok & Batch", icon: Boxes, requiresFinance: false },
  { id: "suppliers", label: "Supplier", icon: Truck, requiresFinance: false },
  { id: "customers", label: "Pelanggan", icon: Users, requiresFinance: false },
  { id: "purchases", label: "Pembelian", icon: ClipboardList, requiresFinance: false },
  { id: "sales", label: "Penjualan", icon: ShoppingCart, requiresFinance: false },
  { id: "finance", label: "Finance", icon: Wallet, requiresFinance: true },
  { id: "reports", label: "Laporan", icon: BarChart3, requiresFinance: false },
  { id: "settings", label: "Pengaturan", icon: ShieldCheck, requiresFinance: true },
];

// Cari akun user yang sedang login saat ini berdasarkan email:
const currentUser = (users || []).find((u) => (u.email || "").toLowerCase() === (userEmail || "").toLowerCase());

// Ambil daftar aksesnya (jika tidak ditemukan/admin, berikan akses penuh):
const currentUserAccess = currentUser ? currentUser.access : ["dashboard", "products", "stock", "suppliers", "customers", "purchases", "sales", "finance", "reports", "settings"];

// Filter navigasi sidebar agar menampilkan hanya modul yang diizinkan:
const NAV = ALL_NAV.filter((n) => currentUserAccess.includes(n.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 gap-2" style={{ color: COLOR.inkSoft }}>
        <Loader2 className="animate-spin" size={18} /> Memuat data ERP...
      </div>
    );
  }

  return (
    <div style={{ background: COLOR.bg, color: COLOR.ink, minHeight: "100vh", fontFamily: "ui-sans-serif, system-ui, sans-serif" }} className="flex flex-col md:flex-row min-h-screen relative transition-colors duration-300">

      <style>{`

  /* HILANGKAN PANAH SPINNER PADA INPUT NUMBER (CHROME, SAFARI, EDGE, OPERA) */
  input[type=number]::-webkit-inner-spin-button, 
  input[type=number]::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }

  /* HILANGKAN PANAH SPINNER PADA INPUT NUMBER (FIREFOX) */
  input[type=number] {
    -moz-appearance: textfield;
  }

  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

  /* ============================================================ */
  /* STYLING CHIP BATCH STOK (MODE TERANG & GELAP TAJAM & KONTRAS)*/
  /* ============================================================ */
  
  /* 1. KONTRAST DI MODE TERANG */
  .batch-chip {
    background-color: #F1F5F9 !important;
    border-color: #CBD5E1 !important;
    color: #0F172A !important;
  }
  .batch-chip .batch-no {
    color: #0E4749 !important;
  }
  .batch-chip .batch-qty {
    color: #0F172A !important;
    font-weight: 700 !important;
  }
  .batch-chip .batch-exp {
    color: #475569 !important;
  }

  /* 2. KONTRAST DI MODE GELAP */
  ${isDarkMode ? `
    .batch-chip {
      background-color: #1E293B !important;
      border-color: #334155 !important;
      color: #F8FAFC !important;
    }
    .batch-chip .batch-no {
      color: #34D399 !important;
    }
    .batch-chip .batch-qty {
      color: #F8FAFC !important;
      font-weight: 700 !important;
    }
    .batch-chip .batch-exp {
      color: #94A3B8 !important;
    }

    /* General Dark Mode Fixes */
    .bg-white, .bg-gray-50, .bg-gray-100, .bg-teal-50, .bg-amber-50, 
    div[style*="background: rgb(255, 255, 255)"], 
    div[style*="background-color: rgb(255, 255, 255)"],
    div[style*="background: #FFFFFF"], 
    div[style*="background: #ffffff"],
    div[style*="background-color: #FFFFFF"],
    div[style*="background-color: #ffffff"] {
      background-color: #0F172A !important;
      color: #F8FAFC !important;
      border-color: #1E293B !important;
    }

    table thead tr,
    tr[style*="background: rgb(232, 240, 239)"],
    tr[style*="background: #E8F0EF"] {
      background-color: #1E293B !important;
    }
    table thead th,
    table thead th * {
      color: #34D399 !important;
      font-weight: 700 !important;
    }

    h1, h2, h3, h4, h5, h6,
    p, a, td,
    div[style*="color: rgb(21, 48, 45)"],
    div[style*="color: #15302D"],
    span[style*="color: rgb(21, 48, 45)"],
    span[style*="color: #15302D"] {
      color: #F8FAFC !important;
    }

    .text-gray-500, .text-gray-400,
    div[style*="color: rgb(92, 120, 115)"],
    div[style*="color: #5C7873"] {
      color: #94A3B8 !important;
    }

    span.rounded-full, 
    span[class*="rounded-full"] {
      background-color: #1E293B !important;
      color: #34D399 !important;
      border: 1px solid #34D399 !important;
      font-weight: 700 !important;
    }

    table tbody tr, div[style*="border-bottom"] {
      border-color: #1E293B !important;
    }

    /* FIX INPUT FIELD MODE GELAP */
    input, select, textarea {
      background-color: #0F172A !important;
      color: #F8FAFC !important;
      border-color: #334155 !important;
    }

    input::placeholder, textarea::placeholder {
      color: #64748B !important;
    }

    select option {
      background-color: #0F172A !important;
      color: #F8FAFC !important;
    }
  ` : `
    /* FIX INPUT FIELD MODE TERANG */
    input, select, textarea {
      background-color: #FFFFFF !important;
      color: #15302D !important;
      border-color: #E2E9E7 !important;
    }

    select option {
      background-color: #FFFFFF !important;
      color: #15302D !important;
    }

    table tbody tr:hover {
      background-color: rgba(0, 0, 0, 0.02) !important;
    }
  `}

  /* PRINT STYLING */
  @media print {
    body { visibility: hidden !important; }
    .no-print, .no-print * { display: none !important; }
    .printable-area, .printable-area *,
    #printable-invoice, #printable-invoice *,
    #printable-sj, #printable-sj *,
    #printable-tt, #printable-tt *,
    #printable-so, #printable-so *,
    #printable-po, #printable-po * {
      visibility: visible !important;
    }
    .printable-area,
    #printable-invoice, #printable-sj, #printable-tt, #printable-so, #printable-po { 
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 20px !important;
      border: none !important; 
      font-family: 'Inter', Arial, Helvetica, sans-serif !important; 
      display: block !important; 
      background: #ffffff !important;
      box-shadow: none !important;
      color: #000000 !important;
    }
    .modal-backdrop, .modal-content {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }
  }
`}</style>

      {/* HEADER HP / MOBILE NAV BAR */}
      {isMobile && (
        <div className="flex items-center justify-between p-3.5 text-white sticky top-0 z-30 shadow-md no-print" style={{ background: COLOR.primary }}>
          <div className="flex items-center gap-2">
            <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-7 object-contain rounded" />
            <div className="font-bold text-xs">PT WPM ERP</div>
          </div>
          <div className="flex items-center gap-2">
            {/* ---------- TOMBOL TEMA DI HP ---------- */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-teal-700 bg-teal-800 text-white text-xs cursor-pointer"
              title="Ganti Mode"
            >
              {isDarkMode ? "🌙" : "☀️"}
            </button>
            {/* -------------------------------------- */}

            <button 
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
              className="px-2.5 py-1.5 rounded-lg border border-teal-700 bg-teal-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              {mobileMenuOpen ? <X size={18} /> : <span className="font-mono text-xs">Menu ☰</span>}
            </button>
          </div>
        </div>
      )}

      {/* SIDEBAR RESPONSIVE */}
      <div 
        className={`w-56 shrink-0 flex flex-col py-5 px-3 no-print z-40 ${
          isMobile 
            ? (mobileMenuOpen ? "fixed inset-y-0 left-0 shadow-2xl" : "hidden") 
            : "flex"
        }`} 
        style={{ background: COLOR.sidebarBg }}
      >
        <div className="px-2 mb-6">
          <button onClick={() => navigate("/")} className="text-[10px] text-teal-200 hover:underline mb-1 block">
            &larr; Lihat Web Publik
          </button>
          <div className="text-white font-semibold text-sm leading-tight">PT Wiryatama Putera Mandiri</div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#8FC2C0" }}>ERP SYSTEM</div>
          {/* ---------- SISIPKAN TOMBOL TEMA DI SINI ---------- */}
          <button
            onClick={toggleTheme}
            type="button"
            className="mt-3 flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer"
            style={{
              background: isDarkMode ? "#131B2E" : "rgba(255,255,255,0.15)",
              color: "#FFFFFF",
              borderColor: isDarkMode ? "#2A354B" : "rgba(255,255,255,0.2)"
            }}
          >
            <span>{isDarkMode ? "🌙 Mode Gelap" : "☀️ Mode Terang"}</span>
            <span className="text-[10px] opacity-75 font-mono">Ubah</span>
          </button>
          {/* ------------------------------------------------- */}
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono" style={{ color: syncState === "error" ? "#F0A69B" : "#8FC2C0" }}>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: syncState === "error" ? "#E07A6C" : syncState === "syncing" ? "#F5C089" : "#7FCBA4" }}
            />
            {syncState === "syncing" ? "Menyinkron..." : syncState === "error" ? "Gagal sync" : `Tersinkron ${new Date(lastSync).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer"
                style={{ 
  background: active ? (isDarkMode ? "#00C48C" : "rgba(255,255,255,0.15)") : "transparent", 
  color: active ? (isDarkMode ? "#0B101D" : "#ffffff") : "#94A3B8",
  fontWeight: active ? "bold" : "normal"
}}
              >
                <Icon size={16} /> {n.label}
              </button>
            );
          })}
        </div>
        <div className="mt-auto px-2 pt-4">
          {(lowStock.length > 0 || nearExpiry.length > 0 || expired.length > 0) && (
            <div className="rounded-lg p-2.5 mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase mb-1" style={{ color: "#F5C089" }}>
                <AlertTriangle size={12} /> Perhatian
              </div>
              <div className="text-xs text-white leading-relaxed">
                {lowStock.length > 0 && <div>{lowStock.length} produk stok menipis</div>}
                {nearExpiry.length > 0 && <div>{nearExpiry.length} batch mendekati exp</div>}
                {expired.length > 0 && <div>{expired.length} batch kedaluwarsa</div>}
              </div>
            </div>
          )}
          {userEmail && (
            <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
              <div className="flex items-center justify-between px-1">
                <div className="text-[11px] font-mono truncate" style={{ color: "#8FC2C0" }} title={userEmail}>{userEmail}</div>
                <button onClick={onLogout} className="flex items-center gap-1 text-[11px] shrink-0 cursor-pointer" style={{ color: "#B7D6D4" }} title="Keluar">
                  <LogOut size={12} /> Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BACKDROP GELAP SAAT MENU HP TERBUKA */}
      {isMobile && mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)} 
          className="fixed inset-0 bg-black/50 z-30 no-print" 
        />
      )}

      {/* MAIN CONTENT CONTAINER */}
      <div className="flex-1 p-2 sm:p-6 overflow-y-auto max-h-[100vh] main-container w-full min-w-0">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          currentUserAccess.includes("dashboard") ? (
            <Dashboard {...{ products, batches, pos, sos, suppliers, customers, stockByProduct, lowStock, nearExpiry, expired, totalStockValue, findName, arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth, isFinanceOrAdmin }} />
          ) : <AccessDenied />
        )}
        {/* PRODUK */}
{tab === "products" && (
  currentUserAccess.includes("products") ? (
    <ProductsView 
      products={products} 
      save={persist.products} 
      stockByProduct={stockByProduct} 
      notify={notify} 
      colorConfig={COLOR} 
      uid={uid} 
      fmtIDR={fmtIDR} 
    />
  ) : <AccessDenied />
)}

{/* STOK & BATCH */}
{tab === "stock" && (
  currentUserAccess.includes("stock") ? (
    <StockView 
      products={products} 
      batches={batches} 
      saveBatches={persist.batches} 
      suppliers={suppliers} 
      stockByProduct={stockByProduct} 
      notify={notify} 
      findName={findName} 
      colorConfig={COLOR} 
      uid={uid} 
      todayISO={todayISO} 
      daysUntil={daysUntil} 
      urgencyOf={urgencyOf} 
      fmtDate={fmtDate} 
      fmtIDR={fmtIDR} 
      CATEGORIES={CATEGORIES} 
    />
  ) : <AccessDenied />
)}
        {/* SUPPLIER */}
{tab === "suppliers" && (
  currentUserAccess.includes("suppliers") ? (
    <SuppliersView 
      suppliers={suppliers} 
      pos={pos} 
      pInvoices={pInvoices} 
      save={persist.suppliers} 
      notify={notify} 
      colorConfig={COLOR} 
      uid={uid} 
    />
  ) : <AccessDenied />
)}

{/* CUSTOMERS */}
        {tab === "customers" && (
          currentUserAccess.includes("customers") ? (
            <CustomersView 
              customers={customers} 
              sos={sos} 
              invoices={invoices} 
              save={persist.customers} 
              notify={notify} 
              colorConfig={COLOR} 
              uid={uid} 
              todayISO={todayISO} 
            />
          ) : <AccessDenied />
        )}
       
        {/* PEMBELIAN */}
{tab === "purchases" && (
  currentUserAccess.includes("purchases") ? (
    <PurchasesView
      products={products} suppliers={suppliers} pos={pos} batches={batches}
      pReceipts={pReceipts} pInvoices={pInvoices} pReturns={pReturns} paymentsOut={paymentsOut}
      savePOs={persist.pos} saveBatches={persist.batches} savePReceipts={persist.pReceipts}
      savePInvoices={persist.pInvoices} savePReturns={persist.pReturns} saveSuppliers={persist.suppliers}
      findName={findName} notify={notify} poTotal={poTotal} pInvoiceTotal={pInvoiceTotal} 
      pInvoicePaidAmount={pInvoicePaidAmount} pInvoiceReturnedAmount={pInvoiceReturnedAmount} 
      pInvoiceSisa={pInvoiceSisa} stockByProduct={stockByProduct}
      colorConfig={COLOR} uid={uid} todayISO={todayISO} fmtDate={fmtDate} fmtIDR={fmtIDR}
      calcTax={calcTax} COMPANY_PROFILE={COMPANY_PROFILE}
    />
  ) : <AccessDenied />
)}

        {/* PENJUALAN */}
{tab === "sales" && (
  currentUserAccess.includes("sales") ? (
    <SalesView
      products={products} customers={customers} sos={sos} batches={batches}
      deliveryNotes={deliveryNotes} invoices={invoices} returns={returns} paymentsIn={paymentsIn}
      saveSOs={persist.sos} saveBatches={persist.batches} saveDeliveryNotes={persist.deliveryNotes}
      saveInvoices={persist.invoices} saveReturns={persist.returns} saveCustomers={persist.customers}
      allocateFEFO={allocateFEFO} findName={findName} notify={notify} stockByProduct={stockByProduct}
      soTotal={soTotal} invoiceTotal={invoiceTotal} soDPAmount={soDPAmount}
      invoicePaidAmount={invoicePaidAmount} invoiceReturnedAmount={invoiceReturnedAmount}
      colorConfig={COLOR} uid={uid} todayISO={todayISO} fmtDate={fmtDate} fmtIDR={fmtIDR}
      calcTax={calcTax} COMPANY_PROFILE={COMPANY_PROFILE} CUSTOMER_TYPES={CUSTOMER_TYPES}
    />
  ) : <AccessDenied />
)}

        {/* FINANCE */}
        {tab === "finance" && (
  isFinanceOrAdmin ? (
    <FinanceView
      {...{ pos, sos, suppliers, customers, batches, invoices, pInvoices, pReturns, returns, paymentsOut, paymentsIn, expenses, findName, notify }}
      savePaymentsOut={persist.paymentsOut} savePaymentsIn={persist.paymentsIn} saveExpenses={persist.expenses}
      arOutstanding={arOutstanding} apOutstanding={apOutstanding} cashInMonth={cashInMonth} cashOutMonth={cashOutMonth}
      grossProfitMonth={grossProfitMonth} expensesMonth={expensesMonth}
      invoiceTotal={invoiceTotal} soDPAmount={soDPAmount} invoicePaidAmount={invoicePaidAmount} 
      invoiceReturnedAmount={invoiceReturnedAmount} invoiceSisa={invoiceSisa}
      pInvoiceTotal={pInvoiceTotal} pInvoicePaidAmount={pInvoicePaidAmount} 
      pInvoiceReturnedAmount={pInvoiceReturnedAmount} pInvoiceSisa={pInvoiceSisa}
    />
  ) : <AccessDenied />
)}
        {/* LAPORAN */}
        {tab === "reports" && (
          currentUserAccess.includes("reports") ? (
            <ReportsView 
              products={products} suppliers={suppliers} customers={customers} pos={pos} sos={sos} 
              invoices={invoices} pInvoices={pInvoices} returns={returns} pReturns={pReturns} 
              expenses={expenses} batches={batches} deliveryNotes={deliveryNotes} findName={findName} 
              pInvoiceTotal={pInvoiceTotal} invoiceTotal={invoiceTotal} 
              currentUserEmail={userEmail} /* <-- TAMBAHKAN BARIS INI */
            />
          ) : <AccessDenied />
        )}

        {/* PENGATURAN */}
        {tab === "settings" && (
          currentUserAccess.includes("settings") ? (
            <SettingsView 
              notify={notify} refreshAll={refreshAll} users={users} 
              saveUsers={persist.users} currentUserEmail={userEmail}
            />
          ) : <AccessDenied />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg no-print" style={{ background: toast.tone === "danger" ? COLOR.danger : COLOR.primary, color: "#fff" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ---------- DASHBOARD ----------
function Dashboard({ products, pos, sos, stockByProduct, lowStock, nearExpiry, expired, totalStockValue, findName, suppliers, customers, arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth, isFinanceOrAdmin }) {
  const recentPOs = [...(pos || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentSOs = [...(sos || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div>
      <Eyebrow>Ringkasan bisnis</Eyebrow>
      <h2 className="text-xl font-semibold mb-5" style={{ color: COLOR.ink }}>Dashboard ERP</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card>
  <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total SKU</div>
  <div className="text-2xl font-mono font-semibold" style={{ color: COLOR.good }}>{(products || []).length}</div>
</Card>
<Card>
  <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Nilai Stok</div>
  <div className="text-2xl font-mono font-semibold" style={{ color: COLOR.good }}>{fmtIDR(totalStockValue)}</div>
</Card>
        <Card style={{ borderColor: lowStock.length ? COLOR.warn : COLOR.border }}>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Stok Menipis</div>
          <div className="text-2xl font-mono font-semibold" style={{ color: lowStock.length ? COLOR.warn : COLOR.ink }}>{lowStock.length}</div>
        </Card>
        <Card style={{ borderColor: (nearExpiry.length || expired.length) ? COLOR.danger : COLOR.border }}>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Mendekati / Lewat Exp</div>
          <div className="text-2xl font-mono font-semibold" style={{ color: (nearExpiry.length || expired.length) ? COLOR.danger : COLOR.ink }}>{nearExpiry.length + expired.length}</div>
        </Card>
      </div>

      {/* HANYA TAMPILKAN RINGKASAN MARGIN JIKA ADMIN / FINANCE */}
{isFinanceOrAdmin && (
  <>
    <Eyebrow>Ringkasan keuangan (bulan berjalan)</Eyebrow>
    <div className="grid grid-cols-5 gap-3 mb-6">
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Piutang (AR)</div>
        <div className="text-lg font-mono font-semibold" style={{ color: COLOR.warn }}>{fmtIDR(arOutstanding)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Hutang (AP)</div>
        <div className="text-lg font-mono font-semibold" style={{ color: COLOR.danger }}>{fmtIDR(apOutstanding)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Kas Masuk</div>
        <div className="text-lg font-mono font-semibold" style={{ color: COLOR.good }}>{fmtIDR(cashInMonth)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Kas Keluar</div>
        <div className="text-lg font-mono font-semibold" style={{ color: COLOR.danger }}>{fmtIDR(cashOutMonth)}</div>
      </Card>
      <Card style={{ borderColor: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Laba Kotor (Margin)</div>
        <div className="text-lg font-mono font-semibold" style={{ color: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>{fmtIDR(grossProfitMonth)}</div>
      </Card>
    </div>
  </>
)}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium text-sm" style={{ color: COLOR.ink }}>Perlu perhatian — Stok & Expiry</div>
          </div>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {lowStock.map((s) => (
              <div key={s.product.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span style={{ color: COLOR.ink }}>{s.product.name}</span>
                <Badge tone="warn">stok {s.qty} / min {s.product.minStock}</Badge>
              </div>
            ))}
            {[...expired, ...nearExpiry].map((b) => {
              const p = (products || []).find((x) => x.id === b.productId);
              return (
                <div key={b.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                  <span style={{ color: COLOR.ink }}>{p ? p.name : "-"} <span className="font-mono text-xs" style={{ color: COLOR.inkSoft }}>({b.batchNo})</span></span>
                  <Badge tone={urgencyOf(b.expiryDate).tone}>{urgencyOf(b.expiryDate).label}</Badge>
                </div>
              );
            })}
            {lowStock.length === 0 && nearExpiry.length === 0 && expired.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: COLOR.inkSoft }}>Semua aman — tidak ada yang perlu perhatian saat ini.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="font-medium text-sm mb-3" style={{ color: COLOR.ink }}>Transaksi Terbaru</div>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {recentPOs.map((po) => (
              <div key={po.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span className="flex items-center gap-1.5" style={{ color: COLOR.ink }}><ArrowDownRight size={14} color={COLOR.warn} /> {po.poNumber} · {findName(suppliers, po.supplierId)}</span>
                <span className="font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</span>
              </div>
            ))}
            {recentSOs.map((so) => (
              <div key={so.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span className="flex items-center gap-1.5" style={{ color: COLOR.ink }}><ArrowUpRight size={14} color={COLOR.good} /> {so.soNumber} · {findName(customers, so.customerId)}</span>
                <span className="font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</span>
              </div>
            ))}
            {recentPOs.length === 0 && recentSOs.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: COLOR.inkSoft }}>Belum ada transaksi.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}


function FinanceView(props) {
  const {
    pos, sos, suppliers, customers, batches, invoices, pInvoices, pReturns, returns, paymentsOut, paymentsIn, expenses,
    findName, notify, savePaymentsOut, savePaymentsIn, saveExpenses,
    arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth,
    invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount, invoiceSisa,
    pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa,
  } = props;

  const [subTab, setSubTab] = useState("ar");
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });

  function openPay(kind, doc) {
    let amount = 0;
    if (kind === "invoice") amount = invoiceSisa(doc);
    else if (kind === "dp") amount = 0;
    else if (kind === "pInvoice") amount = pInvoiceSisa(doc);
    setPayForm({ amount, date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
    setPayModal({ kind, doc });
  }

  function openEditPay(kind, payObj) {
    setPayForm({ amount: payObj.amount, date: payObj.date || todayISO(), method: payObj.method || PAYMENT_METHODS[0], note: payObj.note || "" });
    setPayModal({ kind, pay: payObj });
  }

  async function submitPayment() {
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) return notify("Jumlah pembayaran harus lebih dari 0", "danger");

    if (payModal.kind === "edit-in") {
      const updated = (paymentsIn || []).map((p) => (p.id === payModal.pay.id ? { ...p, amount: amt, date: payForm.date, method: payForm.method, note: payForm.note } : p));
      await savePaymentsIn(updated);
      notify("Pembayaran masuk diperbarui");
      setPayModal(null);
      return;
    }

    if (payModal.kind === "edit-out") {
      const updated = (paymentsOut || []).map((p) => (p.id === payModal.pay.id ? { ...p, amount: amt, date: payForm.date, method: payForm.method, note: payForm.note } : p));
      await savePaymentsOut(updated);
      notify("Pembayaran keluar diperbarui");
      setPayModal(null);
      return;
    }

    const entry = { id: uid(), amount: amt, date: payForm.date, method: payForm.method, note: payForm.note };
    if (payModal.kind === "invoice") {
      await savePaymentsIn([...(paymentsIn || []), { ...entry, invoiceId: payModal.doc.id, type: "Pelunasan" }]);
      notify(`Pembayaran untuk ${payModal.doc.noFaktur} dicatat`);
    } else if (payModal.kind === "dp") {
      await savePaymentsIn([...(paymentsIn || []), { ...entry, soId: payModal.doc.id, type: "DP" }]);
      notify(`DP untuk ${payModal.doc.soNumber} dicatat`);
    } else if (payModal.kind === "pInvoice") {
      await savePaymentsOut([...(paymentsOut || []), { ...entry, pInvoiceId: payModal.doc.id }]);
      notify(`Pembayaran Faktur Supplier ${payModal.doc.noFaktur} dicatat`);
    }
    setPayModal(null);
  }

  async function deletePaymentIn(id) {
    await savePaymentsIn((paymentsIn || []).filter((p) => p.id !== id));
    notify("Pembayaran masuk dihapus");
  }

  async function deletePaymentOut(id) {
    await savePaymentsOut((paymentsOut || []).filter((p) => p.id !== id));
    notify("Pembayaran keluar dihapus");
  }

  async function submitExpense() {
    if (!expForm.amount || Number(expForm.amount) <= 0) return notify("Jumlah biaya harus lebih dari 0", "danger");
    await saveExpenses([...(expenses || []), { id: uid(), ...expForm, amount: Number(expForm.amount) }]);
    notify("Biaya operasional dicatat");
    setExpModal(false);
    setExpForm({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });
  }

  async function removeExpense(id) {
    await saveExpenses((expenses || []).filter((e) => e.id !== id));
    notify("Biaya dihapus");
  }

  const invoiceARList = (invoices || []).map((inv) => ({ inv, total: invoiceTotal(inv), sisa: invoiceSisa(inv) })).filter((x) => x.sisa > 0);
  const dpOnlySOList = (sos || []).filter((so) => !(invoices || []).some((inv) => inv.soId === so.id) && soDPAmount(so.id) > 0);
  const pInvoiceAPList = (pInvoices || []).map((inv) => ({ inv, total: pInvoiceTotal(inv), sisa: pInvoiceSisa(inv) })).filter((x) => x.sisa > 0);

  const SUBNAV = [
    { id: "ar", label: `Piutang (${invoiceARList.length})` },
    { id: "ap", label: `Hutang (${pInvoiceAPList.length})` },
    { id: "history", label: `Riwayat Pembayaran (${(paymentsIn || []).length + (paymentsOut || []).length})` },
    { id: "expenses", label: "Biaya Operasional" },
  ];

  return (
    <div>
      <Eyebrow>Keuangan</Eyebrow>
      <h2 className="text-xl font-semibold mb-5" style={{ color: COLOR.ink }}>Finance</h2>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <Card>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><Wallet size={13} /> Total Piutang</div>
          <div className="text-xl font-mono font-semibold" style={{ color: COLOR.warn }}>{fmtIDR(arOutstanding)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><CreditCard size={13} /> Total Hutang</div>
          <div className="text-xl font-mono font-semibold" style={{ color: COLOR.danger }}>{fmtIDR(apOutstanding)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><Receipt size={13} /> Beban Operasional Bulan Ini</div>
          <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(expensesMonth)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><PiggyBank size={13} /> Laba Kotor (Margin) Bulan Ini</div>
          <div className="text-xl font-mono font-semibold" style={{ color: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>{fmtIDR(grossProfitMonth)}</div>
        </Card>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit flex-wrap" style={{ background: COLOR.primarySoft }}>
        {SUBNAV.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubTab(s.id)}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ background: subTab === s.id ? COLOR.primary : "transparent", color: subTab === s.id ? "#fff" : COLOR.primary }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* SUBTAB 1: PIUTANG (AR) */}
      {subTab === "ar" && (
        <div>
          <Card className="!p-0 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. Faktur", "Pelanggan", "Total", "DP + Dibayar", "Sisa Piutang", "Tanggal Faktur", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoiceARList.map(({ inv, total, sisa }) => {
                  const so = (sos || []).find((x) => x.id === inv.soId);
                  const custName = inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
                  return (
                    <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{custName}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(total - sisa)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.warn }}>{fmtIDR(sisa)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("invoice", inv)} className="text-xs font-semibold" style={{ color: COLOR.accent }}>Catat Pembayaran</button></td>
                    </tr>
                  );
                })}
                {invoiceARList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada piutang tersisa — semua Faktur Penjualan sudah lunas.</td></tr>}
              </tbody>
            </table>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>DP diterima (SO belum difaktur)</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. SO", "Pelanggan", "Total SO", "DP Diterima", "Tanggal SO", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dpOnlySOList.map((so) => (
                  <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR((so.items || []).reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(soDPAmount(so.id))}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("dp", so)} className="text-xs font-semibold" style={{ color: COLOR.accent }}>Tambah DP</button></td>
                  </tr>
                ))}
                {dpOnlySOList.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada DP yang tercatat untuk SO yang belum difaktur.</td></tr>}
              </tbody>
            </table>
          </Card>
          <div className="flex justify-end mt-2">
            <button onClick={() => setPayModal({ kind: "dp-pick" })} className="text-xs font-semibold" style={{ color: COLOR.accent }}>+ Catat DP untuk SO lain</button>
          </div>
        </div>
      )}

      {payModal?.kind === "dp-pick" && (
        <Modal title="Catat DP Sales Order" onClose={() => setPayModal(null)}>
          <Field label="Pilih Sales Order">
            <Select onChange={(e) => { const so = (sos || []).find((x) => x.id === e.target.value); if (so) openPay("dp", so); }} defaultValue="">
              <option value="" disabled>— pilih SO —</option>
              {(sos || []).filter((so) => !(invoices || []).some((inv) => inv.soId === so.id)).map((so) => (
                <option key={so.id} value={so.id}>{so.soNumber} · {findName(customers, so.customerId)}</option>
              ))}
            </Select>
          </Field>
        </Modal>
      )}

      {/* SUBTAB 2: HUTANG (AP) */}
      {subTab === "ap" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["No. Faktur Vendor", "Supplier", "Total Tagihan", "Sudah Dibayar", "Sisa Hutang", "Tanggal Faktur", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pInvoiceAPList.map(({ inv, total, sisa }) => (
                <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, inv.supplierId)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(total - sisa)}</td>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.danger }}>{fmtIDR(sisa)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("pInvoice", inv)} className="text-xs font-semibold" style={{ color: COLOR.accent }}>Bayar Hutang</button></td>
                </tr>
              ))}
              {pInvoiceAPList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada hutang tersisa — semua Faktur Pembelian sudah lunas.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {/* SUBTAB 3: RIWAYAT PEMBAYARAN */}
      {subTab === "history" && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Pembayaran Masuk (Pelanggan / DP)</div>
          <Card className="!p-0 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Tanggal", "Tipe", "Referensi", "Jumlah", "Metode", "Catatan", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(paymentsIn || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                  const inv = (invoices || []).find((x) => x.id === p.invoiceId);
                  const so = (sos || []).find((x) => x.id === p.soId);
                  const ref = inv ? inv.noFaktur : so ? so.soNumber : "-";
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5"><Badge tone="good">{p.type || "Pelunasan"}</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: COLOR.ink }}>{ref}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.good }}>{fmtIDR(p.amount)}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => openEditPay("edit-in", p)} className="text-xs mr-3 font-semibold" style={{ color: COLOR.accent }}>Edit</button>
                        <button onClick={() => deletePaymentIn(p.id)} className="text-xs font-semibold" style={{ color: COLOR.danger }}>Hapus</button>
                      </td>
                    </tr>
                  );
                })}
                {(paymentsIn || []).length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada pembayaran masuk.</td></tr>}
              </tbody>
            </table>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Pembayaran Keluar (Supplier / Faktur Pembelian)</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Tanggal", "No. Faktur Vendor / PO", "Jumlah", "Metode", "Catatan", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(paymentsOut || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                  const inv = (pInvoices || []).find((x) => x.id === p.pInvoiceId);
                  const po = (pos || []).find((x) => x.id === p.poId);
                  const ref = inv ? inv.noFaktur : po ? po.poNumber : "-";
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: COLOR.ink }}>{ref}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.danger }}>{fmtIDR(p.amount)}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => openEditPay("edit-out", p)} className="text-xs mr-3 font-semibold" style={{ color: COLOR.accent }}>Edit</button>
                        <button onClick={() => deletePaymentOut(p.id)} className="text-xs font-semibold" style={{ color: COLOR.danger }}>Hapus</button>
                      </td>
                    </tr>
                  );
                })}
                {(paymentsOut || []).length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada pembayaran keluar.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* SUBTAB 4: BIAYA OPERASIONAL (TERMASUK AMORTISASI PREPAID RENT) */}
      {subTab === "expenses" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setExpModal(true)}><Plus size={15} /> Catat Biaya</Button>
          </div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Tanggal", "Kategori", "Jumlah Kas Keluar", "Catatan / Keterangan", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(expenses || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((e) => {
                  const isPrepaid = e.category === "Sewa Dibayar di Muka (Prepaid 1 Tahun)";
                  const monthlyVal = isPrepaid ? e.amount / 12 : e.amount;

                  return (
                    <tr key={e.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(e.date)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={isPrepaid ? "warn" : "neutral"}>{e.category}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>
                        {fmtIDR(e.amount)}
                        {isPrepaid && (
                          <span className="block text-[10px] text-teal-800 font-semibold mt-0.5">
                            (Beban Amortisasi: {fmtIDR(monthlyVal)} / bulan)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: COLOR.inkSoft }}>{e.note || "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => removeExpense(e.id)} className="text-xs font-semibold" style={{ color: COLOR.danger }}>Hapus</button>
                      </td>
                    </tr>
                  );
                })}
                {(expenses || []).length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada biaya operasional tercatat.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* MODAL INPUT PEMBAYARAN */}
      {payModal && payModal.kind !== "dp-pick" && (
        <Modal
          title={
            payModal.kind === "invoice" ? `Catat Pembayaran — ${payModal.doc.noFaktur}`
            : payModal.kind === "dp" ? `Catat DP — ${payModal.doc.soNumber}`
            : payModal.kind === "pInvoice" ? `Bayar Hutang Supplier — ${payModal.doc.noFaktur}`
            : payModal.kind === "edit-in" ? `Edit Pembayaran Masuk`
            : payModal.kind === "edit-out" ? `Edit Pembayaran Keluar`
            : `Catat Pembayaran Keluar`
          }
          onClose={() => setPayModal(null)}
        >
          <Field label="Jumlah dibayar"><TextInput type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
          <Field label="Tanggal"><TextInput type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></Field>
          <Field label="Metode">
            <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Catatan (opsional)"><TextInput value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} /></Field>
          <Button onClick={submitPayment} className="w-full justify-center mt-2">Simpan Pembayaran</Button>
        </Modal>
      )}

      {/* MODAL CATAT BIAYA OPERASIONAL */}
      {expModal && (
        <Modal title="Catat Biaya Operasional" onClose={() => setExpModal(false)}>
          <Field label="Kategori Biaya">
            <Select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Jumlah Pengeluaran Kas (Rp)"><TextInput type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="0" /></Field>
          <Field label="Tanggal Pembayaran"><TextInput type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} /></Field>
          <Field label="Catatan / Keterangan (opsional)"><TextInput value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} placeholder="Contoh: Sewa Gudang Periode Aug 2026 - Aug 2027" /></Field>
          <Button onClick={submitExpense} className="w-full justify-center mt-2">Simpan Biaya Operasional</Button>
        </Modal>
      )}
    </div>
  );
}

// ---------- LAPORAN BERBASIS FAKTUR & LABA RUGI PER PERIODE ----------
function ReportsView({ products, suppliers, customers, pos, sos, invoices, pInvoices, returns, pReturns, expenses, batches, deliveryNotes, findName, pInvoiceTotal, invoiceTotal, currentUserEmail }) {
  // Cek apakah user yang sedang login adalah Super Admin / Finance
  const isSuperAdminOrFinance = ADMIN_FINANCE_EMAILS.includes((currentUserEmail || "").toLowerCase());

  // Default tab: "pnl" untuk Admin/Finance, "sales" untuk Staff biasa
  const [subTab, setSubTab] = useState(isSuperAdminOrFinance ? "pnl" : "sales");

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(todayISO());

  function inRange(dateStr) { return dateStr >= start && dateStr <= end; }

  // 1. FILTER FAKTUR PEMBELIAN PERIODE
  const filteredPInvoices = useMemo(() => (pInvoices || []).filter((inv) => inRange(inv.date)), [pInvoices, start, end]);

  const allPurchaseDocs = useMemo(() => {
    return filteredPInvoices.map(inv => {
      const po = (pos || []).find(p => p.id === inv.poId);
      return {
        id: inv.id,
        docNumber: inv.noFaktur,
        partyName: findName(suppliers, inv.supplierId),
        date: inv.date,
        type: inv.isDirect ? "Langsung" : `PO (${po?.poNumber || "-"})`,
        items: inv.items || [],
        total: pInvoiceTotal(inv)
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredPInvoices, pos, suppliers, pInvoiceTotal]);

  // 2. FILTER FAKTUR PENJUALAN PERIODE
  const filteredInvoices = useMemo(() => (invoices || []).filter((inv) => inRange(inv.date)), [invoices, start, end]);

  const allSalesDocs = useMemo(() => {
    return filteredInvoices.map(inv => {
      const so = (sos || []).find(s => s.id === inv.soId);
      const custName = inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
      return {
        id: inv.id,
        docNumber: inv.noFaktur,
        partyName: custName,
        date: inv.date,
        type: inv.isDirect ? "Langsung" : `SO (${so?.soNumber || "-"})`,
        items: inv.items || [],
        total: invoiceTotal(inv)
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredInvoices, sos, customers, invoiceTotal]);

  function batchCost(batchId) { const b = (batches || []).find((x) => x.id === batchId); return b ? b.costPrice : 0; }

  // 3. KALKULASI HPP & LABA RUGI PER PERIODE
  const pnlData = useMemo(() => {
    let grossSalesDPP = 0;
    let salesReturnsVal = 0;
    let totalCOGS = 0;

    filteredInvoices.forEach((inv) => {
      const rawSub = (inv.items || []).reduce((s, it) => {
        const gross = it.qty * it.unitPrice;
        const discAmount = gross * (Number(it.discountPercent || 0) / 100);
        return s + Math.max(0, gross - discAmount);
      }, 0);
      const discHeaderPct = Number(inv.discountPercent || 0);
      const taxInfo = calcTax(rawSub, inv.taxType || "none", discHeaderPct);
      grossSalesDPP += taxInfo.dpp;

      let invCogs = 0;
      if (inv.isDirect) {
        invCogs = (inv.items || []).reduce((s, it) => s + (it.allocations || []).reduce((s2, a) => s2 + a.qty * batchCost(a.batchId), 0), 0);
      } else {
        invCogs = (deliveryNotes || []).filter((dn) => dn.soId === inv.soId && dn.status === "diterima")
          .reduce((s, dn) => s + (dn.items || []).reduce((s2, it) => s2 + (it.allocations || []).reduce((s3, a) => s3 + a.qty * batchCost(a.batchId), 0), 0), 0);
      }

      const returList = (returns || []).filter((r) => r.invoiceId === inv.id || (inv.soId && r.soId === inv.soId));
      let retVal = 0;
      let retCogs = 0;

      returList.forEach((r) => {
        (r.items || []).forEach((it) => {
          retVal += (it.qty * it.unitPrice);
          if (it.restockedBatches && it.restockedBatches.length > 0) {
            it.restockedBatches.forEach((rb) => { retCogs += rb.qty * batchCost(rb.batchId); });
          } else {
            const avgCost = (batches || []).filter(b => b.productId === it.productId)[0]?.costPrice || 0;
            retCogs += it.qty * avgCost;
          }
        });
      });

      salesReturnsVal += retVal;
      totalCOGS += Math.max(0, invCogs - retCogs);
    });

    const netSales = Math.max(0, grossSalesDPP - salesReturnsVal);
    const grossProfit = netSales - totalCOGS;

    let periodExpenses = 0;
    (expenses || []).forEach((e) => {
      if (e.category === "Sewa Dibayar di Muka (Prepaid 1 Tahun)") {
        const monthlyAmort = (Number(e.amount) || 0) / 12;
        if (inRange(e.date)) periodExpenses += monthlyAmort;
      } else {
        if (inRange(e.date)) periodExpenses += (Number(e.amount) || 0);
      }
    });

    const netProfit = grossProfit - periodExpenses;

    return { grossSalesDPP, salesReturnsVal, netSales, totalCOGS, grossProfit, periodExpenses, netProfit };
  }, [filteredInvoices, returns, deliveryNotes, batches, expenses, start, end]);

  function aggregateByProduct(docs) {
    const map = {};
    docs.forEach((doc) => {
      (doc.items || []).forEach((it) => {
        if (!map[it.productId]) map[it.productId] = { qty: 0, value: 0 };
        map[it.productId].qty += Number(it.qty) || 0;
        map[it.productId].value += (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      });
    });
    return map;
  }

  const purchaseAgg = useMemo(() => aggregateByProduct(allPurchaseDocs), [allPurchaseDocs]);
  const salesAgg = useMemo(() => aggregateByProduct(allSalesDocs), [allSalesDocs]);

  const purchaseTotal = allPurchaseDocs.reduce((s, x) => s + x.total, 0);
  const salesTotal = allSalesDocs.reduce((s, x) => s + x.total, 0);

  // Filter Sub-tab Laporan (Sembunyikan P&L untuk Staff)
  const SUBNAV = [
    { id: "sales", label: "Penjualan" },
    { id: "purchases", label: "Pembelian" },
    ...(isSuperAdminOrFinance ? [{ id: "pnl", label: "Laba Rugi (P&L)" }] : []),
  ];

  return (
    <div>
      <Eyebrow>Laporan Operasional & Keuangan</Eyebrow>
      <h2 className="text-xl font-semibold mb-4" style={{ color: COLOR.ink }}>Laporan Per Periode</h2>

      <div className="flex items-end gap-3 mb-5 p-3 bg-white rounded-xl border no-print" style={{ borderColor: COLOR.border }}>
        <Field label="Dari Tanggal"><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Sampai Tanggal"><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <div className="pb-3 text-xs font-mono text-teal-800 font-semibold">
          Periode: {fmtDate(start)} s/d {fmtDate(end)}
        </div>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit flex-wrap no-print" style={{ background: COLOR.primarySoft }}>
        {SUBNAV.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubTab(s.id)}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: subTab === s.id ? COLOR.primary : "transparent", color: subTab === s.id ? "#fff" : COLOR.primary }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* TAB 1: LAPORAN LABA RUGI (HANYA UNTUK SUPER ADMIN / FINANCE) */}
      {subTab === "pnl" && isSuperAdminOrFinance && (
        <div className="space-y-4 max-w-3xl">
          <Card className="!p-6 bg-white printable-area">
            <div className="border-b pb-3 mb-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base uppercase" style={{ color: COLOR.primary }}>Laporan Laba Rugi Operasional</h3>
                <p className="text-xs text-gray-500">Periode: {fmtDate(start)} s/d {fmtDate(end)}</p>
              </div>
              <Button onClick={() => window.print()} variant="ghost" className="no-print text-xs">
                <Printer size={14} /> Cetak Laporan
              </Button>
            </div>

            <div className="space-y-3 text-sm font-mono">
              {pnlData.salesReturnsVal > 0 ? (
                <>
                  <div className="flex justify-between py-1.5 border-b text-gray-700">
                    <span>Penjualan Kotor (DPP)</span>
                    <span className="font-semibold">{fmtIDR(pnlData.grossSalesDPP)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b text-red-600 pl-4">
                    <span>(-) Retur Penjualan</span>
                    <span className="font-semibold">- {fmtIDR(pnlData.salesReturnsVal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b-2 font-bold text-teal-900 bg-teal-50/50 px-2 rounded">
                    <span>Penjualan Bersih (Net Sales)</span>
                    <span>{fmtIDR(pnlData.netSales)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between py-2 border-b-2 font-bold text-teal-900 bg-teal-50/50 px-2 rounded">
                  <span>Penjualan Bersih (Sales DPP)</span>
                  <span>{fmtIDR(pnlData.netSales)}</span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                <span>(-) Harga Pokok Penjualan (HPP)</span>
                <span className="text-red-600">- {fmtIDR(pnlData.totalCOGS)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 font-bold text-teal-900 bg-teal-50 px-2 rounded">
                <span>Laba Kotor (Gross Profit)</span>
                <span>{fmtIDR(pnlData.grossProfit)}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                <span>(-) Total Beban Operasional (Expenses)</span>
                <span className="text-red-600">- {fmtIDR(pnlData.periodExpenses)}</span>
              </div>

              <div className={`flex justify-between py-3 border-b-2 text-base font-extrabold px-3 rounded mt-4 ${pnlData.netProfit >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                <span>Laba / (Rugi) Bersih Operasional</span>
                <span>{fmtIDR(pnlData.netProfit)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: LAPORAN PENJUALAN */}
      {subTab === "sales" && (
        <div>
          <Card className="mb-4">
            <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Penjualan Berdasarkan Faktur ({fmtDate(start)} – {fmtDate(end)})</div>
            <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(salesTotal)}</div>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Rekap Produk Difakturkan</div>
          <Card className="!p-0 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Produk", "Qty Terjual", "Nilai Penjualan (Subtotal)"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesAgg).sort((a, b) => b[1].value - a[1].value).map(([pid, agg]) => {
                  const p = (products || []).find((x) => x.id === pid);
                  return (
                    <tr key={pid} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{agg.qty} {p?.unit}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(agg.value)}</td>
                    </tr>
                  );
                })}
                {Object.keys(salesAgg).length === 0 && <tr><td colSpan={3} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Penjualan di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Daftar Faktur Penjualan</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. Faktur", "Tipe", "Pelanggan", "Tanggal", "Total Tagihan"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSalesDocs.map((doc) => (
                  <tr key={doc.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{doc.docNumber}</td>
                    <td className="px-4 py-2.5"><Badge tone={doc.type === "Langsung" ? "warn" : "neutral"}>{doc.type}</Badge></td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{doc.partyName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(doc.date)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(doc.total)}</td>
                  </tr>
                ))}
                {allSalesDocs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Penjualan di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* TAB 3: LAPORAN PEMBELIAN */}
      {subTab === "purchases" && (
        <div>
          <Card className="mb-4">
            <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Pembelian Berdasarkan Faktur Vendor ({fmtDate(start)} – {fmtDate(end)})</div>
            <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(purchaseTotal)}</div>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Rekap Produk Difakturkan</div>
          <Card className="!p-0 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Produk", "Qty Dibeli", "Nilai Beli (Subtotal)"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(purchaseAgg).sort((a, b) => b[1].value - a[1].value).map(([pid, agg]) => {
                  const p = (products || []).find((x) => x.id === pid);
                  return (
                    <tr key={pid} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{agg.qty} {p?.unit}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(agg.value)}</td>
                    </tr>
                  );
                })}
                {Object.keys(purchaseAgg).length === 0 && <tr><td colSpan={3} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Pembelian di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>

          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Daftar Faktur Pembelian</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. Faktur Vendor", "Tipe", "Supplier", "Tanggal", "Total Tagihan"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPurchaseDocs.map((doc) => (
                  <tr key={doc.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{doc.docNumber}</td>
                    <td className="px-4 py-2.5"><Badge tone={doc.type === "Langsung" ? "warn" : "neutral"}>{doc.type}</Badge></td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{doc.partyName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(doc.date)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(doc.total)}</td>
                  </tr>
                ))}
                {allPurchaseDocs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Pembelian di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- SETTINGS VIEW COMPONENT WITH CHANGE PASSWORD & ACCESS CONTROL ----------
function SettingsView({ notify, refreshAll, users, saveUsers, currentUserEmail }) {
  // Cek apakah user yang sedang login adalah Super Admin / Finance
  const isSuperAdmin = typeof ADMIN_FINANCE_EMAILS !== "undefined" && ADMIN_FINANCE_EMAILS.includes((currentUserEmail || "").toLowerCase());

  // Default tab: Super Admin ke "company", Staff ke "users" (Profil Diri Sendiri)
  const [subTab, setSubTab] = useState(isSuperAdmin ? "company" : "users");

  // State Profile Perusahaan
  const [companyForm, setCompanyForm] = useState(() => {
    const saved = localStorage.getItem("erp-company-profile");
    return saved ? JSON.parse(saved) : (typeof COMPANY_PROFILE !== "undefined" ? { ...COMPANY_PROFILE } : {});
  });

  // State User Management
  const [modalUser, setModalUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: "staff", access: [] });

  // STATE UNTUK GANTI PASSWORD LOGIN
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // State File Restore
  const restoreInputRef = useRef(null);

  const MODULE_LIST = [
    { id: "dashboard", label: "Dashboard Ringkasan" },
    { id: "products", label: "Master Produk" },
    { id: "stock", label: "Stok & Batch FEFO" },
    { id: "suppliers", label: "Master Supplier / PBF" },
    { id: "customers", label: "Master Pelanggan / Faskes" },
    { id: "purchases", label: "Modul Pembelian (PO/BPB)" },
    { id: "sales", label: "Modul Penjualan (SO/SJ)" },
    { id: "finance", label: "Modul Finance & Kas" },
    { id: "reports", label: "Laporan & Laba Rugi" },
    { id: "settings", label: "Menu Pengaturan (Settings)" },
  ];

  function handleSaveProfile() {
    localStorage.setItem("erp-company-profile", JSON.stringify(companyForm));
    if (typeof COMPANY_PROFILE !== "undefined") Object.assign(COMPANY_PROFILE, companyForm);
    notify("Profil perusahaan & konfigurasi legalitas berhasil diperbarui!");
  }

  // FUNGSI GANTI PASSWORD LOGIC (FIREBASE AUTH)
  async function handleChangePassword(e) {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      return notify("Semua kolom password wajib diisi!", "danger");
    }
    if (newPassword.length < 6) {
      return notify("Password baru minimal 6 karakter!", "danger");
    }
    if (newPassword !== confirmPassword) {
      return notify("Konfirmasi password baru tidak cocok!", "danger");
    }

    setIsChangingPassword(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Pengguna tidak terautentikasi");

      // 1. Re-autentikasi pengguna dengan password lama demi keamanan
      const credential = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(user, credential);

      // 2. Update password ke Firebase Auth
      await updatePassword(user, newPassword);

      notify("Password login akun Anda berhasil diperbarui!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        notify("Password lama yang Anda masukkan salah!", "danger");
      } else if (err.code === "auth/requires-recent-login") {
        notify("Sesi login Anda sudah terlalu lama. Silakan logout dan login kembali untuk mengganti password.", "danger");
      } else {
        notify("Gagal mengganti password: " + (err.message || "Terjadi kesalahan"), "danger");
      }
    } finally {
      setIsChangingPassword(false);
    }
  }

  // USER MANAGEMENT FUNCTIONS
  function openNewUser() {
    setUserForm({ name: "", email: "", role: "staff", access: ["dashboard", "products", "sales"] });
    setModalUser("new");
  }

  function openEditUser(u) {
    setUserForm({ ...u, access: u.access || [] });
    setModalUser(u.id);
  }

  function toggleModuleAccess(modId) {
    if (userForm.access.includes(modId)) {
      setUserForm({ ...userForm, access: userForm.access.filter((id) => id !== modId) });
    } else {
      setUserForm({ ...userForm, access: [...userForm.access, modId] });
    }
  }

  async function submitUser() {
    if (!userForm.name.trim()) return notify("Nama pengguna wajib diisi", "danger");
    if (!userForm.email.trim()) return notify("Email pengguna wajib diisi", "danger");

    let updatedList = [];
    if (modalUser === "new") {
      const newUser = { ...userForm, id: typeof uid === "function" ? uid() : Date.now().toString() };
      updatedList = [...(users || []), newUser];
      notify(`Pengguna baru "${userForm.name}" berhasil ditambahkan`);
    } else {
      updatedList = (users || []).map((u) => (u.id === modalUser ? { ...userForm, id: u.id } : u));
      notify(`Akses pengguna "${userForm.name}" berhasil diperbarui`);
    }

    if (saveUsers) await saveUsers(updatedList);
    if (refreshAll) await refreshAll();
    setModalUser(null);
  }

  async function removeUser(userToDelete) {
    if (userToDelete.role === "admin" || (typeof ADMIN_FINANCE_EMAILS !== "undefined" && ADMIN_FINANCE_EMAILS.includes((userToDelete.email || "").toLowerCase()))) {
      return notify("Akses Ditolak: Akun Super Admin / Direktur tidak dapat dihapus!", "danger");
    }

    if ((userToDelete.email || "").toLowerCase() === (currentUserEmail || "").toLowerCase()) {
      return notify("Anda tidak dapat menghapus akun Anda sendiri!", "danger");
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus akses untuk "${userToDelete.name}"?`)) return;

    const updatedList = (users || []).filter((u) => u.id !== userToDelete.id);
    await saveUsers(updatedList);
    if (refreshAll) await refreshAll();
    notify(`Pengguna "${userToDelete.name}" berhasil dihapus`);
  }

  // FITUR BACKUP & RESTORE
  async function downloadFullBackup() {
    try {
      const keys = [
        KEYS.products, KEYS.suppliers, KEYS.customers, KEYS.batches,
        KEYS.pos, KEYS.pReceipts, KEYS.pInvoices, KEYS.pReturns,
        KEYS.sos, KEYS.paymentsOut, KEYS.paymentsIn, KEYS.expenses,
        KEYS.deliveryNotes, KEYS.invoices, KEYS.returns, KEYS.users
      ];

      const backupData = { exportDate: new Date().toISOString(), company: companyForm, data: {} };
      for (const k of keys) backupData.data[k] = await loadKey(k);

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `BACKUP_DATABASE_ERP_PT_WPM_${typeof todayISO === "function" ? todayISO() : "DATE"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notify("Backup seluruh database ERP berhasil diunduh!");
    } catch (e) {
      console.error(e);
      notify("Gagal mengunduh backup database", "danger");
    }
  }

  function handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (!imported.data) return notify("Format file backup JSON tidak valid!", "danger");
        if (!confirm("PERINGATAN: Meng-import file backup akan menimpa seluruh data ERP saat ini. Lanjutkan?")) return;

        for (const [key, val] of Object.entries(imported.data)) await saveKey(key, val);

        if (imported.company) {
          localStorage.setItem("erp-company-profile", JSON.stringify(imported.company));
          if (typeof COMPANY_PROFILE !== "undefined") Object.assign(COMPANY_PROFILE, imported.company);
        }

        await refreshAll();
        notify("Restore database ERP berhasil dilakukan!");
      } catch (err) {
        console.error(err);
        notify("Gagal membaca file backup JSON", "danger");
      }
    };
    reader.readAsText(file);
  }

  // Filter Sub-tab Settings Sesuai Hak Akses User Login
  const SUBNAV = isSuperAdmin ? [
    { id: "company", label: "Profil & Legalitas PBF" },
    { id: "finance", label: "Pajak & Rekening Bank" },
    { id: "users", label: "Pengguna & Hak Akses" },
    { id: "backup", label: "Backup & Restore Data" },
  ] : [
    { id: "users", label: "Profil Saya & Keamanan" },
  ];

  return (
    <div>
      <Eyebrow>Sistem & Konfigurasi</Eyebrow>
      <h2 className="text-xl font-semibold mb-4" style={{ color: COLOR.ink }}>
        {isSuperAdmin ? "Pengaturan Aplikasi (Settings)" : "Pengaturan Akun Saya"}
      </h2>

      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit flex-wrap no-print" style={{ background: COLOR.primarySoft }}>
        {SUBNAV.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubTab(s.id)}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: subTab === s.id ? COLOR.primary : "transparent", color: subTab === s.id ? "#fff" : COLOR.primary }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PROFIL PERUSAHAAN (SUPER ADMIN) */}
      {subTab === "company" && isSuperAdmin && (
        <Card className="max-w-3xl !p-6 space-y-4">
          <div className="font-bold text-sm text-teal-900 border-b pb-2 uppercase tracking-wide">
            Identitas Perusahaan & Legalitas Penyalur PBF/Alkes
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama Resmi Perusahaan">
              <TextInput value={companyForm.name || ""} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
            </Field>
            <Field label="NPWP Perusahaan">
              <TextInput value={companyForm.npwp || ""} onChange={(e) => setCompanyForm({ ...companyForm, npwp: e.target.value })} placeholder="Contoh: 95.146.576.4-448.000" />
            </Field>
          </div>

          <Field label="Tagline / Sub-Judul Perusahaan">
            <TextInput value={companyForm.tagline || ""} onChange={(e) => setCompanyForm({ ...companyForm, tagline: e.target.value })} />
          </Field>

          <Field label="Alamat Lengkap Gudang / Kantor">
            <TextInput value={companyForm.address || ""} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kontak Telepon & Email">
              <TextInput value={companyForm.contact || ""} onChange={(e) => setCompanyForm({ ...companyForm, contact: e.target.value })} />
            </Field>
            <Field label="No. WhatsApp Sales / Admin">
              <TextInput value={companyForm.whatsapp || ""} onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })} placeholder="Format: 62817773791" />
            </Field>
          </div>

          <div className="border-t pt-3 mt-4 font-bold text-sm text-teal-900 border-b pb-2 uppercase tracking-wide">
            Pengaturan Tanda Tangan & Stempel PJT (Dokumen PO)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama PJT / Apoteker Penanggung Jawab">
              <TextInput value={companyForm.pjtName || ""} onChange={(e) => setCompanyForm({ ...companyForm, pjtName: e.target.value })} placeholder="Nama & Gelar PJT" />
            </Field>
            <Field label="Link URL Gambar TTD & Stempel (PNG Transparan)">
              <TextInput value={companyForm.stampUrl || ""} onChange={(e) => setCompanyForm({ ...companyForm, stampUrl: e.target.value })} placeholder="https://i.imgur.com/..." />
            </Field>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <Button onClick={handleSaveProfile}>Simpan Perubahan Profil</Button>
          </div>
        </Card>
      )}

      {/* TAB 2: PAJAK & BANK (SUPER ADMIN) */}
      {subTab === "finance" && isSuperAdmin && (
        <Card className="max-w-3xl !p-6 space-y-4">
          <div className="font-bold text-sm text-teal-900 border-b pb-2 uppercase tracking-wide">
            Pengaturan Rekening Bank Transfer Resmi
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama Bank">
              <TextInput value={companyForm.bankDetails?.bankName || ""} onChange={(e) => setCompanyForm({ ...companyForm, bankDetails: { ...companyForm.bankDetails, bankName: e.target.value } })} />
            </Field>
            <Field label="Nomor Rekening">
              <TextInput value={companyForm.bankDetails?.accountNumber || ""} onChange={(e) => setCompanyForm({ ...companyForm, bankDetails: { ...companyForm.bankDetails, accountNumber: e.target.value } })} />
            </Field>
          </div>

          <Field label="Nama Pemilik Rekening (Atas Nama)">
            <TextInput value={companyForm.bankDetails?.accountName || ""} onChange={(e) => setCompanyForm({ ...companyForm, bankDetails: { ...companyForm.bankDetails, accountName: e.target.value } })} />
          </Field>

          <Field label="Catatan Pembayaran / Footer Invoice">
            <TextInput value={companyForm.paymentNotes || ""} onChange={(e) => setCompanyForm({ ...companyForm, paymentNotes: e.target.value })} />
          </Field>

          <div className="flex justify-end pt-3 border-t">
            <Button onClick={handleSaveProfile}>Simpan Pengaturan Bank</Button>
          </div>
        </Card>
      )}

      {/* TAB 3: PENGGUNA & HAK AKSES + FORM GANTI PASSWORD */}
      {subTab === "users" && (
        <div className="max-w-4xl space-y-6">
          
          {/* 1. FORM GANTI PASSWORD (TAMPIL UNTUK SEMUA USER: SUPER ADMIN, FINANCE, STAFF) */}
          <Card className="max-w-md !p-6">
            <div className="font-bold text-sm text-teal-900 border-b pb-2 mb-4 uppercase tracking-wide">
              Ganti Password Login Akun Saya
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Email Akun Terdaftar</label>
                <input 
                  type="text" 
                  disabled 
                  value={currentUserEmail || ""} 
                  className="w-full p-2 bg-gray-100 text-gray-500 rounded text-xs border font-mono cursor-not-allowed" 
                />
              </div>

              <Field label="Password Saat Ini (Lama)">
                <TextInput 
                  type="password" 
                  value={oldPassword} 
                  onChange={(e) => setOldPassword(e.target.value)} 
                  placeholder="Masukkan password lama" 
                />
              </Field>

              <Field label="Password Baru">
                <TextInput 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Minimal 6 karakter" 
                />
              </Field>

              <Field label="Konfirmasi Password Baru">
                <TextInput 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="Ketik ulang password baru" 
                />
              </Field>

              <Button type="submit" disabled={isChangingPassword} className="w-full justify-center mt-2">
                {isChangingPassword ? "Memproses..." : "Update Password Saya"}
              </Button>
            </form>
          </Card>

          {/* 2. TABEL PENGELOLAAN HAK AKSES (HANYA MUNCUL UNTUK SUPER ADMIN) */}
          {isSuperAdmin && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-xs text-gray-600">
                  Atur daftar staf dan batasi hak akses modul yang dapat dibuka oleh masing-masing akun.
                </div>
                <Button onClick={openNewUser}>
                  <Plus size={15} /> Tambah Pengguna
                </Button>
              </div>

              <Card className="!p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: COLOR.primarySoft }}>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.primary }}>Nama & Email</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.primary }}>Role / Jabatan</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.primary }}>Akses Modul</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.primary }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(users || []).map((u) => {
                      const isSuperAdminAccount = u.role === "admin" || (typeof ADMIN_FINANCE_EMAILS !== "undefined" && ADMIN_FINANCE_EMAILS.includes((u.email || "").toLowerCase()));
                      const isSelf = (u.email || "").toLowerCase() === (currentUserEmail || "").toLowerCase();

                      return (
                        <tr key={u.id} className="border-t" style={{ borderColor: COLOR.border }}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{u.name}</div>
                            <div className="text-xs font-mono text-gray-500">{u.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={u.role === "admin" ? "good" : "neutral"}>
                              {u.role === "admin" ? "Super Admin" : u.role === "sales" ? "Sales" : u.role === "gudang" ? "Gudang" : "Staff"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {(u.access || []).map((accId) => {
                                const m = MODULE_LIST.find((x) => x.id === accId);
                                return (
                                  <span key={accId} className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-mono">
                                    {m?.label || accId}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button onClick={() => openEditUser(u)} className="text-xs font-semibold text-teal-700 mr-3 hover:underline">
                              Edit Akses
                            </button>

                            {!isSuperAdminAccount && !isSelf ? (
                              <button onClick={() => removeUser(u)} className="text-xs font-semibold text-red-600 hover:underline">
                                Hapus
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-mono italic">Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {modalUser && (
                <Modal title={modalUser === "new" ? "Tambah Pengguna Baru" : `Edit Hak Akses — ${userForm.name}`} onClose={() => setModalUser(null)}>
                  <Field label="Nama Pengguna / Karyawan">
                    <TextInput value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nama Lengkap Staff" />
                  </Field>
                  <Field label="Email Akun Login">
                    <TextInput type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="email@wiryatamaputera.co.id" />
                  </Field>
                  <Field label="Role / Jabatan Utama">
                    <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                      <option value="staff">Staff Operasional</option>
                      <option value="sales">Sales & Marketing</option>
                      <option value="gudang">Petugas Gudang / Logistics</option>
                      <option value="finance">Tim Finance / Accounting</option>
                      <option value="admin">Super Admin (Akses Penuh)</option>
                    </Select>
                  </Field>

                  <div className="border-t pt-3 mt-3">
                    <div className="text-xs font-bold text-teal-900 mb-2 uppercase tracking-wide">
                      Pilih Modul yang Boleh Diakses:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {MODULE_LIST.map((m) => {
                        const checked = userForm.access.includes(m.id);
                        return (
                          <label key={m.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer bg-white text-xs hover:bg-teal-50/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleModuleAccess(m.id)}
                              className="rounded text-teal-800"
                            />
                            <span className={checked ? "font-semibold text-teal-900" : "text-gray-600"}>{m.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <Button onClick={submitUser} className="w-full justify-center mt-4">Simpan Hak Akses</Button>
                </Modal>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BACKUP & RESTORE (SUPER ADMIN) */}
      {subTab === "backup" && isSuperAdmin && (
        <div className="space-y-4 max-w-3xl">
          <Card className="!p-6">
            <div className="font-bold text-sm text-teal-900 mb-2 uppercase tracking-wide">
              Unduh Backup Database (1-Click Download)
            </div>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Gunakan fitur ini secara berkala untuk mengamankan data transaksi, daftar produk, stok batch, serta riwayat kas ERP ke dalam berkas cadangan (*file JSON*) di komputer Anda.
            </p>
            <Button onClick={downloadFullBackup}>
              <Download size={15} /> Unduh Backup Database ERP (.json)
            </Button>
          </Card>

          <Card className="!p-6 border-amber-200 bg-amber-50/50">
            <div className="font-bold text-sm text-amber-900 mb-2 uppercase tracking-wide">
              Restore / Impor Database dari Backup
            </div>
            <p className="text-xs text-amber-800 mb-4 leading-relaxed">
              Fitur ini akan mengembalikan data ERP dari berkas file `.json` cadangan yang telah diunduh sebelumnya. Data lama akan digantikan sesuai dengan isi file backup.
            </p>
            
            <input type="file" ref={restoreInputRef} accept=".json" onChange={handleRestoreFile} className="hidden" />
            <Button variant="danger" onClick={() => restoreInputRef.current?.click()}>
              <Upload size={15} /> Impor & Restore Database JSON
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function AccessDenied() {
  return (
    <Card className="text-center py-16 max-w-lg mx-auto mt-10">
      <ShieldAlert size={56} className="mx-auto mb-4" style={{ color: COLOR.danger }} />
      <h3 className="font-bold text-lg mb-1" style={{ color: COLOR.ink }}>Akses Modul Dibatasi</h3>
      <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
        Akun Anda tidak memiliki hak akses untuk membuka modul ini. Silakan hubungi <b>Super Admin / Direktur</b> jika Anda memerlukan akses ke halaman ini.
      </p>
    </Card>
  );
}