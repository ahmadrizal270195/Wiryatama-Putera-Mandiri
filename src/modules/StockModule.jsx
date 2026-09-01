import React, { useState, useMemo, useRef } from "react";
import { Upload, Search, Download, Edit2, Trash2 } from "lucide-react";
import { Eyebrow, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";

export default function StockView(props) {
  const { 
    products, batches, saveBatches, suppliers, stockByProduct, 
    invoices, notify, findName, colorConfig, uid, todayISO, daysUntil, 
    urgencyOf, fmtDate, fmtIDR, CATEGORIES 
  } = props;

  const [modalImport, setModalImport] = useState(false);
  const [sourceType, setSourceType] = useState("opname_awal");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [parsedData, setParsedData] = useState([]);
  const fileInputRef = useRef(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // --- STATE PENYESUAIAN STOK BATCH (DENGAN AUDIT TRAIL) ---
  const [editBatchModal, setEditBatchModal] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  function openEditBatch(batch) {
    setEditBatchModal(batch);
    setEditQty(batch.qty);
    setAdjustReason("");
  }

  // SIMPAN PENYESUAIAN QTY BATCH (WAJIB ALASAN)
  async function handleSaveBatchQty() {
    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty < 0) {
      return notify("Jumlah stok tidak valid", "danger");
    }
    if (!adjustReason.trim()) {
      return notify("Alasan penyesuaian stok wajib diisi untuk audit log!", "danger");
    }

    const updatedBatches = (batches || []).map((b) =>
      b.id === editBatchModal.id 
        ? { 
            ...b, 
            qty: newQty,
            lastAdjustedAt: todayISO(),
            lastAdjustedReason: adjustReason.trim()
          } 
        : b
    );

    await saveBatches(updatedBatches);
    notify(`Stok batch ${editBatchModal.batchNo || "tanpa no"} disesuaikan menjadi ${newQty} (Alasan: ${adjustReason.trim()})`);
    setEditBatchModal(null);
    setAdjustReason("");
  }

  // HAPUS BATCH DENGAN PROTEKSI INTEGRITAS TRANSAKSI
  async function handleDeleteBatch(batchId) {
    // Check if batch is linked to any sales invoice items
    const isUsedInSales = (invoices || []).some((inv) =>
      (inv.items || []).some((it) => it.batchId === batchId)
    );

    if (isUsedInSales) {
      return notify("Gagal Hapus: Batch ini sudah memiliki riwayat Penjualan. Silakan ubah Qty menjadi 0 jika ingin mengosongkan stok.", "danger");
    }

    if (!confirm("Yakin ingin menghapus data batch ini? Riwayat batch akan dihapus permanen.")) return;

    const updatedBatches = (batches || []).filter((b) => b.id !== batchId);
    await saveBatches(updatedBatches);
    notify("Batch berhasil dihapus");
    if (editBatchModal && editBatchModal.id === batchId) setEditBatchModal(null);
  }

  function downloadCSVTemplate() {
    const headers = ["Nama Produk", "No Batch", "Tanggal Expiry (YYYY-MM-DD)", "Jumlah Qty", "Harga Beli per Satuan"];
    const exampleRow1 = ["Paracetamol 500mg", "BCH-2026-001", "2027-12-31", "100", "5000"];
    const exampleRow2 = ["Amoxicillin 500mg", "BCH-2026-002", "2026-10-15", "50", "12000"];
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), exampleRow1.join(","), exampleRow2.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Template_Import_Stok_Opname_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      parseCSV(event.target.result);
    };
    reader.readAsText(file);
  }

  function parseCSV(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      return notify("File CSV kosong atau format tidak sesuai", "warn");
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
      if (cols.length >= 4) {
        const [prodName, batchNo, expiryDate, qty, costPrice] = cols;
        const matchedProduct = (products || []).find(p => p.name.toLowerCase().trim() === (prodName || "").toLowerCase().trim());
        
        rows.push({
          rawProductName: prodName,
          productId: matchedProduct ? matchedProduct.id : "",
          batchNo: batchNo || `BATCH-OP-${Date.now().toString().slice(-4)}`,
          expiryDate: expiryDate || todayISO(),
          qty: Number(qty) || 0,
          costPrice: Number(costPrice) || 0,
          isValid: !!matchedProduct && Number(qty) > 0
        });
      }
    }
    setParsedData(rows);
  }

  async function submitImport() {
    if (parsedData.length === 0) return notify("Belum ada data valid untuk di-import", "danger");

    const invalidItems = parsedData.filter(d => !d.isValid);
    if (invalidItems.length > 0) {
      if (!confirm(`Terdapat ${invalidItems.length} baris produk yang tidak cocok dengan master produk. Baris tersebut akan dilewati. Lanjutkan?`)) {
        return;
      }
    }

    const validItems = parsedData.filter(d => d.isValid);
    if (validItems.length === 0) return notify("Tidak ada produk valid untuk di-import", "danger");

    const newBatches = validItems.map(item => ({
      id: uid(),
      productId: item.productId,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      qty: item.qty,
      costPrice: item.costPrice,
      receivedDate: todayISO(),
      sourceType: sourceType,
      supplierId: sourceType === "pembelian" ? selectedSupplierId : null,
    }));

    await saveBatches([...(batches || []), ...newBatches]);
    notify(`Berhasil meng-import ${newBatches.length} batch stok opname/awal baru`);
    setModalImport(false);
    setParsedData([]);
  }

  const filteredProducts = useMemo(() => {
    return (products || []).filter((p) => {
      const s = stockByProduct[p.id] || { qty: 0, batches: [] };
      
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                            p.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = categoryFilter === "ALL" || p.category === categoryFilter;

      let matchesStatus = true;
      if (statusFilter === "HAS_STOCK") {
        matchesStatus = s.qty > 0;
      } else if (statusFilter === "NO_STOCK") {
        matchesStatus = s.qty === 0;
      } else if (statusFilter === "NEAR_EXPIRY") {
        matchesStatus = (s.batches || []).some((b) => b.qty > 0 && daysUntil(b.expiryDate) >= 0 && daysUntil(b.expiryDate) <= 90);
      } else if (statusFilter === "EXPIRED") {
        matchesStatus = (s.batches || []).some((b) => b.qty > 0 && daysUntil(b.expiryDate) < 0);
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, stockByProduct, search, categoryFilter, statusFilter, daysUntil]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <Eyebrow>Traceability</Eyebrow>
          <h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Stok & Batch</h2>
        </div>
        <Button onClick={() => setModalImport(true)} colorConfig={colorConfig}>
          <Upload size={15} /> Import Stock / Opname
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
          <TextInput
            placeholder="Cari produk / kategori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            colorConfig={colorConfig}
          />
        </div>

        <div>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} colorConfig={colorConfig}>
            <option value="ALL">Semua Kategori Produk</option>
            {(CATEGORIES || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} colorConfig={colorConfig}>
            <option value="ALL">Semua Status Stok</option>
            <option value="HAS_STOCK">Ada Stok (Ready)</option>
            <option value="NO_STOCK">Stok Kosong</option>
            <option value="NEAR_EXPIRY">Mendekati Expired (&lt;90 Hari)</option>
            <option value="EXPIRED">Sudah Kedaluwarsa</option>
          </Select>
        </div>
      </div>

      <ResponsiveTable minWidth={750} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>NAMA PRODUK</th>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>KATEGORI</th>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>SATUAN</th>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>TOTAL STOK</th>
            <th className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>RINCIAN BATCH & EXPIRY FEFO</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map((p) => {
            const s = stockByProduct[p.id] || { qty: 0, batches: [] };
            const sortedBatches = [...(s.batches || [])].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

            return (
              <tr key={p.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: colorConfig?.ink }}>{p.name}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.inkSoft }}>{p.category}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{p.unit}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={s.qty < (p.minStock || 0) ? "warn" : s.qty === 0 ? "danger" : "good"} colorConfig={colorConfig}>
                    {s.qty} {p.unit}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {sortedBatches.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {sortedBatches.map((b) => {
                        const u = urgencyOf(b.expiryDate);
                        const isOpname = b.sourceType === "opname_awal";
                        return (
                          <span
                            key={b.id}
                            className="batch-chip text-[10px] font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors shadow-2xs"
                            style={{ 
                              borderColor: colorConfig?.border, 
                              background: colorConfig?.cardSoft, 
                              color: colorConfig?.ink 
                            }}
                          >
                            <span className="batch-no font-bold" style={{ color: colorConfig?.primary }}>{b.batchNo}</span>
                            <span className="batch-qty" style={{ color: colorConfig?.ink }}>({b.qty} {p.unit})</span>
                            <span className="batch-exp" style={{ color: colorConfig?.inkSoft }}>exp {fmtDate(b.expiryDate)}</span>
                            <span style={{ color: u.color }} className="font-bold">· {u.label}</span>
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                              style={{
                                background: isOpname ? colorConfig?.warnSoft : colorConfig?.goodSoft,
                                color: isOpname ? colorConfig?.warn : colorConfig?.good
                              }}
                            >
                              {isOpname ? 'Opname' : 'Pembelian'}
                            </span>

                            {/* TOMBOL EDIT & HAPUS AKSI CEPAT DENGAN AUDIT TRAIL */}
                            <button
                              onClick={() => openEditBatch(b)}
                              className="ml-1 p-0.5 hover:bg-gray-200 rounded cursor-pointer text-teal-700"
                              title="Edit / Sesuaikan Stok Batch Ini"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              onClick={() => handleDeleteBatch(b.id)}
                              className="p-0.5 hover:bg-gray-200 rounded cursor-pointer text-red-600"
                              title="Hapus Batch Ini"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs italic" style={{ color: colorConfig?.inkSoft }}>Tidak ada batch aktif</span>
                  )}
                </td>
              </tr>
            );
          })}
          {filteredProducts.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>
                Belum ada data stok yang cocok dengan pencarian Anda.
              </td>
            </tr>
          )}
        </tbody>
      </ResponsiveTable>

      {/* MODAL EDIT & PENYESUAIAN STOK BATCH (DENGAN ALASAN AUDIT) */}
      {editBatchModal && (
        <Modal
          title={`Penyesuaian Stok Batch — ${editBatchModal.batchNo || "Tanpa No. Batch"}`}
          onClose={() => setEditBatchModal(null)}
          colorConfig={colorConfig}
        >
          <div className="text-xs mb-3 space-y-1" style={{ color: colorConfig?.inkSoft }}>
            <div>Tanggal Kedaluwarsa: <span className="font-mono font-bold">{fmtDate(editBatchModal.expiryDate)}</span></div>
            {editBatchModal.lastAdjustedAt && (
              <div className="text-[11px] text-amber-700">
                Terakhir disesuaikan: {fmtDate(editBatchModal.lastAdjustedAt)} ({editBatchModal.lastAdjustedReason || "-"})
              </div>
            )}
          </div>

          <Field label="Jumlah Stok Fisik Baru (Qty)" colorConfig={colorConfig}>
            <TextInput
              type="number"
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              placeholder="0"
              colorConfig={colorConfig}
            />
          </Field>

          <Field label="Alasan Penyesuaian Stok (Wajib)" colorConfig={colorConfig}>
            <TextInput
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Contoh: Koreksi stok ganda / Fisik rusak / Opname fisik"
              colorConfig={colorConfig}
            />
          </Field>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={() => handleDeleteBatch(editBatchModal.id)}
              variant="danger"
              className="w-1/3 justify-center cursor-pointer"
              colorConfig={colorConfig}
            >
              Hapus Batch
            </Button>
            <Button
              onClick={handleSaveBatchQty}
              className="w-2/3 justify-center cursor-pointer"
              colorConfig={colorConfig}
            >
              Simpan Penyesuaian
            </Button>
          </div>
        </Modal>
      )}

      {/* MODAL IMPORT STOK (ASLI MILIKMU) */}
      {modalImport && (
        <Modal title="Import Stok & Batch (Opname Awal / Pembelian)" onClose={() => setModalImport(false)} wide colorConfig={colorConfig}>
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 p-3 rounded-lg text-xs text-teal-900 flex justify-between items-center">
              <div>
                <strong>Petunjuk:</strong> Unduh format template CSV di bawah ini, isi data batch stok opname awal Anda, lalu upload kembali.
              </div>
              <Button onClick={downloadCSVTemplate} variant="secondary" className="!bg-white shrink-0" colorConfig={colorConfig}>
                <Download size={14} /> Template CSV
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Pilih Asal Masuk Produk" colorConfig={colorConfig}>
                <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)} colorConfig={colorConfig}>
                  <option value="opname_awal">Stok Opname Awal / Adjustment Gudang</option>
                  <option value="pembelian">Hasil Pembelian / Kiriman Supplier</option>
                </Select>
              </Field>

              {sourceType === "pembelian" ? (
                <Field label="Pilih Supplier / PBF Vendor" colorConfig={colorConfig}>
                  <Select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} colorConfig={colorConfig}>
                    <option value="">-- Tanpa Supplier Terikat --</option>
                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Keterangan" colorConfig={colorConfig}>
                  <TextInput value="Stok Awal Sistem / Stock Opname" readOnly className="!bg-gray-100 font-mono text-xs" colorConfig={colorConfig} />
                </Field>
              )}
            </div>

            <Field label="Upload File CSV Data Batch Stok" colorConfig={colorConfig}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv, .txt"
                onChange={handleFileUpload}
                className="w-full text-xs p-2 border rounded-lg bg-white"
                style={{ borderColor: colorConfig?.border }}
              />
            </Field>

            {parsedData.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: colorConfig?.primary }}>
                  Preview Data Opname yang Akan Di-import ({parsedData.length} Baris):
                </div>
                <div className="max-h-56 overflow-y-auto border rounded-lg" style={{ borderColor: colorConfig?.border }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-left border-b font-mono">
                        <th className="p-2">Status Produk</th>
                        <th className="p-2">No Batch</th>
                        <th className="p-2">Exp Date</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Harga Beli</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.map((d, idx) => (
                        <tr key={idx} className={`border-b ${!d.isValid ? 'bg-red-50' : ''}`}>
                          <td className="p-2">
                            {d.isValid ? (
                              <span className="text-emerald-700 font-semibold">{findName(products, d.productId)}</span>
                            ) : (
                              <span className="text-red-600 font-semibold">❌ Tidak Cocok: "{d.rawProductName}"</span>
                            )}
                          </td>
                          <td className="p-2 font-mono">{d.batchNo}</td>
                          <td className="p-2 font-mono">{fmtDate(d.expiryDate)}</td>
                          <td className="p-2 font-mono font-bold">{d.qty}</td>
                          <td className="p-2 font-mono">{fmtIDR(d.costPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: colorConfig?.border }}>
              <Button variant="ghost" onClick={() => setModalImport(false)} colorConfig={colorConfig}>Batal</Button>
              <Button onClick={submitImport} disabled={parsedData.length === 0} colorConfig={colorConfig}>
                Proses & Import Batch Stok
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}