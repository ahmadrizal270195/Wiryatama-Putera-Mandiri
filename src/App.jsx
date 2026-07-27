import { useState, useEffect, useMemo } from "react";
import { loadKey, saveKey } from "./storage";
import {
  LayoutDashboard, Package, Truck, Users, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Trash2, Search, CheckCircle2, Clock,
  ChevronRight, Boxes, ArrowUpRight, ArrowDownRight, Loader2,
  Wallet, Receipt, CreditCard, PiggyBank, BarChart3, LogOut
} from "lucide-react";

// ---------- constants ----------
const CATEGORIES = ["Obat Generik", "Obat Paten", "Alat Kesehatan", "Vitamin & Suplemen", "Consumables"];
const CUSTOMER_TYPES = ["Apotek", "Rumah Sakit", "Klinik", "Toko Obat", "Distributor Lain"];

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
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const daysUntil = (d) => Math.ceil((new Date(d) - new Date(todayISO())) / (1000 * 60 * 60 * 24));

const KEYS = {
  products: "erp-products",
  suppliers: "erp-suppliers",
  customers: "erp-customers",
  batches: "erp-stock-batches",
  pos: "erp-purchase-orders",
  sos: "erp-sales-orders",
  paymentsOut: "erp-payments-out",
  paymentsIn: "erp-payments-in",
  expenses: "erp-expenses",
};

const EXPENSE_CATEGORIES = ["Sewa Gudang", "Transportasi & Logistik", "Gaji Karyawan", "Utilitas", "Perizinan & Legalitas", "Lainnya"];
const PAYMENT_METHODS = ["Transfer Bank", "Tunai", "Giro/Cek", "Lainnya"];

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// loadKey/saveKey sekarang datang dari ./storage.js (Firestore) — lihat file itu
// untuk versi yang jalan di dalam Claude artifact, ganti isinya kembali ke window.storage.

