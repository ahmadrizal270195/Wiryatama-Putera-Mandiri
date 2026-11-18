import React, { useState, useMemo } from "react";
import { Plus, Download, Search } from "lucide-react";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select } from "../components/UIComponents";

const CUSTOMER_TYPES = ["Apotek", "Rumah Sakit", "Klinik", "Individu/Dokter Pribadi", "Distributor Lain"];

export default function CustomersView({ customers, sos, invoices, save, notify, colorConfig, uid, todayISO }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: CUSTOMER_TYPES[0], npwp: "", contact: "", address: "" });
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("name_asc");

  // Daftar pelanggan: dicari (nama, tipe, NPWP, kontak, alamat) lalu diurutkan
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rank = new Map((customers || []).map((c, i) => [c.id, i]));
    const list = (customers || []).filter((c) => {
      if (typeFilter !== "ALL" && c.type !== typeFilter) return false;
      const hay = [c.name, c.type, c.npwp, c.contact, c.address].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base", numeric: true });
    return list.sort((a, b) => {
      if (sortBy === "name_desc") return byName(b, a);
      if (sortBy === "newest") return (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0);
      if (sortBy === "type") return String(a.type || "").localeCompare(String(b.type || ""), "id") || byName(a, b);
      return byName(a, b);
    });
  }, [customers, q, typeFilter, sortBy]);

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
    form.maxInvoiceAmount = Number(form.maxInvoiceAmount) > 0 ? Number(form.maxInvoiceAmount) : 0;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-2.5" color={colorConfig?.inkSoft} />
          <TextInput placeholder="Cari nama, NPWP, kontak, alamat..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" colorConfig={colorConfig} />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full sm:w-52" colorConfig={colorConfig}>
          <option value="ALL">Semua Tipe</option>
          {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full sm:w-48" colorConfig={colorConfig}>
          <option value="name_asc">Nama A–Z</option>
          <option value="name_desc">Nama Z–A</option>
          <option value="type">Per Tipe</option>
          <option value="newest">Terakhir Ditambah</option>
        </Select>
        <span className="text-xs sm:ml-auto" style={{ color: colorConfig?.inkSoft }}>{shown.length} dari {(customers || []).length} pelanggan</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.length === 0 && (
          <div className="text-sm py-8 text-center md:col-span-2" style={{ color: colorConfig?.inkSoft }}>
            {(customers || []).length === 0 ? "Belum ada pelanggan." : `Nggak ada pelanggan yang cocok dengan "${q}".`}
          </div>
        )}
        {shown.map((c) => (
          <Card key={c.id} colorConfig={colorConfig}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm" style={{ color: colorConfig?.ink }}>{c.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge tone="neutral" colorConfig={colorConfig}>{c.type}</Badge>
                  {c.npwp && <span className="text-[11px] tabular-nums text-emerald-700 font-medium">NPWP: {c.npwp}</span>}
                  {Number(c.maxInvoiceAmount) > 0 && <span className="text-[11px] tabular-nums font-medium" style={{ color: colorConfig?.warn || "#D97706" }}>Maks/faktur: Rp{Number(c.maxInvoiceAmount).toLocaleString("id-ID")}</span>}
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
          <Field label="Maks nilai per faktur (Rp, opsional)" colorConfig={colorConfig}>
            <TextInput type="number" placeholder="Contoh: 50000000 · kosongkan kalau nggak ada batas" value={form.maxInvoiceAmount || ""} onChange={(e) => setForm({ ...form, maxInvoiceAmount: e.target.value })} colorConfig={colorConfig} />
            <p className="text-[11px] mt-1" style={{ color: colorConfig?.inkSoft }}>Kalau diisi, sistem ngingetin waktu faktur ke pelanggan ini lewat batas, dan bisa dipecah pakai tombol Pecah Faktur.</p>
          </Field>
          <Button onClick={submit} className="w-full justify-center mt-2" colorConfig={colorConfig}>Simpan</Button>
        </Modal>
      )}
    </div>
  );
}
