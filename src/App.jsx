import { useState, useEffect, useMemo } from "react";
import { loadKey, saveKey } from "./storage";
import {
  LayoutDashboard, Package, Truck, Users, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Trash2, Search, CheckCircle2, Clock,
  Boxes, ArrowUpRight, ArrowDownRight, Loader2, Edit, Calendar, Printer,
  Wallet, Receipt, CreditCard, PiggyBank, BarChart3, FileText, LogOut
} from "lucide-react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

// ---------- CONSTANTS & COMPANY PROFILE CONFIG ----------
const CATEGORIES = ["Obat Generik", "Obat Paten", "Alat Kesehatan", "Vitamin & Suplemen", "Consumables"];
const CUSTOMER_TYPES = ["Apotek", "Rumah Sakit", "Klinik", "Toko Obat", "Distributor Lain"];

const COMPANY_PROFILE = {
  name: "PT WIRYATAMA PUTERA MANDIRI",
  tagline: "Distributor Penyalur Farmasi & Alat Kesehatan (Alkes)",
  address: "Jl. Utama Bintaro Jaya No. 88, Sektor 3A, Tangerang Selatan, Banten 15222",
  contact: "Email: finance@wiryatamaputera.co.id | Telp: (021) 555-0192 / WhatsApp: 0812-3456-7890",
  logoUrl: "https://i.imgur.com/EfI1R4p.jpeg", 
  bankDetails: {
    bankName: "Bank Central Asia (BCA)",
    accountNumber: "883-0912-331",
    accountName: "PT WIRYATAMA PUTERA MANDIRI",
  },
  paymentNotes: "Pembayaran dianggap sah apabila uang telah masuk ke rekening atas nama PT Wiryatama Putera Mandiri."
};

const COLOR = {
  bg: "#F5F8F7",
  surface: "#FFFFFF",
  border: "#E2E9E7",
  ink: "#15302D",
  inkSoft: "#5C7873",
  primary: "#0E4749",
  primarySoft: "#E8F0EF",
  accent: "#1B6B6E",
  danger: "#B84438",
  dangerSoft: "#FBEAE8",
  warn: "#C97F1E",
  warnSoft: "#FBF1E1",
  good: "#357A5D",
  goodSoft: "#E9F3ED",
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
};

