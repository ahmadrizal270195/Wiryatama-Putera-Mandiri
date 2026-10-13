import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  loadKey, saveKey, deleteKey, subscribeKey,
  loadList, subscribeList, saveList, writeWholeList, deleteList,
  getStorageMode, watchSchema, migrateToV2,
} from "./storage";
import {
  LayoutDashboard, Package, Truck, Users, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Trash2, Search, Boxes, ArrowUpRight, ArrowDownRight,
  Loader2, Calendar, Printer, Wallet, Receipt, CreditCard, PiggyBank, BarChart3,
  FileText, LogOut, Phone, Mail, MapPin, ShieldCheck, ArrowRight, Lock, MessageSquare, ShieldAlert, Download, Upload,
  Moon, Sun, ChevronLeft, ChevronRight, Menu as MenuIcon, Database, SlidersHorizontal, ChevronDown, ClipboardCheck, History
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
import FinanceView from "./modules/FinanceModule";
import QAView from "./modules/QAModule";
import { myClasses, setOfficersCache } from "./qa";
import { computeBill, itemLineTotal } from "./billing";
import { setPaymentSettings, PAYMENT_GROUPS } from "./print";
import SearchableSelect from "./components/SearchableSelect";
import ActivityLogView from "./modules/ActivityLogModule";
import { logActivity, logListChange, setActivityActor } from "./activityLog";
import { todayISO, toLocalDateStr, startOfMonthISO, isThisMonth, fmtDate, daysUntil } from "./dateUtils";


const THEME = {
  light: {
    bg: "#F1F5F9",
    surface: "#FFFFFF",     // Kotak dashboard berwarna putih di mode terang
    card: "#FFFFFF",
    cardSoft: "#F8FAFC",
    border: "#E2E8F0",
    ink: "#1E293B",          // Teks gelap
    inkSoft: "#64748B",
    primary: "#059669",
    primarySoft: "#ECFDF5",
    sidebarBg: "#FFFFFF",    // Sidebar putih di mode terang (gaya WHISys)
    accent: "#10B981",
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    warn: "#D97706",
    warnSoft: "#FFFBEB",
    good: "#059669",
    goodSoft: "#ECFDF5",
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

const DEFAULT_COMPANY_PROFILE = {
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

const getInitialCompanyProfile = () => {
  try {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("erp-company-profile") : null;
    if (saved) return { ...DEFAULT_COMPANY_PROFILE, ...JSON.parse(saved) };
  } catch (_) {}
  return { ...DEFAULT_COMPANY_PROFILE };
};

const COMPANY_PROFILE = getInitialCompanyProfile();



const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const fmtIDR = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");


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
  qaOfficers: "erp-qa-officers",
  disposals: "erp-disposals",
  settings: "erp-app-settings",
  autoBackupPrefix: "erp-auto-backup-",
};

// ---------- HELPER CADANGAN OTOMATIS (format per jenis data) ----------
// Format baru: erp-auto-backup-2026-09-29__erp-products, dst (satu dokumen per jenis data).
// Format lama: erp-auto-backup-2026-09-29 berisi { data: {...semua...} } -- tetap bisa di-restore.
const AUTO_BACKUP_RESTORE_KEYS = [
  KEYS.products, KEYS.suppliers, KEYS.customers, KEYS.batches,
  KEYS.pos, KEYS.pReceipts, KEYS.pInvoices, KEYS.pReturns,
  KEYS.sos, KEYS.paymentsOut, KEYS.paymentsIn, KEYS.expenses,
  KEYS.deliveryNotes, KEYS.invoices, KEYS.returns, KEYS.users, KEYS.qaOfficers, KEYS.disposals,
];
function autoBackupDocKey(dateKey, key) {
  return `${KEYS.autoBackupPrefix}${dateKey}__${key}`;
}
async function loadAutoBackup(dateKey, keys) {
  const hasData = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
  // 1) Format terbaru (ikut mode penyimpanan aktif)
  let data = {};
  let found = false;
  for (const k of keys) {
    const val = await loadList(autoBackupDocKey(dateKey, k));
    data[k] = val;
    if (hasData(val)) found = true;
  }
  if (found) return data;
  // 2) Cadangan lama yang masih tersimpan di erp_data
  const legacy = await loadKey(KEYS.autoBackupPrefix + dateKey);
  if (legacy && !Array.isArray(legacy) && legacy.data) return legacy.data;
  data = {};
  for (const k of keys) {
    const val = await loadKey(autoBackupDocKey(dateKey, k));
    data[k] = val;
    if (hasData(val)) found = true;
  }
  return found ? data : null;
}
async function deleteAutoBackup(dateKey, keys) {
  for (const k of keys) await deleteList(autoBackupDocKey(dateKey, k));
  if (getStorageMode() !== "v2") await deleteKey(KEYS.autoBackupPrefix + dateKey); // format paling lama
}

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

// Konversi diskon header (bisa berupa % ATAU Rupiah) menjadi persentase efektif,
// supaya SEMUA tempat yang menghitung total faktur/invoice (AR, AP, Dashboard,
// Finance, Laporan Laba Rugi) memakai satu logika yang sama dan tidak lagi
// bisa saling berbeda hasil hanya karena lupa menangani discountType "amount".
function headerDiscountToPct(rawSubtotal, discountType, discountValue) {
  const val = Number(discountValue || 0);
  if (discountType === "amount") {
    return rawSubtotal > 0 ? (Math.min(rawSubtotal, val) / rawSubtotal) * 100 : 0;
  }
  return val;
}

// Menghitung cost-per-unit sebuah produk PADA SATU INVOICE TERTENTU, berdasarkan
// batch yang BENAR-BENAR dialokasikan (allocations) saat penjualan itu terjadi.
// Dipakai untuk HPP retur yang TIDAK di-restock ke stok (barang rusak/dimusnahkan),
// supaya nilainya akurat sesuai batch asal penjualan -- bukan tebakan dari batch
// pertama yang kebetulan ada di array stok saat ini (yang costnya bisa beda jauh).
function originalSaleCostPerUnit(inv, productId, batches, deliveryNotes, costOf) {
  const batchCostOf = (batchId, batchNo) => {
    if (costOf) return costOf(batchId, productId, batchNo);
    const b = (batches || []).find((x) => x.id === batchId);
    return b ? b.costPrice : 0;
  };
  let allocs = [];
  if (inv.isDirect) {
    const item = (inv.items || []).find((it) => it.productId === productId);
    allocs = item?.allocations || [];
  } else {
    (deliveryNotes || []).filter((dn) => dn.soId === inv.soId && dn.status === "diterima")
      .forEach((dn) => {
        (dn.items || []).filter((it) => it.productId === productId)
          .forEach((it) => { allocs = allocs.concat(it.allocations || []); });
      });
  }
  const totalQty = allocs.reduce((s, a) => s + (Number(a.qty) || 0), 0);
  if (totalQty > 0) {
    const totalCost = allocs.reduce((s, a) => s + (Number(a.qty) || 0) * batchCostOf(a.batchId, a.batchNo), 0);
    return totalCost / totalQty;
  }
  // Fallback kalau data alokasi historis tidak ditemukan (kasus lama/edge case):
  // pakai RATA-RATA cost dari semua batch produk ini, bukan cuma batch pertama.
  const matchingBatches = (batches || []).filter((b) => b.productId === productId);
  if (matchingBatches.length === 0) return 0;
  return matchingBatches.reduce((s, b) => s + (Number(b.costPrice) || 0), 0) / matchingBatches.length;
}

// ---------------------------------------------------------------------
//  PEMULIH HARGA MODAL (HPP) PER BATCH
//  Urutan cari harga modal sebuah alokasi penjualan:
//    1. batch di Stok (by ID) yang harga modalnya > 0
//    2. item Faktur Pembelian / BPB yang nyimpan batchId itu
//    3. produk + No. Batch yang sama (batch di Stok, Faktur Pembelian, BPB)
//  Dipakai supaya penjualan lama yang batch-nya sudah kehapus / dibikin ulang
//  (bug lama edit & batal faktur pembelian) tetap punya HPP yang benar.
// ---------------------------------------------------------------------
function makeCostResolver(batches, pInvoices, pReceipts, pos) {
  const byId = {};
  const byNo = {};
  // Harga net per unit di PO (setelah diskon item) -> dipakai buat batch hasil BPB.
  // Dulu batch BPB nyimpen harga PO SEBELUM diskon item, beda sama faktur pembelian langsung.
  // Faktor diskon nota: (subtotal - diskon nota) / subtotal. Diskon nota pembelian
  // langsung ngurangin harga modal, dibagi proporsional ke tiap item.
  const notaRatio = (doc, opts) => {
    const bill = computeBill(doc, opts);
    return bill.raw > 0 ? (bill.raw - bill.diskon) / bill.raw : 1;
  };
  // Harga net per unit dari PO: utamakan Faktur Pembelian untuk PO itu (harga & diskon aktual),
  // kalau belum ada pakai PO-nya.
  const poNetUnit = (poId, productId) => {
    const pi = (pInvoices || []).find((x) => x.poId === poId);
    const piIt = (pi?.items || []).find((x) => x.productId === productId);
    if (piIt && Number(piIt.qty) > 0) {
      return { cost: (itemLineTotal(piIt) / Number(piIt.qty)) * notaRatio(pi), label: `net Faktur Beli ${pi.noFaktur || ""}`.trim() };
    }
    const po = (pos || []).find((x) => x.id === poId);
    const it = (po?.items || []).find((x) => x.productId === productId);
    const q = Number(it?.qty) || 0;
    return it && q > 0 ? { cost: (itemLineTotal(it) / q) * notaRatio(po, { includeOngkir: false }), label: `net PO ${po.poNumber || ""}`.trim() } : null;
  };
  // Harga net per batch dari faktur pembelian langsung (setelah diskon item & nota)
  const piCostByBatch = {};
  (pInvoices || []).forEach((pi) => {
    const r = notaRatio(pi);
    (pi.items || []).forEach((it) => {
      const q = Number(it.qty) || 0;
      if (it.batchId && q > 0) piCostByBatch[it.batchId] = { cost: (itemLineTotal(it) / q) * r, label: `net Faktur Beli ${pi.noFaktur || ""}`.trim() };
    });
  });
  const put = (id, pid, no, cost, src) => {
    if (!(cost > 0)) return;
    if (id && byId[id] == null) byId[id] = { cost, src };
    const k = `${pid}|${String(no || "").trim().toLowerCase()}`;
    if (pid && no && byNo[k] == null) byNo[k] = { cost, src };
  };
  (batches || []).forEach((b) => {
    const net = b.poId ? poNetUnit(b.poId, b.productId) : piCostByBatch[b.id];
    if (net && net.cost > 0) put(b.id, b.productId, b.batchNo, net.cost, `Stok · ${net.label}`);
    else put(b.id, b.productId, b.batchNo, Number(b.costPrice), "Stok");
  });
  (pInvoices || []).forEach((pi) => {
    const r = notaRatio(pi);
    (pi.items || []).forEach((it) => {
      const q = Number(it.qty) || 0;
      put(it.batchId, it.productId, it.batchNo, q > 0 ? (itemLineTotal(it) / q) * r : 0, `Faktur Beli ${pi.noFaktur || ""}`.trim());
    });
  });
  (pReceipts || []).forEach((pr) => (pr.items || []).forEach((it) => {
    const net = poNetUnit(pr.poId, it.productId);
    put(it.batchId, it.productId, it.batchNo, net && net.cost > 0 ? net.cost : Number(it.unitPrice), `BPB ${pr.noBPB || ""}`.trim());
  }));
  const explain = (batchId, productId, batchNo) => {
    if (batchId && byId[batchId] != null) return { ...byId[batchId], match: "id" };
    const k = `${productId}|${String(batchNo || "").trim().toLowerCase()}`;
    if (productId && batchNo && byNo[k] != null) return { ...byNo[k], match: "no" };
    return { cost: 0, src: "-", match: null };
  };
  const costOf = (batchId, productId, batchNo) => explain(batchId, productId, batchNo).cost;
  costOf.explain = explain;
  return costOf;
}

// ---------------------------------------------------------------------
//  LABA KOTOR PER FAKTUR PENJUALAN (satu-satunya rumus)
//  Dipakai Laporan Penjualan, Laba Rugi, dan Dashboard supaya angkanya sama.
//   - Penjualan  = DPP faktur (setelah diskon item & nota, tanpa PPN)
//   - HPP        = alokasi batch (faktur langsung) / Surat Jalan diterima (faktur SO),
//                  dikurangi barang yang balik karena SJ diterima sebagian
//   - Retur      = retur dari faktur, dinilai dengan harga DPP yang sama dengan faktur
// ---------------------------------------------------------------------
function computeInvoiceProfit(inv, { batches, deliveryNotes, returns, costOf }) {
  const bill = computeBill(inv);
  const dpp = bill.dpp;
  const dppRatio = bill.raw > 0 ? dpp / bill.raw : 1; // efek diskon nota & PPN include

  let invCogs = 0;
  const costByProduct = {};
  const slot = (pid) => (costByProduct[pid] ||= { qty: 0, cost: 0, missingBatch: 0, zeroCost: 0, recovered: 0, trace: [] });
  const addAllocs = (pid, allocs) => {
    const cp = slot(pid);
    (allocs || []).forEach((a) => {
      const q = Number(a.qty) || 0;
      const b = (batches || []).find((x) => x.id === a.batchId);
      const ex = costOf.explain(a.batchId, pid, a.batchNo);
      const unit = ex.cost;
      const c = q * unit;
      cp.trace.push({ batchNo: a.batchNo || b?.batchNo || "-", qty: q, unit, src: ex.src, byNo: ex.match === "no" });
      invCogs += c;
      cp.qty += q;
      cp.cost += c;
      if (!(unit > 0)) {
        if (!b) cp.missingBatch += q;
        else cp.zeroCost += q;
      } else if (!b || !(Number(b.costPrice) > 0)) {
        cp.recovered += q;
      }
    });
  };
  const receivedDNs = inv.isDirect ? [] : (deliveryNotes || []).filter((dn) => dn.soId === inv.soId && dn.status === "diterima");
  if (inv.isDirect) {
    (inv.items || []).forEach((it) => addAllocs(it.productId, it.allocations));
  } else {
    receivedDNs.forEach((dn) => (dn.items || []).forEach((it) => addAllocs(it.productId, it.allocations)));
  }

  const isSJReturn = (r) => r.source === "sj" || (!r.invoiceId && r.soId);
  const returList = (returns || []).filter((r) => r.invoiceId === inv.id || (inv.soId && r.soId === inv.soId));

  // Barang yang balik karena SJ diterima sebagian: BUKAN retur penjualan (nggak pernah difakturkan),
  // jadi cuma ngurangin HPP barang terkirim, nggak ngurangin penjualan.
  returList.filter(isSJReturn).forEach((r) => (r.items || []).forEach((it) => {
    const cp = slot(it.productId);
    const avg = cp.qty > 0 ? cp.cost / cp.qty : 0;
    const rbs = it.restockedBatches || [];
    const rbQty = rbs.reduce((s2, rb) => s2 + (Number(rb.qty) || 0), 0);
    let backCost = rbs.reduce((s2, rb) => s2 + (Number(rb.qty) || 0) * costOf(rb.batchId, it.productId, rb.batchNo), 0);
    const backQty = Number(it.qty) || 0;
    if (backQty > rbQty) backCost += (backQty - rbQty) * avg;
    invCogs -= backCost;
    cp.qty -= backQty;
    cp.cost -= backCost;
    cp.trace.push({ batchNo: rbs.map((x) => x.batchNo).filter(Boolean).join(", ") || "-", qty: -backQty, unit: backQty > 0 ? backCost / backQty : 0, src: `balik, SJ diterima sebagian (${r.noRetur || "-"})`, byNo: false });
  }));

  const hasReceivedDN = inv.isDirect || receivedDNs.length > 0;
  const items = (inv.items || []).map((it) => {
    const qty = Number(it.qty) || 0;
    const cp = costByProduct[it.productId];
    const hppUnit = cp && cp.qty > 0 ? cp.cost / cp.qty : 0;
    let hppIssue = null;
    if (!hasReceivedDN) hppIssue = "sj_belum_diterima";
    else if (!cp || cp.qty <= 0) hppIssue = "tanpa_alokasi";
    else if (cp.missingBatch > 0) hppIssue = "batch_terhapus";
    else if (cp.zeroCost > 0) hppIssue = "modal_nol";
    else if (cp.recovered > 0) hppIssue = "dipulihkan";
    return { productId: it.productId, qty, unitPrice: Number(it.unitPrice) || 0, lineTotal: itemLineTotal(it), hppUnit, hppTotal: qty * hppUnit, hppIssue, trace: cp?.trace || [] };
  });
  const itemsHpp = items.reduce((s2, x) => s2 + x.hppTotal, 0);

  // Retur penjualan dari faktur: nilai pakai harga DPP faktur (setelah diskon, tanpa PPN),
  // sama dasar hitungnya dengan angka penjualan.
  let retVal = 0;
  let retCogs = 0;
  returList.filter((r) => !isSJReturn(r)).forEach((r) => (r.items || []).forEach((it) => {
    const q = Number(it.qty) || 0;
    const invIt = (inv.items || []).find((x) => x.productId === it.productId);
    const netUnit = invIt && Number(invIt.qty) > 0 ? itemLineTotal(invIt) / Number(invIt.qty) : Number(it.unitPrice) || 0;
    retVal += q * netUnit * dppRatio;
    if (it.restockedBatches && it.restockedBatches.length > 0) {
      it.restockedBatches.forEach((rb) => { retCogs += (Number(rb.qty) || 0) * costOf(rb.batchId, it.productId, rb.batchNo); });
    } else {
      retCogs += q * originalSaleCostPerUnit(inv, it.productId, batches, deliveryNotes, costOf);
    }
  }));

  invCogs = Math.max(0, invCogs);
  const cogsNet = Math.max(0, invCogs - retCogs);
  return {
    raw: bill.raw, diskon: bill.diskon, dpp,
    items, invCogs, hppAdjust: invCogs - itemsHpp,
    retVal, retCogs, cogsNet,
    grossProfit: dpp - retVal - cogsNet,
  };
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
            user ? <PharmaERP userEmail={user.email} onLogout={async (reason) => {
              await logActivity({ action: "logout", module: "Autentikasi", email: user.email, details: reason === "idle" ? "Logout otomatis (60 menit tidak ada aktivitas)" : "Logout dari sistem" });
              localStorage.removeItem(ACTIVE_TAB_KEY);
              signOut(auth);
            }} /> : <Navigate to="/login" replace />
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
  const [profile, setProfile] = useState(() => ({ ...COMPANY_PROFILE }));
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [p, st] = await Promise.all([
          loadList(KEYS.products),
          loadKey(KEYS.settings),
        ]);
        setProducts(p || []);
        if (st && !Array.isArray(st) && st.companyProfile) {
          Object.assign(COMPANY_PROFILE, st.companyProfile);
          setProfile({ ...DEFAULT_COMPANY_PROFILE, ...st.companyProfile });
          try { localStorage.setItem("erp-company-profile", JSON.stringify(st.companyProfile)); } catch (_) {}
        }
      } catch (err) {
        console.error("Gagal memuat data landing page:", err);
      }
    })();
  }, []);

  const filtered = (products || []).filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen font-sans" style={{ background: COLOR.bg, color: COLOR.ink }}>
      <nav className="bg-white border-b sticky top-0 z-40" style={{ borderColor: COLOR.border }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={profile.logoUrl} alt="Logo Perusahaan" className="h-10 object-contain rounded" />
            <div>
              <div className="font-bold text-sm" style={{ color: COLOR.primary }}>{profile.name}</div>
              <div className="text-[10px]" style={{ color: COLOR.inkSoft }}>{profile.tagline || "Distributor Farmasi & Alkes"}</div>
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
          <span className="inline-block px-3 py-1 rounded-full text-xs tabular-nums font-medium mb-3" style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
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
              href={`https://wa.me/${profile.whatsapp}?text=Halo%20${encodeURIComponent(profile.name)},%20saya%20ingin%20mengajukan%20pemesanan%20produk.`}
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
                  <div className="text-xs mt-1 tabular-nums" style={{ color: COLOR.inkSoft }}>Satuan Kemasan: {p.unit}</div>
                </div>
                <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: COLOR.border }}>
                  <div className="text-xs font-semibold" style={{ color: COLOR.good }}>Tersedia / Ready</div>
                  <a
                    href={`https://wa.me/${profile.whatsapp}?text=Halo%20Admin,%20saya%20ingin%20menanyakan%20ketersediaan%20produk:%20${encodeURIComponent(p.name)}`}
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
              <img src={profile.logoUrl} alt="Logo" className="h-8 object-contain rounded" />
              <div className="font-bold text-base" style={{ color: COLOR.primary }}>{profile.name}</div>
            </div>
            <p className="text-xs leading-relaxed max-w-sm" style={{ color: COLOR.inkSoft }}>
              {profile.tagline}. Melayani distribusi terpadu produk farmasi dan alat kesehatan resmi untuk mitra fasilitas kesehatan.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs" style={{ color: COLOR.inkSoft }}>
            <div className="font-bold text-sm mb-1 text-gray-900">Alamat Kantor & Gudang</div>
            <div className="flex items-center gap-2"><MapPin size={14} /> {profile.address}</div>
            <div className="flex items-center gap-2"><Mail size={14} /> finance@wiryatamaputera.co.id</div>
            <div className="flex items-center gap-2"><Phone size={14} /> {profile.contact || "(021) 7437964"}</div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 mt-8 pt-4 border-t text-center text-[11px]" style={{ borderColor: COLOR.border, color: COLOR.inkSoft }}>
          &copy; {new Date().getFullYear()} {profile.name}. All rights reserved.
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
      logActivity({ action: "login", module: "Autentikasi", email, details: "Login ke sistem" });
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
  return <div style={{ color: COLOR.inkSoft, letterSpacing: "0.08em" }} className="text-[11px] tabular-nums uppercase mb-1">{children}</div>;
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={"rounded-xl p-4 " + className}
      style={{ 
        background: COLOR.surface, 
        border: `1px solid ${COLOR.border}`, 
        color: COLOR.ink, 
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.04)",
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
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] tabular-nums font-bold border"
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

  const setThemeMode = (dark) => {
    setIsDarkMode(dark);
    localStorage.setItem("erp-theme", dark ? "dark" : "light");
  };

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("erp-theme", next ? "dark" : "light");
      return next;
    });
  };

  // Sidebar bisa dilipat jadi rail ikon (desktop), diingat per browser
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("erp-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("erp-sidebar-collapsed", next ? "1" : "0"); } catch {}
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
  const [qaOfficers, setQaOfficers] = useState([]);
  useEffect(() => { setOfficersCache(qaOfficers); }, [qaOfficers]);
  const [disposals, setDisposals] = useState([]);
  const [companyProfile, setCompanyProfile] = useState(() => ({ ...COMPANY_PROFILE }));

  // Pengaturan rekening pembayaran (PPN / Non-PPN) & profil perusahaan disinkron realtime dari cloud
  useEffect(() => {
    return subscribeKey(
      KEYS.settings,
      (v) => {
        setPaymentSettings(v);
        if (v && !Array.isArray(v) && v.companyProfile) {
          Object.assign(COMPANY_PROFILE, v.companyProfile);
          setCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, ...v.companyProfile });
          try { localStorage.setItem("erp-company-profile", JSON.stringify(v.companyProfile)); } catch (_) {}
        }
      },
      () => {}
    );
  }, []);


  const idleTimerRef = useRef(null);

  useEffect(() => {
    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        localStorage.removeItem(ACTIVE_TAB_KEY);
        onLogout("idle");
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
      loadList(KEYS.products), loadList(KEYS.suppliers), loadList(KEYS.customers),
      loadList(KEYS.batches), loadList(KEYS.pos), loadList(KEYS.pReceipts), loadList(KEYS.pInvoices), loadList(KEYS.pReturns), loadList(KEYS.sos),
      loadList(KEYS.paymentsOut), loadList(KEYS.paymentsIn), loadList(KEYS.expenses),
      loadList(KEYS.deliveryNotes), loadList(KEYS.invoices), loadList(KEYS.returns),
      loadList(KEYS.users)
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
      if (getStorageMode() !== "v2") saveKey(KEYS.users, defaultUsers); // Langsung simpan default ke storage agar panggilan berikutnya terbaca
    }

    setLastSync(Date.now());
    setSyncState("ok");
  } catch (e) {
    console.error("refresh failed", e);
    setSyncState("error");
  }
}

  // ---------- CADANGAN DATA OTOMATIS ----------
  // Karena Firebase project ini masih di plan Spark (gratis, tanpa Cloud Functions),
  // "otomatis" di sini berarti: dicek & dijalankan di browser siapa pun yang login
  // dan membuka aplikasi, maksimal 1x per hari. Bukan backup yang jalan di server
  // tanpa ada yang buka aplikasi -- itu baru bisa kalau upgrade ke plan Blaze.
  const AUTO_BACKUP_KEYS = [
    KEYS.products, KEYS.suppliers, KEYS.customers, KEYS.batches,
    KEYS.pos, KEYS.pReceipts, KEYS.pInvoices, KEYS.pReturns,
    KEYS.sos, KEYS.paymentsOut, KEYS.paymentsIn, KEYS.expenses,
    KEYS.deliveryNotes, KEYS.invoices, KEYS.returns, KEYS.users, KEYS.qaOfficers, KEYS.disposals
  ];
  const MAX_AUTO_BACKUPS = 7; // simpan 7 cadangan harian terakhir, yang lebih lama otomatis dihapus

  async function checkAndRunAutoBackup() {
    try {
      const raw = await loadKey(KEYS.settings);
      const settings = (raw && !Array.isArray(raw)) ? raw : { autoBackupEnabled: false, lastAutoBackupAt: null, backupDates: [] };
      if (!settings.autoBackupEnabled) return;
      if (settings.lastAutoBackupAt === todayISO()) return; // sudah backup hari ini

      // Disimpan PER JENIS DATA (satu dokumen per key), bukan digabung jadi satu dokumen.
      // Firestore membatasi 1 MB per dokumen -- kalau digabung, backup bakal gagal duluan
      // begitu total data membesar.
      let allOk = true;
      for (const k of AUTO_BACKUP_KEYS) {
        const val = await loadList(k);
        const ok = await writeWholeList(autoBackupDocKey(todayISO(), k), val);
        if (!ok) allOk = false;
      }
      if (!allOk) throw new Error("Sebagian cadangan otomatis gagal disimpan");

      const prevDates = Array.isArray(settings.backupDates) ? settings.backupDates : [];
      const newDates = [...prevDates.filter((d) => d !== todayISO()), todayISO()];
      const toDelete = newDates.length > MAX_AUTO_BACKUPS ? newDates.slice(0, newDates.length - MAX_AUTO_BACKUPS) : [];
      for (const d of toDelete) await deleteAutoBackup(d, AUTO_BACKUP_KEYS);
      const keptDates = newDates.slice(-MAX_AUTO_BACKUPS);

      await saveKey(KEYS.settings, { ...settings, lastAutoBackupAt: todayISO(), backupDates: keptDates });
      console.log(`Cadangan otomatis tersimpan untuk ${todayISO()}`);
    } catch (e) {
      console.error("Gagal menjalankan cadangan otomatis:", e);
    }
  }

  useEffect(() => {
    (async () => {
      await refreshAll();
      setLoading(false);
      checkAndRunAutoBackup();
    })();
  }, []);

  // Sinkron realtime (onSnapshot) -- pengganti polling tiap 5 detik yang boros kuota.
  useEffect(() => {
    const pairs = [
      [KEYS.products, setProducts], [KEYS.suppliers, setSuppliers], [KEYS.customers, setCustomers],
      [KEYS.batches, setBatches], [KEYS.pos, setPOs], [KEYS.pReceipts, setPReceipts],
      [KEYS.pInvoices, setPInvoices], [KEYS.pReturns, setPReturns], [KEYS.sos, setSOs],
      [KEYS.paymentsOut, setPaymentsOut], [KEYS.paymentsIn, setPaymentsIn], [KEYS.expenses, setExpenses],
      [KEYS.deliveryNotes, setDeliveryNotes], [KEYS.invoices, setInvoices], [KEYS.returns, setReturns],
      [KEYS.users, setUsers], [KEYS.qaOfficers, setQaOfficers], [KEYS.disposals, setDisposals],
    ];
    const unsubs = pairs.map(([key, setter]) =>
      subscribeList(
        key,
        (next) => {
          setter((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
          setLastSync(Date.now());
          setSyncState("ok");
        },
        () => setSyncState("error")
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Kalau admin baru saja menjalankan migrasi, tab yang masih pakai format lama wajib dimuat ulang.
  useEffect(() => {
    if (getStorageMode() === "v2") return;
    const unsub = watchSchema((version) => {
      if (version >= 2) {
        alert("Sistem baru saja diperbarui ke format data baru. Halaman akan dimuat ulang.");
        window.location.reload();
      }
    });
    return () => unsub();
  }, []);

  // Kalau ada data yang gagal disimpan ke Firestore, kasih tahu user (dulu cuma diam di console).
  useEffect(() => {
    const onSaveError = () => {
      setSyncState("error");
      setToast({ msg: "Data GAGAL tersimpan ke server. Cek koneksi internet, lalu ulangi input terakhir.", tone: "danger" });
      setTimeout(() => setToast(null), 8000);
    };
    window.addEventListener("erp-save-error", onSaveError);
    return () => window.removeEventListener("erp-save-error", onSaveError);
  }, []);

  function notify(msg, tone = "good") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  }

  // Tiap simpan mengirim perubahan relatif terhadap daftar yang sedang dilihat layar
  // (state di render ini), bukan menimpa seluruh daftar.
  // Setiap simpan data otomatis tercatat di Log Aktivitas (tambah/ubah/hapus + apa yang berubah)
  const auditedSave = async (key, prev, next) => {
    const ok = await saveList(key, prev, next);
    if (ok !== false) logListChange(key, prev, next);
    return ok;
  };

  const persist = {
    products: async (list) => { setProducts(list); return auditedSave(KEYS.products, products, list); },
    suppliers: async (list) => { setSuppliers(list); return auditedSave(KEYS.suppliers, suppliers, list); },
    customers: async (list) => { setCustomers(list); return auditedSave(KEYS.customers, customers, list); },
    batches: async (list) => { setBatches(list); return auditedSave(KEYS.batches, batches, list); },
    pos: async (list) => { setPOs(list); return auditedSave(KEYS.pos, pos, list); },
    pReceipts: async (list) => { setPReceipts(list); return auditedSave(KEYS.pReceipts, pReceipts, list); },
    pInvoices: async (list) => { setPInvoices(list); return auditedSave(KEYS.pInvoices, pInvoices, list); },
    pReturns: async (list) => { setPReturns(list); return auditedSave(KEYS.pReturns, pReturns, list); },
    sos: async (list) => { setSOs(list); return auditedSave(KEYS.sos, sos, list); },
    paymentsOut: async (list) => { setPaymentsOut(list); return auditedSave(KEYS.paymentsOut, paymentsOut, list); },
    paymentsIn: async (list) => { setPaymentsIn(list); return auditedSave(KEYS.paymentsIn, paymentsIn, list); },
    expenses: async (list) => { setExpenses(list); return auditedSave(KEYS.expenses, expenses, list); },
    deliveryNotes: async (list) => { setDeliveryNotes(list); return auditedSave(KEYS.deliveryNotes, deliveryNotes, list); },
    invoices: async (list) => { setInvoices(list); return auditedSave(KEYS.invoices, invoices, list); },
    returns: async (list) => { setReturns(list); return auditedSave(KEYS.returns, returns, list); },
    users: async (list) => { setUsers(list); return auditedSave(KEYS.users, users, list); },
    qaOfficers: async (list) => { setQaOfficers(list); return auditedSave(KEYS.qaOfficers, qaOfficers, list); },
    disposals: async (list) => { setDisposals(list); return auditedSave(KEYS.disposals, disposals, list); },
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

  // Semua total tagihan pakai rumus bersama di src/billing.js
  // (diskon item % / Rp, diskon nota, PPN, fee, ongkir) supaya Dashboard, Finance,
  // Laporan, form, dan cetakan selalu sama angkanya.
  function invoiceRawTotal(inv) { return computeBill(inv).raw; }
  function invoiceTotal(inv) { return computeBill(inv).total; }
  // DPP penjualan setelah diskon item & diskon nota, tanpa PPN (dipakai untuk margin / laba kotor).
  function invoiceNetSalesDPP(inv) { return computeBill(inv).dpp; }
  function pInvoiceRawTotal(inv) { return computeBill(inv).raw; }
  function pInvoiceTotal(inv) { return computeBill(inv).total; }
  function soTotal(so) { return computeBill(so, { includeOngkir: false }).total; }
  function poTotal(po) { return computeBill(po, { includeOngkir: false }).total; }
  
  function pInvoicePaidAmount(invId) { return (paymentsOut || []).filter((p) => p.pInvoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function pInvoiceReturnedAmount(invId) { return (pReturns || []).filter((r) => r.pInvoiceId === invId).reduce((s, r) => s + (r.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  function pInvoiceSisa(inv) { return Math.max(0, pInvoiceTotal(inv) - pInvoiceReturnedAmount(inv.id) - pInvoicePaidAmount(inv.id)); }

  function soDPAmount(soId) { return (paymentsIn || []).filter((p) => p.soId === soId && p.type === "DP").reduce((s, p) => s + p.amount, 0); }
  function invoicePaidAmount(invId) { return (paymentsIn || []).filter((p) => p.invoiceId === invId).reduce((s, p) => s + p.amount, 0); }
  function invoiceReturnedAmount(invId) { return (returns || []).filter((r) => r.invoiceId === invId).reduce((s, r) => s + (r.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0), 0); }
  const costOf = useMemo(() => makeCostResolver(batches, pInvoices, pReceipts, pos), [batches, pInvoices, pReceipts, pos]);
  // HPP neto per faktur: rumus yang sama dengan Laporan Penjualan & Laba Rugi
  function invoiceCOGS(inv) {
    return computeInvoiceProfit(inv, { batches, deliveryNotes, returns, costOf }).cogsNet;
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
  
  // Laba kotor bulan ini: rumus sama persis dengan Laba Rugi (computeInvoiceProfit)
  const grossProfitMonth = useMemo(() => {
    return (invoices || []).filter((inv) => isThisMonth(inv.date))
      .reduce((s, inv) => s + computeInvoiceProfit(inv, { batches, deliveryNotes, returns, costOf }).grossProfit, 0);
  }, [invoices, batches, deliveryNotes, returns, costOf]);

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
    // Batch karantina (penerimaan belum disetujui APJ/PJT) tidak boleh disalurkan.
    const avail = (batches || []).filter((b) => b.productId === productId && b.qty > 0 && !b.quarantine).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
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
  { id: "qa", label: "APJ / PJT", icon: ClipboardCheck, requiresFinance: false },
  { id: "settings", label: "Pengaturan", icon: ShieldCheck, requiresFinance: true },
  { id: "activity", label: "Log Aktivitas", icon: History, requiresFinance: true },
];

// Cari akun user yang sedang login saat ini berdasarkan email:
const currentUser = (users || []).find((u) => (u.email || "").toLowerCase() === (userEmail || "").toLowerCase());

// Ambil daftar aksesnya (jika tidak ditemukan/admin, berikan akses penuh):
const FULL_ACCESS = ["dashboard", "products", "stock", "suppliers", "customers", "purchases", "sales", "finance", "reports", "qa", "settings"];
// Super admin = 3 email bawaan ATAU akun yang role-nya "Super Admin" di menu Pengguna.
const myRole = currentUser?.role || "";
const isHardAdmin = ADMIN_FINANCE_EMAILS.includes((userEmail || "").toLowerCase()) || myRole === "admin";
// Setelah migrasi, email yang tidak terdaftar di daftar pengguna TIDAK lagi dapat akses penuh.
const currentUserAccess = currentUser
  ? (currentUser.access || [])
  : (isHardAdmin || getStorageMode() !== "v2" ? FULL_ACCESS : ["dashboard"]);

// Filter navigasi sidebar agar menampilkan hanya modul yang diizinkan:
// APJ / PJT yang terdaftar otomatis bisa buka menu review walau belum diberi akses "qa".
const isQAOfficer = myClasses(qaOfficers, userEmail).length > 0;
const canOpenQA = currentUserAccess.includes("qa") || isQAOfficer || isHardAdmin;
// Boleh buka Finance & Laba Rugi: super admin, role Finance, atau yang dicentang akses modul Finance.
const isFinanceOrAdmin = isHardAdmin || myRole === "finance" || currentUserAccess.includes("finance");
const NAV = ALL_NAV.filter((n) => n.id === "ar_aging" || (n.id === "qa" ? canOpenQA : n.id === "activity" ? isHardAdmin : currentUserAccess.includes(n.id)));
// Identitas pencatat untuk Log Aktivitas
setActivityActor({ email: userEmail, name: currentUser?.name || "", role: isHardAdmin ? "Super Admin" : (currentUser?.role || "") });

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

  /* ===== TAMPILAN HP (layar < 768px) ===== */
  @media (max-width: 767px) {
    /* Tabel: judul kolom, nomor dokumen, tanggal, nominal & badge tetap 1 baris (nggak kepecah "PO- / 2026- / 0012").
       Nama produk/pelanggan tetap boleh turun baris supaya kolom lain masih kelihatan. */
    .main-container table th,
    .main-container table td.tabular-nums,
    .main-container table td .tabular-nums,
    .main-container table td span.rounded-full,
    .main-container table td button { white-space: nowrap; }
    .main-container table td { min-width: 6.5rem; }
    .main-container table td.font-medium,
    .main-container table td.font-semibold { min-width: 10rem; }
    .main-container table td:has(> input[type="checkbox"]),
    .main-container table th:has(> input[type="checkbox"]) { min-width: 0; width: 2.5rem; }
    /* Form di dalam pop-up: kolom 2-3 jadi 1 kolom (kecuali pratinjau dokumen cetak) */
    .modal-content .grid.grid-cols-2:not([id^="printable"] *):not([id^="printable"]),
    .modal-content .grid.grid-cols-3:not([id^="printable"] *):not([id^="printable"]) { grid-template-columns: minmax(0, 1fr); }
    /* Kartu ringkasan keuangan dashboard: kartu ke-5 selebar layar */
    .dash-fin > :last-child { grid-column: span 2 / span 2; }
  }

  /* Sembunyikan scrollbar sidebar (scroll tetap jalan) */
  .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .hide-scrollbar::-webkit-scrollbar { display: none; }

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
    color: #059669 !important;
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
    .bg-white, .bg-gray-50, .bg-gray-100, .bg-emerald-50, .bg-amber-50, 
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
    tr[style*="background: rgb(236, 253, 245)"],
    tr[style*="background: #ECFDF5"] {
      background-color: #1E293B !important;
    }
    table thead th,
    table thead th * {
      color: #34D399 !important;
      font-weight: 700 !important;
    }

    h1, h2, h3, h4, h5, h6,
    p, a, td,
    div[style*="color: rgb(30, 41, 59)"],
    div[style*="color: #1E293B"],
    span[style*="color: rgb(30, 41, 59)"],
    span[style*="color: #1E293B"] {
      color: #F8FAFC !important;
    }

    .text-gray-500, .text-gray-400,
    div[style*="color: rgb(100, 116, 139)"],
    div[style*="color: #64748B"] {
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
      color: #1E293B !important;
      border-color: #E2E8F0 !important;
    }

    select option {
      background-color: #FFFFFF !important;
      color: #1E293B !important;
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
    /* Laporan (bisa banyak halaman): jangan fixed, biar ngalir ke halaman berikutnya */
    html, body, #root { height: auto !important; overflow: visible !important; }
    .main-container, .main-container * { max-height: none !important; }
    .main-container { overflow: visible !important; }
    .printable-area {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 20px !important;
      border: none !important;
      display: block !important;
      overflow: visible !important;
      background: #ffffff !important;
      box-shadow: none !important;
      color: #000000 !important;
    }
    .printable-area tr { page-break-inside: avoid; break-inside: avoid; }
    .printable-area thead { display: table-header-group; }
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
    /* Saat cetak, paksa semua detail invoice aging tampil */
    .aging-invoice-detail {
      display: table-row !important;
    }
  }
`}</style>

      {/* HEADER HP / MOBILE NAV BAR */}
      {isMobile && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sticky top-0 z-30 border-b no-print"
          style={{ background: isDarkMode ? "#0F172A" : "#FFFFFF", borderColor: COLOR.border, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <img src={companyProfile.logoUrl} alt="Logo" className="h-8 w-8 rounded-md object-contain bg-white shrink-0" style={{ border: `1px solid ${COLOR.border}` }} />
            <div className="min-w-0">
              <div className="font-bold text-sm leading-tight truncate" style={{ color: isDarkMode ? "#34D399" : "#059669" }}>{companyProfile.name}</div>
              <div className="text-[10px] tracking-wider" style={{ color: COLOR.inkSoft }}>ERP SYSTEM</div>
            </div>

          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer"
              style={{ borderColor: COLOR.border }}
              title={isDarkMode ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
            >
              {isDarkMode ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-indigo-500" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-white"
              style={{ background: "#059669" }}
              title={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>
      )}

      {/* SIDEBAR RESPONSIVE (gaya WHISys: putih/slate, menu dikelompokkan, bisa dilipat, motif bulb) */}
      {(() => {
        const collapsed = sidebarCollapsed && !isMobile;
        const SB = {
          bg: isDarkMode ? "#0F172A" : "#FFFFFF",
          border: isDarkMode ? "#1E293B" : "#E2E8F0",
          title: isDarkMode ? "#64748B" : "#94A3B8",
        };
        const GROUPS = [
          { title: "Utama", ids: ["dashboard"] },
          { title: "Master Data", ids: ["products", "stock", "suppliers", "customers"] },
          { title: "Transaksi", ids: ["purchases", "sales", "finance"] },
          { title: "Laporan & Kontrol", ids: ["reports", "qa", "settings", "activity"] },
        ];
        const grouped = new Set(GROUPS.flatMap((g) => g.ids));
        const sections = GROUPS.map((g) => ({ ...g, items: NAV.filter((n) => g.ids.includes(n.id)) }));
        const others = NAV.filter((n) => !grouped.has(n.id));
        if (others.length) sections[sections.length - 1].items.push(...others);
        const hasAlert = lowStock.length > 0 || nearExpiry.length > 0 || expired.length > 0;
        const syncColor = syncState === "error" ? "#EF4444" : syncState === "syncing" ? "#F59E0B" : "#10B981";
        const syncText = syncState === "syncing" ? "Menyinkron..." : syncState === "error" ? "Gagal sync" : `Tersinkron ${new Date(lastSync).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
        return (
          <div
            className={`shrink-0 flex flex-col border-r no-print z-40 transition-all duration-300 ${collapsed ? "w-[68px]" : "w-60"} ${
              isMobile ? (mobileMenuOpen ? "fixed inset-y-0 left-0 shadow-2xl overflow-y-auto hide-scrollbar" : "hidden") : "sticky top-0 h-screen"
            }`}
            style={{ background: SB.bg, borderColor: SB.border }}
          >
            {/* Tombol lipat sidebar (desktop) */}
            {!isMobile && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="absolute -right-3 top-8 z-20 w-6 h-6 rounded-full border flex items-center justify-center shadow-sm cursor-pointer hover:text-emerald-500"
                style={{ background: SB.bg, borderColor: SB.border, color: COLOR.inkSoft }}
                title={collapsed ? "Buka Sidebar" : "Tutup Sidebar"}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>
            )}

            {/* Motif dekoratif: bulb oranye di atas, hijau di bawah (disembunyikan saat dilipat) */}
            {!collapsed && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <svg className="absolute top-0 left-0 w-full" style={{ height: 44 }} viewBox="0 0 220 60" preserveAspectRatio="none">
                  <path fill="#f97316" d="M0,0 L220,0 L220,24 C220,40 180,53 130,50 C95,49 78,60 40,58 C18,56 0,47 0,36 Z" />
                </svg>
                {!isMobile && (
                  <svg className="absolute bottom-0 left-0 w-full" style={{ height: 44 }} viewBox="0 0 220 60" preserveAspectRatio="none">
                    <path fill="#10b981" d="M0,60 L220,60 L220,35 C220,19 182,6 132,9 C97,11 80,0 42,2 C20,4 0,13 0,24 Z" />
                  </svg>
                )}
              </div>
            )}

            {/* Header: logo + nama perusahaan (di bawah motif oranye) */}
            <div className={`relative shrink-0 ${collapsed ? "px-2 pt-4" : "px-4 pt-11"}`}>
              <div className={`flex items-center gap-3 pb-4 mb-3 border-b ${collapsed ? "justify-center pt-4" : "px-1"}`} style={{ borderColor: SB.border }}>
                <img src={companyProfile.logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white shrink-0 shadow-sm" style={{ border: `1px solid ${SB.border}` }} />
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="font-bold text-sm leading-tight truncate" style={{ color: isDarkMode ? "#34D399" : "#059669" }}>{companyProfile.name}</div>
                    <div className="text-[11px] tracking-wider mt-0.5" style={{ color: COLOR.inkSoft }}>ERP SYSTEM</div>
                  </div>
                )}

              </div>
            </div>

            <div className={`${isMobile ? "relative" : "relative flex-1 min-h-0 overflow-y-auto hide-scrollbar"} ${collapsed ? "px-2" : "px-4"}`}>
              {/* Menu per kelompok */}
              <nav className="space-y-1 pb-2">
                {sections.filter((s) => s.items.length).map((s, si) => (
                  <div key={s.title} className="space-y-1">
                    {!collapsed ? (
                      <div className={`px-3 text-[11px] font-semibold uppercase tracking-wider mb-2 ${si === 0 ? "" : "mt-5"}`} style={{ color: SB.title }}>{s.title}</div>
                    ) : (
                      si > 0 && <div className="my-3 mx-2 border-t" style={{ borderColor: SB.border }} />
                    )}
                    {s.items.map((n) => {
                      const Icon = n.icon;
                      const active = tab === n.id;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => { setTab(n.id); if (isMobile) setMobileMenuOpen(false); }}
                          title={collapsed ? n.label : undefined}
                          className={`w-full flex items-center gap-3 py-2 rounded-lg text-sm font-medium text-left transition-all cursor-pointer ${collapsed ? "justify-center px-0" : "px-3"} ${
                            active ? "bg-emerald-600 text-white shadow-md" : `${isDarkMode ? "text-slate-400" : "text-slate-500"} hover:bg-emerald-500/10 hover:text-emerald-500`
                          }`}
                          style={active ? { boxShadow: "0 4px 12px -2px rgba(5, 150, 105, 0.35)" } : undefined}
                        >
                          <Icon size={16} className="shrink-0" />
                          {!collapsed && <span className="truncate">{n.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>

            {/* Footer: peringatan stok, tema, sinkron, akun */}
            <div className={`relative shrink-0 ${collapsed ? "px-2 pb-4" : isMobile ? "px-4 pb-4" : "px-4 pb-12"} pt-3 space-y-2`}>
              {hasAlert && (
                <button
                  type="button"
                  onClick={() => { setTab("stock"); if (isMobile) setMobileMenuOpen(false); }}
                  title={`${lowStock.length} produk stok menipis\n${nearExpiry.length} batch mendekati exp\n${expired.length} batch kedaluwarsa`}
                  className={`w-full flex items-center gap-1.5 rounded-lg border text-xs font-medium cursor-pointer ${collapsed ? "justify-center py-2" : "px-2.5 py-2"}`}
                  style={{ background: isDarkMode ? "rgba(245,158,11,0.10)" : "#FFFBEB", borderColor: isDarkMode ? "rgba(245,158,11,0.3)" : "#FDE68A", color: isDarkMode ? "#FCD34D" : "#B45309" }}
                >
                  <AlertTriangle size={14} className="shrink-0" />
                  {!collapsed && <span className="truncate">{lowStock.length + nearExpiry.length + expired.length} peringatan stok & exp</span>}
                </button>
              )}

              <div className="rounded-lg border p-2 space-y-2" style={{ background: SB.bg, borderColor: SB.border }}>
                <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-emerald-500/10"
                    style={{ color: COLOR.inkSoft }}
                    title={isDarkMode ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"}
                  >
                    {isDarkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-500" />}
                    {!collapsed && (isDarkMode ? "Mode Terang" : "Mode Gelap")}
                  </button>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: COLOR.inkSoft }} title={syncText}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: syncColor }} />
                    {!collapsed && <span>{syncState === "error" ? "Gagal sync" : syncState === "syncing" ? "Sync..." : "Online"}</span>}
                  </div>
                </div>
                {userEmail && (
                  <div className={`flex items-center border-t pt-2 ${collapsed ? "justify-center" : "justify-between gap-2"}`} style={{ borderColor: SB.border }}>
                    {!collapsed && <div className="text-[11px] truncate" style={{ color: COLOR.inkSoft }} title={userEmail}>{userEmail}</div>}
                    <button type="button" onClick={onLogout} className="flex items-center gap-1 text-[11px] shrink-0 cursor-pointer text-red-500 hover:text-red-600" title="Keluar">
                      <LogOut size={13} /> {!collapsed && "Keluar"}
                    </button>
                  </div>
                )}
              </div>
              {!collapsed && (
                <button onClick={() => navigate("/")} className="text-[11px] hover:underline px-1 cursor-pointer" style={{ color: COLOR.inkSoft }}>
                  &larr; Lihat Web Publik
                </button>
              )}
            </div>
            {/* Di HP motif hijau ikut di ujung bawah daftar (nggak nutupin menu) */}
            {isMobile && (
              <svg className="block w-full shrink-0 mt-auto" style={{ height: 44 }} viewBox="0 0 220 60" preserveAspectRatio="none" aria-hidden="true">
                <path fill="#10b981" d="M0,60 L220,60 L220,35 C220,19 182,6 132,9 C97,11 80,0 42,2 C20,4 0,13 0,24 Z" />
              </svg>
            )}
          </div>
        );
      })()}

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
      disposals={disposals}
      saveDisposals={persist.disposals}
      COMPANY_PROFILE={companyProfile}
      invoices={invoices}
      deliveryNotes={deliveryNotes}
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
      calcTax={calcTax} COMPANY_PROFILE={companyProfile}
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
      calcTax={calcTax} COMPANY_PROFILE={companyProfile} CUSTOMER_TYPES={CUSTOMER_TYPES}
    />

  ) : <AccessDenied />
)}

  {/* FINANCE */}
{tab === "finance" && (
  isFinanceOrAdmin ? (
    <FinanceView
      {...{ 
        pos, sos, suppliers, customers, batches, invoices, pInvoices, pReturns, returns, 
        paymentsOut, paymentsIn, expenses, findName, notify,
        arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth,
        invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount, invoiceSisa,
        pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa, calcTax 
      }}
      savePaymentsOut={persist.paymentsOut} 
      savePaymentsIn={persist.paymentsIn} 
      saveExpenses={persist.expenses}
      colorConfig={COLOR} 
      uid={uid} 
      todayISO={todayISO} 
      fmtDate={fmtDate} 
      fmtIDR={fmtIDR}
    />
  ) : <AccessDenied />
)}
        {/* LAPORAN */}
{tab === "reports" && (
  currentUserAccess.includes("reports") ? (
    <ReportsView 
      canSeePnL={isFinanceOrAdmin}
      company={companyProfile}
      products={products} 
      suppliers={suppliers} 
      customers={customers} 
      pos={pos} 
      sos={sos} 
      invoices={invoices} 
      pInvoices={pInvoices} 
      pReceipts={pReceipts}
      returns={returns} 
      pReturns={pReturns} 
      paymentsIn={paymentsIn} /* <-- PASTIKAN PROP INI DISERTAKAN */
      expenses={expenses} 
      batches={batches} 
      deliveryNotes={deliveryNotes} 
      findName={findName} 
      pInvoiceTotal={pInvoiceTotal} 
      invoiceTotal={invoiceTotal} invoiceNetSalesDPP={invoiceNetSalesDPP}
      currentUserEmail={userEmail}
    />
  ) : <AccessDenied />
)}

        {/* REVIEW APJ / PJT (CDOB) */}
        {tab === "qa" && (
          canOpenQA ? (
            <QAView
              products={products} customers={customers} suppliers={suppliers}
              sos={sos} pos={pos} invoices={invoices} pReceipts={pReceipts} pInvoices={pInvoices} batches={batches}
              officers={qaOfficers} saveOfficers={persist.qaOfficers} users={users}
              saveSOs={persist.sos} savePOs={persist.pos} saveInvoices={persist.invoices}
              savePReceipts={persist.pReceipts} savePInvoices={persist.pInvoices} saveBatches={persist.batches}
              userEmail={userEmail} canManage={isHardAdmin || currentUserAccess.includes("settings")}
              findName={findName} notify={notify} colorConfig={COLOR} fmtDate={fmtDate} uid={uid}
              company={companyProfile}
            />

          ) : <AccessDenied />
        )}

        {/* PENGATURAN */}
        {tab === "activity" && (
          isHardAdmin ? <ActivityLogView users={users} colorConfig={COLOR} /> : <AccessDenied />
        )}
        {tab === "settings" && (
          currentUserAccess.includes("settings") ? (
            <SettingsView 
              notify={notify} refreshAll={refreshAll} users={users} 
              saveUsers={persist.users} currentUserEmail={userEmail} isSuperAdminUser={isHardAdmin}
              isDarkMode={isDarkMode} onThemeChange={setThemeMode}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
  <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total SKU</div>
  <div className="text-2xl tabular-nums font-semibold" style={{ color: COLOR.good }}>{(products || []).length}</div>
</Card>
<Card>
  <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Nilai Stok</div>
  <div className="text-lg sm:text-2xl tabular-nums font-semibold break-words" style={{ color: COLOR.good }}>{fmtIDR(totalStockValue)}</div>
</Card>
        <Card style={{ borderColor: lowStock.length ? COLOR.warn : COLOR.border }}>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Stok Menipis</div>
          <div className="text-2xl tabular-nums font-semibold" style={{ color: lowStock.length ? COLOR.warn : COLOR.ink }}>{lowStock.length}</div>
        </Card>
        <Card style={{ borderColor: (nearExpiry.length || expired.length) ? COLOR.danger : COLOR.border }}>
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Mendekati / Lewat Exp</div>
          <div className="text-2xl tabular-nums font-semibold" style={{ color: (nearExpiry.length || expired.length) ? COLOR.danger : COLOR.ink }}>{nearExpiry.length + expired.length}</div>
        </Card>
      </div>

      {/* HANYA TAMPILKAN RINGKASAN MARGIN JIKA ADMIN / FINANCE */}
{isFinanceOrAdmin && (
  <>
    <Eyebrow>Ringkasan keuangan (bulan berjalan)</Eyebrow>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 dash-fin">
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Piutang (AR)</div>
        <div className="text-lg tabular-nums font-semibold" style={{ color: COLOR.warn }}>{fmtIDR(arOutstanding)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Hutang (AP)</div>
        <div className="text-lg tabular-nums font-semibold" style={{ color: COLOR.danger }}>{fmtIDR(apOutstanding)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Kas Masuk</div>
        <div className="text-lg tabular-nums font-semibold" style={{ color: COLOR.good }}>{fmtIDR(cashInMonth)}</div>
      </Card>
      <Card>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Kas Keluar</div>
        <div className="text-lg tabular-nums font-semibold" style={{ color: COLOR.danger }}>{fmtIDR(cashOutMonth)}</div>
      </Card>
      <Card style={{ borderColor: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Laba Kotor (Margin)</div>
        <div className="text-lg tabular-nums font-semibold" style={{ color: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>{fmtIDR(grossProfitMonth)}</div>
      </Card>
    </div>
  </>
)}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <span style={{ color: COLOR.ink }}>{p ? p.name : "-"} <span className="tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>({b.batchNo})</span></span>
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
                <span className="tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(po.date)}</span>
              </div>
            ))}
            {recentSOs.map((so) => (
              <div key={so.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <span className="flex items-center gap-1.5" style={{ color: COLOR.ink }}><ArrowUpRight size={14} color={COLOR.good} /> {so.soNumber} · {findName(customers, so.customerId)}</span>
                <span className="tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</span>
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




// ---------- LAPORAN BERBASIS FAKTUR & LABA RUGI PER PERIODE ----------

// --- Komponen baris detail item (dipakai oleh Sales & Purchase report tab) ---
// Di layar: tersembunyi by default, muncul kalau induk di-expand.
// Di print: selalu muncul (CSS @media print).
function InvoiceItemRows({ doc, products, fmtIDR, COLOR, colSpan }) {
  return (
    <tr
      className="report-invoice-detail"
      style={{ borderTop: `1px solid ${COLOR.border}`, background: "#f4f7fb" }}
    >
      <td />
      <td colSpan={colSpan}>
        <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingBottom: 2, color: COLOR.inkSoft, fontWeight: 600 }}>Produk</th>
              <th style={{ textAlign: "center", paddingBottom: 2, color: COLOR.inkSoft, fontWeight: 600 }}>Qty</th>
              <th style={{ textAlign: "right", paddingBottom: 2, color: COLOR.inkSoft, fontWeight: 600 }}>Harga Satuan</th>
              <th style={{ textAlign: "right", paddingBottom: 2, color: COLOR.inkSoft, fontWeight: 600 }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(doc.items || []).map((it, idx) => {
              const p = (products || []).find((x) => x.id === it.productId);
              const lineTotal = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
              return (
                <tr key={idx}>
                  <td style={{ padding: "2px 0", color: COLOR.ink }}>{p?.name || "-"}</td>
                  <td style={{ textAlign: "center", padding: "2px 4px", color: COLOR.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                    {it.qty} {p?.unit || ""}
                  </td>
                  <td style={{ textAlign: "right", padding: "2px 0", color: COLOR.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                    {fmtIDR(it.unitPrice)}
                  </td>
                  <td style={{ textAlign: "right", padding: "2px 0", fontWeight: 600, color: COLOR.ink, fontVariantNumeric: "tabular-nums" }}>
                    {fmtIDR(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// Style global: baris detail SELALU tampil saat print
const REPORT_PRINT_STYLE = `
  @media print {
    .report-invoice-detail { display: table-row !important; }
    .report-toggle-btn { display: none !important; }
  }
`;

const HPP_ISSUE_LABEL = {
  sj_belum_diterima: "SJ belum diterima",
  tanpa_alokasi: "tanpa alokasi batch",
  batch_terhapus: "batch sudah terhapus",
  modal_nol: "harga modal batch 0",
  dipulihkan: "modal dipulihkan dari faktur beli",
};
const HPP_ISSUE_HELP = {
  sj_belum_diterima: "Surat Jalan untuk SO ini belum dikonfirmasi diterima.",
  tanpa_alokasi: "Produk ini nggak tercatat ambil dari batch mana (data lama / SJ nggak memuat produk ini).",
  batch_terhapus: "Batch yang dipakai waktu jual udah nggak ada di Stok (kehapus waktu edit/batal faktur pembelian langsung, atau dihapus manual).",
  modal_nol: "Batch-nya ada tapi harga modalnya 0 / kosong (biasanya dari input stok manual atau import CSV).",
  dipulihkan: "Batch aslinya sudah hilang / modalnya 0, harga modal diambil dari Faktur Pembelian / BPB dengan batch yang sama. Ini info aja, HPP-nya udah keisi.",
};

function SalesReportTab({ start, end, salesTotal, allSalesDocs, products, COLOR, fmtDate, fmtIDR, profitById = {}, showHpp = false, pnlData, companyName }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (id) => setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const allOpen = allSalesDocs.length > 0 && allSalesDocs.every((d) => expanded.has(d.id));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(allSalesDocs.map((d) => d.id)));
  const pct = (part, whole) => (whole > 0 ? ((part / whole) * 100).toFixed(1) + "%" : "-");
  const productOf = (pid) => (products || []).find((x) => x.id === pid);

  // Rekap per produk (subtotal setelah diskon item + HPP)
  const agg = {};
  allSalesDocs.forEach((doc) => {
    (profitById[doc.id]?.items || []).forEach((it) => {
      if (!agg[it.productId]) agg[it.productId] = { qty: 0, value: 0, hpp: 0 };
      agg[it.productId].qty += it.qty;
      agg[it.productId].value += it.lineTotal;
      agg[it.productId].hpp += it.hppTotal;
    });
  });
  const aggRows = Object.entries(agg).sort((a, b) => b[1].value - a[1].value);

  // Hitung item yang HPP-nya bermasalah, per penyebab
  const issueCount = {};
  allSalesDocs.forEach((doc) => (profitById[doc.id]?.items || []).forEach((it) => {
    if (it.hppIssue) issueCount[it.hppIssue] = (issueCount[it.hppIssue] || 0) + 1;
  }));
  const issueEntries = Object.entries(issueCount);

  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const mainCols = ["No. Faktur", "Tipe", "Pelanggan", "Tanggal"];
  const colCount = 1 + mainCols.length + 1 + (showHpp ? 4 : 0);

  return (
    <div className="printable-area">
      <style>{REPORT_PRINT_STYLE}</style>

      <div className="flex justify-end gap-2 mb-2 no-print">
        <Button onClick={toggleAll} variant="ghost" className="text-xs">{allOpen ? "Tutup Semua" : "Buka Semua"}</Button>
        <Button onClick={() => window.print()} variant="ghost" className="text-xs"><Printer size={14} /> Cetak Laporan</Button>
      </div>
      <div className="border-b pb-3 mb-4 text-center">
        <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{companyName || "PT WIRYATAMA PUTERA MANDIRI"}</div>
        <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>{showHpp ? "Laporan Penjualan & Laba Kotor" : "Laporan Penjualan"}</h3>
        <p className="text-xs text-gray-500">Periode: {fmtDate(start)} s/d {fmtDate(end)}</p>
      </div>

      {showHpp && pnlData ? (
        <Card className="mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm tabular-nums">
            <div><div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Penjualan (DPP)</div><div className="font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(pnlData.grossSalesDPP)}</div></div>
            <div><div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>(-) Retur</div><div className="font-semibold text-red-600">{fmtIDR(pnlData.salesReturnsVal)}</div></div>
            <div><div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>(-) HPP</div><div className="font-semibold text-red-600">{fmtIDR(pnlData.totalCOGS)}</div></div>
            <div><div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Laba Kotor</div><div className="font-bold text-emerald-700">{fmtIDR(pnlData.grossProfit)}</div></div>
            <div><div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Margin Kotor</div><div className="font-semibold" style={{ color: COLOR.ink }}>{pct(pnlData.grossProfit, pnlData.netSales)}</div></div>
          </div>
          <div className="text-[11px] mt-3 pt-2 border-t" style={{ color: COLOR.inkSoft, borderColor: COLOR.border }}>
            Total tagihan faktur (termasuk PPN/ongkir, setelah fee): <span className="font-semibold tabular-nums">{fmtIDR(salesTotal)}</span>. Angka DPP, Retur, HPP & Laba Kotor di atas dihitung dengan rumus yang sama dengan Laporan Laba Rugi periode ini, jadi harus sama persis.
          </div>
        </Card>
      ) : (
        <Card className="mb-4">
          <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Penjualan Berdasarkan Faktur ({fmtDate(start)} – {fmtDate(end)})</div>
          <div className="text-xl tabular-nums font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(salesTotal)}</div>
        </Card>
      )}

      {showHpp && issueEntries.length > 0 && (
        <Card className="mb-4 !p-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
          <div className="text-xs font-semibold mb-1" style={{ color: "#92400E" }}>Ada item yang HPP-nya kosong / nggak lengkap di periode ini:</div>
          <ul className="text-xs space-y-0.5" style={{ color: "#92400E" }}>
            {issueEntries.map(([k, n]) => <li key={k}>• <b>{HPP_ISSUE_LABEL[k]}</b>: {n} item. {HPP_ISSUE_HELP[k]}</li>)}
          </ul>
        </Card>
      )}

      <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Rekap Produk Difakturkan</div>
      <Card className="!p-0 mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                <th className={th} style={{ color: COLOR.primary }}>Produk</th>
                <th className={thR} style={{ color: COLOR.primary }}>Qty Terjual</th>
                <th className={thR} style={{ color: COLOR.primary }}>Nilai Penjualan</th>
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>Total HPP</th>}
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>Margin</th>}
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>%</th>}
              </tr>
            </thead>
            <tbody>
              {aggRows.map(([pid, a]) => {
                const p = productOf(pid);
                return (
                  <tr key={pid} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-3 py-2" style={{ color: COLOR.ink }}>{p?.name || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: COLOR.inkSoft }}>{a.qty} {p?.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: COLOR.ink }}>{fmtIDR(a.value)}</td>
                    {showHpp && <td className="px-3 py-2 text-right tabular-nums text-red-600">{fmtIDR(a.hpp)}</td>}
                    {showHpp && <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: a.value - a.hpp >= 0 ? "#047857" : "#DC2626" }}>{fmtIDR(a.value - a.hpp)}</td>}
                    {showHpp && <td className="px-3 py-2 text-right tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{pct(a.value - a.hpp, a.value)}</td>}
                  </tr>
                );
              })}
              {aggRows.length === 0 && <tr><td colSpan={showHpp ? 6 : 3} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Penjualan di periode ini.</td></tr>}
            </tbody>
          </table>
        </div>
        {showHpp && aggRows.length > 0 && (
          <div className="px-3 py-2 text-[11px] border-t" style={{ color: COLOR.inkSoft, borderColor: COLOR.border }}>
            Nilai penjualan per produk = qty x harga setelah diskon item, sebelum diskon nota & pajak. Margin final per faktur ada di daftar di bawah.
          </div>
        )}
      </Card>

      <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Daftar Faktur Penjualan {showHpp && "(klik baris buat lihat rincian harga jual vs HPP)"}</div>
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                <th className="w-8 px-2 py-2 report-toggle-btn" />
                {mainCols.map((h) => <th key={h} className={th} style={{ color: COLOR.primary }}>{h}</th>)}
                <th className={thR} style={{ color: COLOR.primary }}>Total Tagihan</th>
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>DPP</th>}
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>HPP</th>}
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>Laba Kotor</th>}
                {showHpp && <th className={thR} style={{ color: COLOR.primary }}>%</th>}
              </tr>
            </thead>
            <tbody>
              {allSalesDocs.map((doc) => {
                const isOpen = expanded.has(doc.id);
                const pr = profitById[doc.id] || { items: [], raw: 0, diskon: 0, dpp: 0, retVal: 0, cogsNet: 0, retCogs: 0, invCogs: 0, hppAdjust: 0, grossProfit: 0 };
                const netSales = pr.dpp - pr.retVal;
                const lossTone = pr.grossProfit < 0 ? "#DC2626" : "#047857";
                return (
                  <Fragment key={doc.id}>
                    <tr style={{ borderTop: `1px solid ${COLOR.border}`, cursor: "pointer" }} onClick={() => toggle(doc.id)}>
                      <td className="px-2 py-2.5 text-center select-none report-toggle-btn" style={{ color: COLOR.primary }}>
                        <span style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", fontSize: 11, fontWeight: 700 }}>▶</span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold whitespace-nowrap" style={{ color: COLOR.ink }}>{doc.docNumber}</td>
                      <td className="px-3 py-2.5"><Badge tone={doc.type === "Langsung" ? "warn" : "neutral"}>{doc.type}</Badge></td>
                      <td className="px-3 py-2.5" style={{ color: COLOR.ink }}>{doc.partyName}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs whitespace-nowrap" style={{ color: COLOR.inkSoft }}>{fmtDate(doc.date)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(doc.total)}</td>
                      {showHpp && <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: COLOR.ink }}>{fmtIDR(pr.dpp)}</td>}
                      {showHpp && <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{fmtIDR(pr.cogsNet)}</td>}
                      {showHpp && <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: lossTone }}>{fmtIDR(pr.grossProfit)}</td>}
                      {showHpp && <td className="px-3 py-2.5 text-right tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{pct(pr.grossProfit, netSales)}</td>}
                    </tr>

                    {/* Detail – tersembunyi di layar kalau belum dibuka, selalu muncul saat print */}
                    <tr className="report-invoice-detail" style={{ borderTop: `1px solid ${COLOR.border}`, background: "#f4f7fb", display: isOpen ? "table-row" : "none" }}>
                      <td className="report-toggle-btn" />
                      <td colSpan={colCount - 1} style={{ padding: "6px 12px 10px" }}>
                        <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: COLOR.inkSoft }}>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>Produk</th>
                              <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>Qty</th>
                              <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>Harga Jual</th>
                              <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>Subtotal</th>
                              {showHpp && <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>HPP / Unit</th>}
                              {showHpp && <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>Total HPP</th>}
                              {showHpp && <th style={{ textAlign: "right", paddingBottom: 3, fontWeight: 600 }}>Margin</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {pr.items.map((it, idx) => {
                              const p = productOf(it.productId);
                              const margin = it.lineTotal - it.hppTotal;
                              return (
                                <tr key={idx} style={{ borderTop: "1px dashed #dbe3ee" }}>
                                  <td style={{ padding: "3px 0", color: COLOR.ink }}>{p?.name || "-"}</td>
                                  <td style={{ textAlign: "right", padding: "3px 6px", color: COLOR.inkSoft, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{it.qty} {p?.unit || ""}</td>
                                  <td style={{ textAlign: "right", padding: "3px 6px", color: COLOR.inkSoft, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(it.unitPrice)}</td>
                                  <td style={{ textAlign: "right", padding: "3px 6px", fontWeight: 600, color: COLOR.ink, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(it.lineTotal)}</td>
                                  {showHpp && <td style={{ textAlign: "right", padding: "3px 6px", color: COLOR.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                                    {it.hppUnit > 0 ? fmtIDR(it.hppUnit) : null}
                                    {it.hppIssue && <div style={{ color: "#D97706", fontSize: 10, fontWeight: 600 }}>{HPP_ISSUE_LABEL[it.hppIssue]}</div>}
                                    {(it.trace || []).map((t, ti) => (
                                      <div key={ti} style={{ fontSize: 9.5, color: "#64748B", whiteSpace: "nowrap" }}>
                                        Batch {t.batchNo}: {t.qty} × {fmtIDR(t.unit)} · {t.src}{t.byNo ? " (cocok No. Batch)" : ""}
                                      </div>
                                    ))}
                                  </td>}
                                  {showHpp && <td style={{ textAlign: "right", padding: "3px 6px", color: "#DC2626", fontVariantNumeric: "tabular-nums" }}>{fmtIDR(it.hppTotal)}</td>}
                                  {showHpp && <td style={{ textAlign: "right", padding: "3px 0", fontWeight: 600, color: margin < 0 ? "#DC2626" : "#047857", fontVariantNumeric: "tabular-nums" }}>{fmtIDR(margin)}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {showHpp && (
                          <div style={{ marginTop: 8, marginLeft: "auto", maxWidth: 340, fontSize: "11px", fontVariantNumeric: "tabular-nums" }}>
                            <div className="flex justify-between py-0.5"><span style={{ color: COLOR.inkSoft }}>Subtotal item</span><span>{fmtIDR(pr.raw)}</span></div>
                            {pr.diskon > 0 && <div className="flex justify-between py-0.5 text-red-600"><span>(-) Diskon nota</span><span>- {fmtIDR(pr.diskon)}</span></div>}
                            {Math.abs(pr.raw - pr.diskon - pr.dpp) >= 1 && <div className="flex justify-between py-0.5 text-red-600"><span>(-) PPN termasuk harga</span><span>- {fmtIDR(pr.raw - pr.diskon - pr.dpp)}</span></div>}
                            <div className="flex justify-between py-0.5 font-semibold border-t" style={{ borderColor: COLOR.border }}><span>Penjualan (DPP)</span><span>{fmtIDR(pr.dpp)}</span></div>
                            {pr.retVal > 0 && <div className="flex justify-between py-0.5 text-red-600"><span>(-) Retur penjualan</span><span>- {fmtIDR(pr.retVal)}</span></div>}
                            <div className="flex justify-between py-0.5 text-red-600"><span>(-) HPP barang terkirim</span><span>- {fmtIDR(pr.invCogs)}</span></div>
                            {pr.retCogs > 0 && <div className="flex justify-between py-0.5 text-emerald-700"><span>(+) HPP barang diretur</span><span>+ {fmtIDR(Math.min(pr.retCogs, pr.invCogs))}</span></div>}
                            <div className="flex justify-between py-1 font-bold border-t" style={{ borderColor: COLOR.border, color: lossTone }}><span>Laba Kotor</span><span>{fmtIDR(pr.grossProfit)}</span></div>
                            {Math.abs(pr.hppAdjust) >= 1 && (
                              <div className="mt-1 text-[10px]" style={{ color: "#B45309" }}>
                                Catatan: HPP dari Surat Jalan beda {fmtIDR(Math.abs(pr.hppAdjust))} dari HPP qty di faktur (qty kirim ≠ qty faktur, atau ada produk di SJ yang nggak ada di faktur). Laba kotor tetap pakai HPP Surat Jalan, sama dengan Laba Rugi.
                              </div>
                            )}
                            {pr.invCogs === 0 && (
                              <div className="mt-1 text-[10px]" style={{ color: "#B45309" }}>
                                Catatan: HPP masih 0. Biasanya karena Surat Jalan belum berstatus diterima, atau batch belum punya harga modal.
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {allSalesDocs.length === 0 && <tr><td colSpan={colCount} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Penjualan di periode ini.</td></tr>}
            </tbody>
            {showHpp && allSalesDocs.length > 0 && pnlData && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${COLOR.border}`, background: COLOR.primarySoft }}>
                  <td className="report-toggle-btn" />
                  <td colSpan={mainCols.length} className="px-3 py-2.5 text-xs font-bold uppercase" style={{ color: COLOR.primary }}>Total Periode</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmtIDR(salesTotal)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmtIDR(pnlData.grossSalesDPP)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-red-600">{fmtIDR(pnlData.totalCOGS)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmtIDR(pnlData.grossProfit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{pct(pnlData.grossProfit, pnlData.netSales)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

function PurchaseReportTab({ start, end, purchaseTotal, allPurchaseDocs, products, COLOR, fmtDate, fmtIDR, companyName }) {
  const [expanded, setExpanded] = useState(new Set());
  const [expandedProd, setExpandedProd] = useState(new Set());
  const [prodSearch, setProdSearch] = useState("");
  const toggle = (id) => setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleProd = (id) => setExpandedProd((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const productOf = (pid) => (products || []).find((x) => x.id === pid);
  const netUnit = (it, doc) => { const q = Number(it.qty) || 0; return q > 0 ? (itemLineTotal(it) / q) * (doc?.notaRatio ?? 1) : 0; };

  // Rekap per produk + daftar faktur pembelian asalnya (buat tracking harga beli)
  const prodMap = {};
  allPurchaseDocs.forEach((doc) => {
    (doc.items || []).forEach((it) => {
      const pid = it.productId;
      if (!prodMap[pid]) prodMap[pid] = { qty: 0, value: 0, modal: 0, lines: [] };
      const q = Number(it.qty) || 0;
      const lt = itemLineTotal(it);
      prodMap[pid].qty += q;
      prodMap[pid].value += lt;
      prodMap[pid].modal += q * netUnit(it, doc);
      prodMap[pid].lines.push({
        key: `${doc.id}-${prodMap[pid].lines.length}`,
        docNumber: doc.docNumber, partyName: doc.partyName, date: doc.date, type: doc.type,
        batchNo: it.batchNo || "-", qty: q, unitPrice: Number(it.unitPrice) || 0,
        discAmt: Math.max(0, q * (Number(it.unitPrice) || 0) - lt), notaPct: (1 - (doc.notaRatio ?? 1)) * 100, netUnit: netUnit(it, doc), lineTotal: lt,
      });
    });
  });
  const q = prodSearch.trim().toLowerCase();
  const prodRows = Object.entries(prodMap)
    .filter(([pid]) => !q || (productOf(pid)?.name || "").toLowerCase().includes(q))
    .sort((a, b) => b[1].value - a[1].value);
  const allProdOpen = prodRows.length > 0 && prodRows.every(([pid]) => expandedProd.has(pid));
  const allInvOpen = allPurchaseDocs.length > 0 && allPurchaseDocs.every((d) => expanded.has(d.id));

  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const sub = { textAlign: "right", padding: "3px 6px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div className="printable-area">
      <style>{REPORT_PRINT_STYLE}</style>

      <div className="flex justify-end gap-2 mb-2 no-print">
        <Button onClick={() => window.print()} variant="ghost" className="text-xs"><Printer size={14} /> Cetak Laporan</Button>
      </div>
      <div className="border-b pb-3 mb-4 text-center">
        <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{companyName || "PT WIRYATAMA PUTERA MANDIRI"}</div>
        <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>Laporan Pembelian</h3>
        <p className="text-xs text-gray-500">Periode: {fmtDate(start)} s/d {fmtDate(end)}</p>
      </div>

      <Card className="mb-4">
        <div className="text-xs mb-1" style={{ color: COLOR.inkSoft }}>Total Pembelian Berdasarkan Faktur Vendor ({fmtDate(start)} – {fmtDate(end)})</div>
        <div className="text-xl tabular-nums font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(purchaseTotal)}</div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Rekap Produk Difakturkan (klik produk buat lihat faktur pembelian asalnya)</div>
        <div className="flex gap-2 no-print">
          <TextInput placeholder="Cari produk..." value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
          <Button onClick={() => setExpandedProd(allProdOpen ? new Set() : new Set(prodRows.map(([pid]) => pid)))} variant="ghost" className="text-xs whitespace-nowrap">{allProdOpen ? "Tutup Semua" : "Buka Semua"}</Button>
        </div>
      </div>
      <Card className="!p-0 mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                <th className="w-8 px-2 py-2 report-toggle-btn" />
                <th className={th} style={{ color: COLOR.primary }}>Produk</th>
                <th className={thR} style={{ color: COLOR.primary }}>Jml. Faktur</th>
                <th className={thR} style={{ color: COLOR.primary }}>Qty Dibeli</th>
                <th className={thR} style={{ color: COLOR.primary }}>Rata-rata Harga Modal</th>
                <th className={thR} style={{ color: COLOR.primary }}>Nilai Beli</th>
              </tr>
            </thead>
            <tbody>
              {prodRows.map(([pid, a]) => {
                const p = productOf(pid);
                const isOpen = expandedProd.has(pid);
                const prices = a.lines.map((l) => Math.round(l.netUnit));
                const priceVaries = new Set(prices).size > 1;
                return (
                  <Fragment key={pid}>
                    <tr style={{ borderTop: `1px solid ${COLOR.border}`, cursor: "pointer" }} onClick={() => toggleProd(pid)}>
                      <td className="px-2 py-2.5 text-center select-none report-toggle-btn" style={{ color: COLOR.primary }}>
                        <span style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", fontSize: 11, fontWeight: 700 }}>▶</span>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: COLOR.ink }}>
                        {p?.name || "-"}
                        {priceVaries && <span className="ml-2 text-[10px] font-semibold" style={{ color: "#B45309" }}>harga beli beda-beda</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{a.lines.length}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: COLOR.inkSoft }}>{a.qty} {p?.unit}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: COLOR.ink }}>{fmtIDR(a.qty > 0 ? a.modal / a.qty : 0)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(a.value)}</td>
                    </tr>
                    <tr className="report-invoice-detail" style={{ background: "#f4f7fb", display: isOpen ? "table-row" : "none" }}>
                      <td className="report-toggle-btn" />
                      <td colSpan={5} style={{ padding: "6px 12px 10px" }}>
                        <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: COLOR.inkSoft }}>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>No. Faktur Vendor</th>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>Supplier</th>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>Tanggal</th>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>No. Batch</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Qty</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Harga Beli</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Diskon Item</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Diskon Nota</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Harga Modal / {p?.unit || "unit"}</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.lines.map((l) => (
                              <tr key={l.key} style={{ borderTop: "1px dashed #dbe3ee" }}>
                                <td style={{ padding: "3px 0", fontWeight: 600, color: COLOR.ink, whiteSpace: "nowrap" }}>{l.docNumber}</td>
                                <td style={{ padding: "3px 6px", color: COLOR.ink }}>{l.partyName}</td>
                                <td style={{ padding: "3px 6px", color: COLOR.inkSoft, whiteSpace: "nowrap" }}>{fmtDate(l.date)}</td>
                                <td style={{ padding: "3px 6px", color: COLOR.inkSoft }}>{l.batchNo}</td>
                                <td style={{ ...sub, color: COLOR.inkSoft }}>{l.qty} {p?.unit || ""}</td>
                                <td style={{ ...sub, color: COLOR.inkSoft }}>{fmtIDR(l.unitPrice)}</td>
                                <td style={{ ...sub, color: l.discAmt > 0 ? "#DC2626" : COLOR.inkSoft }}>{l.discAmt > 0 ? `- ${fmtIDR(l.discAmt)}` : "-"}</td>
                                <td style={{ ...sub, color: l.notaPct > 0.005 ? "#DC2626" : COLOR.inkSoft }}>{l.notaPct > 0.005 ? `- ${l.notaPct.toFixed(2).replace(/\.?0+$/, "")}%` : "-"}</td>
                                <td style={{ ...sub, fontWeight: 700, color: COLOR.ink }}>{fmtIDR(l.netUnit)}</td>
                                <td style={{ ...sub, fontWeight: 600, color: COLOR.ink }}>{fmtIDR(l.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {prodRows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>{q ? `Nggak ada produk yang cocok dengan "${prodSearch}" di periode ini.` : "Tidak ada Faktur Pembelian di periode ini."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-[11px] border-t" style={{ color: COLOR.inkSoft, borderColor: COLOR.border }}>
          Harga Modal = harga beli setelah diskon item & diskon nota (dibagi proporsional), tanpa PPN. Ini angka yang sama dipakai jadi HPP batch.
          Kalau faktur yang dicari nggak muncul, lebarin rentang tanggal di atas.
        </div>
      </Card>

      <div className="flex items-end justify-between gap-2 mb-2">
        <div className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>Daftar Faktur Pembelian</div>
        <Button onClick={() => setExpanded(allInvOpen ? new Set() : new Set(allPurchaseDocs.map((d) => d.id)))} variant="ghost" className="text-xs no-print">{allInvOpen ? "Tutup Semua" : "Buka Semua"}</Button>
      </div>
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                <th className="w-8 px-2 py-2 report-toggle-btn" />
                {["No. Faktur Vendor", "Tipe", "Supplier", "Tanggal"].map((h) => (
                  <th key={h} className={th} style={{ color: COLOR.primary }}>{h}</th>
                ))}
                <th className={thR} style={{ color: COLOR.primary }}>Total Tagihan</th>
              </tr>
            </thead>
            <tbody>
              {allPurchaseDocs.map((doc) => {
                const isOpen = expanded.has(doc.id);
                return (
                  <Fragment key={doc.id}>
                    <tr style={{ borderTop: `1px solid ${COLOR.border}`, cursor: "pointer" }} onClick={() => toggle(doc.id)}>
                      <td className="px-2 py-2.5 text-center select-none report-toggle-btn" style={{ color: COLOR.primary }}>
                        <span style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", fontSize: 11, fontWeight: 700 }}>▶</span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold whitespace-nowrap" style={{ color: COLOR.ink }}>{doc.docNumber}</td>
                      <td className="px-3 py-2.5"><Badge tone={doc.type === "Langsung" ? "warn" : "neutral"}>{doc.type}</Badge></td>
                      <td className="px-3 py-2.5" style={{ color: COLOR.ink }}>{doc.partyName}</td>
                      <td className="px-3 py-2.5 tabular-nums text-xs whitespace-nowrap" style={{ color: COLOR.inkSoft }}>{fmtDate(doc.date)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: COLOR.ink }}>{fmtIDR(doc.total)}</td>
                    </tr>
                    <tr className="report-invoice-detail" style={{ borderTop: `1px solid ${COLOR.border}`, background: "#f4f7fb", display: isOpen ? "table-row" : "none" }}>
                      <td className="report-toggle-btn" />
                      <td colSpan={5} style={{ padding: "6px 12px 10px" }}>
                        <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: COLOR.inkSoft }}>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>Produk</th>
                              <th style={{ textAlign: "left", paddingBottom: 3, fontWeight: 600 }}>No. Batch</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Qty</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Harga Beli</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Harga Modal</th>
                              <th style={{ ...sub, fontWeight: 600 }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(doc.items || []).map((it, idx) => {
                              const p = productOf(it.productId);
                              return (
                                <tr key={idx} style={{ borderTop: "1px dashed #dbe3ee" }}>
                                  <td style={{ padding: "3px 0", color: COLOR.ink }}>{p?.name || "-"}</td>
                                  <td style={{ padding: "3px 6px", color: COLOR.inkSoft }}>{it.batchNo || "-"}</td>
                                  <td style={{ ...sub, color: COLOR.inkSoft }}>{it.qty} {p?.unit || ""}</td>
                                  <td style={{ ...sub, color: COLOR.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                                  <td style={{ ...sub, fontWeight: 600, color: COLOR.ink }}>{fmtIDR(netUnit(it, doc))}</td>
                                  <td style={{ ...sub, fontWeight: 600, color: COLOR.ink }}>{fmtIDR(itemLineTotal(it))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {allPurchaseDocs.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada Faktur Pembelian di periode ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReportsView({ products, suppliers, customers, pos, sos, invoices, pInvoices, pReceipts, returns, pReturns, paymentsIn, expenses, batches, deliveryNotes, findName, pInvoiceTotal, invoiceTotal, invoiceNetSalesDPP, currentUserEmail, canSeePnL, company }) {
  const isSuperAdminOrFinance = !!canSeePnL || ADMIN_FINANCE_EMAILS.includes((currentUserEmail || "").toLowerCase());

  const [subTab, setSubTab] = useState(isSuperAdminOrFinance ? "pnl" : "sales");
  const [start, setStart] = useState(() => startOfMonthISO());
  const [end, setEnd] = useState(todayISO());


  // State Khusus Filter AR Aging
  const [agingCust, setAgingCust] = useState("ALL");
  const [agingBucket, setAgingBucket] = useState("ALL");
  const [agingSearch, setAgingSearch] = useState("");
  const [expandedAgingCusts, setExpandedAgingCusts] = useState(new Set());

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
        total: pInvoiceTotal(inv),
        // faktor diskon nota (ikut ngurangin harga modal)
        notaRatio: (() => { const b = computeBill(inv); return b.raw > 0 ? (b.raw - b.diskon) / b.raw : 1; })()
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

  const costOf = useMemo(() => makeCostResolver(batches, pInvoices, pReceipts, pos), [batches, pInvoices, pReceipts, pos]);

  // 3. KALKULASI AR AGING (UMUR PIUTANG)
  const agingData = useMemo(() => {
    const today = new Date(todayISO());

    const raw = (invoices || []).map((inv) => {
      const paid = (paymentsIn || [])
        .filter((p) => p.invoiceId === inv.id)
        .reduce((s, p) => s + Number(p.amount || 0), 0);

      const ret = (returns || [])
        .filter((r) => r.invoiceId === inv.id)
        .reduce((s, r) => s + (r.items || []).reduce((sub, it) => sub + (it.qty * it.unitPrice), 0), 0);

      const total = inv.totalAmount || inv.total || invoiceTotal(inv);
      const sisaHutang = Math.max(0, total - paid - ret);

      const invDate = new Date(inv.date || todayISO());
      const diffDays = Math.floor((today - invDate) / (1000 * 60 * 60 * 24));

      let bucket = "current";
      if (diffDays > 90) bucket = "over90";
      else if (diffDays > 60) bucket = "61-90";
      else if (diffDays > 30) bucket = "31-60";

      return {
        ...inv,
        sisaHutang,
        ageDays: Math.max(0, diffDays),
        bucket
      };
    }).filter((x) => x.sisaHutang > 0);

    return raw.filter((item) => {
      const custName = findName(customers, item.customerId).toLowerCase();
      const invNum = (item.noFaktur || "").toLowerCase();
      const q = agingSearch.toLowerCase();

      const matchSearch = invNum.includes(q) || custName.includes(q);
      const matchCust = agingCust === "ALL" || item.customerId === agingCust;
      const matchBucket = agingBucket === "ALL" || item.bucket === agingBucket;

      return matchSearch && matchCust && matchBucket;
    });
  }, [invoices, paymentsIn, returns, customers, agingCust, agingBucket, agingSearch, findName, invoiceTotal]);

  const totalARAging = agingData.reduce((s, i) => s + i.sisaHutang, 0);

  // Group per pelanggan untuk tampilan akumulasi (accordion)
  const agingByCustomer = useMemo(() => {
    const map = {};
    agingData.forEach((item) => {
      const cid = item.customerId || "__unknown__";
      if (!map[cid]) {
        map[cid] = {
          customerId: cid,
          customerName: findName(customers, cid),
          totalSisa: 0,
          invoices: [],
          // bucket terburuk untuk badge summary
          worstBucket: "current",
        };
      }
      map[cid].totalSisa += item.sisaHutang;
      map[cid].invoices.push(item);
      // tentukan bucket terburuk
      const bucketOrder = { current: 0, "31-60": 1, "61-90": 2, over90: 3 };
      if ((bucketOrder[item.bucket] ?? 0) > (bucketOrder[map[cid].worstBucket] ?? 0)) {
        map[cid].worstBucket = item.bucket;
      }
    });
    return Object.values(map).sort((a, b) => b.totalSisa - a.totalSisa);
  }, [agingData, customers, findName]);


  const exportAgingCSV = () => {
    const headers = ["No. Faktur", "Pelanggan", "Tanggal Faktur", "Umur (Hari)", "Status Aging", "Sisa Piutang"];
    const rows = agingData.map((d) => [
      d.noFaktur,
      `"${findName(customers, d.customerId)}"`,
      fmtDate(d.date),
      d.ageDays,
      d.bucket === "current" ? "0-30 Hari" : d.bucket === "31-60" ? "31-60 Hari" : d.bucket === "61-90" ? "61-90 Hari" : "> 90 Hari",
      d.sisaHutang
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Umur_Piutang_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 4a. RINCIAN LABA KOTOR PER FAKTUR (harga jual vs HPP)
  // Rumusnya di computeInvoiceProfit (satu sumber buat Laporan Penjualan, Laba Rugi & Dashboard).
  const invoiceProfitRows = useMemo(
    () => filteredInvoices.map((inv) => ({ id: inv.id, ...computeInvoiceProfit(inv, { batches, deliveryNotes, returns, costOf }) })),
    [filteredInvoices, returns, deliveryNotes, batches, costOf]
  );

  const profitById = useMemo(() => {
    const m = {};
    invoiceProfitRows.forEach((r) => { m[r.id] = r; });
    return m;
  }, [invoiceProfitRows]);

  // 4b. KALKULASI HPP & LABA RUGI PER PERIODE
  const pnlData = useMemo(() => {
    let grossSalesDPP = 0;
    let salesReturnsVal = 0;
    let totalCOGS = 0;

    invoiceProfitRows.forEach((r) => {
      grossSalesDPP += r.dpp;
      salesReturnsVal += r.retVal;
      totalCOGS += r.cogsNet;
    });

    const netSales = Math.max(0, grossSalesDPP - salesReturnsVal);
    const grossProfit = netSales - totalCOGS;

    let periodExpenses = 0;
    // Rincian beban operasional per kategori akun (buat ditampilkan & dicetak)
    const expenseByCategory = {};
    (expenses || []).forEach((e) => {
      if (!inRange(e.date)) return;
      const val = e.category === "Sewa Dibayar di Muka (Prepaid 1 Tahun)"
        ? (Number(e.amount) || 0) / 12
        : (Number(e.amount) || 0);
      periodExpenses += val;
      const cat = e.category || "Lain-lain";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + val;
    });
    const expenseCategoryList = Object.entries(expenseByCategory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    // Ongkir dari Faktur Pembelian sengaja TIDAK masuk HPP (biar cost produk tetap murni
    // harga barang), tapi tetap dihitung sebagai beban operasional periode berjalan.
    const ongkirPembelian = (pInvoices || []).filter((pi) => inRange(pi.date))
      .reduce((s, pi) => s + (Number(pi.ongkir) || 0), 0);
    periodExpenses += ongkirPembelian;

    // Fee yang dipotong dari tagihan penjualan = beban (uang yang diterima berkurang, DPP tetap).
    const feePenjualan = (filteredInvoices || []).reduce((s, inv) => s + computeBill(inv).fee, 0);
    periodExpenses += feePenjualan;
    // Fee / potongan yang diberikan supplier di faktur pembelian = pendapatan lain-lain.
    const feePembelian = (pInvoices || []).filter((pi) => inRange(pi.date)).reduce((s, pi) => s + computeBill(pi).fee, 0);

    const netProfit = grossProfit - periodExpenses + feePembelian;

    return { grossSalesDPP, salesReturnsVal, netSales, totalCOGS, grossProfit, periodExpenses, expenseCategoryList, ongkirPembelian, feePenjualan, feePembelian, netProfit };
  }, [invoiceProfitRows, filteredInvoices, expenses, pInvoices, start, end]);

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

  // DAFTAR SUB-TAB LAPORAN (Termasuk AR Aging)
  const SUBNAV = [
    { id: "sales", label: "Penjualan" },
    { id: "purchases", label: "Pembelian" },
    { id: "ar_aging", label: "Umur Piutang" },
    ...(isSuperAdminOrFinance ? [{ id: "pnl", label: "Laba Rugi (P&L)" }] : []),
  ];

  return (
    <div>
      <Eyebrow>Laporan Operasional & Keuangan</Eyebrow>
      <h2 className="text-xl font-semibold mb-4" style={{ color: COLOR.ink }}>Laporan Per Periode</h2>

      {subTab !== "ar_aging" && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-0 mb-5 p-3 bg-white rounded-xl border no-print" style={{ borderColor: COLOR.border }}>
          <Field label="Dari Tanggal"><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Sampai Tanggal"><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <div className="pb-3 text-xs tabular-nums text-emerald-800 font-semibold w-full sm:w-auto">
            Periode: {fmtDate(start)} s/d {fmtDate(end)}
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit flex-wrap no-print" style={{ background: COLOR.primarySoft }}>
        {SUBNAV.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubTab(s.id)}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
            style={{ background: subTab === s.id ? COLOR.primary : "transparent", color: subTab === s.id ? "#fff" : COLOR.primary }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* TAB 1: LAPORAN UMUR PIUTANG (AR AGING) */}
      {subTab === "ar_aging" && (
        <div className="space-y-4">
          <Card className="no-print">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Cari Faktur / Pelanggan">
                <TextInput
                  placeholder="No. Faktur / Nama Pelanggan..."
                  value={agingSearch}
                  onChange={(e) => setAgingSearch(e.target.value)}
                />
              </Field>

              <Field label="Filter Pelanggan">
                <SearchableSelect value={agingCust} onChange={setAgingCust} placeholder="Semua Pelanggan"
                  pinnedOptions={[{ value: "ALL", label: "Semua Pelanggan" }]}
                  options={(customers || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.type, c.address].filter(Boolean).join(" · ") }))} />
              </Field>

              <Field label="Filter Umur Piutang">
                <Select value={agingBucket} onChange={(e) => setAgingBucket(e.target.value)}>
                  <option value="ALL">Semua Umur</option>
                  <option value="current">0 - 30 Hari (Lancar)</option>
                  <option value="31-60">31 - 60 Hari</option>
                  <option value="61-90">61 - 90 Hari</option>
                  <option value="over90">&gt; 90 Hari (Perhatian)</option>
                </Select>
              </Field>
            </div>

            <div className="flex justify-between items-center mt-4 pt-3 border-t" style={{ borderColor: COLOR.border }}>
              <div className="text-sm font-semibold" style={{ color: COLOR.ink }}>
                Total Piutang Terfilter: <span className="tabular-nums text-emerald-700">{fmtIDR(totalARAging)}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={exportAgingCSV} variant="ghost">
                  <Download size={15} /> Export CSV
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer size={15} /> Cetak Laporan
                </Button>
              </div>
            </div>
          </Card>

          <Card className="!p-0 overflow-hidden printable-area">
            <style>{`
              @media print {
                .aging-invoice-detail { display: table-row !important; }
                .aging-toggle-btn { display: none !important; }
              }
            `}</style>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: COLOR.primarySoft }}>
                  {/* kolom chevron / expand */}
                  <th className="w-8 px-2 py-2" />
                  <th className="text-left px-4 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>Pelanggan</th>
                  <th className="text-center px-4 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>Jml. Faktur</th>
                  <th className="text-left px-4 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>Status Aging</th>
                  <th className="text-right px-4 py-2 text-xs uppercase" style={{ color: COLOR.primary }}>Total Piutang</th>
                </tr>
              </thead>
              <tbody>
                {agingByCustomer.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>
                      Tidak ada piutang yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
                {agingByCustomer.map((grp) => {
                  const isOpen = expandedAgingCusts.has(grp.customerId);
                  const toggleOpen = () =>
                    setExpandedAgingCusts((prev) => {
                      const next = new Set(prev);
                      if (next.has(grp.customerId)) next.delete(grp.customerId);
                      else next.add(grp.customerId);
                      return next;
                    });
                  const bucketLabel = (b) =>
                    b === "current" ? "0-30 Hari" : b === "31-60" ? "31-60 Hari" : b === "61-90" ? "61-90 Hari" : "> 90 Hari";
                  const bucketTone = (b) =>
                    b === "current" ? "good" : b === "over90" ? "danger" : "warn";

                  return [
                    /* ── BARIS SUMMARY CUSTOMER ── */
                    <tr
                      key={`cust-${grp.customerId}`}
                      onClick={toggleOpen}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderTop: `1px solid ${COLOR.border}`,
                        background: isOpen ? COLOR.primarySoft : undefined,
                      }}
                      onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = ""; }}
                    >
                      <td className="px-2 py-3 text-center select-none aging-toggle-btn" style={{ color: COLOR.primary }}>
                        <span
                          style={{
                            display: "inline-block",
                            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.18s",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >▶</span>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: COLOR.ink }}>
                        {grp.customerName}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-xs font-medium" style={{ color: COLOR.inkSoft }}>
                        {grp.invoices.length} faktur
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={bucketTone(grp.worstBucket)}>
                          {bucketLabel(grp.worstBucket)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right font-bold text-base" style={{ color: COLOR.ink }}>
                        {fmtIDR(grp.totalSisa)}
                      </td>
                    </tr>,

                    /* ── BARIS DETAIL INVOICE (accordion expand) ── */
                    ...grp.invoices.map((item) => (
                      <tr
                        key={`inv-${item.id}`}
                        className="aging-invoice-detail"
                        style={{ borderTop: `1px solid ${COLOR.border}`, background: "#f4f7fb", display: isOpen ? "table-row" : "none" }}
                      >
                        {/* indent spacer */}
                        <td />
                        <td className="px-4 py-2" colSpan={4}>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="tabular-nums font-semibold w-36" style={{ color: COLOR.primary }}>
                              {item.noFaktur}
                            </span>
                            <span className="tabular-nums w-28" style={{ color: COLOR.inkSoft }}>
                              {fmtDate(item.date)}
                            </span>
                            <span className="tabular-nums w-20" style={{ color: COLOR.ink }}>
                              {item.ageDays} hari
                            </span>
                            <span className="w-24">
                              <Badge tone={bucketTone(item.bucket)}>
                                {bucketLabel(item.bucket)}
                              </Badge>
                            </span>
                            <span className="tabular-nums font-bold ml-auto" style={{ color: COLOR.ink }}>
                              {fmtIDR(item.sisaHutang)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* TAB 2: LAPORAN LABA RUGI */}
      {subTab === "pnl" && isSuperAdminOrFinance && (
        <div className="space-y-4 max-w-3xl">
          <Card className="!p-6 bg-white printable-area">
            <div className="relative border-b pb-3 mb-4 text-center">
              <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{(company || COMPANY_PROFILE)?.name || "PT WIRYATAMA PUTERA MANDIRI"}</div>
              <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>Laporan Laba Rugi Operasional</h3>
              <p className="text-xs text-gray-500">Periode: {fmtDate(start)} s/d {fmtDate(end)}</p>
              <div className="absolute right-0 top-0 no-print">
                <Button onClick={() => window.print()} variant="ghost" className="text-xs">
                  <Printer size={14} /> Cetak Laporan
                </Button>
              </div>
            </div>

            <div className="space-y-3 text-sm tabular-nums">
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
                  <div className="flex justify-between py-2 border-b-2 font-bold text-emerald-900 bg-emerald-50/50 px-2 rounded">
                    <span>Penjualan Bersih (Net Sales)</span>
                    <span>{fmtIDR(pnlData.netSales)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between py-2 border-b-2 font-bold text-emerald-900 bg-emerald-50/50 px-2 rounded">
                  <span>Penjualan Bersih (Sales DPP)</span>
                  <span>{fmtIDR(pnlData.netSales)}</span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                <span>(-) Harga Pokok Penjualan (HPP)</span>
                <span className="text-red-600">- {fmtIDR(pnlData.totalCOGS)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 font-bold text-emerald-900 bg-emerald-50 px-2 rounded">
                <span>Laba Kotor (Gross Profit)</span>
                <span>{fmtIDR(pnlData.grossProfit)}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                <span>(-) Beban Operasional Lainnya</span>
                <span className="text-red-600">- {fmtIDR(pnlData.periodExpenses - pnlData.ongkirPembelian - pnlData.feePenjualan)}</span>
              </div>
              {/* Rincian per kategori akun beban */}
              {pnlData.expenseCategoryList.map(([cat, val]) => (
                <div key={cat} className="flex justify-between py-1 border-b border-dashed text-xs text-gray-600 pl-10">
                  <span>{cat}</span>
                  <span className="tabular-nums">{fmtIDR(val)}</span>
                </div>
              ))}
              {pnlData.ongkirPembelian > 0 && (
                <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                  <span>(-) Ongkir Pembelian (dari Faktur Pembelian)</span>
                  <span className="text-red-600">- {fmtIDR(pnlData.ongkirPembelian)}</span>
                </div>
              )}
              {pnlData.feePenjualan > 0 && (
                <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                  <span>(-) Fee Penjualan (dipotong dari faktur)</span>
                  <span className="text-red-600">- {fmtIDR(pnlData.feePenjualan)}</span>
                </div>
              )}
              {pnlData.feePembelian > 0 && (
                <div className="flex justify-between py-1.5 border-b text-gray-700 pl-4">
                  <span>(+) Fee / Potongan dari Supplier</span>
                  <span className="text-emerald-700">+ {fmtIDR(pnlData.feePembelian)}</span>
                </div>
              )}

              <div className={`flex justify-between py-3 border-b-2 text-base font-extrabold px-3 rounded mt-4 ${pnlData.netProfit >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                <span>Laba / (Rugi) Bersih Operasional</span>
                <span className="whitespace-nowrap">{fmtIDR(pnlData.netProfit)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: LAPORAN PENJUALAN */}
      {subTab === "sales" && (
        <SalesReportTab
          start={start} end={end}
          salesTotal={salesTotal} salesAgg={salesAgg} allSalesDocs={allSalesDocs}
          products={products} COLOR={COLOR} fmtDate={fmtDate} fmtIDR={fmtIDR}
          profitById={profitById} showHpp={isSuperAdminOrFinance} pnlData={pnlData}
          companyName={(company || COMPANY_PROFILE)?.name}
        />
      )}

      {/* TAB 4: LAPORAN PEMBELIAN */}
      {subTab === "purchases" && (
        <PurchaseReportTab
          start={start} end={end}
          purchaseTotal={purchaseTotal} purchaseAgg={purchaseAgg} allPurchaseDocs={allPurchaseDocs}
          products={products} COLOR={COLOR} fmtDate={fmtDate} fmtIDR={fmtIDR}
          companyName={(company || COMPANY_PROFILE)?.name}
        />
      )}
    </div>
  );
}

// ---------- SETTINGS VIEW COMPONENT WITH CHANGE PASSWORD & ACCESS CONTROL ----------
// Unduh backup .json & restore manual disembunyikan dari tampilan (fungsinya tetap ada).
// Ganti ke true kalau suatu saat mau dimunculkan lagi.
const SHOW_MANUAL_BACKUP_RESTORE = false;

// ---------------------------------------------------------------------
//  PENGATURAN REKENING PEMBAYARAN (otomatis per jenis faktur)
//  PPN -> rekening PT, Non-PPN -> rekening Owner. Disimpan di cloud (erp-app-settings).
// ---------------------------------------------------------------------
function newPayAcc(group) {
  return { id: Math.random().toString(36).slice(2, 10), group, bankName: "", accountNumber: "", accountName: "", active: true };
}

function PaymentAccountsSettings({ notify }) {
  const [accounts, setAccounts] = useState(null);
  const [notes, setNotes] = useState({ ppn: "", nonppn: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await loadKey(KEYS.settings);
      const st = raw && !Array.isArray(raw) ? raw : {};
      let list = Array.isArray(st.paymentAccounts) ? st.paymentAccounts : null;
      if (!list) {
        // Pertama kali: rekening PT lama otomatis jadi rekening Faktur PPN
        const bd = COMPANY_PROFILE.bankDetails || {};
        list = [{ ...newPayAcc("ppn"), bankName: bd.bankName || "", accountNumber: bd.accountNumber || "", accountName: bd.accountName || "" }, newPayAcc("nonppn")];
      }
      setAccounts(list);
      setNotes({
        ppn: st.paymentNotesPPN ?? (COMPANY_PROFILE.paymentNotes || ""),
        nonppn: st.paymentNotesNonPPN ?? "Pembayaran dianggap sah apabila dana telah masuk ke rekening di atas.",
      });
    })();
  }, []);

  function update(id, field, value) {
    setAccounts((list) => list.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }

  async function save() {
    const cleaned = (accounts || []).filter((a) => String(a.accountNumber || "").trim() || String(a.bankName || "").trim());
    const bad = cleaned.find((a) => !String(a.accountNumber || "").trim() || !String(a.bankName || "").trim() || !String(a.accountName || "").trim());
    if (bad) return notify("Lengkapi Nama Bank, No. Rekening, dan Atas Nama di setiap rekening.", "danger");
    setSaving(true);
    try {
      const raw = await loadKey(KEYS.settings);
      const st = raw && !Array.isArray(raw) ? raw : {};
      const next = { ...st, paymentAccounts: cleaned, paymentNotesPPN: notes.ppn, paymentNotesNonPPN: notes.nonppn };
      const ok = await saveKey(KEYS.settings, next);
      if (!ok) throw new Error("save failed");
      setPaymentSettings(next);
      setAccounts(cleaned.length ? cleaned : [newPayAcc("ppn"), newPayAcc("nonppn")]);
      logActivity({
        action: "update", module: "Pengaturan", targetLabel: "Rekening Pembayaran",
        details: cleaned.map((a) => `${a.group === "ppn" ? "PPN" : "Non-PPN"}: ${a.bankName} ${a.accountNumber} a.n ${a.accountName}${a.active === false ? " (disembunyikan)" : ""}`).join("; ") || "Semua rekening dihapus",
      });
      notify("Rekening pembayaran tersimpan. Faktur PPN & Non-PPN otomatis pakai rekening masing-masing.");
    } catch (e) {
      console.error(e);
      notify("Gagal menyimpan rekening pembayaran", "danger");
    } finally {
      setSaving(false);
    }
  }

  if (!accounts) return <Card className="max-w-3xl !p-6 text-sm">Memuat pengaturan rekening...</Card>;

  return (
    <Card className="max-w-3xl !p-6 space-y-6">
      <div>
        <div className="font-bold text-sm text-emerald-900 border-b pb-2 uppercase tracking-wide">Rekening Pembayaran di Faktur</div>
        <p className="text-xs mt-2 opacity-80">
          Rekening yang tercetak di faktur penjualan dipilih otomatis sesuai jenis pajaknya. Bisa isi lebih dari 1 rekening per jenis.
        </p>
      </div>

      {["ppn", "nonppn"].map((g) => {
        const rows = accounts.filter((a) => a.group === g);
        return (
          <div key={g} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm">{PAYMENT_GROUPS[g].label}</div>
                <div className="text-xs opacity-70">{g === "ppn" ? "Faktur dengan PPN otomatis pakai rekening ini (Rekening PT)." : "Faktur tanpa PPN otomatis pakai rekening ini (Rekening Owner)."}</div>
              </div>
              <Button variant="secondary" onClick={() => setAccounts([...accounts, newPayAcc(g)])}>
                <Plus size={14} /> Tambah Rekening
              </Button>
            </div>

            {rows.length === 0 && <div className="text-xs italic opacity-70">Belum ada rekening. Faktur akan menulis "hubungi kami untuk info rekening".</div>}

            {rows.map((a) => (
              <div key={a.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.3fr_auto] gap-2 items-end border rounded-lg p-3">
                <Field label="Nama Bank">
                  <TextInput value={a.bankName} placeholder="Contoh: BCA" onChange={(e) => update(a.id, "bankName", e.target.value)} />
                </Field>
                <Field label="No. Rekening">
                  <TextInput value={a.accountNumber} onChange={(e) => update(a.id, "accountNumber", e.target.value)} />
                </Field>
                <Field label="Atas Nama">
                  <TextInput value={a.accountName} onChange={(e) => update(a.id, "accountName", e.target.value)} />
                </Field>
                <div className="flex items-center gap-2 pb-1">
                  <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={a.active !== false} onChange={(e) => update(a.id, "active", e.target.checked)} /> Tampil
                  </label>
                  <button type="button" title="Hapus rekening" className="p-1.5 rounded text-red-600 hover:bg-red-50" onClick={() => setAccounts(accounts.filter((x) => x.id !== a.id))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            <Field label={`Catatan Pembayaran ${PAYMENT_GROUPS[g].label}`}>
              <TextInput value={notes[g]} onChange={(e) => setNotes({ ...notes, [g]: e.target.value })} />
            </Field>
          </div>
        );
      })}

      <div className="flex justify-end pt-3 border-t">
        <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Rekening Pembayaran"}</Button>
      </div>
    </Card>
  );
}

function SettingsView({ notify, refreshAll, users, saveUsers, currentUserEmail, isSuperAdminUser = false, isDarkMode = false, onThemeChange }) {
  const PC = getCOLOR(isDarkMode); // warna panel preferensi, ikut mode terang/gelap
  // Cek apakah user yang sedang login adalah Super Admin / Finance
  const isSuperAdmin = isSuperAdminUser || (typeof ADMIN_FINANCE_EMAILS !== "undefined" && ADMIN_FINANCE_EMAILS.includes((currentUserEmail || "").toLowerCase()));

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

  // State Migrasi Format Data
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState("");
  const storageMode = getStorageMode();

  async function runMigration() {
    if (!confirm(
      "MIGRASI KE FORMAT DATA BARU\n\n" +
      "Jalankan saat tidak ada staf yang sedang input data.\n\n" +
      "Langkahnya:\n1. Backup .json otomatis diunduh ke komputer ini\n2. Semua data disalin ke format baru\n3. Hasilnya diverifikasi, kalau beda migrasi dibatalkan\n\n" +
      "Data lama TIDAK dihapus. Lanjutkan?"
    )) return;
    setMigrating(true);
    try {
      setMigrateMsg("Mengunduh backup...");
      const ok = await downloadFullBackup();
      if (!ok) throw new Error("Backup gagal diunduh, migrasi dibatalkan.");
      const report = await migrateToV2(AUTO_BACKUP_RESTORE_KEYS, setMigrateMsg);
      const fixes = report.filter((r) => r.noId || r.dup).map((r) => `${r.key}: ${r.noId} tanpa ID/email, ${r.dup} duplikat`);
      const total = report.reduce((s, r) => s + r.count, 0);
      alert(
        `Migrasi selesai. ${total} data dipindahkan dan sudah diverifikasi.` +
        (fixes.length ? `\n\nCatatan perbaikan otomatis:\n${fixes.join("\n")}` : "") +
        "\n\nHalaman akan dimuat ulang."
      );
      window.location.reload();
    } catch (e) {
      console.error(e);
      setMigrateMsg("");
      notify(e?.message || "Migrasi gagal. Data lama masih utuh.", "danger");
      setMigrating(false);
    }
  }

  // State Cadangan Data Otomatis
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupInfo, setAutoBackupInfo] = useState({ lastAutoBackupAt: null, backupDates: [] });
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await loadKey(KEYS.settings);
      const settings = (raw && !Array.isArray(raw)) ? raw : {};
      setAutoBackupEnabled(!!settings.autoBackupEnabled);
      setAutoBackupInfo({ lastAutoBackupAt: settings.lastAutoBackupAt || null, backupDates: settings.backupDates || [] });
      if (settings.companyProfile) {
        setCompanyForm((prev) => ({ ...prev, ...settings.companyProfile }));
        Object.assign(COMPANY_PROFILE, settings.companyProfile);
        try { localStorage.setItem("erp-company-profile", JSON.stringify(settings.companyProfile)); } catch (_) {}
      }
    })();
  }, []);


  async function toggleAutoBackup() {
    setSavingAutoBackup(true);
    try {
      const raw = await loadKey(KEYS.settings);
      const settings = (raw && !Array.isArray(raw)) ? raw : {};
      const next = !autoBackupEnabled;
      await saveKey(KEYS.settings, { ...settings, autoBackupEnabled: next });
      setAutoBackupEnabled(next);
      notify(next ? "Cadangan data otomatis diaktifkan (maks. 1x/hari, dicek saat ada yang membuka aplikasi)" : "Cadangan data otomatis dinonaktifkan");
    } catch (e) {
      console.error(e);
      notify("Gagal mengubah pengaturan cadangan otomatis", "danger");
    } finally {
      setSavingAutoBackup(false);
    }
  }

  async function restoreFromAutoBackup(dateKey) {
    if (!confirm(`PERINGATAN: Ini akan menimpa seluruh data ERP saat ini dengan cadangan otomatis tanggal ${dateKey}. Lanjutkan?`)) return;
    try {
      const data = await loadAutoBackup(dateKey, AUTO_BACKUP_RESTORE_KEYS);
      if (!data) return notify("Cadangan tidak ditemukan atau rusak", "danger");
      for (const [key, val] of Object.entries(data)) await writeWholeList(key, val);
      if (refreshAll) await refreshAll();
      notify(`Berhasil restore dari cadangan otomatis tanggal ${dateKey}`);
    } catch (e) {
      console.error(e);
      notify("Gagal restore dari cadangan otomatis", "danger");
    }
  }

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
    { id: "qa", label: "Review APJ / PJT (CDOB)" },
    { id: "settings", label: "Menu Pengaturan (Settings)" },
  ];

  const [savingProfile, setSavingProfile] = useState(false);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const raw = await loadKey(KEYS.settings);
      const settings = (raw && !Array.isArray(raw)) ? raw : {};
      const next = { ...settings, companyProfile: companyForm };
      const ok = await saveKey(KEYS.settings, next);
      if (!ok) throw new Error("Gagal menyimpan ke server");

      localStorage.setItem("erp-company-profile", JSON.stringify(companyForm));
      if (typeof COMPANY_PROFILE !== "undefined") Object.assign(COMPANY_PROFILE, companyForm);
      notify("Profil perusahaan & konfigurasi legalitas berhasil disimpan ke cloud!");
      logActivity({
        action: "update",
        module: "Pengaturan",
        targetLabel: "Profil Perusahaan",
        details: `Simpan identitas perusahaan: ${companyForm.name || ""}, PJT: ${companyForm.pjtName || ""}`,
      });
    } catch (e) {
      console.error(e);
      notify("Gagal menyimpan profil perusahaan ke server", "danger");
    } finally {
      setSavingProfile(false);
    }
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
        KEYS.deliveryNotes, KEYS.invoices, KEYS.returns, KEYS.users, KEYS.qaOfficers, KEYS.disposals
      ];

      const backupData = { exportDate: new Date().toISOString(), company: companyForm, data: {} };
      for (const k of keys) backupData.data[k] = await loadList(k);

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
      return true;
    } catch (e) {
      console.error(e);
      notify("Gagal mengunduh backup database", "danger");
      return false;
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

        for (const [key, val] of Object.entries(imported.data)) await writeWholeList(key, val);

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
    { id: "backup", label: "Master Preferences" },
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
          <div className="font-bold text-sm text-emerald-900 border-b pb-2 uppercase tracking-wide">
            Identitas Perusahaan & Legalitas Penyalur PBF/Alkes
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Kontak Telepon & Email">
              <TextInput value={companyForm.contact || ""} onChange={(e) => setCompanyForm({ ...companyForm, contact: e.target.value })} />
            </Field>
            <Field label="No. WhatsApp Sales / Admin">
              <TextInput value={companyForm.whatsapp || ""} onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })} placeholder="Format: 62817773791" />
            </Field>
          </div>

          <div className="border-t pt-3 mt-4 font-bold text-sm text-emerald-900 border-b pb-2 uppercase tracking-wide">
            Pengaturan Tanda Tangan & Stempel PJT (Dokumen PO)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nama PJT / Apoteker Penanggung Jawab">
              <TextInput value={companyForm.pjtName || ""} onChange={(e) => setCompanyForm({ ...companyForm, pjtName: e.target.value })} placeholder="Nama & Gelar PJT" />
            </Field>
            <Field label="Link URL Gambar TTD & Stempel (PNG Transparan)">
              <TextInput value={companyForm.stampUrl || ""} onChange={(e) => setCompanyForm({ ...companyForm, stampUrl: e.target.value })} placeholder="https://i.imgur.com/..." />
            </Field>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? "Menyimpan ke Cloud..." : "Simpan Perubahan Profil"}
            </Button>
          </div>

        </Card>
      )}

      {/* TAB 2: PAJAK & BANK (SUPER ADMIN) */}
      {subTab === "finance" && isSuperAdmin && (
        <PaymentAccountsSettings notify={notify} />
      )}

      {/* TAB 3: PENGGUNA & HAK AKSES + FORM GANTI PASSWORD */}
      {subTab === "users" && (
        <div className="max-w-4xl space-y-6">
          
          {/* 1. FORM GANTI PASSWORD (TAMPIL UNTUK SEMUA USER: SUPER ADMIN, FINANCE, STAFF) */}
          <Card className="max-w-md !p-6">
            <div className="font-bold text-sm text-emerald-900 border-b pb-2 mb-4 uppercase tracking-wide">
              Ganti Password Login Akun Saya
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Email Akun Terdaftar</label>
                <input 
                  type="text" 
                  disabled 
                  value={currentUserEmail || ""} 
                  className="w-full p-2 bg-gray-100 text-gray-500 rounded text-xs border tabular-nums cursor-not-allowed" 
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
                            <div className="text-xs tabular-nums text-gray-500">{u.email}</div>
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
                                  <span key={accId} className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded tabular-nums">
                                    {m?.label || accId}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button onClick={() => openEditUser(u)} className="text-xs font-semibold text-emerald-700 mr-3 hover:underline">
                              Edit Akses
                            </button>

                            {!isSuperAdminAccount && !isSelf ? (
                              <button onClick={() => removeUser(u)} className="text-xs font-semibold text-red-600 hover:underline">
                                Hapus
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 tabular-nums italic">Protected</span>
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
                    <div className="text-xs font-bold text-emerald-900 mb-2 uppercase tracking-wide">
                      Pilih Modul yang Boleh Diakses:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {MODULE_LIST.map((m) => {
                        const checked = userForm.access.includes(m.id);
                        return (
                          <label key={m.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer bg-white text-xs hover:bg-emerald-50/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleModuleAccess(m.id)}
                              className="rounded text-emerald-800"
                            />
                            <span className={checked ? "font-semibold text-emerald-900" : "text-gray-600"}>{m.label}</span>
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
        <div className="space-y-4">
          {/* PREFERENSI SISTEM & KEAMANAN DATA (gaya WHISys) */}
          <div className="rounded-xl p-5" style={{ background: PC.surface, border: `1px solid ${PC.border}`, color: PC.ink }}>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} style={{ color: PC.primary }} />
              <div className="font-semibold text-sm" style={{ color: PC.ink }}>Preferensi Sistem & Keamanan Data</div>
            </div>
            <p className="text-xs mt-0.5" style={{ color: PC.inkSoft }}>Pengaturan tema bawaan serta cadangan database harian.</p>
            <div className="my-4" style={{ borderTop: `1px solid ${PC.border}` }} />

            <div className="space-y-3">
              {/* Tema tampilan bawaan */}
              <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ background: PC.bg, border: `1px solid ${PC.border}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Moon size={16} style={{ color: PC.primary }} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: PC.ink }}>Tema Tampilan Bawaan</div>
                    <div className="text-xs" style={{ color: PC.inkSoft }}>Pilih tampilan awal saat aplikasi dibuka.</div>
                  </div>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={isDarkMode ? "dark" : "light"}
                    onChange={(e) => {
                      const dark = e.target.value === "dark";
                      if (onThemeChange) onThemeChange(dark);
                      notify(dark ? "Tema bawaan diubah ke Dark Mode" : "Tema bawaan diubah ke Light Mode");
                    }}
                    className="appearance-none bg-transparent text-xs font-medium pr-6 pl-2 py-1 cursor-pointer outline-none"
                    style={{ color: PC.ink }}
                  >
                    <option value="light" style={{ color: "#1E293B" }}>Light Mode (Terang)</option>
                    <option value="dark" style={{ color: "#1E293B" }}>Dark Mode (Gelap)</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: PC.ink }} />
                </div>
              </div>

              {/* Cadangan data otomatis */}
              <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ background: PC.bg, border: `1px solid ${PC.border}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Database size={16} style={{ color: PC.primary }} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: PC.ink }}>Cadangan Data Otomatis</div>
                    <div className="text-xs" style={{ color: PC.inkSoft }}>
                      Simpan salinan data Firestore secara berkala ke cloud backup (1x sehari, 7 hari terakhir).
                      {autoBackupEnabled && autoBackupInfo.lastAutoBackupAt && (
                        <> Terakhir: {fmtDate ? fmtDate(autoBackupInfo.lastAutoBackupAt) : autoBackupInfo.lastAutoBackupAt}.</>
                      )}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  disabled={savingAutoBackup}
                  onChange={toggleAutoBackup}
                  className="shrink-0 w-4 h-4 cursor-pointer"
                  style={{ accentColor: PC.primary }}
                />
              </div>

              {/* Format penyimpanan data */}
              <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ background: PC.bg, border: `1px solid ${storageMode === "v2" ? PC.border : PC.warn}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck size={16} style={{ color: storageMode === "v2" ? PC.primary : PC.warn }} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: PC.ink }}>Format Penyimpanan Data</div>
                    <div className="text-xs" style={{ color: PC.inkSoft }}>
                      {storageMode === "v2"
                        ? "Format baru aktif. Data dipecah otomatis dan input bersamaan tidak saling menimpa."
                        : migrating
                          ? migrateMsg || "Memproses..."
                          : "Masih format lama (batas 1 MB per jenis data, input bersamaan bisa saling menimpa). Jalankan di luar jam kerja."}
                    </div>
                  </div>
                </div>
                {storageMode === "v2" ? (
                  <span className="shrink-0 text-xs font-semibold" style={{ color: PC.primary }}>Format Baru</span>
                ) : (
                  <button
                    onClick={runMigration}
                    disabled={migrating}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                    style={{ background: PC.primary }}
                  >
                    {migrating ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                    {migrating ? "Memigrasi..." : "Migrasi Sekarang"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {SHOW_MANUAL_BACKUP_RESTORE && (<>
          <Card className="!p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-emerald-900 mb-1 uppercase tracking-wide">
                  Cadangan Data Otomatis
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Kalau aktif, aplikasi otomatis menyimpan salinan seluruh data ERP ke Firestore setiap ada yang membuka aplikasi (maksimal 1x per hari, 7 hari terakhir disimpan). Ini bukan pengganti unduh backup manual, cuma jaring pengaman tambahan.
                </p>
                {autoBackupInfo.lastAutoBackupAt && (
                  <p className="text-xs text-gray-500 mt-2">Cadangan terakhir: {fmtDate ? fmtDate(autoBackupInfo.lastAutoBackupAt) : autoBackupInfo.lastAutoBackupAt}</p>
                )}
              </div>
              <button
                onClick={toggleAutoBackup}
                disabled={savingAutoBackup}
                className="shrink-0 w-11 h-6 rounded-full transition-colors relative"
                style={{ background: autoBackupEnabled ? "#16a34a" : "#d1d5db" }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: autoBackupEnabled ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
            </div>

            {autoBackupInfo.backupDates && autoBackupInfo.backupDates.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">Cadangan otomatis tersedia</div>
                <div className="flex flex-wrap gap-2">
                  {[...autoBackupInfo.backupDates].reverse().map((d) => (
                    <Button key={d} variant="secondary" onClick={() => restoreFromAutoBackup(d)}>
                      Restore {fmtDate ? fmtDate(d) : d}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="!p-6">
            <div className="font-bold text-sm text-emerald-900 mb-2 uppercase tracking-wide">
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
          </>)}
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
