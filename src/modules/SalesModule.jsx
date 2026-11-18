import React, { useState, useMemo } from "react";
import { withAtomic } from "../atomicScope";
import PaymentHistory from "../components/PaymentHistory";
import { Plus, Search, Printer, FileText, Trash2 } from "lucide-react";
import { newReview, isCleared, blockedReason, QABadge, reviewState, qaSignatureText, requiredClasses } from "../qa";
import { invoiceSoIds, invoiceHasSO, mergeDeductions, newestFirst, createdRank, remainingSOItems, soIsSplit } from "../invoiceLinks";
import { golonganCodeString, obatKerasBlockMessage } from "../docNumber";
import { nextDocNumber, isNumberTaken, golonganOfItems, docCode, isAutoFormat, numberGolMismatch, mixedMessage, GOLONGAN_LABEL, splitOrderByGolongan, nextDocNumbersForGroups } from "../docNumber";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { choosePaperAndPrint, printDocumentContent, QASignatureBlock, PrintArea, DocHeader, DocParties, DocTable, SignatureRow, PaymentInfo } from "../print";
import { computeBill, normalizeDeductions, legacyDiscountFields, cleanDeductions, itemsSubtotal } from "../billing";
import { ItemsTable, DeductionsEditor, BillSummary, AddedBadge } from "../components/OrderEditor";
import SearchableSelect from "../components/SearchableSelect";
const withRowIds = (list) => (list || []).map((d, i) => ({ ...d, id: d.id && d.id !== "legacy" ? d.id : `ded-${Date.now().toString(36)}-${i}` }));

// Helper Input Diskon Dwi-Mode (% / Rp)
function DiscountControl({ type, value, onTypeChange, onValueChange, colorConfig }) {
  return (
    <div className="flex items-center gap-1">
      <select
        value={type || "percent"}
        onChange={(e) => onTypeChange(e.target.value)}
        className="rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-pointer border shrink-0"
        style={{
          background: colorConfig?.surface || "#FFFFFF",
          color: colorConfig?.primary || "#059669",
          borderColor: colorConfig?.border || "#CBD5E1",
        }}
      >
        <option value="percent">%</option>
        <option value="amount">Rp</option>
      </select>
      <TextInput
        type="number"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "") onValueChange("");
          else {
            const num = Number(val);
            onValueChange(type === "percent" ? Math.min(100, Math.max(0, num)) : Math.max(0, num));
          }
        }}
        placeholder={type === "amount" ? "Rp 0" : "0 %"}
        colorConfig={colorConfig}
        className="tabular-nums text-right"
      />
    </div>
  );
}

// Helper Hitung Nilai Diskon Item
function getItemDiscountAmount(qty, unitPrice, discType, discVal) {
  const gross = qty * unitPrice;
  const val = Number(discVal || 0);
  if (discType === "amount") return Math.min(gross, val);
  return gross * (Math.min(100, val) / 100);
}

// HELPER FUNGSI CETAK POP-UP MANDIRI (BYPASS MODAL FOR MULTI-PAGE PRINTING)
// Review APJ/PJT diulang kalau isi barang (produk / qty) berubah.
function itemsChanged(oldItems, newItems) {
  const sig = (arr) => JSON.stringify((arr || []).map((it) => [it.productId, Number(it.qty) || 0]).sort());
  return sig(oldItems) !== sig(newItems);
}

