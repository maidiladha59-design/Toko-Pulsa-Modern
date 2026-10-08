import QRCode from "qrcode";

// Nilai payment_number/qris_payload bisa berupa salah satu dari:
// - gambar jadi (data URL base64 dari Midtrans, atau URL gambar http/https)
// - string QR mentah EMVCO (baris data lama dari integrasi sebelumnya)
// Modul ini sengaja tidak mengimpor apa pun dari "node:" supaya bisa dipakai
// baik dari route server maupun dari komponen client.
export function isRenderedQrImage(value: string | null | undefined): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return (
    v.startsWith("data:image/") ||
    v.startsWith("http://") ||
    v.startsWith("https://")
  );
}

export async function renderQrImage(
  value: string | null | undefined,
  width = 360
): Promise<string | null> {
  const v = String(value || "").trim();
  if (!v) return null;
  if (isRenderedQrImage(v)) return v;
  return QRCode.toDataURL(v, { margin: 1, width });
}
