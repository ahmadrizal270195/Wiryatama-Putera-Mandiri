import React, { useState, useMemo } from "react";
import { Plus, Printer, FileText, Trash2, Search } from "lucide-react";
import { newReview, isCleared, blockedReason, QABadge, reviewState, requiredClasses } from "../qa";
import { choosePaperAndPrint, QASignatureBlock, PrintArea, DocHeader, DocParties, DocTable, SignatureRow } from "../print";

// Review APJ/PJT diulang kalau isi barang berubah (produk, qty, batch, ED).
function itemsChanged(oldItems, newItems) {
  const sig = (arr) => JSON.stringify((arr || []).map((it) => [it.productId, Number(it.qty) || 0, it.batchNo || "", it.expiryDate || ""]).sort());
  return sig(oldItems) !== sig(newItems);
}
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { computeBill, normalizeDeductions, legacyDiscountFields, cleanDeductions } from "../billing";
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
          if (val === "") {
            onValueChange("");
          } else {
            const num = Number(val);
            if (type === "percent") {
              onValueChange(Math.min(100, Math.max(0, num)));
            } else {
              onValueChange(Math.max(0, num));
            }
          }
        }}
        placeholder={type === "amount" ? "Rp 0" : "0 %"}
        colorConfig={colorConfig}
        className="tabular-nums text-right"
      />
    </div>
  );
}

// Helper kalkulasi diskon item
function getItemDiscountAmount(qty, unitPrice, discType, discVal) {
  const gross = qty * unitPrice;
  const val = Number(discVal || 0);
  if (discType === "amount") {
    return Math.min(gross, val);
  }
  return gross * (Math.min(100, val) / 100);
}

