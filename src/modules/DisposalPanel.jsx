import React, { useMemo, useState } from "react";
import { Plus, Trash2, Printer, Flame, Search } from "lucide-react";
import { Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import { PrintArea, DocHeader, DocTable, SignatureRow } from "../print";

// =====================================================================
//  PEMUSNAHAN BARANG + BERITA ACARA PEMUSNAHAN (CDOB)
//  Data: erp-disposals = [{ id, noBA, date, place, method, reason, note,
//          items: [{ batchId, productId, batchNo, expiryDate, qty, costPrice }],
//          witnesses: { pj, pjRole, saksi1, saksi1Role, saksi2, saksi2Role }, createdAt }]
//  Simpan  -> qty batch berkurang.  Batalkan -> qty batch dikembalikan.
// =====================================================================

const METHODS = [
  "Dibakar (insinerasi)",
  "Dihancurkan lalu dibuang / ditimbun",
  "Diserahkan ke pihak ketiga pengelola limbah berizin",
  "Lainnya",
];
const REASONS = ["Kedaluwarsa (ED)", "Rusak / cacat", "Penarikan (recall)", "Lainnya"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const emptyForm = (noBA, date) => ({
  noBA, date, place: "Gudang PT Wiryatama Putera Mandiri", method: METHODS[0], reason: REASONS[0], note: "",
  witnesses: { pj: "", pjRole: "Apoteker Penanggung Jawab (APJ)", saksi1: "", saksi1Role: "Kepala Gudang", saksi2: "", saksi2Role: "" },
});

export default function DisposalPanel({
  products, batches, saveBatches, disposals, saveDisposals, notify, uid, todayISO, fmtDate, fmtIDR, colorConfig: c, COMPANY_PROFILE,
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]); // [{ batchId, qty }]
  const [q, setQ] = useState("");
  const [onlyExpired, setOnlyExpired] = useState(true);
  const [printBA, setPrintBA] = useState(null);
  const [busy, setBusy] = useState(false);

  const prodOf = (id) => (products || []).find((p) => p.id === id);
  const today = todayISO();
  const list = [...(disposals || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const candidates = useMemo(() => (batches || [])
    .filter((b) => Number(b.qty) > 0)
    .filter((b) => !onlyExpired || (b.expiryDate && b.expiryDate < today))
    .filter((b) => {
      if (!q.trim()) return true;
      const p = prodOf(b.productId);
      return `${p?.name || ""} ${b.batchNo || ""}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")))
    .slice(0, 60), [batches, products, q, onlyExpired, today]);

  function openNew() {
    const year = new Date().getFullYear();
    const maxSeq = (disposals || []).reduce((m, d) => {
      const mm = String(d.noBA || "").match(/BAP-\d{4}-(\d+)/);
      return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
    }, 0);
    setForm(emptyForm(`BAP-${year}-${String(maxSeq + 1).padStart(4, "0")}`, today));
    setLines([]);
    setQ("");
    setModal(true);
  }

  function addBatch(b) {
    if (lines.some((l) => l.batchId === b.id)) return;
    setLines([...lines, { batchId: b.id, qty: Number(b.qty) }]);
  }

  async function submit() {
    if (!form.noBA.trim()) return notify("Nomor Berita Acara wajib diisi", "danger");
    if (lines.length === 0) return notify("Pilih minimal 1 batch yang dimusnahkan", "danger");
    if (!form.witnesses.pj.trim()) return notify("Nama penanggung jawab (APJ / PJT) wajib diisi", "danger");
    if (!form.witnesses.saksi1.trim()) return notify("Minimal 1 saksi wajib diisi", "danger");
    const items = [];
    for (const l of lines) {
      const b = (batches || []).find((x) => x.id === l.batchId);
      const qty = Number(l.qty) || 0;
      if (!b) return notify("Ada batch yang sudah tidak ada di stok", "danger");
      if (qty <= 0) return notify(`Qty batch ${b.batchNo} harus lebih dari 0`, "danger");
      if (qty > Number(b.qty)) return notify(`Qty batch ${b.batchNo} melebihi stok (${b.qty})`, "danger");
      items.push({ batchId: b.id, productId: b.productId, batchNo: b.batchNo, expiryDate: b.expiryDate, qty, costPrice: Number(b.costPrice) || 0 });
    }
    if (!confirm(`Simpan ${form.noBA}? Stok ${items.length} batch akan dikurangi sesuai qty pemusnahan.`)) return;
    setBusy(true);
    try {
      const byBatch = Object.fromEntries(items.map((it) => [it.batchId, it.qty]));
      await saveBatches((batches || []).map((b) => (byBatch[b.id] ? {
        ...b, qty: Number(b.qty) - byBatch[b.id], lastAdjustedAt: form.date, lastAdjustedReason: `Pemusnahan ${form.noBA}`,
      } : b)));
      await saveDisposals([...(disposals || []), { id: uid(), ...form, noBA: form.noBA.trim(), items, createdAt: new Date().toISOString() }]);
      notify(`${form.noBA} tersimpan, stok batch sudah dikurangi`);
      setModal(false);
    } finally {
      setBusy(false);
    }
  }

  async function cancelBA(d) {
    if (!confirm(`Batalkan ${d.noBA}? Qty barang akan dikembalikan ke batch asalnya.`)) return;
    const back = {};
    (d.items || []).forEach((it) => { back[it.batchId] = (back[it.batchId] || 0) + Number(it.qty || 0); });
    const missing = (d.items || []).filter((it) => !(batches || []).some((b) => b.id === it.batchId));
    await saveBatches((batches || []).map((b) => (back[b.id] ? { ...b, qty: Number(b.qty) + back[b.id], lastAdjustedAt: todayISO(), lastAdjustedReason: `Batal pemusnahan ${d.noBA}` } : b)));
    await saveDisposals((disposals || []).filter((x) => x.id !== d.id));
    notify(`${d.noBA} dibatalkan${missing.length ? ` (${missing.length} batch sudah terhapus, qty-nya tidak bisa dikembalikan)` : ", stok dikembalikan"}`);
  }

  const totalValue = (d) => (d.items || []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.costPrice || 0), 0);
  const w = form?.witnesses;
  const setW = (patch) => setForm({ ...form, witnesses: { ...form.witnesses, ...patch } });

  return (
    <div className="mb-5 rounded-xl border" style={{ borderColor: c?.border, background: c?.surface }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-4 py-3 cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: c?.ink }}>
          <Flame size={15} color={c?.danger} /> Pemusnahan Barang & Berita Acara
          <Badge tone="neutral" colorConfig={c}>{list.length}</Badge>
        </span>
        <span className="text-xs" style={{ color: c?.inkSoft }}>{open ? "Tutup" : "Buka"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs" style={{ color: c?.inkSoft }}>Untuk barang kedaluwarsa, rusak, atau recall. Stok batch otomatis berkurang dan Berita Acara bisa dicetak.</p>
            <Button onClick={openNew} colorConfig={c}><Plus size={15} /> Buat Berita Acara</Button>
          </div>
          <ResponsiveTable minWidth={720} colorConfig={c}>
            <thead>
              <tr style={{ background: c?.primarySoft }}>
                {["No. BA", "Tanggal", "Barang", "Alasan", "Metode", "Nilai (HPP)", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs uppercase font-semibold" style={{ color: c?.primary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: c?.inkSoft }}>Belum ada pemusnahan.</td></tr>}
              {list.map((d) => (
                <tr key={d.id} style={{ borderTop: `1px solid ${c?.border}` }}>
                  <td className="px-3 py-2 font-mono font-semibold" style={{ color: c?.ink }}>{d.noBA}</td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: c?.inkSoft }}>{fmtDate(d.date)}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: c?.ink }}>{(d.items || []).length} batch · {(d.items || []).reduce((s, it) => s + Number(it.qty || 0), 0)} unit</td>
                  <td className="px-3 py-2 text-xs" style={{ color: c?.ink }}>{d.reason}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: c?.inkSoft }}>{d.method}</td>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: c?.ink }}>{fmtIDR(totalValue(d))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setPrintBA(d)} className="text-xs font-semibold mr-3 inline-flex items-center gap-1 cursor-pointer" style={{ color: c?.primary }}><Printer size={13} /> Cetak BA</button>
                    <button onClick={() => cancelBA(d)} className="text-xs cursor-pointer" style={{ color: c?.danger }}>Batalkan</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      )}

      {modal && form && (
        <Modal title="Buat Berita Acara Pemusnahan" onClose={() => setModal(false)} wide xwide colorConfig={c}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Nomor Berita Acara" colorConfig={c}><TextInput value={form.noBA} onChange={(e) => setForm({ ...form, noBA: e.target.value })} className="font-mono" colorConfig={c} /></Field>
            <Field label="Tanggal Pemusnahan" colorConfig={c}><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} colorConfig={c} /></Field>
            <Field label="Tempat" colorConfig={c}><TextInput value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} colorConfig={c} /></Field>
            <Field label="Alasan" colorConfig={c}>
              <Select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} colorConfig={c}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
            </Field>
            <Field label="Metode Pemusnahan" colorConfig={c}>
              <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} colorConfig={c}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
            </Field>
            <Field label="Keterangan (opsional)" colorConfig={c}><TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} colorConfig={c} /></Field>
          </div>

          <div className="rounded-lg border p-3 mb-3" style={{ borderColor: c?.border, background: c?.bg }}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: c?.primary }}>Pilih Batch</div>
              <label className="text-xs flex items-center gap-1 cursor-pointer" style={{ color: c?.ink }}>
                <input type="checkbox" checked={onlyExpired} onChange={(e) => setOnlyExpired(e.target.checked)} style={{ accentColor: c?.primary }} /> Hanya yang sudah kedaluwarsa
              </label>
              <div className="relative ml-auto w-full sm:w-64">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" color={c?.inkSoft} />
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk / no. batch..." className="pl-8" colorConfig={c} />
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
              {candidates.length === 0 && <div className="text-xs py-3 text-center" style={{ color: c?.inkSoft }}>Tidak ada batch yang cocok{onlyExpired ? " (coba matikan filter kedaluwarsa)" : ""}.</div>}
              {candidates.map((b) => {
                const p = prodOf(b.productId);
                const added = lines.some((l) => l.batchId === b.id);
                const expired = b.expiryDate && b.expiryDate < today;
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-xs" style={{ borderColor: c?.border, background: c?.surface }}>
                    <span style={{ color: c?.ink }}>
                      <b>{p?.name || "-"}</b> · <span className="font-mono">{b.batchNo}</span> · <span style={{ color: expired ? c?.danger : c?.inkSoft }}>ED {b.expiryDate ? fmtDate(b.expiryDate) : "-"}</span> · stok {b.qty} {p?.unit || ""}
                    </span>
                    <button disabled={added} onClick={() => addBatch(b)} className="text-xs font-semibold px-2 py-0.5 rounded border disabled:opacity-50 cursor-pointer" style={{ color: c?.primary, borderColor: c?.primary }}>
                      {added ? "✓ Dipilih" : "Pilih"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: c?.primary }}>Barang yang Dimusnahkan ({lines.length})</div>
          <ResponsiveTable minWidth={640} colorConfig={c}>
            <thead>
              <tr style={{ background: c?.primarySoft }}>
                {["No", "Produk", "No. Batch", "Exp. Date", "Stok", "Qty Dimusnahkan", ""].map((h) => <th key={h} className="text-left px-3 py-1.5 text-[10px] uppercase font-semibold" style={{ color: c?.primary }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={7} className="text-center py-4 text-xs" style={{ color: c?.inkSoft }}>Belum ada batch dipilih.</td></tr>}
              {lines.map((l, i) => {
                const b = (batches || []).find((x) => x.id === l.batchId);
                const p = prodOf(b?.productId);
                const over = Number(l.qty) > Number(b?.qty || 0);
                return (
                  <tr key={l.batchId} style={{ borderTop: `1px solid ${c?.border}` }}>
                    <td className="px-3 py-1.5 text-xs" style={{ color: c?.inkSoft }}>{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs font-semibold" style={{ color: c?.ink }}>{p?.name}</td>
                    <td className="px-3 py-1.5 text-xs font-mono" style={{ color: c?.ink }}>{b?.batchNo}</td>
                    <td className="px-3 py-1.5 text-xs font-mono" style={{ color: c?.ink }}>{b?.expiryDate ? fmtDate(b.expiryDate) : "-"}</td>
                    <td className="px-3 py-1.5 text-xs font-mono" style={{ color: c?.inkSoft }}>{b?.qty}</td>
                    <td className="px-3 py-1.5 w-32">
                      <TextInput type="number" value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.batchId === l.batchId ? { ...x, qty: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) } : x)))}
                        className="text-right" style={over ? { borderColor: c?.danger } : undefined} colorConfig={c} />
                    </td>
                    <td className="px-2 py-1.5"><button onClick={() => setLines(lines.filter((x) => x.batchId !== l.batchId))} className="cursor-pointer"><Trash2 size={14} color={c?.danger} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable>

          <div className="text-xs font-semibold uppercase tracking-wider mt-4 mb-1" style={{ color: c?.primary }}>Penanggung Jawab & Saksi</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <TextInput value={w.pj} onChange={(e) => setW({ pj: e.target.value })} placeholder="Nama APJ / PJT (wajib)" colorConfig={c} />
              <TextInput value={w.pjRole} onChange={(e) => setW({ pjRole: e.target.value })} placeholder="Jabatan" colorConfig={c} />
            </div>
            <div className="flex flex-col gap-1.5">
              <TextInput value={w.saksi1} onChange={(e) => setW({ saksi1: e.target.value })} placeholder="Nama saksi 1 (wajib)" colorConfig={c} />
              <TextInput value={w.saksi1Role} onChange={(e) => setW({ saksi1Role: e.target.value })} placeholder="Jabatan saksi 1" colorConfig={c} />
            </div>
            <div className="flex flex-col gap-1.5">
              <TextInput value={w.saksi2} onChange={(e) => setW({ saksi2: e.target.value })} placeholder="Nama saksi 2 (opsional)" colorConfig={c} />
              <TextInput value={w.saksi2Role} onChange={(e) => setW({ saksi2Role: e.target.value })} placeholder="Jabatan saksi 2" colorConfig={c} />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={submit} disabled={busy} colorConfig={c}>Simpan & Kurangi Stok</Button>
          </div>
        </Modal>
      )}

      {printBA && (
        <Modal title={`Cetak Berita Acara — ${printBA.noBA}`} onClose={() => setPrintBA(null)} wide colorConfig={c}>
          <PrintArea id="printable-bap" docTitle={`Berita Acara Pemusnahan - ${printBA.noBA}`}>
            <BeritaAcara d={printBA} products={products} company={COMPANY_PROFILE} fmtDate={fmtDate} />
          </PrintArea>
        </Modal>
      )}
    </div>
  );
}

function BeritaAcara({ d, products, company, fmtDate }) {
  const dt = d.date ? new Date(`${d.date}T00:00:00`) : null;
  const tglPanjang = dt ? dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";
  const hari = dt ? HARI[dt.getDay()] : "-";
  const w = d.witnesses || {};
  const prodOf = (id) => (products || []).find((p) => p.id === id);
  const cols = [
    { label: `Penanggung Jawab,\n${w.pjRole || ""}`, name: w.pj },
    { label: `Saksi I,\n${w.saksi1Role || ""}`, name: w.saksi1 },
  ];
  if (w.saksi2) cols.push({ label: `Saksi II,\n${w.saksi2Role || ""}`, name: w.saksi2 });
  cols.push({ label: "Mengetahui,\nPimpinan", name: "" });
  return (
    <>
      <DocHeader company={company} title="Berita Acara Pemusnahan" number={d.noBA} />
      <p className="text-xs text-gray-900 mb-3 leading-relaxed">
        Pada hari ini <b>{hari}</b>, tanggal <b>{tglPanjang}</b>, bertempat di <b>{d.place || "-"}</b>, telah dilakukan pemusnahan
        obat / alat kesehatan dengan alasan <b>{d.reason}</b>, menggunakan metode <b>{d.method}</b>, dengan rincian sebagai berikut:
      </p>
      <DocTable rows={d.items || []} columns={[
        { label: "No", render: (r, i) => i + 1 },
        { label: "Nama Barang / Alkes", render: (r) => <b>{prodOf(r.productId)?.name || "-"}</b> },
        { label: "No. Batch", render: (r) => r.batchNo || "-" },
        { label: "Exp. Date", render: (r) => (r.expiryDate ? fmtDate(r.expiryDate) : "-") },
        { label: "Jumlah", align: "center", render: (r) => `${r.qty} ${prodOf(r.productId)?.unit || ""}` },
      ]} />
      {d.note && <p className="text-xs text-gray-900 mb-2">Keterangan: {d.note}</p>}
      <p className="text-xs text-gray-900 mb-1 leading-relaxed">
        Demikian Berita Acara ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.
      </p>
      <div className="grid gap-4 text-center text-xs mt-6" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((col, i) => (
          <div key={i}>
            <p className="text-gray-700 mb-12 whitespace-pre-line">{col.label}</p>
            <p className={`text-gray-900 font-bold whitespace-pre ${col.name ? "underline" : ""}`}>{col.name ? `( ${col.name} )` : "(                              )"}</p>
          </div>
        ))}
      </div>
    </>
  );
}
