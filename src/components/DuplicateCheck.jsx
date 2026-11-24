import React, { useMemo, useState } from "react";
import { Modal, Select, Badge } from "./UIComponents";
import { computeBill } from "../billing";
import { createdRank } from "../invoiceLinks";

// =====================================================================
//  CEK DOKUMEN GANDA (faktur / SO yang kemungkinan dibuat dobel)
//  Dianggap kembar kalau: pelanggan sama + isi barang sama persis (produk, qty,
//  harga, diskon item) + nilai total sama, dan tanggalnya berdekatan.
//  Faktur pecahan golongan / pecahan SO isinya beda, jadi nggak ikut kedeteksi.
// =====================================================================

const itemsKey = (items) => (items || [])
  .map((it) => [it.productId, Number(it.qty) || 0, Math.round(Number(it.unitPrice) || 0), it.discountType || "percent", Number(it.discountPercent) || 0].join(":"))
  .sort()
  .join("|");

const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

export function findDuplicateGroups(docs, { customerOf, windowDays = 7 }) {
  const rank = createdRank(docs);
  const byKey = new Map();
  for (const d of docs || []) {
    const cust = customerOf(d);
    if (!cust || !(d.items || []).length) continue;
    const total = Math.round(computeBill(d).total);
    const key = `${cust}#${itemsKey(d.items)}#${total}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ doc: d, total, cust, rank: rank(d) });
  }
  const groups = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.doc.date || "").localeCompare(String(b.doc.date || "")) || a.rank - b.rank);
    // potong jadi klaster: tanggal berurutan yang jaraknya <= windowDays
    let cur = [list[0]];
    const flush = () => { if (cur.length > 1) groups.push([...cur].sort((a, b) => a.rank - b.rank)); };
    for (let i = 1; i < list.length; i++) {
      if (windowDays === Infinity || dayDiff(list[i].doc.date, cur[cur.length - 1].doc.date) <= windowDays) cur.push(list[i]);
      else { flush(); cur = [list[i]]; }
    }
    flush();
  }
  return groups.sort((a, b) => String(b[0].doc.date || "").localeCompare(String(a[0].doc.date || "")));
}

export default function DuplicateCheckModal({ onClose, invoices, sos, customers, products, findName, fmtDate, fmtIDR, colorConfig: c, invoiceInfo, onCancelInvoice }) {
  const [kind, setKind] = useState("invoice");
  const [win, setWin] = useState("7");
  const windowDays = win === "all" ? Infinity : Number(win);

  const custOfInv = (inv) => inv.customerId || (sos || []).find((x) => x.id === inv.soId)?.customerId;
  const groups = useMemo(() => (kind === "invoice"
    ? findDuplicateGroups(invoices, { customerOf: custOfInv, windowDays })
    : findDuplicateGroups(sos, { customerOf: (so) => so.customerId, windowDays })), [kind, invoices, sos, windowDays]);

  const soNo = (id) => (sos || []).find((x) => x.id === id)?.soNumber;
  const itemsText = (items) => (items || []).map((it) => `${(products || []).find((p) => p.id === it.productId)?.name || "?"} x${it.qty}`).join(", ");
  const dupCount = groups.reduce((s, g) => s + g.length - 1, 0);

  return (
    <Modal title="Cek Dokumen Ganda" onClose={onClose} colorConfig={c}>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto" colorConfig={c}>
          <option value="invoice">Faktur Penjualan</option>
          <option value="so">Sales Order</option>
        </Select>
        <Select value={win} onChange={(e) => setWin(e.target.value)} className="!w-auto" colorConfig={c}>
          <option value="1">Jarak tanggal maks 1 hari</option>
          <option value="7">Jarak tanggal maks 7 hari</option>
          <option value="30">Jarak tanggal maks 30 hari</option>
          <option value="all">Semua tanggal</option>
        </Select>
      </div>
      <p className="text-xs mb-3" style={{ color: c?.inkSoft }}>
        Kembar = pelanggan sama, produk + qty + harga sama persis, dan total sama. {groups.length ? <b style={{ color: c?.warn }}>{groups.length} kelompok, {dupCount} dokumen kemungkinan dobel.</b> : "Nggak ada yang kembar."}
        {" "}Yang dibuat paling awal ditandai "asli". Pelanggan langganan yang memang order sama tiap minggu bisa ikut muncul, jadi cek dulu sebelum dibatalkan.
      </p>
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
        {groups.map((g, gi) => (
          <div key={gi} className="rounded-lg p-3" style={{ border: `1px solid ${c?.border}`, background: c?.cardSoft || c?.bg }}>
            <div className="text-sm font-semibold" style={{ color: c?.ink }}>{findName(customers, g[0].cust)} · {fmtIDR(g[0].total)}</div>
            <div className="text-[11px] mb-2" style={{ color: c?.inkSoft }}>{itemsText(g[0].doc.items)}</div>
            <div className="flex flex-col gap-1.5">
              {g.map((x, i) => {
                const d = x.doc;
                const info = kind === "invoice" && invoiceInfo ? invoiceInfo(d) : null;
                return (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs py-1" style={{ borderTop: i ? `1px dashed ${c?.border}` : "none", color: c?.ink }}>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <Badge tone={i === 0 ? "good" : "warn"} colorConfig={c}>{i === 0 ? "asli" : "kemungkinan dobel"}</Badge>
                      <span className="font-semibold tabular-nums">{kind === "invoice" ? d.noFaktur : d.soNumber}</span>
                      <span className="tabular-nums" style={{ color: c?.inkSoft }}>{fmtDate(d.date)}</span>
                      {kind === "invoice" && <span style={{ color: c?.inkSoft }}>{d.isDirect ? "Langsung" : `dari ${soNo(d.soId) || "SO"}`}</span>}
                      {info && <span style={{ color: info.paid > 0 ? c?.good : c?.inkSoft }}>{info.paid > 0 ? `sudah dibayar ${fmtIDR(info.paid)}` : "belum ada pembayaran"}{info.hasReturn ? " · ada retur" : ""}</span>}
                    </div>
                    {kind === "invoice" && i > 0 && onCancelInvoice && (
                      info?.canCancel
                        ? <button onClick={() => { if (confirm(`Batalkan faktur ${d.noFaktur}? Faktur asli ${g[0].doc.noFaktur} tetap ada. Stok dari faktur ini dikembalikan.`)) onCancelInvoice(d); }} className="text-xs font-semibold cursor-pointer" style={{ color: c?.danger }}>Batalkan faktur ini</button>
                        : <span className="text-[11px]" style={{ color: c?.inkSoft }}>sudah ada pembayaran/retur, hapus dulu pembayarannya</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {kind === "so" && groups.length > 0 && <p className="text-[11px] mt-3" style={{ color: c?.inkSoft }}>SO dobel dibatalkan lewat tab Sales Order.</p>}
    </Modal>
  );
}
