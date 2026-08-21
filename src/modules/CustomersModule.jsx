import React, { useState } from "react";
import { Plus, Download } from "lucide-react";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select } from "../components/UIComponents";

const CUSTOMER_TYPES = ["Apotek", "Rumah Sakit", "Klinik", "Individu/Dokter Pribadi", "Distributor Lain"];

export default function CustomersView({ customers, sos, invoices, save, notify, colorConfig, uid, todayISO }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: CUSTOMER_TYPES[0], npwp: "", contact: "", address: "" });

  function openNew() {
    setForm({ name: "", type: CUSTOMER_TYPES[0], npwp: "", contact: "", address: "" });
    setModal("new");
  }

  function openEdit(c) {
    setForm(c);
    setModal(c.id);
  }

  async function submit() {
    if (!form.name.trim()) return notify("Nama pelanggan wajib diisi", "danger");
    if (modal === "new") {
      await save([...(customers || []), { ...form, id: uid() }]);
      notify("Pelanggan ditambahkan");
    } else {
      await save((customers || []).map((c) => (c.id === modal ? { ...form, id: c.id } : c)));
      notify("Pelanggan diperbarui");
    }
    setModal(null);
  }

  async function remove(id) {
    const hasSO = (sos || []).some((so) => so.customerId === id);
    const hasInvoice = (invoices || []).some((inv) => inv.customerId === id);

    if (hasSO || hasInvoice) {
      return notify(
        "Gagal Hapus: Pelanggan ini sudah memiliki riwayat transaksi (SO / Faktur). Data tidak boleh dihapus demi integritas laporan!",
        "danger"
      );
    }

    if (!confirm("Apakah Anda yakin ingin menghapus pelanggan ini?")) return;

    await save((customers || []).filter((c) => c.id !== id));
    notify("Pelanggan berhasil dihapus");
  }

  function exportCustomersToExcel() {
    if (!customers || customers.length === 0) {
      return notify("Belum ada data pelanggan untuk di-export", "warn");
    }

    const headers = ["ID Pelanggan", "Nama Pelanggan", "Tipe Pelanggan", "NPWP", "Kontak", "Alamat"];
    const rows = customers.map((c) => [
      `"${c.id || ""}"`,
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.type || "").replace(/"/g, '""')}"`,
      `"${(c.npwp || "").replace(/"/g, '""')}"`,
      `"${(c.contact || "").replace(/"/g, '""')}"`,
      `"${(c.address || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Data_Pelanggan_PT_WPM_${todayISO ? todayISO() : "EXPORT"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify("Database pelanggan berhasil di-export ke Excel");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <Eyebrow>Master data</Eyebrow>
          <h2 className="text-xl font-semibold" style={{ color: colorConfig?.ink }}>Pelanggan</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCustomersToExcel} variant="secondary" colorConfig={colorConfig}>
            <Download size={15} /> Export / Tarik Excel
          </Button>
          <Button onClick={openNew} colorConfig={colorConfig}>
            <Plus size={15} /> Tambah Pelanggan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(customers || []).map((c) => (
          <Card key={c.id} colorConfig={colorConfig}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: colorConfig?.ink }}>{c.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge tone="neutral" colorConfig={colorConfig}>{c.type}</Badge>
                  {c.npwp && <span className="text-[11px] font-mono text-teal-700 font-medium">NPWP: {c.npwp}</span>}
                </div>
                <div className="text-xs mt-1" style={{ color: colorConfig?.inkSoft }}>{c.contact}</div>
                <div className="text-xs" style={{ color: colorConfig?.inkSoft }}>{c.address}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEdit(c)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.accent }}>Edit</button>
                <button onClick={() => remove(c.id)} className="text-xs font-medium cursor-pointer" style={{ color: colorConfig?.danger }}>Hapus</button>
              </div>
            </div>
          </Card>
        ))}
        {(customers || []).length === 0 && (
          <div className="text-sm py-8 col-span-2 text-center" style={{ color: colorConfig?.inkSoft }}>Belum ada pelanggan.</div>
        )}
      </div>

      {modal && (
        <Modal title={modal === "new" ? "Tambah Pelanggan" : "Edit Pelanggan"} onClose={() => setModal(null)} colorConfig={colorConfig}>
          <Field label="Nama pelanggan" colorConfig={colorConfig}>
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} colorConfig={colorConfig} />
          </Field>
          <Field label="Tipe" colorConfig={colorConfig}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} colorConfig={colorConfig}>
              {CUSTOMER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="NPWP Pelanggan (opsional)" colorConfig={colorConfig}>
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