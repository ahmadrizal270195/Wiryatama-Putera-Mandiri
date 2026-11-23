import React from "react";

// Riwayat pembayaran satu faktur (ditampilkan di bawah baris faktur).
// rows: [{ date, label, sub, amount, kind: "bayar" | "dp" | "retur" }]
export default function PaymentHistory({ rows, total, docNo, partyLabel, partyName, deductions = [], sisa, fmtIDR, fmtDate, colorConfig: c, emptyText = "Belum ada pembayaran." }) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const tone = (k) => (k === "retur" ? c?.warn : k === "dp" ? c?.accent : c?.good);
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: c?.bg, border: `1px solid ${c?.border}` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 mb-2">
        <div className="font-semibold" style={{ color: c?.ink }}>Riwayat Pembayaran{docNo ? <span className="tabular-nums"> · {docNo}</span> : null}</div>
        {partyName ? (
          <div style={{ color: c?.inkSoft }}>{partyLabel ? `${partyLabel}: ` : ""}<span className="font-semibold" style={{ color: c?.ink }}>{partyName}</span></div>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <div className="mb-2" style={{ color: c?.inkSoft }}>{emptyText}</div>
      ) : (
        <table className="w-full mb-2">
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={{ borderTop: i ? `1px dashed ${c?.border}` : "none" }}>
                <td className="py-1 pr-3 tabular-nums whitespace-nowrap" style={{ color: c?.inkSoft }}>{r.date ? fmtDate(r.date) : "-"}</td>
                <td className="py-1 pr-3" style={{ color: c?.ink }}>
                  <span className="font-semibold" style={{ color: tone(r.kind) }}>{r.label}</span>
                  {r.sub ? <span style={{ color: c?.inkSoft }}> · {r.sub}</span> : null}
                </td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap" style={{ color: c?.ink }}>{fmtIDR(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-col gap-0.5 pt-2 tabular-nums" style={{ borderTop: `1px solid ${c?.border}`, color: c?.ink }}>
        <div className="flex justify-between"><span style={{ color: c?.inkSoft }}>Total tagihan</span><span>{fmtIDR(total)}</span></div>
        {deductions.filter((d) => d.amount).map((d, i) => (
          <div key={i} className="flex justify-between"><span style={{ color: c?.inkSoft }}>{d.label}</span><span>- {fmtIDR(d.amount)}</span></div>
        ))}
        <div className="flex justify-between font-semibold"><span>Sisa</span><span style={{ color: sisa > 0 ? c?.danger : c?.good }}>{sisa > 0 ? fmtIDR(sisa) : "Lunas"}</span></div>
      </div>
    </div>
  );
}
