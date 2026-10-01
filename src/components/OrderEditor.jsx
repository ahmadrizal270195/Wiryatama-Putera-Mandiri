import React, { useMemo, useState } from "react";
import { Trash2, Plus, Search, AlertTriangle } from "lucide-react";
import { DEDUCTION_KINDS, itemLineTotal } from "../billing";

const inputCls = "w-full rounded-md border px-2 py-1 text-xs outline-none focus:ring-1";
const inStyle = (c, warn) => ({
  background: c?.surface || "#fff",
  color: c?.ink || "#15302D",
  borderColor: warn ? (c?.warn || "#C97F1E") : (c?.border || "#CBD5E1"),
});

function NumInput({ value, onChange, onBlur, disabled, c, warn, className = "", placeholder }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        // Cuma terima angka (tanpa tombol panah naik-turun yang bikin angka panjang kepotong)
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        onChange(raw === "" ? "" : /\.$/.test(raw) ? raw : Math.max(0, Number(raw) || 0)); // "2." dibiarkan supaya bisa ketik desimal
      }}
      onBlur={onBlur}
      className={`${inputCls} font-mono text-right disabled:opacity-60 ${className}`}
      style={inStyle(c, warn)}
    />
  );
}

function ModeSelect({ value, onChange, disabled, c }) {
  return (
    <select
      value={value || "percent"}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border px-1 py-1 text-xs font-bold outline-none cursor-pointer disabled:opacity-60 shrink-0"
      style={{ ...inStyle(c), color: c?.primary || "#0E4749" }}
    >
      <option value="percent">%</option>
      <option value="amount">Rp</option>
    </select>
  );
}

