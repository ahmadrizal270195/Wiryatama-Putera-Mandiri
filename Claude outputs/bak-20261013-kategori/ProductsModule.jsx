import React, { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Eyebrow, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { qaClassOf, QA_CLASSES } from "../qa";

const CATEGORIES = ["Dental Material", "Alat Kesehatan", "Obat Generik", "Obat Paten", "Consumables"];

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
        <Button onClick={openNew} colorConfig={colorConfig}><Plus size={15} /> Tambah Produk</Button>
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
    </div>
  );
}