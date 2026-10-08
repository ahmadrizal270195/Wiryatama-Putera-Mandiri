import React, { useState, useMemo } from "react";
import { Wallet, CreditCard, Receipt, PiggyBank, Plus, Calendar, Filter, Search, X } from "lucide-react";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { isCleared, blockedReason } from "../qa";
import { computeBill } from "../billing";
import { startOfMonthISO, startOfLastMonthISO, endOfLastMonthISO } from "../dateUtils";


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

// Helper lokal kalkulasi diskon item jika belum di-import
function getItemDiscountAmount(qty, unitPrice, discType, discVal) {
  const gross = (Number(qty) || 0) * (Number(unitPrice) || 0);
  const val = Number(discVal || 0);
  if (discType === "amount") return Math.min(gross, val);
  return gross * (Math.min(100, val) / 100);
}

// Kotak cari kecil untuk tab Piutang & Hutang
function SearchBar({ value, onChange, placeholder, shown, total, COLOR }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COLOR.inkSoft }} />
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 pr-8" colorConfig={COLOR} />
        {value && (
          <button type="button" onClick={() => onChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer" title="Hapus pencarian">
            <X size={15} style={{ color: COLOR.inkSoft }} />
          </button>
        )}
      </div>
      <div className="text-xs shrink-0" style={{ color: COLOR.inkSoft }}>
        {value ? `${shown} dari ${total} faktur` : `${total} faktur`}
      </div>
    </div>
  );
}

