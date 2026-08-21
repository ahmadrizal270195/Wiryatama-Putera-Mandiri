import React, { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Eyebrow, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";

const CATEGORIES = ["Dental Material", "Alat Kesehatan", "Obat Generik", "Obat Paten", "Consumables"];

export default function ProductsView({ products, save, stockByProduct, notify, colorConfig, uid, fmtIDR }) {
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "" });

  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  function openNew() { setForm({ name: "", category: CATEGORIES[0], unit: "box", sellPrice: "", minStock: "" }); setModal("new"); }
  function openEdit(p) { setForm(p); setModal(p.id); }

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
      p.name.toLowerCase().includes(q.toLowerCase()) || 
      p.category.toLowerCase().includes(q.toLowerCase())
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
  }, [products, q, sortField, sortOrder, stockByProduct]);

  function renderSortIcon(field) {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return sortOrder === "asc" ? <span className="ml-1 text-teal-900 font-bold">↑</span> : <span className="ml-1 text-teal-900 font-bold">↓</span>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><Eyebrow>Master data</Eyebrow><h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Produk</h2></div>
        <Button onClick={openNew} colorConfig={colorConfig}><Plus size={15} /> Tambah Produk</Button>
      </div>
      <div className="relative mb-3 max-w-xs">
        <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
        <TextInput placeholder="Cari produk / kategori..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" colorConfig={colorConfig} />
      </div>
      
      <ResponsiveTable minWidth={750} colorConfig={colorConfig}>
        <thead>
          <tr style={{ background: colorConfig?.primarySoft }}>
            <th onClick={() => handleSort("name")} className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Nama {renderSortIcon("name")}</th>
            <th onClick={() => handleSort("category")} className="text-left px-4 py-2 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" style={{ color: colorConfig?.primary }}>Kategori {renderSortIcon("category")}</th>
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
              <tr key={p.id} style={{ borderTop: `1px solid ${colorConfig?.border}` }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: colorConfig?.ink }}>{p.name}</td>
                <td className="px-4 py-2.5" style={{ color: colorConfig?.inkSoft }}>{p.category}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{p.unit}</td>
                <td className="px-4 py-2.5 font-mono" style={{ color: colorConfig?.ink }}>{fmtIDR(p.sellPrice)}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colorConfig?.inkSoft }}>{p.minStock}</td>
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
          {sortedAndFiltered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: colorConfig?.inkSoft }}>Belum ada produk yang cocok.</td></tr>}
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
          <Field label="Satuan (mis. box, strip, pcs)" colorConfig={colorConfig}><TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} colorConfig={colorConfig} /></Field>
          <Field label="Harga jual (per satuan)" colorConfig={colorConfig}><TextInput type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} colorConfig={colorConfig} /></Field>
          <Field label="Stok minimum (alert)" colorConfig={colorConfig}><TextInput type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} colorConfig={colorConfig} /></Field>
          <Button onClick={submit} className="w-full justify-center mt-2" colorConfig={colorConfig}>Simpan</Button>
        </Modal>
      )}
    </div>
  );
}