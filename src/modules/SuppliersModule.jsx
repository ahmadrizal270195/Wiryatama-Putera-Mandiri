import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Eyebrow, Card, Button, Modal, Field, TextInput, Select } from "../components/UIComponents";

export default function SuppliersView({ suppliers, pos, pInvoices, save, notify, colorConfig, uid }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", category: "PBF", npwp: "", contact: "", address: "" });

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <Eyebrow>Master data</Eyebrow>
          <h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Supplier / PBF</h2>
        </div>
        <Button onClick={openNew} colorConfig={colorConfig}>
          <Plus size={15} /> Tambah Supplier
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(suppliers || []).map((s) => (
          <Card key={s.id} colorConfig={colorConfig}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: colorConfig?.ink }}>{s.name}</div>
                <div className="text-[11px] font-mono text-teal-700 font-medium mt-0.5">Kategori: {s.category || "PBF"}</div>
                {s.npwp && <div className="text-[11px] font-mono text-teal-700 font-medium">NPWP: {s.npwp}</div>}
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