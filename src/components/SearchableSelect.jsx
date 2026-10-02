import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

// ============================================================================
// SearchableSelect: dropdown dengan kotak cari, pengganti <select> polos
// buat daftar panjang (pelanggan, supplier, nomor SO/PO, nomor faktur).
// Diadaptasi dari komponen yang sama di WHISys.
//
// Props:
// - options: [{ value, label, sublabel? }]. sublabel ikut dicari, tampil kecil di bawah label.
// - value, onChange(value)
// - placeholder: teks saat belum ada yang dipilih.
// - emptyOptionLabel: kalau diisi, muncul opsi paling atas untuk mengosongkan pilihan (onChange("")).
// - pinnedOptions: [{ value, label }] opsi khusus yang selalu tampil di atas (mis. "+ Tambah Pelanggan Baru").
// - colorConfig: palet tema aktif (COLOR dari App). Kalau tidak dioper, ikut tema yang tersimpan.
// - disabled
// ============================================================================

const FALLBACK = {
  light: { surface: "#FFFFFF", border: "#E2E8F0", ink: "#1E293B", inkSoft: "#64748B", cardSoft: "#F8FAFC", primary: "#059669", primarySoft: "#ECFDF5" },
  dark: { surface: "#0F172A", border: "#334155", ink: "#F8FAFC", inkSoft: "#94A3B8", cardSoft: "#1E293B", primary: "#34D399", primarySoft: "rgba(16, 185, 129, 0.15)" },
};

function themeFallback() {
  try {
    return localStorage.getItem("erp-theme") === "dark" ? FALLBACK.dark : FALLBACK.light;
  } catch {
    return FALLBACK.light;
  }
}

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "-- Pilih --",
  emptyOptionLabel,
  pinnedOptions,
  colorConfig,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const c = { ...themeFallback(), ...(colorConfig || {}) };

  const selected = useMemo(
    () => options.find((o) => o.value === value) || (pinnedOptions || []).find((o) => o.value === value) || null,
    [options, pinnedOptions, value]
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.sublabel || ""}`.toLowerCase().includes(q));
  }, [options, query]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  function rowStyle(key, isSelected, accent) {
    if (isSelected) return { background: c.primarySoft, color: c.primary, fontWeight: 600 };
    return { background: hover === key ? c.cardSoft : "transparent", color: accent ? c.primary : c.ink };
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm border text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: c.surface, borderColor: open ? c.primary : c.border, color: c.ink }}
      >
        <span className="truncate" style={{ opacity: selected ? 1 : 0.55 }}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: c.inkSoft }} />
      </button>

      {open && !disabled && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[220px] rounded-lg border shadow-lg overflow-hidden"
          style={{ background: c.surface, borderColor: c.border }}
          // Field di Mini ERP dibungkus <label>: tanpa ini, klik opsi ikut "mengklik" tombol utama lagi
          // sehingga dropdown langsung terbuka kembali setelah memilih.
          onClick={(e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); }}
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b" style={{ borderColor: c.border }}>
            <Search size={14} className="shrink-0" style={{ color: c.inkSoft }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length === 1) pick(filtered[0].value);
                }
              }}
              placeholder="Ketik untuk mencari..."
              className="w-full outline-none text-xs !border-0 !bg-transparent p-0"
              style={{ color: c.ink }}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="shrink-0 cursor-pointer" title="Hapus pencarian">
                <X size={14} style={{ color: c.inkSoft }} />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto" onMouseLeave={() => setHover(null)}>
            {(pinnedOptions || []).map((o) => (
              <button
                key={"pin-" + o.value}
                type="button"
                onClick={() => pick(o.value)}
                onMouseEnter={() => setHover("pin-" + o.value)}
                className="w-full text-left px-3 py-2 text-xs font-semibold border-b cursor-pointer"
                style={{ ...rowStyle("pin-" + o.value, o.value === value, true), borderColor: c.border }}
              >
                {o.label}
              </button>
            ))}
            {emptyOptionLabel && (
              <button
                type="button"
                onClick={() => pick("")}
                onMouseEnter={() => setHover("__empty")}
                className="w-full text-left px-3 py-2 text-xs italic cursor-pointer"
                style={{ ...rowStyle("__empty", value === "", false), color: value === "" ? c.primary : c.inkSoft }}
              >
                {emptyOptionLabel}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-center" style={{ color: c.inkSoft }}>Tidak ada yang cocok.</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                onMouseEnter={() => setHover(o.value)}
                className="w-full text-left px-3 py-2 text-xs cursor-pointer"
                style={rowStyle(o.value, o.value === value, false)}
              >
                <div className="whitespace-normal break-words leading-snug">{o.label}</div>
                {o.sublabel && (
                  <div className="text-[10px] whitespace-normal break-words mt-0.5" style={{ color: c.inkSoft }}>{o.sublabel}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
