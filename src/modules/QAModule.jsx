import React, { useMemo, useState } from "react";
import { Plus, Search, CheckCircle2, XCircle, Clock, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, GitBranch } from "lucide-react";
import { Eyebrow, Card, Badge, Button, Modal, Field, TextInput, Select, ResponsiveTable } from "../components/UIComponents";
import {
  QA_CLASSES, qaClassOf, reviewState, applyDecision, myOfficerFor, officerStatus, QABadge,
  officerRoleLabel, decisionByText, onBehalfOfFor, isOwnSubmission,
} from "../qa";

const FLOW_KEY = "erp-qa-flow-open";

// ---------------------------------------------------------------------
//  Diagram alur (mengikuti flowchart CDOB)
// ---------------------------------------------------------------------
function FlowDiagram({ c }) {
  const box = (x, y, w, h, label, sub, tone) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={tone === "primary" ? c.primary : c.surface} stroke={tone === "primary" ? c.primary : c.border} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" fontSize="12" fontWeight="700" fill={tone === "primary" ? "#fff" : c.ink}>{label}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="10" fill={tone === "primary" ? "#ffffffcc" : c.inkSoft}>{sub}</text>}
    </g>
  );
  const pill = (x, y, label, color) => (
    <g>
      <rect x={x - 34} y={y} width="68" height="24" rx="12" fill={color + "22"} stroke={color} />
      <text x={x} y={y + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{label}</text>
    </g>
  );
  const line = (d) => <path d={d} fill="none" stroke={c.inkSoft} strokeWidth="1.3" markerEnd="url(#arr)" />;
  const branch = (cx, label, sub) => (
    <g>
      {box(cx - 80, 150, 160, 44, label, sub)}
      {line(`M${cx} 194 L${cx} 222`)}
      <polygon points={`${cx},224 ${cx + 52},250 ${cx},276 ${cx - 52},250`} fill={c.surface} stroke={c.border} />
      <text x={cx} y={254} textAnchor="middle" fontSize="11" fontWeight="700" fill={c.ink}>Approve?</text>
      {line(`M${cx - 52} 250 L${cx - 90} 250 L${cx - 90} 298`)}
      {line(`M${cx + 52} 250 L${cx + 90} 250 L${cx + 90} 298`)}
      <text x={cx - 72} y={244} textAnchor="middle" fontSize="10" fill={c.inkSoft}>Tidak</text>
      <text x={cx + 72} y={244} textAnchor="middle" fontSize="10" fill={c.inkSoft}>Ya</text>
      {pill(cx - 90, 300, "HOLD", c.danger)}
      {pill(cx + 90, 300, "PROSES", c.good)}
    </g>
  );
  return (
    <svg viewBox="0 0 640 336" className="w-full max-w-2xl mx-auto block" role="img" aria-label="Alur review CDOB">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={c.inkSoft} />
        </marker>
      </defs>
      {box(250, 4, 140, 34, "TRANSAKSI", null, "primary")}
      <text x={320} y={52} textAnchor="middle" fontSize="9.5" fill={c.inkSoft}>SO · PO · Faktur langsung · Penerimaan barang</text>
      {line("M320 58 L320 76")}
      {box(230, 78, 180, 40, "VALIDASI SISTEM", "klasifikasi item per kategori")}
      {line("M320 118 L320 132 L170 132 L170 148")}
      {line("M320 132 L470 132 L470 148")}
      {branch(170, "PJT ALKES REVIEW", "Alkes · Dental · Consumables")}
      {branch(470, "APJ OBAT REVIEW", "Obat Generik · Obat Paten")}
    </svg>
  );
}

