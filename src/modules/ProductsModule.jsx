import React, { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Eyebrow, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { qaClassOf, QA_CLASSES } from "../qa";
import { KATEGORI_OBAT_WPM } from "../data/kategoriObatWPM";

// Normalisasi nama buat dicocokkan: huruf kecil, tanpa spasi & tanda baca
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Cocokkan produk di aplikasi dengan Daftar Obat WPM (Excel 13 Okt 2026).
// 1) nama sama persis (abaikan spasi/tanda baca)  2) nama mirip: salah satu mengandung yang lain & cuma 1 kandidat
function buildKategoriPlan(products) {
  const list = KATEGORI_OBAT_WPM.map((r) => ({ ...r, key: normName(r.name) }));
  const usedExcel = new Set();
  const rows = [];
  (products || []).forEach((p) => {
    const k = normName(p.name);
    if (!k) return;
    let hit = list.find((r) => r.key === k);
    let match = "persis";
    if (!hit) {
      const cand = list.filter((r) => r.key.length >= 4 && k.length >= 4 && (k.includes(r.key) || r.key.includes(k)));
      if (cand.length === 1) { hit = cand[0]; match = "mirip"; }
    }
    if (!hit) return;
    usedExcel.add(hit.key);
    rows.push({ product: p, excel: hit, match, changed: p.category !== hit.category });
  });
  const notFound = list.filter((r) => !usedExcel.has(r.key));
  const matchedIds = new Set(rows.map((r) => r.product.id));
  const oldObatLeft = (products || []).filter((p) => !matchedIds.has(p.id) && /^obat (generik|paten)$/i.test(String(p.category || "").trim()));
  return { rows, notFound, oldObatLeft };
}

const CATEGORIES = ["Dental Material", "Alat Kesehatan", "Obat Bebas", "Obat Keras", "Consumables"];

// Badge penanggung jawab CDOB (APJ untuk obat, PJT untuk alkes)
function PJBadge({ product, colorConfig }) {
  const cls = qaClassOf(product);
  const manual = product.qaClass === "obat" || product.qaClass === "alkes";
  const isObat = cls === "obat";
  const fg = isObat ? (colorConfig?.warn || "#D97706") : (colorConfig?.accent || "#10B981");
  const bg = isObat ? (colorConfig?.warnSoft || "#FFFBEB") : (colorConfig?.primarySoft || "#ECFDF5");
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ background: bg, color: fg }}
      title={manual ? "Diatur manual di produk ini" : "Otomatis dari kategori"}>
      {QA_CLASSES[cls].role} {QA_CLASSES[cls].label}{manual ? " · manual" : ""}
    </span>
  );
}