// ---------------------------------------------------------------------
//  Tabel item ringkas: 1 baris per produk, nomor urut, cek otomatis
// ---------------------------------------------------------------------
export function ItemsTable({
  items, products, stockByProduct, showStock = false, readOnly = false, withBatch = false,
  onUpdate, onRemove, fmtIDR, colorConfig: c, priceLabel = "Harga", title = "Rincian Item",
}) {
  const [q, setQ] = useState("");
  const prodOf = (id) => (products || []).find((p) => p.id === id);

  const rows = useMemo(() => {
    const countByProduct = {};
    (items || []).forEach((it) => { countByProduct[it.productId] = (countByProduct[it.productId] || 0) + 1; });
    return (items || []).map((it, i) => {
      const p = prodOf(it.productId);
      const issues = [];
      if (it.qty === "" || Number(it.qty) <= 0) issues.push("qty kosong");
      if (it.unitPrice === "" || Number(it.unitPrice) <= 0) issues.push("harga 0");
      if (showStock) {
        const s = stockByProduct?.[it.productId]?.qty ?? 0;
        if (Number(it.qty) > s) issues.push(`stok cuma ${s}`);
      }
      if (withBatch) {
        if (!String(it.batchNo || "").trim()) issues.push("batch kosong");
        if (!it.expiryDate) issues.push("ED kosong");
      } else if (countByProduct[it.productId] > 1) {
        issues.push("produk dobel");
      }
      return { it, i, p, issues };
    });
  }, [items, products, stockByProduct, showStock, withBatch]);

  const shown = q.trim()
    ? rows.filter((r) => `${r.p?.name || ""} ${r.p?.category || ""} ${r.it.batchNo || ""}`.toLowerCase().includes(q.toLowerCase()))
    : rows;
  const totalQty = rows.reduce((s, r) => s + (Number(r.it.qty) || 0), 0);
  const problemCount = rows.filter((r) => r.issues.length).length;
  const th = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: c?.primary }}>{title}</div>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: c?.primarySoft, color: c?.primary }}>
          {rows.length} item · {totalQty.toLocaleString("id-ID")} qty
        </span>
        {problemCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1" style={{ background: c?.warnSoft, color: c?.warn }}>
            <AlertTriangle size={11} /> {problemCount} baris perlu dicek
          </span>
        )}
        {rows.length > 6 && (
          <div className="relative ml-auto w-full sm:w-56">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" color={c?.inkSoft} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di item yang sudah masuk..."
              className={`${inputCls} pl-7`} style={inStyle(c)} />
          </div>
        )}
      </div>

      <div className="rounded-lg border overflow-auto" style={{ borderColor: c?.border, maxHeight: "48vh" }}>
        <table className="w-full text-xs" style={{ minWidth: withBatch ? 860 : 680 }}>
          <thead className="sticky top-0 z-[1]" style={{ background: c?.cardSoft || c?.primarySoft }}>
            <tr style={{ color: c?.primary }}>
              <th className={th} style={{ width: 32 }}>No</th>
              <th className={th}>Produk</th>
              {withBatch && <th className={th} style={{ width: 110 }}>No. Batch</th>}
              {withBatch && <th className={th} style={{ width: 130 }}>Exp Date</th>}
              <th className={th} style={{ width: 80 }}>Qty</th>
              <th className={th} style={{ width: 120 }}>{priceLabel}</th>
              <th className={th} style={{ width: 160 }}>Diskon Item</th>
              <th className={`${th} text-right`} style={{ width: 120 }}>Subtotal</th>
              {!readOnly && <th className={th} style={{ width: 32 }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-6" style={{ color: c?.inkSoft }}>Belum ada item. Tambahkan produk dari daftar di atas.</td></tr>
            )}
            {rows.length > 0 && shown.length === 0 && (
              <tr><td colSpan={9} className="text-center py-6" style={{ color: c?.inkSoft }}>Tidak ada item yang cocok dengan "{q}".</td></tr>
            )}
            {shown.map(({ it, i, p, issues }) => {
              const warn = issues.length > 0;
              const s = stockByProduct?.[it.productId]?.qty ?? 0;
              return (
                <tr key={i} style={{ borderTop: `1px solid ${c?.border}`, background: warn ? c?.warnSoft : (i % 2 ? c?.bg : "transparent") }}>
                  <td className="px-2 py-1.5 font-mono" style={{ color: c?.inkSoft }}>{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-semibold leading-tight" style={{ color: c?.ink }}>{p?.name || "(produk dihapus)"}</div>
                    <div className="text-[10px]" style={{ color: warn ? c?.warn : c?.inkSoft }}>
                      {showStock ? `Stok ${s} ${p?.unit || ""}` : p?.unit || ""}
                      {warn ? ` · ${issues.join(", ")}` : ""}
                    </div>
                  </td>
                  {withBatch && (
                    <td className="px-2 py-1.5">
                      <input value={it.batchNo || ""} disabled={readOnly} onChange={(e) => onUpdate(i, { batchNo: e.target.value })}
                        placeholder="Batch" className={inputCls} style={inStyle(c, !String(it.batchNo || "").trim())} />
                    </td>
                  )}
                  {withBatch && (
                    <td className="px-2 py-1.5">
                      <input type="date" value={it.expiryDate || ""} disabled={readOnly} onChange={(e) => onUpdate(i, { expiryDate: e.target.value })}
                        className={inputCls} style={inStyle(c, !it.expiryDate)} />
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <NumInput value={it.qty} disabled={readOnly} c={c} warn={it.qty === "" || Number(it.qty) <= 0}
                      onChange={(v) => onUpdate(i, { qty: v })}
                      onBlur={() => { if (it.qty === "" || Number(it.qty) <= 0) onUpdate(i, { qty: 1 }); }} />
                  </td>
                  <td className="px-2 py-1.5">
                    <NumInput value={it.unitPrice} disabled={readOnly} c={c} warn={it.unitPrice === "" || Number(it.unitPrice) <= 0}
                      onChange={(v) => onUpdate(i, { unitPrice: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <ModeSelect value={it.discountType} disabled={readOnly} c={c} onChange={(t) => onUpdate(i, { discountType: t })} />
                      <NumInput value={it.discountPercent ?? 0} disabled={readOnly} c={c}
                        onChange={(v) => onUpdate(i, { discountPercent: it.discountType === "amount" ? v : (v === "" ? "" : Math.min(100, v)) })} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: c?.ink }}>{fmtIDR(itemLineTotal(it))}</td>
                  {!readOnly && (
                    <td className="px-1 py-1.5 text-center">
                      <button onClick={() => onRemove(i)} title="Hapus item" className="p-1 rounded hover:opacity-70 cursor-pointer">
                        <Trash2 size={14} color={c?.danger} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Pemotongan tagihan: Diskon nota/global & Fee, bisa lebih dari 1 baris
// ---------------------------------------------------------------------
let seq = 0;
const newRowId = () => `ded-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function DeductionsEditor({ deductions, onChange, bill, colorConfig: c, fmtIDR, disabled = false }) {
  const list = deductions || [];
  const amountOf = (d) => {
    const line = [...(bill?.diskonLines || []), ...(bill?.feeLines || [])].find((x) => x.id === d.id);
    return line ? line.amount : 0;
  };
  function update(id, patch) { onChange(list.map((d) => (d.id === id ? { ...d, ...patch } : d))); }
  function add() { onChange([...list, { id: newRowId(), kind: "diskon", mode: "percent", value: "", note: "" }]); }
  function remove(id) { onChange(list.filter((d) => d.id !== id)); }

  return (
    <div className="mb-4 rounded-lg border p-3" style={{ borderColor: c?.border, background: c?.bg }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: c?.primary }}>Pemotongan Tagihan</div>
          <div className="text-[10px]" style={{ color: c?.inkSoft }}>Diskon dipotong sebelum PPN. Fee dipotong setelah PPN (persen dihitung dari DPP).</div>
        </div>
        {!disabled && (
          <button onClick={add} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border cursor-pointer"
            style={{ color: c?.primary, borderColor: c?.primary }}>
            <Plus size={12} /> Tambah Pemotongan
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="text-[11px]" style={{ color: c?.inkSoft }}>Tidak ada pemotongan.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((d) => (
            <div key={d.id} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "minmax(150px,1.2fr) auto minmax(90px,0.8fr) minmax(120px,1.4fr) minmax(100px,0.8fr) 28px" }}>
              <select value={d.kind} disabled={disabled} onChange={(e) => update(d.id, { kind: e.target.value })}
                className={`${inputCls} cursor-pointer font-semibold`} style={inStyle(c)}>
                {DEDUCTION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <ModeSelect value={d.mode} disabled={disabled} c={c} onChange={(m) => update(d.id, { mode: m })} />
              <NumInput value={d.value} disabled={disabled} c={c} placeholder={d.mode === "amount" ? "Rp 0" : "0 %"}
                onChange={(v) => update(d.id, { value: d.mode === "amount" ? v : (v === "" ? "" : Math.min(100, v)) })} />
              <input value={d.note || ""} disabled={disabled} onChange={(e) => update(d.id, { note: e.target.value })}
                placeholder={d.kind === "fee" ? "Keterangan, mis. fee marketing" : "Keterangan (opsional)"} className={inputCls} style={inStyle(c)} />
              <div className="text-right font-mono text-xs font-semibold whitespace-nowrap" style={{ color: c?.danger }}>- {fmtIDR(amountOf(d))}</div>
              {!disabled ? (
                <button onClick={() => remove(d.id)} title="Hapus" className="p-1 rounded hover:opacity-70 cursor-pointer"><Trash2 size={14} color={c?.danger} /></button>
              ) : <span />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
//  Ringkasan total tagihan
// ---------------------------------------------------------------------
export function BillSummary({ bill, fmtIDR, colorConfig: c, totalLabel = "Total" }) {
  const label = (d, base) => {
    const name = d.kind === "fee" ? "Fee" : "Diskon Nota";
    const extra = d.mode === "amount" ? "" : ` ${Number(d.value)}%`;
    return `${name}${extra}${d.note ? ` (${d.note})` : ""}`;
  };
  const Row = ({ k, v, tone, bold }) => (
    <div className={`flex justify-between gap-6 ${bold ? "font-bold text-sm mt-1 pt-1 border-t" : ""}`} style={{ borderColor: c?.border }}>
      <span style={{ color: bold ? c?.ink : c?.inkSoft }}>{k}</span>
      <span className="font-mono font-semibold" style={{ color: tone || c?.ink }}>{v}</span>
    </div>
  );
  return (
    <div className="text-xs flex flex-col gap-0.5 min-w-[260px]">
      <Row k="Subtotal" v={fmtIDR(bill.raw)} />
      {bill.diskonLines.filter((d) => d.amount > 0).map((d) => <Row key={d.id} k={label(d)} v={`- ${fmtIDR(d.amount)}`} tone={c?.danger} />)}
      <Row k="DPP" v={fmtIDR(bill.dpp)} />
      {bill.taxType !== "none" && <Row k="PPN 11%" v={fmtIDR(bill.ppn)} tone={c?.accent} />}
      {bill.feeLines.filter((d) => d.amount > 0).map((d) => <Row key={d.id} k={label(d)} v={`- ${fmtIDR(d.amount)}`} tone={c?.danger} />)}
      {bill.ongkir > 0 && <Row k="Ongkir" v={`+ ${fmtIDR(bill.ongkir)}`} />}
      <Row k={totalLabel} v={fmtIDR(bill.total)} bold />
    </div>
  );
}

// Penanda di daftar pilih produk: produk ini sudah masuk daftar item (dan berapa qty-nya)
export function AddedBadge({ items, productId, colorConfig: c }) {
  const rows = (items || []).filter((x) => x.productId === productId);
  if (!rows.length) return null;
  const qty = rows.reduce((s, x) => s + (Number(x.qty) || 0), 0);
  return (
    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: c?.goodSoft || "#E9F3ED", color: c?.good || "#357A5D" }}>
      ✓ sudah di daftar ({qty})
    </span>
  );
}
