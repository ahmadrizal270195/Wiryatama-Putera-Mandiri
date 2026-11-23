import React, { useMemo, useState } from "react";
import { Card, Button, Badge } from "../components/UIComponents";
import { computeBill } from "../billing";
import { settledAmount, potonganTotal, suggestTaxPotongan, isTaxCollector, looksLikeInstansi } from "../paymentDeductions";

// =====================================================================
//  KOREKSI TRANSAKSI INSTANSI LAMA (sebelum ada fitur potongan pajak)
//  A. Faktur ke pemungut pajak yang masih nyangkut sisa piutang kira-kira sebesar
//     PPN + PPh 22 -> dilunasi dengan "pembayaran" Rp0 + potongan pajak.
//  B. Faktur ke pemungut pajak yang sudah lunas tapi pelunasannya dicatat penuh
//     (tanpa potongan) -> uang di pelunasan terakhir dikurangi, selisihnya jadi potongan.
//     Ini mengurangi saldo kas/bank di sistem supaya sama dengan uang yang benar-benar masuk.
// =====================================================================

const TOL_ABS = 1000;   // toleransi selisih Rp
const TOL_PCT = 0.01;   // atau 1% dari usulan potongan

export default function InstansiFixPanel({ invoices, sos, customers, paymentsIn, savePaymentsIn, invoiceSisa, invoiceReturnedAmount, findName, fmtIDR, fmtDate, notify, uid, todayISO, COLOR }) {
  const [pickA, setPickA] = useState(() => new Set());
  const [pickB, setPickB] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const custOf = (inv) => {
    const so = !inv.customerId ? (sos || []).find((x) => x.id === inv.soId) : null;
    return (customers || []).find((c) => c.id === (inv.customerId || so?.customerId));
  };
  const flagged = (customers || []).filter(isTaxCollector);
  const candidates = (customers || []).filter((c) => !isTaxCollector(c) && looksLikeInstansi(c.name));

  const rows = useMemo(() => {
    const A = [], B = [];
    for (const inv of invoices || []) {
      if (!inv.taxType || inv.taxType === "none") continue;
      const cust = custOf(inv);
      if (!isTaxCollector(cust)) continue;
      const pays = (paymentsIn || []).filter((p) => p.invoiceId === inv.id);
      if (pays.some((p) => potonganTotal(p) > 0)) continue; // sudah pakai potongan
      const sug = suggestTaxPotongan(inv, { returned: invoiceReturnedAmount ? invoiceReturnedAmount(inv.id) : 0 });
      const cut = sug.ppn + sug.pph22;
      if (cut <= 0) continue;
      const sisa = invoiceSisa(inv);
      const lastDate = pays.reduce((d, p) => ((p.date || "") > d ? p.date || "" : d), "");
      const base = { inv, cust, sug, cut, sisa, pays, lastDate, total: computeBill(inv).total };
      if (sisa > 0.5) {
        const diff = sisa - cut;
        base.match = Math.abs(diff) <= Math.max(TOL_ABS, cut * TOL_PCT);
        base.diff = diff;
        A.push(base);
      } else if (pays.length) {
        const last = [...pays].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();
        base.last = last;
        base.ok = (Number(last.amount) || 0) >= cut;
        B.push(base);
      }
    }
    return { A, B };
  }, [invoices, sos, customers, paymentsIn]);

  const toggle = (set, setter, id) => setter(() => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function fixA() {
    const list = rows.A.filter((r) => pickA.has(r.inv.id) && r.match);
    if (!list.length) return;
    if (!confirm(`Lunasi ${list.length} faktur dengan potongan pajak (uang Rp0, PPN dipungut + PPh 22)?\nTanggal dicatat = tanggal pembayaran terakhir faktur itu.`)) return;
    setBusy(true);
    try {
      const add = list.map((r) => {
        // Sisa dipakai persis: PPh 22 sesuai usulan, PPN = sisanya (selisih kecil pembulatan ikut PPN)
        const pph22 = Math.min(r.sug.pph22, r.sisa);
        const ppn = Math.max(0, Math.round(r.sisa - pph22));
        return { id: uid(), invoiceId: r.inv.id, type: "Pelunasan", amount: 0, date: r.lastDate || r.inv.date || todayISO(), method: "Potongan Pajak",
          note: "Koreksi: PPN & PPh 22 dipungut instansi", potongan: [{ kind: "ppn", amount: ppn, note: "" }, { kind: "pph22", amount: Math.round(pph22), note: "" }].filter((x) => x.amount > 0), buktiNo: "" };
      });
      await savePaymentsIn([...(paymentsIn || []), ...add]);
      setPickA(new Set());
      notify(`${add.length} faktur dilunasi dengan potongan pajak`);
    } finally { setBusy(false); }
  }

  async function fixB() {
    const list = rows.B.filter((r) => pickB.has(r.inv.id) && r.ok);
    if (!list.length) return;
    const totalCut = list.reduce((s, r) => s + r.cut, 0);
    if (!confirm(`Koreksi ${list.length} pelunasan: uang yang tercatat dikurangi total ${fmtIDR(totalCut)} dan dipindah jadi potongan PPN + PPh 22.\n\nSaldo kas/bank di sistem ikut berkurang ${fmtIDR(totalCut)}. Pastikan memang uang yang masuk rekening lebih kecil dari tagihan. Lanjut?`)) return;
    setBusy(true);
    try {
      const byId = new Map(list.map((r) => [r.last.id, r]));
      const updated = (paymentsIn || []).map((p) => {
        const r = byId.get(p.id);
        if (!r) return p;
        return { ...p, amount: Math.round((Number(p.amount) || 0) - r.cut),
          potongan: [{ kind: "ppn", amount: r.sug.ppn, note: "" }, { kind: "pph22", amount: r.sug.pph22, note: "" }].filter((x) => x.amount > 0),
          note: [p.note, "Koreksi: sebagian jadi potongan pajak instansi"].filter(Boolean).join(" · ") };
      });
      await savePaymentsIn(updated);
      setPickB(new Set());
      notify(`${list.length} pelunasan dikoreksi`);
    } finally { setBusy(false); }
  }

  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const td = "px-3 py-2 text-sm";
  const tdR = "px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap";
  const selA = rows.A.filter((r) => r.match);
  const selB = rows.B.filter((r) => r.ok);

  return (
    <div className="space-y-5">
      <Card colorConfig={COLOR}>
        <div className="text-sm font-semibold mb-1" style={{ color: COLOR.ink }}>Pelanggan pemungut pajak: {flagged.length}</div>
        <div className="text-xs" style={{ color: COLOR.inkSoft }}>
          Daftar di bawah cuma membaca pelanggan yang sudah ditandai "Pemungut Pajak" di Master Pelanggan.
          {candidates.length > 0 && <> Ada <b style={{ color: COLOR.warn }}>{candidates.length} pelanggan</b> yang namanya mirip instansi tapi belum ditandai: {candidates.slice(0, 6).map((c) => c.name).join(", ")}{candidates.length > 6 ? ", ..." : ""}. Tandai dulu di menu Pelanggan.</>}
        </div>
      </Card>

      {/* A */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-semibold" style={{ color: COLOR.ink }}>A. Belum lunas, sisa piutang = PPN + PPh 22 ({rows.A.length})</div>
            <div className="text-xs" style={{ color: COLOR.inkSoft }}>Dilunasi pakai potongan pajak tanpa uang masuk. Yang sisanya beda jauh dari usulan (bukan cuma pajak) nggak bisa dicentang, cek manual lewat tombol Bayar di tab Piutang.</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPickA(pickA.size === selA.length ? new Set() : new Set(selA.map((r) => r.inv.id)))} colorConfig={COLOR}>{pickA.size === selA.length && selA.length ? "Batal pilih" : "Pilih semua yang cocok"}</Button>
            <Button onClick={fixA} disabled={busy || pickA.size === 0} colorConfig={COLOR}>Lunasi {pickA.size || ""} faktur</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: COLOR.border }}>
          <table className="w-full min-w-[900px]">
            <thead><tr style={{ background: COLOR.primarySoft }}>
              {["", "No. Faktur", "Tanggal", "Pelanggan"].map((h) => <th key={h} className={th} style={{ color: COLOR.primary }}>{h}</th>)}
              {["Total", "Sisa Piutang", "PPN", "PPh 22", "Selisih"].map((h) => <th key={h} className={thR} style={{ color: COLOR.primary }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.A.map((r) => (
                <tr key={r.inv.id} style={{ borderTop: `1px solid ${COLOR.border}`, opacity: r.match ? 1 : 0.55 }}>
                  <td className={td}><input type="checkbox" disabled={!r.match} checked={pickA.has(r.inv.id)} onChange={() => toggle(pickA, setPickA, r.inv.id)} /></td>
                  <td className={`${td} font-semibold whitespace-nowrap`} style={{ color: COLOR.ink }}>{r.inv.noFaktur}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: COLOR.inkSoft }}>{fmtDate(r.inv.date)}</td>
                  <td className={td} style={{ color: COLOR.ink }}>{r.cust?.name}</td>
                  <td className={tdR} style={{ color: COLOR.ink }}>{fmtIDR(r.total)}</td>
                  <td className={tdR} style={{ color: COLOR.warn }}>{fmtIDR(r.sisa)}</td>
                  <td className={tdR} style={{ color: COLOR.inkSoft }}>{fmtIDR(r.sug.ppn)}</td>
                  <td className={tdR} style={{ color: COLOR.inkSoft }}>{fmtIDR(r.sug.pph22)}</td>
                  <td className={tdR} style={{ color: r.match ? COLOR.good : COLOR.danger }}>{r.match ? "cocok" : fmtIDR(r.diff)}</td>
                </tr>
              ))}
              {rows.A.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Nggak ada faktur pemungut yang nyangkut sisa piutang.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* B */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-semibold" style={{ color: COLOR.ink }}>B. Sudah lunas, tapi uang dicatat penuh tanpa potongan ({rows.B.length})</div>
            <div className="text-xs" style={{ color: COLOR.inkSoft }}>Kalau uang yang beneran masuk rekening lebih kecil dari tagihan, koreksi di sini: pelunasan terakhir dikurangi PPN + PPh 22 dan selisihnya dicatat sebagai potongan. <b>Saldo kas/bank di sistem ikut turun.</b> Cocokkan dulu sama mutasi rekening.</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPickB(pickB.size === selB.length ? new Set() : new Set(selB.map((r) => r.inv.id)))} colorConfig={COLOR}>{pickB.size === selB.length && selB.length ? "Batal pilih" : "Pilih semua"}</Button>
            <Button onClick={fixB} disabled={busy || pickB.size === 0} colorConfig={COLOR}>Koreksi {pickB.size || ""} pelunasan</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: COLOR.border }}>
          <table className="w-full min-w-[900px]">
            <thead><tr style={{ background: COLOR.primarySoft }}>
              {["", "No. Faktur", "Tgl Lunas", "Pelanggan"].map((h) => <th key={h} className={th} style={{ color: COLOR.primary }}>{h}</th>)}
              {["Total", "Uang Tercatat (terakhir)", "PPN", "PPh 22", "Uang Setelah Koreksi"].map((h) => <th key={h} className={thR} style={{ color: COLOR.primary }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.B.map((r) => (
                <tr key={r.inv.id} style={{ borderTop: `1px solid ${COLOR.border}`, opacity: r.ok ? 1 : 0.55 }}>
                  <td className={td}><input type="checkbox" disabled={!r.ok} checked={pickB.has(r.inv.id)} onChange={() => toggle(pickB, setPickB, r.inv.id)} /></td>
                  <td className={`${td} font-semibold whitespace-nowrap`} style={{ color: COLOR.ink }}>{r.inv.noFaktur}</td>
                  <td className={`${td} whitespace-nowrap`} style={{ color: COLOR.inkSoft }}>{fmtDate(r.lastDate)}</td>
                  <td className={td} style={{ color: COLOR.ink }}>{r.cust?.name}</td>
                  <td className={tdR} style={{ color: COLOR.ink }}>{fmtIDR(r.total)}</td>
                  <td className={tdR} style={{ color: COLOR.ink }}>{fmtIDR(r.last.amount)}</td>
                  <td className={tdR} style={{ color: COLOR.inkSoft }}>{fmtIDR(r.sug.ppn)}</td>
                  <td className={tdR} style={{ color: COLOR.inkSoft }}>{fmtIDR(r.sug.pph22)}</td>
                  <td className={tdR} style={{ color: r.ok ? COLOR.good : COLOR.danger }}>{r.ok ? fmtIDR((Number(r.last.amount) || 0) - r.cut) : "pelunasan terakhir < potongan, koreksi manual"}</td>
                </tr>
              ))}
              {rows.B.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-sm" style={{ color: COLOR.inkSoft }}>Nggak ada pelunasan pemungut yang dicatat penuh.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
