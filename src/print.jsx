import React from "react";
import { Printer } from "lucide-react";
import { QA_CLASSES, decisionByText } from "./qa";

// ---------------------------------------------------------------------
//  CETAK DOKUMEN (dioptimalkan untuk printer dot matrix / continuous form)
//  - Semua teks & garis dipaksa HITAM pekat (abu-abu/hijau jadi titik jarang di dot matrix)
//  - Font Arial ukuran normal, tanpa latar berwarna
//  - Ukuran kertas bisa dipilih: continuous 9,5 x 11 in, setengah (9,5 x 5,5 in), atau A4
// ---------------------------------------------------------------------
const PAPER_KEY = "erp-print-paper";
const PAPER_OPTIONS = [
  { id: "continuous", label: "Continuous Form 9,5 x 11 in", css: "9.5in 11in", margin: "6mm 8mm" },
  { id: "half", label: "Setengah Continuous 9,5 x 5,5 in", css: "9.5in 5.5in", margin: "4mm 8mm",
    // versi rapat supaya muat setengah halaman (kayak format Excel)
    extra: `
      body { font-size: 9pt !important; }
      .text-\\[9px\\], .text-\\[10px\\], .text-\\[11px\\], .text-xs { font-size: 8.5pt !important; line-height: 1.2 !important; }
      .text-sm { font-size: 9.5pt !important; } .text-base, .text-lg, .text-xl { font-size: 11pt !important; }
      [class*="mt-"], [class*="pt-"], [class*="mb-"], [class*="pb-"] { margin-top: 2px !important; margin-bottom: 2px !important; padding-top: 1px !important; padding-bottom: 1px !important; }
      .mb-12 { margin-bottom: 26px !important; }
      table th, table td { padding: 1px 4px !important; }
      img { max-height: 30px !important; }
    ` },
  { id: "a4", label: "A4 (printer biasa / PDF)", css: "A4 portrait", margin: "12mm 10mm" },
];
export function getPaper() {
  let id = "continuous";
  try { id = localStorage.getItem(PAPER_KEY) || "continuous"; } catch (_) { /* abaikan */ }
  return PAPER_OPTIONS.find((p) => p.id === id) || PAPER_OPTIONS[0];
}

