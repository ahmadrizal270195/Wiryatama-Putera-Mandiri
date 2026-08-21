import React, { useState, useMemo } from "react";
import { Plus, Search, Printer, FileText, Trash2 } from "lucide-react";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";

export default function SalesView({
  products, customers, sos, batches, deliveryNotes, invoices, returns, paymentsIn,
  saveSOs, saveBatches, saveDeliveryNotes, saveInvoices, saveReturns, saveCustomers,
  allocateFEFO, findName, notify, stockByProduct, soTotal, invoiceTotal, soDPAmount,
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
    if ((invoices || []).some((inv) => inv.soId === so.id)) return "invoiced";
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
        <SOTab {...{ products, customers, sos, deliveryNotes, saveSOs, saveCustomers, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }} />
      )}
      {subTab === "sj" && (
        <SJTab {...{ products, customers, sos, batches, deliveryNotes, invoices, returns, saveBatches, saveDeliveryNotes, saveReturns, findName, notify, getSOStatus, shippedQty, soTotal, invoiceTotal, colorConfig, uid, todayISO, fmtDate, fmtIDR, COMPANY_PROFILE }} />
      )}
      {subTab === "faktur" && (
        <FakturTab {...{ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, batches, saveBatches, saveInvoices, saveCustomers, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount, stockByProduct, allocateFEFO, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }} />
      )}
      {subTab === "retur" && (
        <ReturTab {...{ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR }} />
      )}
    </div>
  );
}

