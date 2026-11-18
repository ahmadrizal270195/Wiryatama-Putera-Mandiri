// =====================================================================
//  SIMPAN ATOMIK
//  Bungkus satu aksi (mis. buat faktur: potong stok + simpan faktur) pakai
//  withAtomic(). Selama aksi jalan, semua simpan ditampung dulu, lalu
//  dikirim ke server dalam SATU transaksi di akhir. Kalau gagal (internet
//  putus, stok keburu dipakai user lain), nggak ada yang tersimpan sebagian.
// =====================================================================

let current = null;
let committer = null;

export function setAtomicCommitter(fn) { committer = fn; }
export function currentAtomicScope() { return current; }

// Dipanggil dari auditedSave. Simpan berturut-turut ke data yang sama digabung:
// prev tetap yang pertama, next pakai yang terakhir.
export function queueAtomic(scope, key, prev, next, onFail) {
  const op = scope.ops.find((o) => o.key === key);
  if (op) op.next = next;
  else scope.ops.push({ key, prev, next, onFail });
}

export async function withAtomic(fn) {
  if (current || !committer) return fn();
  const scope = { ops: [] };
  current = scope;
  let result;
  try {
    result = await fn();
  } catch (e) {
    current = null;
    await committer(scope.ops, { aborted: true });
    throw e;
  }
  current = null;
  if (scope.ops.length) await committer(scope.ops, { aborted: false });
  return result;
}