// Jendela kecil "Pilih ukuran kertas" yang muncul setiap kali klik Cetak.
// Dibuat langsung pakai DOM supaya bisa dipanggil dari tombol mana pun tanpa state tambahan.
export function choosePaperAndPrint(elementId, titleText) {
  const choices = PAPER_OPTIONS.filter((p) => p.id !== "a4");
  const last = getPaper().id;
  let dark = false;
  try { dark = localStorage.getItem("erp-theme") === "dark"; } catch (_) { /* abaikan */ }
  // Warna sendiri (pakai id + !important) supaya tidak ketimpa CSS mode gelap aplikasi
  const C = dark
    ? { overlay: "rgba(0,0,0,.7)", box: "#0F172A", border: "#334155", text: "#F8FAFC", soft: "#94A3B8", card: "#1E293B", activeBg: "rgba(0,196,140,.15)", active: "#00C48C", link: "#34D399", btn: "#1E293B" }
    : { overlay: "rgba(0,0,0,.55)", box: "#FFFFFF", border: "#CBD5E1", text: "#15302D", soft: "#5C7873", card: "#FFFFFF", activeBg: "#E8F0EF", active: "#0E4749", link: "#0E4749", btn: "#F1F5F9" };

  document.getElementById("erp-paper-chooser")?.remove();
  const overlay = document.createElement("section");
  overlay.id = "erp-paper-chooser";
  overlay.setAttribute("role", "dialog");
  overlay.innerHTML = `
    <style>
      #erp-paper-chooser { position:fixed !important; inset:0 !important; z-index:9999 !important; background:${C.overlay} !important; display:flex !important; align-items:center !important; justify-content:center !important; padding:16px !important; font-family:ui-sans-serif,system-ui,sans-serif !important; }
      #erp-paper-chooser .pc-box { background:${C.box} !important; color:${C.text} !important; border:1px solid ${C.border} !important; border-radius:14px !important; padding:20px !important; width:100% !important; max-width:420px !important; box-shadow:0 20px 50px rgba(0,0,0,.4) !important; }
      #erp-paper-chooser .pc-title { color:${C.text} !important; font-weight:700 !important; font-size:16px !important; margin-bottom:4px !important; }
      #erp-paper-chooser .pc-sub { color:${C.soft} !important; font-size:12px !important; margin-bottom:14px !important; }
      #erp-paper-chooser .pc-opt { display:block !important; width:100% !important; text-align:left !important; background:${C.card} !important; border:2px solid ${C.border} !important; border-radius:10px !important; padding:10px 12px !important; cursor:pointer !important; margin-bottom:8px !important; }
      #erp-paper-chooser .pc-opt:hover { border-color:${C.active} !important; }
      #erp-paper-chooser .pc-opt.active { background:${C.activeBg} !important; border-color:${C.active} !important; }
      #erp-paper-chooser .pc-size { color:${C.text} !important; font-weight:700 !important; font-size:15px !important; }
      #erp-paper-chooser .pc-note { color:${C.soft} !important; font-size:12px !important; }
      #erp-paper-chooser .pc-foot { display:flex !important; justify-content:space-between !important; align-items:center !important; margin-top:6px !important; }
      #erp-paper-chooser .pc-a4 { background:none !important; border:none !important; color:${C.link} !important; font-size:12px !important; text-decoration:underline !important; cursor:pointer !important; padding:0 !important; }
      #erp-paper-chooser .pc-cancel { background:${C.btn} !important; color:${C.text} !important; border:1px solid ${C.border} !important; border-radius:8px !important; padding:6px 14px !important; font-size:13px !important; cursor:pointer !important; }
    </style>
    <article class="pc-box">
      <p class="pc-title">Pilih ukuran kertas</p>
      <p class="pc-sub"></p>
      <nav class="pc-list"></nav>
      <footer class="pc-foot">
        <button type="button" class="pc-a4">Pakai A4 (printer biasa / PDF)</button>
        <button type="button" class="pc-cancel">Batal</button>
      </footer>
    </article>`;
  overlay.querySelector(".pc-sub").textContent = titleText;
  const list = overlay.querySelector(".pc-list");
  const sizes = { continuous: '9,5" x 11"', half: '9,5" x 5,5" (setengah)' };
  const notes = { continuous: "Satu lembar penuh continuous form", half: "Setengah lembar, format rapat seperti Excel" };
  choices.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pc-opt" + (p.id === last ? " active" : "");
    b.innerHTML = `<span class="pc-size"></span><br><span class="pc-note"></span>`;
    b.querySelector(".pc-size").textContent = sizes[p.id];
    b.querySelector(".pc-note").textContent = notes[p.id] + (p.id === last ? " · terakhir dipakai" : "");
    b.onclick = () => go(p.id);
    list.appendChild(b);
  });
  function close() { overlay.remove(); document.removeEventListener("keydown", onKey); }
  function go(id) {
    try { localStorage.setItem(PAPER_KEY, id); } catch (_) { /* abaikan */ }
    close();
    printDocumentContent(elementId, titleText);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  overlay.querySelector(".pc-cancel").onclick = close;
  overlay.querySelector(".pc-a4").onclick = () => go("a4");
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  setTimeout(() => list.querySelector("button")?.focus(), 0);
}

