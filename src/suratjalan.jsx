import { useState, useEffect } from "react";
import { db } from "../firebase"; // Sesuaikan path firebase kamu
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";

export default function SuratJalan() {
  const [salesOrders, setSalesOrders] = useState([]);
  const [selectedSO, setSelectedSO] = useState(null);
  
  // Form State
  const [noSuratJalan, setNoSuratJalan] = useState(`SJ-${Date.now().toString().slice(-6)}`);
  const [tanggalKirim, setTanggalKirim] = useState(new Date().toISOString().split("T")[0]);
  const [ekspedisi, setEkspedisi] = useState("");
  const [noResi, setNoResi] = useState("");
  
  // Status Penerimaan State
  const [statusPenerimaan, setStatusPenerimaan] = useState("DIKIRIM"); // DIKIRIM / DITERIMA / DITOLAK
  const [penerima, setPenerima] = useState("");
  const [tanggalTerima, setTanggalTerima] = useState("");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. Ambil data Sales Order (SO) dari Firebase
  useEffect(() => {
    fetchSalesOrders();
  }, []);

  const fetchSalesOrders = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "sales_orders"));
      const list = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Hanya ambil SO yang belum selesai/dikirim penuh
        if (data.status !== "COMPLETED") {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setSalesOrders(list);
    } catch (err) {
      console.error("Gagal mengambil data SO:", err);
    }
  };

  // 2. Ketika SO dipilih, otomatis isi item pengiriman
  const handleSelectSO = (soId) => {
    const so = salesOrders.find((item) => item.id === soId);
    if (so) {
      setSelectedSO(so);
      // Map item dari SO ke format Surat Jalan + tambahkan field Batch
      const mappedItems = (so.items || []).map((item) => ({
        product_id: item.product_id || item.id,
        nama_produk: item.name || item.nama_produk,
        qty_order: item.qty,
        qty_kirim: item.qty, // default disamakan dengan order
        no_batch: "",
        exp_date: "",
      }));
      setItems(mappedItems);
    } else {
      setSelectedSO(null);
      setItems([]);
    }
  };

  // Update nilai item (qty_kirim, batch, exp_date)
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  // 3. Simpan Surat Jalan ke Firebase
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSO) {
      alert("Pilih Sales Order terlebih dahulu!");
      return;
    }

    setLoading(true);
    try {
      // Data Surat Jalan yang akan disimpan
      const payloadSJ = {
        no_surat_jalan: noSuratJalan,
        so_id: selectedSO.id,
        no_so: selectedSO.no_so || selectedSO.id,
        pelanggan: selectedSO.pelanggan || selectedSO.customer_name || "-",
        tanggal_kirim: tanggalKirim,
        ekspedisi: ekspedisi,
        no_resi: noResi,
        status_penerimaan: statusPenerimaan,
        penerima: statusPenerimaan === "DITERIMA" ? penerima : "",
        tanggal_terima: statusPenerimaan === "DITERIMA" ? tanggalTerima : "",
        items: items,
        createdAt: serverTimestamp(),
      };

      // Simpan ke koleksi 'surat_jalan'
      await addDoc(collection(db, "surat_jalan"), payloadSJ);

      // Update status pada dokumen 'sales_orders' terkait
      const soRef = doc(db, "sales_orders", selectedSO.id);
      await updateDoc(soRef, {
        status: statusPenerimaan === "DITERIMA" ? "DELIVERED" : "SHIPPED",
        last_sj_no: noSuratJalan,
      });

      alert("Surat Jalan berhasil dibuat!");
      
      // Reset Form
      setSelectedSO(null);
      setItems([]);
      setNoSuratJalan(`SJ-${Date.now().toString().slice(-6)}`);
      fetchSalesOrders();
    } catch (err) {
      console.error("Error simpan Surat Jalan:", err);
      alert("Gagal menyimpan Surat Jalan.");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "24px", maxWidth: "900px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#15302D", marginBottom: "8px" }}>Buat Surat Jalan (Delivery Order)</h2>
      <p style={{ color: "#5C7873", fontSize: "14px", marginBottom: "24px" }}>
        Pengeluaran barang berdasarkan Pesanan Penjualan (SO) beserta nomor batch & kadaluarsa.
      </p>

      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #E2E9E7" }}>
        
        {/* PILIH SO */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>
            Pilih Sales Order (SO) *
          </label>
          <select
            onChange={(e) => handleSelectSO(e.target.value)}
            value={selectedSO ? selectedSO.id : ""}
            required
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
          >
            <option value="">-- Pilih Nomor SO --</option>
            {salesOrders.map((so) => (
              <option key={so.id} value={so.id}>
                {so.no_so || so.id} - {so.pelanggan || so.customer_name} ({so.total_amount ? `Rp ${so.total_amount.toLocaleString()}` : ""})
              </option>
            ))}
          </select>
        </div>

        {selectedSO && (
          <>
            {/* INFORMASI SURAT JALAN & EKSPEDISI */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>No. Surat Jalan</label>
                <input
                  type="text"
                  value={noSuratJalan}
                  onChange={(e) => setNoSuratJalan(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>Tanggal Pengiriman</label>
                <input
                  type="date"
                  value={tanggalKirim}
                  onChange={(e) => setTanggalKirim(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>Ekspedisi / Kurir</label>
                <input
                  type="text"
                  placeholder="Contoh: JNE / Kurir Internal"
                  value={ekspedisi}
                  onChange={(e) => setEkspedisi(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>No. Resi / Kendaraan</label>
                <input
                  type="text"
                  placeholder="Contoh: B 1234 CD / Resi 001"
                  value={noResi}
                  onChange={(e) => setNoResi(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                />
              </div>
            </div>

            {/* STATUS PENERIMAAN BARANG */}
            <div style={{ background: "#F5F8F7", padding: "16px", borderRadius: "8px", marginBottom: "20px" }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#0E4749" }}>Status Penerimaan Barang</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600" }}>Status</label>
                  <select
                    value={statusPenerimaan}
                    onChange={(e) => setStatusPenerimaan(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                  >
                    <option value="DIKIRIM">Dalam Pengiriman</option>
                    <option value="DITERIMA">Sudah Diterima</option>
                  </select>
                </div>

                {statusPenerimaan === "DITERIMA" && (
                  <>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "600" }}>Nama Penerima</label>
                      <input
                        type="text"
                        placeholder="Nama penerima di lokasi"
                        value={penerima}
                        onChange={(e) => setPenerima(e.target.value)}
                        required
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: "600" }}>Tanggal Diterima</label>
                      <input
                        type="date"
                        value={tanggalTerima}
                        onChange={(e) => setTanggalTerima(e.target.value)}
                        required
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "4px" }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* TABEL ITEM & BATCH */}
            <h4 style={{ marginBottom: "8px" }}>Detail Barang & Batch (Farmasi/Alkes)</h4>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
              <thead>
                <tr style={{ background: "#E2E9E7", textAlign: "left", fontSize: "12px" }}>
                  <th style={{ padding: "8px" }}>Nama Produk</th>
                  <th style={{ padding: "8px", width: "80px" }}>Qty Order</th>
                  <th style={{ padding: "8px", width: "90px" }}>Qty Kirim</th>
                  <th style={{ padding: "8px" }}>No. Batch *</th>
                  <th style={{ padding: "8px" }}>Exp Date *</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px", fontSize: "14px" }}>{item.nama_produk}</td>
                    <td style={{ padding: "8px", fontSize: "14px", textAlign: "center" }}>{item.qty_order}</td>
                    <td style={{ padding: "8px" }}>
                      <input
                        type="number"
                        value={item.qty_kirim}
                        onChange={(e) => handleItemChange(idx, "qty_kirim", Number(e.target.value))}
                        required
                        min="1"
                        max={item.qty_order}
                        style={{ width: "60px", padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input
                        type="text"
                        placeholder="Contoh: BATCH-01"
                        value={item.no_batch}
                        onChange={(e) => handleItemChange(idx, "no_batch", e.target.value)}
                        required
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input
                        type="date"
                        value={item.exp_date}
                        onChange={(e) => handleItemChange(idx, "exp_date", e.target.value)}
                        required
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* TOMBOL SIMPAN */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: "#0E4749",
                color: "#fff",
                padding: "12px 24px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                width: "100%",
              }}
            >
              {loading ? "Menyimpan..." : "Simpan Surat Jalan"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}