export default function SalesView({
  products, customers, sos, batches, deliveryNotes, invoices, returns, paymentsIn,
  saveSOs, saveBatches, saveDeliveryNotes, saveInvoices, saveReturns, saveCustomers,
  allocateFEFO, findName, notify, stockByProduct, soTotal, invoiceTotal, soDPAmount, invoiceDPAmount,
  invoicePaidAmount, invoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR,
  calcTax, COMPANY_PROFILE, CUSTOMER_TYPES
}) {
  const [subTab, setSubTab] = useState("so");

  function shippedQty(soId, productId) {
    return (deliveryNotes || []).filter((dn) => dn.soId === soId).reduce((s, dn) => {
      const it = (dn.items || []).find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function getSOStatus(so) {
    if ((invoices || []).some((inv) => invoiceHasSO(inv, so.id))) {
      // SO yang fakturnya dipecah: baru "sudah difaktur" kalau semua barang yang diterima sudah masuk faktur
      if (soIsSplit(invoices, so.id) && remainingSOItems(so, deliveryNotes, invoices).length > 0) return "ready_to_invoice";
      return "invoiced";
    }
    if (so.isClosedPartial) return "ready_to_invoice";
    
    const dns = (deliveryNotes || []).filter((dn) => dn.soId === so.id);
    
    const fullyShipped = (so.items || []).every((it) => {
      const shipped = (dns || []).reduce((s, dn) => {
        const found = (dn.items || []).find((x) => x.productId === it.productId);
        return s + (found ? Number(found.qty || 0) : 0);
      }, 0);
      return shipped >= it.qty;
    });

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
    { id: "so", label: `Sales Order (${(sos || []).length})` },
    { id: "sj", label: `Surat Jalan (${(deliveryNotes || []).length})` },
    { id: "faktur", label: `Faktur (${(invoices || []).length})` },
    { id: "retur", label: `Retur (${(returns || []).length})` },
  ];

  const handleClosePartialSO = (so) => {
    if (!confirm(`Selesaikan SO ${so.soNumber}? Sisa barang yang belum dikirim akan dibatalkan otomatis agar Faktur Penjualan bisa dibuat.`)) return;

    const deliveredMap = {};
    (deliveryNotes || [])
      .filter((dn) => dn.soId === so.id && dn.status !== "batal")
      .forEach((dn) => {
        (dn.items || []).forEach((it) => {
          deliveredMap[it.productId] = (deliveredMap[it.productId] || 0) + Number(it.qty || 0);
        });
      });

    const updatedItems = (so.items || [])
      .map((item) => ({
        ...item,
        orderedQty: item.qty,
        qty: deliveredMap[item.productId] || 0
      }))
      .filter((item) => item.qty > 0);

    if (updatedItems.length === 0) {
      return notify("Tidak ada barang yang terkirim pada SO ini.", "danger");
    }

    const updatedSOList = (sos || []).map((s) =>
      s.id === so.id
        ? { ...s, items: updatedItems, status: "ready_to_invoice", isClosedPartial: true }
        : s
    );

    saveSOs(updatedSOList);
    notify(`SO ${so.soNumber} diselesaikan! Faktur Penjualan kini sudah siap dibuat.`);
  };

  return (
    <div>
      <div className="no-print">
        <Eyebrow>Transaksi</Eyebrow>
        <h2 className="text-xl font-semibold mb-1" style={{ color: colorConfig?.ink }}>Penjualan</h2>
        <p className="text-sm mb-4" style={{ color: colorConfig?.inkSoft }}>
          Alur: Sales Order → Surat Jalan (stok terpotong di sini) → konfirmasi terima → Faktur → Retur (bila ada).
        </p>

        <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit flex-wrap" style={{ background: colorConfig?.primarySoft }}>
          {SUBNAV.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubTab(s.id)}
              className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer"
              style={{ background: subTab === s.id ? colorConfig?.primary : "transparent", color: subTab === s.id ? "#fff" : colorConfig?.primary }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "so" && (
        <SOTab {...{ products, customers, sos, deliveryNotes, invoices, saveSOs, saveCustomers, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES, handleClosePartialSO, shippedQty }} />
      )}
      {subTab === "sj" && (
        <SJTab {...{ products, customers, sos, batches, deliveryNotes, invoices, returns, saveBatches, saveDeliveryNotes, saveReturns, findName, notify, getSOStatus, shippedQty, soTotal, invoiceTotal, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }} />
      )}
      {subTab === "faktur" && (
        <FakturTab {...{ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, batches, saveBatches, saveInvoices, saveCustomers, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoiceDPAmount, invoicePaidAmount, invoiceReturnedAmount, stockByProduct, allocateFEFO, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }} />
      )}
      {subTab === "retur" && (
        <ReturTab {...{ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }} />
      )}
    </div>
  );
}

// --- SUB-KOMPONEN SO TAB ---
function SOTab({ products, customers, sos, deliveryNotes, invoices, saveSOs, saveCustomers, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES, handleClosePartialSO, shippedQty }) {
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailSO, setDetailSO] = useState(null);
  const [printSO, setPrintSO] = useState(null);
  const [soNumber, setSoNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountTypeHeader, setDiscountTypeHeader] = useState("percent");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [deductions, setDeductions] = useState([]);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickCust, setModalQuickCust] = useState(false);
  const [quickCustForm, setQuickCustForm] = useState({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" });

  const [searchSO, setSearchSO] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState("created"); // default: terakhir dibuat di atas
  const [sortOrder, setSortOrder] = useState("desc");

  function handleSort(field) {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
  }

  function renderSortIcon(field) {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return sortOrder === "asc" ? <span className="ml-1 font-bold">↑</span> : <span className="ml-1 font-bold">↓</span>;
  }

  const filteredAndSortedSOs = useMemo(() => {
    let list = (sos || []).filter((so) => {
      const custName = findName(customers, so.customerId).toLowerCase();
      const numSO = (so.soNumber || "").toLowerCase();
      const q = searchSO.toLowerCase();
      return (numSO.includes(q) || custName.includes(q)) && (statusFilter === "ALL" || getSOStatus(so) === statusFilter);
    });

    const rankSO = createdRank(sos);
    return list.sort((a, b) => {
      let valA, valB;
      if (sortField === "created") { valA = rankSO(a); valB = rankSO(b); }
      else if (sortField === "soNumber") { valA = a.soNumber.toLowerCase(); valB = b.soNumber.toLowerCase(); }
      else if (sortField === "customer") { valA = findName(customers, a.customerId).toLowerCase(); valB = findName(customers, b.customerId).toLowerCase(); }
      else if (sortField === "date") { valA = new Date(a.date || 0); valB = new Date(b.date || 0); }
      else if (sortField === "total") { valA = soTotal(a); valB = soTotal(b); }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [sos, customers, searchSO, statusFilter, sortField, sortOrder, getSOStatus, soTotal, findName]);

  // Nomor otomatis ikut golongan item (OB / OK / AL)
  React.useEffect(() => {
    if (!modal || editingId) return;
    const g = golonganOfItems(items, products);
    const want = docCode("SO", g.mixed ? null : g.code);
    setSoNumber((cur) => (isAutoFormat(cur, "SO") && !String(cur).toUpperCase().includes(`/${want}/`))
      ? nextDocNumber((sos || []).map((x) => x.soNumber), want) : cur);
  }, [items, modal, editingId]);

  function openNew() {
    const nextNo = nextDocNumber((sos || []).map((x) => x.soNumber), "SO");

    setSoNumber(nextNo);
    setCustomerId((customers || [])[0]?.id || "");
    setDate(todayISO());
    setTaxType("none");
    setDiscountTypeHeader("percent");
    setDiscountPercentHeader(0); setDeductions([]);
    setItems([]);
    setSearchProd("");
    setEditingId(null);
    setModal("new");
  }

  function openEdit(so) {
    if ((invoices || []).some((inv) => invoiceHasSO(inv, so.id))) {
      return notify("Gagal Edit: SO ini sudah diterbitkan Faktur Penjualan.", "danger");
    }
    
    setEditingId(so.id);
    setSoNumber(so.soNumber);
    setCustomerId(so.customerId);
    setDate(so.date || todayISO());
    setTaxType(so.taxType || "none");
    setDiscountTypeHeader(so.discountType || "percent");
    setDiscountPercentHeader(so.discountPercent ?? so.discount ?? 0); setDeductions(withRowIds(normalizeDeductions(so)));
    setItems((so.items || []).map(it => ({ 
      ...it, 
      discountType: it.discountType || "percent", 
      discountPercent: it.discountPercent ?? 0,
      minQty: shippedQty(so.id, it.productId)
    })));
    setSearchProd("");
    setModal("edit");
  }

  function handleSelectCustomer(val) {
    if (val === "__ADD_NEW__") {
      setQuickCustForm({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" });
      setModalQuickCust(true);
    } else setCustomerId(val);
  }

  async function submitQuickCustomer(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!quickCustForm.name.trim()) return notify("Nama pelanggan wajib diisi", "danger");
    const newId = uid();
    await saveCustomers([...(customers || []), { ...quickCustForm, id: newId }]);
    setCustomerId(newId);
    setModalQuickCust(false);
    notify(`Pelanggan "${quickCustForm.name}" berhasil ditambahkan & terpilih`);
  }

  function addProductToSO(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    else setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice, discountType: "percent", discountPercent: 0 }]);
  }

  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }

  const rawSubtotal = items.reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmount = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
    return s + Math.max(0, gross - discAmount);
  }, 0);

  const effectiveHeaderPct = discountTypeHeader === "amount" 
    ? (rawSubtotal > 0 ? (Math.min(rawSubtotal, Number(discountPercentHeader || 0)) / rawSubtotal) * 100 : 0)
    : Number(discountPercentHeader || 0);

  const taxInfo = calcTax(rawSubtotal, taxType, effectiveHeaderPct);
  const soBill = computeBill({ items, taxType, deductions }, { includeOngkir: false });

  async function submit() {
    if (!soNumber.trim()) return notify("Nomor SO wajib diisi", "danger");
    if (isNumberTaken(sos, "soNumber", soNumber, editingId)) return notify(`Nomor SO ${soNumber.trim()} sudah dipakai SO lain. Ganti nomornya dulu.`, "danger");
    if (!customerId) return notify("Pilih pelanggan", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
    {
      const blockMsg = obatKerasBlockMessage(items, products, (customers || []).find((c) => c.id === customerId));
      if (blockMsg) return notify(blockMsg, "danger");
    }
    {
      const gol = golonganOfItems(items, products);
      if (gol.mixed && editingId) return notify(mixedMessage(gol), "danger");
      if (!gol.mixed && numberGolMismatch(soNumber, "SO", gol.code)) return notify(`Nomor ${soNumber.trim()} nggak sesuai golongan item (${GOLONGAN_LABEL[gol.code]}). Ganti kodenya jadi SO-${gol.code}.`, "danger");
    }

    if (editingId) {
      for (const it of items) {
        const alreadyShipped = shippedQty(editingId, it.productId);
        if (Number(it.qty) < alreadyShipped) {
          const p = (products || []).find((x) => x.id === it.productId);
          return notify(
            `Gagal simpan: Qty "${p?.name || "Produk"}" minimal ${alreadyShipped} unit (jumlah yang sudah dikirim di Surat Jalan).`,
            "danger"
          );
        }
      }
    }

    const currentStatus = editingId 
      ? ((deliveryNotes || []).some(dn => dn.soId === editingId) ? "partially_shipped" : "open")
      : "open";

    const payload = { 
      soNumber: soNumber.trim(), 
      customerId, 
      date, 
      taxType, 
      ...legacyDiscountFields(cleanDeductions(deductions), rawSubtotal),
      deductions: cleanDeductions(deductions),
      items, 
      status: currentStatus,
      isClosedPartial: false
    };

    if (editingId) {
      const oldSO = (sos || []).find((s) => s.id === editingId);
      // Isi barang berubah -> wajib review ulang. SO lama (sebelum CDOB) ikut masuk review kalau diubah isinya.
      const qaReview = !oldSO || itemsChanged(oldSO.items, items) ? newReview(items, products) : oldSO.qaReview;
      await saveSOs((sos || []).map(s => s.id === editingId ? { ...s, ...payload, ...(qaReview ? { qaReview } : {}) } : s));
      notify(`${soNumber.trim()} berhasil diperbarui${qaReview && oldSO && qaReview !== oldSO.qaReview ? " · menunggu review APJ/PJT ulang" : ""}`);
    } else {
      const parts = splitOrderByGolongan(items, products, cleanDeductions(deductions), 0);
      if (parts.length > 1) {
        // Order campur golongan -> otomatis dipecah jadi 1 SO per golongan
        const nos = nextDocNumbersForGroups((sos || []).map((x) => x.soNumber), "SO", parts.map((x) => x.gol));
        const msg = `Order ini isinya ${parts.length} golongan, jadi bakal dipecah otomatis jadi ${parts.length} dokumen:\n\n` +
          parts.map((x, i) => `• ${nos[i]} · ${GOLONGAN_LABEL[x.gol]} (${x.items.length} item)`).join("\n") +
          `\n\nPotongan persen berlaku di tiap dokumen, potongan Rupiah & ongkir dibagi proporsional. Lanjut simpan?`;
        if (!confirm(msg)) return;
        const newSOs = parts.map((x, i) => ({
          id: uid(), ...payload, soNumber: nos[i], items: x.items,
          ...legacyDiscountFields(x.deductions, itemsSubtotal(x.items)), deductions: x.deductions,
          splitGroup: nos.join(" + "), qaReview: newReview(x.items, products),
        }));
        await saveSOs([...(sos || []), ...newSOs]);
        notify(`Order dipecah jadi ${nos.length} SO: ${nos.join(", ")} · menunggu review APJ/PJT`);
      } else {
        await saveSOs([...(sos || []), { id: uid(), ...payload, qaReview: newReview(items, products) }]);
        notify(`${soNumber.trim()} dibuat · menunggu review APJ/PJT`);
      }
    }
    setModal(null); setEditingId(null);
  }

  async function cancelSO(so) {
    if ((deliveryNotes || []).some((dn) => dn.soId === so.id)) {
      return notify("Gagal membatalkan: SO ini sudah memiliki Surat Jalan. Batalkan Surat Jalan terlebih dahulu.", "danger");
    }
    await saveSOs((sos || []).filter((s) => s.id !== so.id));
    notify(`${so.soNumber} berhasil dibatalkan`);
  }

  const filteredProds = (products || []).filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
            <TextInput placeholder="Cari No. SO / Pelanggan..." value={searchSO} onChange={(e) => setSearchSO(e.target.value)} className="pl-8" colorConfig={colorConfig} />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48" colorConfig={colorConfig}>
            <option value="ALL">Semua Status SO</option>
            <option value="open">Baru</option>
            <option value="partially_shipped">Sebagian Dikirim</option>
            <option value="shipped">Menunggu Konfirmasi Terima</option>
            <option value="ready_to_invoice">Siap Difaktur</option>
            <option value="invoiced">Sudah Difaktur</option>
          </Select>
        </div>
        <Button onClick={openNew} colorConfig={colorConfig}><Plus size={15} /> Buat SO</Button>
      </div>

      <ResponsiveTable minWidth={600} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            <th onClick={() => handleSort("soNumber")} className="text-left px-4 py-2 font-semibold text-xs uppercase cursor-pointer select-none" style={{ color: colorConfig?.primary }}>No. SO {renderSortIcon("soNumber")}</th>
            <th onClick={() => handleSort("customer")} className="text-left px-4 py-2 font-semibold text-xs uppercase cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Pelanggan {renderSortIcon("customer")}</th>
            <th onClick={() => handleSort("date")} className="text-left px-4 py-2 font-semibold text-xs uppercase cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Tanggal {renderSortIcon("date")}</th>
            <th onClick={() => handleSort("total")} className="text-left px-4 py-2 font-semibold text-xs uppercase cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Total {renderSortIcon("total")}</th>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase" style={{ color: colorConfig?.primary }}>Status</th>
            <th className="text-right px-4 py-2 font-semibold text-xs uppercase" style={{ color: colorConfig?.primary }}></th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedSOs.map((so) => {
            const st = getSOStatus(so);
            const s = STATUS_LABEL[st];
            const hasInvoice = (invoices || []).some((inv) => invoiceHasSO(inv, so.id));
            const hasDeliveryNote = (deliveryNotes || []).some((dn) => dn.soId === so.id);
            return (
              <tr key={so.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{so.soNumber}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{findName(customers, so.customerId)}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(so.date)}</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{fmtIDR(soTotal(so))}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={s.tone} colorConfig={colorConfig}>{s.label}</Badge>
                    <QABadge doc={so} colorConfig={colorConfig} compact />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2.5">
                    {st === "partially_shipped" && (
                      <button
                        type="button"
                        onClick={() => handleClosePartialSO(so)}
                        className="text-xs px-2 py-1 font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                      >
                        Selesaikan Order
                      </button>
                    )}

                    <button onClick={() => setPrintSO(so)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}>
                      <Printer size={13} /> Cetak SO
                    </button>
                    
                    <button onClick={() => setDetailSO(so)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>
                      Detail
                    </button>

                    {!hasInvoice && (
                      <button onClick={() => openEdit(so)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>
                        Edit
                      </button>
                    )}

                    {!hasDeliveryNote && (
                      <button onClick={() => cancelSO(so)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>
                        Batalkan SO
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {filteredAndSortedSOs.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada Sales Order yang cocok.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modal && (
        <Modal title={editingId ? `Edit Sales Order — ${soNumber}` : "Buat Sales Order (SO)"} onClose={() => { setModal(null); setEditingId(null); }} wide xwide colorConfig={colorConfig}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Nomor SO" colorConfig={colorConfig}><TextInput value={soNumber} onChange={(e) => setSoNumber(e.target.value)} placeholder="Contoh: 500/SO/WPM/X/26" className="tabular-nums" colorConfig={colorConfig} /></Field>
            <Field label="Pelanggan" colorConfig={colorConfig}>
              <SearchableSelect value={customerId} onChange={handleSelectCustomer} colorConfig={colorConfig} placeholder="-- Pilih Pelanggan --"
                options={(customers || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.type, c.address].filter(Boolean).join(" · ") }))}
                pinnedOptions={[{ value: "__ADD_NEW__", label: "+ Tambah Pelanggan Baru..." }]} />
            </Field>
            <Field label="Tanggal SO" colorConfig={colorConfig}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} /></Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Field label="Opsi PPN (Pajak)" colorConfig={colorConfig}>
              <Select value={taxType} onChange={(e) => setTaxType(e.target.value)} colorConfig={colorConfig}>
                <option value="none">Non-PPN (Tanpa Pajak)</option>
                <option value="ppn11">PPN 11% (Tambah Pajak)</option>
                <option value="include11">PPN 11% (Termasuk Pajak)</option>
              </Select>
            </Field>
          </div>

          <div className="mb-4 p-3 rounded-xl border" style={{ background: colorConfig?.bg, borderColor: colorConfig?.border }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Pilih / Tambah Produk Pesanan</div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
              <TextInput placeholder="Cari nama produk / kategori..." value={searchProd} onChange={(e) => setSearchProd(e.target.value)} className="pl-8" colorConfig={colorConfig} />
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {filteredProds.map((prod) => {
                const s = stockByProduct[prod.id] || { qty: 0 };
                return (
                  <div key={prod.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs" style={{ borderColor: colorConfig?.border }}>
                    <div>
                      <span className="font-semibold" style={{ color: colorConfig?.ink }}>{prod.name}</span>
                      <span className="ml-2 text-[11px] tabular-nums" style={{ color: colorConfig?.inkSoft }}>({prod.category}) · Stok: {s.qty} {prod.unit}</span><AddedBadge items={items} productId={prod.id} colorConfig={colorConfig} />
                    </div>
                    <Button variant="ghost" onClick={() => addProductToSO(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}><Plus size={12} /> Tambah</Button>
                  </div>
                );
              })}
            </div>
          </div>

          <ItemsTable items={items} products={products} stockByProduct={stockByProduct} showStock={true} readOnly={false} withBatch={false}

            onUpdate={updateItem} onRemove={removeItem} fmtIDR={fmtIDR} colorConfig={colorConfig} priceLabel="Harga Jual" title="Rincian Item Dipesan" />

          <DeductionsEditor deductions={deductions} onChange={setDeductions} bill={soBill} colorConfig={colorConfig} fmtIDR={fmtIDR} />

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <BillSummary bill={soBill} fmtIDR={fmtIDR} colorConfig={colorConfig} totalLabel="Total SO" />
            <Button onClick={submit} className="justify-center" colorConfig={colorConfig}>{editingId ? "Simpan Perubahan SO" : "Simpan & Konfirmasi SO"}</Button>
          </div>
        </Modal>
      )}

      {modalQuickCust && (
        <Modal title="Tambah Pelanggan Baru (Cepat)" onClose={() => setModalQuickCust(false)} isSubModal={true} colorConfig={colorConfig}>
          <form onSubmit={submitQuickCustomer}>
            <Field label="Nama Pelanggan / Faskes" colorConfig={colorConfig}><TextInput value={quickCustForm.name} onChange={(e) => setQuickCustForm({ ...quickCustForm, name: e.target.value })} placeholder="Contoh: Klinik Utama AGP Arthakes" required colorConfig={colorConfig} /></Field>
            <Field label="Tipe Pelanggan" colorConfig={colorConfig}>
              <Select value={quickCustForm.type} onChange={(e) => setQuickCustForm({ ...quickCustForm, type: e.target.value })} colorConfig={colorConfig}>
                {(CUSTOMER_TYPES || []).map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="NPWP Pelanggan (opsional)" colorConfig={colorConfig}><TextInput value={quickCustForm.npwp} onChange={(e) => setQuickCustForm({ ...quickCustForm, npwp: e.target.value })} placeholder="Contoh: 01.234.567.8-012.000" colorConfig={colorConfig} /></Field>
            <Field label="Kontak / No. HP" colorConfig={colorConfig}><TextInput value={quickCustForm.contact} onChange={(e) => setQuickCustForm({ ...quickCustForm, contact: e.target.value })} placeholder="No HP / Email" colorConfig={colorConfig} /></Field>
            <Field label="Alamat Pengiriman" colorConfig={colorConfig}><TextInput value={quickCustForm.address} onChange={(e) => setQuickCustForm({ ...quickCustForm, address: e.target.value })} placeholder="Alamat lengkap faskes" colorConfig={colorConfig} /></Field>
            <Button type="submit" onClick={submitQuickCustomer} className="w-full justify-center mt-3 cursor-pointer" colorConfig={colorConfig}>Simpan & Pilih Pelanggan Ini</Button>
          </form>
        </Modal>
      )}

      {detailSO && (
        <Modal title={`Detail ${detailSO.soNumber}`} onClose={() => setDetailSO(null)} wide colorConfig={colorConfig}>
          <div className="text-xs mb-3" style={{ color: colorConfig?.inkSoft }}>
            Pelanggan: {findName(customers, detailSO.customerId)} · Tanggal: {fmtDate(detailSO.date)} · Status: {STATUS_LABEL[getSOStatus(detailSO)].label}
          </div>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty", "Harga", "Diskon", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailSO.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                const gross = it.qty * it.unitPrice;
                const lineTotal = Math.max(0, gross - discAmt);

                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-800 font-semibold">{discAmt > 0 ? (it.discountType === "amount" ? fmtIDR(it.discountPercent) : `${it.discountPercent}%`) : "-"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right tabular-nums text-sm mb-2 font-bold" style={{ color: colorConfig?.ink }}>Total SO: {fmtIDR(soTotal(detailSO))}</div>
        </Modal>
      )}

      {/* TEMPLATE CETAK SALES ORDER (POP-UP MANDIRI CETAK MULTI-PAGE) */}
      {printSO && (
        <Modal title={`Cetak Sales Order — ${printSO.soNumber}`} onClose={() => setPrintSO(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">

            <Button onClick={() => choosePaperAndPrint("printable-so", `Sales Order - ${printSO.soNumber}`)} variant="primary" colorConfig={colorConfig}>
              <Printer size={15} /> Cetak SO / Simpan PDF
            </Button>
          </div>
          <div className="overflow-x-auto w-full">
            <div id="printable-so" className="p-4 sm:p-6 bg-white border rounded-xl text-xs text-gray-800 min-w-[550px] sm:min-w-0">
              <div className="flex flex-col sm:flex-row items-start justify-between border-b-2 pb-4 mb-4 gap-3 sm:gap-0" style={{ borderColor: colorConfig?.primary }}>
                <div className="flex items-start gap-3">
                  {COMPANY_PROFILE?.logoUrl && <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-10 sm:h-12 object-contain shrink-0" />}
                  <div>
                    <div className="text-sm sm:text-base uppercase tracking-wide font-bold" style={{ color: colorConfig?.primary }}>{COMPANY_PROFILE?.name}</div>
                    <p className="text-[11px] text-gray-600">{COMPANY_PROFILE?.tagline}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{COMPANY_PROFILE?.address}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
                  <div className="text-base sm:text-lg uppercase tracking-wider text-gray-700 font-bold">SURAT PESANAN / SALES ORDER</div>
                  <div className="tabular-nums text-sm mt-0.5 sm:mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printSO.soNumber}</div>
                </div>
              </div>

              {(() => {
                const cust = (customers || []).find((c) => c.id === printSO.customerId);
                const rawSub = (printSO.items || []).reduce((s, it) => {
                  const gross = it.qty * it.unitPrice;
                  const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                  return s + Math.max(0, gross - discAmt);
                }, 0);

                const effPct = printSO.discountType === "amount" 
                  ? (rawSub > 0 ? (Math.min(rawSub, Number(printSO.discountPercent || 0)) / rawSub) * 100 : 0)
                  : Number(printSO.discountPercent || 0);

                const _bill = computeBill(printSO, { includeOngkir: false }); // pemotongan (diskon & fee) ikut dihitung
                const taxInfo = { ..._bill, total: _bill.afterTax - _bill.fee };

                return (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Kepada Yth. (Pelanggan)</div>
                        <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Detail Dokumen</div>
                        <div><span className="text-gray-500">Tanggal Order:</span> <span className="tabular-nums">{fmtDate(printSO.date)}</span></div>
                      </div>
                    </div>

                    <table className="w-full text-xs border-collapse mb-6">
                      <thead>
                        <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Harga Satuan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Diskon</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(printSO.items || []).map((it, idx) => {
                          const p = (products || []).find((x) => x.id === it.productId);
                          const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                          const gross = it.qty * it.unitPrice;
                          const lineTotal = Math.max(0, gross - discAmt);

                          return (
                            <tr key={idx} className="border-b">
                              <td className="py-2.5 px-2 tabular-nums text-gray-500">{idx + 1}</td>
                              <td className="py-2.5 px-2 text-gray-900 font-bold">{p?.name || "-"}</td>
                              <td className="py-2.5 px-2 text-center tabular-nums font-bold">{it.qty} {p?.unit || "unit"}</td>
                              <td className="py-2.5 px-2 text-right tabular-nums">{fmtIDR(it.unitPrice)}</td>
                              <td className="py-2.5 px-2 text-center tabular-nums text-emerald-800">{discAmt > 0 ? (it.discountType === "amount" ? fmtIDR(it.discountPercent) : `${it.discountPercent}%`) : "-"}</td>
                              <td className="py-2.5 px-2 text-right tabular-nums font-bold">{fmtIDR(lineTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="flex justify-between items-start mb-8 gap-4">
                      <div className="w-1/2 p-3 rounded-lg border bg-gray-50 text-[11px]">
                        <div className="text-gray-700 mb-1 font-bold">Ketentuan & Syarat Pemesanan:</div>
                        <p className="text-gray-500 leading-relaxed">
                          1. Barang yang dipesan akan disiapkan setelah Sales Order disetujui.<br />
                          2. Harga sudah termasuk pajak sesuai dengan ketentuan perpajakan yang berlaku.
                        </p>
                      </div>

                      <div className="w-5/12 text-xs flex flex-col gap-1.5">
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">Subtotal Item</span><span className="tabular-nums font-bold">{fmtIDR(rawSub)}</span></div>
                        {taxInfo.discHeaderAmount > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Diskon Nota</span><span className="tabular-nums font-bold">- {fmtIDR(taxInfo.discHeaderAmount)}</span></div>}
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">DPP</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.dpp)}</span></div>
                        {taxInfo.ppn > 0 && <div className="flex justify-between py-1 border-b text-emerald-800"><span>PPN (11%)</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.ppn)}</span></div>}
                        {(taxInfo.feeLines || []).filter((d) => d.amount > 0).map((d) => <div key={d.id} className="flex justify-between py-1 border-b text-red-600"><span>Fee{d.mode !== "amount" ? ` ${d.value}%` : ""}{d.note ? ` (${d.note})` : ""}</span><span className="tabular-nums font-bold">- {fmtIDR(d.amount)}</span></div>)}
                        <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: colorConfig?.primary, borderColor: colorConfig?.primary }}><span>Total Nilai Pesanan</span><span className="tabular-nums">{fmtIDR(taxInfo.total)}</span></div>
                      </div>
                    </div>
                    <QASignatureBlock doc={printSO} leftLabel="Pemesan," leftName={cust?.name || ""}
                      requiredFallback={requiredClasses(printSO.items, products)} />
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- SUB-KOMPONEN SURAT JALAN TAB ---
function SJTab({ products, customers, sos, batches, deliveryNotes, invoices, returns, saveBatches, saveDeliveryNotes, saveReturns, findName, notify, getSOStatus, shippedQty, soTotal, invoiceTotal, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }) {
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailDN, setDetailDN] = useState(null);
  const [printDN, setPrintInvDN] = useState(null);
  const [printTT, setPrintTT] = useState(null);

  const [noSJ, setNoSJ] = useState("");
  const [soId, setSoId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [shipQty, setShipQty] = useState({});
  const [receiveForm, setReceiveForm] = useState({});

  const getCalculatedShippedQty = (so, productId) => {
    if (!so || !deliveryNotes) return 0;
    return (deliveryNotes || []).reduce((sum, dn) => {
      const isMatch = dn.soId === so.id || dn.soNumber === so.soNumber;
      if (!isMatch) return 0;
      const itemInDN = (dn.items || []).find((x) => x.productId === productId);
      return sum + (itemInDN ? Number(itemInDN.qty || 0) : 0);
    }, 0);
  };

  const eligibleSOs = useMemo(() => {
    if (!sos || !Array.isArray(sos)) return [];
    return sos.filter((so) => {
      if (!isCleared(so)) return false; // CDOB: SO wajib disetujui APJ/PJT dulu
      const hasInvoice = (invoices || []).some((inv) => invoiceHasSO(inv, so.id) || inv.soNumber === so.soNumber);
      if (hasInvoice) return false;
      return (so.items || []).some((it) => {
        const totalShipped = (deliveryNotes || []).reduce((sum, dn) => {
          const isMatch = dn.soId === so.id || dn.soNumber === so.soNumber;
          if (!isMatch) return sum;
          const found = (dn.items || []).find((x) => x.productId === it.productId);
          return sum + (found ? Number(found.qty || 0) : 0);
        }, 0);
        return Number(it.qty || 0) - totalShipped > 0;
      });
    });
  }, [sos, deliveryNotes, invoices]);

  const selectedSO = (sos || []).find((x) => x.id === soId);

  // Nomor SJ ikut golongan SO yang dipilih (SO lama yang campur: pakai golongan tertinggi)
  React.useEffect(() => {
    if (!modal || editingId) return;
    const g = golonganOfItems(selectedSO?.items, products);
    const want = docCode("SJ", g.mixed ? g.highest : g.code);
    setNoSJ((cur) => (isAutoFormat(cur, "SJ") && !String(cur).toUpperCase().includes(`/${want}/`))
      ? nextDocNumber((deliveryNotes || []).map((x) => x.noSJ), want) : cur);
  }, [soId, modal, editingId]);

  function openNew() {
    const nextNo = nextDocNumber((deliveryNotes || []).map((x) => x.noSJ), "SJ");

    setNoSJ(nextNo);
    if (eligibleSOs.length > 0) {
      const firstSO = eligibleSOs[0];
      setSoId(firstSO.id); setDate(todayISO());
      const init = {};
      (firstSO.items || []).forEach((it) => {
        const alreadyShipped = getCalculatedShippedQty(firstSO, it.productId);
        init[it.productId] = Math.max(0, Number(it.qty || 0) - alreadyShipped);
      });
      setShipQty(init);
    } else { setSoId(""); setShipQty({}); }
    setEditingId(null); setModal("new");
  }

  function openEdit(dn) {
    if ((invoices || []).some((inv) => invoiceHasSO(inv, dn.soId))) {
      return notify("Gagal Edit: Surat Jalan ini sudah memiliki Faktur Penjualan. Batalkan Faktur terlebih dahulu.", "danger");
    }
    setEditingId(dn.id); setNoSJ(dn.noSJ); setSoId(dn.soId); setDate(dn.date || todayISO());
    const init = {}; (dn.items || []).forEach(it => { init[it.productId] = it.qty; });
    setShipQty(init); setModal("edit");
  }

  function changeSO(id) {
    setSoId(id); const so = (sos || []).find((x) => x.id === id);
    const init = {};
    if (so) (so.items || []).forEach((it) => { init[it.productId] = Math.max(0, it.qty - shippedQty(so.id, it.productId)); });
    setShipQty(init);
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const submitSJ = (...args) => withAtomic(() => submitSJ__raw(...args));
  async function submitSJ__raw() {
    if (!noSJ.trim()) return notify("Nomor Surat Jalan wajib diisi", "danger");
    if (isNumberTaken(deliveryNotes, "noSJ", noSJ, editingId)) return notify(`Nomor Surat Jalan ${noSJ.trim()} sudah dipakai. Ganti nomornya dulu.`, "danger");
    if (!selectedSO) return notify("Pilih SO terlebih dahulu", "danger");
    if (!isCleared(selectedSO)) return notify(blockedReason(selectedSO, `SO ${selectedSO.soNumber}`), "danger");

    let working = (batches || []).map((b) => ({ ...b }));
    if (editingId) {
      const oldDN = (deliveryNotes || []).find(x => x.id === editingId);
      if (oldDN) {
        (oldDN.items || []).forEach(it => {
          (it.allocations || []).forEach(alloc => {
            const b = working.find(x => x.id === alloc.batchId);
            if (b) b.qty += alloc.qty;
          });
        });
      }
    }

    const lines = (selectedSO.items || []).map((it) => {
      const oldQty = editingId ? ((deliveryNotes.find(x=>x.id===editingId)?.items.find(x=>x.productId===it.productId)?.qty)||0) : 0;
      return { productId: it.productId, qty: Number(shipQty[it.productId]) || 0, maxQty: Math.max(0, it.qty - shippedQty(selectedSO.id, it.productId) + oldQty) };
    }).filter((l) => l.qty > 0);

    if (lines.length === 0) return notify("Isi jumlah yang mau dikirim", "danger");

    for (const l of lines) {
      if (l.qty > l.maxQty) {
        const p = (products || []).find((x) => x.id === l.productId);
        return notify(`${p?.name}: melebihi sisa yang belum dikirim (${l.maxQty})`, "danger");
      }
    }

    const shortages = []; const itemsWithAlloc = [];
    for (const l of lines) {
      const avail = working.filter((b) => b.productId === l.productId && b.qty > 0 && !b.quarantine && b.expiryDate >= todayISO()).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      let remaining = l.qty; const allocations = [];
      for (const b of avail) {
        if (remaining <= 0) break;
        const take = Math.min(b.qty, remaining);
        allocations.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take });
        b.qty -= take; remaining -= take;
      }
      if (remaining > 0) { const p = (products || []).find((x) => x.id === l.productId); shortages.push(`${p?.name}: kurang ${remaining} ${p?.unit}`); }
      itemsWithAlloc.push({ productId: l.productId, qty: l.qty, allocations });
    }

    if (shortages.length > 0) return notify("Stok tidak cukup — " + shortages.join(", "), "danger");

    await saveBatches(working);
    if (editingId) {
      await saveDeliveryNotes((deliveryNotes || []).map(dn => dn.id === editingId ? { ...dn, noSJ: noSJ.trim(), date, items: itemsWithAlloc } : dn));
      notify(`${noSJ.trim()} berhasil diperbarui`);
    } else {
      await saveDeliveryNotes([...(deliveryNotes || []), { id: uid(), noSJ: noSJ.trim(), soId: selectedSO.id, date, items: itemsWithAlloc, status: "dikirim" }]);
      notify(`${noSJ.trim()} dibuat, stok terpotong`);
    }
    setModal(null); setEditingId(null);
  }

  function openReceive(dn) {
    const init = {}; (dn.items || []).forEach((it, i) => { init[i] = it.qty; });
    setReceiveForm(init); setModal({ receive: dn });
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const submitReceive = (...args) => withAtomic(() => submitReceive__raw(...args));
  async function submitReceive__raw(dn) {
    let working = (batches || []).map((b) => ({ ...b }));
    const newReturnItems = [];
    const updatedItems = (dn.items || []).map((it, i) => {
      const receivedQty = Math.max(0, Math.min(it.qty, Number(receiveForm[i]) || 0));
      const shortfall = it.qty - receivedQty;
      if (shortfall > 0) {
        let remaining = shortfall; const restocked = [];
        for (let a = (it.allocations || []).length - 1; a >= 0 && remaining > 0; a--) {
          const alloc = it.allocations[a];
          const take = Math.min(alloc.qty, remaining);
          const b = working.find((x) => x.id === alloc.batchId);
          if (b) { b.qty += take; restocked.push({ batchId: alloc.batchId, batchNo: alloc.batchNo, qty: take }); }
          remaining -= take;
        }
        const so = (sos || []).find((s) => s.id === dn.soId);
        const unitPrice = (so?.items || []).find((x) => x.productId === it.productId)?.unitPrice || 0;
        newReturnItems.push({ productId: it.productId, qty: shortfall, unitPrice, restockedBatches: restocked });
      }
      return { ...it, receivedQty };
    });

    await saveBatches(working);
    await saveDeliveryNotes((deliveryNotes || []).map((x) => (x.id === dn.id ? { ...x, items: updatedItems, status: "diterima", receivedDate: todayISO() } : x)));
    if (newReturnItems.length > 0) {
      const gRet = golonganOfItems(newReturnItems, products);
      const noRetur = nextDocNumber((returns || []).map((r) => r.noRetur), docCode("RET", gRet.mixed ? gRet.highest : gRet.code), { start: 3 });
      await saveReturns([...(returns || []), { id: uid(), noRetur, source: "sj", sjId: dn.id, soId: dn.soId, date: todayISO(), items: newReturnItems }]);
      notify(`${dn.noSJ} diterima sebagian — retur ${noRetur} tercatat`, "warn");
    } else notify(`${dn.noSJ} dikonfirmasi diterima lengkap`);
    setModal(null);
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const cancelSJ = (...args) => withAtomic(() => cancelSJ__raw(...args));
  async function cancelSJ__raw(dn) {
    if ((invoices || []).some((inv) => invoiceHasSO(inv, dn.soId))) {
      return notify("Gagal membatalkan: Faktur Penjualan untuk transaksi ini sudah terbit. Batalkan Faktur terlebih dahulu.", "danger");
    }
    let working = (batches || []).map((b) => ({ ...b }));
    (dn.items || []).forEach((it) => {
      (it.allocations || []).forEach((alloc) => {
        const b = working.find((x) => x.id === alloc.batchId);
        if (b) b.qty += alloc.qty;
      });
    });
    await saveBatches(working);
    await saveDeliveryNotes((deliveryNotes || []).filter((x) => x.id !== dn.id));
    notify(`${dn.noSJ} dibatalkan & stok dikembalikan ke gudang`);
  }

  return (
    <div>
      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 mb-3 no-print">
        {(() => {
          const held = (sos || []).filter((so) => reviewState(so) === "pending" || reviewState(so) === "rejected").length;
          return held > 0 ? <span className="text-xs" style={{ color: colorConfig?.warn }}>{held} SO belum bisa dikirim (menunggu / ditolak APJ-PJT)</span> : null;
        })()}
        <Button onClick={openNew} disabled={eligibleSOs.length === 0} className="justify-center whitespace-nowrap" colorConfig={colorConfig}><Plus size={15} /> Buat Surat Jalan</Button>
      </div>
      
      <ResponsiveTable minWidth={700} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. SJ", "SO", "Pelanggan", "Tanggal", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {newestFirst(deliveryNotes).map((dn) => {
            const so = (sos || []).find((x) => x.id === dn.soId);
            const canEditOrCancel = !(invoices || []).some((inv) => invoiceHasSO(inv, dn.soId));
            return (
              <tr key={dn.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{dn.noSJ}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{so?.soNumber || "-"}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{so ? findName(customers, so.customerId) : "-"}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(dn.date)}</td>
                <td className="px-4 py-2.5"><Badge tone={dn.status === "diterima" ? "good" : "warn"} colorConfig={colorConfig}>{dn.status === "diterima" ? "Diterima" : "Dikirim"}</Badge></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPrintInvDN(dn)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak SJ</button>
                    <button onClick={() => setPrintTT(dn)} className="text-xs flex items-center gap-1 font-semibold text-emerald-800 cursor-pointer"><FileText size={13} /> Tanda Terima</button>
                    <button onClick={() => setDetailDN(dn)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    {dn.status === "dikirim" && <button onClick={() => openReceive(dn)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.good }}>Konfirmasi Terima</button>}
                    {canEditOrCancel && (
                      <>
                        <button onClick={() => openEdit(dn)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                        <button onClick={() => cancelSJ(dn)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan SJ</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </ResponsiveTable>

      {modal === "new" || modal === "edit" ? (
        <Modal title={editingId ? `Edit Surat Jalan — ${noSJ}` : "Buat Surat Jalan"} onClose={() => { setModal(null); setEditingId(null); }} wide colorConfig={colorConfig}>
          {eligibleSOs.length === 0 && !editingId ? (
            <div className="text-sm" style={{ color: colorConfig?.inkSoft }}>Tidak ada SO yang masih punya sisa barang untuk dikirim.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Nomor Surat Jalan" colorConfig={colorConfig}><TextInput value={noSJ} onChange={(e) => setNoSJ(e.target.value)} placeholder="Contoh: 500/SJ/WPM/X/26" className="tabular-nums" colorConfig={colorConfig} /></Field>
                <Field label="Sales Order" colorConfig={colorConfig}>
                  <SearchableSelect value={soId} onChange={changeSO} disabled={!!editingId} colorConfig={colorConfig} placeholder="-- Pilih Sales Order --"
                    options={eligibleSOs.map((so) => ({ value: so.id, label: `${so.soNumber} · ${findName(customers, so.customerId)}`, sublabel: so.date ? fmtDate(so.date) : "" }))} />
                </Field>
                <Field label="Tanggal Kirim" colorConfig={colorConfig}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} /></Field>
              </div>
              {selectedSO && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-medium" style={{ color: colorConfig?.inkSoft }}>Jumlah yang dikirim sekarang</div>
                  {(selectedSO.items || []).map((it) => {
                    const p = (products || []).find((x) => x.id === it.productId);
                    const oldQty = editingId ? ((deliveryNotes.find(x=>x.id===editingId)?.items.find(x=>x.productId===it.productId)?.qty)||0) : 0;
                    const remaining = Math.max(0, it.qty - shippedQty(selectedSO.id, it.productId) + oldQty);
                    if (remaining <= 0 && !editingId) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2">
                        <div className="flex-1 text-sm" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs tabular-nums" style={{ color: colorConfig?.inkSoft }}>(sisa {remaining} {p?.unit})</span></div>
                        <TextInput type="number" value={shipQty[it.productId] ?? remaining} onChange={(e) => { const val = e.target.value; setShipQty({ ...shipQty, [it.productId]: val === "" ? "" : Number(val) }); }} className="w-24" colorConfig={colorConfig} />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitSJ} className="w-full justify-center mt-4" colorConfig={colorConfig}>{editingId ? "Simpan Perubahan Surat Jalan" : "Buat Surat Jalan & Potong Stok"}</Button>
            </>
          )}
        </Modal>
      ) : null}

      {modal?.receive && (
        <Modal title={`Konfirmasi Terima — ${modal.receive.noSJ}`} onClose={() => setModal(null)} wide colorConfig={colorConfig}>
          <p className="text-xs mb-3" style={{ color: colorConfig?.inkSoft }}>Isi jumlah yang benar-benar diterima customer. Kalau kurang dari yang dikirim, sisanya otomatis tercatat sebagai retur & stok dikembalikan.</p>
          {(modal.receive.items || []).map((it, i) => {
            const p = (products || []).find((x) => x.id === it.productId);
            return (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="flex-1 text-sm" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs tabular-nums" style={{ color: colorConfig?.inkSoft }}>(dikirim {it.qty} {p?.unit})</span></div>
                <TextInput type="number" value={receiveForm[i] ?? it.qty} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: Number(e.target.value) })} className="w-24" colorConfig={colorConfig} />
              </div>
            );
          })}
          <Button onClick={() => submitReceive(modal.receive)} className="w-full justify-center mt-2" colorConfig={colorConfig}>Konfirmasi</Button>
        </Modal>
      )}

      {detailDN && (
        <Modal title={`Detail ${detailDN.noSJ}`} onClose={() => setDetailDN(null)} wide colorConfig={colorConfig}>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty Dikirim", "Qty Diterima", "Batch"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailDN.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{it.receivedQty ?? "-"}</td>
                    <td className="px-3 py-2 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{(it.allocations || []).map((a) => a.batchNo).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}

      {/* POP-UP CETAK SURAT JALAN */}
      {printDN && (
        <Modal title={`Cetak Surat Jalan — ${printDN.noSJ}`} onClose={() => setPrintInvDN(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">

            <Button onClick={() => choosePaperAndPrint("printable-sj", `Surat Jalan - ${printDN.noSJ}`)} variant="primary" colorConfig={colorConfig}>
              <Printer size={15} /> Cetak Surat Jalan / PDF
            </Button>
          </div>
          <div id="printable-sj" className="p-6 bg-white border rounded-xl text-xs text-gray-800">
            <div className="flex items-start justify-between border-b-2 pb-4 mb-4" style={{ borderColor: colorConfig?.primary }}>
              <div className="flex items-start gap-3">
                {COMPANY_PROFILE?.logoUrl && <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-12 object-contain" />}
                <div>
                  <div className="text-base uppercase tracking-wide font-bold" style={{ color: colorConfig?.primary }}>{COMPANY_PROFILE?.name}</div>
                  <p className="text-[11px] text-gray-600">{COMPANY_PROFILE?.tagline}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{COMPANY_PROFILE?.address}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg uppercase tracking-wider text-gray-700 font-bold">SURAT JALAN</div>
                <div className="tabular-nums text-sm mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printDN.noSJ}</div>
              </div>
            </div>

            {(() => {
              const so = (sos || []).find((s) => s.id === printDN.soId);
              const cust = (customers || []).find((c) => c.id === so?.customerId);
              return (
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Tujuan Pengiriman:</div>
                      <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                      <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                      <div className="text-[11px] text-gray-600">{cust?.contact || "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Informasi Dokumen</div>
                      <div><span className="text-gray-500">Tanggal Kirim:</span> <span className="tabular-nums">{fmtDate(printDN.date)}</span></div>
                      <div><span className="text-gray-500">No. Sales Order:</span> <span className="tabular-nums">{so?.soNumber || "-"}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-xs border-collapse mb-8">
                    <thead>
                      <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                        <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty Kirim</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No. Batch</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Exp. Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printDN.items || []).map((it, idx) => {
                        const p = (products || []).find((x) => x.id === it.productId);
                        // Batch & ED dari alokasi FEFO; ED diambil dari data batch kalau alokasi lama belum menyimpannya.
                        const allocs = (it.allocations || []).map((a) => {
                          const b = (batches || []).find((x) => x.id === a.batchId);
                          return { batchNo: a.batchNo || b?.batchNo || "-", ed: a.expiryDate || b?.expiryDate || "", qty: a.qty };
                        });
                        const multi = allocs.length > 1;
                        return (
                          <tr key={idx} className="border-b">
                            <td className="py-2.5 px-2 tabular-nums text-gray-500">{idx + 1}</td>
                            <td className="py-2.5 px-2 text-gray-900 font-bold">{p?.name || "-"}</td>
                            <td className="py-2.5 px-2 text-center tabular-nums font-bold">{it.qty} {p?.unit || "unit"}</td>
                            <td className="py-2.5 px-2 tabular-nums text-gray-700">
                              {allocs.length === 0 ? "-" : allocs.map((a, k) => (
                                <div key={k}>{a.batchNo}{multi ? ` (${a.qty} ${p?.unit || "unit"})` : ""}</div>
                              ))}
                            </td>
                            <td className="py-2.5 px-2 tabular-nums text-gray-700">
                              {allocs.length === 0 ? "-" : allocs.map((a, k) => (
                                <div key={k}>{a.ed ? fmtDate(a.ed) : "-"}</div>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <QASignatureBlock doc={so} title="Mengetahui,"
                    requiredFallback={requiredClasses(printDN.items || so?.items || [], products)}
                    leftCols={[
                      { label: "Disiapkan Oleh (Gudang),", name: "Petugas Gudang" },
                      { label: "Dikirim Oleh (Sales/Driver),", name: "Pengirim" },
                      { label: "Diterima Oleh (Pelanggan),", name: "" },
                    ]} />
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* POP-UP CETAK TANDA TERIMA */}
      {printTT && (
        <Modal title={`Tanda Terima Dokumen — ${printTT.noSJ}`} onClose={() => setPrintTT(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">

            <Button onClick={() => choosePaperAndPrint("printable-tt", `Tanda Terima - ${printTT.noSJ}`)} variant="primary" colorConfig={colorConfig}>
              <Printer size={15} /> Cetak Tanda Terima / PDF
            </Button>
          </div>
          <div id="printable-tt" className="p-6 bg-white border rounded-xl text-xs text-gray-800">
            <div className="flex items-start justify-between border-b-2 pb-4 mb-4" style={{ borderColor: colorConfig?.primary }}>
              <div className="flex items-start gap-3">
                {COMPANY_PROFILE?.logoUrl && <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-12 object-contain" />}
                <div>
                  <div className="text-base uppercase tracking-wide font-bold" style={{ color: colorConfig?.primary }}>{COMPANY_PROFILE?.name}</div>
                  <p className="text-[11px] text-gray-600">{COMPANY_PROFILE?.tagline}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-base uppercase tracking-wider text-gray-700 font-bold">TANDA TERIMA FAKTUR & DOKUMEN</div>
                <div className="tabular-nums text-xs mt-1 font-bold text-gray-500">Ref: {printTT.noSJ}</div>
              </div>
            </div>

            {(() => {
              const so = (sos || []).find((s) => s.id === printTT.soId);
              const cust = (customers || []).find((c) => c.id === so?.customerId);
              const inv = (invoices || []).find((i) => invoiceHasSO(i, printTT.soId));
              let totalAmount = inv ? invoiceTotal(inv) : so ? soTotal(so) : 0;

              return (
                <div>
                  <p className="mb-4">Telah diserahkan dokumen tagihan/faktur penjualan dengan rincian sebagai berikut:</p>
                  <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Kepada Yth. (Pelanggan)</div>
                      <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                      <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                    </div>
                    <div className="text-right">
                      <div><span className="text-gray-500">Tanggal Penyerahan:</span> <span className="tabular-nums">{fmtDate(todayISO())}</span></div>
                      <div><span className="text-gray-500">No. Faktur:</span> <span className="tabular-nums font-bold text-emerald-800">{inv?.noFaktur || "Sesuai SO"}</span></div>
                      <div><span className="text-gray-500">No. Surat Jalan:</span> <span className="tabular-nums">{printTT.noSJ}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-xs border-collapse mb-6">
                    <thead>
                      <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Jenis Dokumen yang Diserahkan</th>
                        <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Jumlah Legalisir/Set</th>
                        <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Nilai Tagihan</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2.5 px-2 tabular-nums">1</td>
                        <td className="py-2.5 px-2 font-bold">Faktur Penjualan Asli / Invoice Tagihan</td>
                        <td className="py-2.5 px-2 text-center tabular-nums">1 Lembar Asli + Rangkap</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold">{fmtIDR(totalAmount)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 px-2 tabular-nums">2</td>
                        <td className="py-2.5 px-2 font-bold">Surat Jalan / Bukti Penerimaan Barang Diterima</td>
                        <td className="py-2.5 px-2 text-center tabular-nums">1 Lembar</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-gray-400">-</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                    <div><p className="text-gray-500 mb-12">Yang Menyerahkan (PT WPM),</p><p className="underline text-gray-900 font-bold">( Kurir / Admin Finance )</p></div>
                    <div><p className="text-gray-500 mb-12">Diterima Oleh (Finance/AP Pelanggan),</p><p className="text-gray-900 font-bold whitespace-pre">(                                        )</p></div>
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

// --- SUB-KOMPONEN FAKTUR TAB ---
function FakturTab({ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, batches, saveBatches, saveInvoices, saveCustomers, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoiceDPAmount, invoicePaidAmount, invoiceReturnedAmount, stockByProduct, allocateFEFO, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }) {
  const [detailInv, setDetailInv] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isEditingFromSO, setIsEditingFromSO] = useState(false);
  const [printInv, setPrintInv] = useState(null);
  const [modalDirect, setModalDirect] = useState(false);
  const [noFakturDirect, setNoFakturDirect] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountTypeHeader, setDiscountTypeHeader] = useState("percent");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [deductions, setDeductions] = useState([]);
  const [ongkir, setOngkir] = useState(0);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickCust, setModalQuickCust] = useState(false);
  const [quickCustForm, setQuickCustForm] = useState({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" });

  const [invStatusFilter, setInvStatusFilter] = useState("ALL");
  const [invSortBy, setInvSortBy] = useState("created_desc");
  // SO yang dicentang buat digabung jadi 1 faktur
  const [pickSO, setPickSO] = useState(() => new Set());
  // Pecah 1 SO jadi beberapa faktur
  const [splitSO, setSplitSO] = useState(null);      // SO yang lagi dipecah
  const [splitRows, setSplitRows] = useState([]);    // sisa item SO
  const [splitQty, setSplitQty] = useState([]);      // qty yang masuk faktur ini
  const [splitNo, setSplitNo] = useState("");
  const [splitNoTouched, setSplitNoTouched] = useState(false);
  const [splitOngkir, setSplitOngkir] = useState("");
  const [invSearch, setInvSearch] = useState("");
  // Filter bulan: "paid" = bulan faktur itu LUNAS (tanggal bayar terakhir), "date" = bulan tanggal faktur
  const [invMonth, setInvMonth] = useState("");
  // Faktur yang riwayat pembayarannya lagi dibuka
  const [openHist, setOpenHist] = useState(() => new Set());
  const toggleHist = (id) => setOpenHist((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  function invoiceHistory(inv) {
    const soIds = invoiceSoIds(inv);
    const soNo = (id) => (sos || []).find((x) => x.id === id)?.soNumber || "SO";
    const rows = [];
    (paymentsIn || []).forEach((p) => {
      if (p.invoiceId === inv.id) rows.push({ date: p.date, kind: "bayar", label: p.type || "Pelunasan", sub: [p.method, p.note].filter(Boolean).join(" · "), amount: Number(p.amount) || 0 });
      else if (p.soId && soIds.includes(p.soId)) rows.push({ date: p.date, kind: "dp", label: `DP ${soNo(p.soId)}`, sub: [p.method, p.note].filter(Boolean).join(" · "), amount: Number(p.amount) || 0 });
    });
    (returns || []).filter((r) => r.invoiceId === inv.id).forEach((r) => {
      rows.push({ date: r.date, kind: "retur", label: `Retur ${r.noRetur || ""}`.trim(), sub: "mengurangi tagihan", amount: (r.items || []).reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0) });
    });
    const dpUsed = invoiceDPAmount ? invoiceDPAmount(inv) : 0;
    const dpPaid = rows.filter((r) => r.kind === "dp").reduce((s, r) => s + r.amount, 0);
    return {
      rows,
      deductions: [
        { label: "Retur", amount: invoiceReturnedAmount ? invoiceReturnedAmount(inv.id) : 0 },
        { label: dpPaid > dpUsed + 0.5 ? "DP (bagian yang dipakai faktur ini)" : "DP", amount: dpUsed },
        { label: "Dibayar", amount: invoicePaidAmount ? invoicePaidAmount(inv.id) : 0 },
      ],
    };
  }
  const [invMonthBy, setInvMonthBy] = useState("paid");
  const setMonthFilter = (v) => { setInvMonth(v); if (v && invMonthBy === "paid") setInvStatusFilter("LUNAS"); };

  const eligibleSOs = (sos || []).filter((so) => getSOStatus(so) === "ready_to_invoice");

  const processedInvoices = useMemo(() => {
    const rankInv = createdRank(invoices);
    return (invoices || [])
      .map((inv) => {
        const total = invoiceTotal ? invoiceTotal(inv) : 0;
        const paid = invoicePaidAmount ? invoicePaidAmount(inv.id) : 0;
        const ret = invoiceReturnedAmount ? invoiceReturnedAmount(inv.id) : 0;
        const dp = invoiceDPAmount ? invoiceDPAmount(inv) : (soDPAmount ? soDPAmount(invoiceSoIds(inv)) : 0);
        const sisa = Math.max(0, total - ret - dp - paid);
        const isLunas = sisa <= 0;
        // Tanggal lunas = tanggal pembayaran terakhir (pelunasan faktur atau DP SO-nya)
        let paidDate = "";
        if (isLunas) {
          const soIds = invoiceSoIds(inv);
          (paymentsIn || []).forEach((p) => {
            if ((p.invoiceId === inv.id || (p.soId && soIds.includes(p.soId))) && (p.date || "") > paidDate) paidDate = p.date || "";
          });
          if (!paidDate) paidDate = inv.date || ""; // lunas lewat retur saja
        }
        return { ...inv, sisa, total, isLunas, paidDate };
      })
      .filter((inv) => {
        const so = (sos || []).find((x) => x.id === inv.soId);
        const custName = (inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "")).toLowerCase();
        const matchSearch = inv.noFaktur.toLowerCase().includes(invSearch.toLowerCase()) || custName.includes(invSearch.toLowerCase());

        let matchStatus = true;
        if (invStatusFilter === "LUNAS") matchStatus = inv.isLunas;
        if (invStatusFilter === "BELUM_LUNAS") matchStatus = !inv.isLunas;

        let matchMonth = true;
        if (invMonth) {
          matchMonth = invMonthBy === "paid"
            ? inv.isLunas && String(inv.paidDate || "").slice(0, 7) === invMonth
            : String(inv.date || "").slice(0, 7) === invMonth;
        }

        return matchSearch && matchStatus && matchMonth;
      })
      .sort((a, b) => {
        if (invSortBy === "created_desc") return rankInv(b) - rankInv(a);
        if (invSortBy === "date_desc") return new Date(b.date) - new Date(a.date);
        if (invSortBy === "date_asc") return new Date(a.date) - new Date(b.date);
        if (invSortBy === "total_desc") return b.total - a.total;
        if (invSortBy === "total_asc") return a.total - b.total;
        return 0;
      });
  }, [invoices, invSearch, invStatusFilter, invSortBy, invMonth, invMonthBy, paymentsIn, customers, sos, invoiceTotal, invoicePaidAmount, invoiceReturnedAmount, soDPAmount, invoiceDPAmount, findName]);

  // Nomor faktur langsung ikut golongan item (OB / OK / AL)
  React.useEffect(() => {
    if (!modalDirect || editingId) return;
    const g = golonganOfItems(items, products);
    const want = docCode("INV", g.mixed ? null : g.code);
    setNoFakturDirect((cur) => (isAutoFormat(cur, "INV") && !String(cur).toUpperCase().includes(`/${want}/`))
      ? nextDocNumber((invoices || []).map((x) => x.noFaktur), want) : cur);
  }, [items, modalDirect, editingId]);

  function openDirectModal() {
    const nextNo = nextDocNumber((invoices || []).map((x) => x.noFaktur), "INV");

    setNoFakturDirect(nextNo);
    setCustomerId((customers || [])[0]?.id || ""); setDate(todayISO()); setTaxType("none"); setDiscountTypeHeader("percent"); setDiscountPercentHeader(0); setDeductions([]); setOngkir(0); setItems([]); setSearchProd(""); setEditingId(null); setIsEditingFromSO(false); setModalDirect(true);
  }

  function openEditInvoice(inv) {
    if (invoicePaidAmount(inv.id) > 0) return notify("Gagal Edit: Faktur ini sudah memiliki riwayat pembayaran pelunasan.", "danger");
    if ((returns || []).some((r) => r.invoiceId === inv.id)) return notify("Gagal Edit: Faktur ini memiliki transaksi retur. Batalkan retur terlebih dahulu.", "danger");

    const so = (sos || []).find((s) => s.id === inv.soId);
    setEditingId(inv.id); setIsEditingFromSO(!inv.isDirect); setNoFakturDirect(inv.noFaktur); setCustomerId(inv.isDirect ? inv.customerId : so?.customerId || ""); setDate(inv.date || todayISO()); setTaxType(inv.taxType || "none"); setDiscountTypeHeader(inv.discountType || "percent"); setDiscountPercentHeader(inv.discountPercent || inv.discount || 0); setDeductions(withRowIds(normalizeDeductions(inv))); setOngkir(inv.ongkir || 0); setItems((inv.items || []).map(it => ({ ...it, discountType: it.discountType || "percent", discountPercent: it.discountPercent || 0 }))); setSearchProd(""); setModalDirect(true);
  }

  function handleSelectCustomer(val) {
    if (val === "__ADD_NEW__") { setQuickCustForm({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" }); setModalQuickCust(true); }
    else setCustomerId(val);
  }

  async function submitQuickCustomer(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!quickCustForm.name.trim()) return notify("Nama pelanggan wajib diisi", "danger");
    const newId = uid();
    await saveCustomers([...(customers || []), { ...quickCustForm, id: newId }]);
    setCustomerId(newId); setModalQuickCust(false); notify(`Pelanggan "${quickCustForm.name}" berhasil ditambahkan & terpilih`);
  }

  function addProductToDirect(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    else setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice, discountType: "percent", discountPercent: 0 }]);
  }

  function updateDirectItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeDirectItem(i) { setItems(items.filter((_, idx) => idx !== i)); }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const submitDirectInvoice = (...args) => withAtomic(() => submitDirectInvoice__raw(...args));
  async function submitDirectInvoice__raw() {
    if (!noFakturDirect.trim()) return notify("Nomor Faktur Penjualan wajib diisi", "danger");
    if (isNumberTaken(invoices, "noFaktur", noFakturDirect, editingId)) return notify(`Nomor Faktur ${noFakturDirect.trim()} sudah dipakai faktur lain. Ganti nomornya dulu.`, "danger");
    if (!customerId) return notify("Pilih pelanggan terlebih dahulu", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
    {
      const blockMsg = obatKerasBlockMessage(items, products, (customers || []).find((c) => c.id === customerId));
      if (blockMsg) return notify(blockMsg, "danger");
    }
    {
      const gol = golonganOfItems(items, products);
      if (gol.mixed && editingId && !isEditingFromSO) return notify(mixedMessage(gol), "danger");
      if (!gol.mixed && numberGolMismatch(noFakturDirect, "INV", gol.code)) return notify(`Nomor ${noFakturDirect.trim()} nggak sesuai golongan item (${GOLONGAN_LABEL[gol.code]}). Ganti kodenya jadi INV-${gol.code}.`, "danger");
      // Konfirmasi pecah faktur SEBELUM stok dipotong
      if (gol.mixed && !editingId) {
        const parts = splitOrderByGolongan(items, products, cleanDeductions(deductions), Number(ongkir || 0));
        const nos = nextDocNumbersForGroups((invoices || []).map((x) => x.noFaktur), "INV", parts.map((x) => x.gol));
        const msg = `Faktur ini isinya ${parts.length} golongan, jadi bakal dipecah otomatis jadi ${parts.length} faktur:\n\n` +
          parts.map((x, i) => `• ${nos[i]} · ${GOLONGAN_LABEL[x.gol]} (${x.items.length} item)`).join("\n") +
          `\n\nPotongan persen berlaku di tiap faktur, potongan Rupiah & ongkir dibagi proporsional. Lanjut simpan?`;
        if (!confirm(msg)) return;
      }
    }

    const oldInvObj = (invoices || []).find(x => x.id === editingId);
    const isDirectDoc = oldInvObj ? oldInvObj.isDirect : !isEditingFromSO;
    let working = (batches || []).map((b) => ({ ...b }));

    if (editingId && isDirectDoc && oldInvObj) {
      (oldInvObj.items || []).forEach(it => { (it.allocations || []).forEach(alloc => { const b = working.find(x => x.id === alloc.batchId); if (b) b.qty += alloc.qty; }); });
    }

    const shortages = []; const itemsWithAlloc = [];
    if (isDirectDoc) {
      for (const it of items) {
        const avail = working.filter((b) => b.productId === it.productId && b.qty > 0 && !b.quarantine && b.expiryDate >= todayISO()).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        let remaining = it.qty; const allocations = [];
        for (const b of avail) {
          if (remaining <= 0) break;
          const take = Math.min(b.qty, remaining);
          allocations.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take });
          b.qty -= take; remaining -= take;
        }
        if (remaining > 0) { const p = (products || []).find((x) => x.id === it.productId); shortages.push(`${p?.name || "Obat"}: kurang ${remaining} ${p?.unit || "unit"}`); }
        itemsWithAlloc.push({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice, discountType: it.discountType || "percent", discountPercent: Number(it.discountPercent || 0), allocations });
      }
      if (shortages.length > 0) return notify("Stok tidak cukup — " + shortages.join(", "), "danger");
      await saveBatches(working);
    } else {
      items.forEach(it => { itemsWithAlloc.push({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice, discountType: it.discountType || "percent", discountPercent: Number(it.discountPercent || 0), ...(it.soId ? { soId: it.soId } : {}) }); });
    }

    const payload = { 
      noFaktur: noFakturDirect.trim(), 
      customerId, 
      date, 
      taxType, 
      ...legacyDiscountFields(cleanDeductions(deductions), directRawSubtotal),
      deductions: cleanDeductions(deductions),
      ongkir: Number(ongkir || 0),
      items: itemsWithAlloc 
    };

    if (editingId) {
      let qaPatch = {};
      if (isDirectDoc && (!oldInvObj || itemsChanged(oldInvObj.items, items))) qaPatch = { qaReview: newReview(items, products) };
      await saveInvoices((invoices || []).map(inv => inv.id === editingId ? { ...inv, ...payload, ...qaPatch } : inv));
      notify(`${noFakturDirect.trim()} berhasil diperbarui${qaPatch.qaReview ? " · menunggu review APJ/PJT ulang" : ""}`);
    } else if (golonganOfItems(items, products).mixed) {
      // Faktur campur golongan -> otomatis dipecah jadi 1 faktur per golongan (alokasi batch ikut item masing-masing)
      const parts = splitOrderByGolongan(itemsWithAlloc, products, cleanDeductions(deductions), Number(ongkir || 0));
      const nos = nextDocNumbersForGroups((invoices || []).map((x) => x.noFaktur), "INV", parts.map((x) => x.gol));
      const newInvs = parts.map((x, i) => ({
        id: uid(), ...payload, noFaktur: nos[i], items: x.items, ongkir: x.ongkir,
        ...legacyDiscountFields(x.deductions, itemsSubtotal(x.items)), deductions: x.deductions,
        splitGroup: nos.join(" + "), soId: null, isDirect: true, qaReview: newReview(x.items, products),
      }));
      await saveInvoices([...(invoices || []), ...newInvs]);
      notify(`Faktur dipecah jadi ${nos.length}: ${nos.join(", ")} · stok FEFO terpotong · menunggu review APJ/PJT`);
    } else {
      await saveInvoices([...(invoices || []), { id: uid(), ...payload, soId: null, isDirect: true, qaReview: newReview(items, products) }]);
      notify(`${noFakturDirect.trim()} dibuat & stok FEFO terpotong · menunggu review APJ/PJT sebelum bisa dicetak`);
    }
    setModalDirect(false); setEditingId(null); setIsEditingFromSO(false);
  }

  // Batas nilai per faktur dari data pelanggan (0 = nggak ada batas)
  const custLimit = (customerId) => Number((customers || []).find((c) => c.id === customerId)?.maxInvoiceAmount) || 0;

  // Potongan untuk faktur pecahan: potongan % tetap; potongan Rp dibagi sesuai porsi nilai,
  // faktur terakhir (yang menghabiskan sisa SO) ambil sisa potongan biar totalnya pas.
  function partialDeductions(so, invItems) {
    const fullRaw = itemsSubtotal(remainingSOItems(so, deliveryNotes, [])) || 0;
    const share = fullRaw > 0 ? itemsSubtotal(invItems) / fullRaw : 1;
    const after = remainingSOItems(so, deliveryNotes, [...(invoices || []), { id: "__baru__", soId: so.id, items: invItems }]);
    const isFinal = after.length === 0;
    const prior = (invoices || []).filter((i) => invoiceHasSO(i, so.id));
    return normalizeDeductions(so).map((d) => {
      if (d.mode !== "amount") return { ...d };
      const total = Number(d.value) || 0;
      if (!isFinal) return { ...d, value: Math.round(total * share) };
      const used = prior.reduce((sum, i) => sum + normalizeDeductions(i)
        .filter((x) => x.mode === "amount" && x.kind === d.kind && (x.note || "") === (d.note || ""))
        .reduce((t, x) => t + (Number(x.value) || 0), 0), 0);
      return { ...d, value: Math.max(0, Math.round((total - used) * 100) / 100) };
    });
  }

  // Cek batas nilai faktur pelanggan. true = lanjut simpan.
  function okWithLimit(customerId, total) {
    const limit = custLimit(customerId);
    if (!limit || total <= limit) return true;
    return confirm(`Total faktur ${fmtIDR(total)} melebihi batas pelanggan ini (${fmtIDR(limit)} per faktur).\n\nTetap buat 1 faktur?\n(Pilih Batal kalau mau dipecah pakai tombol "Pecah Faktur")`);
  }

  async function createInvoice(so) {
    const split = soIsSplit(invoices, so.id);
    // SO yang sudah dipecah: faktur ini = sisa barang yang belum difakturkan
    const invItems = remainingSOItems(so, deliveryNotes, split ? invoices : []);
    if (invItems.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");
    const deductions = split ? partialDeductions(so, invItems) : (Array.isArray(so.deductions) ? so.deductions : null);

    const gSO = golonganOfItems(invItems, products);
    const nextNo = nextDocNumber((invoices || []).map((x) => x.noFaktur), docCode("INV", gSO.mixed ? golonganCodeString(gSO) : gSO.code));

    const inputFaktur = prompt(`Masukkan Nomor Faktur Penjualan / Pajak${split ? " (sisa SO " + so.soNumber + ")" : ""}:`, nextNo);
    if (!inputFaktur) return;
    if (isNumberTaken(invoices, "noFaktur", inputFaktur)) return notify(`Nomor Faktur ${inputFaktur.trim()} sudah dipakai faktur lain. Faktur nggak dibuat, coba lagi dengan nomor lain.`, "danger");

    const inputOngkir = prompt("Biaya ongkir tambahan ke customer (Rp, kosongkan/0 jika tidak ada):", "0");
    const ongkirVal = Number(inputOngkir) || 0;

    const doc = {
      id: uid(), noFaktur: inputFaktur.trim(), soId: so.id, customerId: so.customerId, date: todayISO(), taxType: so.taxType || "none",
      ...(deductions
        ? { ...legacyDiscountFields(deductions, itemsSubtotal(invItems)), deductions }
        : { discountType: so.discountType || "percent", discountPercent: Number(so.discountPercent || 0) }),
      ongkir: ongkirVal, items: invItems,
      ...(split ? { splitFromSO: true } : {}),
    };
    if (!okWithLimit(so.customerId, computeBill(doc).total)) return;
    await saveInvoices([...(invoices || []), doc]);
    notify(`${inputFaktur.trim()} dibuat`);
  }

  // Item faktur dari 1 SO: qty = barang yang sudah diterima di Surat Jalan
  function soInvoiceItems(so) {
    const received = {};
    (deliveryNotes || []).filter((dn) => dn.soId === so.id && dn.status === "diterima")
      .forEach((dn) => (dn.items || []).forEach((it) => {
        received[it.productId] = (received[it.productId] || 0) + (it.receivedQty ?? it.qty);
      }));
    return (so.items || [])
      .map((it) => ({ productId: it.productId, qty: received[it.productId] || 0, unitPrice: it.unitPrice, discountType: it.discountType || "percent", discountPercent: Number(it.discountPercent || 0), soId: so.id }))
      .filter((it) => it.qty > 0);
  }

  // GABUNG BEBERAPA SO JADI 1 FAKTUR (pelanggan & PPN harus sama)
  async function createCombinedInvoice() {
    const list = eligibleSOs.filter((so) => pickSO.has(so.id));
    if (list.length < 2) return notify("Pilih minimal 2 SO untuk digabung", "danger");
    if (new Set(list.map((so) => so.customerId)).size > 1) return notify("SO yang digabung harus dari pelanggan yang sama", "danger");
    if (new Set(list.map((so) => so.taxType || "none")).size > 1) return notify("SO yang digabung harus punya jenis PPN yang sama", "danger");
    // SO yang sudah sebagian difaktur (dipecah) ikut digabung, tapi yang masuk cuma SISA barangnya.
    // Potongan Rp-nya juga cuma sisa yang belum dipakai faktur sebelumnya.
    const perSO = list.map((so) => {
      const split = soIsSplit(invoices, so.id);
      const items = split ? remainingSOItems(so, deliveryNotes, invoices) : soInvoiceItems(so);
      return { so, split, items, deductions: split ? partialDeductions(so, items) : normalizeDeductions(so) };
    });
    const empty = perSO.filter((x) => x.items.length === 0);
    if (empty.length) return notify(`SO ${empty.map((x) => x.so.soNumber).join(", ")} nggak punya sisa barang buat difakturkan`, "danger");
    const anySplit = perSO.some((x) => x.split);
    const merged = mergeDeductions(perSO.map((x) => ({ deductions: x.deductions })));
    if (!merged.ok) return notify("Potongan persen (diskon/fee %) di SO-SO ini beda, jadi nggak bisa digabung otomatis. Samakan dulu potongannya atau buat faktur terpisah.", "danger");

    const invItems = perSO.flatMap((x) => x.items);
    if (invItems.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");

    const g = golonganOfItems(invItems, products);
    const gol = g.mixed ? golonganCodeString(g) : g.code;
    const nextNo = nextDocNumber((invoices || []).map((x) => x.noFaktur), docCode("INV", gol));
    const soNos = list.map((so) => so.soNumber).join(", ");

    const inputFaktur = prompt(`Gabung ${list.length} SO jadi 1 faktur:\n${soNos}${anySplit ? "\n(SO yang sudah sebagian difaktur: yang masuk cuma sisanya)" : ""}\n\nNomor Faktur Penjualan / Pajak:`, nextNo);
    if (!inputFaktur) return;
    if (isNumberTaken(invoices, "noFaktur", inputFaktur)) return notify(`Nomor Faktur ${inputFaktur.trim()} sudah dipakai faktur lain. Faktur nggak dibuat, coba lagi dengan nomor lain.`, "danger");
    const inputOngkir = prompt("Biaya ongkir tambahan ke customer (Rp, kosongkan/0 jika tidak ada):", "0");
    const ongkirVal = Number(inputOngkir) || 0;

    const first = list[0];
    const doc = {
      id: uid(), noFaktur: inputFaktur.trim(),
      soId: first.id, soIds: list.map((so) => so.id),
      customerId: first.customerId, date: todayISO(), taxType: first.taxType || "none",
      ...legacyDiscountFields(merged.deductions, itemsSubtotal(invItems)), deductions: merged.deductions,
      ongkir: ongkirVal, items: invItems,
      ...(anySplit ? { splitFromSO: true } : {}),
    };
    if (!okWithLimit(first.customerId, computeBill(doc).total)) return;
    await saveInvoices([...(invoices || []), doc]);
    setPickSO(new Set());
    notify(`${inputFaktur.trim()} dibuat dari ${list.length} SO (${soNos})`);
  }

  function openSplit(so) {
    const rows = remainingSOItems(so, deliveryNotes, soIsSplit(invoices, so.id) ? invoices : []);
    if (rows.length === 0) return notify("Tidak ada sisa barang yang bisa difakturkan", "danger");
    setSplitSO(so); setSplitRows(rows); setSplitQty(rows.map((r) => r.qty));
    setSplitNo(""); setSplitNoTouched(false); setSplitOngkir("");
  }

  const splitChosen = splitRows.map((r, i) => ({ ...r, qty: Math.max(0, Math.min(r.qty, Number(splitQty[i]) || 0)) })).filter((r) => r.qty > 0);
  const splitDoc = splitSO ? {
    items: splitChosen, taxType: splitSO.taxType || "none",
    deductions: splitChosen.length ? partialDeductions(splitSO, splitChosen) : [],
    ongkir: Number(splitOngkir) || 0,
  } : null;
  const splitTotal = splitDoc ? computeBill(splitDoc).total : 0;
  const splitLimit = splitSO ? custLimit(splitSO.customerId) : 0;
  const splitSuggestNo = (() => {
    if (!splitSO || splitChosen.length === 0) return "";
    const g = golonganOfItems(splitChosen, products);
    return nextDocNumber((invoices || []).map((x) => x.noFaktur), docCode("INV", g.mixed ? golonganCodeString(g) : g.code));
  })();
  const splitNoShown = splitNoTouched ? splitNo : splitSuggestNo;

  // Isi qty otomatis dari atas sampai total faktur nyentuh batas pelanggan
  function fillToLimit() {
    if (!splitLimit || !splitSO) return;
    const q = splitRows.map(() => 0);
    const totalWith = (arr) => {
      const items = splitRows.map((r, i) => ({ ...r, qty: arr[i] })).filter((r) => r.qty > 0);
      if (!items.length) return 0;
      return computeBill({ items, taxType: splitSO.taxType || "none", deductions: partialDeductions(splitSO, items), ongkir: Number(splitOngkir) || 0 }).total;
    };
    for (let i = 0; i < splitRows.length; i++) {
      let lo = 0, hi = splitRows[i].qty;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const t = [...q]; t[i] = mid;
        if (totalWith(t) <= splitLimit) lo = mid; else hi = mid - 1;
      }
      q[i] = lo;
      if (lo < splitRows[i].qty) break;
    }
    setSplitQty(q);
  }

  async function saveSplitInvoice() {
    const so = splitSO;
    if (!so) return;
    if (splitChosen.length === 0) return notify("Isi qty minimal 1 item untuk faktur ini", "danger");
    const no = (splitNoShown || "").trim();
    if (!no) return notify("Nomor faktur wajib diisi", "danger");
    if (isNumberTaken(invoices, "noFaktur", no)) return notify(`Nomor Faktur ${no} sudah dipakai faktur lain`, "danger");
    if (splitLimit && splitTotal > splitLimit && !confirm(`Total faktur ini ${fmtIDR(splitTotal)} masih di atas batas pelanggan (${fmtIDR(splitLimit)}). Tetap simpan?`)) return;
    const deductions = partialDeductions(so, splitChosen);
    const doc = {
      id: uid(), noFaktur: no, soId: so.id, customerId: so.customerId, date: todayISO(), taxType: so.taxType || "none",
      ...legacyDiscountFields(deductions, itemsSubtotal(splitChosen)), deductions,
      ongkir: Number(splitOngkir) || 0, items: splitChosen, splitFromSO: true,
    };
    await saveInvoices([...(invoices || []), doc]);
    const left = remainingSOItems(so, deliveryNotes, [...(invoices || []), doc]);
    notify(left.length ? `${no} dibuat · sisa ${left.length} item SO ${so.soNumber} bisa difakturkan lagi` : `${no} dibuat · semua barang SO ${so.soNumber} sudah difakturkan`);
    if (left.length) {
      // langsung lanjut ke faktur berikutnya untuk sisanya
      setSplitRows(left); setSplitQty(left.map((r) => r.qty)); setSplitNo(""); setSplitNoTouched(false); setSplitOngkir("");
    } else {
      setSplitSO(null);
    }
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const cancelInvoice = (...args) => withAtomic(() => cancelInvoice__raw(...args));
  async function cancelInvoice__raw(inv) {
    if (invoicePaidAmount(inv.id) > 0) return notify("Gagal membatalkan: Faktur ini sudah memiliki riwayat pembayaran pelunasan.", "danger");
    if ((returns || []).some((r) => r.invoiceId === inv.id)) return notify("Gagal membatalkan: Faktur ini memiliki transaksi retur. Batalkan retur terlebih dahulu.", "danger");

    if (inv.isDirect) {
      let working = (batches || []).map((b) => ({ ...b }));
      (inv.items || []).forEach((it) => { (it.allocations || []).forEach((alloc) => { const b = working.find((x) => x.id === alloc.batchId); if (b) b.qty += alloc.qty; }); });
      await saveBatches(working);
    }
    await saveInvoices((invoices || []).filter((x) => x.id !== inv.id));
    notify(`${inv.noFaktur} berhasil dibatalkan`);
  }

  const filteredProds = (products || []).filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));
  
  const directRawSubtotal = items.reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
    return s + Math.max(0, gross - discAmt);
  }, 0);

  const directEffHeaderPct = discountTypeHeader === "amount" 
    ? (directRawSubtotal > 0 ? (Math.min(directRawSubtotal, Number(discountPercentHeader || 0)) / directRawSubtotal) * 100 : 0)
    : Number(discountPercentHeader || 0);

  const directTax = calcTax(directRawSubtotal, taxType, directEffHeaderPct);
  const dirBill = computeBill({ items, taxType, deductions, ongkir });

  return (
    <div>
      <div className="flex justify-end mb-4 no-print">
        <Button onClick={openDirectModal} colorConfig={colorConfig}><Plus size={15} /> Buat Faktur Penjualan Langsung</Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto flex-1 max-w-4xl">
          <TextInput
            placeholder="Cari No. Faktur / Pelanggan..."
            value={invSearch}
            onChange={(e) => setInvSearch(e.target.value)}
            colorConfig={colorConfig}
          />
          <Select value={invStatusFilter} onChange={(e) => setInvStatusFilter(e.target.value)} colorConfig={colorConfig}>
            <option value="ALL">Semua Status</option>
            <option value="BELUM_LUNAS">Belum Lunas (Piutang)</option>
            <option value="LUNAS">Sudah Lunas</option>
          </Select>
          <TextInput type="month" value={invMonth} onChange={(e) => setMonthFilter(e.target.value)} colorConfig={colorConfig} title="Filter bulan (kosongkan = semua)" />
          <Select value={invMonthBy} onChange={(e) => setInvMonthBy(e.target.value)} colorConfig={colorConfig}>
            <option value="paid">Bulan dilunasi</option>
            <option value="date">Bulan faktur</option>
          </Select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-gray-500 whitespace-nowrap">Urutkan:</span>
          <Select value={invSortBy} onChange={(e) => setInvSortBy(e.target.value)} colorConfig={colorConfig}>
            <option value="created_desc">Terakhir Dibuat</option>
            <option value="date_desc">Tanggal Terbaru</option>
            <option value="date_asc">Tanggal Terlama</option>
            <option value="total_desc">Nominal Terbesar</option>
            <option value="total_asc">Nominal Terkecil</option>
          </Select>
        </div>
      </div>

      {eligibleSOs.length > 0 && (
        <Card className="mb-4 no-print" colorConfig={colorConfig}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-xs font-medium" style={{ color: colorConfig?.inkSoft }}>SO siap difaktur (barang sudah diterima penuh) · centang beberapa SO pelanggan yang sama buat digabung jadi 1 faktur, termasuk sisa SO yang sudah dipecah</div>
            {pickSO.size >= 2 && (
              <Button onClick={createCombinedInvoice} colorConfig={colorConfig}><FileText size={13} /> Gabung {pickSO.size} SO jadi 1 Faktur</Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {newestFirst(eligibleSOs).map((so) => {
              const pickedCust = eligibleSOs.find((x) => pickSO.has(x.id))?.customerId;
              const lockOut = pickSO.size > 0 && !pickSO.has(so.id) && pickedCust && pickedCust !== so.customerId;
              return (
                <div key={so.id} className="flex items-center justify-between gap-2 text-sm py-1" style={{ borderBottom: `1px solid ${colorConfig?.border}`, opacity: lockOut ? 0.45 : 1 }}>
                  <label className="flex items-center gap-2 cursor-pointer" title={lockOut ? "Beda pelanggan, nggak bisa digabung" : "Centang buat digabung"}>
                    <input type="checkbox" disabled={lockOut} checked={pickSO.has(so.id)}
                      onChange={() => setPickSO((prev) => { const n = new Set(prev); n.has(so.id) ? n.delete(so.id) : n.add(so.id); return n; })} />
                    <span style={{ color: colorConfig?.ink }}>{so.soNumber} · {findName(customers, so.customerId)}</span>
                    {soIsSplit(invoices, so.id) && <Badge tone="warn" colorConfig={colorConfig}>sebagian difaktur · sisa {remainingSOItems(so, deliveryNotes, invoices).length} item</Badge>}
                    {custLimit(so.customerId) > 0 && <span className="text-[10px]" style={{ color: colorConfig?.inkSoft }}>maks {fmtIDR(custLimit(so.customerId))}/faktur</span>}
                  </label>
                  <div className="flex gap-1">
                    <Button onClick={() => openSplit(so)} variant="ghost" colorConfig={colorConfig}>Pecah Faktur</Button>
                    <Button onClick={() => createInvoice(so)} variant="ghost" colorConfig={colorConfig}><FileText size={13} /> {soIsSplit(invoices, so.id) ? "Fakturkan Sisa" : "Buat Faktur"}</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {splitSO && (
        <Modal title={`Pecah Faktur — ${splitSO.soNumber}`} onClose={() => setSplitSO(null)} wide colorConfig={colorConfig}>
          <p className="text-xs mb-3" style={{ color: colorConfig?.inkSoft }}>
            Isi qty yang masuk ke faktur ini. Sisanya tetap di SO dan bisa difakturkan lagi (langsung lanjut setelah simpan).
            Pelanggan: <b>{findName(customers, splitSO.customerId)}</b>
            {splitLimit > 0 && <> · batas <b>{fmtIDR(splitLimit)}</b> per faktur</>}
          </p>
          <div className="border rounded-lg overflow-x-auto mb-3" style={{ borderColor: colorConfig?.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: colorConfig?.primarySoft }}>
                  {["Produk", "Sisa", "Qty faktur ini", "Harga", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {splitRows.map((r, i) => {
                  const p = (products || []).find((x) => x.id === r.productId);
                  const q = Math.max(0, Math.min(r.qty, Number(splitQty[i]) || 0));
                  const gross = q * (Number(r.unitPrice) || 0);
                  const disc = getItemDiscountAmount(q, r.unitPrice, r.discountType, r.discountPercent);
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                      <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name || "-"}</td>
                      <td className="px-3 py-2 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{r.qty} {p?.unit || ""}</td>
                      <td className="px-3 py-2 w-32">
                        <TextInput type="number" min={0} max={r.qty} value={splitQty[i] ?? ""} onChange={(e) => setSplitQty((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))} colorConfig={colorConfig} />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtIDR(r.unitPrice)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{fmtIDR(Math.max(0, gross - disc))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button variant="ghost" onClick={() => setSplitQty(splitRows.map((r) => r.qty))} colorConfig={colorConfig}>Isi semua sisa</Button>
            <Button variant="ghost" onClick={() => setSplitQty(splitRows.map(() => 0))} colorConfig={colorConfig}>Kosongkan</Button>
            {splitLimit > 0 && <Button variant="ghost" onClick={fillToLimit} colorConfig={colorConfig}>Isi otomatis sampai batas</Button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <Field label="Nomor Faktur" colorConfig={colorConfig}>
              <TextInput value={splitNoShown} onChange={(e) => { setSplitNoTouched(true); setSplitNo(e.target.value); }} colorConfig={colorConfig} />
            </Field>
            <Field label="Ongkir (Rp, opsional)" colorConfig={colorConfig}>
              <TextInput type="number" value={splitOngkir} onChange={(e) => setSplitOngkir(e.target.value)} colorConfig={colorConfig} />
            </Field>
          </div>
          <div className="flex items-center justify-between text-sm mb-3 p-2 rounded-lg" style={{ background: splitLimit > 0 && splitTotal > splitLimit ? (colorConfig?.dangerSoft || "#FEF2F2") : (colorConfig?.primarySoft || "#ECFDF5") }}>
            <span style={{ color: colorConfig?.ink }}>Total faktur ini (termasuk PPN & potongan)</span>
            <span className="tabular-nums font-bold" style={{ color: splitLimit > 0 && splitTotal > splitLimit ? (colorConfig?.danger || "#DC2626") : colorConfig?.ink }}>
              {fmtIDR(splitTotal)}{splitLimit > 0 && splitTotal > splitLimit ? " · lewat batas" : ""}
            </span>
          </div>
          <Button onClick={saveSplitInvoice} disabled={splitChosen.length === 0} className="w-full justify-center" colorConfig={colorConfig}>Simpan Faktur Ini</Button>
        </Modal>
      )}

      {invMonth && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 no-print" style={{ color: colorConfig?.inkSoft }}>
          <span>
            {invMonthBy === "paid" ? "Dilunasi" : "Faktur"} bulan <b style={{ color: colorConfig?.ink }}>{new Date(invMonth + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>: {processedInvoices.length} faktur · total <b style={{ color: colorConfig?.ink }}>{fmtIDR(processedInvoices.reduce((s, x) => s + (x.total || 0), 0))}</b>
          </span>
          <button onClick={() => setInvMonth("")} className="underline cursor-pointer" style={{ color: colorConfig?.accent }}>hapus filter bulan</button>
        </div>
      )}
      <ResponsiveTable minWidth={700} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. Faktur", "Tipe", "Pelanggan", "Tanggal", "Total", "Sisa", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {processedInvoices.map((inv) => {
            const so = (sos || []).find((x) => x.id === inv.soId);
            const custName = inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
            const total = inv.total;
            const sisa = inv.sisa;
            const canEditOrCancel = invoicePaidAmount(inv.id) === 0 && !(returns || []).some((r) => r.invoiceId === inv.id);
            const histOpen = openHist.has(inv.id);
            return (
              <React.Fragment key={inv.id}>
              <tr style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{inv.noFaktur}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={inv.isDirect ? "warn" : "neutral"} colorConfig={colorConfig}>{inv.isDirect ? "Langsung" : invoiceSoIds(inv).length > 1 ? `Gabungan ${invoiceSoIds(inv).length} SO` : so?.soNumber || "SO"}</Badge>
                    <QABadge doc={inv} colorConfig={colorConfig} compact />
                  </div>
                </td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{custName}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(inv.date)}</td>
                <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(total)}</td>
                <td className="px-4 py-2.5"><Badge tone={sisa > 0 ? "warn" : "good"} colorConfig={colorConfig}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</Badge>{sisa <= 0 && inv.paidDate && <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{fmtDate(inv.paidDate)}</div>}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => (isCleared(inv) ? setPrintInv(inv) : notify(blockedReason(inv, `Faktur ${inv.noFaktur}`), "danger"))} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: isCleared(inv) ? colorConfig?.primary : colorConfig?.inkSoft }}><Printer size={13} /> Cetak</button>
                    <button onClick={() => setDetailInv(inv)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    <button onClick={() => toggleHist(inv.id)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>{histOpen ? "Tutup Riwayat" : "Riwayat"}</button>
                    {canEditOrCancel && (
                      <>
                        <button onClick={() => openEditInvoice(inv)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                        <button onClick={() => cancelInvoice(inv)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Faktur</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {histOpen && (() => {
                const h = invoiceHistory(inv);
                return (
                  <tr>
                    <td colSpan={7} className="px-4 pb-3">
                      <PaymentHistory rows={h.rows} total={total} deductions={h.deductions} sisa={sisa} fmtIDR={fmtIDR} fmtDate={fmtDate} colorConfig={colorConfig} />
                    </td>
                  </tr>
                );
              })()}
              </React.Fragment>
            );
          })}
          {processedInvoices.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada Faktur Penjualan yang sesuai.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modalDirect && (
        <Modal title={editingId ? `Edit Faktur Penjualan — ${noFakturDirect}` : "Buat Faktur Penjualan Langsung (Tanpa SO)"} onClose={() => { setModalDirect(false); setEditingId(null); setIsEditingFromSO(false); }} wide xwide colorConfig={colorConfig}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Field label="Nomor Faktur" colorConfig={colorConfig}><TextInput value={noFakturDirect} onChange={(e) => setNoFakturDirect(e.target.value)} placeholder="Contoh: 500/INV/WPM/X/26" className="tabular-nums" colorConfig={colorConfig} /></Field>
            <Field label="Pelanggan" colorConfig={colorConfig}>
              <SearchableSelect value={customerId} onChange={handleSelectCustomer} disabled={isEditingFromSO} colorConfig={colorConfig} placeholder="-- Pilih Pelanggan --"
                options={(customers || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.type, c.address].filter(Boolean).join(" · ") }))}
                pinnedOptions={[{ value: "__ADD_NEW__", label: "+ Tambah Pelanggan Baru..." }]} />
            </Field>
            <Field label="Tanggal Faktur" colorConfig={colorConfig}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} /></Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Opsi PPN (Pajak)" colorConfig={colorConfig}>
              <Select value={taxType} onChange={(e) => setTaxType(e.target.value)} colorConfig={colorConfig}>
                <option value="none">Non-PPN (Tanpa Pajak)</option>
                <option value="ppn11">PPN 11% (Tambah Pajak)</option>
                <option value="include11">PPN 11% (Termasuk Pajak)</option>
              </Select>
            </Field>
            <Field label="Biaya Ongkir (Rp)" colorConfig={colorConfig}>
              <TextInput type="number" value={ongkir} onChange={(e) => setOngkir(e.target.value)} placeholder="0" colorConfig={colorConfig} />
            </Field>
          </div>

          {!isEditingFromSO && (
            <div className="mb-4 p-3 rounded-xl border" style={{ background: colorConfig?.bg, borderColor: colorConfig?.border }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Pilih / Tambah Produk Penjualan</div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
                <TextInput placeholder="Cari nama produk / kategori..." value={searchProd} onChange={(e) => setSearchProd(e.target.value)} className="pl-8" colorConfig={colorConfig} />
              </div>
              <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
                {filteredProds.map((prod) => {
                  const s = stockByProduct[prod.id] || { qty: 0 };
                  return (
                    <div key={prod.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs" style={{ borderColor: colorConfig?.border }}>
                      <div><span className="font-semibold" style={{ color: colorConfig?.ink }}>{prod.name}</span><span className="ml-2 text-[11px] tabular-nums" style={{ color: colorConfig?.inkSoft }}>({prod.category}) · Stok: {s.qty} {prod.unit}</span><AddedBadge items={items} productId={prod.id} colorConfig={colorConfig} /></div>
                      <Button variant="ghost" onClick={() => addProductToDirect(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}><Plus size={12} /> Tambah</Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ItemsTable items={items} products={products} stockByProduct={stockByProduct} showStock={!isEditingFromSO} readOnly={isEditingFromSO} withBatch={false}

            onUpdate={updateDirectItem} onRemove={removeDirectItem} fmtIDR={fmtIDR} colorConfig={colorConfig} priceLabel="Harga Jual" title="Rincian Item Dijual" />

          <DeductionsEditor deductions={deductions} onChange={setDeductions} bill={dirBill} colorConfig={colorConfig} fmtIDR={fmtIDR} />

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <BillSummary bill={dirBill} fmtIDR={fmtIDR} colorConfig={colorConfig} totalLabel="Total Faktur" />
            <Button onClick={submitDirectInvoice} className="justify-center" colorConfig={colorConfig}>{editingId ? "Simpan Perubahan Faktur" : "Simpan Faktur & Potong Stok FEFO"}</Button>
          </div>
        </Modal>
      )}

      {modalQuickCust && (
        <Modal title="Tambah Pelanggan Baru (Cepat)" onClose={() => setModalQuickCust(false)} isSubModal={true} colorConfig={colorConfig}>
          <form onSubmit={submitQuickCustomer}>
            <Field label="Nama Pelanggan / Faskes" colorConfig={colorConfig}><TextInput value={quickCustForm.name} onChange={(e) => setQuickCustForm({ ...quickCustForm, name: e.target.value })} placeholder="Contoh: Klinik Utama AGP Arthakes" required colorConfig={colorConfig} /></Field>
            <Field label="Tipe Pelanggan" colorConfig={colorConfig}><Select value={quickCustForm.type} onChange={(e) => setQuickCustForm({ ...quickCustForm, type: e.target.value })} colorConfig={colorConfig}>{(CUSTOMER_TYPES || []).map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
            <Field label="NPWP Pelanggan (opsional)" colorConfig={colorConfig}><TextInput value={quickCustForm.npwp} onChange={(e) => setQuickCustForm({ ...quickCustForm, npwp: e.target.value })} placeholder="Contoh: 01.234.567.8-012.000" colorConfig={colorConfig} /></Field>
            <Field label="Kontak / No. HP" colorConfig={colorConfig}><TextInput value={quickCustForm.contact} onChange={(e) => setQuickCustForm({ ...quickCustForm, contact: e.target.value })} placeholder="No HP / Email" colorConfig={colorConfig} /></Field>
            <Field label="Alamat Pengiriman" colorConfig={colorConfig}><TextInput value={quickCustForm.address} onChange={(e) => setQuickCustForm({ ...quickCustForm, address: e.target.value })} placeholder="Alamat lengkap faskes" colorConfig={colorConfig} /></Field>
            <Button type="submit" onClick={submitQuickCustomer} className="w-full justify-center mt-3 cursor-pointer" colorConfig={colorConfig}>Simpan & Pilih Pelanggan Ini</Button>
          </form>
        </Modal>
      )}

      {detailInv && (
        <Modal title={`Detail ${detailInv.noFaktur}`} onClose={() => setDetailInv(null)} wide colorConfig={colorConfig}>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty", "Harga", "Diskon", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailInv.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                const gross = it.qty * it.unitPrice;
                const lineTotal = Math.max(0, gross - discAmt);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-800 font-semibold">{discAmt > 0 ? (it.discountType === "amount" ? fmtIDR(it.discountPercent) : `${it.discountPercent}%`) : "-"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right tabular-nums text-sm mb-2 font-bold" style={{ color: colorConfig?.ink }}>Total Faktur: {fmtIDR(invoiceTotal(detailInv))}</div>
        </Modal>
      )}

      {/* POP-UP CETAK FAKTUR PENJUALAN */}
      {printInv && (
        <Modal title={`Faktur Penjualan — ${printInv.noFaktur}`} onClose={() => setPrintInv(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">

            <Button onClick={() => choosePaperAndPrint("printable-invoice", `Faktur Penjualan - ${printInv.noFaktur}`)} variant="primary" colorConfig={colorConfig}>
              <Printer size={15} /> Cetak Sekarang / Simpan PDF
            </Button>
          </div>
          <div className="overflow-x-auto w-full">
            <div id="printable-invoice" className="p-4 sm:p-6 bg-white border rounded-xl text-xs text-gray-800 min-w-[550px] sm:min-w-0">
              <div className="flex flex-col sm:flex-row items-start justify-between border-b-2 pb-4 mb-4 gap-3 sm:gap-0" style={{ borderColor: colorConfig?.primary }}>
                <div className="flex items-start gap-3">
                  {COMPANY_PROFILE?.logoUrl && <img src={COMPANY_PROFILE.logoUrl} alt="Logo" className="h-10 sm:h-12 object-contain shrink-0" />}
                  <div>
                    <div className="text-sm sm:text-base uppercase tracking-wide font-bold" style={{ color: colorConfig?.primary }}>{COMPANY_PROFILE?.name}</div>
                    <p className="text-[11px] text-gray-600">{COMPANY_PROFILE?.tagline}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{COMPANY_PROFILE?.address}</p>
                    <p className="text-[10px] text-gray-500">{COMPANY_PROFILE?.contact}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
                  <div className="text-base sm:text-lg uppercase tracking-wider text-gray-700 font-bold">FAKTUR PENJUALAN</div>
                  <div className="tabular-nums text-sm mt-0.5 sm:mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printInv.noFaktur}</div>
                </div>
              </div>

              {(() => {
                const so = (sos || []).find((s) => s.id === printInv.soId);
                const cust = printInv.isDirect ? (customers || []).find((c) => c.id === printInv.customerId) : (customers || []).find((c) => c.id === so?.customerId);
                const dp = invoiceDPAmount ? invoiceDPAmount(printInv) : (invoiceSoIds(printInv).length ? soDPAmount(invoiceSoIds(printInv)) : 0);
                const paid = invoicePaidAmount(printInv.id);
                const ret = invoiceReturnedAmount(printInv.id);
                
                const rawSub = (printInv.items || []).reduce((s, it) => {
                  const gross = it.qty * it.unitPrice;
                  const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                  return s + Math.max(0, gross - discAmt);
                }, 0);

                const effPct = printInv.discountType === "amount" 
                  ? (rawSub > 0 ? (Math.min(rawSub, Number(printInv.discountPercent || 0)) / rawSub) * 100 : 0)
                  : Number(printInv.discountPercent || 0);

                const _bill = computeBill(printInv, { includeOngkir: false }); // pemotongan (diskon & fee) ikut dihitung
                const taxInfo = { ..._bill, total: _bill.afterTax - _bill.fee };
                const ongkirVal = Number(printInv.ongkir) || 0;
                const sisa = Math.max(0, taxInfo.total + ongkirVal - ret - dp - paid);

                return (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Kepada Yth.</div>
                        <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                        <div className="text-[11px] text-gray-600">{cust?.contact || "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Detail Dokumen</div>
                        <div><span className="text-gray-500">Tanggal Faktur:</span> <span className="tabular-nums">{fmtDate(printInv.date)}</span></div>
                        <div><span className="text-gray-500">No. Sales Order:</span> <span className="tabular-nums">{(invoiceSoIds(printInv).length > 1 ? invoiceSoIds(printInv).map((id) => (sos || []).find((x) => x.id === id)?.soNumber).filter(Boolean).join(", ") : so?.soNumber) || (printInv.isDirect ? "Penjualan Langsung" : "-")}</span></div>
                      </div>
                    </div>

                    <table className="w-full text-xs border-collapse mb-6">
                      <thead>
                        <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Harga Satuan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Diskon</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(printInv.items || []).map((it, idx) => {
                          const p = (products || []).find((x) => x.id === it.productId);
                          const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                          const gross = it.qty * it.unitPrice;
                          const lineTotal = Math.max(0, gross - discAmt);

                          return (
                            <tr key={idx} className="border-b">
                              <td className="py-2 px-2 tabular-nums text-gray-500">{idx + 1}</td>
                              <td className="py-2 px-2 text-gray-900 font-bold">{p?.name || "-"}</td>
                              <td className="py-2 px-2 text-center tabular-nums">{it.qty} {p?.unit || "unit"}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{fmtIDR(it.unitPrice)}</td>
                              <td className="py-2 px-2 text-center tabular-nums text-emerald-800">{discAmt > 0 ? (it.discountType === "amount" ? fmtIDR(it.discountPercent) : `${it.discountPercent}%`) : "-"}</td>
                              <td className="py-2 px-2 text-right tabular-nums font-bold">{fmtIDR(lineTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="flex justify-between items-start mb-8 gap-4">
                      <div className="w-1/2 p-3 rounded-lg border bg-gray-50 text-[11px]">
                        <div className="text-gray-700 mb-1 font-bold">Catatan Pembayaran:</div>
                        <PaymentInfo taxType={_bill.taxType || printInv.taxType || "none"} company={COMPANY_PROFILE} />
                      </div>

                      <div className="w-5/12 text-xs flex flex-col gap-1.5">
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">Subtotal Item</span><span className="tabular-nums font-bold">{fmtIDR(rawSub)}</span></div>
                        {taxInfo.discHeaderAmount > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Diskon Nota</span><span className="tabular-nums font-bold">- {fmtIDR(taxInfo.discHeaderAmount)}</span></div>}
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">DPP</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.dpp)}</span></div>
                        {taxInfo.ppn > 0 && <div className="flex justify-between py-1 border-b text-emerald-800"><span>PPN (11%)</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.ppn)}</span></div>}
                        {(taxInfo.feeLines || []).filter((d) => d.amount > 0).map((d) => <div key={d.id} className="flex justify-between py-1 border-b text-red-600"><span>Fee{d.mode !== "amount" ? ` ${d.value}%` : ""}{d.note ? ` (${d.note})` : ""}</span><span className="tabular-nums font-bold">- {fmtIDR(d.amount)}</span></div>)}
                        {ongkirVal > 0 && <div className="flex justify-between py-1 border-b"><span className="text-gray-600">Ongkir</span><span className="tabular-nums font-bold">{fmtIDR(ongkirVal)}</span></div>}
                        <div className="flex justify-between py-1 border-b font-semibold text-gray-900 bg-gray-50 px-1 rounded"><span>Total Faktur</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.total + ongkirVal)}</span></div>
                        {dp > 0 && <div className="flex justify-between py-1 border-b text-emerald-700"><span>Potongan DP</span><span className="tabular-nums font-bold">- {fmtIDR(dp)}</span></div>}
                        {ret > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Potongan Retur</span><span className="tabular-nums font-bold">- {fmtIDR(ret)}</span></div>}
                        {paid > 0 && <div className="flex justify-between py-1 border-b text-blue-700"><span>Telah Dibayar</span><span className="tabular-nums font-bold">- {fmtIDR(paid)}</span></div>}
                        <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: colorConfig?.primary, borderColor: colorConfig?.primary }}><span>Sisa Tagihan</span><span className="tabular-nums">{fmtIDR(sisa)}</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                      <div><p className="text-gray-500 mb-12">Tanda Tangan Penerima / Pelanggan,</p><p className="text-gray-900 font-bold whitespace-pre">(                                        )</p></div>
                      <div><p className="text-gray-500 mb-12">Hormat Kami,</p><p className="underline text-gray-900 font-bold">{COMPANY_PROFILE?.name || "PT Wiryatama Putera Mandiri"}</p></div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- SUB-KOMPONEN RETUR TAB ---
function ReturTab({ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }) {
  const [modal, setModal] = useState(null);
  const [printRet, setPrintRet] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [returnQty, setReturnQty] = useState({});

  const returnableInvoices = (invoices || []).filter((inv) => invoiceTotal(inv) > 0 && invoiceReturnedAmount(inv.id) < invoiceTotal(inv));
  const selectedInvoice = (invoices || []).find((x) => x.id === invoiceId);

  function alreadyReturnedQty(invId, productId) {
    return (returns || []).filter((r) => r.invoiceId === invId).reduce((s, r) => {
      const it = (r.items || []).find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function openNew() {
    if (returnableInvoices.length === 0) return notify("Tidak ada Faktur Penjualan aktif yang dapat diretur.", "warn");
    setInvoiceId(returnableInvoices[0]?.id || ""); setReturnQty({}); setModal("new");
  }

  // soId bisa 1 SO atau daftar SO (faktur gabungan)
  function restockFromSO(soId, productId, qty, working) {
    const ids = (Array.isArray(soId) ? soId : [soId]).filter(Boolean);
    const dns = (deliveryNotes || []).filter((dn) => ids.includes(dn.soId) && dn.status === "diterima").sort((a, b) => new Date(a.date) - new Date(b.date));
    const allocs = [];
    dns.forEach((dn) => (dn.items || []).forEach((it) => { if (it.productId === productId) allocs.push(...(it.allocations || [])); }));
    let remaining = qty; const restocked = [];
    for (let i = allocs.length - 1; i >= 0 && remaining > 0; i--) {
      const a = allocs[i]; const take = Math.min(a.qty, remaining);
      const b = working.find((x) => x.id === a.batchId);
      if (b) { b.qty += take; restocked.push({ batchId: a.batchId, batchNo: a.batchNo, qty: take }); remaining -= take; }
    }
    return restocked;
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const submitRetur = (...args) => withAtomic(() => submitRetur__raw(...args));
  async function submitRetur__raw() {
    if (!selectedInvoice) return notify("Pilih Faktur terlebih dahulu", "danger");
    const lines = (selectedInvoice.items || []).map((it) => ({ ...it, qtyReturn: Number(returnQty[it.productId]) || 0, maxReturn: it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId) })).filter((l) => l.qtyReturn > 0);
    if (lines.length === 0) return notify("Isi jumlah barang yang mau diretur", "danger");

    for (const l of lines) {
      if (l.qtyReturn > l.maxReturn) { const p = (products || []).find((x) => x.id === l.productId); return notify(`${p?.name}: melebihi sisa yang bisa diretur (${l.maxReturn})`, "danger"); }
    }

    let working = (batches || []).map((b) => ({ ...b }));
    const items = lines.map((l) => {
      let restocked = [];
      if (selectedInvoice.isDirect) {
        let remainingToRestock = l.qtyReturn;
        (l.allocations || []).forEach((a) => {
          if (remainingToRestock <= 0) return;
          const b = working.find((x) => x.id === a.batchId);
          if (b) { const take = Math.min(a.qty, remainingToRestock); b.qty += take; restocked.push({ batchId: a.batchId, batchNo: a.batchNo, qty: take }); remainingToRestock -= take; }
        });
      } else restocked = restockFromSO(invoiceSoIds(selectedInvoice), l.productId, l.qtyReturn, working);
      return { productId: l.productId, qty: l.qtyReturn, unitPrice: l.unitPrice, restockedBatches: restocked };
    });

    await saveBatches(working);
    const gRet = golonganOfItems(items, products);
    const noRetur = nextDocNumber((returns || []).map((r) => r.noRetur), docCode("RET", gRet.mixed ? gRet.highest : gRet.code), { start: 3 });
    await saveReturns([...(returns || []), { id: uid(), noRetur, source: "faktur", invoiceId: selectedInvoice.id, soId: selectedInvoice.soId, date: todayISO(), items }]);
    notify(`${noRetur} berhasil dicatat & stok dikembalikan ke gudang`); setModal(null);
  }

  // Disimpan atomik: stok & dokumen tersimpan bareng atau nggak sama sekali
  const cancelReturn = (...args) => withAtomic(() => cancelReturn__raw(...args));
  async function cancelReturn__raw(ret) {
    let working = (batches || []).map((b) => ({ ...b }));
    let shortage = false;
    (ret.items || []).forEach((it) => {
      (it.restockedBatches || []).forEach((r) => {
        const b = working.find((x) => x.id === r.batchId);
        if (b) { if (b.qty < r.qty) shortage = true; b.qty = Math.max(0, b.qty - r.qty); }
      });
    });
    if (shortage) notify("Peringatan: Stok barang sebagian sudah terpakai transaksi lain, stok disesuaikan ke 0.", "warn");
    await saveBatches(working);
    await saveReturns((returns || []).filter((r) => r.id !== ret.id));
    notify(`${ret.noRetur} berhasil dibatalkan`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew} disabled={returnableInvoices.length === 0} colorConfig={colorConfig}><Plus size={15} /> Catat Retur dari Faktur</Button>
      </div>
      <Card className="!p-0 overflow-hidden no-print" colorConfig={colorConfig}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: colorConfig?.primarySoft }}>
              {["No. Retur", "Sumber", "Referensi", "Tanggal", "Nilai", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {newestFirst(returns).map((r) => {
              const so = (sos || []).find((x) => x.id === r.soId);
              const inv = (invoices || []).find((x) => x.id === r.invoiceId);
              const value = (r.items || []).reduce((s, it) => s + it.qty * it.unitPrice, 0);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{r.noRetur}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral" colorConfig={colorConfig}>{r.source === "sj" ? "Surat Jalan" : "Faktur"}</Badge></td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{inv?.noFaktur || so?.soNumber || "-"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(value)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => setPrintRet(r)} className="text-xs font-semibold cursor-pointer mr-3 inline-flex items-center gap-1" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak</button>
                    <button onClick={() => cancelReturn(r)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Retur</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {printRet && (() => {
        const so = (sos || []).find((x) => x.id === printRet.soId);
        const inv = (invoices || []).find((x) => x.id === printRet.invoiceId);
        const dn = (deliveryNotes || []).find((x) => x.id === printRet.sjId);
        const cust = (customers || []).find((c) => c.id === (inv?.isDirect ? inv.customerId : so?.customerId));
        const total = (printRet.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0);
        return (
          <Modal title={`Cetak Surat Retur — ${printRet.noRetur}`} onClose={() => setPrintRet(null)} wide colorConfig={colorConfig}>
            <PrintArea id="printable-retur-jual" docTitle={`Surat Retur Penjualan - ${printRet.noRetur}`}>
              <DocHeader company={COMPANY_PROFILE} title="Surat Retur Penjualan" number={printRet.noRetur} subtitle="Pengembalian barang dari pelanggan" />
              <DocParties leftTitle="Dikembalikan Oleh (Pelanggan)" leftName={cust?.name} leftLines={[cust?.address, cust?.contact]}
                rightRows={[["Tanggal Retur", fmtDate(printRet.date)], ["No. Faktur", inv?.noFaktur], ["No. Surat Jalan", dn?.noSJ], ["No. Sales Order", so?.soNumber]]} />
              <DocTable rows={printRet.items || []} columns={[
                { label: "No", render: (r, i) => i + 1 },
                { label: "Nama Barang / Alkes", render: (r) => <b>{(products || []).find((x) => x.id === r.productId)?.name || "-"}</b> },
                { label: "Qty", align: "center", render: (r) => `${r.qty} ${(products || []).find((x) => x.id === r.productId)?.unit || ""}` },
                { label: "No. Batch", render: (r) => (r.restockedBatches || []).map((b) => b.batchNo).filter(Boolean).join(", ") || "-" },
                { label: "Harga", align: "right", render: (r) => fmtIDR(r.unitPrice) },
                { label: "Nilai", align: "right", render: (r) => <b>{fmtIDR(r.qty * r.unitPrice)}</b> },
              ]} />
              <div className="flex justify-between gap-4 text-xs">
                <div className="text-gray-700">Alasan retur: ..................................................................</div>
                <div className="font-bold text-sm">Total Nilai Retur: {fmtIDR(total)}</div>
              </div>
              <SignatureRow cols={[
                { label: "Dikembalikan Oleh (Pelanggan),", name: "" },
                { label: "Diterima Oleh (Gudang),", name: "" },
                { label: "Mengetahui (APJ / PJT),", name: "" },
              ]} />
            </PrintArea>
          </Modal>
        );
      })()}

      {modal === "new" && (
        <Modal title="Catat Retur dari Faktur Penjualan" onClose={() => setModal(null)} wide colorConfig={colorConfig}>
          {returnableInvoices.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: colorConfig?.inkSoft }}>Tidak ada Faktur yang masih bisa diretur.</div>
          ) : (
            <>
              <Field label="Pilih Faktur Penjualan" colorConfig={colorConfig}>
                <SearchableSelect value={invoiceId} onChange={(v) => { setInvoiceId(v); setReturnQty({}); }} colorConfig={colorConfig} placeholder="-- Pilih Faktur --"
                  options={returnableInvoices.map((inv) => ({ value: inv.id, label: `${inv.noFaktur} (${fmtIDR(invoiceTotal(inv))})`, sublabel: findName(customers, inv.customerId) }))} />
              </Field>
              {selectedInvoice && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Isi Qty Barang yang Dikembalikan Pelanggan</div>
                  {(selectedInvoice.items || []).map((it) => {
                    const p = (products || []).find((x) => x.id === it.productId);
                    const maxReturn = it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId);
                    if (maxReturn <= 0) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border" style={{ borderColor: colorConfig?.border }}>
                        <div className="flex-1 text-sm font-medium" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs tabular-nums font-normal" style={{ color: colorConfig?.inkSoft }}>(maks {maxReturn} {p?.unit})</span></div>
                        <TextInput type="number" value={returnQty[it.productId] || 0} onChange={(e) => setReturnQty({ ...returnQty, [it.productId]: Number(e.target.value) })} className="w-24 text-center" colorConfig={colorConfig} />
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitRetur} className="w-full justify-center mt-4" colorConfig={colorConfig}>Simpan Retur & Kembalikan Stok Ke Gudang</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