export function printDocumentContent(elementId, titleText) {
  const contentElement = document.getElementById(elementId);
  if (!contentElement) return alert("Elemen cetak tidak ditemukan!");

  const printWindow = window.open("", "_blank", "width=950,height=750");
  if (!printWindow) return alert("Pop-up diblokir oleh browser. Izinkan pop-up untuk mencetak dokumen.");
  const paper = getPaper();

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${titleText}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: ${paper.css}; margin: ${paper.margin}; }
          html, body { background: #fff !important; }
          body { font-family: Arial, Helvetica, sans-serif !important; color: #000 !important; margin: 0; padding: 0; font-size: 11pt; }

          /* 1. Semua teks, garis, ikon jadi hitam pekat; tanpa latar & bayangan */
          *, *::before, *::after {
            color: #000 !important;
            border-color: #000 !important;
            background: transparent !important;
            box-shadow: none !important;
            text-shadow: none !important;
            opacity: 1 !important;
          }
          svg, svg * { stroke: #000 !important; }

          /* 2. Font jelas & tidak kekecilan */
          .font-mono, code, pre { font-family: Arial, Helvetica, sans-serif !important; }
          .text-\\[9px\\], .text-\\[10px\\], .text-\\[11px\\], .text-xs { font-size: 10pt !important; line-height: 1.3 !important; }
          .text-sm { font-size: 11pt !important; }
          .text-base { font-size: 12pt !important; }
          .text-lg, .text-xl { font-size: 14pt !important; }
          .font-semibold, .font-bold, th { font-weight: 700 !important; }

          /* 3. Tabel bergaris hitam seperti Excel */
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          table th, table td { border: 1px solid #000 !important; padding: 2px 5px !important; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }

          /* 4. Rapikan: tanpa sudut membulat, logo hitam putih, ruang kosong dikurangi */
          [class*="rounded"] { border-radius: 0 !important; }
          img { filter: grayscale(100%) contrast(180%); max-height: 42px !important; }
          [class*="min-w-"] { min-width: 0 !important; }
          .p-4, .sm\\:p-6, .p-3 { padding: 4px !important; }
          .mb-6 { margin-bottom: 8px !important; }
          .no-print { display: none !important; }
          ${paper.extra || ""}
        </style>
      </head>
      <body>
        <div>${contentElement.innerHTML}</div>
        <script>
          setTimeout(() => {
            window.print();
            window.close();
          }, 900);
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}


// ---------------------------------------------------------------------
//  BLOK TANDA TANGAN PERSETUJUAN APJ / PJT (untuk Surat Pesanan, BPB, dll)
//  Mengambil data dari doc.qaReview. Dokumen lama (tanpa review) -> baris tanda tangan kosong.
// ---------------------------------------------------------------------
const fmtD = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export function QASignatureBlock({ doc, leftLabel = "Dibuat Oleh,", leftName = "Admin", leftCols, requiredFallback = ["obat"], title = "Disetujui Oleh," }) {
  const r = doc?.qaReview;
  const classes = r?.required?.length ? r.required : requiredFallback;
  const lefts = leftCols || [{ label: leftLabel, name: leftName }];
  const cols = lefts.length + classes.length;
  return (
    <div className="grid gap-4 text-center text-xs mt-8 pt-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {lefts.map((l, i) => (
        <div key={"l" + i}>
          <p className="text-gray-500 mb-12">{l.label}</p>
          <p className={`text-gray-900 font-bold whitespace-pre ${l.name ? "underline" : ""}`}>{l.name ? `( ${l.name} )` : "(                              )"}</p>
        </div>
      ))}
      {classes.map((cls) => {
        const d = r?.[cls];
        const role = `${QA_CLASSES[cls]?.role} ${QA_CLASSES[cls]?.label}`;
        const approved = d?.status === "approved";
        const rejected = d?.status === "rejected";
        return (
          <div key={cls}>
            <p className="text-gray-500 mb-1">{title}</p>
            <p className="text-gray-500 mb-8">{role}</p>
            {approved ? (
              <>
                <p className="underline text-gray-900 font-bold">( {decisionByText(d)} )</p>
                {d.license && <p className="text-gray-700">No. {d.license}</p>}
                <p className="text-gray-700">Disetujui {fmtD(d.at)}</p>
              </>
            ) : (
              <>
                <p className="text-gray-900 font-bold whitespace-pre">(                              )</p>
                <p className="text-gray-700">{rejected ? "DITOLAK" : r ? "Belum disetujui" : "SIPA / No. Izin: ..............."}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
//  KOMPONEN DOKUMEN BERSAMA (BPB, Retur, Surat Penolakan, Berita Acara, dll)
// ---------------------------------------------------------------------
export function DocHeader({ company, title, number, subtitle }) {
  return (
    <div className="flex items-start justify-between border-b-2 border-gray-800 pb-3 mb-4 gap-3">
      <div className="flex items-start gap-3">
        {company?.logoUrl && <img src={company.logoUrl} alt="Logo" className="h-10 object-contain shrink-0" />}
        <div>
          <div className="text-sm uppercase tracking-wide font-bold text-gray-900">{company?.name || "PT WIRYATAMA PUTERA MANDIRI"}</div>
          {company?.tagline && <p className="text-[11px] text-gray-600">{company.tagline}</p>}
          {company?.address && <p className="text-[10px] text-gray-600">{company.address}</p>}
          {company?.contact && <p className="text-[10px] text-gray-600">{company.contact}</p>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-base uppercase tracking-wider font-bold text-gray-900">{title}</div>
        {number && <div className="font-mono text-sm font-bold text-gray-900">{number}</div>}
        {subtitle && <div className="text-[11px] text-gray-600">{subtitle}</div>}
      </div>
    </div>
  );
}

// Kotak info 2 sisi: kiri (pihak tujuan / asal), kanan (detail dokumen)
export function DocParties({ leftTitle, leftName, leftLines = [], rightTitle = "Detail Dokumen", rightRows = [] }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-4 p-3 rounded-lg border">
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">{leftTitle}</div>
        <div className="text-sm text-gray-900 font-bold">{leftName || "-"}</div>
        {leftLines.filter(Boolean).map((l, i) => <div key={i} className="text-[11px] text-gray-600">{l}</div>)}
      </div>
      <div className="text-right">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">{rightTitle}</div>
        {rightRows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== "").map(([k, v], i) => (
          <div key={i}><span className="text-gray-500">{k}:</span> <span className="font-mono font-bold">{v}</span></div>
        ))}
      </div>
    </div>
  );
}

// Tabel barang sederhana: columns = [{ label, align, render(row, i) }]
export function DocTable({ columns, rows }) {
  return (
    <table className="w-full text-xs border-collapse mb-4">
      <thead>
        <tr className="border-b-2 border-gray-800">
          {columns.map((c, i) => <th key={i} className={`py-2 px-2 font-bold text-gray-900 text-${c.align || "left"}`}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b">
            {columns.map((c, j) => <td key={j} className={`py-2 px-2 text-gray-900 text-${c.align || "left"} align-top`}>{c.render(r, i)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Baris tanda tangan: cols = [{ label, name }] ; name kosong -> diisi tangan
export function SignatureRow({ cols }) {
  return (
    <div className="grid gap-4 text-center text-xs mt-8 pt-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map((c, i) => (
        <div key={i}>
          <p className="text-gray-500 mb-12">{c.label}</p>
          <p className={`text-gray-900 font-bold whitespace-pre ${c.name ? "underline" : ""}`}>{c.name ? `( ${c.name} )` : "(                              )"}</p>
          {c.sub && <p className="text-gray-700">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// Bungkus pratinjau + tombol cetak (dipakai di dalam Modal)
export function PrintArea({ id, docTitle, children, buttonLabel = "Cetak Sekarang / Simpan PDF" }) {
  return (
    <div>
      <div className="flex justify-end gap-2 mb-4 no-print">
        <button type="button" onClick={() => choosePaperAndPrint(id, docTitle)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer text-white" style={{ background: "#0E4749" }}>
          <Printer size={15} /> {buttonLabel}
        </button>
      </div>
      <div className="overflow-x-auto w-full">
        <div id={id} className="p-4 sm:p-6 bg-white border rounded-xl text-xs text-gray-800 min-w-[550px] sm:min-w-0">{children}</div>
      </div>
    </div>
  );
}
