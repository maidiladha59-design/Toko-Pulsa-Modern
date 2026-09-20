// Pembacaan otomatis NIK/kata kunci KTP dari foto yang di-upload, memakai OCR
// open-source (tesseract.js) — TIDAK memerlukan API key/akun pihak ketiga.
//
// PENTING — batasan yang harus dipahami:
// - Ini BUKAN verifikasi keaslian KTP resmi (tidak mengecek ke Dukcapil, tidak
//   mendeteksi KTP palsu/hasil edit, tidak mencocokkan wajah dengan foto KTP).
//   Ini murni "apakah teks di foto ini terbaca seperti KTP" (ada pola NIK 16
//   digit dan/atau kata kunci seperti "NIK"/"PROVINSI"/"REPUBLIK INDONESIA").
// - Sifatnya best-effort dan FAIL-OPEN: kalau OCR gagal jalan (mis. dependency
//   belum siap di server, foto terlalu berat, dsb.), fungsi ini menandai
//   `ok: false` dan pemanggilnya (lihat src/app/kyc/page.tsx) akan tetap
//   meloloskan foto ke tahap simpan — supaya KYC tidak macet total hanya
//   karena OCR infra bermasalah. Yang benar-benar diblokir hanya kasus di mana
//   OCR BERHASIL jalan tapi sama sekali tidak menemukan pola KTP di foto itu.
// - Hasil `nik` disimpan ke kolom `kyc_verifications.ocr_nik` sebagai bantuan
//   admin saat review manual, bukan sebagai keputusan otomatis approve/reject.

export type KtpOcrResult = {
  /** true kalau proses OCR berhasil dijalankan (apa pun hasilnya). */
  ok: boolean;
  /** Heuristik: apakah teks yang terbaca terlihat seperti KTP. */
  looksLikeKtp: boolean;
  /** NIK (16 digit) kalau ditemukan, untuk dicatat sebagai bantuan review admin. */
  nik: string | null;
};

const KTP_KEYWORD_RE = /\bNIK\b|REPUBLIK\s+INDONESIA|PROVINSI|KEWARGANEGARAAN|KECAMATAN/i;
const NIK_RE = /\b\d{16}\b/;

// Worker Tesseract dibuat SEKALI lalu dipakai ulang untuk semua request
// selama proses server masih hidup (bukan create+terminate tiap foto).
// Ini yang paling menentukan kecepatan: sebelumnya, tiap kali user simpan
// foto KTP, server harus menginisialisasi ulang worker (termasuk memuat
// data bahasa) dari nol setiap saat — jauh lebih lambat dibanding memakai
// satu worker yang sudah "panas". `workerPromise` dipakai (bukan worker
// langsung) supaya kalau ada beberapa request OCR nyaris bersamaan, mereka
// menunggu proses inisialisasi yang SAMA, bukan masing-masing bikin worker
// sendiri-sendiri.
let workerPromise: ReturnType<typeof getWorkerInternal> | null = null;

async function getWorkerInternal() {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng");
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = getWorkerInternal();
    // Kalau inisialisasi gagal, jangan simpan promise yang gagal itu —
    // biar percobaan berikutnya boleh coba bikin worker baru lagi.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

export async function ocrKtp(buffer: Buffer): Promise<KtpOcrResult> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(buffer);
    const text = (data.text || "").replace(/\s+/g, " ").toUpperCase().trim();
    const nikMatch = text.match(NIK_RE);
    const looksLikeKtp = Boolean(nikMatch) || KTP_KEYWORD_RE.test(text);
    return { ok: true, looksLikeKtp, nik: nikMatch ? nikMatch[0] : null };
  } catch (err) {
    console.error("[ktp-ocr] gagal menjalankan OCR, lolos otomatis (fail-open):", err);
    // Kalau errornya karena worker yang sudah ada rusak/mati, paksa bikin
    // worker baru lagi di percobaan berikutnya.
    workerPromise = null;
    return { ok: false, looksLikeKtp: true, nik: null };
  }
}