// ---------------------------------------------------------------------
//  Modul utama
// ---------------------------------------------------------------------
export default function QAView(props) {
  const { officers, canManage, colorConfig: c } = props;
  const [subTab, setSubTab] = useState("queue");
  const [flowOpen, setFlowOpen] = useState(() => {
    try { return localStorage.getItem(FLOW_KEY) === "1"; } catch (_) { return false; }
  });
  function toggleFlow() {
    const next = !flowOpen;
    setFlowOpen(next);
    try { localStorage.setItem(FLOW_KEY, next ? "1" : "0"); } catch (_) { /* abaikan */ }
  }
  const TABS = [
    { id: "queue", label: "Antrian Review" },
    { id: "history", label: "Riwayat Keputusan" },
    { id: "master", label: "Data Master APJ / PJT" },
  ];
  return (
    <div>
      <Eyebrow>CDOB · Penanggung Jawab</Eyebrow>
      <h2 className="text-xl font-semibold mb-1" style={{ color: c.ink }}>Review APJ / PJT</h2>
      <p className="text-xs mb-4" style={{ color: c.inkSoft }}>
        Setiap transaksi obat wajib disetujui APJ, dan alkes wajib disetujui PJT, sebelum bisa diproses. Transaksi campuran butuh persetujuan keduanya.
      </p>

      <div className="mb-5">
        <button onClick={toggleFlow} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border"
          style={{ color: c.primary, borderColor: c.border, background: c.surface }}>
          <GitBranch size={14} /> {flowOpen ? "Sembunyikan alur review" : "Lihat alur review"}
          {flowOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {flowOpen && (
          <Card colorConfig={c} className="mt-2">
            <FlowDiagram c={c} />
          </Card>
        )}
      </div>

      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit flex-wrap" style={{ background: c.primarySoft }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: subTab === t.id ? c.primary : "transparent", color: subTab === t.id ? "#fff" : c.primary }}>
            {t.label}
          </button>
        ))}
      </div>

      {(officers || []).length === 0 && subTab !== "master" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-xs" style={{ background: c.warnSoft, color: c.warn }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>Belum ada APJ / PJT terdaftar. Isi dulu di tab <b>Data Master APJ / PJT</b>{canManage ? "" : " (minta super admin)"}, supaya ada yang bisa menyetujui transaksi.</span>
        </div>
      )}

      {subTab === "queue" && <QueueTab {...props} />}
      {subTab === "history" && <HistoryTab {...props} />}
      {subTab === "master" && <MasterTab {...props} />}
    </div>
  );
}

// Kumpulkan semua dokumen yang punya review
function useReviewDocs({ sos, pos, invoices, pReceipts, pInvoices, customers, suppliers, findName }) {
  return useMemo(() => {
    const out = [];
    const supplierOfPO = (poId) => (pos || []).find((p) => p.id === poId)?.supplierId;
    for (const d of sos || []) if (d.qaReview) out.push({ kind: "so", kindLabel: "Sales Order", no: d.soNumber, party: findName(customers, d.customerId), doc: d });
    for (const d of invoices || []) if (d.qaReview && d.isDirect) out.push({ kind: "inv", kindLabel: "Faktur Langsung", no: d.noFaktur, party: findName(customers, d.customerId), doc: d });
    for (const d of pos || []) if (d.qaReview) out.push({ kind: "po", kindLabel: "Purchase Order", no: d.poNumber || d.noPO || d.number, party: findName(suppliers, d.supplierId), doc: d });
    for (const d of pReceipts || []) if (d.qaReview) out.push({ kind: "bpb", kindLabel: "Penerimaan (BPB)", no: d.noBPB, party: findName(suppliers, supplierOfPO(d.poId)), doc: d });
    for (const d of pInvoices || []) if (d.qaReview && d.isDirect) out.push({ kind: "pinv", kindLabel: "Pembelian Langsung", no: d.noFaktur, party: findName(suppliers, d.supplierId), doc: d });
    return out.sort((a, b) => String(b.doc.qaReview.createdAt || b.doc.date || "").localeCompare(String(a.doc.qaReview.createdAt || a.doc.date || "")));
  }, [sos, pos, invoices, pReceipts, pInvoices, customers, suppliers]);
}

