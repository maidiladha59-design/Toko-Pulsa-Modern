export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateStr));
}

// Menerjemahkan error mentah (Supabase/Postgres/network) menjadi pesan manusiawi.
// Tidak pernah menampilkan "Internal Server Error" / "undefined" / "null" ke user.
export function humanizeError(rawMessage: string | undefined | null): string {
  const msg = (rawMessage || "").toLowerCase();

  if (!rawMessage) return "Terjadi kesalahan. Silakan coba lagi.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Koneksi bermasalah. Periksa internet Anda.";
  if (msg.includes("invalid login credentials"))
    return "Email atau password tidak sesuai.";
  if (msg.includes("email not confirmed"))
    return "Email belum diverifikasi. Silakan cek inbox Anda.";
  if (msg.includes("user already registered") || msg.includes("already registered"))
    return "Email ini sudah terdaftar. Silakan login.";
  if (msg.includes("jwt") || msg.includes("unauthorized") || msg.includes("not authenticated"))
    return "Silakan login terlebih dahulu.";
  if (msg.includes("insufficient_balance"))
    return "Saldo Anda tidak mencukupi.";
  if (msg.includes("topup_already_processed"))
    return "Transaksi ini sudah diproses sebelumnya.";
  if (msg.includes("product_not_found"))
    return "Produk tidak ditemukan atau sudah tidak tersedia.";
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "Anda tidak memiliki akses untuk melakukan ini.";

  // Kalau bukan salah satu pola teknis di atas, kemungkinan besar ini pesan
  // yang sudah ditulis manusiawi oleh API kita sendiri (mis. "Email belum
  // diverifikasi dengan OTP.") — tampilkan apa adanya, jangan dibuang jadi
  // generik, supaya user tahu apa yang sebenarnya salah.
  const looksLikeRawTechnicalError =
    msg.includes("error:") ||
    msg.includes("exception") ||
    msg.includes("stack") ||
    msg.includes("undefined") ||
    msg.includes("null") ||
    msg.includes("{") ||
    rawMessage.length > 200;

  if (rawMessage.trim() && !looksLikeRawTechnicalError) return rawMessage;

  return "Terjadi kesalahan. Silakan coba lagi.";
}