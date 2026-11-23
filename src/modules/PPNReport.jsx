import React, { useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Card, Button, Field, TextInput, Select } from "../components/UIComponents";
import SearchableSelect from "../components/SearchableSelect";
import { computeBill } from "../billing";
import { potonganOf } from "../paymentDeductions";

// =====================================================================
//  REKAP PPN KELUARAN
//  Semua faktur penjualan ber-PPN di periode (tanggal faktur), dipisah:
//   - Disetor sendiri : pelanggan biasa, PPN dibayar pelanggan ke kita, kita setor
//   - Dipungut         : pelanggan pemungut (instansi pemerintah / BUMN), PPN disetor pemungut
//  Retur mengurangi DPP & PPN secara proporsional terhadap nilai faktur.
//  Kode transaksi faktur pajak = saran (01 / 02 / 03), cek lagi ke konsultan pajak.
// =====================================================================

const KIND = {
  self: { label: "Disetor sendiri", kode: "01" },
  pemerintah: { label: "Dipungut instansi pemerintah", kode: "02" },
  bumn: { label: "Dipungut BUMN / pemungut lain", kode: "03" },
};

function downloadCSV(filename, headers, rows) {
  const esc = (v) => { const t = v == null ? "" : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const body = ["sep=;", headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PPNReport({ start, end, invoices, sos, customers, paymentsIn, invoiceReturnedAmount, findName, fmtDate, fmtIDR, COLOR, companyName, printStyle }) {
  const [kindFilter, setKindFilter] = useState("ALL");
  const [party, setParty] = useState("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const out = [];
    for (const inv of invoices || []) {
      if (!inv.taxType || inv.taxType === "none") continue;
      if ((start && (inv.date || "") < start) || (end && (inv.date || "") > end)) continue;
      const bill = computeBill(inv, { includeOngkir: false });
      if (!(bill.ppn > 0)) continue;
      const custId = inv.customerId || (sos || []).find((x) => x.id === inv.soId)?.customerId;
      const cust = (customers || []).find((c) => c.id === custId);
      const kind = cust?.taxCollector === "pemerintah" ? "pemerintah" : cust?.taxCollector ? "bumn" : "self";
      // Retur (nilai item qty x harga) dibandingkan nilai faktur sebelum PPN/fee -> porsi DPP & PPN yang batal
      const base = Math.max(0, bill.raw - bill.diskon);
      const ret = invoiceReturnedAmount ? invoiceReturnedAmount(inv.id) : 0;
      const retRatio = base > 0 ? Math.min(1, ret / base) : 0;
      const dpp = bill.dpp * (1 - retRatio);
      const ppn = bill.ppn * (1 - retRatio);
      const ppnCut = (paymentsIn || []).filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + potonganOf(p, "ppn"), 0);
      out.push({
        id: inv.id, date: inv.date, no: inv.noFaktur, custId, cust: cust?.name || "-", npwp: cust?.npwp || "",
        kind, dppGross: bill.dpp, ppnGross: bill.ppn, retDpp: bill.dpp - dpp, retPpn: bill.ppn - ppn, dpp, ppn, ppnCut,
        cutStatus: kind === "self" ? "" : ppnCut <= 0.5 ? "belum dibayar / belum dicatat" : Math.abs(ppnCut - ppn) <= Math.max(1000, ppn * 0.01) ? "cocok" : "selisih",
      });
    }
    return out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.no).localeCompare(String(b.no)));
  }, [invoices, sos, customers, paymentsIn, start, end, invoiceReturnedAmount]);

  const shown = rows
    .filter((r) => kindFilter === "ALL" || (kindFilter === "pungut" ? r.kind !== "self" : r.kind === kindFilter))
    .filter((r) => party === "ALL" || r.custId === party)
    .filter((r) => { const t = q.trim().toLowerCase(); return !t || `${r.no} ${r.cust} ${r.npwp}`.toLowerCase().includes(t); });

  const sum = (list, k) => list.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const self = shown.filter((r) => r.kind === "self");
  const pungut = shown.filter((r) => r.kind !== "self");

  function exportCSV() {
    const headers = ["No", "Tgl Faktur", "No. Faktur", "Pelanggan", "NPWP", "Jenis", "Kode Transaksi (saran)", "DPP", "PPN", "Retur DPP", "Retur PPN", "DPP Bersih", "PPN Bersih", "PPN Dipungut Tercatat", "Status Pungutan"];
    const data = shown.map((r, i) => [i + 1, r.date, r.no, r.cust, r.npwp, KIND[r.kind].label, KIND[r.kind].kode, Math.round(r.dppGross), Math.round(r.ppnGross), Math.round(r.retDpp), Math.round(r.retPpn), Math.round(r.dpp), Math.round(r.ppn), Math.round(r.ppnCut), r.cutStatus]);
    data.push(["", "", "", "TOTAL", "", "", "", Math.round(sum(shown, "dppGross")), Math.round(sum(shown, "ppnGross")), Math.round(sum(shown, "retDpp")), Math.round(sum(shown, "retPpn")), Math.round(sum(shown, "dpp")), Math.round(sum(shown, "ppn")), Math.round(sum(shown, "ppnCut")), ""]);
    downloadCSV(`Rekap_PPN_Keluaran_${start}_sd_${end}.csv`, headers, data);
  }

  const th = "text-left px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const thR = "text-right px-3 py-2 text-xs uppercase tracking-wide whitespace-nowrap";
  const td = "px-3 py-2 text-sm";
  const tdR = "px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap";
  const statusColor = (s) => (s === "cocok" ? COLOR.good : s === "selisih" ? COLOR.danger : COLOR.warn);

  return (
    <div className="printable-area">
      {printStyle && <style>{printStyle}</style>}
      <div className="flex justify-end gap-2 mb-2 no-print">
        <Button onClick={exportCSV} variant="ghost" className="text-xs"><Download size={14} /> Export Excel</Button>
        <Button onClick={() => window.print()} variant="ghost" className="text-xs"><Printer size={14} /> Cetak Laporan</Button>
      </div>

      <Card className="no-print mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Jenis">
            <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="ALL">Semua faktur ber-PPN</option>
              <option value="self">Disetor sendiri</option>
              <option value="pungut">Dipungut instansi/BUMN</option>
            </Select>
          </Field>
          <Field label="Pelanggan">
            <SearchableSelect value={party} onChange={setParty} placeholder="Semua Pelanggan"
              pinnedOptions={[{ value: "ALL", label: "Semua Pelanggan" }]}
              options={(customers || []).map((c) => ({ value: c.id, label: c.name, sublabel: [c.type, c.npwp].filter(Boolean).join(" · ") }))} />
          </Field>
          <Field label="Cari">
            <TextInput placeholder="No. faktur / pelanggan / NPWP..." value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="border-b pb-3 mb-4 text-center">
        <div className="text-base font-bold uppercase tracking-wide" style={{ color: COLOR.ink }}>{companyName || "PT WIRYATAMA PUTERA MANDIRI"}</div>
        <h3 className="font-bold text-sm uppercase" style={{ color: COLOR.primary }}>Rekap PPN Keluaran</h3>
        <p className="text-xs text-gray-500">Tanggal faktur: {fmtDate(start)} s/d {fmtDate(end)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {[
          ["Total PPN Keluaran", sum(shown, "ppn"), `DPP ${fmtIDR(sum(shown, "dpp"))} · ${shown.length} faktur`],
          ["PPN disetor sendiri", sum(self, "ppn"), `DPP ${fmtIDR(sum(self, "dpp"))} · ${self.length} faktur`],
          ["PPN dipungut pemungut", sum(pungut, "ppn"), `tercatat dipotong ${fmtIDR(sum(pungut, "ppnCut"))} · ${pungut.length} faktur`],
        ].map(([label, val, sub]) => (
          <div key={label} className="rounded-xl border p-3 bg-white" style={{ borderColor: COLOR.border }}>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.inkSoft }}>{label}</div>
            <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color: COLOR.ink }}>{fmtIDR(val)}</div>
            <div className="text-[11px] tabular-nums" style={{ color: COLOR.inkSoft }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: COLOR.border }}>
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr style={{ background: COLOR.primarySoft, color: COLOR.primary }}>
              <th className={th}>No</th><th className={th}>Tgl Faktur</th><th className={th}>No. Faktur</th><th className={th}>Pelanggan</th><th className={th}>NPWP</th>
              <th className={th}>Jenis</th><th className={th}>Kode</th>
              <th className={thR}>DPP</th><th className={thR}>PPN</th><th className={thR}>Retur PPN</th><th className={thR}>PPN Bersih</th>
              <th className={thR}>PPN Dipungut</th><th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLOR.border}`, color: COLOR.ink }}>
                <td className={`${td} tabular-nums`} style={{ color: COLOR.inkSoft }}>{i + 1}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>{fmtDate(r.date)}</td>
                <td className={`${td} tabular-nums font-semibold whitespace-nowrap`}>{r.no}</td>
                <td className={td}>{r.cust}</td>
                <td className={`${td} tabular-nums text-xs whitespace-nowrap`} style={{ color: r.npwp ? COLOR.ink : COLOR.danger }}>{r.npwp || "belum ada"}</td>
                <td className={`${td} text-xs`}>{KIND[r.kind].label}</td>
                <td className={`${td} tabular-nums text-xs`}>{KIND[r.kind].kode}</td>
                <td className={tdR}>{fmtIDR(r.dppGross)}</td>
                <td className={tdR}>{fmtIDR(r.ppnGross)}</td>
                <td className={tdR} style={{ color: r.retPpn ? COLOR.warn : COLOR.inkSoft }}>{r.retPpn ? `- ${fmtIDR(r.retPpn)}` : "-"}</td>
                <td className={`${tdR} font-semibold`}>{fmtIDR(r.ppn)}</td>
                <td className={tdR} style={{ color: COLOR.inkSoft }}>{r.kind === "self" ? "-" : fmtIDR(r.ppnCut)}</td>
                <td className={`${td} text-xs`} style={{ color: statusColor(r.cutStatus) }}>{r.cutStatus || "-"}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={13} className="text-center py-8 text-sm" style={{ color: COLOR.inkSoft }}>Belum ada faktur ber-PPN di periode ini.</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${COLOR.border}`, background: COLOR.primarySoft, color: COLOR.ink }}>
                <td className={`${td} font-bold`} colSpan={7}>TOTAL ({shown.length} faktur)</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum(shown, "dppGross"))}</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum(shown, "ppnGross"))}</td>
                <td className={`${tdR} font-bold`}>{sum(shown, "retPpn") ? `- ${fmtIDR(sum(shown, "retPpn"))}` : "-"}</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum(shown, "ppn"))}</td>
                <td className={`${tdR} font-bold`}>{fmtIDR(sum(shown, "ppnCut"))}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] mt-2" style={{ color: COLOR.inkSoft }}>
        Periode pakai tanggal faktur. Retur mengurangi DPP & PPN secara proporsional. Kode transaksi faktur pajak (01 biasa, 02 instansi pemerintah, 03 pemungut lain) adalah saran, cocokkan dengan e-Faktur / Coretax. Status pungutan dibaca dari potongan PPN yang dicatat waktu terima pembayaran.
      </p>
    </div>
  );
}