function QueueTab(props) {
  const { products, officers, userEmail, colorConfig: c, fmtDate, notify, batches,
    saveSOs, savePOs, saveInvoices, savePReceipts, savePInvoices, saveBatches, sos, pos, invoices, pReceipts, pInvoices } = props;
  const docs = useReviewDocs(props);
  const [filter, setFilter] = useState("mine");
  const [q, setQ] = useState("");
  const [decide, setDecide] = useState(null); // { row, cls, status }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const mineClasses = ["obat", "alkes"].filter((cls) => myOfficerFor(officers, userEmail, cls));

  const rows = docs.filter((r) => {
    const st = reviewState(r.doc);
    const rv = r.doc.qaReview;
    if (filter === "mine" && !rv.required.some((cls) => mineClasses.includes(cls) && (rv[cls]?.status || "pending") === "pending")) return false;
    if (filter === "pending" && st !== "pending") return false;
    if (filter === "hold" && st !== "rejected") return false;
    if (q && !`${r.no} ${r.party} ${r.kindLabel}`.toLowerCase().includes(q.toLowerCase())) return false;
    return filter === "all" || filter === "mine" || filter === "pending" || filter === "hold";
  });

  const saverOf = { so: [sos, saveSOs], po: [pos, savePOs], inv: [invoices, saveInvoices], bpb: [pReceipts, savePReceipts], pinv: [pInvoices, savePInvoices] };

  async function submitDecision() {
    const { row, cls, status } = decide;
    if (status === "rejected" && !note.trim()) return notify("Alasan penolakan wajib diisi (untuk catatan audit)", "danger");
    const officer = myOfficerFor(officers, userEmail, cls);
    if (!officer) return notify(`Akun Anda bukan ${QA_CLASSES[cls].role} aktif untuk kategori ${QA_CLASSES[cls].label}`, "danger");
    const latest = (saverOf[row.kind][0] || []).find((d) => d.id === row.doc.id) || row.doc;
    if (isOwnSubmission(latest, userEmail)) return notify("Tidak bisa menyetujui / menolak transaksi yang Anda ajukan sendiri. Minta APJ / PJT / wakil lain.", "danger");
    setBusy(true);
    try {
      const [list, save] = saverOf[row.kind];
      const current = (list || []).find((d) => d.id === row.doc.id) || row.doc;
      const updated = applyDecision(current, cls, status, officer, note.trim());
      await save((list || []).map((d) => (d.id === updated.id ? updated : d)));

      // Penerimaan barang: batch baru lepas dari karantina setelah semua kategori setuju.
      if ((row.kind === "bpb" || row.kind === "pinv") && reviewState(updated) === "approved") {
        const hasQuarantine = (batches || []).some((b) => b.qaDocId === updated.id && b.quarantine);
        if (hasQuarantine) await saveBatches((batches || []).map((b) => (b.qaDocId === updated.id ? { ...b, quarantine: false, releasedAt: new Date().toISOString() } : b)));
      }
      notify(`${row.no}: ${status === "approved" ? "disetujui" : "ditolak (HOLD)"} sebagai ${QA_CLASSES[cls].role} ${QA_CLASSES[cls].label}`, status === "approved" ? "good" : "danger");
      setDecide(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  const FILTERS = [
    { id: "mine", label: `Tugas Saya${mineClasses.length ? "" : " (bukan APJ/PJT)"}` },
    { id: "pending", label: "Semua Menunggu" },
    { id: "hold", label: "HOLD / Ditolak" },
    { id: "all", label: "Semua" },
  ];

  return (
    <div>
      {mineClasses.length > 0 && (
        <div className="mb-3 text-xs flex items-center gap-1.5" style={{ color: c.good }}>
          <ShieldCheck size={14} /> Anda login sebagai {mineClasses.map((cls) => {
            const o = myOfficerFor(officers, userEmail, cls);
            return o?.delegate ? `Wakil ${QA_CLASSES[cls].role} ${QA_CLASSES[cls].label} (a.n. ${onBehalfOfFor(o, cls) || "penanggung jawab"})` : `${QA_CLASSES[cls].role} ${QA_CLASSES[cls].label}`;
          }).join(" & ")}.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className="px-2.5 py-1 rounded-md text-xs font-medium border"
              style={{ background: filter === f.id ? c.primary : "transparent", color: filter === f.id ? "#fff" : c.inkSoft, borderColor: filter === f.id ? c.primary : c.border }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: c.inkSoft }} />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / pihak..." className="pl-8" colorConfig={c} />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card colorConfig={c} className="text-center py-10 text-sm" style={{ color: c.inkSoft }}>
          {filter === "mine" ? (mineClasses.length ? "Tidak ada transaksi yang menunggu review Anda." : "Akun Anda tidak terdaftar sebagai APJ / PJT aktif.") : "Tidak ada data."}
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ReviewCard key={r.kind + r.doc.id} r={r} products={products} c={c} fmtDate={fmtDate}
              mineClasses={mineClasses} userEmail={userEmail} onDecide={(cls, status) => { setNote(""); setDecide({ row: r, cls, status }); }} />
          ))}
        </div>
      )}

      {decide && (
        <Modal title={`${decide.status === "approved" ? "Setujui" : "Tolak"} ${decide.row.kindLabel} ${decide.row.no}`} onClose={() => setDecide(null)} colorConfig={c}>
          <p className="text-xs mb-3" style={{ color: c.inkSoft }}>
            {(() => {
              const o = myOfficerFor(officers, userEmail, decide.cls);
              return o?.delegate
                ? <>Keputusan sebagai <b>wakil</b>, atas nama <b>{onBehalfOfFor(o, decide.cls) || QA_CLASSES[decide.cls].roleLong}</b>, untuk item kategori {QA_CLASSES[decide.cls].label}. Akan tercatat "a.n." di riwayat audit.</>
                : <>Keputusan sebagai <b>{QA_CLASSES[decide.cls].roleLong}</b> untuk item kategori {QA_CLASSES[decide.cls].label}. Nama, waktu, dan catatan akan tercatat untuk audit.</>;
            })()}
          </p>
          <Field label={decide.status === "rejected" ? "Alasan penolakan (wajib)" : "Catatan (opsional)"} colorConfig={c}>
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={decide.status === "rejected" ? "mis. izin sarana pelanggan kedaluwarsa" : "mis. dokumen & izin sesuai"} colorConfig={c} />
          </Field>
          <Button onClick={submitDecision} disabled={busy} variant={decide.status === "rejected" ? "danger" : "primary"} className="w-full justify-center mt-3" colorConfig={c}>
            {decide.status === "approved" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {decide.status === "approved" ? "Setujui" : "Tolak & HOLD"}
          </Button>
        </Modal>
      )}
    </div>
  );
}