export default function ProductsView({ products, save, stockByProduct, notify, colorConfig, uid, fmtIDR }) {
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "", qaClass: "" });
  const [pjFilter, setPjFilter] = useState("ALL"); // ALL | obat | alkes | manual
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Terapkan kategori dari Daftar Obat WPM
  const [katPlan, setKatPlan] = useState(null);
  const [katPick, setKatPick] = useState(() => new Set());
  const [katBusy, setKatBusy] = useState(false);

  function openKategoriPlan() {
    const plan = buildKategoriPlan(products);
    setKatPlan(plan);
    setKatPick(new Set(plan.rows.filter((r) => r.changed).map((r) => r.product.id)));
  }

  async function applyKategoriPlan() {
    if (!katPlan || katPick.size === 0) return;
    if (!confirm(`Ubah kategori ${katPick.size} produk sesuai Daftar Obat WPM?`)) return;
    setKatBusy(true);
    try {
      const byId = {};
      katPlan.rows.forEach((r) => { if (katPick.has(r.product.id)) byId[r.product.id] = r.excel.category; });
      await save((products || []).map((p) => (byId[p.id] ? { ...p, category: byId[p.id] } : p)));
      notify(`Kategori ${Object.keys(byId).length} produk diperbarui sesuai Daftar Obat WPM`);
      setKatPlan(null);
    } finally {
      setKatBusy(false);
    }
  }

  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  function openNew() { setForm({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "", qaClass: "" }); setModal("new"); }
  function openEdit(p) { setForm({ qaClass: "", ...p }); setModal(p.id); }

  // Ubah kelas CDOB banyak produk sekaligus ("" = otomatis ikut kategori)
  async function bulkSetClass(qaClass) {
    if (selected.size === 0) return;
    const label = qaClass ? `${QA_CLASSES[qaClass].label} (${QA_CLASSES[qaClass].role})` : "Otomatis (ikut kategori)";
    if (!confirm(`Ubah penanggung jawab ${selected.size} produk menjadi ${label}?\n\nTransaksi yang sudah dibuat tidak ikut berubah. Aturan baru berlaku untuk transaksi berikutnya.`)) return;
    setBulkBusy(true);
    try {
      await save((products || []).map((p) => (selected.has(p.id) ? { ...p, qaClass } : p)));
      notify(`${selected.size} produk diubah ke ${label}`);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  async function submit() {
    if (!form.name.trim()) return notify("Nama produk wajib diisi", "danger");
    const payload = { ...form, sellPrice: Number(form.sellPrice) || 0, minStock: Number(form.minStock) || 0 };
    if (modal === "new") {
      await save([...(products || []), { ...payload, id: uid() }]);
      notify("Produk ditambahkan");
    } else {
      await save((products || []).map((p) => (p.id === modal ? { ...payload, id: p.id } : p)));
      notify("Produk diperbarui");
    }
    setModal(null);
  }

  async function remove(id) {
    await save((products || []).filter((p) => p.id !== id));
    notify("Produk dihapus");
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedAndFiltered = useMemo(() => {
    let list = (products || []).filter((p) => 
      (p.name.toLowerCase().includes(q.toLowerCase()) || 
      (p.category || "").toLowerCase().includes(q.toLowerCase())) &&
      (pjFilter === "ALL" ||
        (pjFilter === "manual" ? (p.qaClass === "obat" || p.qaClass === "alkes") : qaClassOf(p) === pjFilter))
    );

    return list.sort((a, b) => {
      let valA, valB;
      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "category") {
        valA = a.category.toLowerCase();
        valB = b.category.toLowerCase();
      } else if (sortField === "stock") {
        valA = stockByProduct[a.id]?.qty || 0;
        valB = stockByProduct[b.id]?.qty || 0;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, q, sortField, sortOrder, stockByProduct, pjFilter]);

  const pjCounts = useMemo(() => {
    const c = { ALL: 0, obat: 0, alkes: 0, manual: 0 };
    for (const p of products || []) {
      c.ALL++;
      c[qaClassOf(p)]++;
      if (p.qaClass === "obat" || p.qaClass === "alkes") c.manual++;
    }
    return c;
  }, [products]);

  const allVisibleSelected = sortedAndFiltered.length > 0 && sortedAndFiltered.every((p) => selected.has(p.id));
  function toggleOne(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) sortedAndFiltered.forEach((p) => next.delete(p.id));
    else sortedAndFiltered.forEach((p) => next.add(p.id));
    setSelected(next);
  }

  function renderSortIcon(field) {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return sortOrder === "asc" ? <span className="ml-1 text-emerald-900 font-bold">↑</span> : <span className="ml-1 text-emerald-900 font-bold">↓</span>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div><Eyebrow>Master data</Eyebrow><h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Produk</h2></div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={openKategoriPlan} variant="ghost" colorConfig={colorConfig}>Terapkan Daftar Obat</Button>
          <Button onClick={openNew} colorConfig={colorConfig}><Plus size={15} /> Tambah Produk</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
          <TextInput placeholder="Cari produk / kategori..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" colorConfig={colorConfig} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { id: "ALL", label: "Semua" },
            { id: "obat", label: "APJ Obat" },
            { id: "alkes", label: "PJT Alkes" },
            { id: "manual", label: "Diatur manual" },
          ].map((f) => (
            <button key={f.id} onClick={() => setPjFilter(f.id)} className="px-2.5 py-1 rounded-md text-xs font-medium border"
              style={{ background: pjFilter === f.id ? colorConfig?.primary : "transparent", color: pjFilter === f.id ? "#fff" : colorConfig?.inkSoft, borderColor: pjFilter === f.id ? colorConfig?.primary : colorConfig?.border }}>
              {f.label} ({pjCounts[f.id]})
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: colorConfig?.primarySoft, color: colorConfig?.ink }}>
          <b>{selected.size} produk dipilih</b>
          <span style={{ color: colorConfig?.inkSoft }}>Ubah penanggung jawab jadi:</span>
          <button disabled={bulkBusy} onClick={() => bulkSetClass("obat")} className="px-2.5 py-1 rounded-md font-semibold text-white disabled:opacity-50" style={{ background: colorConfig?.warn || "#D97706" }}>Obat (APJ)</button>
          <button disabled={bulkBusy} onClick={() => bulkSetClass("alkes")} className="px-2.5 py-1 rounded-md font-semibold text-white disabled:opacity-50" style={{ background: colorConfig?.accent || "#10B981" }}>Alkes (PJT)</button>
          <button disabled={bulkBusy} onClick={() => bulkSetClass("")} className="px-2.5 py-1 rounded-md font-semibold border disabled:opacity-50" style={{ borderColor: colorConfig?.border, color: colorConfig?.ink }}>Otomatis</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto underline" style={{ color: colorConfig?.inkSoft }}>Batal pilih</button>
        </div>
      )}
      
      <ResponsiveTable minWidth={900} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            <th className="pl-4 pr-1 py-2 w-8">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} title="Pilih semua yang tampil" style={{ accentColor: colorConfig?.primary }} />
            </th>
            <th onClick={() => handleSort("name")} className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Nama {renderSortIcon("name")}</th>
            <th onClick={() => handleSort("category")} className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Kategori {renderSortIcon("category")}</th>
            <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>Penanggung Jawab</th>
            <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>Satuan</th>
            <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>Harga Jual</th>
            <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}>Min Stok</th>
            <th onClick={() => handleSort("stock")} className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Stok Saat Ini {renderSortIcon("stock")}</th>
            <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: colorConfig?.primary }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedAndFiltered.map((p) => {
            const s = stockByProduct[p.id] || { qty: 0 };
            return (
              <tr key={p.id} style={{ borderTop: `1px solid ${colorConfig?.border}`, background: selected.has(p.id) ? colorConfig?.primarySoft : undefined }}>
                <td className="pl-4 pr-1 py-2.5">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} style={{ accentColor: colorConfig?.primary }} />
                </td>
                <td className="px-4 py-2.5 font-medium" style={{ color: colorConfig?.ink }}>{p.name}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.inkSoft }}>{p.category}</td>
                <td className="px-4 py-2.5"><PJBadge product={p} colorConfig={colorConfig} /></td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{p.unit}</td>
                <td className="px-4 py-2.5 tabular-nums" style={{ color: colorConfig?.ink }}>{fmtIDR(p.sellPrice)}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: colorConfig?.inkSoft }}>{p.minStock}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={s.qty < p.minStock ? "warn" : s.qty === 0 ? "danger" : "good"} colorConfig={colorConfig}>{s.qty} {p.unit}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(p)} className="text-xs mr-3 font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                  <button onClick={() => remove(p.id)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.danger }}>Hapus</button>
                </td>
              </tr>
            );
          })}
          {sortedAndFiltered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada produk yang cocok.</td></tr>}
        </tbody>
      </ResponsiveTable>

      {modal && (
        <Modal title={modal === "new" ? "Tambah Produk" : "Edit Produk"} onClose={() => setModal(null)} colorConfig={colorConfig}>
          <Field label="Nama produk" colorConfig={colorConfig}><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} colorConfig={colorConfig} /></Field>
          <Field label="Kategori" colorConfig={colorConfig}>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} colorConfig={colorConfig}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              {/* Kategori lama (mis. Obat Generik / Obat Paten) tetap tampil biar nggak ketimpa diam-diam */}
              {form.category && !CATEGORIES.includes(form.category) && <option value={form.category}>{form.category} (kategori lama)</option>}
            </Select>
          </Field>
          <Field label="Penanggung jawab (Kelas CDOB)" colorConfig={colorConfig}>
            <Select value={form.qaClass || ""} onChange={(e) => setForm({ ...form, qaClass: e.target.value })} colorConfig={colorConfig}>
              <option value="">Otomatis ikut kategori · saat ini {QA_CLASSES[qaClassOf({ category: form.category })].role} {QA_CLASSES[qaClassOf({ category: form.category })].label}</option>
              <option value="obat">Obat · direview APJ</option>
              <option value="alkes">Alkes · direview PJT</option>
            </Select>
            <p className="text-[11px] mt-1" style={{ color: colorConfig?.inkSoft }}>
              Pakai ini kalau produknya obat tapi masuk kategori Dental Material (mis. anestesi lokal).
            </p>
          </Field>
          <Field label="Satuan (mis. box, strip, pcs)" colorConfig={colorConfig}><TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} colorConfig={colorConfig} /></Field>
          <Field label="Harga jual (per satuan)" colorConfig={colorConfig}><TextInput type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} colorConfig={colorConfig} /></Field>
          <Field label="Stok minimum (alert)" colorConfig={colorConfig}><TextInput type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} colorConfig={colorConfig} /></Field>
          <Button onClick={submit} className="w-full justify-center mt-2" colorConfig={colorConfig}>Simpan</Button>
        </Modal>
      )}

      {katPlan && (() => {
        const changes = katPlan.rows.filter((r) => r.changed);
        const same = katPlan.rows.length - changes.length;
        const cell = { padding: "5px 8px", fontSize: 12, borderTop: `1px solid ${colorConfig?.border || "#e2e8f0"}` };
        return (
          <Modal title="Terapkan Kategori dari Daftar Obat WPM" onClose={() => setKatPlan(null)} wide colorConfig={colorConfig}>
            <p className="text-xs mb-3" style={{ color: colorConfig?.inkSoft }}>
              Sumber: Daftar Obat PT WPM (Excel 13 Okt 2026, {KATEGORI_OBAT_WPM.length} obat). Golongan ikut kode NIE BPOM, Obat Bebas Terbatas digabung ke Obat Bebas.
              Cuma kategori yang diubah. Data lain & transaksi nggak kesentuh.
            </p>
            <div className="text-xs mb-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: colorConfig?.ink }}>
              <span><b>{changes.length}</b> produk akan diubah</span>
              <span><b>{same}</b> sudah sesuai</span>
              <span><b>{katPlan.notFound.length}</b> nama di Excel nggak ketemu di Produk</span>
              <span><b>{katPlan.oldObatLeft.length}</b> produk Obat Generik/Paten nggak ada di Excel</span>
            </div>

            {changes.length > 0 && (
              <div className="max-h-72 overflow-y-auto border rounded-lg mb-3" style={{ borderColor: colorConfig?.border }}>
                <table className="w-full">
                  <thead><tr style={{ background: colorConfig?.primarySoft }}>
                    <th style={{ ...cell, borderTop: "none", width: 28 }}>
                      <input type="checkbox" checked={katPick.size === changes.length} onChange={(e) => setKatPick(e.target.checked ? new Set(changes.map((r) => r.product.id)) : new Set())} />
                    </th>
                    {["Produk di aplikasi", "Nama di Excel", "Kategori lama", "Kategori baru"].map((h) => <th key={h} style={{ ...cell, borderTop: "none", textAlign: "left", color: colorConfig?.primary }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {changes.map((r) => (
                      <tr key={r.product.id}>
                        <td style={cell}><input type="checkbox" checked={katPick.has(r.product.id)} onChange={() => setKatPick((prev) => { const n = new Set(prev); n.has(r.product.id) ? n.delete(r.product.id) : n.add(r.product.id); return n; })} /></td>
                        <td style={{ ...cell, color: colorConfig?.ink }}>{r.product.name}</td>
                        <td style={{ ...cell, color: colorConfig?.inkSoft }}>
                          {r.excel.name}
                          {r.match === "mirip" && <span className="ml-1 text-[10px] font-bold" style={{ color: "#B45309" }}>nama mirip, cek</span>}
                          {r.excel.note && <div className="text-[10px]" style={{ color: "#B45309" }}>{r.excel.note}</div>}
                        </td>
                        <td style={{ ...cell, color: colorConfig?.inkSoft }}>{r.product.category || "-"}</td>
                        <td style={{ ...cell, fontWeight: 700, color: r.excel.category === "Obat Keras" ? "#DC2626" : "#047857" }}>{r.excel.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {katPlan.oldObatLeft.length > 0 && (
              <details className="mb-2 text-xs" style={{ color: colorConfig?.ink }}>
                <summary className="cursor-pointer font-semibold">Produk Obat Generik/Paten yang nggak ada di Excel ({katPlan.oldObatLeft.length}), edit manual</summary>
                <ul className="mt-1 ml-4 list-disc" style={{ color: colorConfig?.inkSoft }}>{katPlan.oldObatLeft.map((p) => <li key={p.id}>{p.name} · {p.category}</li>)}</ul>
              </details>
            )}
            {katPlan.notFound.length > 0 && (
              <details className="mb-3 text-xs" style={{ color: colorConfig?.ink }}>
                <summary className="cursor-pointer font-semibold">Nama di Excel yang nggak ketemu di Produk ({katPlan.notFound.length})</summary>
                <ul className="mt-1 ml-4 list-disc" style={{ color: colorConfig?.inkSoft }}>{katPlan.notFound.map((r) => <li key={r.key}>{r.name} → {r.category}</li>)}</ul>
              </details>
            )}

            <Button onClick={applyKategoriPlan} disabled={katBusy || katPick.size === 0} className="w-full justify-center" colorConfig={colorConfig}>
              {katBusy ? "Menyimpan..." : `Terapkan ke ${katPick.size} produk`}
            </Button>
          </Modal>
        );
      })()}
    </div>
  );
}