// ---------- small UI atoms ----------
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
function TextInput(props) {
  return <input {...props} className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} style={inputStyle} />;
}
function Select(props) {
  return <select {...props} className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")} style={inputStyle} />;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,30,28,0.45)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={"rounded-2xl w-full " + (wide ? "max-w-2xl" : "max-w-md") + " max-h-[85vh] overflow-y-auto"}
        style={{ background: COLOR.surface }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
          <h3 className="font-semibold text-base" style={{ color: COLOR.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-60"><X size={18} color={COLOR.inkSoft} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// expiry urgency helper -> used for the batch "ribbon" signature element
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

// ---------- main app ----------
export default function PharmaERP({ userEmail, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [pos, setPOs] = useState([]);
  const [sos, setSOs] = useState([]);
  const [paymentsOut, setPaymentsOut] = useState([]);
  const [paymentsIn, setPaymentsIn] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastSync, setLastSync] = useState(Date.now());
  const [syncState, setSyncState] = useState("ok"); // ok | syncing | error

  async function refreshAll() {
    setSyncState("syncing");
    try {
      const [p, s, c, b, po, so, pout, pin, exp] = await Promise.all([
        loadKey(KEYS.products), loadKey(KEYS.suppliers), loadKey(KEYS.customers),
        loadKey(KEYS.batches), loadKey(KEYS.pos), loadKey(KEYS.sos),
        loadKey(KEYS.paymentsOut), loadKey(KEYS.paymentsIn), loadKey(KEYS.expenses),
      ]);
      const swap = (setter) => (next) => setter((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
      swap(setProducts)(p); swap(setSuppliers)(s); swap(setCustomers)(c); swap(setBatches)(b);
      swap(setPOs)(po); swap(setSOs)(so); swap(setPaymentsOut)(pout); swap(setPaymentsIn)(pin); swap(setExpenses)(exp);
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
    sos: async (list) => { setSOs(list); await saveKey(KEYS.sos, list); },
    paymentsOut: async (list) => { setPaymentsOut(list); await saveKey(KEYS.paymentsOut, list); },
    paymentsIn: async (list) => { setPaymentsIn(list); await saveKey(KEYS.paymentsIn, list); },
    expenses: async (list) => { setExpenses(list); await saveKey(KEYS.expenses, list); },
  };

  // ---- derived data ----
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
  function soPaidAmount(soId) { return paymentsIn.filter((p) => p.soId === soId).reduce((s, p) => s + p.amount, 0); }
  function poPaidAmount(poId) { return paymentsOut.filter((p) => p.poId === poId).reduce((s, p) => s + p.amount, 0); }
  function batchCost(batchId) { const b = batches.find((x) => x.id === batchId); return b ? b.costPrice : 0; }
  function soCOGS(so) {
    return so.items.reduce((s, it) => s + (it.allocations || []).reduce((s2, a) => s2 + a.qty * batchCost(a.batchId), 0), 0);
  }

  const arOutstanding = useMemo(() => sos.reduce((s, so) => s + Math.max(0, soTotal(so) - soPaidAmount(so.id)), 0), [sos, paymentsIn]);
  const apOutstanding = useMemo(() => pos.filter((po) => po.status === "received").reduce((s, po) => s + Math.max(0, poTotal(po) - poPaidAmount(po.id)), 0), [pos, paymentsOut]);
  const cashInMonth = useMemo(() => paymentsIn.filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0), [paymentsIn]);
  const cashOutMonth = useMemo(() => {
    const out = paymentsOut.filter((p) => isThisMonth(p.date)).reduce((s, p) => s + p.amount, 0);
    const exp = expenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0);
    return out + exp;
  }, [paymentsOut, expenses]);
  const grossProfitMonth = useMemo(() => {
    return sos.filter((so) => isThisMonth(so.date)).reduce((s, so) => s + (soTotal(so) - soCOGS(so)), 0);
  }, [sos, batches]);
  const expensesMonth = useMemo(() => expenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0), [expenses]);

  // FEFO allocation
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
    { id: "purchases", label: "Pembelian (PO)", icon: ClipboardList },
    { id: "sales", label: "Penjualan (SO)", icon: ShoppingCart },
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
      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col py-5 px-3" style={{ background: COLOR.primary }}>
        <div className="px-2 mb-6">
          <div className="text-white font-semibold text-sm leading-tight">PT.Wiryatama Putera Mandiri</div>
          <div className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "#8FC2C0" }}>Mini ERP · Tim</div>
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
      <div className="flex-1 p-6 overflow-y-auto max-h-[85vh]">
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
            savePOs={persist.pos} saveBatches={persist.batches} findName={findName} notify={notify}
          />
        )}
        {tab === "sales" && (
          <SalesView
            products={products} customers={customers} sos={sos} batches={batches}
            saveSOs={persist.sos} saveBatches={persist.batches} allocateFEFO={allocateFEFO}
            findName={findName} notify={notify} stockByProduct={stockByProduct}
          />
        )}
        {tab === "finance" && (
          <FinanceView
            {...{ pos, sos, suppliers, customers, batches, paymentsOut, paymentsIn, expenses, findName, notify }}
            savePaymentsOut={persist.paymentsOut} savePaymentsIn={persist.paymentsIn} saveExpenses={persist.expenses}
            arOutstanding={arOutstanding} apOutstanding={apOutstanding} cashInMonth={cashInMonth} cashOutMonth={cashOutMonth}
            grossProfitMonth={grossProfitMonth} expensesMonth={expensesMonth}
          />
        )}
        {tab === "reports" && (
          <ReportsView products={products} suppliers={suppliers} customers={customers} pos={pos} sos={sos} findName={findName} />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg" style={{ background: toast.tone === "danger" ? COLOR.danger : COLOR.primary, color: "#fff" }}>
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

// ---------- Purchases (PO) ----------
function PurchasesView({ products, suppliers, pos, batches, savePOs, saveBatches, findName, notify }) {
  const [modal, setModal] = useState(null); // 'new' | po object for receive | null
  const [detailPO, setDetailPO] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);
  const [receiveForm, setReceiveForm] = useState({});

  function openNew() {
    setSupplierId(suppliers[0]?.id || "");
    setDate(todayISO());
    setItems([]);
    setModal("new");
  }
  function addItem() {
    if (products.length === 0) return notify("Tambahkan produk dahulu", "danger");
    setItems([...items, { productId: products[0].id, qty: 1, unitPrice: products[0].sellPrice * 0.7 }]);
  }
  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }
  const poTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  async function submitPO() {
    if (!supplierId) return notify("Pilih supplier", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item", "danger");
    const poNumber = `PO-${new Date(date).getFullYear()}-${String(pos.length + 1).padStart(4, "0")}`;
    const newPO = { id: uid(), poNumber, supplierId, date, items, status: "ordered" };
    await savePOs([...pos, newPO]);
    notify(`${poNumber} dibuat`);
    setModal(null);
  }

  function openReceive(po) {
    const init = {};
    po.items.forEach((it, idx) => { init[idx] = { batchNo: "", expiryDate: "" }; });
    setReceiveForm(init);
    setModal({ receive: po });
  }
  async function submitReceive(po) {
    for (let i = 0; i < po.items.length; i++) {
      if (!receiveForm[i]?.batchNo || !receiveForm[i]?.expiryDate) return notify("Lengkapi no. batch & tanggal expiry semua item", "danger");
    }
    const newBatches = po.items.map((it, i) => ({
      id: uid(), productId: it.productId, batchNo: receiveForm[i].batchNo, expiryDate: receiveForm[i].expiryDate,
      qty: it.qty, costPrice: it.unitPrice, receivedDate: todayISO(), poId: po.id,
    }));
    await saveBatches([...batches, ...newBatches]);
    await savePOs(pos.map((p) => (p.id === po.id ? { ...p, status: "received" } : p)));
    notify(`Barang untuk ${po.poNumber} diterima & masuk stok`);
    setModal(null);
  }
  async function cancelPO(po) {
    await savePOs(pos.filter((p) => p.id !== po.id));
    notify("PO dibatalkan");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Transaksi</Eyebrow><h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Pembelian (Purchase Order)</h2></div>
        <Button onClick={openNew}><Plus size={15} /> Buat PO</Button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. PO", "Supplier", "Tanggal", "Total", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...pos].sort((a, b) => new Date(b.date) - new Date(a.date)).map((po) => (
              <tr key={po.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{po.poNumber}</td>
                <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, po.supplierId)}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(po.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={po.status === "received" ? "good" : "warn"}>
                    {po.status === "received" ? <CheckCircle2 size={11} /> : <Clock size={11} />} {po.status === "received" ? "Diterima" : "Dipesan"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setDetailPO(po)} className="text-xs mr-3" style={{ color: COLOR.accent }}>Detail</button>
                  {po.status === "ordered" && (
                    <>
                      <button onClick={() => openReceive(po)} className="text-xs mr-3" style={{ color: COLOR.good }}>Terima Barang</button>
                      <button onClick={() => cancelPO(po)} className="text-xs" style={{ color: COLOR.danger }}>Batalkan</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {pos.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada PO.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Purchase Order" onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal PO"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between mt-2 mb-2">
            <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Item</div>
            <Button variant="ghost" onClick={addItem}><Plus size={13} /> Tambah Item</Button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select value={it.productId} onChange={(e) => updateItem(i, { productId: e.target.value })} className="flex-[2]">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <TextInput type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} className="w-20" placeholder="Qty" />
                <TextInput type="number" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="w-32" placeholder="Harga beli" />
                <button onClick={() => removeItem(i)}><Trash2 size={15} color={COLOR.danger} /></button>
              </div>
            ))}
            {items.length === 0 && <div className="text-xs py-3 text-center" style={{ color: COLOR.inkSoft }}>Belum ada item.</div>}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: `1px solid ${COLOR.border}` }}>
            <div className="font-mono text-sm" style={{ color: COLOR.ink }}>Total: {fmtIDR(poTotal)}</div>
            <Button onClick={submitPO}>Buat PO</Button>
          </div>
        </Modal>
      )}

      {modal?.receive && (
        <Modal title={`Terima Barang — ${modal.receive.poNumber}`} onClose={() => setModal(null)} wide>
          <p className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>Masukkan nomor batch dan tanggal expiry untuk setiap item. Stok akan otomatis bertambah setelah konfirmasi.</p>
          {modal.receive.items.map((it, i) => {
            const p = products.find((x) => x.id === it.productId);
            return (
              <div key={i} className="grid grid-cols-3 gap-2 items-end mb-2 p-2 rounded-lg" style={{ background: COLOR.bg }}>
                <div className="text-sm col-span-3 mb-1" style={{ color: COLOR.ink }}>{p?.name} <span className="font-mono text-xs" style={{ color: COLOR.inkSoft }}>({it.qty} {p?.unit})</span></div>
                <TextInput placeholder="No. Batch" value={receiveForm[i]?.batchNo || ""} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], batchNo: e.target.value } })} />
                <TextInput type="date" value={receiveForm[i]?.expiryDate || ""} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], expiryDate: e.target.value } })} />
              </div>
            );
          })}
          <Button onClick={() => submitReceive(modal.receive)} className="w-full justify-center mt-2">Konfirmasi Terima</Button>
        </Modal>
      )}

      {detailPO && (
        <Modal title={`Detail ${detailPO.poNumber}`} onClose={() => setDetailPO(null)} wide>
          <div className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>
            Supplier: {findName(suppliers, detailPO.supplierId)} · Tanggal: {fmtDate(detailPO.date)} · Status: {detailPO.status === "received" ? "Diterima" : "Dipesan"}
          </div>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["Produk", "Qty", "Harga Beli", "Subtotal"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailPO.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-4" style={{ color: COLOR.ink }}>
            Total: {fmtIDR(detailPO.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}
          </div>
          {detailPO.status === "received" && (
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Batch yang diterima</div>
              <div className="flex flex-wrap gap-2">
                {batches.filter((b) => b.poId === detailPO.id).map((b) => {
                  const p = products.find((x) => x.id === b.productId);
                  return (
                    <span key={b.id} className="text-[11px] font-mono px-2 py-1 rounded-md" style={{ background: COLOR.bg, color: COLOR.inkSoft, border: `1px solid ${COLOR.border}` }}>
                      {p?.name}: {b.batchNo} · {b.qty} {p?.unit} · exp {fmtDate(b.expiryDate)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ---------- Sales (SO) ----------
function SalesView({ products, customers, sos, batches, saveSOs, saveBatches, allocateFEFO, findName, notify, stockByProduct }) {
  const [modal, setModal] = useState(null);
  const [detailSO, setDetailSO] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);

  function openNew() {
    setCustomerId(customers[0]?.id || "");
    setDate(todayISO());
    setItems([]);
    setModal("new");
  }
  function addItem() {
    if (products.length === 0) return notify("Tambahkan produk dahulu", "danger");
    setItems([...items, { productId: products[0].id, qty: 1, unitPrice: products[0].sellPrice }]);
  }
  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }
  const soTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  async function submitSO() {
    if (!customerId) return notify("Pilih pelanggan", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item", "danger");

    // validate stock via FEFO simulation, aggregating duplicate products
    const shortages = [];
    const allocationsByItem = [];
    let workingBatches = batches.map((b) => ({ ...b }));
    for (const it of items) {
      const avail = workingBatches.filter((b) => b.productId === it.productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      let remaining = it.qty;
      const allocs = [];
      for (const b of avail) {
        if (remaining <= 0) break;
        const take = Math.min(b.qty, remaining);
        allocs.push({ batchId: b.id, batchNo: b.batchNo, qty: take });
        b.qty -= take;
        remaining -= take;
      }
      if (remaining > 0) {
        const p = products.find((x) => x.id === it.productId);
        shortages.push(`${p?.name}: kurang ${remaining} ${p?.unit}`);
      }
      allocationsByItem.push(allocs);
    }
    if (shortages.length > 0) return notify("Stok tidak cukup — " + shortages.join(", "), "danger");

    const soNumber = `SO-${new Date(date).getFullYear()}-${String(sos.length + 1).padStart(4, "0")}`;
    const itemsWithAlloc = items.map((it, i) => ({ ...it, allocations: allocationsByItem[i] }));
    await saveBatches(workingBatches);
    await saveSOs([...sos, { id: uid(), soNumber, customerId, date, items: itemsWithAlloc, status: "confirmed" }]);
    notify(`${soNumber} dikonfirmasi, stok terpotong FEFO`);
    setModal(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Transaksi</Eyebrow><h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Penjualan (Sales Order)</h2></div>
        <Button onClick={openNew}><Plus size={15} /> Buat SO</Button>
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. SO", "Pelanggan", "Tanggal", "Total", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...sos].sort((a, b) => new Date(b.date) - new Date(a.date)).map((so) => (
              <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                <td className="px-4 py-2.5"><Badge tone="good"><CheckCircle2 size={11} /> Terkonfirmasi</Badge></td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => setDetailSO(so)} className="text-xs" style={{ color: COLOR.accent }}>Detail</button></td>
              </tr>
            ))}
            {sos.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada SO.</td></tr>}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Sales Order" onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pelanggan">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal SO"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between mt-2 mb-2">
            <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Item</div>
            <Button variant="ghost" onClick={addItem}><Plus size={13} /> Tambah Item</Button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => {
              const s = stockByProduct[it.productId];
              return (
                <div key={i}>
                  <div className="flex gap-2 items-center">
                    <Select value={it.productId} onChange={(e) => updateItem(i, { productId: e.target.value, unitPrice: products.find((p) => p.id === e.target.value)?.sellPrice || 0 })} className="flex-[2]">
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <TextInput type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} className="w-20" placeholder="Qty" />
                    <TextInput type="number" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} className="w-32" placeholder="Harga jual" />
                    <button onClick={() => removeItem(i)}><Trash2 size={15} color={COLOR.danger} /></button>
                  </div>
                  <div className="text-[11px] font-mono mt-0.5 ml-1" style={{ color: s && s.qty < it.qty ? COLOR.danger : COLOR.inkSoft }}>Tersedia: {s?.qty ?? 0}</div>
                </div>
              );
            })}
            {items.length === 0 && <div className="text-xs py-3 text-center" style={{ color: COLOR.inkSoft }}>Belum ada item.</div>}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3" style={{ borderTop: `1px solid ${COLOR.border}` }}>
            <div className="font-mono text-sm" style={{ color: COLOR.ink }}>Total: {fmtIDR(soTotal)}</div>
            <Button onClick={submitSO}>Konfirmasi SO</Button>
          </div>
        </Modal>
      )}

      {detailSO && (
        <Modal title={`Detail ${detailSO.soNumber}`} onClose={() => setDetailSO(null)} wide>
          <div className="text-xs mb-3" style={{ color: COLOR.inkSoft }}>
            Pelanggan: {findName(customers, detailSO.customerId)} · Tanggal: {fmtDate(detailSO.date)}
          </div>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["Produk", "Qty", "Harga Jual", "Subtotal"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailSO.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: COLOR.ink }}>{fmtIDR(it.qty * it.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-4" style={{ color: COLOR.ink }}>
            Total: {fmtIDR(detailSO.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))}
          </div>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Alokasi batch (FEFO)</div>
          {detailSO.items.map((it, i) => {
            const p = products.find((x) => x.id === it.productId);
            return (
              <div key={i} className="mb-2">
                <div className="text-xs mb-1" style={{ color: COLOR.ink }}>{p?.name}</div>
                <div className="flex flex-wrap gap-2">
                  {(it.allocations || []).map((a, ai) => (
                    <span key={ai} className="text-[11px] font-mono px-2 py-1 rounded-md" style={{ background: COLOR.bg, color: COLOR.inkSoft, border: `1px solid ${COLOR.border}` }}>
                      {a.batchNo}: {a.qty} {p?.unit}
                    </span>
                  ))}
                  {(!it.allocations || it.allocations.length === 0) && <span className="text-xs" style={{ color: COLOR.inkSoft }}>Tidak ada data alokasi.</span>}
                </div>
              </div>
            );
          })}
        </Modal>
      )}
    </div>
  );
}

// ---------- Finance ----------
function FinanceView(props) {
  const {
    pos, sos, suppliers, customers, batches, paymentsOut, paymentsIn, expenses,
    findName, notify, savePaymentsOut, savePaymentsIn, saveExpenses,
    arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth,
  } = props;

  const [subTab, setSubTab] = useState("ar");
  const [payModal, setPayModal] = useState(null); // { kind: 'so'|'po', doc }
  const [payForm, setPayForm] = useState({ amount: "", date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });

  function soTotal(so) { return so.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function poTotal(po) { return po.items.reduce((s, it) => s + it.qty * it.unitPrice, 0); }
  function soPaid(soId) { return paymentsIn.filter((p) => p.soId === soId).reduce((s, p) => s + p.amount, 0); }
  function poPaid(poId) { return paymentsOut.filter((p) => p.poId === poId).reduce((s, p) => s + p.amount, 0); }

  function openPay(kind, doc) {
    const total = kind === "so" ? soTotal(doc) : poTotal(doc);
    const paid = kind === "so" ? soPaid(doc.id) : poPaid(doc.id);
    setPayForm({ amount: Math.max(0, total - paid), date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
    setPayModal({ kind, doc });
  }

  async function submitPayment() {
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) return notify("Jumlah pembayaran harus lebih dari 0", "danger");
    const entry = { id: uid(), amount: amt, date: payForm.date, method: payForm.method, note: payForm.note };
    if (payModal.kind === "so") {
      await savePaymentsIn([...paymentsIn, { ...entry, soId: payModal.doc.id }]);
      notify(`Pembayaran dari ${findName(customers, payModal.doc.customerId)} dicatat`);
    } else {
      await savePaymentsOut([...paymentsOut, { ...entry, poId: payModal.doc.id }]);
      notify(`Pembayaran ke ${findName(suppliers, payModal.doc.supplierId)} dicatat`);
    }
    setPayModal(null);
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

  const arList = sos.map((so) => ({ so, total: soTotal(so), paid: soPaid(so.id) })).filter((x) => x.total - x.paid > 0);
  const apList = pos.filter((po) => po.status === "received").map((po) => ({ po, total: poTotal(po), paid: poPaid(po.id) })).filter((x) => x.total - x.paid > 0);

  const SUBNAV = [
    { id: "ar", label: `Piutang (${arList.length})` },
    { id: "ap", label: `Hutang (${apList.length})` },
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

      {subTab === "ar" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["No. SO", "Pelanggan", "Total", "Sudah Dibayar", "Sisa Piutang", "Jatuh Tempo Sejak", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arList.map(({ so, total, paid }) => (
                <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(paid)}</td>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.warn }}>{fmtIDR(total - paid)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("so", so)} className="text-xs" style={{ color: COLOR.accent }}>Catat Pembayaran</button></td>
                </tr>
              ))}
              {arList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada piutang tersisa — semua SO sudah lunas.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {subTab === "ap" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["No. PO", "Supplier", "Total", "Sudah Dibayar", "Sisa Hutang", "Diterima Sejak", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apList.map(({ po, total, paid }) => (
                <tr key={po.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.ink }}>{po.poNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, po.supplierId)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.good }}>{fmtIDR(paid)}</td>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.danger }}>{fmtIDR(total - paid)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("po", po)} className="text-xs" style={{ color: COLOR.accent }}>Catat Pembayaran</button></td>
                </tr>
              ))}
              {apList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada hutang tersisa — semua PO sudah lunas.</td></tr>}
            </tbody>
          </table>
        </Card>
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

      {payModal && (
        <Modal
          title={payModal.kind === "so" ? `Catat Pembayaran Masuk — ${payModal.doc.soNumber}` : `Catat Pembayaran Keluar — ${payModal.doc.poNumber}`}
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
          <Field label="Tanggal"><TextInput type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} /></Field>
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