export default function FinanceView(props) {
  const {
    pos, sos, suppliers, customers, batches, invoices, pInvoices, pReturns, returns, paymentsOut, paymentsIn, expenses,
    findName, notify, savePaymentsOut, savePaymentsIn, saveExpenses,
    arOutstanding, apOutstanding, cashInMonth, cashOutMonth, grossProfitMonth, expensesMonth,
    invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount, invoiceSisa,
    pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa,
    colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax
  } = props;

  const COLOR = colorConfig || {};

  const [subTab, setSubTab] = useState("ar");

  // --- STATE FILTER PERIODE TANGGAL ---
  const [startDate, setStartDate] = useState(() => startOfMonthISO());
  const [endDate, setEndDate] = useState(todayISO());

  // Helper filter tanggal
  const inDateRange = (dateStr) => {
    if (!dateStr) return false;
    const target = String(dateStr).slice(0, 10);
    return target >= startDate && target <= endDate;
  };

  // Preset Filter Tanggal Cepat
  const setPresetPeriod = (preset) => {
    if (preset === "thisMonth") {
      setStartDate(startOfMonthISO());
      setEndDate(todayISO());
    } else if (preset === "lastMonth") {
      setStartDate(startOfLastMonthISO());
      setEndDate(endOfLastMonthISO());
    } else if (preset === "all") {
      setStartDate("2020-01-01");
      setEndDate(todayISO());
    }
  };

  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });
  const [editingExpId, setEditingExpId] = useState(null);
  const [arSearch, setArSearch] = useState("");
  const [apSearch, setApSearch] = useState("");

  // Helper kalkulasi sisa piutang aman
  const getInvoiceSisa = (inv) => {
    if (typeof invoiceSisa === "function") return invoiceSisa(inv);
    const total = typeof invoiceTotal === "function" ? invoiceTotal(inv) : 0;
    const paid = typeof invoicePaidAmount === "function" ? invoicePaidAmount(inv.id) : 0;
    const ret = typeof invoiceReturnedAmount === "function" ? invoiceReturnedAmount(inv.id) : 0;
    const dp = (inv.soId && typeof soDPAmount === "function") ? soDPAmount(inv.soId) : 0;
    return Math.max(0, total - paid - ret - dp);
  };

  // HELPER KALKULASI TOTAL TAGIHAN AKURAT DI FINANCE
  const getPInvoiceTotal = (inv) => {
    if (!inv || !inv.items) return 0;
    const rawSubtotal = (inv.items || []).reduce((sum, it) => {
      const gross = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
      return sum + Math.max(0, gross - discAmt);
    }, 0);

    const effHeaderPct = inv.discountType === "amount" 
      ? (rawSubtotal > 0 ? (Math.min(rawSubtotal, Number(inv.discountPercent || 0)) / rawSubtotal) * 100 : 0)
      : Number(inv.discountPercent || 0);

    // Pakai rumus tagihan bersama (diskon nota, fee, ongkir) supaya sama dengan form & cetakan.
    return computeBill(inv).total;
  };

  // HELPER KALKULASI SISA HUTANG AKURAT DI FINANCE
  const getPInvoiceSisa = (inv) => {
    const total = getPInvoiceTotal(inv);
    const paid = typeof pInvoicePaidAmount === "function" ? pInvoicePaidAmount(inv.id) : 0;
    const ret = typeof pInvoiceReturnedAmount === "function" ? pInvoiceReturnedAmount(inv.id) : 0;
    return Math.max(0, total - paid - ret);
  };

  function openPay(kind, doc) {
    let amount = 0;
    if (kind === "invoice") amount = getInvoiceSisa(doc);
    else if (kind === "dp") amount = 0;
    else if (kind === "pInvoice") amount = getPInvoiceSisa(doc);
    setPayForm({ amount, date: todayISO(), method: PAYMENT_METHODS[0], note: "" });
    // CDOB: faktur langsung yang masih menunggu / ditolak APJ-PJT belum boleh ditagih.
    if (kind === "invoice" && doc && !isCleared(doc)) return notify(blockedReason(doc, `Faktur ${doc.noFaktur}`), "danger");
    setPayModal({ kind, doc });
  }

  function openEditPay(kind, payObj) {
    setPayForm({ amount: payObj.amount, date: payObj.date || todayISO(), method: payObj.method || PAYMENT_METHODS[0], note: payObj.note || "" });
    setPayModal({ kind, pay: payObj });
  }

  async function submitPayment() {
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) return notify("Jumlah pembayaran harus lebih dari 0", "danger");

    // Validasi supaya pembayaran tidak bisa melebihi sisa tagihan (mencegah salah ketik/salah input)
    if (payModal.kind === "invoice") {
      const sisa = getInvoiceSisa(payModal.doc);
      if (amt > sisa) return notify(`Jumlah melebihi sisa piutang (${fmtIDR(sisa)}). Periksa kembali nominalnya.`, "danger");
    }
    if (payModal.kind === "pInvoice") {
      const sisa = getPInvoiceSisa(payModal.doc);
      if (amt > sisa) return notify(`Jumlah melebihi sisa hutang (${fmtIDR(sisa)}). Periksa kembali nominalnya.`, "danger");
    }
    if (payModal.kind === "edit-in" && payModal.pay.invoiceId) {
      const inv = (invoices || []).find((i) => i.id === payModal.pay.invoiceId);
      if (inv) {
        const sisaExcludingThis = getInvoiceSisa(inv) + (Number(payModal.pay.amount) || 0);
        if (amt > sisaExcludingThis) return notify(`Jumlah melebihi sisa piutang (${fmtIDR(sisaExcludingThis)}). Periksa kembali nominalnya.`, "danger");
      }
    }
    if (payModal.kind === "edit-out" && payModal.pay.pInvoiceId) {
      const inv = (pInvoices || []).find((i) => i.id === payModal.pay.pInvoiceId);
      if (inv) {
        const sisaExcludingThis = getPInvoiceSisa(inv) + (Number(payModal.pay.amount) || 0);
        if (amt > sisaExcludingThis) return notify(`Jumlah melebihi sisa hutang (${fmtIDR(sisaExcludingThis)}). Periksa kembali nominalnya.`, "danger");
      }
    }

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

  function openNewExp() {
    setEditingExpId(null);
    setExpForm({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });
    setExpModal(true);
  }

  function openEditExp(e) {
    setEditingExpId(e.id);
    setExpForm({ category: e.category || EXPENSE_CATEGORIES[0], amount: e.amount, date: e.date || todayISO(), note: e.note || "" });
    setExpModal(true);
  }

  function closeExpModal() {
    setExpModal(false);
    setEditingExpId(null);
    setExpForm({ category: EXPENSE_CATEGORIES[0], amount: "", date: todayISO(), note: "" });
  }

  async function submitExpense() {
    if (!expForm.amount || Number(expForm.amount) <= 0) return notify("Jumlah biaya harus lebih dari 0", "danger");
    if (!expForm.date) return notify("Tanggal pengeluaran wajib diisi", "danger");
    if (editingExpId) {
      await saveExpenses((expenses || []).map((e) => (e.id === editingExpId ? { ...e, ...expForm, amount: Number(expForm.amount) } : e)));
      notify("Biaya operasional diperbarui");
    } else {
      await saveExpenses([...(expenses || []), { id: uid(), ...expForm, amount: Number(expForm.amount) }]);
      notify("Biaya operasional dicatat");
    }
    closeExpModal();
  }

  async function removeExpense(id) {
    await saveExpenses((expenses || []).filter((e) => e.id !== id));
    notify("Biaya dihapus");
  }

  // --- FILTERED DATA SELECTIONS ---
  const invoiceARList = (invoices || []).map((inv) => ({ inv, total: invoiceTotal ? invoiceTotal(inv) : 0, sisa: getInvoiceSisa(inv) })).filter((x) => x.sisa > 0);
  const dpOnlySOList = (sos || []).filter((so) => !(invoices || []).some((inv) => inv.soId === so.id) && ((soDPAmount ? soDPAmount(so.id) : 0) > 0));
  
  // UPDATE MAPPING AP LIST: MENGGUNAKAN GETPINVOICETOTAL
  const pInvoiceAPList = (pInvoices || []).map((inv) => ({ 
    inv, 
    total: getPInvoiceTotal(inv), 
    sisa: getPInvoiceSisa(inv) 
  })).filter((x) => x.sisa > 0);

  // Pencarian Piutang & Hutang (no. faktur, no. SO, nama pelanggan/supplier, tanggal, nominal)
  const matchQ = (q, parts) => !q.trim() || parts.join(" ").toLowerCase().includes(q.trim().toLowerCase());
  const arCustName = (inv) => {
    const so = (sos || []).find((x) => x.id === inv.soId);
    return inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
  };
  const arShown = invoiceARList.filter(({ inv, sisa }) => {
    const so = (sos || []).find((x) => x.id === inv.soId);
    return matchQ(arSearch, [inv.noFaktur, arCustName(inv), so?.soNumber, fmtDate(inv.date), inv.date, sisa, fmtIDR(sisa)]);
  });
  const dpShown = dpOnlySOList.filter((so) => matchQ(arSearch, [so.soNumber, findName(customers, so.customerId), fmtDate(so.date), so.date]));
  const apShown = pInvoiceAPList.filter(({ inv, sisa }) => {
    const po = (pos || []).find((x) => x.id === inv.poId);
    return matchQ(apSearch, [inv.noFaktur, findName(suppliers, inv.supplierId), po?.poNumber, fmtDate(inv.date), inv.date, sisa, fmtIDR(sisa)]);
  });

  const filteredPaymentsIn = useMemo(() => (paymentsIn || []).filter((p) => inDateRange(p.date)), [paymentsIn, startDate, endDate]);
  const filteredPaymentsOut = useMemo(() => (paymentsOut || []).filter((p) => inDateRange(p.date)), [paymentsOut, startDate, endDate]);
  const filteredExpenses = useMemo(() => (expenses || []).filter((e) => inDateRange(e.date)), [expenses, startDate, endDate]);

  const SUBNAV = [
    { id: "ar", label: `Piutang (${invoiceARList.length})` },
    { id: "ap", label: `Hutang (${pInvoiceAPList.length})` },
    { id: "history", label: `Riwayat Pembayaran (${filteredPaymentsIn.length + filteredPaymentsOut.length})` },
    { id: "expenses", label: `Biaya Operasional (${filteredExpenses.length})` },
  ];

  return (
    <div>
      <Eyebrow>Keuangan</Eyebrow>
      <h2 className="text-xl font-semibold mb-5" style={{ color: COLOR.ink }}>Finance</h2>

      {/* 4 CARD RINGKASAN ATAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card colorConfig={COLOR}>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><Wallet size={13} /> Total Piutang Running</div>
          <div className="text-base sm:text-xl tabular-nums font-semibold break-words" style={{ color: COLOR.warn }}>{fmtIDR(arOutstanding)}</div>
        </Card>
        <Card colorConfig={COLOR}>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><CreditCard size={13} /> Total Hutang Running</div>
          <div className="text-base sm:text-xl tabular-nums font-semibold break-words" style={{ color: COLOR.danger }}>{fmtIDR(apOutstanding)}</div>
        </Card>
        <Card colorConfig={COLOR}>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><Receipt size={13} /> Beban Operasional Bulan Ini</div>
          <div className="text-base sm:text-xl tabular-nums font-semibold break-words" style={{ color: COLOR.ink }}>{fmtIDR(expensesMonth)}</div>
        </Card>
        <Card colorConfig={COLOR}>
          <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: COLOR.inkSoft }}><PiggyBank size={13} /> Laba Kotor (Margin) Bulan Ini</div>
          <div className="text-base sm:text-xl tabular-nums font-semibold break-words" style={{ color: grossProfitMonth >= 0 ? COLOR.good : COLOR.danger }}>{fmtIDR(grossProfitMonth)}</div>
        </Card>
      </div>

      {/* COMPONENT FILTER PERIODE TANGGAL */}
      {(subTab === "history" || subTab === "expenses") && (
        <Card className="mb-4 no-print !p-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-800 mr-1 w-full sm:w-auto">
                <Filter size={14} /> Filter Periode:
              </div>
              <div className="w-[9.5rem]"><TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="!py-1" colorConfig={COLOR} /></div>
              <span className="text-xs text-gray-400">s/d</span>
              <div className="w-[9.5rem]"><TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="!py-1" colorConfig={COLOR} /></div>
            </div>

            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className="text-gray-400 text-[11px]">Pilih Cepat:</span>
              <button onClick={() => setPresetPeriod("thisMonth")} className="px-2.5 py-1 rounded border bg-white hover:bg-gray-50 font-medium cursor-pointer" style={{ borderColor: COLOR.border, color: COLOR.primary }}>Bulan Ini</button>
              <button onClick={() => setPresetPeriod("lastMonth")} className="px-2.5 py-1 rounded border bg-white hover:bg-gray-50 font-medium cursor-pointer" style={{ borderColor: COLOR.border, color: COLOR.primary }}>Bulan Lalu</button>
              <button onClick={() => setPresetPeriod("all")} className="px-2.5 py-1 rounded border bg-white hover:bg-gray-50 font-medium cursor-pointer" style={{ borderColor: COLOR.border, color: COLOR.primary }}>Semua Periode</button>
            </div>
          </div>
        </Card>
      )}

      {/* SUBNAV TAB */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit flex-wrap" style={{ background: COLOR.primarySoft }}>
        {SUBNAV.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubTab(s.id)}
            className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer"
            style={{ background: subTab === s.id ? COLOR.primary : "transparent", color: subTab === s.id ? "#fff" : COLOR.primary }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* SUBTAB 1: PIUTANG (AR) */}
      {subTab === "ar" && (
        <div>
          <SearchBar value={arSearch} onChange={setArSearch} placeholder="Cari no. faktur, no. SO, nama pelanggan, tanggal, atau nominal..." shown={arShown.length} total={invoiceARList.length} COLOR={COLOR} />
          <ResponsiveTable minWidth={750} colorConfig={COLOR}>
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["No. Faktur", "Pelanggan", "Total", "DP + Dibayar", "Sisa Piutang", "Tanggal Faktur", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arShown.map(({ inv, total, sisa }) => {
                const so = (sos || []).find((x) => x.id === inv.soId);
                const custName = inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
                return (
                  <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{custName}</td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.good }}>{fmtIDR(total - sisa)}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: COLOR.warn }}>{fmtIDR(sisa)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("invoice", inv)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Catat Pembayaran</button></td>
                  </tr>
                );
              })}
              {invoiceARList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada piutang tersisa — semua Faktur Penjualan sudah lunas.</td></tr>}
              {invoiceARList.length > 0 && arShown.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada piutang yang cocok dengan "{arSearch}".</td></tr>}
            </tbody>
          </ResponsiveTable>

          <div className="text-xs font-medium mb-2 mt-6" style={{ color: COLOR.inkSoft }}>DP diterima (SO belum difaktur)</div>
          <ResponsiveTable minWidth={600} colorConfig={COLOR}>
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["No. SO", "Pelanggan", "Total SO", "DP Diterima", "Tanggal SO", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dpShown.map((so) => (
                <tr key={so.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: COLOR.ink }}>{so.soNumber}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(customers, so.customerId)}</td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.inkSoft }}>{fmtIDR((so.items || []).reduce((s, it) => s + it.qty * it.unitPrice, 0))}</td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.good }}>{fmtIDR(soDPAmount ? soDPAmount(so.id) : 0)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(so.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("dp", so)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Tambah DP</button></td>
                </tr>
              ))}
              {dpShown.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada DP yang tercatat untuk SO yang belum difaktur.</td></tr>}
            </tbody>
          </ResponsiveTable>
          <div className="flex justify-end mt-2">
            <button onClick={() => setPayModal({ kind: "dp-pick" })} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.accent }}>+ Catat DP untuk SO lain</button>
          </div>
        </div>
      )}

      {/* SUBTAB 2: HUTANG (AP) */}
      {subTab === "ap" && (
        <div>
        <SearchBar value={apSearch} onChange={setApSearch} placeholder="Cari no. faktur vendor, no. PO, nama supplier, tanggal, atau nominal..." shown={apShown.length} total={pInvoiceAPList.length} COLOR={COLOR} />
        <ResponsiveTable minWidth={750} colorConfig={COLOR}>
          <thead>
            <tr style={{ background: COLOR.primarySoft }}>
              {["No. Faktur Vendor", "Supplier", "Total Tagihan", "Sudah Dibayar", "Sisa Hutang", "Tanggal Faktur", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apShown.map(({ inv, total, sisa }) => {
              const paid = typeof pInvoicePaidAmount === "function" ? pInvoicePaidAmount(inv.id) : 0;
              return (
                <tr key={inv.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                  <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: COLOR.ink }}>{inv.noFaktur}</td>
                  <td className="px-4 py-2.5" style={{ color: COLOR.ink }}>{findName(suppliers, inv.supplierId)}</td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.inkSoft }}>{fmtIDR(total)}</td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.good }}>{fmtIDR(paid)}</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: COLOR.danger }}>{fmtIDR(sisa)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(inv.date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openPay("pInvoice", inv)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Bayar Hutang</button></td>
                </tr>
              );
            })}
            {pInvoiceAPList.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada hutang tersisa — semua Faktur Pembelian sudah lunas.</td></tr>}
            {pInvoiceAPList.length > 0 && apShown.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada hutang yang cocok dengan "{apSearch}".</td></tr>}
          </tbody>
        </ResponsiveTable>
        </div>
      )}

      {/* SUBTAB 3: RIWAYAT PEMBAYARAN (DENGAN FILTER TANGGAL) */}
      {subTab === "history" && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: COLOR.inkSoft }}>Pembayaran Masuk (Pelanggan / DP)</div>
          <ResponsiveTable minWidth={700} colorConfig={COLOR}>
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["Tanggal", "Tipe", "Referensi", "Jumlah", "Metode", "Catatan", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filteredPaymentsIn].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                const inv = (invoices || []).find((x) => x.id === p.invoiceId);
                const so = (sos || []).find((x) => x.id === p.soId);
                const ref = inv ? inv.noFaktur : so ? so.soNumber : "-";
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5"><Badge tone="good" colorConfig={COLOR}>{p.type || "Pelunasan"}</Badge></td>
                    <td className="px-4 py-2.5 tabular-nums text-xs font-semibold" style={{ color: COLOR.ink }}>{ref}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: COLOR.good }}>{fmtIDR(p.amount)}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEditPay("edit-in", p)} className="text-xs mr-3 font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Edit</button>
                      <button onClick={() => deletePaymentIn(p.id)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.danger }}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
              {filteredPaymentsIn.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada pembayaran masuk pada periode ini.</td></tr>}
            </tbody>
          </ResponsiveTable>

          <div className="text-xs font-medium mb-2 mt-6" style={{ color: COLOR.inkSoft }}>Pembayaran Keluar (Supplier / Faktur Pembelian)</div>
          <ResponsiveTable minWidth={700} colorConfig={COLOR}>
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["Tanggal", "No. Faktur Vendor / PO", "Jumlah", "Metode", "Catatan", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filteredPaymentsOut].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => {
                const inv = (pInvoices || []).find((x) => x.id === p.pInvoiceId);
                const po = (pos || []).find((x) => x.id === p.poId);
                const ref = inv ? inv.noFaktur : po ? po.poNumber : "-";
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs font-semibold" style={{ color: COLOR.ink }}>{ref}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: COLOR.danger }}>{fmtIDR(p.amount)}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.method}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: COLOR.inkSoft }}>{p.note || "-"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEditPay("edit-out", p)} className="text-xs mr-3 font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Edit</button>
                      <button onClick={() => deletePaymentOut(p.id)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.danger }}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
              {filteredPaymentsOut.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Tidak ada pembayaran keluar pada periode ini.</td></tr>}
            </tbody>
          </ResponsiveTable>
        </div>
      )}

      {/* SUBTAB 4: BIAYA OPERASIONAL (DENGAN FILTER TANGGAL) */}
      {subTab === "expenses" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={openNewExp} colorConfig={COLOR}><Plus size={15} /> Catat Biaya Operasional</Button>
          </div>
          <ResponsiveTable minWidth={600} colorConfig={COLOR}>
            <thead>
              <tr style={{ background: COLOR.primarySoft }}>
                {["Tanggal", "Kategori", "Jumlah Kas Keluar", "Catatan / Keterangan", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: COLOR.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filteredExpenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map((e) => {
                const isPrepaid = e.category === "Sewa Dibayar di Muka (Prepaid 1 Tahun)";
                const monthlyVal = isPrepaid ? e.amount / 12 : e.amount;

                return (
                  <tr key={e.id} style={{ borderTop: `1px solid ${COLOR.border}` }}>
                    <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: COLOR.inkSoft }}>{fmtDate(e.date)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={isPrepaid ? "warn" : "neutral"} colorConfig={COLOR}>{e.category}</Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: COLOR.ink }}>
                      {fmtIDR(e.amount)}
                      {isPrepaid && (
                        <span className="block text-[10px] text-emerald-800 font-semibold mt-0.5">
                          (Beban Amortisasi: {fmtIDR(monthlyVal)} / bulan)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: COLOR.inkSoft }}>{e.note || "-"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEditExp(e)} className="text-xs mr-3 font-semibold cursor-pointer" style={{ color: COLOR.accent }}>Edit</button>
                      <button onClick={() => removeExpense(e.id)} className="text-xs font-semibold cursor-pointer" style={{ color: COLOR.danger }}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
              {filteredExpenses.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada biaya operasional tercatat pada periode ini.</td></tr>}
            </tbody>
          </ResponsiveTable>
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
          colorConfig={COLOR}
        >
          <Field label="Jumlah dibayar" colorConfig={COLOR}><TextInput type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} colorConfig={COLOR} /></Field>
          <Field label="Tanggal" colorConfig={COLOR}><TextInput type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} colorConfig={COLOR} /></Field>
          <Field label="Metode" colorConfig={COLOR}>
            <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} colorConfig={COLOR}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Catatan (opsional)" colorConfig={COLOR}><TextInput value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} colorConfig={COLOR} /></Field>
          <Button onClick={submitPayment} className="w-full justify-center mt-2 cursor-pointer" colorConfig={COLOR}>Simpan Pembayaran</Button>
        </Modal>
      )}

      {/* MODAL CATAT BIAYA OPERASIONAL */}
      {expModal && (
        <Modal title={editingExpId ? "Edit Biaya Operasional" : "Catat Biaya Operasional"} onClose={closeExpModal} colorConfig={COLOR}>
          <Field label="Kategori Biaya" colorConfig={COLOR}>
            <Select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} colorConfig={COLOR}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Jumlah Pengeluaran Kas (Rp)" colorConfig={COLOR}><TextInput type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="0" colorConfig={COLOR} /></Field>
          <Field label="Tanggal Pengeluaran" colorConfig={COLOR}><TextInput type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} colorConfig={COLOR} /></Field>
          <Field label="Catatan / Keterangan (opsional)" colorConfig={COLOR}><TextInput value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} placeholder="Contoh: Sewa Gudang Periode Sep 2026" colorConfig={COLOR} /></Field>
          <Button onClick={submitExpense} className="w-full justify-center mt-2 cursor-pointer" colorConfig={COLOR}>{editingExpId ? "Simpan Perubahan" : "Simpan Biaya Operasional"}</Button>
        </Modal>
      )}
    </div>
  );
}