const EXPENSE_CATEGORIES = ["Sewa Gudang", "Transportasi & Logistik", "Gaji Karyawan", "Utilitas", "Perizinan & Legalitas", "Lainnya"];
const PAYMENT_METHODS = ["Transfer Bank", "Tunai", "Giro/Cek", "Lainnya"];

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ---------- UI Components ----------
function Eyebrow({ children }) {
  return <div style={{ color: COLOR.inkSoft, letterSpacing: "0.08em" }} className="text-[11px] font-mono uppercase mb-1">{children}</div>;
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={"rounded-xl p-4 " + className}
      style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`, ...style }}
    >
      {children}
    </div>
  );
}

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
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium"
      style={{ background: bg, color: fg }}
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

const inputStyle = {
  background: "#fff",
  border: `1px solid ${COLOR.border}`,
  color: COLOR.ink,
};

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
        className={"w-full rounded-lg pl-3 pr-9 py-1.5 text-sm outline-none bg-white " + className}
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
        style={{ colorScheme: "light" }}
      />
    </div>
  );
}

function TextInput(props) {
  if (props.type === "date") {
    return <DateInput {...props} />;
  }
  return <input {...props} className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} style={inputStyle} />;
}

function Select(props) {
  return <select {...props} className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} style={inputStyle} />;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" style={{ background: "rgba(15,30,28,0.45)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={"rounded-2xl w-full " + (wide ? "max-w-3xl" : "max-w-md") + " max-h-[85vh] overflow-y-auto modal-content"}
        style={{ background: COLOR.surface }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10 no-print" style={{ background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
          <h3 className="font-semibold text-base" style={{ color: COLOR.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-60"><X size={18} color={COLOR.inkSoft} /></button>
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
  const total = productBatches.reduce((s, b) => s + b.qty, 0);
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

// ---------- LOGIN COMPONENT ----------
function LoginScreen() {
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: COLOR.bg }}>
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border w-full max-w-sm shadow-sm" style={{ borderColor: COLOR.border }}>
        <div className="font-semibold text-lg mb-1" style={{ color: COLOR.ink }}>PT Wiryatama Putera Mandiri</div>
        <div className="text-xs mb-5" style={{ color: COLOR.inkSoft }}>ERP System — Masuk Sebagai Admin</div>

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
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}

// ---------- MAIN APP ENTRY POINT ----------
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
        <Loader2 className="animate-spin mr-2" size={18} /> Memeriksa autentikasi...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <PharmaERP userEmail={user.email} onLogout={() => signOut(auth)} />;
}

// ---------- main app ----------
function PharmaERP({ userEmail, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
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

  async function refreshAll() {
    setSyncState("syncing");
    try {
      const [p, s, c, b, po, pr, pi, pret, so, pout, pin, exp, dn, inv, ret] = await Promise.all([
        loadKey(KEYS.products), loadKey(KEYS.suppliers), loadKey(KEYS.customers),
        loadKey(KEYS.batches), loadKey(KEYS.pos), loadKey(KEYS.pReceipts), loadKey(KEYS.pInvoices), loadKey(KEYS.pReturns), loadKey(KEYS.sos),
        loadKey(KEYS.paymentsOut), loadKey(KEYS.paymentsIn), loadKey(KEYS.expenses),
        loadKey(KEYS.deliveryNotes), loadKey(KEYS.invoices), loadKey(KEYS.returns),
      ]);
      const swap = (setter) => (next) => setter((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
      swap(setProducts)(p); swap(setSuppliers)(s); swap(setCustomers)(c); swap(setBatches)(b);
      swap(setPOs)(po); swap(setPReceipts)(pr); swap(setPInvoices)(pi); swap(setPReturns)(pret); swap(setSOs)(so); 
      swap(setPaymentsOut)(pout); swap(setPaymentsIn)(pin); swap(setExpenses)(exp);
      swap(setDeliveryNotes)(dn); swap(setInvoices)(inv); swap(setReturns)(ret);
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
  };

  const stockByProduct = useMemo(() => {
    const map = {};
    for (const p of products) map[p.id] = { product: p, qty: 0, value: 0, batches: [] };
    for (const b of batches) {
      if (!map[b.productId]) continue;
      map[b.productId].qty += b.qty;
      map[b.productId].value += b.qty * b.costPrice;
      map[b.productId].batches.push(b);
    }
    return map;
  }, [products, batches]);

  const lowStock = useMemo(() => Object.values(stockByProduct).filter((s) => s.qty < (s.product.minStock || 0)), [stockByProduct]);
  const nearExpiry = useMemo(() => batches.filter((b) => b.qty > 0 && daysUntil(b.expiryDate) >= 0 && daysUntil(b.expiryDate) <= 90), [batches]);
  const expired = useMemo(() => batches.filter((b) => b.qty > 0 && daysUntil(b.expiryDate) < 0), [batches]);
  const totalStockValue = useMemo(() => Object.values(stockByProduct).reduce((s, x) => s + x.value, 0), [stockByProduct]);

  function findName(list, id) {
    const item = list.find((x) => x.id === id);
    return item ? item.name : "-";
  }

  function soTotal(so) { return so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function poTotal(po) { return po.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function pInvoiceTotal(inv) { return inv.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function pInvoicePaidAmount(invId) { return paymentsOut.filter((p) => p.pInvoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function pInvoiceReturnedAmount(invId) { return pReturns.filter((r) => r.pInvoiceId === invId).reduce((s, r) => s + r.items.reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  function pInvoiceSisa(inv) { return Math.max(0, pInvoiceTotal(inv) - pInvoiceReturnedAmount(inv.id) - pInvoicePaidAmount(inv.id)); }

  function invoiceTotal(inv) { return inv.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function soDPAmount(soId) { return paymentsIn.filter((p) => p.soId === soId && p.type === "DP").reduce((s, p) => s + p.amount, 0); }
  function invoicePaidAmount(invId) { return paymentsIn.filter((p) => p.invoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function invoiceReturnedAmount(invId) { return returns.filter((r) => r.invoiceId === invId).reduce((s, r) => s + r.items.reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  function poPaidAmount(poId) { return paymentsOut.filter((p) => p.poId === poId).reduce((s, p) => s + p.amount, 0); }
  function batchCost(batchId) { const b = batches.find((x) => x.id === batchId); return b ? b.costPrice : 0; }
  function soCOGS(soId) {
    return deliveryNotes.filter((dn) => dn.soId === soId).reduce((s, dn) => s + dn.items.reduce((s2, it) => s2 + (it.allocations || []).reduce((s3, a) => s3 + a.qty * batchCost(a.batchId), 0), 0), 0);
  }
  function invoiceSisa(inv) {
    return Math.max(0, invoiceTotal(inv) - invoiceReturnedAmount(inv.id) - soDPAmount(inv.soId) - invoicePaidAmount(inv.id));
  }

  const arOutstanding = useMemo(() => invoices.reduce((s, inv) => s + invoiceSisa(inv), 0), [invoices, returns, paymentsIn]);
  const apOutstanding = useMemo(() => pInvoices.reduce((s, inv) => s + pInvoiceSisa(inv), 0), [pInvoices, pReturns, paymentsOut]);
  const cashInMonth = useMemo(() => paymentsIn.filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0), [paymentsIn]);
  const cashOutMonth = useMemo(() => {
    const out = paymentsOut.filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0);
    const exp = expenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0);
    return out + exp;
  }, [paymentsOut, expenses]);
  const grossProfitMonth = useMemo(() => {
    return invoices.filter((inv) => isThisMonth(inv.date)).reduce((s, inv) => s + (invoiceTotal(inv) - invoiceReturnedAmount(inv.id) - soCOGS(inv.soId)), 0);
  }, [invoices, batches, deliveryNotes, returns]);
  const expensesMonth = useMemo(() => expenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0), [expenses]);

  function allocateFEFO(productId, qty) {
    const avail = batches.filter((b) => b.productId === productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    let remaining = qty;
    const allocations = [];
    for (const b of avail) {
      if (remaining <= 0) break;
      const take = Math.min(b.qty, remaining);
      allocations.push({ batchId: b.id, batchNo: b.batchNo, qty: take });
      remaining -= take;
    }
    return { allocations, shortfall: remaining };
  }

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "products", label: "Produk", icon: Package },
    { id: "stock", label: "Stok & Batch", icon: Boxes },
    { id: "suppliers", label: "Supplier", icon: Truck },
    { id: "customers", label: "Pelanggan", icon: Users },
    { id: "purchases", label: "Pembelian", icon: ClipboardList },
    { id: "sales", label: "Penjualan", icon: ShoppingCart },
    { id: "finance", label: "Finance", icon: Wallet },
    { id: "reports", label: "Laporan", icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 gap-2" style={{ color: COLOR.inkSoft }}>
        <Loader2 className="animate-spin" size={18} /> Memuat data...
      </div>
    );
  }

  return (
    <div style={{ background: COLOR.bg, minHeight: "600px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }} className="flex rounded-2xl overflow-hidden">
      {/* CSS PRINTING DENGAN IMPORT GOOGLE FONT INTER 400 & 700 UNTUK MENGELIMINASI FONT-WEIGHT INTERMEDIT (500/600) */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

        @media print {
          .no-print, .no-print * {
            display: none !important;
          }
          .modal-backdrop {
            position: static !important;
            background: none !important;
            padding: 0 !important;
          }
          .modal-content {
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          #printable-invoice {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-family: 'Inter', Arial, Helvetica, sans-serif !important;
          }
          #printable-invoice * {
            font-family: inherit !important;
            font-weight: 400 !important;
          }
          #printable-invoice .font-bold,
          #printable-invoice strong,
          #printable-invoice b {
            font-weight: 700 !important;
          }
        }
      `}</style>

      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col py-5 px-3 no-print" style={{ background: COLOR.primary }}>
        <div className="px-2 mb-6">
          <div className="text-white font-semibold text-sm leading-tight">PT Wiryatama Putera Mandiri</div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#8FC2C0" }}>ERP SYSTEM</div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono" style={{ color: syncState === "error" ? "#F0A69B" : "#8FC2C0" }}>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: syncState === "error" ? "#E07A6C" : syncState === "syncing" ? "#F5C089" : "#7FCBA4" }}
            />
            {syncState === "syncing" ? "Menyinkron..." : syncState === "error" ? "Gagal sinkron" : `Tersinkron ${new Date(lastSync).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors"
                style={{ background: active ? "rgba(255,255,255,0.12)" : "transparent", color: active ? "#fff" : "#B7D6D4" }}
              >
                <Icon size={16} /> {n.label}
              </button>
            );
          })}
        </div>
        <div className="mt-auto px-2 pt-4">
          {(lowStock.length > 0 || nearExpiry.length > 0 || expired.length > 0) && (
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.08)" }}>
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
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="text-[11px] font-mono truncate" style={{ color: "#8FC2C0" }} title={userEmail}>{userEmail}</div>
              <button onClick={onLogout} className="flex items-center gap-1 text-[11px] shrink-0" style={{ color: "#B7D6D4" }} title="Keluar">
                <LogOut size={12} /> Keluar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 p-6 overflow-y-auto max-h-[85vh] main-container">
        <div className="no-print">
          {tab === "dashboard" && (
            <Dashboard {...{ products, batches, pos, sos, suppliers, customers, stockByProduct, lowStock, nearExpiry, expired, totalStockValue, findName, arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth }} />
          )}
          {tab === "products" && (
            <ProductsView products={products} save={persist.products} stockByProduct={stockByProduct} notify={notify} />
          )}
          {tab === "stock" && (
            <StockView products={products} batches={batches} stockByProduct={stockByProduct} />
          )}
          {tab === "suppliers" && (
            <SuppliersView suppliers={suppliers} save={persist.suppliers} notify={notify} />
          )}
          {tab === "customers" && (
            <CustomersView customers={customers} save={persist.customers} notify={notify} />
          )}
          {tab === "purchases" && (
            <PurchasesView
              products={products} suppliers={suppliers} pos={pos} batches={batches}
              pReceipts={pReceipts} pInvoices={pInvoices} pReturns={pReturns} paymentsOut={paymentsOut}
              savePOs={persist.pos} saveBatches={persist.batches} savePReceipts={persist.pReceipts}
              savePInvoices={persist.pInvoices} savePReturns={persist.pReturns} findName={findName} notify={notify}
              poTotal={poTotal} pInvoiceTotal={pInvoiceTotal} pInvoicePaidAmount={pInvoicePaidAmount} pInvoiceReturnedAmount={pInvoiceReturnedAmount} pInvoiceSisa={pInvoiceSisa}
              stockByProduct={stockByProduct}
            />
          )}
        </div>

        {tab === "sales" && (
          <SalesView
            products={products} customers={customers} sos={sos} batches={batches}
            deliveryNotes={deliveryNotes} invoices={invoices} returns={returns} paymentsIn={paymentsIn}
            saveSOs={persist.sos} saveBatches={persist.batches} saveDeliveryNotes={persist.deliveryNotes}
            saveInvoices={persist.invoices} saveReturns={persist.returns} allocateFEFO={allocateFEFO}
            findName={findName} notify={notify} stockByProduct={stockByProduct}
            soTotal={soTotal} invoiceTotal={invoiceTotal} soDPAmount={soDPAmount}
            invoicePaidAmount={invoicePaidAmount} invoiceReturnedAmount={invoiceReturnedAmount}
          />
        )}

        <div className="no-print">
          {tab === "finance" && (
            <FinanceView
              {...{ pos, sos, suppliers, customers, batches, invoices, pInvoices, pReturns, returns, paymentsOut, paymentsIn, expenses, findName, notify }}
              savePaymentsOut={persist.paymentsOut} savePaymentsIn={persist.paymentsIn} saveExpenses={persist.expenses}
              arOutstanding={arOutstanding} apOutstanding={apOutstanding} cashInMonth={cashInMonth} cashOutMonth={cashOutMonth}
              grossProfitMonth={grossProfitMonth} expensesMonth={expensesMonth}
              invoiceTotal={invoiceTotal} soDPAmount={soDPAmount} invoicePaidAmount={invoicePaidAmount} invoiceReturnedAmount={invoiceReturnedAmount} invoiceSisa={invoiceSisa}
              pInvoiceTotal={pInvoiceTotal} pInvoicePaidAmount={pInvoicePaidAmount} pInvoiceReturnedAmount={pInvoiceReturnedAmount} pInvoiceSisa={pInvoiceSisa}
            />
          )}
          {tab === "reports" && (
            <ReportsView products={products} suppliers={suppliers} customers={customers} pos={pos} sos={sos} findName={findName} />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg no-print" style={{ background: toast.tone === "danger" ? COLOR.danger : COLOR.primary, color: "#fff" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ products, pos, sos, stockByProduct, lowStock, nearExpiry, expired, totalStockValue, findName, suppliers, customers, arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth }) {
  const recentPOs = [...pos].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentSOs = [...sos].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const netCashMonth = cashInMonth - cashOutMonth;
  return (
    <div>
      <Eyebrow>Ringkasan bisnis</Eyebrow>
      <h2 className="text-xl font-semibold mb-5" style={{ color: COLOR.ink }}>Dashboard</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total SKU</div>
          <div className="text-2xl font-mono font-semibold" style={{ color: COLOR.ink }}>{products.length}</div>
        </Card>
        <Card>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Nilai Stok</div>
          <div className="text-2xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(totalStockValue)}</div>
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
        <Card style={{ borderColor: netCashMonth >= 0 ? COLOR.good : COLOR.danger }}>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Laba Kotor</div>
          <div className="text-lg font-mono font-semibold" style={{ color: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>{fmtIDR(grossProfitMonth)}</div>
        </Card>
      </div>

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
              const p = products.find((x) => x.id === b.productId);
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

// ---------- Products ----------
function ProductsView({ products, save, stockByProduct, notify }) {
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "" });

  function openNew() { setForm({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "" }); setModal("new"); }
  function openEdit(p) { setForm(p); setModal(p.id); }

  async function submit() {
    if (!form.name.trim()) return notify("Nama produk wajib diisi", "danger");
    const payload = { ...form, sellPrice: Number(form.sellPrice) || 0, minStock: Number(form.minStock) || 0 };
    if (modal === "new") {
      await save([...products, { ...payload, id: uid() }]);
      notify("Produk ditambahkan");
    } else {
      await save(products.map((p) => (p.id === modal ? { ...payload, id: p.id } : p)));
      notify("Produk diperbarui");
    }
    setModal(null);
  }
  async function remove(id) {
    await save(products.filter((p) => p.id !== id));
    notify("Produk dihapus");
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Master data</Eyebrow><h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Produk</h2></div>
        <Button onClick={openNew}><Plus size={15} /> Tambah Produk</Button>
      </div>
      <div className="relative mb-3 max-w-xs">
        <Search size={14} className="absolute left-3 top-2.5" color={COLOR.inkSoft} />
        <TextInput placeholder="Cari produk..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["Nama", "Kategori", "Satuan", "Harga Jual", "Min Stok", "Stok Saat Ini", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const s = stockByProduct[p.id];
              return (
                <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{p.name}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.inkSoft }}>{p.category}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{p.unit}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(p.sellPrice)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{p.minStock}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={s.qty < p.minStock ? "warn" : "good"}>{s.qty} {p.unit}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => openEdit(p)} className="text-xs mr-3 hover:opacity-70" style={{ color: COLOR.accent }}>Edit</button>
                    <button onClick={() => remove(p.id)} className="text-xs hover:opacity-70" style={{ color: COLOR.danger }}>Hapus</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada produk.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal && (
        <Modal title={modal === "new" ? "Tambah Produk" : "Edit Produk"} onClose={() => setModal(null)}>
          <Field label="Nama produk"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Kategori">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Satuan (mis. box, strip, pcs)"><TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="Harga jual (per satuan)"><TextInput type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} /></Field>
          <Field label="Stok minimum (alert)"><TextInput type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></Field>
          <Button onClick={submit} className="w-full justify-center mt-2">Simpan</Button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Stock & Batch ----------
function StockView({ products, batches, stockByProduct }) {
  return (
    <div>
      <Eyebrow>Traceability</Eyebrow>
      <h2 className="text-xl font-semibold mb-1" style={{ color: COLOR.ink }}>Stok & Batch</h2>
      <p className="text-sm mb-5" style={{ color: COLOR.inkSoft }}>Ribbon menunjukkan sebaran batch per produk berdasarkan urgensi expiry — hijau aman, kuning &lt;90 hari, merah &lt;30 hari / kedaluwarsa. Alokasi penjualan otomatis mengikuti FEFO (First-Expire-First-Out).</p>

      <div className="flex flex-col gap-3">
        {products.map((p) => {
          const s = stockByProduct[p.id];
          const sortedBatches = [...s.batches].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
          return (
            <Card key={p.id}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-sm" style={{ color: COLOR.ink }}>{p.name}</div>
                  <div className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>{s.qty} {p.unit} · nilai {fmtIDR(s.value)}</div>
                </div>
              </div>
              <ExpiryRibbon productBatches={s.batches} />
              {sortedBatches.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sortedBatches.map((b) => {
                    const u = urgencyOf(b.expiryDate);
                    return (
                      <span key={b.id} className="text-[11px] font-mono px-2 py-1 rounded-md" style={{ background: COLOR.bg, color: COLOR.inkSoft, border: `1px solid ${COLOR.border}` }}>
                        {b.batchNo} · {b.qty}{p.unit} · exp {fmtDate(b.expiryDate)} · <span style={{ color: u.color }}>{u.label}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
        {products.length === 0 && <div className="text-sm py-8 text-center" style={{ color: COLOR.inkSoft }}>Tambahkan produk terlebih dahulu.</div>}
      </div>
    </div>
  );
}

// ---------- Suppliers ----------
function SuppliersView({ suppliers, save, notify }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", contact: "", address: "" });
  function openNew() { setForm({ name: "", contact: "", address: "" }); setModal("new"); }
  function openEdit(s) { setForm(s); setModal(s.id); }
  async function submit() {
    if (!form.name.trim()) return notify("Nama supplier wajib diisi", "danger");
    if (modal === "new") { await save([...suppliers, { ...form, id: uid() }]); notify("Supplier ditambahkan"); }
    else { await save(suppliers.map((s) => (s.id === modal ? { ...form, id: s.id } : s))); notify("Supplier diperbarui"); }
    setModal(null);
  }
  async function remove(id) { await save(suppliers.filter((s) => s.id !== id)); notify("Supplier dihapus"); }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Master data</Eyebrow><h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Supplier / PBF</h2></div>
        <Button onClick={openNew}><Plus size={15} /> Tambah Supplier</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {suppliers.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: COLOR.ink }}>{s.name}</div>
                <div className="text-xs mt-1" style={{ color: COLOR.inkSoft }}>{s.contact}</div>
                <div className="text-xs" style={{ color: COLOR.inkSoft }}>{s.address}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(s)} className="text-xs" style={{ color: COLOR.accent }}>Edit</button>
                <button onClick={() => remove(s.id)} className="text-xs" style={{ color: COLOR.danger }}>Hapus</button>
              </div>
            </div>
          </Card>
        ))}
        {suppliers.length === 0 && <div className="text-sm py-8 col-span-2 text-center" style={{ color: COLOR.inkSoft }}>Belum ada supplier.</div>}
      </div>
      {modal && (
        <Modal title={modal === "new" ? "Tambah Supplier" : "Edit Supplier"} onClose={() => setModal(null)}>
          <Field label="Nama supplier / PBF"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Kontak (telp/email)"><TextInput value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          <Field label="Alamat"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Button onClick={submit} className="w-full justify-center mt-2">Simpan</Button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Customers ----------
function CustomersView({ customers, save, notify }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: CUSTOMER_TYPES[0], contact: "", address: "" });
  function openNew() { setForm({ name: "", type: CUSTOMER_TYPES[0], contact: "", address: "" }); setModal("new"); }
  function openEdit(c) { setForm(c); setModal(c.id); }
  async function submit() {
    if (!form.name.trim()) return notify("Nama pelanggan wajib diisi", "danger");
    if (modal === "new") { await save([...customers, { ...form, id: uid() }]); notify("Pelanggan ditambahkan"); }
    else { await save(customers.map((c) => (c.id === modal ? { ...form, id: c.id } : c))); notify("Pelanggan diperbarui"); }
    setModal(null);
  }
  async function remove(id) { await save(customers.filter((c) => c.id !== id)); notify("Pelanggan dihapus"); }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Master data</Eyebrow><h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Pelanggan</h2></div>
        <Button onClick={openNew}><Plus size={15} /> Tambah Pelanggan</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {customers.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: COLOR.ink }}>{c.name}</div>
                <Badge tone="neutral">{c.type}</Badge>
                <div className="text-xs mt-1" style={{ color: COLOR.inkSoft }}>{c.contact}</div>
                <div className="text-xs" style={{ color: COLOR.inkSoft }}>{c.address}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(c)} className="text-xs" style={{ color: COLOR.accent }}>Edit</button>
                <button onClick={() => remove(c.id)} className="text-xs" style={{ color: COLOR.danger }}>Hapus</button>
              </div>
            </div>
          </Card>
        ))}
        {customers.length === 0 && <div className="text-sm py-8 col-span-2 text-center" style={{ color: COLOR.inkSoft }}>Belum ada pelanggan.</div>}
      </div>
      {modal && (
        <Modal title={modal === "new" ? "Tambah Pelanggan" : "Edit Pelanggan"} onClose={() => setModal(null)}>
          <Field label="Nama pelanggan"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Tipe">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Kontak (telp/email)"><TextInput value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          <Field label="Alamat"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Button onClick={submit} className="w-full justify-center mt-2">Simpan</Button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Purchases ----------
function PurchasesView({
  products, suppliers, pos, batches, pReceipts, pInvoices, pReturns, paymentsOut,
  savePOs, saveBatches, savePReceipts, savePInvoices, savePReturns, findName, notify,
  poTotal, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa, stockByProduct
}) {
  const [subTab, setSubTab] = useState("po");

  function receivedQty(poId, productId) {
    return pReceipts.filter((pr) => pr.poId === poId).reduce((s, pr) => {
      const it = pr.items.find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function getPOStatus(po) {
    if (pInvoices.some((inv) => inv.poId === po.id)) return "invoiced";
    const prs = pReceipts.filter((pr) => pr.poId === po.id);
    const fullyReceived = po.items.every((it) => receivedQty(po.id, it.productId) >= it.qty);
    if (prs.length === 0) return "ordered";
    if (!fullyReceived) return "partially_received";
    return "ready_to_invoice";
  }

  const STATUS_LABEL = {
    ordered: { label: "Dipesan", tone: "warn" },
    partially_received: { label: "Sebagian Diterima", tone: "warn" },
    ready_to_invoice: { label: "Siap Difaktur", tone: "good" },
    invoiced: { label: "Sudah Difaktur", tone: "good" },
  };

  const SUBNAV = [
    { id: "po", label: `Purchase Order (${pos.length})` },
    { id: "bpb", label: `Penerimaan Barang (${pReceipts.length})` },
    { id: "faktur", label: `Faktur Pembelian (${pInvoices.length})` },
    { id: "retur", label: `Retur Pembelian (${pReturns.length})` },
  ];

  return (
    <div>
      <Eyebrow>Transaksi</Eyebrow>
      <h2 className="text-xl font-semibold mb-1" style={{ color: COLOR.ink }}>Pembelian</h2>
      <p className="text-sm mb-4" style={{ color: COLOR.inkSoft }}>
        Alur: Purchase Order (PO) → Penerimaan Barang (Stok masuk & Batch) → Faktur Pembelian → Retur (bila ada).
      </p>

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

      {subTab === "po" && (
        <POTab {...{ products, suppliers, pos, pReceipts, savePOs, findName, notify, poTotal, getPOStatus, STATUS_LABEL, stockByProduct }} />
      )}
      {subTab === "bpb" && (
        <BPBTab {...{ products, suppliers, pos, batches, pReceipts, pInvoices, saveBatches, savePOs, savePReceipts, findName, notify, getPOStatus, receivedQty }} />
      )}
      {subTab === "faktur" && (
        <FakturPembelianTab {...{ products, suppliers, pos, pReceipts, pInvoices, paymentsOut, pReturns, savePInvoices, findName, notify, getPOStatus, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa }} />
      )}
      {subTab === "retur" && (
        <ReturPembelianTab {...{ products, suppliers, pos, pInvoices, pReturns, pReceipts, batches, saveBatches, savePReturns, findName, notify, pInvoiceTotal, pInvoiceReturnedAmount }} />
      )}
    </div>
  );
}

function POTab({ products, suppliers, pos, pReceipts, savePOs, findName, notify, poTotal, getPOStatus, STATUS_LABEL, stockByProduct }) {
  const [modal, setModal] = useState(null);
  const [detailPO, setDetailPO] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  function openNew() {
    setSupplierId(suppliers[0]?.id || "");
    setDate(todayISO());
    setItems([]);
    setSearchProd("");
    setModal("new");
  }

  function addProductToPO(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) {
      setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice * 0.7 }]);
    }
  }

  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }
  const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  async function submit() {
    if (!supplierId) return notify("Pilih supplier", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
    const poNumber = `PO-${new Date(date).getFullYear()}-${String(pos.length + 1).padStart(4, "0")}`;
    await savePOs([...pos, { id: uid(), poNumber, supplierId, date, items, status: "ordered" }]);
    notify(`${poNumber} dibuat`);
    setModal(null);
  }

  async function cancelPO(po) {
    if (pReceipts.some((pr) => pr.poId === po.id)) {
      return notify("Gagal membatalkan: PO ini sudah memiliki riwayat Penerimaan Barang. Batalkan Penerimaan terlebih dahulu.", "danger");
    }
    await savePOs(pos.filter((p) => p.id !== po.id));
    notify(`${po.poNumber} berhasil dibatalkan`);
  }

  const filteredProds = products.filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={openNew}><Plus size={15} /> Buat PO</Button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. PO", "Supplier", "Tanggal", "Total", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...pos].sort((a, b) => new Date(b.date) - new Date(a.date)).map((po) => {
              const st = getPOStatus(po);
              const s = STATUS_LABEL[st];
              const canCancel = !pReceipts.some((pr) => pr.poId === po.id);
              return (
                <tr key={po.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{po.poNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, po.supplierId)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(poTotal(po))}</td>
                  <td className="px-4 py-2.5"><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetailPO(po)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                    {canCancel && (
                      <button onClick={() => cancelPO(po)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan PO</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {pos.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada PO.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Purchase Order" onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Supplier / PBF">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal PO">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <div className="mb-4 p-3 rounded-xl border" style={{ background: COLOR.bg, borderColor: COLOR.border }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: COLOR.primary }}>Pilih / Tambah Produk Kebijakan PO</div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5" color={COLOR.inkSoft} />
              <TextInput placeholder="Cari nama produk / kategori untuk ditambahkan..." value={searchProd} onChange={(e) => setSearchProd(e.target.value)} className="pl-8" />
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {filteredProds.map((prod) => {
                const s = stockByProduct[prod.id];
                return (
                  <div key={prod.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs" style={{ borderColor: COLOR.border }}>
                    <div>
                      <span className="font-semibold" style={{ color: COLOR.ink }}>{prod.name}</span>
                      <span className="ml-2 text-[11px] font-mono" style={{ color: COLOR.inkSoft }}>({prod.category}) · Stok: {s?.qty || 0} {prod.unit}</span>
                    </div>
                    <Button variant="ghost" onClick={() => addProductToPO(prod)} className="!py-0.5 !px-2 text-xs">
                      <Plus size={12} /> Tambah
                    </Button>
                  </div>
                );
              })}
              {filteredProds.length === 0 && <div className="text-xs py-2 text-center" style={{ color: COLOR.inkSoft }}>Produk tidak ditemukan.</div>}
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: COLOR.primary }}>Rincian Item Dipesan ({items.length})</div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-4 pr-1">
            {items.map((it, i) => {
              const p = products.find((x) => x.id === it.productId);
              return (
                <div key={i} className="flex gap-2 items-center p-2 rounded-lg bg-white border" style={{ borderColor: COLOR.border }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: COLOR.ink }}>{p?.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: COLOR.inkSoft }}>Subtotal: {fmtIDR(it.qty * it.unitPrice)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>Qty:</span>
                    <TextInput type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-16 text-center" />
                    <span className="text-xs font-mono ml-1" style={{ color: COLOR.inkSoft }}>Harga Beli:</span>
                    <TextInput type="number" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="w-28" />
                    <button onClick={() => removeItem(i)} className="p-1.5 text-red-500 hover:opacity-70"><Trash2 size={16} color={COLOR.danger} /></button>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="text-xs py-6 text-center rounded-lg border border-dashed" style={{ color: COLOR.inkSoft, borderColor: COLOR.border }}>Belum ada item terpilih. Silakan klik tombol "Tambah" pada produk di atas.</div>}
          </div>

          <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: `1px solid ${COLOR.border}` }}>
            <div className="font-mono font-bold text-base" style={{ color: COLOR.ink }}>Total PO: {fmtIDR(total)}</div>
            <Button onClick={submit}>Simpan & Terbitkan PO</Button>
          </div>
        </Modal>
      )}

      {detailPO && (
        <Modal title={`Detail ${detailPO.poNumber}`} onClose={() => setDetailPO(null)} wide>
          <div className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>
            Supplier: {findName(suppliers, detailPO.supplierId)} · Tanggal: {fmtDate(detailPO.date)} · Status: {STATUS_LABEL[getPOStatus(detailPO)].label}
          </div>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty", "Harga Beli", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailPO.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-2" style={{ color: COLOR.ink }}>Total: {fmtIDR(poTotal(detailPO))}</div>
        </Modal>
      )}
    </div>
  );
}

function BPBTab({ products, suppliers, pos, batches, pReceipts, pInvoices, saveBatches, savePOs, savePReceipts, findName, notify, getPOStatus, receivedQty }) {
  const [modal, setModal] = useState(null);
  const [detailPR, setDetailPR] = useState(null);
  const [poId, setPoId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [receiveForm, setReceiveForm] = useState({});

  const eligiblePOs = pos.filter((po) => ["ordered", "partially_received"].includes(getPOStatus(po)));
  const selectedPO = pos.find((x) => x.id === poId);

  function openNew() {
    const firstPO = eligiblePOs[0];
    setPoId(firstPO?.id || "");
    setDate(todayISO());
    if (firstPO) {
      const init = {};
      firstPO.items.forEach((it, idx) => {
        init[idx] = { qty: Math.max(0, it.qty - receivedQty(firstPO.id, it.productId)), batchNo: "", expiryDate: todayISO() };
      });
      setReceiveForm(init);
    } else setReceiveForm({});
    setModal("new");
  }

  function changePO(id) {
    setPoId(id);
    const po = pos.find((x) => x.id === id);
    const init = {};
    if (po) {
      po.items.forEach((it, idx) => {
        init[idx] = { qty: Math.max(0, it.qty - receivedQty(po.id, it.productId)), batchNo: "", expiryDate: todayISO() };
      });
    }
    setReceiveForm(init);
  }

  async function submitBPB() {
    if (!selectedPO) return notify("Pilih PO terlebih dahulu", "danger");
    for (let i = 0; i < selectedPO.items.length; i++) {
      const rf = receiveForm[i];
      if (rf && Number(rf.qty) > 0) {
        if (!rf.batchNo || !rf.expiryDate) {
          return notify("Lengkapi nomor batch dan tanggal expiry untuk semua item yang diterima", "danger");
        }
      }
    }

    const newBatches = [];
    const receivedItems = [];

    selectedPO.items.forEach((it, i) => {
      const rf = receiveForm[i];
      const qtyToRec = Number(rf?.qty) || 0;
      if (qtyToRec > 0) {
        const batchId = uid();
        newBatches.push({
          id: batchId,
          productId: it.productId,
          batchNo: rf.batchNo,
          expiryDate: rf.expiryDate,
          qty: qtyToRec,
          costPrice: it.unitPrice,
          receivedDate: date,
          poId: selectedPO.id,
        });
        receivedItems.push({
          productId: it.productId,
          qty: qtyToRec,
          unitPrice: it.unitPrice,
          batchId: batchId,
          batchNo: rf.batchNo,
          expiryDate: rf.expiryDate,
        });
      }
    });

    if (receivedItems.length === 0) return notify("Isi jumlah barang yang diterima", "danger");

    const noBPB = `BPB-${new Date(date).getFullYear()}-${String(pReceipts.length + 1).padStart(4, "0")}`;
    await saveBatches([...batches, ...newBatches]);
    await savePReceipts([...pReceipts, { id: uid(), noBPB, poId: selectedPO.id, date, items: receivedItems }]);
    notify(`${noBPB} berhasil disimpan, stok batch bertambah`);
    setModal(null);
  }

  async function cancelBPB(pr) {
    if (pInvoices.some((inv) => inv.poId === pr.poId)) {
      return notify("Gagal membatalkan: Faktur Pembelian untuk transaksi ini sudah ada. Batalkan Faktur Pembelian terlebih dahulu.", "danger");
    }

    let working = batches.map((b) => ({ ...b }));
    let shortage = false;

    pr.items.forEach((it) => {
      const b = working.find((x) => x.id === it.batchId || (x.batchNo === it.batchNo && x.productId === it.productId));
      if (b) {
        if (b.qty < it.qty) shortage = true;
        b.qty = Math.max(0, b.qty - it.qty);
      }
    });

    if (shortage) {
      notify("Peringatan: Sebagian barang dari batch ini sudah terpakai transaksi lain. Stok disesuaikan ke 0.", "warn");
    }

    await saveBatches(working);
    await savePReceipts(pReceipts.filter((x) => x.id !== pr.id));
    notify(`${pr.noBPB} berhasil dibatalkan & stok ditarik kembali`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={openNew} disabled={eligiblePOs.length === 0}><Plus size={15} /> Penerimaan Barang (BPB)</Button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. BPB", "PO", "Supplier", "Tanggal Terima", "Item & Batch", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...pReceipts].sort((a, b) => new Date(b.date) - new Date(a.date)).map((pr) => {
              const po = pos.find((x) => x.id === pr.poId);
              const canCancel = !pInvoices.some((inv) => inv.poId === pr.poId);
              return (
                <tr key={pr.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{pr.noBPB}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{po?.poNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{po ? findName(suppliers, po.supplierId) : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(pr.date)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: COLOR.inkSoft }}>
                    {pr.items.map((it) => `${findName(products, it.productId)} (${it.qty} unit - ${it.batchNo})`).join(", ")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetailPR(pr)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                    {canCancel && <button onClick={() => cancelBPB(pr)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan Terima</button>}
                  </td>
                </tr>
              );
            })}
            {pReceipts.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada riwayat Penerimaan Barang.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Penerimaan Barang Supplier (BPB)" onClose={() => setModal(null)} wide>
          {eligiblePOs.length === 0 ? (
            <div className="text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada PO yang aktif/menunggu barang.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Purchase Order (PO)">
                  <Select value={poId} onChange={(e) => changePO(e.target.value)}>
                    {eligiblePOs.map((po) => <option key={po.id} value={po.id}>{po.poNumber} · {findName(suppliers, po.supplierId)}</option>)}
                  </Select>
                </Field>
                <Field label="Tanggal Terima">
                  <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>

              {selectedPO && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Lengkapi Rincian Barang & Batch yang Diterima</div>
                  {selectedPO.items.map((it, i) => {
                    const p = products.find((x) => x.id === it.productId);
                    const remaining = Math.max(0, it.qty - receivedQty(selectedPO.id, it.productId));
                    if (remaining <= 0) return null;
                    return (
                      <div key={i} className="p-3 rounded-lg mb-2 border flex flex-col gap-2" style={{ background: COLOR.bg, borderColor: COLOR.border }}>
                        <div className="text-sm font-medium" style={{ color: COLOR.ink }}>{p?.name} <span className="text-xs font-mono font-normal" style={{ color: COLOR.inkSoft }}>(Sisa pesan: {remaining} {p?.unit})</span></div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] block text-gray-500 font-mono">Qty Diterima</label>
                            <TextInput type="number" value={receiveForm[i]?.qty ?? remaining} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], qty: e.target.value } })} />
                          </div>
                          <div>
                            <label className="text-[10px] block text-gray-500 font-mono">No. Batch</label>
                            <TextInput placeholder="No. Batch" value={receiveForm[i]?.batchNo || ""} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], batchNo: e.target.value } })} />
                          </div>
                          <div>
                            <label className="text-[10px] block text-gray-500 font-mono">Exp Date</label>
                            <TextInput type="date" value={receiveForm[i]?.expiryDate || todayISO()} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], expiryDate: e.target.value } })} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitBPB} className="w-full justify-center mt-3">Simpan BPB & Tambah Stok Batch</Button>
            </>
          )}
        </Modal>
      )}

      {detailPR && (
        <Modal title={`Detail ${detailPR.noBPB}`} onClose={() => setDetailPR(null)} wide>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty Diterima", "No. Batch", "Exp Date"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailPR.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{it.batchNo}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(it.expiryDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

function FakturPembelianTab({ products, suppliers, pos, pReceipts, pInvoices, paymentsOut, pReturns, savePInvoices, findName, notify, getPOStatus, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa }) {
  const [detailInv, setDetailInv] = useState(null);
  const eligiblePOs = pos.filter((po) => getPOStatus(po) === "ready_to_invoice");

  async function createInvoice(po) {
    const prs = pReceipts.filter((pr) => pr.poId === po.id);
    const receivedByProduct = {};
    prs.forEach((pr) => pr.items.forEach((it) => {
      receivedByProduct[it.productId] = (receivedByProduct[it.productId] || 0) + it.qty;
    }));

    const items = po.items
      .map((it) => ({ productId: it.productId, qty: receivedByProduct[it.productId] || 0, unitPrice: it.unitPrice }))
      .filter((it) => it.qty > 0);

    if (items.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");
    const noFaktur = `VINV-${new Date().getFullYear()}-${String(pInvoices.length + 1).padStart(4, "0")}`;
    await savePInvoices([...pInvoices, { id: uid(), noFaktur, poId: po.id, supplierId: po.supplierId, date: todayISO(), items }]);
    notify(`${noFaktur} berhasil diterbitkan`);
  }

  async function cancelInvoice(inv) {
    const paid = pInvoicePaidAmount(inv.id);
    if (paid > 0) {
      return notify("Gagal membatalkan: Faktur ini sudah memiliki riwayat pembayaran ke supplier.", "danger");
    }
    if (pReturns.some((r) => r.pInvoiceId === inv.id)) {
      return notify("Gagal membatalkan: Faktur ini memiliki riwayat retur pembelian. Batalkan retur terlebih dahulu.", "danger");
    }

    await savePInvoices(pInvoices.filter((x) => x.id !== inv.id));
    notify(`${inv.noFaktur} berhasil dibatalkan`);
  }

  return (
    <div>
      {eligiblePOs.length > 0 && (
        <Card className="mb-4">
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>PO Siap Difakturkan Supplier (Barang sudah diterima)</div>
          <div className="flex flex-col gap-2">
            {eligiblePOs.map((po) => (
              <div key={po.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span style={{ color: COLOR.ink }}>{po.poNumber} · {findName(suppliers, po.supplierId)}</span>
                <Button onClick={() => createInvoice(po)}><FileText size={13} /> Terbitkan Faktur Pembelian</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Faktur Vendor", "PO", "Supplier", "Tanggal", "Total Tagihan", "Sisa Hutang", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...pInvoices].sort((a, b) => new Date(b.date) - new Date(a.date)).map((inv) => {
              const po = pos.find((x) => x.id === inv.poId);
              const total = pInvoiceTotal(inv);
              const sisa = pInvoiceSisa(inv);
              const canCancel = pInvoicePaidAmount(inv.id) === 0 && !pReturns.some((r) => r.pInvoiceId === inv.id);
              return (
                <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{po?.poNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, inv.supplierId)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5"><Badge tone={sisa > 0 ? "danger" : "good"}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetailInv(inv)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                    {canCancel && <button onClick={() => cancelInvoice(inv)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan Faktur</button>}
                  </td>
                </tr>
              );
            })}
            {pInvoices.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada Faktur Pembelian.</td></tr>}
          </tbody>
        </table>
      </Card>

      {detailInv && (
        <Modal title={`Detail ${detailInv.noFaktur}`} onClose={() => setDetailInv(null)} wide>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty", "Harga Beli", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailInv.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

function ReturPembelianTab({ products, suppliers, pos, pInvoices, pReturns, pReceipts, batches, saveBatches, savePReturns, findName, notify, pInvoiceTotal, pInvoiceReturnedAmount }) {
  const [modal, setModal] = useState(null);
  const [pInvoiceId, setPInvoiceId] = useState("");
  const [returnQty, setReturnQty] = useState({});

  const returnableInvoices = pInvoices.filter((inv) => pInvoiceReturnedAmount(inv.id) < pInvoiceTotal(inv));
  const selectedInvoice = pInvoices.find((x) => x.id === pInvoiceId);

  function alreadyReturnedQty(invId, productId) {
    return pReturns.filter((r) => r.pInvoiceId === invId).reduce((s, r) => {
      const it = r.items.find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function openNew() {
    setPInvoiceId(returnableInvoices[0]?.id || "");
    setReturnQty({});
    setModal("new");
  }

  async function submitRetur() {
    if (!selectedInvoice) return notify("Pilih Faktur Pembelian terlebih dahulu", "danger");
    const lines = selectedInvoice.items
      .map((it) => ({ ...it, qtyReturn: Number(returnQty[it.productId]) || 0, maxReturn: it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId) }))
      .filter((l) => l.qtyReturn > 0);

    if (lines.length === 0) return notify("Isi jumlah yang ingin diretur", "danger");

    let working = batches.map((b) => ({ ...b }));
    const returnItems = [];

    for (const l of lines) {
      if (l.qtyReturn > l.maxReturn) {
        const p = products.find((x) => x.id === l.productId);
        return notify(`${p?.name}: melebihi sisa barang yang bisa diretur (${l.maxReturn})`, "danger");
      }

      const prs = pReceipts.filter((pr) => pr.poId === selectedInvoice.poId);
      let remainingToDeduct = l.qtyReturn;

      prs.forEach((pr) => {
        pr.items.forEach((rit) => {
          if (rit.productId === l.productId && remainingToDeduct > 0) {
            const b = working.find((x) => x.id === rit.batchId || (x.batchNo === rit.batchNo && x.productId === l.productId));
            if (b && b.qty > 0) {
              const take = Math.min(b.qty, remainingToDeduct);
              b.qty -= take;
              remainingToDeduct -= take;
            }
          }
        });
      });

      returnItems.push({ productId: l.productId, qty: l.qtyReturn, unitPrice: l.unitPrice });
    }

    await saveBatches(working);
    const noRetur = `PRET-${new Date().getFullYear()}-${String(pReturns.length + 1).padStart(4, "0")}`;
    await savePReturns([...pReturns, { id: uid(), noRetur, pInvoiceId: selectedInvoice.id, poId: selectedInvoice.poId, date: todayISO(), items: returnItems }]);
    notify(`${noRetur} berhasil disimpan, stok dikurangi & hutang berkurang`);
    setModal(null);
  }

  async function cancelReturn(ret) {
    let working = batches.map((b) => ({ ...b }));

    const prs = pReceipts.filter((pr) => pr.poId === ret.poId);
    ret.items.forEach((it) => {
      let remainingToAdd = it.qty;
      prs.forEach((pr) => {
        pr.items.forEach((rit) => {
          if (rit.productId === it.productId && remainingToAdd > 0) {
            const b = working.find((x) => x.id === rit.batchId || (x.batchNo === rit.batchNo && x.productId === it.productId));
            if (b) {
              b.qty += remainingToAdd;
              remainingToAdd = 0;
            }
          }
        });
      });
    });

    await saveBatches(working);
    await savePReturns(pReturns.filter((r) => r.id !== ret.id));
    notify(`${ret.noRetur} berhasil dibatalkan`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={openNew} disabled={returnableInvoices.length === 0}><Plus size={15} /> Catat Retur Pembelian</Button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Retur", "Faktur Vendor", "Tanggal", "Nilai Retur", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...pReturns].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r) => {
              const inv = pInvoices.find((x) => x.id === r.pInvoiceId);
              const value = r.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{r.noRetur}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{inv?.noFaktur || "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.good }}>{fmtIDR(value)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => cancelReturn(r)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan Retur</button>
                  </td>
                </tr>
              );
            })}
            {pReturns.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada Retur Pembelian.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Catat Retur Pembelian ke Supplier" onClose={() => setModal(null)} wide>
          {returnableInvoices.length === 0 ? (
            <div className="text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Pembelian yang bisa diretur.</div>
          ) : (
            <>
              <Field label="Pilih Faktur Pembelian">
                <Select value={pInvoiceId} onChange={(e) => { setPInvoiceId(e.target.value); setReturnQty({}); }}>
                  {returnableInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.noFaktur} · {findName(suppliers, inv.supplierId)}</option>)}
                </Select>
              </Field>

              {selectedInvoice && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Isi Qty Barang yang Dikembalikan Ke Supplier</div>
                  {selectedInvoice.items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    const maxReturn = it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId);
                    if (maxReturn <= 0) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2">
                        <div className="flex-1 text-sm" style={{ color: COLOR.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>(maks {maxReturn} {p?.unit})</span></div>
                        <TextInput type="number" value={returnQty[it.productId] || 0} onChange={(e) => setReturnQty({ ...returnQty, [it.productId]: Number(e.target.value) })} className="w-24" />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitRetur} className="w-full justify-center mt-4">Simpan Retur & Potong Stok Batch</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ---------- Sales ----------
function SalesView({
  products, customers, sos, batches, deliveryNotes, invoices, returns, paymentsIn,
  saveSOs, saveBatches, saveDeliveryNotes, saveInvoices, saveReturns, allocateFEFO,
  findName, notify, stockByProduct, soTotal, invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount,
}) {
  const [subTab, setSubTab] = useState("so");

  function shippedQty(soId, productId) {
    return deliveryNotes.filter((dn) => dn.soId === soId).reduce((s, dn) => {
      const it = dn.items.find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }
  function getSOStatus(so) {
    if (invoices.some((inv) => inv.soId === so.id)) return "invoiced";
    const dns = deliveryNotes.filter((dn) => dn.soId === so.id);
    const fullyShipped = so.items.every((it) => shippedQty(so.id, it.productId) >= it.qty);
    if (dns.length === 0) return "open";
    if (!fullyShipped) return "partially_shipped";
    if (dns.some((dn) => dn.status !== "diterima")) return "shipped";
    return "ready_to_invoice";
  }
  const STATUS_LABEL = {
    open: { label: "Baru", tone: "neutral" },
    partially_shipped: { label: "Sebagian Dikirim", tone: "warn" },
    shipped: { label: "Menunggu Konfirmasi Terima", tone: "warn" },
    ready_to_invoice: { label: "Siap Difaktur", tone: "good" },
    invoiced: { label: "Sudah Difaktur", tone: "good" },
  };

  const SUBNAV = [
    { id: "so", label: `Sales Order (${sos.length})` },
    { id: "sj", label: `Surat Jalan (${deliveryNotes.length})` },
    { id: "faktur", label: `Faktur (${invoices.length})` },
    { id: "retur", label: `Retur (${returns.length})` },
  ];

  return (
    <div>
      <div className="no-print">
        <Eyebrow>Transaksi</Eyebrow>
        <h2 className="text-xl font-semibold mb-1" style={{ color: COLOR.ink }}>Penjualan</h2>
        <p className="text-sm mb-4" style={{ color: COLOR.inkSoft }}>
          Alur: Sales Order → Surat Jalan (stok terpotong di sini) → konfirmasi terima → Faktur → Retur (bila ada).
        </p>

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
      </div>

      {subTab === "so" && (
        <SOTab {...{ products, customers, sos, deliveryNotes, saveSOs, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct }} />
      )}
      {subTab === "sj" && (
        <SJTab {...{ products, customers, sos, batches, deliveryNotes, invoices, returns, saveBatches, saveDeliveryNotes, saveReturns, findName, notify, getSOStatus, shippedQty }} />
      )}
      {subTab === "faktur" && (
        <FakturTab {...{ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, saveInvoices, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount }} />
      )}
      {subTab === "retur" && (
        <ReturTab {...{ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount }} />
      )}
    </div>
  );
}

function SOTab({ products, customers, sos, deliveryNotes, saveSOs, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct }) {
  const [modal, setModal] = useState(null);
  const [detailSO, setDetailSO] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  function openNew() {
    setCustomerId(customers[0]?.id || "");
    setDate(todayISO());
    setItems([]);
    setSearchProd("");
    setModal("new");
  }

  function addProductToSO(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) {
      setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice }]);
    }
  }

  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }
  const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  async function submit() {
    if (!customerId) return notify("Pilih pelanggan", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
    const soNumber = `SO-${new Date(date).getFullYear()}-${String(sos.length + 1).padStart(4, "0")}`;
    await saveSOs([...sos, { id: uid(), soNumber, customerId, date, items, status: "open" }]);
    notify(`${soNumber} dibuat`);
    setModal(null);
  }

  async function cancelSO(so) {
    if (deliveryNotes.some((dn) => dn.soId === so.id)) {
      return notify("Gagal membatalkan: SO ini sudah memiliki Surat Jalan. Batalkan Surat Jalan terlebih dahulu.", "danger");
    }
    await saveSOs(sos.filter((s) => s.id !== so.id));
    notify(`${so.soNumber} berhasil dibatalkan`);
  }

  const filteredProds = products.filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew}><Plus size={15} /> Buat SO</Button>
      </div>
      <Card className="!p-0 overflow-hidden no-print">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. SO", "Pelanggan", "Tanggal", "Total", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...sos].sort((a, b) => new Date(b.date) - new Date(a.date)).map((so) => {
              const st = getSOStatus(so);
              const s = STATUS_LABEL[st];
              const canCancel = !deliveryNotes.some((dn) => dn.soId === so.id);
              return (
                <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(soTotal(so))}</td>
                  <td className="px-4 py-2.5"><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetailSO(so)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                    {canCancel && (
                      <button onClick={() => cancelSO(so)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan SO</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sos.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada SO.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Sales Order (SO)" onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Pelanggan">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal SO">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <div className="mb-4 p-3 rounded-xl border" style={{ background: COLOR.bg, borderColor: COLOR.border }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: COLOR.primary }}>Pilih / Tambah Produk Pesanan</div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5" color={COLOR.inkSoft} />
              <TextInput placeholder="Cari nama produk / kategori..." value={searchProd} onChange={(e) => setSearchProd(e.target.value)} className="pl-8" />
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {filteredProds.map((prod) => {
                const s = stockByProduct[prod.id];
                return (
                  <div key={prod.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs" style={{ borderColor: COLOR.border }}>
                    <div>
                      <span className="font-semibold" style={{ color: COLOR.ink }}>{prod.name}</span>
                      <span className="ml-2 text-[11px] font-mono" style={{ color: COLOR.inkSoft }}>({prod.category}) · Stok: {s?.qty || 0} {prod.unit}</span>
                    </div>
                    <Button variant="ghost" onClick={() => addProductToSO(prod)} className="!py-0.5 !px-2 text-xs">
                      <Plus size={12} /> Tambah
                    </Button>
                  </div>
                );
              })}
              {filteredProds.length === 0 && <div className="text-xs py-2 text-center" style={{ color: COLOR.inkSoft }}>Produk tidak ditemukan.</div>}
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: COLOR.primary }}>Rincian Item Dipesan ({items.length})</div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-4 pr-1">
            {items.map((it, i) => {
              const p = products.find((x) => x.id === it.productId);
              const s = stockByProduct[it.productId];
              const isStockShort = s && s.qty < it.qty;
              return (
                <div key={i} className="flex gap-2 items-center p-2 rounded-lg bg-white border" style={{ borderColor: isStockShort ? COLOR.warn : COLOR.border }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: COLOR.ink }}>{p?.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: isStockShort ? COLOR.danger : COLOR.inkSoft }}>
                      Stok tersedia: {s?.qty || 0} {p?.unit} · Subtotal: {fmtIDR(it.qty * it.unitPrice)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>Qty:</span>
                    <TextInput type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-16 text-center" />
                    <span className="text-xs font-mono ml-1" style={{ color: COLOR.inkSoft }}>Harga Jual:</span>
                    <TextInput type="number" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="w-28" />
                    <button onClick={() => removeItem(i)} className="p-1.5 text-red-500 hover:opacity-70"><Trash2 size={16} color={COLOR.danger} /></button>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="text-xs py-6 text-center rounded-lg border border-dashed" style={{ color: COLOR.inkSoft, borderColor: COLOR.border }}>Belum ada item terpilih. Silakan klik tombol "Tambah" pada produk di atas.</div>}
          </div>

          <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: `1px solid ${COLOR.border}` }}>
            <div className="font-mono font-bold text-base" style={{ color: COLOR.ink }}>Total SO: {fmtIDR(total)}</div>
            <Button onClick={submit}>Simpan & Konfirmasi SO</Button>
          </div>
        </Modal>
      )}

      {detailSO && (
        <Modal title={`Detail ${detailSO.soNumber}`} onClose={() => setDetailSO(null)} wide>
          <div className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>
            Pelanggan: {findName(customers, detailSO.customerId)} · Tanggal: {fmtDate(detailSO.date)} · Status: {STATUS_LABEL[getSOStatus(detailSO)].label}
          </div>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty", "Harga Jual", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailSO.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-2" style={{ color: COLOR.ink }}>Total: {fmtIDR(soTotal(detailSO))}</div>
        </Modal>
      )}
    </div>
  );
}

function SJTab({ products, customers, sos, batches, deliveryNotes, invoices, returns, saveBatches, saveDeliveryNotes, saveReturns, findName, notify, getSOStatus, shippedQty }) {
  const [modal, setModal] = useState(null);
  const [detailDN, setDetailDN] = useState(null);
  const [soId, setSoId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [shipQty, setShipQty] = useState({});
  const [receiveForm, setReceiveForm] = useState({});

  const eligibleSOs = sos.filter((so) => ["open", "partially_shipped"].includes(getSOStatus(so)));
  const selectedSO = sos.find((x) => x.id === soId);

  function openNew() {
    const firstSO = eligibleSOs[0];
    setSoId(firstSO?.id || "");
    setDate(todayISO());
    if (firstSO) {
      const init = {};
      firstSO.items.forEach((it) => { init[it.productId] = Math.max(0, it.qty - shippedQty(firstSO.id, it.productId)); });
      setShipQty(init);
    } else setShipQty({});
    setModal("new");
  }
  function changeSO(id) {
    setSoId(id);
    const so = sos.find((x) => x.id === id);
    const init = {};
    if (so) so.items.forEach((it) => { init[it.productId] = Math.max(0, it.qty - shippedQty(so.id, it.productId)); });
    setShipQty(init);
  }

  async function submitSJ() {
    if (!selectedSO) return notify("Pilih SO terlebih dahulu", "danger");
    const lines = selectedSO.items
      .map((it) => ({ productId: it.productId, qty: Number(shipQty[it.productId]) || 0, maxQty: Math.max(0, it.qty - shippedQty(selectedSO.id, it.productId)) }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) return notify("Isi jumlah yang mau dikirim", "danger");
    for (const l of lines) {
      if (l.qty > l.maxQty) {
        const p = products.find((x) => x.id === l.productId);
        return notify(`${p?.name}: melebihi sisa yang belum dikirim (${l.maxQty})`, "danger");
      }
    }
    let working = batches.map((b) => ({ ...b }));
    const shortages = [];
    const itemsWithAlloc = [];
    for (const l of lines) {
      const avail = working.filter((b) => b.productId === l.productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      let remaining = l.qty;
      const allocations = [];
      for (const b of avail) {
        if (remaining <= 0) break;
        const take = Math.min(b.qty, remaining);
        allocations.push({ batchId: b.id, batchNo: b.batchNo, qty: take });
        b.qty -= take;
        remaining -= take;
      }
      if (remaining > 0) {
        const p = products.find((x) => x.id === l.productId);
        shortages.push(`${p?.name}: kurang ${remaining} ${p?.unit}`);
      }
      itemsWithAlloc.push({ productId: l.productId, qty: l.qty, allocations });
    }
    if (shortages.length > 0) return notify("Stok tidak cukup — " + shortages.join(", "), "danger");

    const noSJ = `SJ-${new Date(date).getFullYear()}-${String(deliveryNotes.length + 1).padStart(4, "0")}`;
    await saveBatches(working);
    await saveDeliveryNotes([...deliveryNotes, { id: uid(), noSJ, soId: selectedSO.id, date, items: itemsWithAlloc, status: "dikirim" }]);
    notify(`${noSJ} dibuat, stok terpotong`);
    setModal(null);
  }

  function openReceive(dn) {
    const init = {};
    dn.items.forEach((it, i) => { init[i] = it.qty; });
    setReceiveForm(init);
    setModal({ receive: dn });
  }

  async function submitReceive(dn) {
    let working = batches.map((b) => ({ ...b }));
    const newReturnItems = [];
    const updatedItems = dn.items.map((it, i) => {
      const receivedQty = Math.max(0, Math.min(it.qty, Number(receiveForm[i]) || 0));
      const shortfall = it.qty - receivedQty;
      if (shortfall > 0) {
        let remaining = shortfall;
        const restocked = [];
        for (let a = it.allocations.length - 1; a >= 0 && remaining > 0; a--) {
          const alloc = it.allocations[a];
          const take = Math.min(alloc.qty, remaining);
          const b = working.find((x) => x.id === alloc.batchId);
          if (b) { b.qty += take; restocked.push({ batchId: alloc.batchId, batchNo: alloc.batchNo, qty: take }); }
          remaining -= take;
        }
        const so = sos.find((s) => s.id === dn.soId);
        const unitPrice = so?.items.find((x) => x.productId === it.productId)?.unitPrice || 0;
        newReturnItems.push({ productId: it.productId, qty: shortfall, unitPrice, restockedBatches: restocked });
      }
      return { ...it, receivedQty };
    });
    await saveBatches(working);
    await saveDeliveryNotes(deliveryNotes.map((x) => (x.id === dn.id ? { ...x, items: updatedItems, status: "diterima", receivedDate: todayISO() } : x)));
    if (newReturnItems.length > 0) {
      const noRetur = `RET-${new Date().getFullYear()}-${String(returns.length + 1).padStart(4, "0")}`;
      await saveReturns([...returns, { id: uid(), noRetur, source: "sj", sjId: dn.id, soId: dn.soId, date: todayISO(), items: newReturnItems }]);
      notify(`${dn.noSJ} diterima sebagian — retur ${noRetur} tercatat`, "warn");
    } else {
      notify(`${dn.noSJ} dikonfirmasi diterima lengkap`);
    }
    setModal(null);
  }

  async function cancelSJ(dn) {
    if (invoices.some((inv) => inv.soId === dn.soId)) {
      return notify("Gagal membatalkan: Faktur Penjualan untuk transaksi ini sudah terbit. Batalkan Faktur terlebih dahulu.", "danger");
    }

    let working = batches.map((b) => ({ ...b }));
    dn.items.forEach((it) => {
      (it.allocations || []).forEach((alloc) => {
        const b = working.find((x) => x.id === alloc.batchId);
        if (b) {
          b.qty += alloc.qty;
        }
      });
    });

    await saveBatches(working);
    await saveDeliveryNotes(deliveryNotes.filter((x) => x.id !== dn.id));
    notify(`${dn.noSJ} dibatalkan & stok dikembalikan ke gudang`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew} disabled={eligibleSOs.length === 0}><Plus size={15} /> Buat Surat Jalan</Button>
      </div>
      <Card className="!p-0 overflow-hidden no-print">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. SJ", "SO", "Pelanggan", "Tanggal", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...deliveryNotes].sort((a, b) => new Date(b.date) - new Date(a.date)).map((dn) => {
              const so = sos.find((x) => x.id === dn.soId);
              const canCancel = !invoices.some((inv) => inv.soId === dn.soId);
              return (
                <tr key={dn.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{dn.noSJ}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{so?.soNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{so ? findName(customers, so.customerId) : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(dn.date)}</td>
                  <td className="px-4 py-2.5"><Badge tone={dn.status === "diterima" ? "good" : "warn"}>{dn.status === "diterima" ? "Diterima" : "Dikirim"}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetailDN(dn)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                    {dn.status === "dikirim" && <button onClick={() => openReceive(dn)} className="text-xs mr-3" style={{ color: COLOR.good }}>Konfirmasi Terima</button>}
                    {canCancel && <button onClick={() => cancelSJ(dn)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan SJ</button>}
                  </td>
                </tr>
              );
            })}
            {deliveryNotes.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada Surat Jalan.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Surat Jalan" onClose={() => setModal(null)} wide>
          {eligibleSOs.length === 0 ? (
            <div className="text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada SO yang masih punya sisa barang untuk dikirim.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sales Order">
                  <Select value={soId} onChange={(e) => changeSO(e.target.value)}>
                    {eligibleSOs.map((so) => <option key={so.id} value={so.id}>{so.soNumber} · {findName(customers, so.customerId)}</option>)}
                  </Select>
                </Field>
                <Field label="Tanggal Kirim">
                  <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              {selectedSO && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Jumlah yang dikirim sekarang</div>
                  {selectedSO.items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    const remaining = Math.max(0, it.qty - shippedQty(selectedSO.id, it.productId));
                    if (remaining <= 0) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2">
                        <div className="flex-1 text-sm" style={{ color: COLOR.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>(sisa {remaining} {p?.unit})</span></div>
                        <TextInput type="number" value={shipQty[it.productId] ?? remaining} onChange={(e) => setShipQty({ ...shipQty, [it.productId]: Number(e.target.value) })} className="w-24" />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitSJ} className="w-full justify-center mt-4">Buat Surat Jalan & Potong Stok</Button>
            </>
          )}
        </Modal>
      )}

      {modal?.receive && (
        <Modal title={`Konfirmasi Terima — ${modal.receive.noSJ}`} onClose={() => setModal(null)} wide>
          <p className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>
            Isi jumlah yang benar-benar diterima customer. Kalau kurang dari yang dikirim, sisanya otomatis tercatat sebagai retur & stok dikembalikan.
          </p>
          {modal.receive.items.map((it, i) => {
            const p = products.find((x) => x.id === it.productId);
            return (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="flex-1 text-sm" style={{ color: COLOR.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>(dikirim {it.qty} {p?.unit})</span></div>
                <TextInput type="number" value={receiveForm[i] ?? it.qty} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: Number(e.target.value) })} className="w-24" />
              </div>
            );
          })}
          <Button onClick={() => submitReceive(modal.receive)} className="w-full justify-center mt-2">Konfirmasi</Button>
        </Modal>
      )}

      {detailDN && (
        <Modal title={`Detail ${detailDN.noSJ}`} onClose={() => setDetailDN(null)} wide>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty Dikirim", "Qty Diterima", "Batch"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailDN.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.receivedQty ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{(it.allocations || []).map((a) => a.batchNo).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

function FakturTab({ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, saveInvoices, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount }) {
  const [detailInv, setDetailInv] = useState(null);
  const [printInv, setPrintInv] = useState(null);
  const eligibleSOs = sos.filter((so) => getSOStatus(so) === "ready_to_invoice");

  async function createInvoice(so) {
    const dns = deliveryNotes.filter((dn) => dn.soId === so.id && dn.status === "diterima");
    const receivedByProduct = {};
    dns.forEach((dn) => dn.items.forEach((it) => {
      const q = it.receivedQty ?? it.qty;
      receivedByProduct[it.productId] = (receivedByProduct[it.productId] || 0) + q;
    }));
    const items = so.items
      .map((it) => ({ productId: it.productId, qty: receivedByProduct[it.productId] || 0, unitPrice: it.unitPrice }))
      .filter((it) => it.qty > 0);
    if (items.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");
    const noFaktur = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, "0")}`;
    await saveInvoices([...invoices, { id: uid(), noFaktur, soId: so.id, date: todayISO(), items }]);
    notify(`${noFaktur} dibuat`);
  }

  async function cancelInvoice(inv) {
    const paid = invoicePaidAmount(inv.id);
    if (paid > 0) {
      return notify("Gagal membatalkan: Faktur ini sudah memiliki riwayat pembayaran pelunasan.", "danger");
    }
    if (returns.some((r) => r.invoiceId === inv.id)) {
      return notify("Gagal membatalkan: Faktur ini memiliki transaksi retur. Batalkan retur terlebih dahulu.", "danger");
    }

    await saveInvoices(invoices.filter((x) => x.id !== inv.id));
    notify(`${inv.noFaktur} berhasil dibatalkan`);
  }

  return (
    <div>
      {eligibleSOs.length > 0 && (
        <Card className="mb-4 no-print">
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>SO siap difaktur (barang sudah diterima penuh)</div>
          <div className="flex flex-col gap-2">
            {eligibleSOs.map((so) => (
              <div key={so.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span style={{ color: COLOR.ink }}>{so.soNumber} · {findName(customers, so.customerId)}</span>
                <Button onClick={() => createInvoice(so)}><FileText size={13} /> Buat Faktur</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="!p-0 overflow-hidden no-print">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Faktur", "SO", "Pelanggan", "Tanggal", "Total", "Sisa", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...invoices].sort((a, b) => new Date(b.date) - new Date(a.date)).map((inv) => {
              const so = sos.find((x) => x.id === inv.soId);
              const total = invoiceTotal(inv);
              const sisa = Math.max(0, total - invoiceReturnedAmount(inv.id) - soDPAmount(inv.soId) - invoicePaidAmount(inv.id));
              const canCancel = invoicePaidAmount(inv.id) === 0 && !returns.some((r) => r.invoiceId === inv.id);
              return (
                <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{so?.soNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{so ? findName(customers, so.customerId) : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5"><Badge tone={sisa > 0 ? "warn" : "good"}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</Badge></td>
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-2">
                    <button onClick={() => setPrintInv(inv)} className="text-xs flex items-center gap-1 font-semibold" style={{ color: COLOR.primary }}>
                      <Printer size={13} /> Cetak
                    </button>
                    <button onClick={() => setDetailInv(inv)} className="text-xs" style={{ color: COLOR.accent }}>Detail</button>
                    {canCancel && <button onClick={() => cancelInvoice(inv)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan Faktur</button>}
                  </td>
                </tr>
              );
            })}
            {invoices.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada Faktur.</td></tr>}
          </tbody>
        </table>
      </Card>

      {detailInv && (
        <Modal title={`Detail ${detailInv.noFaktur}`} onClose={() => setDetailInv(null)} wide>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: COLOR.primarySoft }}>{["Produk", "Qty", "Harga", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {detailInv.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}

      {/* MODAL TEMPLATE INVOICE RESMI PRESISI DENGAN PENYESUAIAN FONT LOADING & STABLE WEIGHT */}
      {printInv && (
        <Modal title={`Faktur Penjualan — ${printInv.noFaktur}`} onClose={() => setPrintInv(null)} wide>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button
              onClick={async () => {
                try {
                  if (document.fonts) {
                    await Promise.all([
                      document.fonts.load("400 12px Inter"),
                      document.fonts.load("700 12px Inter"),
                    ]);
                    await document.fonts.ready;
                  }
                } catch (e) {}
                window.print();
              }}
              variant="primary"
            >
              <Printer size={15} /> Cetak Sekarang / Simpan PDF
            </Button>
          </div>

          <div 
            id="printable-invoice" 
            className="p-6 bg-white border rounded-xl text-xs text-gray-800" 
          >
            {/* KOP SURAT */}
            <div className="flex items-start justify-between border-b-2 pb-4 mb-4" style={{ borderColor: COLOR.primary }}>
              <div className="flex items-start gap-3">
                {COMPANY_PROFILE.logoUrl && (
                  <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-12 object-contain" />
                )}
                <div>
                  <div className="text-base uppercase tracking-wide font-bold" style={{ color: COLOR.primary }}>{COMPANY_PROFILE.name}</div>
                  <p className="text-[11px] text-gray-600">{COMPANY_PROFILE.tagline}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{COMPANY_PROFILE.address}</p>
                  <p className="text-[10px] text-gray-500">{COMPANY_PROFILE.contact}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg uppercase tracking-wider text-gray-700 font-bold">FAKTUR PENJUALAN</div>
                <div className="font-mono text-sm mt-1 font-bold" style={{ color: COLOR.primary }}>{printInv.noFaktur}</div>
              </div>
            </div>

            {/* INFORMASI TRANSAKSI */}
            {(() => {
              const so = sos.find((s) => s.id === printInv.soId);
              const cust = customers.find((c) => c.id === so?.customerId);
              const dp = soDPAmount(printInv.soId);
              const paid = invoicePaidAmount(printInv.id);
              const ret = invoiceReturnedAmount(printInv.id);
              const subtotal = invoiceTotal(printInv);
              const sisa = Math.max(0, subtotal - ret - dp - paid);

              return (
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Kepada Yth.</div>
                      <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                      <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                      <div className="text-[11px] text-gray-600">{cust?.contact || "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Detail Dokumen</div>
                      <div><span className="text-gray-500">Tanggal Faktur:</span> <span className="font-mono">{fmtDate(printInv.date)}</span></div>
                      <div><span className="text-gray-500">No. Sales Order:</span> <span className="font-mono">{so?.soNumber || "-"}</span></div>
                      <div><span className="text-gray-500">Tanggal SO:</span> <span className="font-mono">{fmtDate(so?.date)}</span></div>
                    </div>
                  </div>

                  {/* TABEL ITEM */}
                  <table className="w-full text-xs border-collapse mb-6">
                    <thead>
                      <tr className="border-b-2" style={{ background: COLOR.primarySoft, borderColor: COLOR.primary }}>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: COLOR.primary }}>No</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: COLOR.primary }}>Nama Barang / Alkes</th>
                        <th className="py-2 px-2 text-center font-bold" style={{ color: COLOR.primary }}>Qty</th>
                        <th className="py-2 px-2 text-right font-bold" style={{ color: COLOR.primary }}>Harga Satuan</th>
                        <th className="py-2 px-2 text-right font-bold" style={{ color: COLOR.primary }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printInv.items.map((it, idx) => {
                        const p = products.find((x) => x.id === it.productId);
                        return (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-2 font-mono text-gray-500">{idx + 1}</td>
                            <td className="py-2 px-2 text-gray-900">{p?.name || "-"}</td>
                            <td className="py-2 px-2 text-center font-mono">{it.qty} {p?.unit || "unit"}</td>
                            <td className="py-2 px-2 text-right font-mono">{fmtIDR(it.unitPrice)}</td>
                            <td className="py-2 px-2 text-right font-mono font-bold">{fmtIDR(it.qty * it.unitPrice)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* PERHITUNGAN TOTAL */}
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-1/2 p-3 rounded-lg border bg-gray-50 text-[11px]">
                      <div className="text-gray-700 mb-1 font-bold">Catatan Pembayaran:</div>
                      <p className="text-gray-500 leading-relaxed">
                        Pembayaran dapat ditransfer melalui Bank: <b className="font-bold">{COMPANY_PROFILE.bankDetails.bankName}</b><br />
                        No. Rekening: <b className="font-bold">{COMPANY_PROFILE.bankDetails.accountNumber}</b> a.n <b className="font-bold">{COMPANY_PROFILE.bankDetails.accountName}</b>.<br />
                        <span className="italic">{COMPANY_PROFILE.paymentNotes}</span>
                      </p>
                    </div>

                    <div className="w-5/12 text-xs flex flex-col gap-1.5">
                      <div className="flex justify-between py-1 border-b">
                        <span className="text-gray-600">Subtotal Penjualan</span>
                        <span className="font-mono font-bold">{fmtIDR(subtotal)}</span>
                      </div>
                      {dp > 0 && (
                        <div className="flex justify-between py-1 border-b text-emerald-700">
                          <span>Potongan Uang Muka (DP)</span>
                          <span className="font-mono font-bold">- {fmtIDR(dp)}</span>
                        </div>
                      )}
                      {ret > 0 && (
                        <div className="flex justify-between py-1 border-b text-red-600">
                          <span>Potongan Retur Barang</span>
                          <span className="font-mono font-bold">- {fmtIDR(ret)}</span>
                        </div>
                      )}
                      {paid > 0 && (
                        <div className="flex justify-between py-1 border-b text-blue-700">
                          <span>Telah Dibayar (Pelunasan)</span>
                          <span className="font-mono font-bold">- {fmtIDR(paid)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: COLOR.primary, borderColor: COLOR.primary }}>
                        <span>Sisa Tagihan</span>
                        <span className="font-mono">{fmtIDR(sisa)}</span>
                      </div>
                    </div>
                  </div>

                  {/* TANDA TANGAN */}
                  <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                    <div>
                      <p className="text-gray-500 mb-12">Tanda Tangan Penerima / Pelanggan,</p>
                      <p className="underline text-gray-900 font-bold">( {cust?.name || "..........................."} )</p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-12">Hormat Kami ({COMPANY_PROFILE.name}),</p>
                      <p className="underline text-gray-900 font-bold">( Bagian Finance & Kasir )</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReturTab({ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount }) {
  const [modal, setModal] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [returnQty, setReturnQty] = useState({});

  const returnableInvoices = invoices.filter((inv) => invoiceReturnedAmount(inv.id) < invoiceTotal(inv));
  const selectedInvoice = invoices.find((x) => x.id === invoiceId);

  function alreadyReturnedQty(invId, productId) {
    return returns.filter((r) => r.invoiceId === invId).reduce((s, r) => {
      const it = r.items.find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function openNew() {
    setInvoiceId(returnableInvoices[0]?.id || "");
    setReturnQty({});
    setModal("new");
  }

  function restockFromSO(soId, productId, qty, working) {
    const dns = deliveryNotes.filter((dn) => dn.soId === soId && dn.status === "diterima").sort((a, b) => new Date(a.date) - new Date(b.date));
    const allocs = [];
    dns.forEach((dn) => dn.items.forEach((it) => { if (it.productId === productId) allocs.push(...(it.allocations || [])); }));
    let remaining = qty;
    const restocked = [];
    for (let i = allocs.length - 1; i >= 0 && remaining > 0; i--) {
      const a = allocs[i];
      const take = Math.min(a.qty, remaining);
      const b = working.find((x) => x.id === a.batchId);
      if (b) { b.qty += take; restocked.push({ batchId: a.batchId, batchNo: a.batchNo, qty: take }); remaining -= take; }
    }
    return restocked;
  }

  async function submitRetur() {
    if (!selectedInvoice) return notify("Pilih Faktur", "danger");
    const lines = selectedInvoice.items
      .map((it) => ({ ...it, qtyReturn: Number(returnQty[it.productId]) || 0, maxReturn: it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId) }))
      .filter((l) => l.qtyReturn > 0);
    if (lines.length === 0) return notify("Isi jumlah yang mau diretur", "danger");
    for (const l of lines) {
      if (l.qtyReturn > l.maxReturn) {
        const p = products.find((x) => x.id === l.productId);
        return notify(`${p?.name}: melebihi sisa yang bisa diretur (${l.maxReturn})`, "danger");
      }
    }
    let working = batches.map((b) => ({ ...b }));
    const items = lines.map((l) => {
      const restocked = restockFromSO(selectedInvoice.soId, l.productId, l.qtyReturn, working);
      return { productId: l.productId, qty: l.qtyReturn, unitPrice: l.unitPrice, restockedBatches: restocked };
    });
    await saveBatches(working);
    const noRetur = `RET-${new Date().getFullYear()}-${String(returns.length + 1).padStart(4, "0")}`;
    await saveReturns([...returns, { id: uid(), noRetur, source: "faktur", invoiceId: selectedInvoice.id, soId: selectedInvoice.soId, date: todayISO(), items }]);
    notify(`${noRetur} dicatat, stok dikembalikan`);
    setModal(null);
  }

  async function cancelReturn(ret) {
    let working = batches.map((b) => ({ ...b }));
    let shortage = false;

    ret.items.forEach((it) => {
      (it.restockedBatches || []).forEach((r) => {
        const b = working.find((x) => x.id === r.batchId);
        if (b) {
          if (b.qty < r.qty) shortage = true;
          b.qty = Math.max(0, b.qty - r.qty);
        }
      });
    });

    if (shortage) {
      notify("Peringatan: Stok barang sebagian sudah terpakai transaksi lain, stok disesuaikan ke 0.", "warn");
    }

    await saveBatches(working);
    await saveReturns(returns.filter((r) => r.id !== ret.id));
    notify(`${ret.noRetur} berhasil dibatalkan`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew} disabled={returnableInvoices.length === 0}><Plus size={15} /> Catat Retur dari Faktur</Button>
      </div>
      <Card className="!p-0 overflow-hidden no-print">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Retur", "Sumber", "Referensi", "Tanggal", "Nilai", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...returns].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r) => {
              const so = sos.find((x) => x.id === r.soId);
              const inv = invoices.find((x) => x.id === r.invoiceId);
              const value = r.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{r.noRetur}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral">{r.source === "sj" ? "Surat Jalan" : "Faktur"}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{inv?.noFaktur || so?.soNumber || "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(value)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => cancelReturn(r)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan Retur</button>
                  </td>
                </tr>
              );
            })}
            {returns.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada retur.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Catat Retur dari Faktur" onClose={() => setModal(null)} wide>
          {returnableInvoices.length === 0 ? (
            <div className="text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur yang masih bisa diretur.</div>
          ) : (
            <>
              <Field label="Faktur">
                <Select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setReturnQty({}); }}>
                  {returnableInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.noFaktur}</option>)}
                </Select>
              </Field>
              {selectedInvoice && (
                <div className="flex flex-col gap-2 mt-2">
                  {selectedInvoice.items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    const maxReturn = it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId);
                    if (maxReturn <= 0) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2">
                        <div className="flex-1 text-sm" style={{ color: COLOR.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: COLOR.inkSoft }}>(maks {maxReturn} {p?.unit})</span></div>
                        <TextInput type="number" value={returnQty[it.productId] || 0} onChange={(e) => setReturnQty({ ...returnQty, [it.productId]: Number(e.target.value) })} className="w-24" />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitRetur} className="w-full justify-center mt-4">Simpan Retur & Kembalikan Stok</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ---------- Finance ----------
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
      const updated = paymentsIn.map((p) => (p.id === payModal.pay.id ? { ...p, amount: amt, date: payForm.date, method: payForm.method, note: payForm.note } : p));
      await savePaymentsIn(updated);
      notify("Pembayaran masuk diperbarui");
      setPayModal(null);
      return;
    }

    if (payModal.kind === "edit-out") {
      const updated = paymentsOut.map((p) => (p.id === payModal.pay.id ? { ...p, amount: amt, date: payForm.date, method: payForm.method, note: payForm.note } : p));
      await savePaymentsOut(updated);
      notify("Pembayaran keluar diperbarui");
      setPayModal(null);
      return;
    }

    const entry = { id: uid(), amount: amt, date: payForm.date, method: payForm.method, note: payForm.note };
    if (payModal.kind === "invoice") {
      await savePaymentsIn([...paymentsIn, { ...entry, invoiceId: payModal.doc.id, type: "Pelunasan" }]);
      notify(`Pembayaran untuk ${payModal.doc.noFaktur} dicatat`);
    } else if (payModal.kind === "dp") {
      await savePaymentsIn([...paymentsIn, { ...entry, soId: payModal.doc.id, type: "DP" }]);
      notify(`DP untuk ${payModal.doc.soNumber} dicatat`);
    } else if (payModal.kind === "pInvoice") {
      await savePaymentsOut([...paymentsOut, { ...entry, pInvoiceId: payModal.doc.id }]);
      notify(`Pembayaran Faktur Supplier ${payModal.doc.noFaktur} dicatat`);
    }
    setPayModal(null);
  }

  async function deletePaymentIn(id) {
    await savePaymentsIn(paymentsIn.filter((p) => p.id !== id));
    notify("Pembayaran masuk dihapus");
  }

  async function deletePaymentOut(id) {
    await savePaymentsOut(paymentsOut.filter((p) => p.id !== id));
    notify("Pembayaran keluar dihapus");
  }

  async function submitExpense() {
    if (!expForm.amount || Number(expForm.amount) <= 0) return notify("Jumlah biaya harus lebih dari 0", "danger");
    await saveExpenses([...expenses, { id: uid(), ...expForm, amount: Number(expForm.amount) }]);
    notify("Biaya operasional dicatat");
    setExpModal(false);
    setExpForm({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });
  }
  async function removeExpense(id) {
    await saveExpenses(expenses.filter((e) => e.id !== id));
    notify("Biaya dihapus");
  }

  const invoiceARList = invoices.map((inv) => ({ inv, total: invoiceTotal(inv), sisa: invoiceSisa(inv) })).filter((x) => x.sisa > 0);
  const dpOnlySOList = sos.filter((so) => !invoices.some((inv) => inv.soId === so.id) && soDPAmount(so.id) > 0);
  const pInvoiceAPList = pInvoices.map((inv) => ({ inv, total: pInvoiceTotal(inv), sisa: pInvoiceSisa(inv) })).filter((x) => x.sisa > 0);

  const SUBNAV = [
    { id: "ar", label: `Piutang (${invoiceARList.length})` },
    { id: "ap", label: `Hutang (${pInvoiceAPList.length})` },
    { id: "history", label: `Riwayat Pembayaran (${paymentsIn.length + paymentsOut.length})` },
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
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><Receipt size={13} /> Biaya Bulan Ini</div>
          <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(expensesMonth)}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><PiggyBank size={13} /> Laba Kotor Bulan Ini</div>
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
                  const so = sos.find((x) => x.id === inv.soId);
                  return (
                    <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{so ? findName(customers, so.customerId) : "-"}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(total - sisa)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.warn }}>{fmtIDR(sisa)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("invoice", inv)} className="text-xs" style={{ color: COLOR.accent }}>Catat Pembayaran</button></td>
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
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(soDPAmount(so.id))}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("dp", so)} className="text-xs" style={{ color: COLOR.accent }}>Tambah DP</button></td>
                  </tr>
                ))}
                {dpOnlySOList.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada DP yang tercatat untuk SO yang belum difaktur.</td></tr>}
              </tbody>
            </table>
          </Card>
          <div className="flex justify-end mt-2">
            <button onClick={() => setPayModal({ kind: "dp-pick" })} className="text-xs" style={{ color: COLOR.accent }}>+ Catat DP untuk SO lain</button>
          </div>
        </div>
      )}

      {payModal?.kind === "dp-pick" && (
        <Modal title="Catat DP" onClose={() => setPayModal(null)}>
          <Field label="Pilih Sales Order">
            <Select onChange={(e) => { const so = sos.find((x) => x.id === e.target.value); if (so) openPay("dp", so); }} defaultValue="">
              <option value="" disabled>— pilih SO —</option>
              {sos.filter((so) => !invoices.some((inv) => inv.soId === so.id)).map((so) => (
                <option key={so.id} value={so.id}>{so.soNumber} · {findName(customers, so.customerId)}</option>
              ))}
            </Select>
          </Field>
        </Modal>
      )}

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
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, inv.supplierId)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(total - sisa)}</td>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.danger }}>{fmtIDR(sisa)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("pInvoice", inv)} className="text-xs" style={{ color: COLOR.accent }}>Bayar Hutang</button></td>
                </tr>
              ))}
              {pInvoiceAPList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada hutang tersisa — semua Faktur Pembelian sudah lunas.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

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
                {[...paymentsIn].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                  const inv = invoices.find((x) => x.id === p.invoiceId);
                  const so = sos.find((x) => x.id === p.soId);
                  const ref = inv ? inv.noFaktur : so ? so.soNumber : "-";
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5"><Badge tone="good">{p.type || "Pelunasan"}</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.ink }}>{ref}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.good }}>{fmtIDR(p.amount)}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => openEditPay("edit-in", p)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Edit</button>
                        <button onClick={() => deletePaymentIn(p.id)} className="text-xs" style={{ color: COLOR.danger }}>Hapus</button>
                      </td>
                    </tr>
                  );
                })}
                {paymentsIn.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada pembayaran masuk.</td></tr>}
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
                {[...paymentsOut].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                  const inv = pInvoices.find((x) => x.id === p.pInvoiceId);
                  const po = pos.find((x) => x.id === p.poId);
                  const ref = inv ? inv.noFaktur : po ? po.poNumber : "-";
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.ink }}>{ref}</td>
                      <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.danger }}>{fmtIDR(p.amount)}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => openEditPay("edit-out", p)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Edit</button>
                        <button onClick={() => deletePaymentOut(p.id)} className="text-xs" style={{ color: COLOR.danger }}>Hapus</button>
                      </td>
                    </tr>
                  );
                })}
                {paymentsOut.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada pembayaran keluar.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {subTab === "expenses" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setExpModal(true)}><Plus size={15} /> Catat Biaya</Button>
          </div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Tanggal", "Kategori", "Jumlah", "Catatan", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map((e) => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(e.date)}</td>
                    <td className="px-4 py-2.5"><Badge tone="neutral">{e.category}</Badge></td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(e.amount)}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.inkSoft }}>{e.note}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => removeExpense(e.id)} className="text-xs" style={{ color: COLOR.danger }}>Hapus</button></td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada biaya operasional tercatat.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

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

      {expModal && (
        <Modal title="Catat Biaya Operasional" onClose={() => setExpModal(false)}>
          <Field label="Kategori">
            <Select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Jumlah"><TextInput type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} /></Field>
          <Field label="Tanggal"><TextInput type="date" value={expForm.date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Catatan (opsional)"><TextInput value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} /></Field>
          <Button onClick={submitExpense} className="w-full justify-center mt-2">Simpan Biaya</Button>
        </Modal>
      )}
    </div>
  );
}

