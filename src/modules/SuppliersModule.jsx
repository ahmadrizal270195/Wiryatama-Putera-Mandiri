import React, { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Eyebrow, Card, Button, Modal, Field, TextInput, Select } from "../components/UIComponents";

export default function SuppliersView({ suppliers, pos, pInvoices, save, notify, colorConfig, uid }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", category: "PBF", npwp: "", contact: "", address: "" });
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("name_asc");

  // Daftar supplier: dicari (nama, kategori, NPWP, kontak, alamat) lalu diurutkan
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rank = new Map((suppliers || []).map((x, i) => [x.id, i]));
    const list = (suppliers || []).filter((x) => {
      if (catFilter !== "ALL" && (x.category || "PBF") !== catFilter) return false;
      const hay = [x.name, x.category || "PBF", x.npwp, x.contact, x.address].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base", numeric: true });
    return list.sort((a, b) => {
      if (sortBy === "name_desc") return byName(b, a);
      if (sortBy === "newest") return (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0);
      if (sortBy === "category") return String(a.category || "PBF").localeCompare(String(b.category || "PBF"), "id") || byName(a, b);
      return byName(a, b);
    });
  }, [suppliers, q, catFilter, sortBy]);

  function openNew() {
    setForm({ name: "", category: "PBF", npwp: "", contact: "", address: "" });
    setModal("new");
  }

  function openEdit(s) {
    setForm(s);
    setModal(s.id);
  }

  async function submit() {
    if (!form.name.trim()) return notify("Nama supplier wajib diisi", "danger");
    if (modal === "new") {
      await save([...(suppliers || []), { ...form, id: uid() }]);
      notify("Supplier ditambahkan");
    } else {
      await save((suppliers || []).map((s) => (s.id === modal ? { ...form, id: s.id } : s)));
      notify("Supplier diperbarui");
    }
    setModal(null);
  }

  async function remove(id) {
    const hasPO = (pos || []).some((p) => p.supplierId === id);
    const hasPInv = (pInvoices || []).some((inv) => inv.supplierId === id);

    if (hasPO || hasPInv) {
      return notify("Gagal Hapus: Supplier ini sudah memiliki riwayat transaksi (PO / Faktur Pembelian)!", "danger");
    }

    if (!confirm("Hapus supplier ini?")) return;
    await save((suppliers || []).filter((s) => s.id !== id));
    notify("Supplier berhasil dihapus");
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <Eyebrow>Master data</Eyebrow>
          <h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Supplier / PBF</h2>
        </div>
        <Button onClick={openNew} colorConfig={colorConfig}>
          <Plus size={15} /> Tambah Supplier
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
          <TextInput placeholder="Cari nama, NPWP, kontak, alamat..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" colorConfig={colorConfig} />
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-full sm:w-52" colorConfig={colorConfig}>
          <option value="ALL">Semua Kategori</option>
          <option value="PBF">PBF (Obat)</option>
          <option value="Alkes">Distributor Alkes</option>
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full sm:w-48" colorConfig={colorConfig}>
          <option value="name_asc">Nama A–Z</option>
          <option value="name_desc">Nama Z–A</option>
          <option value="category">Per Kategori</option>
          <option value="newest">Terakhir Ditambah</option>
        </Select>
        <span className="text-xs sm:ml-auto" style={{ color: colorConfig?.inkSoft }}>{shown.length} dari {(suppliers || []).length} supplier</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.length === 0 && (
          <div className="text-sm py-8 text-center md:col-span-2" style={{ color: colorConfig?.inkSoft }}>
            {(suppliers || []).length === 0 ? "Belum ada supplier." : `Nggak ada supplier yang cocok dengan "${q}".`}
          </div>
        )}
        {shown.map((s) => (
          <Card key={s.id} colorConfig={colorConfig}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: colorConfig?.ink }}>{s.name}</div>
                <div className="text-[11px] tabular-nums text-emerald-700 font-medium mt-0.5">Kategori: {s.category || "PBF"}</div>
                {s.npwp && <div className="text-[11px] tabular-nums text-emerald-700 font-medium">NPWP: {s.npwp}</div>}
                <div className="text-xs mt-1" style={{ color: colorConfig?.inkSoft }}>{s.contact}</div>
                <div className="text-xs" style={{ color: colorConfig?.inkSoft }}>{s.address}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(s)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                <button onClick={() => remove(s.id)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.danger }}>Hapus</button>
              </div>
            </div>
          </Card>
        ))}
        {(suppliers || []).length === 0 && (
          <div className="text-sm py-8 col-span-2 text-center" style={{ color: colorConfig?.inkSoft }}>Belum ada supplier.</div>
        )}
      </div>

      {modal && (
        <Modal title={modal === "new" ? "Tambah Supplier" : "Edit Supplier"} onClose={() => setModal(null)} colorConfig={colorConfig}>
          <Field label="Nama supplier / PBF" colorConfig={colorConfig}>
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} colorConfig={colorConfig} />
          </Field>
          <Field label="Kategori Vendor" colorConfig={colorConfig}>
            <Select value={form.category || "PBF"} onChange={(e) => setForm({ ...form, category: e.target.value })} colorConfig={colorConfig}>
              <option value="PBF">PBF (Pedagang Besar Farmasi / Obat)</option>
              <option value="Alkes">Distributor Alkes (Alat Kesehatan)</option>
            </Select>
          </Field>
          <Field label="NPWP Vendor (opsional)" colorConfig={colorConfig}>
            <TextInput placeholder="Contoh: 01.234.567.8-012.000" value={form.npwp || ""} onChange={(e) => setForm({ ...form, npwp: e.target.value })} colorConfig={colorConfig} />
          </Field>
          <Field label="Kontak (telp/email)" colorConfig={colorConfig}>
            <TextInput value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} colorConfig={colorConfig} />
          </Field>
          <Field label="Alamat" colorConfig={colorConfig}>
            <TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} colorConfig={colorConfig} />
          </Field>
          <Button onClick={submit} className="w-full justify-center mt-2" colorConfig={colorConfig}>Simpan</Button>
        </Modal>
      )}
    </div>
  );
}