function ReviewCard({ r, products, c, fmtDate, mineClasses, onDecide, userEmail }) {
  const rv = r.doc.qaReview;
  const items = r.doc.items || [];
  const own = isOwnSubmission(r.doc, userEmail);
  return (
    <Card colorConfig={c}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: c.inkSoft }}>{r.kindLabel}</div>
          <div className="font-mono font-semibold text-sm" style={{ color: c.ink }}>{r.no || "-"}</div>
          <div className="text-xs" style={{ color: c.inkSoft }}>{r.party} · {fmtDate(r.doc.date)}</div>
          {rv.createdByName && <div className="text-[11px] mt-0.5" style={{ color: c.inkSoft }}>Diajukan oleh {rv.createdByName}</div>}
        </div>
        <QABadge doc={r.doc} colorConfig={c} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rv.required.map((cls) => {
          const d = rv[cls] || { status: "pending" };
          const clsItems = items.filter((it) => qaClassOf((products || []).find((p) => p.id === it.productId)) === cls);
          const canAct = mineClasses.includes(cls);
          const tone = d.status === "approved" ? c.good : d.status === "rejected" ? c.danger : c.warn;
          return (
            <div key={cls} className="rounded-lg p-3" style={{ border: `1px solid ${c.border}`, background: c.bg }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold" style={{ color: c.ink }}>{QA_CLASSES[cls].role} {QA_CLASSES[cls].label}</div>
                <div className="text-[11px] font-semibold flex items-center gap-1" style={{ color: tone }}>
                  {d.status === "approved" ? <CheckCircle2 size={13} /> : d.status === "rejected" ? <XCircle size={13} /> : <Clock size={13} />}
                  {d.status === "approved" ? "Disetujui" : d.status === "rejected" ? "Ditolak" : "Menunggu"}
                </div>
              </div>
              <ul className="text-xs space-y-0.5 mb-2" style={{ color: c.ink }}>
                {clsItems.map((it, i) => {
                  const p = (products || []).find((x) => x.id === it.productId);
                  return (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{p?.name || it.productId}{it.batchNo ? <span style={{ color: c.inkSoft }}> · {it.batchNo}{it.expiryDate ? ` · ED ${fmtDate(it.expiryDate)}` : ""}</span> : null}</span>
                      <span className="font-mono shrink-0">{it.qty} {p?.unit || ""}</span>
                    </li>
                  );
                })}
              </ul>
              {d.status !== "pending" && (
                <div className="text-[11px] mb-2" style={{ color: c.inkSoft }}>
                  {decisionByText(d)} · {d.at ? new Date(d.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : ""}{d.note ? ` · "${d.note}"` : ""}
                </div>
              )}
              {canAct && own && (
                <div className="text-[11px] font-semibold rounded-md px-2 py-1.5" style={{ background: c.warnSoft, color: c.warn }}>
                  Transaksi ini Anda ajukan sendiri, jadi harus disetujui APJ / PJT / wakil lain.
                </div>
              )}
              {canAct && !own && (
                <div className="flex gap-2">
                  {d.status !== "approved" && (
                    <button onClick={() => onDecide(cls, "approved")} className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-md text-white" style={{ background: c.good }}>Setujui</button>
                  )}
                  {d.status !== "rejected" && (
                    <button onClick={() => onDecide(cls, "rejected")} className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-md border" style={{ color: c.danger, borderColor: c.danger }}>Tolak</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function HistoryTab(props) {
  const { colorConfig: c } = props;
  const docs = useReviewDocs(props);
  const rows = [];
  for (const r of docs) {
    for (const cls of r.doc.qaReview.required) {
      const d = r.doc.qaReview[cls];
      if (d && d.status !== "pending" && d.at) rows.push({ ...r, cls, d });
    }
  }
  rows.sort((a, b) => String(b.d.at).localeCompare(String(a.d.at)));
  return (
    <ResponsiveTable colorConfig={c} minWidth={760}>
      <thead>
        <tr style={{ background: c.primarySoft }}>
          {["Waktu", "Dokumen", "Pihak", "Kategori", "Keputusan", "Oleh", "Catatan"].map((h) => (
            <th key={h} className="text-left px-3 py-2 font-semibold text-xs uppercase" style={{ color: c.primary }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={7} className="px-3 py-8 text-center text-sm" style={{ color: c.inkSoft }}>Belum ada keputusan.</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
            <td className="px-3 py-2 text-xs font-mono" style={{ color: c.inkSoft }}>{new Date(r.d.at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-3 py-2 text-xs" style={{ color: c.ink }}>
              <div className="font-mono font-semibold">{r.no}</div>
              <div style={{ color: c.inkSoft }}>{r.kindLabel}</div>
              {r.doc.qaReview.createdByName && <div className="text-[10px]" style={{ color: c.inkSoft }}>Diajukan: {r.doc.qaReview.createdByName}</div>}
            </td>
            <td className="px-3 py-2 text-xs" style={{ color: c.ink }}>{r.party}</td>
            <td className="px-3 py-2 text-xs" style={{ color: c.ink }}>{QA_CLASSES[r.cls].role} {QA_CLASSES[r.cls].label}</td>
            <td className="px-3 py-2"><Badge tone={r.d.status === "approved" ? "good" : "danger"} colorConfig={c}>{r.d.status === "approved" ? "Disetujui" : "Ditolak"}</Badge></td>
            <td className="px-3 py-2 text-xs" style={{ color: c.ink }}>
              {r.d.byName}
              {r.d.delegate && <div className="text-[10px] font-semibold" style={{ color: c.warn }}>Wakil · a.n. {r.d.onBehalfOf || "penanggung jawab"}</div>}
              {r.d.license ? <div style={{ color: c.inkSoft }}>{r.d.license}</div> : null}
            </td>
            <td className="px-3 py-2 text-xs" style={{ color: c.inkSoft }}>{r.d.note || "-"}</td>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  );
}

const EMPTY_FORM = { name: "", qaClass: "obat", email: "", str: "", sipa: "", validUntil: "", phone: "", active: true, note: "", delegate: false, onBehalfOf: "", onBehalfOfObat: "", onBehalfOfAlkes: "" };

function MasterTab({ officers, saveOfficers, users, canManage, colorConfig: c, notify, uid, fmtDate }) {
  const [modal, setModal] = useState(null); // "new" | officer id
  const [form, setForm] = useState(EMPTY_FORM);
  const userEmails = new Set((users || []).map((u) => String(u.email || "").toLowerCase()));

  function openNew() { setForm(EMPTY_FORM); setModal("new"); }
  function openEdit(o) { setForm({ ...EMPTY_FORM, ...o }); setModal(o.id); }

  async function submit() {
    if (!form.name.trim()) return notify("Nama wajib diisi", "danger");
    if (!form.email.trim()) return notify("Email login wajib diisi (dipakai untuk menyetujui transaksi)", "danger");
    if (form.qaClass === "both" && !form.delegate) return notify("Pilihan APJ & PJT sekaligus hanya untuk wakil", "danger");
    if (form.delegate && form.qaClass === "both" && (!String(form.onBehalfOfObat || "").trim() || !String(form.onBehalfOfAlkes || "").trim()))
      return notify("Isi nama APJ dan PJT yang diwakili", "danger");
    if (form.delegate && form.qaClass !== "both" && !String(form.onBehalfOf || "").trim()) return notify("Isi nama penanggung jawab yang diwakili", "danger");
    if (!form.sipa.trim()) return notify(form.delegate ? "Nomor surat tugas / delegasi wajib diisi (bukti audit)" : `Nomor ${form.qaClass === "obat" ? "SIPA" : "surat izin / penunjukan"} wajib diisi`, "danger");
    const payload = { ...form, email: form.email.trim().toLowerCase(), name: form.name.trim() };
    if (modal === "new") await saveOfficers([...(officers || []), { ...payload, id: uid() }]);
    else await saveOfficers((officers || []).map((o) => (o.id === modal ? { ...o, ...payload } : o)));
    notify(`${officerRoleLabel(payload)} ${form.name.trim()} disimpan`);
    setModal(null);
  }

  const statusLabel = { ok: ["Aktif", "good"], inactive: ["Nonaktif", "neutral"], expired: ["Izin kedaluwarsa", "danger"] };
  const isObat = form.qaClass === "obat";
  const mainNames = (officers || []).filter((o) => !o.delegate && (form.qaClass === "both" || o.qaClass === form.qaClass))
    .map((o) => `${QA_CLASSES[o.qaClass]?.role} ${o.name}`);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs" style={{ color: c.inkSoft }}>
          Email harus sama dengan akun login di menu Pengguna. Petugas dengan izin kedaluwarsa atau nonaktif tidak bisa menyetujui transaksi.
        </p>
        {canManage && <Button onClick={openNew} colorConfig={c}><Plus size={15} /> Tambah</Button>}
      </div>
      <ResponsiveTable colorConfig={c} minWidth={760}>
        <thead>
          <tr style={{ background: c.primarySoft }}>
            {["Nama", "Jabatan", "Email Login", "No. STR", "No. SIPA / Izin / Surat Tugas", "Berlaku s.d.", "Status", ""].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-xs uppercase" style={{ color: c.primary }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(officers || []).length === 0 && (
            <tr><td colSpan={8} className="px-3 py-8 text-center text-sm" style={{ color: c.inkSoft }}>Belum ada data APJ / PJT.</td></tr>
          )}
          {(officers || []).map((o) => {
            const st = officerStatus(o);
            const [lbl, tone] = statusLabel[st] || statusLabel.ok;
            const notUser = !userEmails.has(String(o.email || "").toLowerCase());
            return (
              <tr key={o.id} style={{ borderTop: `1px solid ${c.border}` }}>
                <td className="px-3 py-2.5 text-sm font-semibold" style={{ color: c.ink }}>{o.name}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: c.ink }}>
                  {officerRoleLabel(o)}
                  {o.delegate && <div className="text-[10px]" style={{ color: c.warn }}>a.n. {o.qaClass === "both" ? `${o.onBehalfOfObat || "-"} & ${o.onBehalfOfAlkes || "-"}` : o.onBehalfOf || "-"}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: c.ink }}>
                  {o.email}
                  {notUser && <div className="text-[10px] font-sans" style={{ color: c.warn }}>Belum terdaftar di menu Pengguna</div>}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: c.ink }}>{o.str || "-"}</td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: c.ink }}>{o.sipa || "-"}</td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: st === "expired" ? c.danger : c.inkSoft }}>{o.validUntil ? fmtDate(o.validUntil) : "-"}</td>
                <td className="px-3 py-2.5"><Badge tone={tone} colorConfig={c}>{lbl}</Badge></td>
                <td className="px-3 py-2.5 text-right">
                  {canManage && <button onClick={() => openEdit(o)} className="text-xs font-semibold" style={{ color: c.accent }}>Edit</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ResponsiveTable>

      {modal && (
        <Modal title={modal === "new" ? "Tambah APJ / PJT / Wakil" : "Edit APJ / PJT / Wakil"} onClose={() => setModal(null)} colorConfig={c}>
          <div className="space-y-3">
            <Field label="Status penugasan" colorConfig={c}>
              <Select value={form.delegate ? "wakil" : "utama"} onChange={(e) => {
                const delegate = e.target.value === "wakil";
                setForm({ ...form, delegate, qaClass: !delegate && form.qaClass === "both" ? "obat" : form.qaClass });
              }} colorConfig={c}>
                <option value="utama">Penanggung jawab utama</option>
                <option value="wakil">Wakil / delegasi (approve atas nama penanggung jawab)</option>
              </Select>
            </Field>
            <Field label={form.delegate ? "Mewakili" : "Jabatan"} colorConfig={c}>
              <Select value={form.qaClass} onChange={(e) => setForm({ ...form, qaClass: e.target.value })} colorConfig={c}>
                <option value="obat">APJ (Apoteker Penanggung Jawab) · Obat</option>
                <option value="alkes">PJT (Penanggung Jawab Teknis) · Alkes</option>
                {form.delegate && <option value="both">APJ & PJT sekaligus · Obat & Alkes</option>}
              </Select>
            </Field>
            {form.delegate && (
              <Field label={form.qaClass === "both" ? "Atas nama (APJ untuk obat, PJT untuk alkes)" : "Atas nama (penanggung jawab yang diwakili)"} colorConfig={c}>
                {form.qaClass === "both" ? (
                  <div className="space-y-2">
                    <TextInput list="qa-main-names" value={form.onBehalfOfObat || ""} onChange={(e) => setForm({ ...form, onBehalfOfObat: e.target.value })}
                      placeholder="APJ yang diwakili, mis. APJ apt. Nama, S.Farm" colorConfig={c} />
                    <TextInput list="qa-main-names" value={form.onBehalfOfAlkes || ""} onChange={(e) => setForm({ ...form, onBehalfOfAlkes: e.target.value })}
                      placeholder="PJT yang diwakili, mis. PJT Nama" colorConfig={c} />
                  </div>
                ) : (
                  <TextInput list="qa-main-names" value={form.onBehalfOf} onChange={(e) => setForm({ ...form, onBehalfOf: e.target.value })}
                    placeholder={mainNames[0] || "mis. APJ apt. Nama, S.Farm"} colorConfig={c} />
                )}
                <datalist id="qa-main-names">{mainNames.map((n) => <option key={n} value={n} />)}</datalist>
                <p className="text-[11px] mt-1" style={{ color: c.inkSoft }}>
                  Setiap persetujuan wakil tercatat "a.n." penanggung jawab ini. Simpan surat delegasinya untuk bukti audit.
                </p>
              </Field>
            )}
            <Field label="Nama lengkap & gelar" colorConfig={c}>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isObat ? "apt. Nama, S.Farm" : "Nama, gelar"} colorConfig={c} />
            </Field>
            <Field label="Email login" colorConfig={c}>
              <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" colorConfig={c} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={form.delegate ? "No. STR / STRTTK (jika ada)" : isObat ? "No. STRA" : "No. STR"} colorConfig={c}>
                <TextInput value={form.str} onChange={(e) => setForm({ ...form, str: e.target.value })} colorConfig={c} />
              </Field>
              <Field label={form.delegate ? "No. Surat Tugas / Delegasi" : isObat ? "No. SIPA" : "No. SIK / Surat Penunjukan"} colorConfig={c}>
                <TextInput value={form.sipa} onChange={(e) => setForm({ ...form, sipa: e.target.value })} colorConfig={c} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={form.delegate ? "Delegasi berlaku s.d." : "Izin berlaku s.d."} colorConfig={c}>
                <TextInput type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} colorConfig={c} />
              </Field>
              <Field label="No. HP" colorConfig={c}>
                <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} colorConfig={c} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: c.ink }}>
              <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ accentColor: c.primary }} />
              Aktif (boleh menyetujui transaksi)
            </label>
            <Button onClick={submit} className="w-full justify-center" colorConfig={c}>Simpan</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