// ---------- Reports ----------
function ReportsView({ products, suppliers, customers, pos, sos, findName }) {
  const [subTab, setSubTab] = useState("purchases");
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(todayISO());

  function inRange(dateStr) { return dateStr >= start && dateStr <= end; }
  const filteredPOs = useMemo(() => pos.filter((po) => inRange(po.date)), [pos, start, end]);
  const filteredSOs = useMemo(() => sos.filter((so) => inRange(so.date)), [sos, start, end]);

  function aggregateByProduct(docs) {
    const map = {};
    docs.forEach((doc) => {
      doc.items.forEach((it) => {
        if (!map[it.productId]) map[it.productId] = { qty: 0, value: 0 };
        map[it.productId].qty += it.qty;
        map[it.productId].value += it.qty * it.unitPrice;
      });
    });
    return map;
  }
  const purchaseAgg = useMemo(() => aggregateByProduct(filteredPOs), [filteredPOs]);
  const salesAgg = useMemo(() => aggregateByProduct(filteredSOs), [filteredSOs]);
  const purchaseTotal = Object.values(purchaseAgg).reduce((s, x) => s + x.value, 0);
  const salesTotal = Object.values(salesAgg).reduce((s, x) => s + x.value, 0);

  const SUBNAV = [
    { id: "purchases", label: "Pembelian" },
    { id: "sales", label: "Penjualan" },
  ];

  return (
    <div>
      <Eyebrow>Laporan</Eyebrow>
      <h2 className="text-xl font-semibold mb-5" style={{ color: COLOR.ink }}>Laporan Pembelian & Penjualan</h2>

      <div className="flex items-end gap-3 mb-2">
        <Field label="Dari tanggal"><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Sampai tanggal"><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ background: COLOR.primarySoft }}>
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

      {subTab === "purchases" && (
        <div>
          <Card className="mb-4">
            <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Pembelian ({fmtDate(start)} – {fmtDate(end)})</div>
            <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(purchaseTotal)}</div>
          </Card>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Rekap per Produk</div>
          <Card className="!p-0 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Produk", "Qty Dibeli", "Nilai Pembelian"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(purchaseAgg).sort((a, b) => b[1].value - a[1].value).map(([pid, agg]) => {
                  const p = products.find((x) => x.id === pid);
                  return (
                    <tr key={pid} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{agg.qty} {p?.unit}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(agg.value)}</td>
                    </tr>
                  );
                })}
                {Object.keys(purchaseAgg).length === 0 && <tr><td colSpan={3} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada pembelian di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Daftar Transaksi PO</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. PO", "Supplier", "Tanggal", "Total"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...filteredPOs].sort((a, b) => new Date(b.date) - new Date(a.date)).map((po) => (
                  <tr key={po.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{po.poNumber}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, po.supplierId)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(po.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                  </tr>
                ))}
                {filteredPOs.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada PO di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {subTab === "sales" && (
        <div>
          <Card className="mb-4">
            <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Penjualan ({fmtDate(start)} – {fmtDate(end)})</div>
            <div className="text-xl font-mono font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(salesTotal)}</div>
          </Card>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Rekap per Produk</div>
          <Card className="!p-0 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["Produk", "Qty Terjual", "Nilai Penjualan"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(salesAgg).sort((a, b) => b[1].value - a[1].value).map(([pid, agg]) => {
                  const p = products.find((x) => x.id === pid);
                  return (
                    <tr key={pid} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                      <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{agg.qty} {p?.unit}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(agg.value)}</td>
                    </tr>
                  );
                })}
                {Object.keys(salesAgg).length === 0 && <tr><td colSpan={3} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada penjualan di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Daftar Transaksi SO</div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {["No. SO", "Pelanggan", "Tanggal", "Total"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...filteredSOs].sort((a, b) => new Date(b.date) - new Date(a.date)).map((so) => (
                  <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                  </tr>
                ))}
                {filteredSOs.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada SO di periode ini.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
