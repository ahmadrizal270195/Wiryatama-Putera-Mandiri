import React from "react";
import { X, Calendar } from "lucide-react";

// Kebijakan Warna & Theme Fallback
export const inputStyle = {
  border: "1px solid var(--border-color, #CBD5E1)",
};

export function Eyebrow({ children }) {
  return (
    <div style={{ letterSpacing: "0.08em" }} className="text-[11px] font-mono uppercase mb-1 text-slate-500">
      {children}
    </div>
  );
}

export function Card({ children, style, className = "", colorConfig }) {
  return (
    <div
      className={"rounded-xl p-4 " + className}
      style={{
        background: colorConfig?.surface || "#FFFFFF",
        border: `1px solid ${colorConfig?.border || "#E2E9E7"}`,
        color: colorConfig?.ink || "#15302D",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ tone = "good", children, colorConfig }) {
  const map = {
    good: [colorConfig?.goodSoft || "#E9F3ED", colorConfig?.good || "#357A5D"],
    warn: [colorConfig?.warnSoft || "#FBF1E1", colorConfig?.warn || "#C97F1E"],
    danger: [colorConfig?.dangerSoft || "#FBEAE8", colorConfig?.danger || "#B84438"],
    neutral: [colorConfig?.primarySoft || "#E8F0EF", colorConfig?.primary || "#0E4749"],
  };
  const [bg, fg] = map[tone] || map.good;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border"
      style={{ background: bg, color: fg, borderColor: colorConfig?.border || "#E2E9E7" }}
    >
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = "primary", type = "button", className = "", disabled, colorConfig }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 cursor-pointer";
  const styles =
    variant === "primary"
      ? { background: colorConfig?.primary || "#0E4749", color: "#fff" }
      : variant === "danger"
      ? { background: colorConfig?.dangerSoft || "#FBEAE8", color: colorConfig?.danger || "#B84438" }
      : { background: "transparent", color: colorConfig?.ink || "#15302D", border: `1px solid ${colorConfig?.border || "#E2E9E7"}` };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={base + " " + className} style={styles}>
      {children}
    </button>
  );
}

export function Field({ label, children, colorConfig }) {
  return (
    <label className="block mb-3">
      <div className="text-xs font-medium mb-1" style={{ color: colorConfig?.inkSoft || "#5C7873" }}>{label}</div>
      {children}
    </label>
  );
}

export function DateInput(props) {
  const { value, onChange, className = "", required, disabled, style, colorConfig } = props;

  const formatDisplay = (iso) => {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    if (y && m && d) return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    return iso;
  };

  return (
    <div className="relative w-full flex items-center">
      <input
        type="text"
        readOnly
        value={formatDisplay(value)}
        placeholder="dd/mm/yyyy"
        className={"w-full rounded-lg pl-3 pr-9 py-1.5 text-sm outline-none " + className}
        style={{ ...inputStyle, ...style }}
      />
      <Calendar size={15} className="absolute right-3 pointer-events-none" style={{ color: colorConfig?.inkSoft || "#5C7873" }} />
      <input
        type="date"
        value={value || ""}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}

export function TextInput(props) {
  if (props.type === "date") {
    return <DateInput {...props} />;
  }

  if (props.type === "number") {
    return (
      <input
        {...props}
        value={props.value === 0 || props.value === "0" ? 0 : props.value || ""}
        onChange={(e) => {
          if (!props.onChange) return;
          props.onChange(e);
        }}
        onWheel={(e) => {
          e.target.blur();
          if (props.onWheel) props.onWheel(e);
        }}
        className={
          "w-full rounded-lg px-3 py-1.5 text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none " +
          (props.className || "")
        }
        style={{ ...inputStyle, ...props.style }}
      />
    );
  }

  return (
    <input
      {...props}
      className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")}
      style={{ ...inputStyle, ...props.style }}
    />
  );
}

export function Select(props) {
  return (
    <select
      {...props}
      className={"w-full rounded-lg px-3 py-1.5 text-sm outline-none " + (props.className || "")}
      style={{ ...inputStyle, ...props.style }}
    >
      {props.children}
    </select>
  );
}

export function ResponsiveTable({ children, minWidth = 650, colorConfig }) {
  return (
    <Card className="!p-0 overflow-hidden no-print" colorConfig={colorConfig}>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
          {children}
        </table>
      </div>
    </Card>
  );
}

export function Modal({ title, onClose, children, wide, isSubModal = false, colorConfig }) {
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 modal-backdrop ${isSubModal ? "z-[70]" : "z-50"}`}
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={"rounded-2xl w-full " + (wide ? "max-w-3xl" : "max-w-md") + " max-h-[85vh] overflow-y-auto modal-content shadow-2xl"}
        style={{ background: colorConfig?.surface || "#FFFFFF", color: colorConfig?.ink || "#15302D", border: `1px solid ${colorConfig?.border || "#E2E9E7"}` }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10 no-print" style={{ background: colorConfig?.surface || "#FFFFFF", borderBottom: `1px solid ${colorConfig?.border || "#E2E9E7"}` }}>
          <h3 className="font-semibold text-base" style={{ color: colorConfig?.ink || "#15302D" }}>{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:opacity-60 cursor-pointer">
            <X size={18} color={colorConfig?.inkSoft || "#5C7873"} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}