export default function PurchasesView({
  products, suppliers, pos, batches, pReceipts, pInvoices, pReturns, paymentsOut,
  savePOs, saveBatches, savePReceipts, savePInvoices, savePReturns, findName, notify,
  poTotal, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa, stockByProduct, saveSuppliers,
  colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE
}) {
  const [subTab, setSubTab] = useState("po");

  function receivedQty(poId, productId) {
    return (pReceipts || []).filter((pr) => pr.poId === poId).reduce((s, pr) => {
      const it = (pr.items || []).find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function getPOStatus(po) {
    if ((pInvoices || []).some((inv) => inv.poId === po.id)) return "invoiced";
    if (po.isClosedPartial) return "ready_to_invoice";
    const prs = (pReceipts || []).filter((pr) => pr.poId === po.id);
    const fullyReceived = (po.items || []).every((it) => receivedQty(po.id, it.productId) >= it.qty);
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
    { id: "po", label: `Purchase Order (${(pos || []).length})` },
    { id: "bpb", label: `Penerimaan Barang (${(pReceipts || []).length})` },
    { id: "faktur", label: `Faktur Pembelian (${(pInvoices || []).length})` },
    { id: "retur", label: `Retur Pembelian (${(pReturns || []).length})` },
  ];

  const handleClosePartialPO = async (po) => {
    if (!confirm(`Selesaikan PO ${po.poNumber}? Sisa barang yang belum diterima akan dibatalkan otomatis agar Faktur Pembelian bisa dibuat.`)) return;

    const receivedMap = {};
    (pReceipts || [])
      .filter((pr) => pr.poId === po.id && pr.status !== "batal")
      .forEach((pr) => {
        (pr.items || []).forEach((it) => {
          receivedMap[it.productId] = (receivedMap[it.productId] || 0) + Number(it.qty || 0);
        });
      });

    const updatedItems = (po.items || [])
      .map((item) => ({
        ...item,
        orderedQty: item.qty,
        qty: receivedMap[item.productId] || 0
      }))
      .filter((item) => item.qty > 0);

    if (updatedItems.length === 0) {
      return notify("Tidak ada barang yang diterima pada PO ini.", "danger");
    }

    await savePOs((pos || []).map((p) => (p.id === po.id ? { ...p, items: updatedItems, status: "ready_to_invoice", isClosedPartial: true } : p)));
    notify(`PO ${po.poNumber} berhasil diselesaikan! Faktur Pembelian kini siap dibuat.`);
  };

  return (
    <div>
      <div className="no-print">
        <Eyebrow>Transaksi</Eyebrow>
        <h2 className="text-xl font-semibold mb-1" style={{ color: colorConfig?.ink }}>Pembelian</h2>
        <p className="text-sm mb-4" style={{ color: colorConfig?.inkSoft }}>
          Alur: Purchase Order (PO) → Penerimaan Barang (Stok masuk & Batch) → Faktur Pembelian → Retur (bila ada).
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

      {subTab === "po" && (
        <POTab {...{ products, suppliers, pos, pReceipts, pInvoices, savePOs, saveSuppliers, findName, notify, poTotal, getPOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, handleClosePartialPO, receivedQty }} />
      )}
      {subTab === "bpb" && (
        <BPBTab {...{ products, suppliers, pos, batches, pReceipts, pInvoices, saveBatches, savePOs, savePReceipts, findName, notify, getPOStatus, receivedQty, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }} />
      )}
      {subTab === "faktur" && (
        <FakturPembelianTab {...{ products, suppliers, pos, batches, pReceipts, pInvoices, paymentsOut, pReturns, saveBatches, savePInvoices, saveSuppliers, findName, notify, getPOStatus, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax }} />
      )}
      {subTab === "retur" && (
        <ReturPembelianTab {...{ products, suppliers, pos, pInvoices, pReturns, pReceipts, batches, saveBatches, savePReturns, findName, notify, pInvoiceTotal, pInvoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }} />
      )}
    </div>
  );
}

// --- SUB-KOMPONEN PO TAB ---
function POTab({ products, suppliers, pos, pReceipts, pInvoices, savePOs, saveSuppliers, findName, notify, poTotal, getPOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, handleClosePartialPO, receivedQty }) {
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailPO, setDetailPO] = useState(null);
  const [printPO, setPrintPO] = useState(null);
  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountTypeHeader, setDiscountTypeHeader] = useState("percent");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [deductions, setDeductions] = useState([]);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickSupp, setModalQuickSupp] = useState(false);
  const [quickSuppForm, setQuickSuppForm] = useState({ name: "", npwp: "", contact: "", address: "" });

  function openNew() {
    const currentYear = new Date().getFullYear();
    const maxSeq = (pos || []).reduce((max, p) => {
      const match = (p.poNumber || "").match(/PO-\d{4}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const autoPO = `PO-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`;

    setPoNumber(autoPO);
    setSupplierId((suppliers || [])[0]?.id || "");
    setDate(todayISO());
    setTaxType("none");
    setDiscountTypeHeader("percent");
    setDiscountPercentHeader(0); setDeductions([]);
    setItems([]);
    setSearchProd("");
    setEditingId(null);
    setModal("new");
  }

  function openEdit(po) {
    if ((pInvoices || []).some((inv) => inv.poId === po.id)) {
      return notify("Gagal Edit: PO ini sudah diterbitkan Faktur Pembelian Vendor.", "danger");
    }
    
    setEditingId(po.id);
    setPoNumber(po.poNumber);
    setSupplierId(po.supplierId);
    setDate(po.date || todayISO());
    setTaxType(po.taxType || "none");
    setDiscountTypeHeader(po.discountType || "percent");
    setDiscountPercentHeader(po.discountPercent ?? po.discount ?? 0); setDeductions(withRowIds(normalizeDeductions(po)));
    setItems((po.items || []).map(it => ({ 
      ...it, 
      discountType: it.discountType || "percent", 
      discountPercent: it.discountPercent ?? 0 
    })));
    setSearchProd("");
    setModal("edit");
  }

  function handleSelectSupplier(val) {
    if (val === "__ADD_NEW__") {
      setQuickSuppForm({ name: "", npwp: "", contact: "", address: "" });
      setModalQuickSupp(true);
    } else {
      setSupplierId(val);
    }
  }

  async function submitQuickSupplier(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!quickSuppForm.name.trim()) return notify("Nama supplier wajib diisi", "danger");
    
    const newId = uid();
    await saveSuppliers([...(suppliers || []), { ...quickSuppForm, id: newId }]);
    setSupplierId(newId);
    setModalQuickSupp(false);
    notify(`Supplier "${quickSuppForm.name}" berhasil ditambahkan & terpilih`);
  }

  function addProductToPO(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) {
      setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice * 0.7, discountType: "percent", discountPercent: 0 }]);
    }
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
  const poBill = computeBill({ items, taxType, deductions }, { includeOngkir: false });

  async function submit() {
    if (!poNumber.trim()) return notify("Nomor PO wajib diisi", "danger");
    if (!supplierId) return notify("Pilih supplier", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");

    if (editingId) {
      for (const it of items) {
        const alreadyReceived = receivedQty(editingId, it.productId);
        if (Number(it.qty) < alreadyReceived) {
          const p = (products || []).find((x) => x.id === it.productId);
          return notify(
            `Gagal simpan: Qty "${p?.name || "Produk"}" minimal ${alreadyReceived} unit (jumlah yang sudah diterima di BPB).`,
            "danger"
          );
        }
      }
    }

    const currentStatus = editingId 
      ? ((pReceipts || []).some(pr => pr.poId === editingId) ? "partially_received" : "ordered")
      : "ordered";

    const payload = {
      poNumber: poNumber.trim(), 
      supplierId, 
      date, 
      taxType, 
      ...legacyDiscountFields(cleanDeductions(deductions), rawSubtotal),
      deductions: cleanDeductions(deductions),
      items, 
      status: currentStatus,
      isClosedPartial: false
    };

    if (editingId) {
      const oldPO = (pos || []).find((p) => p.id === editingId);
      const changed = !oldPO || itemsChanged(oldPO.items, items);
      const qaPatch = changed ? { qaReview: newReview(items, products) } : {};
      await savePOs((pos || []).map(p => p.id === editingId ? { ...p, ...payload, ...qaPatch } : p));
      notify(`${poNumber.trim()} berhasil diperbarui${changed ? " · menunggu review APJ/PJT ulang" : ""}`);
    } else {
      await savePOs([...(pos || []), { id: uid(), ...payload, qaReview: newReview(items, products) }]);
      notify(`${poNumber.trim()} dibuat · menunggu review APJ/PJT`);
    }
    setModal(null);
    setEditingId(null);
  }

  async function cancelPO(po) {
    if ((pReceipts || []).some((pr) => pr.poId === po.id)) {
      return notify("Gagal membatalkan: PO ini sudah memiliki riwayat Penerimaan Barang. Batalkan Penerimaan terlebih dahulu.", "danger");
    }
    await savePOs((pos || []).filter((p) => p.id !== po.id));
    notify(`${po.poNumber} berhasil dibatalkan`);
  }

  const filteredProds = (products || []).filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew} colorConfig={colorConfig}><Plus size={15} /> Buat PO</Button>
      </div>
      
      <ResponsiveTable minWidth={650} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. PO", "Supplier", "Tanggal", "Total", "Status", ""].map((h) => (
              <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...(pos || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((po) => {
            const st = getPOStatus(po);
            const s = STATUS_LABEL[st];
            const hasInvoice = (pInvoices || []).some((inv) => inv.poId === po.id);
            const hasReceipt = (pReceipts || []).some((pr) => pr.poId === po.id);

            return (
              <tr key={po.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{po.poNumber}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{findName(suppliers, po.supplierId)}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(po.date)}</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{fmtIDR(poTotal(po))}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={s.tone} colorConfig={colorConfig}>{s.label}</Badge>
                    <QABadge doc={po} colorConfig={colorConfig} compact />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2.5">
                    {st === "partially_received" && (
                      <button
                        type="button"
                        onClick={() => handleClosePartialPO(po)}
                        className="text-xs px-2 py-1 font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                      >
                        Selesaikan Order
                      </button>
                    )}
                    <button onClick={() => setPrintPO(po)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}>
                      <Printer size={13} /> Cetak PO
                    </button>
                    <button onClick={() => setDetailPO(po)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    
                    {!hasInvoice && (
                      <button onClick={() => openEdit(po)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                    )}

                    {!hasReceipt && (
                      <button onClick={() => cancelPO(po)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan PO</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {(pos || []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada PO.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modal && (
        <Modal title={editingId ? `Edit Purchase Order — ${poNumber}` : "Buat Purchase Order"} onClose={() => { setModal(null); setEditingId(null); }} wide xwide colorConfig={colorConfig}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Nomor PO" colorConfig={colorConfig}>
              <TextInput value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Contoh: PO/WPM/2026/001" className="tabular-nums" colorConfig={colorConfig} />
            </Field>
            <Field label="Supplier / PBF" colorConfig={colorConfig}>
              <SearchableSelect value={supplierId} onChange={handleSelectSupplier} colorConfig={colorConfig} placeholder="-- Pilih Supplier --"
                options={(suppliers || []).map((s) => ({ value: s.id, label: s.name, sublabel: [s.category, s.address].filter(Boolean).join(" · ") }))}
                pinnedOptions={[{ value: "__ADD_NEW__", label: "+ Tambah Supplier Baru..." }]} />
            </Field>
            <Field label="Tanggal PO" colorConfig={colorConfig}>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Opsi PPN (Pajak)" colorConfig={colorConfig}>
              <Select value={taxType} onChange={(e) => setTaxType(e.target.value)} colorConfig={colorConfig}>
                <option value="none">Non-PPN (Tanpa Pajak)</option>
                <option value="ppn11">PPN 11% (Tambah Pajak)</option>
                <option value="include11">PPN 11% (Termasuk Pajak)</option>
              </Select>
            </Field>
          </div>

          <div className="mb-4 p-3 rounded-xl border" style={{ background: colorConfig?.bg, borderColor: colorConfig?.border }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Pilih / Tambah Produk Kebijakan PO</div>
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
                    <Button variant="ghost" onClick={() => addProductToPO(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}>
                      <Plus size={12} /> Tambah
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <ItemsTable items={items} products={products} stockByProduct={stockByProduct} showStock={false} readOnly={false} withBatch={false}

            onUpdate={updateItem} onRemove={removeItem} fmtIDR={fmtIDR} colorConfig={colorConfig} priceLabel="Harga Beli" title="Rincian Item Dipesan" />

          <DeductionsEditor deductions={deductions} onChange={setDeductions} bill={poBill} colorConfig={colorConfig} fmtIDR={fmtIDR} />

          <div className="flex justify-between items-end mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <BillSummary bill={poBill} fmtIDR={fmtIDR} colorConfig={colorConfig} totalLabel="Total PO" />
            <Button onClick={submit} colorConfig={colorConfig}>{editingId ? "Simpan Perubahan PO" : "Simpan & Terbitkan PO"}</Button>
          </div>
        </Modal>
      )}

      {modalQuickSupp && (
        <Modal title="Tambah Supplier / PBF Baru (Cepat)" onClose={() => setModalQuickSupp(false)} isSubModal={true} colorConfig={colorConfig}>
          <form onSubmit={submitQuickSupplier}>
            <Field label="Nama Supplier / PBF" colorConfig={colorConfig}><TextInput value={quickSuppForm.name} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, name: e.target.value })} placeholder="Contoh: PT Kimia Farma / PBF ..." required colorConfig={colorConfig} /></Field>
            <Field label="NPWP Vendor (opsional)" colorConfig={colorConfig}><TextInput value={quickSuppForm.npwp} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, npwp: e.target.value })} placeholder="Contoh: 01.234.567.8-012.000" colorConfig={colorConfig} /></Field>
            <Field label="Kontak (Telp/Email)" colorConfig={colorConfig}><TextInput value={quickSuppForm.contact} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, contact: e.target.value })} placeholder="No HP / Email PBF" colorConfig={colorConfig} /></Field>
            <Field label="Alamat Kantor/Gudang" colorConfig={colorConfig}><TextInput value={quickSuppForm.address} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, address: e.target.value })} placeholder="Alamat lengkap PBF" colorConfig={colorConfig} /></Field>
            <Button type="submit" onClick={submitQuickSupplier} className="w-full justify-center mt-3 cursor-pointer" colorConfig={colorConfig}>Simpan & Pilih Supplier Ini</Button>
          </form>
        </Modal>
      )}

      {detailPO && (
        <Modal title={`Detail ${detailPO.poNumber}`} onClose={() => setDetailPO(null)} wide colorConfig={colorConfig}>
          <div className="text-xs mb-3" style={{ color: colorConfig?.inkSoft }}>
            Supplier: {findName(suppliers, detailPO.supplierId)} · Tanggal: {fmtDate(detailPO.date)} · Status: {STATUS_LABEL[getPOStatus(detailPO)].label}
          </div>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty", "Harga Beli", "Diskon", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailPO.items || []).map((it, i) => {
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
          <div className="text-right tabular-nums text-sm mb-2 font-bold" style={{ color: colorConfig?.ink }}>Total PO: {fmtIDR(poTotal(detailPO))}</div>
        </Modal>
      )}

      {printPO && (
        <Modal title={`Purchase Order — ${printPO.poNumber}`} onClose={() => setPrintPO(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button onClick={() => choosePaperAndPrint("printable-po", `Surat Pesanan - ${printPO.poNumber}`)} variant="primary" colorConfig={colorConfig}><Printer size={15} /> Cetak Sekarang / Simpan PDF</Button>
          </div>
          <div className="overflow-x-auto w-full">
            <div id="printable-po" className="p-4 sm:p-6 bg-white border rounded-xl text-xs text-gray-800 min-w-[550px] sm:min-w-0">
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
                  <div className="text-base sm:text-lg uppercase tracking-wider text-gray-700 font-bold">SURAT PESANAN / PURCHASE ORDER</div>
                  <div className="tabular-nums text-sm mt-0.5 sm:mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printPO.poNumber}</div>
                </div>
              </div>

              {(() => {
                const supp = (suppliers || []).find((s) => s.id === printPO.supplierId);
                const rawSub = (printPO.items || []).reduce((s, it) => {
                  const gross = it.qty * it.unitPrice;
                  const discAmount = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
                  return s + Math.max(0, gross - discAmount);
                }, 0);

                const effPct = printPO.discountType === "amount" 
                  ? (rawSub > 0 ? (Math.min(rawSub, Number(printPO.discountPercent || 0)) / rawSub) * 100 : 0)
                  : Number(printPO.discountPercent || 0);

                const _bill = computeBill(printPO, { includeOngkir: false }); // pemotongan (diskon & fee) ikut dihitung
                const taxInfo = { ..._bill, total: _bill.afterTax - _bill.fee };

                return (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Kepada Yth. (Supplier / Vendor)</div>
                        <div className="text-sm text-gray-900 font-bold">{supp?.name || "Supplier / Vendor"}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{supp?.address || "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Detail Dokumen Pesanan</div>
                        <div><span className="text-gray-500">Tanggal PO:</span> <span className="tabular-nums">{fmtDate(printPO.date)}</span></div>
                      </div>
                    </div>

                    <table className="w-full text-xs border-collapse mb-6">
                      <thead>
                        <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes Dipesan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Harga Beli Satuan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Diskon</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(printPO.items || []).map((it, idx) => {
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
                        <div className="text-gray-700 mb-1 font-bold">Instruksi Pengiriman & Ketentuan:</div>
                        <p className="text-gray-500 leading-relaxed">
                          1. Harap sertakan nomor Purchase Order ini pada Surat Jalan & Faktur Vendor.<br />
                          2. Pengiriman barang ditujukan ke alamat gudang resmi PT Wiryatama Putera Mandiri.
                        </p>
                      </div>

                      <div className="w-5/12 text-xs flex flex-col gap-1.5">
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">Subtotal Item</span><span className="tabular-nums font-bold">{fmtIDR(rawSub)}</span></div>
                        {taxInfo.discHeaderAmount > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Diskon Nota Vendor</span><span className="tabular-nums font-bold">- {fmtIDR(taxInfo.discHeaderAmount)}</span></div>}
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">DPP</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.dpp)}</span></div>
                        {taxInfo.ppn > 0 && <div className="flex justify-between py-1 border-b text-emerald-800"><span>PPN (11%)</span><span className="tabular-nums font-bold">{fmtIDR(taxInfo.ppn)}</span></div>}
                        {(taxInfo.feeLines || []).filter((d) => d.amount > 0).map((d) => <div key={d.id} className="flex justify-between py-1 border-b text-red-600"><span>Fee{d.mode !== "amount" ? ` ${d.value}%` : ""}{d.note ? ` (${d.note})` : ""}</span><span className="tabular-nums font-bold">- {fmtIDR(d.amount)}</span></div>)}
                        <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: colorConfig?.primary, borderColor: colorConfig?.primary }}><span>Total Pesanan PO</span><span className="tabular-nums">{fmtIDR(taxInfo.total)}</span></div>
                      </div>
                    </div>
                    <QASignatureBlock doc={printPO} leftLabel="Dibuat Oleh (Pembelian)," leftName=""
                      requiredFallback={requiredClasses(printPO.items, products)} title="Penanggung Jawab," />
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

// --- SUB-KOMPONEN BPB TAB ---
function BPBTab({ products, suppliers, pos, batches, pReceipts, pInvoices, saveBatches, savePOs, savePReceipts, findName, notify, getPOStatus, receivedQty, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }) {
  const [modal, setModal] = useState(null);
  const [detailPR, setDetailPR] = useState(null);
  const [printPR, setPrintPR] = useState(null);
  const [noBPB, setNoBPB] = useState("");
  const [poId, setPoId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [receiveForm, setReceiveForm] = useState({});

  // CDOB: barang hanya bisa diterima dari PO yang sudah disetujui APJ/PJT.
  const eligiblePOs = (pos || []).filter((po) => ["ordered", "partially_received"].includes(getPOStatus(po)) && isCleared(po));
  const heldPOs = (pos || []).filter((po) => ["ordered", "partially_received"].includes(getPOStatus(po)) && !isCleared(po)).length;
  const selectedPO = (pos || []).find((x) => x.id === poId);

  function openNew() {
    const autoBPB = `BPB-${new Date().getFullYear()}-${String((pReceipts || []).length + 1).padStart(4, "0")}`;
    setNoBPB(autoBPB);
    const firstPO = eligiblePOs[0];
    setPoId(firstPO?.id || "");
    setDate(todayISO());
    if (firstPO) {
      const init = {};
      (firstPO.items || []).forEach((it, idx) => {
        init[idx] = { qty: Math.max(0, it.qty - receivedQty(firstPO.id, it.productId)), batchNo: "", expiryDate: todayISO() };
      });
      setReceiveForm(init);
    } else setReceiveForm({});
    setModal("new");
  }

  function changePO(id) {
    setPoId(id);
    const po = (pos || []).find((x) => x.id === id);
    const init = {};
    if (po) {
      (po.items || []).forEach((it, idx) => {
        init[idx] = { qty: Math.max(0, it.qty - receivedQty(po.id, it.productId)), batchNo: "", expiryDate: todayISO() };
      });
    }
    setReceiveForm(init);
  }

  async function submitBPB() {
    if (!noBPB.trim()) return notify("Nomor BPB wajib diisi", "danger");
    if (!selectedPO) return notify("Pilih PO terlebih dahulu", "danger");
    if (!isCleared(selectedPO)) return notify(blockedReason(selectedPO, `PO ${selectedPO.poNumber}`), "danger");
    for (let i = 0; i < (selectedPO.items || []).length; i++) {
      const rf = receiveForm[i];
      if (rf && Number(rf.qty) > 0) {
        if (!rf.batchNo || !rf.expiryDate) {
          return notify("Lengkapi nomor batch dan tanggal expiry untuk semua item yang diterima", "danger");
        }
        const it = selectedPO.items[i];
        const remaining = Math.max(0, it.qty - receivedQty(selectedPO.id, it.productId));
        if (Number(rf.qty) > remaining) {
          const p = (products || []).find((x) => x.id === it.productId);
          return notify(`${p?.name || "Produk"}: qty diterima (${rf.qty}) melebihi sisa pesanan PO (${remaining}). Periksa kembali jumlahnya.`, "danger");
        }
      }
    }

    const newBatches = [];
    const receivedItems = [];
    const receiptId = uid(); // dipakai untuk menautkan batch karantina ke BPB ini

    (selectedPO.items || []).forEach((it, i) => {
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
          sourceType: "pembelian",
          supplierId: selectedPO.supplierId,
          quarantine: true, // karantina sampai APJ/PJT menyetujui penerimaan
          qaDocId: receiptId
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

    await saveBatches([...(batches || []), ...newBatches]);
    await savePReceipts([...(pReceipts || []), { id: receiptId, noBPB: noBPB.trim(), poId: selectedPO.id, date, items: receivedItems, qaReview: newReview(receivedItems, products) }]);
    notify(`${noBPB.trim()} disimpan · batch masuk KARANTINA sampai disetujui APJ/PJT`);
    setModal(null);
  }

  async function cancelBPB(pr) {
    if ((pInvoices || []).some((inv) => inv.poId === pr.poId)) {
      return notify("Gagal membatalkan: Faktur Pembelian untuk transaksi ini sudah ada. Batalkan Faktur Pembelian terlebih dahulu.", "danger");
    }

    let working = (batches || []).map((b) => ({ ...b }));
    let isUsedOrSold = false;

    (pr.items || []).forEach((it) => {
      const b = working.find((x) => x.id === it.batchId || (x.batchNo === it.batchNo && x.productId === it.productId));
      if (!b || b.qty < it.qty) isUsedOrSold = true;
    });

    if (isUsedOrSold) {
      return notify("Gagal membatalkan: Barang dari penerimaan (BPB) ini sudah ada yang terjual/digunakan!", "danger");
    }

    (pr.items || []).forEach((it) => {
      const b = working.find((x) => x.id === it.batchId || (x.batchNo === it.batchNo && x.productId === it.productId));
      if (b) b.qty -= it.qty;
    });

    await saveBatches(working);
    await savePReceipts((pReceipts || []).filter((x) => x.id !== pr.id));
    notify(`${pr.noBPB} berhasil dibatalkan & stok ditarik kembali`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3 no-print">
        {heldPOs > 0 && <span className="text-xs mr-3" style={{ color: colorConfig?.warn }}>{heldPOs} PO belum bisa diterima (menunggu / ditolak APJ-PJT)</span>}
        <Button onClick={openNew} disabled={eligiblePOs.length === 0} colorConfig={colorConfig}><Plus size={15} /> Penerimaan Barang (BPB)</Button>
      </div>

      <ResponsiveTable minWidth={650} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. BPB", "PO", "Supplier", "Tanggal Terima", "Item & Batch", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...(pReceipts || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((pr) => {
            const po = (pos || []).find((x) => x.id === pr.poId);
            const canCancel = !(pInvoices || []).some((inv) => inv.poId === pr.poId);
            return (
              <tr key={pr.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{pr.noBPB}<div className="mt-1 font-sans"><QABadge doc={pr} colorConfig={colorConfig} compact /></div></td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{po?.poNumber}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{po ? findName(suppliers, po.supplierId) : "-"}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(pr.date)}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: colorConfig?.inkSoft }}>
                  {(pr.items || []).map((it) => `${findName(products, it.productId)} (${it.qty} unit - ${it.batchNo})`).join(", ")}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPrintPR(pr)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak</button>
                    <button onClick={() => setDetailPR(pr)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    {canCancel && <button onClick={() => cancelBPB(pr)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Terima</button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {(pReceipts || []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada riwayat Penerimaan Barang.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modal === "new" && (
        <Modal title="Penerimaan Barang Supplier (BPB)" onClose={() => setModal(null)} wide colorConfig={colorConfig}>
          {eligiblePOs.length === 0 ? (
            <div className="text-sm" style={{ color: colorConfig?.inkSoft }}>Tidak ada PO yang aktif/menunggu barang.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Field label="Nomor BPB" colorConfig={colorConfig}>
                  <TextInput value={noBPB} onChange={(e) => setNoBPB(e.target.value)} placeholder="Contoh: BPB/WPM/2026/001" className="tabular-nums" colorConfig={colorConfig} />
                </Field>
                <Field label="Purchase Order (PO)" colorConfig={colorConfig}>
                  <SearchableSelect value={poId} onChange={changePO} colorConfig={colorConfig} placeholder="-- Pilih PO --"
                    options={eligiblePOs.map((po) => ({ value: po.id, label: `${po.poNumber} · ${findName(suppliers, po.supplierId)}`, sublabel: po.date ? fmtDate(po.date) : "" }))} />
                </Field>
                <Field label="Tanggal Terima" colorConfig={colorConfig}>
                  <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} />
                </Field>
              </div>

              {selectedPO && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: colorConfig?.inkSoft }}>Lengkapi Rincian Barang & Batch yang Diterima</div>
                  {(selectedPO.items || []).map((it, i) => {
                    const p = (products || []).find((x) => x.id === it.productId);
                    const remaining = Math.max(0, it.qty - receivedQty(selectedPO.id, it.productId));
                    if (remaining <= 0) return null;
                    return (
                      <div key={i} className="p-3 rounded-lg mb-2 border flex flex-col gap-2" style={{ background: colorConfig?.bg, borderColor: colorConfig?.border }}>
                        <div className="text-sm font-medium" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs tabular-nums font-normal" style={{ color: colorConfig?.inkSoft }}>(Sisa pesan: {remaining} {p?.unit})</span></div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] block text-gray-500 tabular-nums">Qty Diterima</label>
                            <TextInput type="number" value={receiveForm[i]?.qty ?? remaining} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], qty: e.target.value } })} colorConfig={colorConfig} />
                          </div>
                          <div>
                            <label className="text-[10px] block text-gray-500 tabular-nums">No. Batch</label>
                            <TextInput placeholder="No. Batch" value={receiveForm[i]?.batchNo || ""} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], batchNo: e.target.value } })} colorConfig={colorConfig} />
                          </div>
                          <div>
                            <label className="text-[10px] block text-gray-500 tabular-nums">Exp Date</label>
                            <TextInput type="date" value={receiveForm[i]?.expiryDate || todayISO()} onChange={(e) => setReceiveForm({ ...receiveForm, [i]: { ...receiveForm[i], expiryDate: e.target.value } })} colorConfig={colorConfig} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={submitBPB} className="w-full justify-center mt-3" colorConfig={colorConfig}>Simpan BPB & Tambah Stok Batch</Button>
            </>
          )}
        </Modal>
      )}

      {printPR && (() => {
        const po = (pos || []).find((x) => x.id === printPR.poId);
        const sup = (suppliers || []).find((x) => x.id === po?.supplierId);
        return (
          <Modal title={`Cetak Bukti Penerimaan Barang — ${printPR.noBPB}`} onClose={() => setPrintPR(null)} wide colorConfig={colorConfig}>
            <PrintArea id="printable-bpb" docTitle={`BPB - ${printPR.noBPB}`}>
              <DocHeader company={COMPANY_PROFILE} title="Bukti Penerimaan Barang" number={printPR.noBPB} />
              <DocParties leftTitle="Diterima Dari (Supplier / PBF)" leftName={sup?.name} leftLines={[sup?.address, sup?.contact]}
                rightRows={[["Tanggal Terima", fmtDate(printPR.date)], ["No. Surat Pesanan / PO", po?.poNumber || "-"]]} />
              <DocTable rows={printPR.items || []} columns={[
                { label: "No", render: (r, i) => i + 1 },
                { label: "Nama Barang / Alkes", render: (r) => <b>{(products || []).find((x) => x.id === r.productId)?.name || "-"}</b> },
                { label: "Qty Diterima", align: "center", render: (r) => `${r.qty} ${(products || []).find((x) => x.id === r.productId)?.unit || ""}` },
                { label: "No. Batch", render: (r) => r.batchNo || "-" },
                { label: "Exp. Date", render: (r) => (r.expiryDate ? fmtDate(r.expiryDate) : "-") },
                { label: "Kondisi", align: "center", render: () => "Baik" },
              ]} />
              <p className="text-[11px] text-gray-700 mb-2">Barang di atas telah diterima dan diperiksa kesesuaian jumlah, No. Batch, dan tanggal kedaluwarsa.</p>
              <QASignatureBlock doc={printPR} title="Diperiksa Oleh,"
                leftCols={[{ label: "Diserahkan Oleh (Supplier / Kurir),", name: "" }, { label: "Diterima Oleh (Gudang),", name: "" }]}
                requiredFallback={requiredClasses(printPR.items, products)} />
            </PrintArea>
          </Modal>
        );
      })()}

      {detailPR && (
        <Modal title={`Detail ${detailPR.noBPB}`} onClose={() => setDetailPR(null)} wide colorConfig={colorConfig}>
          <table className="w-full text-sm mb-3">
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty Diterima", "No. Batch", "Exp Date"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailPR.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{it.batchNo}</td>
                    <td className="px-3 py-2 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(it.expiryDate)}</td>
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

// --- SUB-KOMPONEN FAKTUR PEMBELIAN TAB ---
function FakturPembelianTab({ products, suppliers, pos, batches, pReceipts, pInvoices, paymentsOut, pReturns, saveBatches, savePInvoices, saveSuppliers, findName, notify, getPOStatus, pInvoiceTotal, pInvoicePaidAmount, pInvoiceReturnedAmount, pInvoiceSisa, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax }) {
  const [detailInv, setDetailInv] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [modalDirect, setModalDirect] = useState(false);
  const [noFakturDirect, setNoFakturDirect] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountTypeHeader, setDiscountTypeHeader] = useState("percent");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [deductions, setDeductions] = useState([]);
  const [ongkir, setOngkir] = useState(0);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickSupp, setModalQuickSupp] = useState(false);
  const [quickSuppForm, setQuickSuppForm] = useState({ name: "", npwp: "", contact: "", address: "" });

  // STATE BARU: FILTER & SORTING FAKTUR PEMBELIAN
  const [pInvStatusFilter, setPInvStatusFilter] = useState("ALL");
  const [pInvSortBy, setPInvSortBy] = useState("date_desc");
  const [pInvSearch, setPInvSearch] = useState("");

  const eligiblePOs = (pos || []).filter((po) => {
    const st = getPOStatus(po);
    const hasReceipts = (pReceipts || []).some((pr) => pr.poId === po.id);
    return st === "ready_to_invoice" || (st === "partially_received" && hasReceipts);
  });

// HELPER KALKULASI TOTAL TAGIHAN FAKTUR PEMBELIAN AKURAT
  const getPInvoiceTotal = (inv) => {
    if (!inv || !inv.items) return 0;

    // 1. Hitung Subtotal Kotor Item (setelah diskon per item)
    const rawSubtotal = (inv.items || []).reduce((sum, it) => {
      const gross = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
      return sum + Math.max(0, gross - discAmt);
    }, 0);

    // 2. Hitung Persentase Diskon Nota / Header
    const effHeaderPct = inv.discountType === "amount" 
      ? (rawSubtotal > 0 ? (Math.min(rawSubtotal, Number(inv.discountPercent || 0)) / rawSubtotal) * 100 : 0)
      : Number(inv.discountPercent || 0);

    // 3. Kalkulasi Pajak PPN (Non-PPN, PPN 11%, atau Include PPN)
    // Pakai rumus tagihan bersama (diskon nota, fee, ongkir) supaya sama dengan form & cetakan.
    return computeBill(inv).total;
  };

  // LOGIKA PEMROSESAN FILTER & SORTING
  const processedPInvoices = useMemo(() => {
    return (pInvoices || [])
      .map((inv) => {
        const total = getPInvoiceTotal(inv); // <-- UBAH DI SINI (sebelumnya pInvoiceTotal(inv))
        const paid = pInvoicePaidAmount ? pInvoicePaidAmount(inv.id) : 0;
        const ret = pInvoiceReturnedAmount ? pInvoiceReturnedAmount(inv.id) : 0;
        const sisa = Math.max(0, total - paid - ret);
        const isLunas = sisa <= 0 && total > 0; // Hanya Lunas jika Total > 0
        return { ...inv, sisa, total, isLunas };
      })
      .filter((inv) => {
        const suppName = findName(suppliers, inv.supplierId).toLowerCase();
        const matchSearch = inv.noFaktur.toLowerCase().includes(pInvSearch.toLowerCase()) || suppName.includes(pInvSearch.toLowerCase());

        let matchStatus = true;
        if (pInvStatusFilter === "LUNAS") matchStatus = inv.isLunas;
        if (pInvStatusFilter === "BELUM_LUNAS") matchStatus = !inv.isLunas;

        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        if (pInvSortBy === "date_desc") return new Date(b.date) - new Date(a.date);
        if (pInvSortBy === "date_asc") return new Date(a.date) - new Date(b.date);
        if (pInvSortBy === "total_desc") return b.total - a.total;
        if (pInvSortBy === "total_asc") return a.total - b.total;
        return 0;
      });
  }, [pInvoices, pInvSearch, pInvStatusFilter, pInvSortBy, suppliers, pInvoiceSisa, pInvoiceTotal, findName]);

  function openDirectModal() {
    const currentYear = new Date().getFullYear();
    const maxSeq = (pInvoices || []).reduce((max, inv) => {
      const match = (inv.noFaktur || "").match(/VINV-\d{4}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const autoFaktur = `VINV-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`;

    setNoFakturDirect(autoFaktur);
    setSupplierId((suppliers || [])[0]?.id || "");
    setDate(todayISO());
    setTaxType("none");
    setDiscountTypeHeader("percent");
    setDiscountPercentHeader(0); setDeductions([]);
    setOngkir(0);
    setItems([]);
    setSearchProd("");
    setEditingId(null);
    setModalDirect(true);
  }

  function openEditDirect(inv) {
    const paid = pInvoicePaidAmount(inv.id);
    if (paid > 0) {
      return notify("Gagal Edit: Faktur Pembelian ini sudah memiliki riwayat pembayaran ke supplier.", "danger");
    }
    setEditingId(inv.id);
    setNoFakturDirect(inv.noFaktur);
    setSupplierId(inv.supplierId);
    setDate(inv.date || todayISO());
    setTaxType(inv.taxType || "none");
    setDiscountTypeHeader(inv.discountType || "percent");
    setDiscountPercentHeader(inv.discountPercent || 0); setDeductions(withRowIds(normalizeDeductions(inv)));
    setOngkir(inv.ongkir || 0);
    setItems((inv.items || []).map(it => ({ ...it, discountType: it.discountType || "percent", discountPercent: it.discountPercent || 0 })));
    setSearchProd("");
    setModalDirect(true);
  }

  function handleSelectSupplier(val) {
    if (val === "__ADD_NEW__") {
      setQuickSuppForm({ name: "", npwp: "", contact: "", address: "" });
      setModalQuickSupp(true);
    } else {
      setSupplierId(val);
    }
  }

  async function submitQuickSupplier() {
    if (!quickSuppForm.name.trim()) return notify("Nama supplier wajib diisi", "danger");
    const newId = uid();
    await saveSuppliers([...(suppliers || []), { ...quickSuppForm, id: newId }]);
    notify(`Supplier "${quickSuppForm.name}" berhasil ditambahkan & terpilih`);
    setSupplierId(newId);
    setModalQuickSupp(false);
  }

  function addProductToDirect(prod) {
    const existing = items.find((x) => x.productId === prod.id);
    if (existing) {
      setItems(items.map((x) => x.productId === prod.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice * 0.7, discountType: "percent", discountPercent: 0, batchNo: "", expiryDate: todayISO() }]);
    }
  }

  function updateDirectItem(i, patch) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeDirectItem(i) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  async function submitDirectPInvoice() {
  if (!noFakturDirect.trim()) return notify("Nomor Faktur Vendor wajib diisi", "danger");
  if (!supplierId) return notify("Pilih supplier terlebih dahulu", "danger");
  if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
  
  for (const it of items) {
    if (!it.batchNo || !it.expiryDate) {
      const p = (products || []).find((x) => x.id === it.productId);
      return notify(`Lengkapi No. Batch & Exp Date untuk ${p?.name || "produk"}`, "danger");
    }
  }

  // 1. Ambil data batch yang ada
  let working = (batches || []).map((b) => ({ ...b }));

  // 2. PERBAIKAN TOTAL: Jika sedang EDIT, hapus semua batch lama milik faktur ini
  if (editingId) {
    const oldInv = (pInvoices || []).find(x => x.id === editingId);
    if (oldInv && oldInv.isDirect) {
      // Ambil daftar batchId lama & daftar productId di faktur tersebut
      const oldBatchIds = (oldInv.items || []).map(it => it.batchId).filter(Boolean);
      const oldProdIds = (oldInv.items || []).map(it => it.productId);

      working = working.filter(b => {
        // Hapus jika ID batch cocok
        if (oldBatchIds.length > 0 && oldBatchIds.includes(b.id)) return false;
        
        // Fallback untuk faktur lama (jika batchId kosong):
        // Hapus batch pembelian langsung dari supplier ini dengan produk yang sama pada tanggal faktur tersebut
        if (b.sourceType === "pembelian" && !b.poId && b.supplierId === oldInv.supplierId && oldProdIds.includes(b.productId) && b.receivedDate === oldInv.date) {
          return false;
        }
        return true;
      });
    }
  }

  // CDOB: pembelian langsung = penerimaan barang, wajib review APJ/PJT.
  const oldInvQA = editingId ? (pInvoices || []).find((x) => x.id === editingId) : null;
  const keepReview = !!oldInvQA && !itemsChanged(oldInvQA.items, items);
  const qaReview = keepReview ? oldInvQA.qaReview : newReview(items, products);
  const needQuarantine = !isCleared({ qaReview });
  const invId = editingId || uid();

  // 3. Buat batch baru hasil perbaikan Exp Date/Qty
  const newBatches = [];
  const invItems = [];

  items.forEach((it) => {
    const batchId = uid();
    const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
    const gross = it.qty * it.unitPrice;
    const netTotal = Math.max(0, gross - discAmt);
    const netUnitPrice = it.qty > 0 ? netTotal / it.qty : 0;

    newBatches.push({
      id: batchId,
      productId: it.productId,
      batchNo: it.batchNo,
      expiryDate: it.expiryDate,
      qty: it.qty,
      costPrice: netUnitPrice,
      receivedDate: date,
      poId: null,
      sourceType: "pembelian",
      supplierId: supplierId,
      quarantine: needQuarantine,
      qaDocId: invId
    });

    invItems.push({
      productId: it.productId,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountType: it.discountType || "percent",
      discountPercent: Number(it.discountPercent || 0),
      batchId: batchId, // Simpan batchId agar sinkron
      batchNo: it.batchNo,
      expiryDate: it.expiryDate
    });
  });

  // 4. Simpan batch yang sudah dibersihkan + batch baru
  await saveBatches([...working, ...newBatches]);

  const payload = {
    noFaktur: noFakturDirect.trim(), 
    poId: null, 
    supplierId, 
    date, 
    taxType, 
    ...legacyDiscountFields(cleanDeductions(deductions), directRawSubtotal),
    deductions: cleanDeductions(deductions),
    ongkir: Number(ongkir || 0),
    items: invItems, 
    isDirect: true,
    ...(qaReview ? { qaReview } : {})
  };

  if (editingId) {
    await savePInvoices((pInvoices || []).map(inv => inv.id === editingId ? { ...inv, ...payload } : inv));
    notify(`${noFakturDirect.trim()} berhasil diperbarui${needQuarantine ? " · batch karantina menunggu review APJ/PJT" : ""}`);
  } else {
    await savePInvoices([...(pInvoices || []), { id: invId, ...payload }]);
    notify(`${noFakturDirect.trim()} dibuat · batch masuk KARANTINA sampai disetujui APJ/PJT`);
  }

  setModalDirect(false);
  setEditingId(null);
}

  async function createInvoice(po) {
    const prs = (pReceipts || []).filter((pr) => pr.poId === po.id);
    const receivedByProduct = {};
    prs.forEach((pr) => (pr.items || []).forEach((it) => {
      receivedByProduct[it.productId] = (receivedByProduct[it.productId] || 0) + it.qty;
    }));

    const invItems = (po.items || [])
      .map((it) => ({ 
        productId: it.productId, 
        qty: receivedByProduct[it.productId] || 0, 
        unitPrice: it.unitPrice,
        discountType: it.discountType || "percent",
        discountPercent: Number(it.discountPercent || 0)
      }))
      .filter((it) => it.qty > 0);

    if (invItems.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");
    
    const currentYear = new Date().getFullYear();
    const maxSeq = (pInvoices || []).reduce((max, inv) => {
      const match = (inv.noFaktur || "").match(/VINV-\d{4}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const defaultNo = `VINV-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`;
    const inputFaktur = prompt("Masukkan Nomor Faktur Vendor / Supplier:", defaultNo);
    if (!inputFaktur) return;

    const inputOngkir = prompt("Biaya ongkir tambahan di faktur ini (Rp, kosongkan/0 jika tidak ada):", "0");
    const ongkirVal = Number(inputOngkir) || 0;

    await savePInvoices([...(pInvoices || []), { 
      id: uid(), 
      noFaktur: inputFaktur.trim(), 
      poId: po.id, 
      supplierId: po.supplierId, 
      date: todayISO(), 
      taxType: po.taxType || "none", 
      discountType: po.discountType || "percent",
      discountPercent: Number(po.discountPercent || 0),
      ...(Array.isArray(po.deductions) ? { deductions: po.deductions } : {}),
      ongkir: ongkirVal,
      items: invItems 
    }]);
    notify(`${inputFaktur.trim()} berhasil diterbitkan`);
  }

  async function cancelInvoice(inv) {
    const paid = pInvoicePaidAmount(inv.id);
    if (paid > 0) return notify("Gagal membatalkan: Faktur ini sudah memiliki riwayat pembayaran ke supplier.", "danger");
    if ((pReturns || []).some((r) => r.pInvoiceId === inv.id)) return notify("Gagal membatalkan: Faktur ini memiliki riwayat retur pembelian. Batalkan retur terlebih dahulu.", "danger");

    if (inv.isDirect) {
      let working = (batches || []).map((b) => ({ ...b }));
      let isUsedOrSold = false;

      (inv.items || []).forEach((it) => {
        const b = working.find((x) => x.id === it.batchId || (x.batchNo === it.batchNo && x.productId === it.productId));
        if (!b || b.qty < it.qty) isUsedOrSold = true;
      });

      if (isUsedOrSold) return notify("Gagal membatalkan: Barang dari Faktur Pembelian ini sudah ada yang terjual/terpakai!", "danger");

      (inv.items || []).forEach((it) => {
        const b = working.find((x) => x.id === it.batchId || (x.batchNo === it.batchNo && x.productId === it.productId));
        if (b) b.qty -= it.qty;
      });

      const finalBatches = working.filter((b) => b.qty > 0);
      await saveBatches(finalBatches);
    }

    await savePInvoices((pInvoices || []).filter((x) => x.id !== inv.id));
    notify(`${inv.noFaktur} berhasil dibatalkan & stok batch telah dikurangi`);
  }

  const filteredProds = (products || []).filter((p) => p.name.toLowerCase().includes(searchProd.toLowerCase()) || p.category.toLowerCase().includes(searchProd.toLowerCase()));

  const directRawSubtotal = items.reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmount = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
    return s + Math.max(0, gross - discAmount);
  }, 0);

  const directEffHeaderPct = discountTypeHeader === "amount" 
    ? (directRawSubtotal > 0 ? (Math.min(directRawSubtotal, Number(discountPercentHeader || 0)) / directRawSubtotal) * 100 : 0)
    : Number(discountPercentHeader || 0);

  const directTax = calcTax(directRawSubtotal, taxType, directEffHeaderPct);
  const dirBill = computeBill({ items, taxType, deductions, ongkir });

  return (
    <div>
      <div className="flex justify-end mb-4 no-print">
        <Button onClick={openDirectModal} colorConfig={colorConfig}><Plus size={15} /> Buat Faktur Pembelian Langsung</Button>
      </div>

      {/* BARIS TOOLBAR FILTER & SORTING VENDOR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 no-print">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-lg">
          <TextInput
            placeholder="Cari No. Faktur Vendor / Supplier..."
            value={pInvSearch}
            onChange={(e) => setPInvSearch(e.target.value)}
            colorConfig={colorConfig}
          />
          <Select value={pInvStatusFilter} onChange={(e) => setPInvStatusFilter(e.target.value)} colorConfig={colorConfig}>
            <option value="ALL">Semua Status</option>
            <option value="BELUM_LUNAS">Belum Lunas (Hutang)</option>
            <option value="LUNAS">Sudah Lunas</option>
          </Select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-gray-500 whitespace-nowrap">Urutkan:</span>
          <Select value={pInvSortBy} onChange={(e) => setPInvSortBy(e.target.value)} colorConfig={colorConfig}>
            <option value="date_desc">Tanggal Terbaru</option>
            <option value="date_asc">Tanggal Terlama</option>
            <option value="total_desc">Nominal Terbesar</option>
            <option value="total_asc">Nominal Terkecil</option>
          </Select>
        </div>
      </div>

      {eligiblePOs.length > 0 && (
        <Card className="mb-4 no-print" colorConfig={colorConfig}>
          <div className="text-xs font-medium mb-2" style={{ color: colorConfig?.inkSoft }}>PO Siap Difakturkan Supplier (Barang sudah diterima)</div>
          <div className="flex flex-col gap-2">
            {eligiblePOs.map((po) => (
              <div key={po.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${colorConfig?.border}` }}>
                <span style={{ color: colorConfig?.ink }}>{po.poNumber} · {findName(suppliers, po.supplierId)}</span>
                <Button onClick={() => createInvoice(po)} colorConfig={colorConfig}><FileText size={13} /> Terbitkan Faktur Pembelian</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ResponsiveTable minWidth={700} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. Faktur Vendor", "Tipe", "Supplier", "Tanggal", "Total Tagihan", "Sisa Hutang", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {processedPInvoices.map((inv) => {
            const po = (pos || []).find((x) => x.id === inv.poId);
            const total = inv.total;
            const sisa = inv.sisa;
            const canEditOrCancel = pInvoicePaidAmount(inv.id) === 0 && !(pReturns || []).some((r) => r.pInvoiceId === inv.id);
            return (
              <tr key={inv.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: colorConfig?.ink }}>{inv.noFaktur}<div className="mt-1 font-sans"><QABadge doc={inv} colorConfig={colorConfig} compact /></div></td>
                <td className="px-4 py-2.5"><Badge tone={inv.isDirect ? "warn" : "neutral"} colorConfig={colorConfig}>{inv.isDirect ? "Langsung" : po?.poNumber || "PO"}</Badge></td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{findName(suppliers, inv.supplierId)}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(inv.date)}</td>
                <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(total)}</td>
                <td className="px-4 py-2.5"><Badge tone={sisa > 0 ? "danger" : "good"} colorConfig={colorConfig}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</Badge></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setDetailInv(inv)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    {canEditOrCancel && (
                      <>
                        {inv.isDirect && <button onClick={() => openEditDirect(inv)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>}
                        <button onClick={() => cancelInvoice(inv)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Faktur</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {processedPInvoices.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada Faktur Pembelian yang sesuai.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modalDirect && (
        <Modal title={editingId ? `Edit Faktur Pembelian — ${noFakturDirect}` : "Buat Faktur Pembelian Langsung (Tanpa PO)"} onClose={() => { setModalDirect(false); setEditingId(null); }} wide xwide colorConfig={colorConfig}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Field label="Nomor Faktur Vendor" colorConfig={colorConfig}>
              <TextInput value={noFakturDirect} onChange={(e) => setNoFakturDirect(e.target.value)} placeholder="Contoh: VINV/2026/001" className="tabular-nums" colorConfig={colorConfig} />
            </Field>
            <Field label="Supplier / PBF" colorConfig={colorConfig}>
              <SearchableSelect value={supplierId} onChange={handleSelectSupplier} colorConfig={colorConfig} placeholder="-- Pilih Supplier --"
                options={(suppliers || []).map((s) => ({ value: s.id, label: s.name, sublabel: [s.category, s.address].filter(Boolean).join(" · ") }))}
                pinnedOptions={[{ value: "__ADD_NEW__", label: "+ Tambah Supplier Baru..." }]} />
            </Field>
            <Field label="Tanggal Faktur" colorConfig={colorConfig}>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
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

          <div className="mb-4 p-3 rounded-xl border" style={{ background: colorConfig?.bg, borderColor: colorConfig?.border }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Pilih / Tambah Barang Pembelian</div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
              <TextInput placeholder="Cari nama produk / kategori..." value={searchProd} onChange={(e) => setSearchProd(e.target.value)} className="pl-8" colorConfig={colorConfig} />
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {filteredProds.map((prod) => (
                <div key={prod.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs" style={{ borderColor: colorConfig?.border }}>
                  <div>
                    <span className="font-semibold" style={{ color: colorConfig?.ink }}>{prod.name}</span>
                    <span className="ml-2 text-[11px] tabular-nums" style={{ color: colorConfig?.inkSoft }}>({prod.category})</span><AddedBadge items={items} productId={prod.id} colorConfig={colorConfig} />
                  </div>
                  <Button variant="ghost" onClick={() => addProductToDirect(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}>
                    <Plus size={12} /> Tambah
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <ItemsTable items={items} products={products} stockByProduct={null} showStock={false} readOnly={false} withBatch={true}

            onUpdate={updateDirectItem} onRemove={removeDirectItem} fmtIDR={fmtIDR} colorConfig={colorConfig} priceLabel="Harga Beli" title="Rincian Item, Batch & Exp Date" />

          <DeductionsEditor deductions={deductions} onChange={setDeductions} bill={dirBill} colorConfig={colorConfig} fmtIDR={fmtIDR} />

          <div className="flex justify-between items-end mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <BillSummary bill={dirBill} fmtIDR={fmtIDR} colorConfig={colorConfig} totalLabel="Total Tagihan" />
            <Button onClick={submitDirectPInvoice} colorConfig={colorConfig}>{editingId ? "Simpan Perubahan Faktur" : "Simpan Faktur Pembelian & Tambah Stok"}</Button>
          </div>
        </Modal>
      )}

      {modalQuickSupp && (
        <Modal title="Tambah Supplier / PBF Baru (Cepat)" onClose={() => setModalQuickSupp(false)} colorConfig={colorConfig}>
          <Field label="Nama Supplier / PBF" colorConfig={colorConfig}><TextInput value={quickSuppForm.name} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, name: e.target.value })} placeholder="Contoh: PT Kimia Farma / PBF ..." colorConfig={colorConfig} /></Field>
          <Field label="NPWP Vendor (opsional)" colorConfig={colorConfig}><TextInput value={quickSuppForm.npwp} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, npwp: e.target.value })} placeholder="Contoh: 01.234.567.8-012.000" colorConfig={colorConfig} /></Field>
          <Field label="Kontak (Telp/Email)" colorConfig={colorConfig}><TextInput value={quickSuppForm.contact} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, contact: e.target.value })} placeholder="No HP / Email PBF" colorConfig={colorConfig} /></Field>
          <Field label="Alamat Kantor/Gudang" colorConfig={colorConfig}><TextInput value={quickSuppForm.address} onChange={(e) => setQuickSuppForm({ ...quickSuppForm, address: e.target.value })} placeholder="Alamat lengkap PBF" colorConfig={colorConfig} /></Field>
          <Button onClick={submitQuickSupplier} className="w-full justify-center mt-2" colorConfig={colorConfig}>Simpan & Pilih Supplier Ini</Button>
        </Modal>
      )}

      {detailInv && (
  <Modal title={`Detail ${detailInv.noFaktur}`} onClose={() => setDetailInv(null)} wide colorConfig={colorConfig}>
    <table className="w-full text-sm mb-3">
      <thead>
        <tr style={{ background: colorConfig?.primarySoft }}>
          {["Produk", "Qty", "Harga Beli", "Diskon", "Subtotal"].map((h) => (
            <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>
          ))}
        </tr>
      </thead>
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

    {/* KODE PERBAIKAN: KALKULASI TOTAL AKURAT DENGAN TAX & DISKON */}
    {(() => {
      const rawSub = (detailInv.items || []).reduce((s, it) => {
        const gross = it.qty * it.unitPrice;
        const discAmt = getItemDiscountAmount(it.qty, it.unitPrice, it.discountType, it.discountPercent);
        return s + Math.max(0, gross - discAmt);
      }, 0);

      const effPct = detailInv.discountType === "amount" 
        ? (rawSub > 0 ? (Math.min(rawSub, Number(detailInv.discountPercent || 0)) / rawSub) * 100 : 0)
        : Number(detailInv.discountPercent || 0);

      const _bill = computeBill(detailInv, { includeOngkir: false }); // pemotongan (diskon & fee) ikut dihitung
                const taxInfo = { ..._bill, total: _bill.afterTax - _bill.fee };
      const ongkirVal = Number(detailInv.ongkir) || 0;

      return (
        <div className="text-right tabular-nums text-sm mb-2" style={{ color: colorConfig?.ink }}>
          {_bill.diskon > 0 && <div className="font-normal" style={{ color: colorConfig?.danger }}>Diskon Nota: - {fmtIDR(_bill.diskon)}</div>}
          {_bill.fee > 0 && <div className="font-normal" style={{ color: colorConfig?.danger }}>Fee: - {fmtIDR(_bill.fee)}</div>}
          {ongkirVal > 0 && <div className="font-normal">Ongkir: {fmtIDR(ongkirVal)}</div>}
          <div className="font-bold">Total Tagihan: {fmtIDR(taxInfo.total + ongkirVal)}</div>
        </div>
      );
    })()}
  </Modal>
)}
    </div>
  );
}

// --- SUB-KOMPONEN RETUR PEMBELIAN TAB ---
function ReturPembelianTab({ products, suppliers, pos, pInvoices, pReturns, pReceipts, batches, saveBatches, savePReturns, findName, notify, pInvoiceTotal, pInvoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }) {
  const [modal, setModal] = useState(null);
  const [printRet, setPrintRet] = useState(null);
  const [pInvoiceId, setPInvoiceId] = useState("");
  const [returnQty, setReturnQty] = useState({});

  const returnableInvoices = (pInvoices || []).filter((inv) => pInvoiceReturnedAmount(inv.id) < pInvoiceTotal(inv));
  const selectedInvoice = (pInvoices || []).find((x) => x.id === pInvoiceId);

  function alreadyReturnedQty(invId, productId) {
    return (pReturns || []).filter((r) => r.pInvoiceId === invId).reduce((s, r) => {
      const it = (r.items || []).find((x) => x.productId === productId);
      return s + (it ? it.qty : 0);
    }, 0);
  }

  function openNew() {
    if (returnableInvoices.length === 0) {
      return notify("Tidak ada Faktur Pembelian aktif yang dapat diretur.", "warn");
    }
    setPInvoiceId(returnableInvoices[0]?.id || "");
    setReturnQty({});
    setModal("new");
  }

  async function submitRetur() {
    if (!selectedInvoice) return notify("Pilih Faktur Pembelian terlebih dahulu", "danger");
    const lines = (selectedInvoice.items || [])
      .map((it) => ({ ...it, qtyReturn: Number(returnQty[it.productId]) || 0, maxReturn: it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId) }))
      .filter((l) => l.qtyReturn > 0);

    if (lines.length === 0) return notify("Isi jumlah yang ingin diretur", "danger");

    let working = (batches || []).map((b) => ({ ...b }));
    const returnItems = [];

    for (const l of lines) {
      if (l.qtyReturn > l.maxReturn) {
        const p = (products || []).find((x) => x.id === l.productId);
        return notify(`${p?.name}: melebihi sisa barang yang bisa diretur (${l.maxReturn})`, "danger");
      }

      if (selectedInvoice.isDirect) {
        const b = working.find((x) => x.id === l.batchId || (x.batchNo === l.batchNo && x.productId === l.productId));
        if (b && b.qty > 0) {
          b.qty = Math.max(0, b.qty - l.qtyReturn);
        }
      } else {
        const prs = (pReceipts || []).filter((pr) => pr.poId === selectedInvoice.poId);
        let remainingToDeduct = l.qtyReturn;

        prs.forEach((pr) => {
          (pr.items || []).forEach((rit) => {
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
      }

      returnItems.push({ productId: l.productId, qty: l.qtyReturn, unitPrice: l.unitPrice });
    }

    await saveBatches(working);
    const noRetur = `PRET-${new Date().getFullYear()}-${String((pReturns || []).length + 1).padStart(4, "0")}`;
    await savePReturns([...(pReturns || []), { id: uid(), noRetur, pInvoiceId: selectedInvoice.id, poId: selectedInvoice.poId, date: todayISO(), items: returnItems }]);
    notify(`${noRetur} berhasil disimpan, stok dikurangi & hutang berkurang`);
    setModal(null);
  }

  async function cancelReturn(ret) {
    let working = (batches || []).map((b) => ({ ...b }));

    const inv = (pInvoices || []).find((x) => x.id === ret.pInvoiceId);
    if (inv && inv.isDirect) {
      (ret.items || []).forEach((it) => {
        const itemInv = (inv.items || []).find((x) => x.productId === it.productId);
        if (itemInv) {
          const b = working.find((x) => x.id === itemInv.batchId || (x.batchNo === itemInv.batchNo && x.productId === it.productId));
          if (b) b.qty += it.qty;
        }
      });
    } else {
      const prs = (pReceipts || []).filter((pr) => pr.poId === ret.poId);
      (ret.items || []).forEach((it) => {
        let remainingToAdd = it.qty;
        prs.forEach((pr) => {
          (pr.items || []).forEach((rit) => {
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
    }

    await saveBatches(working);
    await savePReturns((pReturns || []).filter((r) => r.id !== ret.id));
    notify(`${ret.noRetur} berhasil dibatalkan`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={openNew} disabled={returnableInvoices.length === 0} colorConfig={colorConfig}><Plus size={15} /> Catat Retur Pembelian</Button>
      </div>
      <Card className="!p-0 overflow-hidden" colorConfig={colorConfig}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: colorConfig?.primarySoft }}>
              {["No. Retur", "Faktur Vendor", "Tanggal", "Nilai Retur", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...(pReturns || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r) => {
              const inv = (pInvoices || []).find((x) => x.id === r.pInvoiceId);
              const value = (r.items || []).reduce((s, it) => s + it.qty * it.unitPrice, 0);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{r.noRetur}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{inv?.noFaktur || "-"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: colorConfig?.good }}>{fmtIDR(value)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setPrintRet(r)} className="text-xs font-semibold cursor-pointer mr-3 inline-flex items-center gap-1" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak</button>
                    <button onClick={() => cancelReturn(r)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Retur</button>
                  </td>
                </tr>
              );
            })}
            {(pReturns || []).length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada Retur Pembelian.</td></tr>}
          </tbody>
        </table>
      </Card>

      {printRet && (() => {
        const inv = (pInvoices || []).find((x) => x.id === printRet.pInvoiceId);
        const po = (pos || []).find((x) => x.id === (printRet.poId || inv?.poId));
        const sup = (suppliers || []).find((x) => x.id === (inv?.supplierId || po?.supplierId));
        // Batch: dari item faktur langsung, atau dari BPB atas PO tersebut
        const batchOf = (productId) => {
          const fromInv = (inv?.items || []).filter((x) => x.productId === productId && x.batchNo).map((x) => x.batchNo);
          const fromBpb = (pReceipts || []).filter((x) => x.poId && x.poId === po?.id).flatMap((x) => (x.items || []).filter((y) => y.productId === productId && y.batchNo).map((y) => y.batchNo));
          return [...new Set([...fromInv, ...fromBpb])].join(", ") || "-";
        };
        const total = (printRet.items || []).reduce((s2, it) => s2 + it.qty * it.unitPrice, 0);
        return (
          <Modal title={`Cetak Surat Retur — ${printRet.noRetur}`} onClose={() => setPrintRet(null)} wide colorConfig={colorConfig}>
            <PrintArea id="printable-retur-beli" docTitle={`Surat Retur Pembelian - ${printRet.noRetur}`}>
              <DocHeader company={COMPANY_PROFILE} title="Surat Retur Pembelian" number={printRet.noRetur} subtitle="Pengembalian barang ke supplier" />
              <DocParties leftTitle="Kepada Yth. (Supplier / PBF)" leftName={sup?.name} leftLines={[sup?.address, sup?.contact]}
                rightRows={[["Tanggal Retur", fmtDate(printRet.date)], ["No. Faktur Vendor", inv?.noFaktur], ["No. Surat Pesanan / PO", po?.poNumber]]} />
              <p className="text-xs text-gray-800 mb-2">Bersama ini kami kembalikan barang-barang berikut:</p>
              <DocTable rows={printRet.items || []} columns={[
                { label: "No", render: (r, i) => i + 1 },
                { label: "Nama Barang / Alkes", render: (r) => <b>{(products || []).find((x) => x.id === r.productId)?.name || "-"}</b> },
                { label: "Qty", align: "center", render: (r) => `${r.qty} ${(products || []).find((x) => x.id === r.productId)?.unit || ""}` },
                { label: "No. Batch", render: (r) => batchOf(r.productId) },
                { label: "Harga", align: "right", render: (r) => fmtIDR(r.unitPrice) },
                { label: "Nilai", align: "right", render: (r) => <b>{fmtIDR(r.qty * r.unitPrice)}</b> },
              ]} />
              <div className="flex justify-between gap-4 text-xs">
                <div className="text-gray-700">Alasan retur: ..................................................................</div>
                <div className="font-bold text-sm">Total Nilai Retur: {fmtIDR(total)}</div>
              </div>
              <SignatureRow cols={[
                { label: "Hormat Kami,", name: COMPANY_PROFILE?.name || "PT Wiryatama Putera Mandiri" },
                { label: "Mengetahui (APJ / PJT),", name: "" },
                { label: "Diterima Oleh (Supplier),", name: "" },
              ]} />
            </PrintArea>
          </Modal>
        );
      })()}

      {modal === "new" && (
        <Modal title="Catat Retur Pembelian ke Supplier" onClose={() => setModal(null)} wide colorConfig={colorConfig}>
          {returnableInvoices.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: colorConfig?.inkSoft }}>Tidak ada Faktur Pembelian yang bisa diretur.</div>
          ) : (
            <>
              <Field label="Pilih Faktur Pembelian" colorConfig={colorConfig}>
                <SearchableSelect value={pInvoiceId} onChange={(v) => { setPInvoiceId(v); setReturnQty({}); }} colorConfig={colorConfig} placeholder="-- Pilih Faktur Pembelian --"
                  options={returnableInvoices.map((inv) => ({ value: inv.id, label: `${inv.noFaktur} · ${findName(suppliers, inv.supplierId)}`, sublabel: inv.date ? fmtDate(inv.date) : "" }))} />
              </Field>

              {selectedInvoice && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Isi Qty Barang yang Dikembalikan Ke Supplier</div>
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
              <Button onClick={submitRetur} className="w-full justify-center mt-4" colorConfig={colorConfig}>Simpan Retur & Potong Stok Batch</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}