import React, { useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Card, Button, Field, TextInput, Select } from "../components/UIComponents";
import SearchableSelect from "../components/SearchableSelect";
import PaymentHistory from "../components/PaymentHistory";
import { invoiceSoIds } from "../invoiceLinks";
import { potonganTotal, potonganOf, potonganHistoryRows, POTONGAN_KINDS } from "../paymentDeductions";

// =====================================================================
//  LAPORAN PELUNASAN
//  Faktur yang LUNAS di periode yang dipilih. Tanggal lunas = tanggal pembayaran
//  terakhir faktur itu (penjualan: pelunasan + DP dari SO-nya). Faktur yang dibayar
//  nyicil lintas bulan masuk ke bulan pelunasannya, dengan total semua pembayarannya.
// =====================================================================

const DAY = 86400000;
const daysBetween = (a, b) => {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return null;
  return Math.max(0, Math.round((db - da) / DAY));
};
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function downloadCSV(filename, headers, rows) {
  // Pemisah titik koma + BOM supaya rapi dibuka Excel versi Indonesia
  const esc = (v) => {
    const t = v == null ? "" : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const body = ["sep=;", headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PotonganView({ rows, start, end, companyName, COLOR, fmtDate, fmtIDR }) {
  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const td = "px-3 py-2 text-sm";
  const tdR = "px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap";
  const tot = (f) => rows.reduce((s, r) => s + f(r), 0);
  return (
    <>
      <div className="border-b pb-3 mb-4 text-center">
        <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{companyName || "PT WIRYATAMA PUTERA MANDIRI"}</div>
        <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>Rekap Potongan Saat Pelanggan Membayar</h3>
        <p className="text-xs text-gray-500">Tanggal bayar: {fmtDate(start)} s/d {fmtDate(end)}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {POTONGAN_KINDS.map((k) => (
          <div key={k.id} className="rounded-xl border p-3 bg-white" style={{ borderColor: COLOR.border }}>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.inkSoft }}>{k.label}</div>
            <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: COLOR.ink }}>{fmtIDR(tot((r) => r.by[k.id]))}</div>
            <div className="text-[10px] mt-0.5" style={{ color: COLOR.inkSoft }}>{k.tax ? "pajak, bukan beban" : "masuk beban Laba Rugi"}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: COLOR.border }}>
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
              <th className={th}>No</th><th className={th}>Tgl Bayar</th><th className={th}>No. Faktur</th><th className={th}>Pelanggan</th>
              <th className={thR}>Uang Diterima</th>
              {POTONGAN_KINDS.map((k) => <th key={k.id} className={thR}>{k.label}</th>)}
              <th className={thR}>Total Potongan</th><th className={th}>No. Bukti</th><th className={th}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLOR.border}`, color: COLOR.ink }}>
                <td className={`${td} tabular-nums`} style={{ color: COLOR.inkSoft }}>{i + 1}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>{fmtDate(r.date)}</td>
                <td className={`${td} tabular-nums font-semibold whitespace-nowrap`}>{r.no}</td>
                <td className={td}>{r.party}</td>
                <td className={tdR}>{fmtIDR(r.cash)}</td>
                {POTONGAN_KINDS.map((k) => <td key={k.id} className={tdR} style={{ color: r.by[k.id] ? COLOR.ink : COLOR.inkSoft }}>{r.by[k.id] ? fmtIDR(r.by[k.id]) : "-"}</td>)}
                <td className={`${tdR} font-semibold`}>{fmtIDR(r.total)}</td>
                <td className={`${td} text-xs`}>{r.bukti || "-"}</td>
                <td className={`${td} text-xs`} style={{ color: COLOR.inkSoft }}>{r.note || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada potongan di periode ini.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${COLOR.border}`, background: COLOR.primarySoft, color: COLOR.ink }}>
                <td className={`${td} font-bold`} colSpan={4}>TOTAL ({rows.length} pembayaran)</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(tot((r) => r.cash))}</td>
                {POTONGAN_KINDS.map((k) => <td key={k.id} className={`${tdR} font-bold`}>{fmtIDR(tot((r) => r.by[k.id]))}</td>)}
                <td className={`${tdR} font-bold`}>{fmtIDR(tot((r) => r.total))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

export default function PelunasanReport({
  start, end, canSeePurchase,
  invoices, pInvoices, sos, pos, customers, suppliers, paymentsIn, paymentsOut, returns, pReturns,
  invoiceTotal, pInvoiceTotal, invoiceDPAmount, invoiceReturnedAmount, pInvoiceReturnedAmount,
  findName, fmtDate, fmtIDR, COLOR, companyName, printStyle,
}) {
  const [kind, setKind] = useState("sales"); // sales | purchase
  const [party, setParty] = useState("ALL");
  const [method, setMethod] = useState("ALL");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isPot = kind === "potongan";
  const isSales = kind === "sales" || kind === "potongan" || !canSeePurchase;

  const retAmt = (r) => (r.items || []).reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  // Semua faktur yang sudah lunas + tanggal lunasnya
  const allRows = useMemo(() => {
    const out = [];
    if (isSales) {
      for (const inv of invoices || []) {
        const total = invoiceTotal ? invoiceTotal(inv) : 0;
        if (!(total > 0)) continue;
        const soIds = invoiceSoIds(inv);
        const pays = (paymentsIn || []).filter((p) => p.invoiceId === inv.id);
        const dps = (paymentsIn || []).filter((p) => p.soId && soIds.includes(p.soId));
        const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const pot = pays.reduce((s, p) => s + potonganTotal(p), 0);
        const potTax = pays.reduce((s, p) => s + potonganOf(p, "ppn") + potonganOf(p, "pph22") + potonganOf(p, "pph23"), 0);
        const ret = invoiceReturnedAmount ? invoiceReturnedAmount(inv.id) : 0;
        const dp = invoiceDPAmount ? invoiceDPAmount(inv) : 0;
        const sisa = total - ret - dp - paid - pot;
        if (sisa > 0.5) continue;
        let paidDate = "";
        [...pays, ...dps].forEach((p) => { if ((p.date || "") > paidDate) paidDate = p.date || ""; });
        if (!paidDate) paidDate = inv.date || "";
        const soNo = (id) => (sos || []).find((x) => x.id === id)?.soNumber;
        const history = [
          ...pays.flatMap((p) => [
            ...((Number(p.amount) || 0) > 0 || !potonganTotal(p) ? [{ date: p.date, kind: "bayar", label: p.type || "Pelunasan", sub: [p.method, p.note].filter(Boolean).join(" · "), amount: Number(p.amount) || 0 }] : []),
            ...potonganHistoryRows(p),
          ]),
          ...dps.map((p) => ({ date: p.date, kind: "dp", label: `DP ${soNo(p.soId) || "SO"}`, sub: [p.method, p.note].filter(Boolean).join(" · "), amount: Number(p.amount) || 0 })),
          ...(returns || []).filter((r) => r.invoiceId === inv.id).map((r) => ({ date: r.date, kind: "retur", label: `Retur ${r.noRetur || ""}`.trim(), sub: "mengurangi tagihan", amount: retAmt(r) })),
        ];
        out.push({
          id: inv.id, no: inv.noFaktur, date: inv.date, paidDate,
          partyId: inv.customerId || (sos || []).find((x) => x.id === inv.soId)?.customerId,
          ref: inv.isDirect ? "Langsung" : uniq(soIds.map(soNo)).join(", ") || "-",
          total, ret, dp, paid, pot, potTax, potOther: pot - potTax,
          methods: uniq([...pays, ...dps].map((p) => p.method)),
          days: daysBetween(inv.date, paidDate),
          history,
          deductions: [{ label: "Retur", amount: ret }, { label: "DP", amount: dp }, { label: "Dibayar (uang masuk)", amount: paid }, { label: "Potongan (pajak / admin / lain)", amount: pot }],
        });
      }
    } else {
      for (const inv of pInvoices || []) {
        const total = pInvoiceTotal ? pInvoiceTotal(inv) : 0;
        if (!(total > 0)) continue;
        const pays = (paymentsOut || []).filter((p) => p.pInvoiceId === inv.id);
        const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const ret = pInvoiceReturnedAmount ? pInvoiceReturnedAmount(inv.id) : 0;
        if (total - ret - paid > 0.5) continue;
        let paidDate = "";
        pays.forEach((p) => { if ((p.date || "") > paidDate) paidDate = p.date || ""; });
        if (!paidDate) paidDate = inv.date || "";
        const po = (pos || []).find((x) => x.id === inv.poId);
        out.push({
          id: inv.id, no: inv.noFaktur, date: inv.date, paidDate,
          partyId: inv.supplierId,
          ref: inv.isDirect ? "Langsung" : po?.poNumber || "-",
          total, ret, dp: 0, paid, pot: 0, potTax: 0, potOther: 0,
          methods: uniq(pays.map((p) => p.method)),
          days: daysBetween(inv.date, paidDate),
          history: [
            ...pays.map((p) => ({ date: p.date, kind: "bayar", label: p.type || "Pembayaran", sub: [p.method, p.note].filter(Boolean).join(" · "), amount: Number(p.amount) || 0 })),
            ...(pReturns || []).filter((r) => r.pInvoiceId === inv.id).map((r) => ({ date: r.date, kind: "retur", label: `Retur ${r.noRetur || ""}`.trim(), sub: "mengurangi tagihan", amount: retAmt(r) })),
          ],
          deductions: [{ label: "Retur", amount: ret }, { label: "Dibayar", amount: paid }],
        });
      }
    }
    return out;
  }, [isSales, invoices, pInvoices, sos, pos, paymentsIn, paymentsOut, returns, pReturns, invoiceTotal, pInvoiceTotal, invoiceDPAmount, invoiceReturnedAmount, pInvoiceReturnedAmount]);

  const partyList = isSales ? customers : suppliers;

  // Rekap potongan per pembayaran (berdasarkan TANGGAL BAYAR) buat SPT & cek finance
  const potRows = useMemo(() => (paymentsIn || [])
    .filter((p) => potonganTotal(p) > 0 && (!start || (p.date || "") >= start) && (!end || (p.date || "") <= end))
    .map((p) => {
      const inv = (invoices || []).find((x) => x.id === p.invoiceId);
      const custId = inv?.customerId || (sos || []).find((x) => x.id === inv?.soId)?.customerId;
      const by = {}; POTONGAN_KINDS.forEach((k) => { by[k.id] = potonganOf(p, k.id); });
      return { id: p.id, date: p.date, no: inv?.noFaktur || "-", party: findName(customers, custId), cash: Number(p.amount) || 0, by, total: potonganTotal(p),
        bukti: p.buktiNo || "", note: (p.potongan || []).filter((x) => x.note).map((x) => x.note).join(", ") };
    })
    .filter((r) => party === "ALL" || r.party === findName(customers, party))
    .filter((r) => { const t = q.trim().toLowerCase(); return !t || `${r.no} ${r.party} ${r.bukti}`.toLowerCase().includes(t); })
    .sort((a, b) => String(a.date).localeCompare(String(b.date))), [paymentsIn, invoices, sos, customers, start, end, party, q]);
  const methodOptions = uniq(allRows.flatMap((r) => r.methods)).sort();

  const rows = allRows
    .filter((r) => (!start || r.paidDate >= start) && (!end || r.paidDate <= end))
    .filter((r) => party === "ALL" || r.partyId === party)
    .filter((r) => method === "ALL" || r.methods.includes(method))
    .filter((r) => {
      const t = q.trim().toLowerCase();
      return !t || `${r.no} ${r.ref} ${findName(partyList, r.partyId)}`.toLowerCase().includes(t);
    })
    .sort((a, b) => (a.paidDate === b.paidDate ? String(a.no).localeCompare(String(b.no)) : a.paidDate.localeCompare(b.paidDate)));

  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const withDays = rows.filter((r) => r.days != null);
  const avgDays = withDays.length ? Math.round(withDays.reduce((s, r) => s + r.days, 0) / withDays.length) : 0;
  const title = isSales ? "Laporan Pelunasan Penjualan" : "Laporan Pelunasan Pembelian";
  const partyLabel = isSales ? "Pelanggan" : "Supplier";

  function exportCSV() {
    if (isPot) {
      const headers = ["No", "Tgl Bayar", "No. Faktur", "Pelanggan", "Uang Diterima", ...POTONGAN_KINDS.map((k) => k.label), "Total Potongan", "No. Bukti Potong", "Keterangan"];
      const data = potRows.map((r, i) => [i + 1, r.date, r.no, r.party, Math.round(r.cash), ...POTONGAN_KINDS.map((k) => Math.round(r.by[k.id])), Math.round(r.total), r.bukti, r.note]);
      data.push(["", "", "", "TOTAL", Math.round(potRows.reduce((s, r) => s + r.cash, 0)), ...POTONGAN_KINDS.map((k) => Math.round(potRows.reduce((s, r) => s + r.by[k.id], 0))), Math.round(potRows.reduce((s, r) => s + r.total, 0)), "", ""]);
      return downloadCSV(`Rekap_Potongan_Pembayaran_${start}_sd_${end}.csv`, headers, data);
    }
    const headers = ["No", "Tgl Lunas", "No. Faktur", "Tgl Faktur", partyLabel, isSales ? "Ref SO" : "Ref PO", "Total Tagihan", "Retur", ...(isSales ? ["DP"] : []), "Dibayar (uang)", ...(isSales ? ["Potongan Pajak", "Potongan Lain"] : []), "Metode Bayar", "Lama Bayar (hari)"];
    const data = rows.map((r, i) => [i + 1, r.paidDate, r.no, r.date, findName(partyList, r.partyId), r.ref, Math.round(r.total), Math.round(r.ret), ...(isSales ? [Math.round(r.dp)] : []), Math.round(r.paid), ...(isSales ? [Math.round(r.potTax), Math.round(r.potOther)] : []), r.methods.join(", "), r.days ?? ""]);
    data.push(["", "", "", "", "TOTAL", "", Math.round(sum("total")), Math.round(sum("ret")), ...(isSales ? [Math.round(sum("dp"))] : []), Math.round(sum("paid")), ...(isSales ? [Math.round(sum("potTax")), Math.round(sum("potOther"))] : []), "", avgDays]);
    downloadCSV(`${title.replace(/ /g, "_")}_${start}_sd_${end}.csv`, headers, data);
  }

  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const td = "px-3 py-2 text-sm";
  const tdR = "px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap";
  const cols = isSales ? 15 : 12;

  return (
    <div className="printable-area">
      {printStyle && <style>{printStyle}</style>}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 no-print">
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: COLOR.primarySoft }}>
          {[["sales", "Penjualan"], ...(canSeePurchase ? [["purchase", "Pembelian"]] : []), ["potongan", "Potongan Pajak & Lain"]].map(([id, label]) => (
            <button key={id} onClick={() => { setKind(id); setParty("ALL"); setMethod("ALL"); setOpen(new Set()); }}
              className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer"
              style={{ background: kind === id || (id === "sales" && kind === "purchase" && !canSeePurchase) ? COLOR.primary : "transparent", color: kind === id ? "#fff" : COLOR.primary }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCSV} variant="ghost" className="text-xs"><Download size={14} /> Export Excel</Button>
          <Button onClick={() => window.print()} variant="ghost" className="text-xs"><Printer size={14} /> Cetak Laporan</Button>
        </div>
      </div>

      <Card className="no-print mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={`Filter ${partyLabel}`}>
            <SearchableSelect value={party} onChange={setParty} placeholder={`Semua ${partyLabel}`}
              pinnedOptions={[{ value: "ALL", label: `Semua ${partyLabel}` }]}
              options={(partyList || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.type || c.category, c.address].filter(Boolean).join(" · ") }))} />
          </Field>
          <Field label="Metode Bayar">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="ALL">Semua Metode</option>
              {methodOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Cari">
            <TextInput placeholder={`No. Faktur / ${partyLabel} / Ref...`} value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
      </Card>

      {isPot ? (
        <PotonganView rows={potRows} start={start} end={end} companyName={companyName} COLOR={COLOR} fmtDate={fmtDate} fmtIDR={fmtIDR} />
      ) : (<>
      <div className="border-b pb-3 mb-4 text-center">
        <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{companyName || "PT WIRYATAMA PUTERA MANDIRI"}</div>
        <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>{title}</h3>
        <p className="text-xs text-gray-500">Tanggal lunas: {fmtDate(start)} s/d {fmtDate(end)}{party !== "ALL" ? ` · ${findName(partyList, party)}` : ""}{method !== "ALL" ? ` · ${method}` : ""}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          ["Faktur Lunas", `${rows.length} faktur`],
          ["Total Nilai Faktur", fmtIDR(sum("total"))],
          ["Total Uang Masuk", fmtIDR(sum("paid") + sum("dp"))],
          ...(isSales && sum("pot") > 0 ? [["Total Potongan", fmtIDR(sum("pot"))]] : []),
          ["Rata-rata Lama Bayar", `${avgDays} hari`],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl border p-3 bg-white" style={{ borderColor: COLOR.border }}>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.inkSoft }}>{label}</div>
            <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: COLOR.ink }}>{val}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: COLOR.border }}>
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
              <th className={th}>No</th>
              <th className={th}>Tgl Lunas</th>
              <th className={th}>No. Faktur</th>
              <th className={th}>Tgl Faktur</th>
              <th className={th}>{partyLabel}</th>
              <th className={th}>{isSales ? "Ref SO" : "Ref PO"}</th>
              <th className={thR}>Total Tagihan</th>
              <th className={thR}>Retur</th>
              {isSales && <th className={thR}>DP</th>}
              <th className={thR}>Dibayar</th>
              {isSales && <th className={thR}>Pot. Pajak</th>}
              {isSales && <th className={thR}>Pot. Lain</th>}
              <th className={th}>Metode</th>
              <th className={thR}>Lama Bayar</th>
              <th className={`${th} no-print`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <React.Fragment key={r.id}>
                <tr style={{ borderTop: `1px solid ${COLOR.border}`, color: COLOR.ink }}>
                  <td className={`${td} tabular-nums`} style={{ color: COLOR.inkSoft }}>{i + 1}</td>
                  <td className={`${td} tabular-nums whitespace-nowrap font-semibold`}>{fmtDate(r.paidDate)}</td>
                  <td className={`${td} tabular-nums font-semibold whitespace-nowrap`}>{r.no}</td>
                  <td className={`${td} tabular-nums whitespace-nowrap`} style={{ color: COLOR.inkSoft }}>{fmtDate(r.date)}</td>
                  <td className={td}>{findName(partyList, r.partyId)}</td>
                  <td className={`${td} text-xs`} style={{ color: COLOR.inkSoft }}>{r.ref}</td>
                  <td className={tdR}>{fmtIDR(r.total)}</td>
                  <td className={tdR} style={{ color: r.ret ? COLOR.warn : COLOR.inkSoft }}>{r.ret ? fmtIDR(r.ret) : "-"}</td>
                  {isSales && <td className={tdR} style={{ color: r.dp ? COLOR.ink : COLOR.inkSoft }}>{r.dp ? fmtIDR(r.dp) : "-"}</td>}
                  <td className={`${tdR} font-semibold`}>{fmtIDR(r.paid)}</td>
                  {isSales && <td className={tdR} style={{ color: r.potTax ? COLOR.warn : COLOR.inkSoft }}>{r.potTax ? fmtIDR(r.potTax) : "-"}</td>}
                  {isSales && <td className={tdR} style={{ color: r.potOther ? COLOR.warn : COLOR.inkSoft }}>{r.potOther ? fmtIDR(r.potOther) : "-"}</td>}
                  <td className={`${td} text-xs`}>{r.methods.join(", ") || "-"}</td>
                  <td className={tdR}>{r.days != null ? `${r.days} hari` : "-"}</td>
                  <td className={`${td} text-right no-print`}>
                    <button onClick={() => toggle(r.id)} className="text-xs font-medium cursor-pointer whitespace-nowrap" style={{ color: COLOR.accent }}>
                      {open.has(r.id) ? "Tutup" : "Riwayat"}
                    </button>
                  </td>
                </tr>
                {open.has(r.id) && (
                  <tr>
                    <td colSpan={cols} className="px-3 pb-3">
                      <PaymentHistory rows={r.history} total={r.total} docNo={r.no} partyLabel={partyLabel} partyName={findName(partyList, r.partyId)} deductions={r.deductions} sisa={0} fmtIDR={fmtIDR} fmtDate={fmtDate} colorConfig={COLOR} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada faktur yang lunas di periode ini.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${COLOR.border}`, background: COLOR.primarySoft, color: COLOR.ink }}>
                <td className={`${td} font-bold`} colSpan={6}>TOTAL ({rows.length} faktur)</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum("total"))}</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum("ret"))}</td>
                {isSales && <td className={`${tdR} font-bold`}>{fmtIDR(sum("dp"))}</td>}
                <td className={`${tdR} font-bold`}>{fmtIDR(sum("paid"))}</td>
                {isSales && <td className={`${tdR} font-bold`}>{fmtIDR(sum("potTax"))}</td>}
                {isSales && <td className={`${tdR} font-bold`}>{fmtIDR(sum("potOther"))}</td>}
                <td className={td}></td>
                <td className={`${tdR} font-bold`}>{avgDays} hari</td>
                <td className="no-print"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>)}
    </div>
  );
}