// --- SUB-KOMPONEN SO TAB ---
function SOTab({ products, customers, sos, deliveryNotes, saveSOs, saveCustomers, findName, notify, soTotal, getSOStatus, STATUS_LABEL, stockByProduct, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }) {
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailSO, setDetailSO] = useState(null);
  const [printSO, setPrintSO] = useState(null);
  const [soNumber, setSoNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickCust, setModalQuickCust] = useState(false);
  const [quickCustForm, setQuickCustForm] = useState({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" });

  const [searchSO, setSearchSO] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState("date");
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

    return list.sort((a, b) => {
      let valA, valB;
      if (sortField === "soNumber") { valA = a.soNumber.toLowerCase(); valB = b.soNumber.toLowerCase(); }
      else if (sortField === "customer") { valA = findName(customers, a.customerId).toLowerCase(); valB = findName(customers, b.customerId).toLowerCase(); }
      else if (sortField === "date") { valA = new Date(a.date || 0); valB = new Date(b.date || 0); }
      else if (sortField === "total") { valA = soTotal(a); valB = soTotal(b); }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [sos, customers, searchSO, statusFilter, sortField, sortOrder, getSOStatus, soTotal]);

  function openNew() {
    const currentYear = new Date().getFullYear();
    const maxSeq = (sos || []).reduce((max, s) => {
      const match = (s.soNumber || "").match(/SO-\d{4}-(\d+)/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    setSoNumber(`SO-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`);
    setCustomerId((customers || [])[0]?.id || "");
    setDate(todayISO());
    setTaxType("none");
    setDiscountPercentHeader(0);
    setItems([]);
    setSearchProd("");
    setEditingId(null);
    setModal("new");
  }

  function openEdit(so) {
    if ((deliveryNotes || []).some((dn) => dn.soId === so.id)) {
      return notify("Gagal Edit: SO ini sudah memiliki Surat Jalan. Batalkan Surat Jalan terlebih dahulu.", "danger");
    }
    setEditingId(so.id);
    setSoNumber(so.soNumber);
    setCustomerId(so.customerId);
    setDate(so.date || todayISO());
    setTaxType(so.taxType || "none");
    setDiscountPercentHeader(so.discountPercent || so.discount || 0);
    setItems((so.items || []).map(it => ({ ...it })));
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
    else setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice, discountPercent: 0 }]);
  }

  function updateItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeItem(i) { setItems(items.filter((_, idx) => idx !== i)); }

  const rawSubtotal = items.reduce((s, it) => {
    const gross = it.qty * it.unitPrice;
    const discAmount = gross * (Number(it.discountPercent || 0) / 100);
    return s + Math.max(0, gross - discAmount);
  }, 0);

  const taxInfo = calcTax(rawSubtotal, taxType, discountPercentHeader);

  async function submit() {
    if (!soNumber.trim()) return notify("Nomor SO wajib diisi", "danger");
    if (!customerId) return notify("Pilih pelanggan", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");
    
    const payload = { soNumber: soNumber.trim(), customerId, date, taxType, discountPercent: Number(discountPercentHeader || 0), items, status: "open" };
    if (editingId) {
      await saveSOs((sos || []).map(s => s.id === editingId ? { ...s, ...payload } : s));
      notify(`${soNumber.trim()} berhasil diperbarui`);
    } else {
      await saveSOs([...(sos || []), { id: uid(), ...payload }]);
      notify(`${soNumber.trim()} dibuat`);
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
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
            <TextInput placeholder="Cari No. SO / Pelanggan..." value={searchSO} onChange={(e) => setSearchSO(e.target.value)} className="pl-8" colorConfig={colorConfig} />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48" colorConfig={colorConfig}>
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
            const canEditOrCancel = !(deliveryNotes || []).some((dn) => dn.soId === so.id);
            return (
              <tr key={so.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: colorConfig?.ink }}>{so.soNumber}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{findName(customers, so.customerId)}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(so.date)}</td>
                <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: colorConfig?.ink }}>{fmtIDR(soTotal(so))}</td>
                <td className="px-4 py-2.5"><Badge tone={s.tone} colorConfig={colorConfig}>{s.label}</Badge></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2.5">
                    <button onClick={() => setPrintSO(so)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak SO</button>
                    <button onClick={() => setDetailSO(so)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    {canEditOrCancel && (
                      <>
                        <button onClick={() => openEdit(so)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                        <button onClick={() => cancelSO(so)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan SO</button>
                      </>
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
        <Modal title={editingId ? `Edit Sales Order — ${soNumber}` : "Buat Sales Order (SO)"} onClose={() => { setModal(null); setEditingId(null); }} wide colorConfig={colorConfig}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Nomor SO" colorConfig={colorConfig}><TextInput value={soNumber} onChange={(e) => setSoNumber(e.target.value)} placeholder="Contoh: SO/WPM/2026/001" className="font-mono" colorConfig={colorConfig} /></Field>
            <Field label="Pelanggan" colorConfig={colorConfig}>
              <Select value={customerId} onChange={(e) => handleSelectCustomer(e.target.value)} colorConfig={colorConfig}>
                {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__ADD_NEW__" className="font-bold text-teal-800 bg-teal-50">+ Tambah Pelanggan Baru...</option>
              </Select>
            </Field>
            <Field label="Tanggal SO" colorConfig={colorConfig}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Opsi PPN (Pajak)" colorConfig={colorConfig}>
              <Select value={taxType} onChange={(e) => setTaxType(e.target.value)} colorConfig={colorConfig}>
                <option value="none">Non-PPN (Tanpa Pajak)</option>
                <option value="ppn11">PPN 11% (Tambah Pajak)</option>
                <option value="include11">PPN 11% (Termasuk Pajak)</option>
              </Select>
            </Field>
            <Field label="Diskon Nota / Global (%)" colorConfig={colorConfig}>
              <div className="relative flex items-center">
                <TextInput type="number" value={discountPercentHeader} onChange={(e) => { const val = e.target.value; setDiscountPercentHeader(val === "" ? "" : Math.min(100, Math.max(0, Number(val)))); }} placeholder="0" className="font-mono pr-6" colorConfig={colorConfig} />
                <span className="absolute right-3 text-xs font-bold text-teal-800 pointer-events-none">%</span>
              </div>
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
                      <span className="ml-2 text-[11px] font-mono" style={{ color: colorConfig?.inkSoft }}>({prod.category}) · Stok: {s.qty} {prod.unit}</span>
                    </div>
                    <Button variant="ghost" onClick={() => addProductToSO(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}><Plus size={12} /> Tambah</Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Rincian Item Dipesan ({items.length})</div>
          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-4 pr-1">
            {items.map((it, i) => {
              const p = (products || []).find((x) => x.id === it.productId);
              const s = stockByProduct[it.productId] || { qty: 0 };
              const isStockShort = s && s.qty < it.qty;
              const gross = it.qty * it.unitPrice;
              const discAmount = gross * (Number(it.discountPercent || 0) / 100);
              const lineTotal = Math.max(0, gross - discAmount);

              return (
                <div key={i} className="p-2.5 rounded-lg bg-white border flex flex-col gap-2" style={{ borderColor: isStockShort ? colorConfig?.warn : colorConfig?.border }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: colorConfig?.ink }}>{p?.name}</div>
                      <div className="text-[11px] font-mono" style={{ color: isStockShort ? colorConfig?.danger : colorConfig?.inkSoft }}>
                        Stok tersedia: {s.qty} {p?.unit} · Total Item: <span className="font-bold text-gray-900">{fmtIDR(lineTotal)}</span>
                      </div>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1 text-red-500 hover:opacity-70 cursor-pointer"><Trash2 size={16} color={colorConfig?.danger} /></button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                    <div>
                      <label className="text-[10px] block text-gray-500 font-mono">Qty</label>
                      <TextInput type="number" value={it.qty} onChange={(e) => { const val = e.target.value; updateItem(i, { qty: val === "" ? "" : Math.max(0, Number(val)) }); }} onBlur={() => { if (!it.qty || Number(it.qty) <= 0) updateItem(i, { qty: 1 }); }} className="text-center" colorConfig={colorConfig} />
                    </div>
                    <div>
                      <label className="text-[10px] block text-gray-500 font-mono">Harga Jual (Satuan)</label>
                      <TextInput type="number" value={it.unitPrice} onChange={(e) => { const val = e.target.value; updateItem(i, { unitPrice: val === "" ? "" : Math.max(0, Number(val)) }); }} colorConfig={colorConfig} />
                    </div>
                    <div>
                      <label className="text-[10px] block text-gray-500 font-mono">Diskon Item (%)</label>
                      <div className="relative flex items-center">
                        <TextInput type="number" value={it.discountPercent} onChange={(e) => { const val = e.target.value; updateItem(i, { discountPercent: val === "" ? "" : Math.min(100, Math.max(0, Number(val))) }); }} placeholder="0" className="font-mono text-teal-800 pr-6" colorConfig={colorConfig} />
                        <span className="absolute right-2 text-xs font-bold text-teal-800 pointer-events-none">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-end mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <div className="text-xs flex flex-col gap-0.5">
              <div>Subtotal Kotor: <span className="font-mono font-semibold">{fmtIDR(rawSubtotal)}</span></div>
              {Number(discountPercentHeader) > 0 && <div>Diskon Nota ({discountPercentHeader}%): <span className="font-mono font-semibold text-red-600">- {fmtIDR(taxInfo.discHeaderAmount)}</span></div>}
              <div>DPP: <span className="font-mono font-semibold">{fmtIDR(taxInfo.dpp)}</span></div>
              {taxType !== "none" && <div>PPN (11%): <span className="font-mono font-semibold text-teal-700">{fmtIDR(taxInfo.ppn)}</span></div>}
              <div className="font-bold text-sm text-gray-900 mt-1">Total SO: <span className="font-mono">{fmtIDR(taxInfo.total)}</span></div>
            </div>
            <Button onClick={submit} colorConfig={colorConfig}>{editingId ? "Simpan Perubahan SO" : "Simpan & Konfirmasi SO"}</Button>
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
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty", "Harga", "Diskon %", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailSO.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                const discPct = Number(it.discountPercent || 0);
                const gross = it.qty * it.unitPrice;
                const lineTotal = Math.max(0, gross - gross * (discPct / 100));

                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-teal-800 font-semibold">{discPct > 0 ? `${discPct}%` : "-"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.ink }}>{fmtIDR(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-2 font-bold" style={{ color: colorConfig?.ink }}>Total SO: {fmtIDR(soTotal(detailSO))}</div>
        </Modal>
      )}

      {printSO && (
        <Modal title={`Cetak Sales Order — ${printSO.soNumber}`} onClose={() => setPrintSO(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button onClick={async () => { window.print(); }} variant="primary" colorConfig={colorConfig}><Printer size={15} /> Cetak SO / Simpan PDF</Button>
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
                    <p className="text-[10px] text-gray-500">{COMPANY_PROFILE?.contact}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
                  <div className="text-base sm:text-lg uppercase tracking-wider text-gray-700 font-bold">SALES ORDER / PENAWARAN</div>
                  <div className="font-mono text-sm mt-0.5 sm:mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printSO.soNumber}</div>
                </div>
              </div>

              {(() => {
                const cust = (customers || []).find((c) => c.id === printSO.customerId);
                const rawSub = (printSO.items || []).reduce((s, it) => s + Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (Number(it.discountPercent || 0) / 100))), 0);
                const discHeaderPct = Number(printSO.discountPercent || 0);
                const taxInfo = calcTax(rawSub, printSO.taxType || "none", discHeaderPct);

                return (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-3 rounded-lg border">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Kepada Yth. (Pelanggan)</div>
                        <div className="text-sm text-gray-900 font-bold">{cust?.name || "Pelanggan"}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{cust?.address || "-"}</div>
                        <div className="text-[11px] text-gray-600">{cust?.contact || "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">Detail Dokumen</div>
                        <div><span className="text-gray-500">Tanggal Order:</span> <span className="font-mono">{fmtDate(printSO.date)}</span></div>
                        <div><span className="text-gray-500">Status Pesanan:</span> <span className="font-mono font-bold text-teal-800">Dikonfirmasi</span></div>
                      </div>
                    </div>

                    <table className="w-full text-xs border-collapse mb-6">
                      <thead>
                        <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Harga Satuan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Disc %</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(printSO.items || []).map((it, idx) => {
                          const p = (products || []).find((x) => x.id === it.productId);
                          const discPct = Number(it.discountPercent || 0);
                          const lineTotal = Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (discPct / 100)));

                          return (
                            <tr key={idx} className="border-b">
                              <td className="py-2.5 px-2 font-mono text-gray-500">{idx + 1}</td>
                              <td className="py-2.5 px-2 text-gray-900 font-bold">{p?.name || "-"}</td>
                              <td className="py-2.5 px-2 text-center font-mono font-bold">{it.qty} {p?.unit || "unit"}</td>
                              <td className="py-2.5 px-2 text-right font-mono">{fmtIDR(it.unitPrice)}</td>
                              <td className="py-2.5 px-2 text-center font-mono text-teal-800">{discPct > 0 ? `${discPct}%` : "-"}</td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold">{fmtIDR(lineTotal)}</td>
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
                          2. Harga sudah termasuk pajak sesuai dengan ketentuan perpajakan yang berlaku.<br />
                          3. Dokumen ini dapat digunakan sebagai Penawaran Resmi & Konfirmasi Pemesanan.
                        </p>
                      </div>

                      <div className="w-5/12 text-xs flex flex-col gap-1.5">
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-gray-600">Subtotal Item</span>
                          <span className="font-mono font-bold">{fmtIDR(rawSub)}</span>
                        </div>
                        {discHeaderPct > 0 && (
                          <div className="flex justify-between py-1 border-b text-red-600">
                            <span>Diskon Nota ({discHeaderPct}%)</span>
                            <span className="font-mono font-bold">- {fmtIDR(taxInfo.discHeaderAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-gray-600">DPP</span>
                          <span className="font-mono font-bold">{fmtIDR(taxInfo.dpp)}</span>
                        </div>
                        {taxInfo.ppn > 0 && (
                          <div className="flex justify-between py-1 border-b text-teal-800">
                            <span>PPN (11%)</span>
                            <span className="font-mono font-bold">{fmtIDR(taxInfo.ppn)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: colorConfig?.primary, borderColor: colorConfig?.primary }}>
                          <span>Total Nilai Pesanan</span>
                          <span className="font-mono">{fmtIDR(taxInfo.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                      <div>
                        <p className="text-gray-500 mb-12">Disetujui Oleh (Pelanggan),</p>
                        <p className="underline text-gray-900 font-bold">( {cust?.name || "..........................."} )</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-12">Hormat Kami ({COMPANY_PROFILE?.name}),</p>
                        <p className="underline text-gray-900 font-bold">( Sales & Marketing )</p>
                      </div>
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
      const hasInvoice = (invoices || []).some((inv) => inv.soId === so.id || inv.soNumber === so.soNumber);
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

  function openNew() {
    const currentYear = new Date().getFullYear();
    const maxSeq = (deliveryNotes || []).reduce((max, dn) => {
      const match = (dn.noSJ || "").match(/SJ-\d{4}-(\d+)/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    setNoSJ(`SJ-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`);
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
    if ((invoices || []).some((inv) => inv.soId === dn.soId)) {
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

  async function submitSJ() {
    if (!noSJ.trim()) return notify("Nomor Surat Jalan wajib diisi", "danger");
    if (!selectedSO) return notify("Pilih SO terlebih dahulu", "danger");

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
      const avail = working.filter((b) => b.productId === l.productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
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

  async function submitReceive(dn) {
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
      const noRetur = `RET-${new Date().getFullYear()}-${String((returns || []).length + 1).padStart(4, "0")}`;
      await saveReturns([...(returns || []), { id: uid(), noRetur, source: "sj", sjId: dn.id, soId: dn.soId, date: todayISO(), items: newReturnItems }]);
      notify(`${dn.noSJ} diterima sebagian — retur ${noRetur} tercatat`, "warn");
    } else notify(`${dn.noSJ} dikonfirmasi diterima lengkap`);
    setModal(null);
  }

  async function cancelSJ(dn) {
    if ((invoices || []).some((inv) => inv.soId === dn.soId)) {
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
      <div className="flex justify-end mb-3 no-print">
        <Button onClick={openNew} disabled={eligibleSOs.length === 0} colorConfig={colorConfig}><Plus size={15} /> Buat Surat Jalan</Button>
      </div>
      
      <ResponsiveTable minWidth={700} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. SJ", "SO", "Pelanggan", "Tanggal", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...(deliveryNotes || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((dn) => {
            const so = (sos || []).find((x) => x.id === dn.soId);
            const canEditOrCancel = !(invoices || []).some((inv) => inv.soId === dn.soId);
            return (
              <tr key={dn.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: colorConfig?.ink }}>{dn.noSJ}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{so?.soNumber || "-"}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{so ? findName(customers, so.customerId) : "-"}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(dn.date)}</td>
                <td className="px-4 py-2.5"><Badge tone={dn.status === "diterima" ? "good" : "warn"} colorConfig={colorConfig}>{dn.status === "diterima" ? "Diterima" : "Dikirim"}</Badge></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPrintInvDN(dn)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak SJ</button>
                    <button onClick={() => setPrintTT(dn)} className="text-xs flex items-center gap-1 font-semibold text-teal-800 cursor-pointer"><FileText size={13} /> Tanda Terima</button>
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
              <div className="grid grid-cols-3 gap-3">
                <Field label="Nomor Surat Jalan" colorConfig={colorConfig}><TextInput value={noSJ} onChange={(e) => setNoSJ(e.target.value)} placeholder="Contoh: SJ/WPM/2026/001" className="font-mono" colorConfig={colorConfig} /></Field>
                <Field label="Sales Order" colorConfig={colorConfig}>
                  <Select value={soId} onChange={(e) => changeSO(e.target.value)} disabled={!!editingId} colorConfig={colorConfig}>
                    {eligibleSOs.map((so) => <option key={so.id} value={so.id}>{so.soNumber} · {findName(customers, so.customerId)}</option>)}
                  </Select>
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
                        <div className="flex-1 text-sm" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: colorConfig?.inkSoft }}>(sisa {remaining} {p?.unit})</span></div>
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
                <div className="flex-1 text-sm" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs font-mono" style={{ color: colorConfig?.inkSoft }}>(dikirim {it.qty} {p?.unit})</span></div>
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
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{it.receivedQty ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{(it.allocations || []).map((a) => a.batchNo).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}

      {printDN && (
        <Modal title={`Cetak Surat Jalan — ${printDN.noSJ}`} onClose={() => setPrintInvDN(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button onClick={async () => { window.print(); }} variant="primary" colorConfig={colorConfig}><Printer size={15} /> Cetak Surat Jalan / PDF</Button>
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
                <div className="font-mono text-sm mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printDN.noSJ}</div>
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
                      <div><span className="text-gray-500">Tanggal Kirim:</span> <span className="font-mono">{fmtDate(printDN.date)}</span></div>
                      <div><span className="text-gray-500">No. Sales Order:</span> <span className="font-mono">{so?.soNumber || "-"}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-xs border-collapse mb-8">
                    <thead>
                      <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                        <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty Kirim</th>
                        <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Batch & Expire Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printDN.items || []).map((it, idx) => {
                        const p = (products || []).find((x) => x.id === it.productId);
                        const batchInfo = (it.allocations || []).map(a => `${a.batchNo} (${a.qty} ${p?.unit || "unit"})`).join(", ");
                        return (
                          <tr key={idx} className="border-b">
                            <td className="py-2.5 px-2 font-mono text-gray-500">{idx + 1}</td>
                            <td className="py-2.5 px-2 text-gray-900 font-bold">{p?.name || "-"}</td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold">{it.qty} {p?.unit || "unit"}</td>
                            <td className="py-2.5 px-2 font-mono text-gray-700">{batchInfo || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="grid grid-cols-3 gap-4 text-center text-xs mt-12 pt-4">
                    <div><p className="text-gray-500 mb-12">Disiapkan Oleh (Gudang),</p><p className="underline text-gray-900 font-bold">( Petugas Gudang )</p></div>
                    <div><p className="text-gray-500 mb-12">Dikirim Oleh (Sales/Driver),</p><p className="underline text-gray-900 font-bold">( Pengirim )</p></div>
                    <div><p className="text-gray-500 mb-12">Diterima Oleh (Pelanggan),</p><p className="underline text-gray-900 font-bold">( {cust?.name || "..........................."} )</p></div>
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {printTT && (
        <Modal title={`Tanda Terima Dokumen — ${printTT.noSJ}`} onClose={() => setPrintTT(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button onClick={async () => { window.print(); }} variant="primary" colorConfig={colorConfig}><Printer size={15} /> Cetak Tanda Terima / PDF</Button>
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
                <div className="font-mono text-xs mt-1 font-bold text-gray-500">Ref: {printTT.noSJ}</div>
              </div>
            </div>

            {(() => {
              const so = (sos || []).find((s) => s.id === printTT.soId);
              const cust = (customers || []).find((c) => c.id === so?.customerId);
              const inv = (invoices || []).find((i) => i.soId === printTT.soId);
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
                      <div><span className="text-gray-500">Tanggal Penyerahan:</span> <span className="font-mono">{fmtDate(todayISO())}</span></div>
                      <div><span className="text-gray-500">No. Faktur:</span> <span className="font-mono font-bold text-teal-800">{inv?.noFaktur || "Sesuai SO"}</span></div>
                      <div><span className="text-gray-500">No. Surat Jalan:</span> <span className="font-mono">{printTT.noSJ}</span></div>
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
                        <td className="py-2.5 px-2 font-mono">1</td>
                        <td className="py-2.5 px-2 font-bold">Faktur Penjualan Asli / Invoice Tagihan</td>
                        <td className="py-2.5 px-2 text-center font-mono">1 Lembar Asli + Rangkap</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold">{fmtIDR(totalAmount)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 px-2 font-mono">2</td>
                        <td className="py-2.5 px-2 font-bold">Surat Jalan / Bukti Penerimaan Barang Diterima</td>
                        <td className="py-2.5 px-2 text-center font-mono">1 Lembar</td>
                        <td className="py-2.5 px-2 text-right font-mono text-gray-400">-</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                    <div><p className="text-gray-500 mb-12">Yang Menyerahkan (PT WPM),</p><p className="underline text-gray-900 font-bold">( Kurir / Admin Finance )</p></div>
                    <div><p className="text-gray-500 mb-12">Diterima Oleh (Finance/AP Pelanggan),</p><p className="underline text-gray-900 font-bold">( {cust?.name || "..........................."} )</p></div>
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
function FakturTab({ products, customers, sos, deliveryNotes, invoices, paymentsIn, returns, batches, saveBatches, saveInvoices, saveCustomers, findName, notify, getSOStatus, invoiceTotal, soDPAmount, invoicePaidAmount, invoiceReturnedAmount, stockByProduct, allocateFEFO, colorConfig, uid, todayISO, fmtDate, fmtIDR, calcTax, COMPANY_PROFILE, CUSTOMER_TYPES }) {
  const [detailInv, setDetailInv] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isEditingFromSO, setIsEditingFromSO] = useState(false);
  const [printInv, setPrintInv] = useState(null);
  const [modalDirect, setModalDirect] = useState(false);
  const [noFakturDirect, setNoFakturDirect] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxType, setTaxType] = useState("none");
  const [discountPercentHeader, setDiscountPercentHeader] = useState(0);
  const [items, setItems] = useState([]);
  const [searchProd, setSearchProd] = useState("");

  const [modalQuickCust, setModalQuickCust] = useState(false);
  const [quickCustForm, setQuickCustForm] = useState({ name: "", type: CUSTOMER_TYPES?.[0] || "Apotek", npwp: "", contact: "", address: "" });

  const eligibleSOs = (sos || []).filter((so) => getSOStatus(so) === "ready_to_invoice");

  function openDirectModal() {
    const currentYear = new Date().getFullYear();
    const maxSeq = (invoices || []).reduce((max, inv) => {
      const match = (inv.noFaktur || "").match(/INV-\d{4}-(\d+)/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    setNoFakturDirect(`INV-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`);
    setCustomerId((customers || [])[0]?.id || ""); setDate(todayISO()); setTaxType("none"); setDiscountPercentHeader(0); setItems([]); setSearchProd(""); setEditingId(null); setIsEditingFromSO(false); setModalDirect(true);
  }

  function openEditInvoice(inv) {
    if (invoicePaidAmount(inv.id) > 0) return notify("Gagal Edit: Faktur ini sudah memiliki riwayat pembayaran pelunasan.", "danger");
    if ((returns || []).some((r) => r.invoiceId === inv.id)) return notify("Gagal Edit: Faktur ini memiliki transaksi retur. Batalkan retur terlebih dahulu.", "danger");

    const so = (sos || []).find((s) => s.id === inv.soId);
    setEditingId(inv.id); setIsEditingFromSO(!inv.isDirect); setNoFakturDirect(inv.noFaktur); setCustomerId(inv.isDirect ? inv.customerId : so?.customerId || ""); setDate(inv.date || todayISO()); setTaxType(inv.taxType || "none"); setDiscountPercentHeader(inv.discountPercent || inv.discount || 0); setItems((inv.items || []).map(it => ({ ...it }))); setSearchProd(""); setModalDirect(true);
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
    else setItems([...items, { productId: prod.id, qty: 1, unitPrice: prod.sellPrice, discountPercent: 0 }]);
  }

  function updateDirectItem(i, patch) { setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function removeDirectItem(i) { setItems(items.filter((_, idx) => idx !== i)); }

  async function submitDirectInvoice() {
    if (!noFakturDirect.trim()) return notify("Nomor Faktur Penjualan wajib diisi", "danger");
    if (!customerId) return notify("Pilih pelanggan terlebih dahulu", "danger");
    if (items.length === 0) return notify("Tambahkan minimal 1 item produk", "danger");

    const oldInvObj = (invoices || []).find(x => x.id === editingId);
    const isDirectDoc = oldInvObj ? oldInvObj.isDirect : !isEditingFromSO;
    let working = (batches || []).map((b) => ({ ...b }));

    if (editingId && isDirectDoc && oldInvObj) {
      (oldInvObj.items || []).forEach(it => { (it.allocations || []).forEach(alloc => { const b = working.find(x => x.id === alloc.batchId); if (b) b.qty += alloc.qty; }); });
    }

    const shortages = []; const itemsWithAlloc = [];
    if (isDirectDoc) {
      for (const it of items) {
        const avail = working.filter((b) => b.productId === it.productId && b.qty > 0).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        let remaining = it.qty; const allocations = [];
        for (const b of avail) {
          if (remaining <= 0) break;
          const take = Math.min(b.qty, remaining);
          allocations.push({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: take });
          b.qty -= take; remaining -= take;
        }
        if (remaining > 0) { const p = (products || []).find((x) => x.id === it.productId); shortages.push(`${p?.name || "Obat"}: kurang ${remaining} ${p?.unit || "unit"}`); }
        itemsWithAlloc.push({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice, discountPercent: Number(it.discountPercent || 0), allocations });
      }
      if (shortages.length > 0) return notify("Stok tidak cukup — " + shortages.join(", "), "danger");
      await saveBatches(working);
    } else {
      items.forEach(it => { itemsWithAlloc.push({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice, discountPercent: Number(it.discountPercent || 0) }); });
    }

    const payload = { noFaktur: noFakturDirect.trim(), customerId, date, taxType, discountPercent: Number(discountPercentHeader || 0), items: itemsWithAlloc };
    if (editingId) {
      await saveInvoices((invoices || []).map(inv => inv.id === editingId ? { ...inv, ...payload } : inv));
      notify(`${noFakturDirect.trim()} berhasil diperbarui`);
    } else {
      await saveInvoices([...(invoices || []), { id: uid(), ...payload, soId: null, isDirect: true }]);
      notify(`${noFakturDirect.trim()} dibuat langsung & stok FEFO terpotong`);
    }
    setModalDirect(false); setEditingId(null); setIsEditingFromSO(false);
  }

  async function createInvoice(so) {
    const dns = (deliveryNotes || []).filter((dn) => dn.soId === so.id && dn.status === "diterima");
    const receivedByProduct = {};
    dns.forEach((dn) => (dn.items || []).forEach((it) => {
      receivedByProduct[it.productId] = (receivedByProduct[it.productId] || 0) + (it.receivedQty ?? it.qty);
    }));

    const invItems = (so.items || []).map((it) => ({ productId: it.productId, qty: receivedByProduct[it.productId] || 0, unitPrice: it.unitPrice, discountPercent: Number(it.discountPercent || 0) })).filter((it) => it.qty > 0);
    if (invItems.length === 0) return notify("Tidak ada barang yang diterima untuk difakturkan", "danger");

    const currentYear = new Date().getFullYear();
    const maxSeq = (invoices || []).reduce((max, inv) => {
      const match = (inv.noFaktur || "").match(/INV-\d{4}-(\d+)/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    const inputFaktur = prompt("Masukkan Nomor Faktur Penjualan / Pajak:", `INV-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`);
    if (!inputFaktur) return;

    await saveInvoices([...(invoices || []), { id: uid(), noFaktur: inputFaktur.trim(), soId: so.id, customerId: so.customerId, date: todayISO(), taxType: so.taxType || "none", discountPercent: Number(so.discountPercent || 0), items: invItems }]);
    notify(`${inputFaktur.trim()} dibuat`);
  }

  async function cancelInvoice(inv) {
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
  const directRawSubtotal = items.reduce((s, it) => s + Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (Number(it.discountPercent || 0) / 100))), 0);
  const directTax = calcTax(directRawSubtotal, taxType, discountPercentHeader);

  return (
    <div>
      <div className="flex justify-end mb-4 no-print">
        <Button onClick={openDirectModal} colorConfig={colorConfig}><Plus size={15} /> Buat Faktur Penjualan Langsung</Button>
      </div>

      {eligibleSOs.length > 0 && (
        <Card className="mb-4 no-print" colorConfig={colorConfig}>
          <div className="text-xs font-medium mb-2" style={{ color: colorConfig?.inkSoft }}>SO siap difaktur (barang sudah diterima penuh)</div>
          <div className="flex flex-col gap-2">
            {eligibleSOs.map((so) => (
              <div key={so.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${colorConfig?.border}` }}>
                <span style={{ color: colorConfig?.ink }}>{so.soNumber} · {findName(customers, so.customerId)}</span>
                <Button onClick={() => createInvoice(so)} colorConfig={colorConfig}><FileText size={13} /> Buat Faktur</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ResponsiveTable minWidth={700} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            {["No. Faktur", "Tipe", "Pelanggan", "Tanggal", "Total", "Sisa", ""].map((h) => <th key={h} className="text-left px-4 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...(invoices || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((inv) => {
            const so = (sos || []).find((x) => x.id === inv.soId);
            const custName = inv.isDirect ? findName(customers, inv.customerId) : (so ? findName(customers, so.customerId) : "-");
            const total = invoiceTotal(inv);
            const sisa = Math.max(0, total - invoiceReturnedAmount(inv.id) - soDPAmount(inv.soId) - invoicePaidAmount(inv.id));
            const canEditOrCancel = invoicePaidAmount(inv.id) === 0 && !(returns || []).some((r) => r.invoiceId === inv.id);
            return (
              <tr key={inv.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: colorConfig?.ink }}>{inv.noFaktur}</td>
                <td className="px-4 py-2.5"><Badge tone={inv.isDirect ? "warn" : "neutral"} colorConfig={colorConfig}>{inv.isDirect ? "Langsung" : so?.soNumber || "SO"}</Badge></td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.ink }}>{custName}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(inv.date)}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: colorConfig?.ink }}>{fmtIDR(total)}</td>
                <td className="px-4 py-2.5"><Badge tone={sisa > 0 ? "warn" : "good"} colorConfig={colorConfig}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</Badge></td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPrintInv(inv)} className="text-xs flex items-center gap-1 font-semibold cursor-pointer" style={{ color: colorConfig?.primary }}><Printer size={13} /> Cetak</button>
                    <button onClick={() => setDetailInv(inv)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Detail</button>
                    {canEditOrCancel && (
                      <>
                        <button onClick={() => openEditInvoice(inv)} className="text-xs font-semibold cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                        <button onClick={() => cancelInvoice(inv)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Faktur</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </ResponsiveTable>

      {modalDirect && (
        <Modal title={editingId ? `Edit Faktur Penjualan — ${noFakturDirect}` : "Buat Faktur Penjualan Langsung (Tanpa SO)"} onClose={() => { setModalDirect(false); setEditingId(null); setIsEditingFromSO(false); }} wide colorConfig={colorConfig}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Field label="Nomor Faktur" colorConfig={colorConfig}><TextInput value={noFakturDirect} onChange={(e) => setNoFakturDirect(e.target.value)} placeholder="Contoh: INV/WPM/2026/001" className="font-mono" colorConfig={colorConfig} /></Field>
            <Field label="Pelanggan" colorConfig={colorConfig}>
              <Select value={customerId} onChange={(e) => handleSelectCustomer(e.target.value)} disabled={isEditingFromSO} colorConfig={colorConfig}>
                {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__ADD_NEW__" className="font-bold text-teal-800 bg-teal-50">+ Tambah Pelanggan Baru...</option>
              </Select>
            </Field>
            <Field label="Tanggal Faktur" colorConfig={colorConfig}><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} colorConfig={colorConfig} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Opsi PPN (Pajak)" colorConfig={colorConfig}>
              <Select value={taxType} onChange={(e) => setTaxType(e.target.value)} colorConfig={colorConfig}>
                <option value="none">Non-PPN (Tanpa Pajak)</option>
                <option value="ppn11">PPN 11% (Tambah Pajak)</option>
                <option value="include11">PPN 11% (Termasuk Pajak)</option>
              </Select>
            </Field>
            <Field label="Diskon Nota / Global (%)" colorConfig={colorConfig}>
              <div className="relative flex items-center">
                <TextInput type="number" value={discountPercentHeader} onChange={(e) => { const val = e.target.value; setDiscountPercentHeader(val === "" ? "" : Math.min(100, Math.max(0, Number(val)))); }} placeholder="0" className="font-mono pr-6" colorConfig={colorConfig} />
                <span className="absolute right-3 text-xs font-bold text-teal-800 pointer-events-none">%</span>
              </div>
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
                      <div><span className="font-semibold" style={{ color: colorConfig?.ink }}>{prod.name}</span><span className="ml-2 text-[11px] font-mono" style={{ color: colorConfig?.inkSoft }}>({prod.category}) · Stok: {s.qty} {prod.unit}</span></div>
                      <Button variant="ghost" onClick={() => addProductToDirect(prod)} className="!py-0.5 !px-2 text-xs" colorConfig={colorConfig}><Plus size={12} /> Tambah</Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: colorConfig?.primary }}>Rincian Item Dijual ({items.length})</div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-4 pr-1">
            {items.map((it, i) => {
              const p = (products || []).find((x) => x.id === it.productId);
              const s = stockByProduct[it.productId] || { qty: 0 };
              const isStockShort = !isEditingFromSO && s && s.qty < it.qty;
              const lineTotal = Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (Number(it.discountPercent || 0) / 100)));

              return (
                <div key={i} className="p-2.5 rounded-lg bg-white border flex flex-col gap-2" style={{ borderColor: isStockShort ? colorConfig?.warn : colorConfig?.border }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: colorConfig?.ink }}>{p?.name}</div>
                      <div className="text-[11px] font-mono" style={{ color: isStockShort ? colorConfig?.danger : colorConfig?.inkSoft }}>{!isEditingFromSO && `Stok tersedia: ${s.qty} ${p?.unit} · `}Total Item: <span className="font-bold text-gray-900">{fmtIDR(lineTotal)}</span></div>
                    </div>
                    {!isEditingFromSO && <button onClick={() => removeDirectItem(i)} className="p-1 text-red-500 hover:opacity-70 cursor-pointer"><Trash2 size={16} color={colorConfig?.danger} /></button>}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                    <div><label className="text-[10px] block text-gray-500 font-mono">Qty</label><TextInput type="number" value={it.qty} onChange={(e) => updateDirectItem(i, { qty: Math.max(1, Number(e.target.value)) })} disabled={isEditingFromSO} className="text-center" colorConfig={colorConfig} /></div>
                    <div><label className="text-[10px] block text-gray-500 font-mono">Harga Jual (Satuan)</label><TextInput type="number" value={it.unitPrice} onChange={(e) => updateDirectItem(i, { unitPrice: Number(e.target.value) })} disabled={isEditingFromSO} colorConfig={colorConfig} /></div>
                    <div><label className="text-[10px] block text-gray-500 font-mono">Diskon Item (%)</label><div className="relative flex items-center"><TextInput type="number" value={it.discountPercent || 0} onChange={(e) => updateDirectItem(i, { discountPercent: Math.min(100, Math.max(0, Number(e.target.value))) })} placeholder="0" disabled={isEditingFromSO} className="font-mono text-teal-800 pr-6" colorConfig={colorConfig} /><span className="absolute right-2 text-xs font-bold text-teal-800 pointer-events-none">%</span></div></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-end mt-4 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
            <div className="text-xs flex flex-col gap-0.5">
              <div>Subtotal Kotor: <span className="font-mono font-semibold">{fmtIDR(directRawSubtotal)}</span></div>
              {Number(discountPercentHeader) > 0 && <div>Diskon Nota ({discountPercentHeader}%): <span className="font-mono font-semibold text-red-600">- {fmtIDR(directTax.discHeaderAmount)}</span></div>}
              <div>DPP: <span className="font-mono font-semibold">{fmtIDR(directTax.dpp)}</span></div>
              {taxType !== "none" && <div>PPN (11%): <span className="font-mono font-semibold text-teal-700">{fmtIDR(directTax.ppn)}</span></div>}
              <div className="font-bold text-sm text-gray-900 mt-1">Total Faktur: <span className="font-mono">{fmtIDR(directTax.total)}</span></div>
            </div>
            <Button onClick={submitDirectInvoice} colorConfig={colorConfig}>{editingId ? "Simpan Perubahan Faktur" : "Simpan Faktur & Potong Stok FEFO"}</Button>
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
            <thead><tr style={{ background: colorConfig?.primarySoft }}>{["Produk", "Qty", "Harga", "Diskon %", "Subtotal"].map((h) => <th key={h} className="text-left px-3 py-2 text-xs uppercase" style={{ color: colorConfig?.primary }}>{h}</th>)}</tr></thead>
            <tbody>
              {(detailInv.items || []).map((it, i) => {
                const p = (products || []).find((x) => x.id === it.productId);
                const discPct = Number(it.discountPercent || 0);
                const lineTotal = Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (discPct / 100)));
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                    <td className="px-3 py-2" style={{ color: colorConfig?.ink }}>{p?.name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{it.qty} {p?.unit}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.inkSoft }}>{fmtIDR(it.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-teal-800 font-semibold">{discPct > 0 ? `${discPct}%` : "-"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colorConfig?.ink }}>{fmtIDR(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-right font-mono text-sm mb-2 font-bold" style={{ color: colorConfig?.ink }}>Total Faktur: {fmtIDR(invoiceTotal(detailInv))}</div>
        </Modal>
      )}

      {printInv && (
        <Modal title={`Faktur Penjualan — ${printInv.noFaktur}`} onClose={() => setPrintInv(null)} wide colorConfig={colorConfig}>
          <div className="flex justify-end gap-2 mb-4 no-print">
            <Button onClick={async () => { window.print(); }} variant="primary" colorConfig={colorConfig}><Printer size={15} /> Cetak Sekarang / Simpan PDF</Button>
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
                  <div className="font-mono text-sm mt-0.5 sm:mt-1 font-bold" style={{ color: colorConfig?.primary }}>{printInv.noFaktur}</div>
                </div>
              </div>

              {(() => {
                const so = (sos || []).find((s) => s.id === printInv.soId);
                const cust = printInv.isDirect ? (customers || []).find((c) => c.id === printInv.customerId) : (customers || []).find((c) => c.id === so?.customerId);
                const dp = printInv.soId ? soDPAmount(printInv.soId) : 0;
                const paid = invoicePaidAmount(printInv.id);
                const ret = invoiceReturnedAmount(printInv.id);
                const rawSub = (printInv.items || []).reduce((s, it) => s + Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (Number(it.discountPercent || 0) / 100))), 0);
                const discHeaderPct = Number(printInv.discountPercent || 0);
                const taxInfo = calcTax(rawSub, printInv.taxType || "none", discHeaderPct);
                const sisa = Math.max(0, taxInfo.total - ret - dp - paid);

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
                        <div><span className="text-gray-500">No. Sales Order:</span> <span className="font-mono">{so?.soNumber || (printInv.isDirect ? "Penjualan Langsung" : "-")}</span></div>
                      </div>
                    </div>

                    <table className="w-full text-xs border-collapse mb-6">
                      <thead>
                        <tr className="border-b-2" style={{ background: colorConfig?.primarySoft, borderColor: colorConfig?.primary }}>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>No</th>
                          <th className="py-2 px-2 text-left font-bold" style={{ color: colorConfig?.primary }}>Nama Barang / Alkes</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Qty</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Harga Satuan</th>
                          <th className="py-2 px-2 text-center font-bold" style={{ color: colorConfig?.primary }}>Disc %</th>
                          <th className="py-2 px-2 text-right font-bold" style={{ color: colorConfig?.primary }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(printInv.items || []).map((it, idx) => {
                          const p = (products || []).find((x) => x.id === it.productId);
                          const discPct = Number(it.discountPercent || 0);
                          const lineTotal = Math.max(0, it.qty * it.unitPrice - (it.qty * it.unitPrice * (discPct / 100)));

                          return (
                            <tr key={idx} className="border-b">
                              <td className="py-2 px-2 font-mono text-gray-500">{idx + 1}</td>
                              <td className="py-2 px-2 text-gray-900">{p?.name || "-"}</td>
                              <td className="py-2 px-2 text-center font-mono">{it.qty} {p?.unit || "unit"}</td>
                              <td className="py-2 px-2 text-right font-mono">{fmtIDR(it.unitPrice)}</td>
                              <td className="py-2 px-2 text-center font-mono text-teal-800">{discPct > 0 ? `${discPct}%` : "-"}</td>
                              <td className="py-2 px-2 text-right font-mono font-bold">{fmtIDR(lineTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="flex justify-between items-start mb-8 gap-4">
                      <div className="w-1/2 p-3 rounded-lg border bg-gray-50 text-[11px]">
                        <div className="text-gray-700 mb-1 font-bold">Catatan Pembayaran:</div>
                        <p className="text-gray-500 leading-relaxed">
                          Pembayaran dapat ditransfer melalui Bank: <b className="font-bold">{COMPANY_PROFILE?.bankDetails?.bankName}</b><br />
                          No. Rekening: <b className="font-bold">{COMPANY_PROFILE?.bankDetails?.accountNumber}</b> a.n <b className="font-bold">{COMPANY_PROFILE?.bankDetails?.accountName}</b>.<br />
                          <span className="italic">{COMPANY_PROFILE?.paymentNotes}</span>
                        </p>
                      </div>

                      <div className="w-5/12 text-xs flex flex-col gap-1.5">
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">Subtotal Item</span><span className="font-mono font-bold">{fmtIDR(rawSub)}</span></div>
                        {discHeaderPct > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Diskon Nota ({discHeaderPct}%)</span><span className="font-mono font-bold">- {fmtIDR(taxInfo.discHeaderAmount)}</span></div>}
                        <div className="flex justify-between py-1 border-b"><span className="text-gray-600">DPP</span><span className="font-mono font-bold">{fmtIDR(taxInfo.dpp)}</span></div>
                        {taxInfo.ppn > 0 && <div className="flex justify-between py-1 border-b text-teal-800"><span>PPN (11%)</span><span className="font-mono font-bold">{fmtIDR(taxInfo.ppn)}</span></div>}
                        {dp > 0 && <div className="flex justify-between py-1 border-b text-emerald-700"><span>Potongan DP</span><span className="font-mono font-bold">- {fmtIDR(dp)}</span></div>}
                        {ret > 0 && <div className="flex justify-between py-1 border-b text-red-600"><span>Potongan Retur</span><span className="font-mono font-bold">- {fmtIDR(ret)}</span></div>}
                        {paid > 0 && <div className="flex justify-between py-1 border-b text-blue-700"><span>Telah Dibayar</span><span className="font-mono font-bold">- {fmtIDR(paid)}</span></div>}
                        <div className="flex justify-between py-2 border-b-2 text-sm font-bold" style={{ color: colorConfig?.primary, borderColor: colorConfig?.primary }}><span>Sisa Tagihan</span><span className="font-mono">{fmtIDR(sisa)}</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-4">
                      <div><p className="text-gray-500 mb-12">Tanda Tangan Penerima / Pelanggan,</p><p className="underline text-gray-900 font-bold">( {cust?.name || "..........................."} )</p></div>
                      <div><p className="text-gray-500 mb-12">Hormat Kami ({COMPANY_PROFILE?.name}),</p><p className="underline text-gray-900 font-bold">( Finance )</p></div>
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
function ReturTab({ products, customers, sos, invoices, returns, deliveryNotes, batches, saveBatches, saveReturns, findName, notify, invoiceTotal, invoiceReturnedAmount, colorConfig, uid, todayISO, fmtDate, fmtIDR }) {
  const [modal, setModal] = useState(null);
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

  function restockFromSO(soId, productId, qty, working) {
    const dns = (deliveryNotes || []).filter((dn) => dn.soId === soId && dn.status === "diterima").sort((a, b) => new Date(a.date) - new Date(b.date));
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

  async function submitRetur() {
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
      } else restocked = restockFromSO(selectedInvoice.soId, l.productId, l.qtyReturn, working);
      return { productId: l.productId, qty: l.qtyReturn, unitPrice: l.unitPrice, restockedBatches: restocked };
    });

    await saveBatches(working);
    const noRetur = `RET-${new Date().getFullYear()}-${String((returns || []).length + 1).padStart(4, "0")}`;
    await saveReturns([...(returns || []), { id: uid(), noRetur, source: "faktur", invoiceId: selectedInvoice.id, soId: selectedInvoice.soId, date: todayISO(), items }]);
    notify(`${noRetur} berhasil dicatat & stok dikembalikan ke gudang`); setModal(null);
  }

  async function cancelReturn(ret) {
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
            {[...(returns || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r) => {
              const so = (sos || []).find((x) => x.id === r.soId);
              const inv = (invoices || []).find((x) => x.id === r.invoiceId);
              const value = (r.items || []).reduce((s, it) => s + it.qty * it.unitPrice, 0);
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: colorConfig?.ink }}>{r.noRetur}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral" colorConfig={colorConfig}>{r.source === "sj" ? "Surat Jalan" : "Faktur"}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{inv?.noFaktur || so?.soNumber || "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: colorConfig?.ink }}>{fmtIDR(value)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => cancelReturn(r)} className="text-xs cursor-pointer" style={{ color: colorConfig?.danger }}>Batalkan Retur</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {modal === "new" && (
        <Modal title="Catat Retur dari Faktur Penjualan" onClose={() => setModal(null)} wide colorConfig={colorConfig}>
          {returnableInvoices.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: colorConfig?.inkSoft }}>Tidak ada Faktur yang masih bisa diretur.</div>
          ) : (
            <>
              <Field label="Pilih Faktur Penjualan" colorConfig={colorConfig}>
                <Select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setReturnQty({}); }} colorConfig={colorConfig}>
                  {returnableInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.noFaktur} ({fmtIDR(invoiceTotal(inv))})</option>)}
                </Select>
              </Field>
              {selectedInvoice && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-800">Isi Qty Barang yang Dikembalikan Pelanggan</div>
                  {(selectedInvoice.items || []).map((it) => {
                    const p = (products || []).find((x) => x.id === it.productId);
                    const maxReturn = it.qty - alreadyReturnedQty(selectedInvoice.id, it.productId);
                    if (maxReturn <= 0) return null;
                    return (
                      <div key={it.productId} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border" style={{ borderColor: colorConfig?.border }}>
                        <div className="flex-1 text-sm font-medium" style={{ color: colorConfig?.ink }}>{p?.name} <span className="text-xs font-mono font-normal" style={{ color: colorConfig?.inkSoft }}>(maks {maxReturn} {p?.unit})</span></div>
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