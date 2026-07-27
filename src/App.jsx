import { useState, useEffect, useMemo } from "react";
import { loadKey, saveKey } from "./storage";
import {
  LayoutDashboard, Package, Truck, Users, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Trash2, Search, CheckCircle2, Clock,
  ChevronRight, Boxes, ArrowUpRight, ArrowDownRight, Loader2,
  Wallet, Receipt, CreditCard, PiggyBank, BarChart3, LogOut, FileText
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
  dos: "erp-delivery-orders", // Key baru untuk Surat Jalan
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
  const [dos, setDOs] = useState([]); // State Surat Jalan
  const [paymentsOut, setPaymentsOut] = useState([]);
  const [paymentsIn, setPaymentsIn] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [toast, setToast] = useState(null);
  const [lastSync, setLastSync] = useState(Date.now());
  const [syncState, setSyncState] = useState("ok");

  async function refreshAll() {
    setSyncState("syncing");
    try {
      const [p, s, c, b, po, so, doData, pout, pin, exp] = await Promise.all([
        loadKey(KEYS.products), loadKey(KEYS.suppliers), loadKey(KEYS.customers),
        loadKey(KEYS.batches), loadKey(KEYS.pos), loadKey(KEYS.sos), loadKey(KEYS.dos),
        loadKey(KEYS.paymentsOut), loadKey(KEYS.paymentsIn), loadKey(KEYS.expenses),
      ]);
      const swap = (setter) => (next) => setter((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
      swap(setProducts)(p); swap(setSuppliers)(s); swap(setCustomers)(c); swap(setBatches)(b);
      swap(setPOs)(po); swap(setSOs)(so); swap(setDOs)(doData); swap(setPaymentsOut)(pout); swap(setPaymentsIn)(pin); swap(setExpenses)(exp);
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
    dos: async (list) => { setDOs(list); await saveKey(KEYS.dos, list); },
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
    { id: "delivery", label: "Surat Jalan (DO)", icon: FileText }, // Navigasi Baru Ditambahkan
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

      {/* Main Content Area */}
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
        {tab === "delivery" && (
          <DeliveryOrdersView
            sos={sos} customers={customers} products={products} dos={dos}
            saveDOs={persist.dos} findName={findName} notify={notify}
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

// ---------- View Tambahan: Surat Jalan (Delivery Orders) ----------
function DeliveryOrdersView({ sos, customers, products, dos, saveDOs, findName, notify }) {
  const [modal, setModal] = useState(null);
  const [selectedSoId, setSelectedSoId] = useState("");
  const [courier, setCourier] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [status, setStatus] = useState("Dikirim");
  const [recipient, setRecipient] = useState("");
  const [receivedDate, setReceivedDate] = useState("");

  const activeSO = sos.find((s) => s.id === selectedSoId);

  function openNew() {
    setSelectedSoId(sos[0]?.id || "");
    setCourier("");
    setTrackingNo("");
    setDeliveryDate(todayISO());
    setStatus("Dikirim");
    setRecipient("");
    setReceivedDate("");
    setModal("new");
  }

  async function submitDO() {
    if (!selectedSoId) return notify("Pilih Sales Order dulu", "danger");
    const doNumber = `SJ-${new Date(deliveryDate).getFullYear()}-${String(dos.length + 1).padStart(4, "0")}`;
    const newDO = {
      id: uid(),
      doNumber,
      soId: selectedSoId,
      customerId: activeSO?.customerId,
      deliveryDate,
      courier,
      trackingNo,
      status,
      recipient: status === "Diterima" ? recipient : "",
      receivedDate: status === "Diterima" ? receivedDate : "",
      items: activeSO?.items || [],
    };
    await saveDOs([...dos, newDO]);
    notify(`${doNumber} berhasil dibuat`);
    setModal(null);
  }

  async function updateStatus(doItem, newStatus) {
    const updated = dos.map((d) =>
      d.id === doItem.id ? { ...d, status: newStatus, receivedDate: newStatus === "Diterima" ? todayISO() : d.receivedDate } : d
    );
    await saveDOs(updated);
    notify(`Status ${doItem.doNumber} diubah menjadi ${newStatus}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <Eyebrow>Logistik & Pengiriman</Eyebrow>
          <h2 className="text-xl font-semibold" style={{ color: COLOR.ink }}>Surat Jalan (Delivery Order)</h2>
        </div>
        <Button onClick={openNew}><Plus size={15} /> Buat Surat Jalan</Button>
      </div>

      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Surat Jalan", "No. SO", "Pelanggan", "Tgl Kirim", "Ekspedisi / Resi", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...dos].sort((a, b) => new Date(b.deliveryDate) - new Date(a.deliveryDate)).map((d) => {
              const so = sos.find((s) => s.id === d.soId);
              return (
                <tr key={d.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ color: COLOR.ink }}>{d.doNumber}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: COLOR.inkSoft }}>{so?.soNumber || "-"}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, d.customerId)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(d.deliveryDate)}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>
                    {d.courier || "-"} {d.trackingNo ? `(${d.trackingNo})` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={d.status === "Diterima" ? "good" : "warn"}>
                      {d.status === "Diterima" ? <CheckCircle2 size={11} /> : <Clock size={11} />} {d.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {d.status === "Dikirim" && (
                      <button onClick={() => updateStatus(d, "Diterima")} className="text-xs" style={{ color: COLOR.good }}>
                        Set Diterima
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {dos.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>
                  Belum ada Surat Jalan yang dibuat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Buat Surat Jalan Baru" onClose={() => setModal(null)} wide>
          <Field label="Pilih Sales Order (SO)">
            <Select value={selectedSoId} onChange={(e) => setSelectedSoId(e.target.value)}>
              {sos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.soNumber} - {findName(customers, s.customerId)} ({fmtDate(s.date)})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal Pengiriman">
              <TextInput type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
            <Field label="Status Pengiriman">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Dikirim">Dalam Pengiriman</option>
                <option value="Diterima">Sudah Diterima</option>
              </Select>
            </Field>
            <Field label="Ekspedisi / Pengirim">
              <TextInput placeholder="misal: JNE / Kurir Internal" value={courier} onChange={(e) => setCourier(e.target.value)} />
            </Field>
            <Field label="No. Resi / Kendaraan">
              <TextInput placeholder="misal: B 1234 CD" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
            </Field>
          </div>

          {status === "Diterima" && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg mb-3" style={{ background: COLOR.bg }}>
              <Field label="Nama Penerima">
                <TextInput placeholder="Nama penerima" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              </Field>
              <Field label="Tanggal Diterima">
                <TextInput type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              </Field>
            </div>
          )}

          {activeSO && (
            <div className="mt-3">
              <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Detail Item Barang & Batch yang Dikirim</div>
              <div className="flex flex-col gap-1.5">
                {activeSO.items.map((it, idx) => {
                  const p = products.find((x) => x.id === it.productId);
                  return (
                    <div key={idx} className="p-2 rounded-lg text-xs" style={{ background: COLOR.bg, border: `1px solid ${COLOR.border}` }}>
                      <div className="font-medium" style={{ color: COLOR.ink }}>{p?.name} — Qty: {it.qty} {p?.unit}</div>
                      <div className="text-[11px] font-mono mt-1" style={{ color: COLOR.inkSoft }}>
                        Batch: {(it.allocations || []).map((a) => `${a.batchNo} (${a.qty})`).join(", ") || "Tanpa alokasi batch"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Button onClick={submitDO} className="w-full justify-center mt-4">Simpan Surat Jalan</Button>
        </Modal>
      )}
    </div>
  );
}

// (Sisa komponen Dashboard, ProductsView, StockView, SuppliersView, CustomersView, PurchasesView, SalesView, FinanceView, ReportsView tetap sama sesuai kode aslimu)
