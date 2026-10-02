import { collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";

// =====================================================================
//  LOG AKTIVITAS SISTEM (meniru WHISys)
//
//  Mencatat aksi penting: login/logout dan setiap tambah/ubah/hapus data.
//  Bedanya dengan WHISys: di sini log TIDAK dipasang manual per tombol.
//  Semua simpan data di Mini ERP lewat persist.* -> saveList, jadi log dibuat
//  otomatis dari selisih data lama vs baru (lihat logListChange).
//
//  Koleksi: erp_activity_logs. Rules Firestore:
//    create: anggota yang login, dan userEmail harus email dirinya sendiri
//    read  : super admin saja
//    update/delete: tidak boleh siapa pun (log tidak bisa diubah)
//
//  Best-effort: kalau gagal mencatat, aksi utamanya tetap jalan.
// =====================================================================

const COL = "erp_activity_logs";
export const ACTIVITY_FETCH_LIMIT = 500;

let ACTOR = { email: "", name: "", role: "" };
export function setActivityActor(a) {
  ACTOR = { email: String(a?.email || "").toLowerCase(), name: a?.name || "", role: a?.role || "" };
}

export async function logActivity({ action, module, targetLabel, details, email, name, role }) {
  const userEmail = String(email || ACTOR.email || "").toLowerCase();
  if (!userEmail) return;
  try {
    await addDoc(collection(db, COL), {
      userEmail,
      userName: name || ACTOR.name || "",
      userRole: role || ACTOR.role || "",
      action: action || "lainnya", // login | logout | create | update | delete | lainnya
      module: module || "-",
      targetLabel: String(targetLabel || "").slice(0, 300),
      details: String(details || "").slice(0, 1500),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Gagal mencatat log aktivitas:", e);
  }
}

export async function fetchActivityLogs(max = ACTIVITY_FETCH_LIMIT) {
  const snap = await getDocs(query(collection(db, COL), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------
//  Log otomatis dari perubahan daftar data
// ---------------------------------------------------------------------
export const MODULE_LABELS = {
  "erp-products": "Produk",
  "erp-suppliers": "Supplier",
  "erp-customers": "Pelanggan",
  "erp-stock-batches": "Stok & Batch",
  "erp-purchase-orders": "Purchase Order",
  "erp-purchase-receipts": "Penerimaan Barang (BPB)",
  "erp-purchase-invoices": "Faktur Pembelian",
  "erp-purchase-returns": "Retur Pembelian",
  "erp-sales-orders": "Sales Order",
  "erp-payments-out": "Pembayaran Keluar",
  "erp-payments-in": "Pembayaran Masuk",
  "erp-expenses": "Biaya Operasional",
  "erp-delivery-notes": "Surat Jalan",
  "erp-invoices": "Faktur Penjualan",
  "erp-returns": "Retur Penjualan",
  "erp-users": "Pengguna & Hak Akses",
  "erp-qa-officers": "Master APJ/PJT",
  "erp-disposals": "Pemusnahan Barang",
};

const FIELD_LABELS = {
  name: "nama", status: "status", qty: "qty", date: "tanggal", items: "item", price: "harga",
  sellPrice: "harga jual", buyPrice: "harga beli", unitPrice: "harga satuan", amount: "nominal",
  expiryDate: "exp. date", batchNo: "no. batch", category: "kategori", customerId: "pelanggan",
  supplierId: "supplier", taxType: "PPN", deductions: "pemotongan tagihan", ongkir: "ongkir",
  discountPercent: "diskon", discountType: "jenis diskon", access: "hak akses", role: "role",
  minStock: "stok minimum", unit: "satuan", address: "alamat", contact: "kontak", npwp: "NPWP",
  quarantine: "karantina", method: "metode", note: "catatan", notes: "catatan", qaClass: "kelas PJ",
  active: "aktif", sipa: "SIPA", validUntil: "berlaku s/d", allocations: "alokasi batch",
};
const SKIP_FIELDS = new Set(["updatedAt", "createdAt", "lastAdjustedAt", "_order", "id"]);

function labelOf(d) {
  if (!d) return "";
  const num = d.soNumber || d.poNumber || d.noFaktur || d.noSJ || d.noBPB || d.noRetur || d.noBA || d.noBukti || d.refNo;
  if (num) return String(num);
  if (d.batchNo) return `Batch ${d.batchNo}`;
  return d.name || d.email || d.description || d.category || d.id || "";
}

function short(v) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("id-ID") : v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

function qaText(r) {
  if (!r || !r.required) return "";
  return r.required
    .map((c) => {
      const d = r[c] || {};
      const role = c === "obat" ? "APJ" : "PJT";
      if (!d.status || d.status === "pending") return `${role}: menunggu`;
      return `${role}: ${d.status === "approved" ? "disetujui" : "ditolak"}${d.byName ? " oleh " + d.byName : ""}`;
    })
    .join(", ");
}

function diffFields(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    if (SKIP_FIELDS.has(k)) continue;
    const x = a?.[k];
    const y = b?.[k];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (k === "qaReview") { out.push(`persetujuan → ${qaText(y) || "-"}`); continue; }
    const label = FIELD_LABELS[k] || k;
    const simple = (v) => v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);
    if (simple(x) && simple(y)) out.push(`${label}: ${short(x)} → ${short(y)}`);
    else if (Array.isArray(y) && Array.isArray(x) && y.length !== x.length) out.push(`${label}: ${x.length} → ${y.length} baris`);
    else out.push(`${label} diubah`);
  }
  return out;
}

function listLabels(docs, max = 5) {
  const names = docs.map(labelOf).filter(Boolean);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} lainnya`;
}

export function logListChange(key, prev, next) {
  const module = MODULE_LABELS[key];
  if (!module) return;
  const idOf = (d) => d?.id ?? d?.email;
  const before = new Map((prev || []).map((d) => [idOf(d), d]));
  const after = new Map((next || []).map((d) => [idOf(d), d]));
  const created = [], updated = [], deleted = [];
  for (const [id, d] of after) {
    if (!before.has(id)) created.push(d);
    else if (JSON.stringify(before.get(id)) !== JSON.stringify(d)) updated.push([before.get(id), d]);
  }
  for (const [id, d] of before) if (!after.has(id)) deleted.push(d);

  if (created.length) {
    logActivity({
      action: "create", module,
      targetLabel: listLabels(created),
      details: created.length === 1 ? `Menambah ${module.toLowerCase()} ${labelOf(created[0])}` : `Menambah ${created.length} data ${module.toLowerCase()}`,
    });
  }
  if (updated.length) {
    const details = updated.length === 1
      ? diffFields(updated[0][0], updated[0][1]).join("; ")
      : updated.slice(0, 5).map(([a, b]) => `${labelOf(b)} (${diffFields(a, b).slice(0, 3).join("; ")})`).join(" | ") + (updated.length > 5 ? ` | +${updated.length - 5} lainnya` : "");
    logActivity({ action: "update", module, targetLabel: listLabels(updated.map((u) => u[1])), details });
  }
  if (deleted.length) {
    logActivity({
      action: "delete", module,
      targetLabel: listLabels(deleted),
      details: deleted.length === 1 ? `Menghapus ${module.toLowerCase()} ${labelOf(deleted[0])}` : `Menghapus ${deleted.length} data ${module.toLowerCase()}`,
    });
  }
}
