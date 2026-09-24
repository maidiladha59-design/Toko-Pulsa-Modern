// Utilitas struk: teks untuk dibagikan + cetak thermal 58mm via Bluetooth (ESC/POS).
// Catatan: memakai Web Bluetooth (BLE). Jalan di Chrome Android / Chrome & Edge desktop lewat HTTPS.

export type ReceiptRow = { label: string; value: string };
export type ReceiptData = {
  title: string;
  rows: ReceiptRow[];
  total: { label: string; value: string };
  footer?: string;
};

const STORE_NAME = "AIDIL STORE";
const WIDTH = 32; // lebar kertas 58mm = 32 karakter
const DEFAULT_FOOTER = "Terima kasih telah berbelanja di AIDIL STORE. Simpan struk ini sebagai bukti transaksi.";

const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "00001101-0000-1000-8000-00805f9b34fb",
];

function safe(text: string): string {
  return String(text ?? "")
    .replace(/[·•]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

function wrapWords(text: string, size: number): string[] {
  const words = safe(text).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > size) {
      if (line) { lines.push(line); line = ""; }
      lines.push(...chunkText(word, size));
      continue;
    }
    if (!line) line = word;
    else if ((line + " " + word).length <= size) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function rowLines(label: string, value: string): string[] {
  const l = safe(label);
  const v = safe(value);
  if (l.length + 1 + v.length <= WIDTH) return [l + " ".repeat(WIDTH - l.length - v.length) + v];
  return [l, ...chunkText(v, WIDTH - 2).map((part) => "  " + part)];
}

export function receiptToText(receipt: ReceiptData): string {
  const lines = [STORE_NAME, receipt.title, ""];
  for (const r of receipt.rows) lines.push(`${r.label}: ${r.value}`);
  lines.push("", `${receipt.total.label}: ${receipt.total.value}`, "", receipt.footer || DEFAULT_FOOTER);
  return lines.join("\n");
}

function buildEscPos(receipt: ReceiptData): Uint8Array {
  const bytes: number[] = [];
  const raw = (...b: number[]) => bytes.push(...b);
  const text = (s: string) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0x7f); };
  const line = (s = "") => { text(s); raw(0x0a); };
  const dash = () => line("-".repeat(WIDTH));

  raw(0x1b, 0x40); // reset printer
  raw(0x1b, 0x61, 0x01); // rata tengah
  raw(0x1b, 0x45, 0x01); line(STORE_NAME); raw(0x1b, 0x45, 0x00);
  line(safe(receipt.title));
  raw(0x1b, 0x61, 0x00); // rata kiri
  dash();
  for (const r of receipt.rows) for (const l of rowLines(r.label, r.value)) line(l);
  dash();
  raw(0x1b, 0x45, 0x01);
  for (const l of rowLines(receipt.total.label, receipt.total.value)) line(l);
  raw(0x1b, 0x45, 0x00);
  dash();
  raw(0x1b, 0x61, 0x01);
  for (const l of wrapWords(receipt.footer || DEFAULT_FOOTER, WIDTH)) line(l);
  raw(0x1b, 0x64, 0x04); // feed 4 baris
  return new Uint8Array(bytes);
}

let cachedDevice: any = null;

async function findWritable(server: any) {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const found = chars.find((c: any) => c.properties?.writeWithoutResponse || c.properties?.write);
    if (found) return found;
  }
  return null;
}

/** Kirim struk ke printer thermal Bluetooth. Mengembalikan nama printer. */
export async function printReceiptBluetooth(receipt: ReceiptData): Promise<string> {
  const bt = typeof navigator !== "undefined" ? (navigator as any).bluetooth : null;
  if (!bt?.requestDevice) {
    throw new Error("Browser ini belum mendukung Bluetooth. Gunakan Chrome di Android, atau Chrome/Edge di komputer.");
  }
  const data = buildEscPos(receipt);
  try {
    let device = cachedDevice;
    if (!device?.gatt) {
      device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
      cachedDevice = device;
    }
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    const writable = await findWritable(server);
    if (!writable) throw new Error("Printer ini tidak mendukung Bluetooth BLE. Coba printer thermal lain atau gunakan tombol Cetak / PDF.");
    const CHUNK = 20;
    for (let i = 0; i < data.length; i += CHUNK) {
      const part = data.slice(i, i + CHUNK);
      if (writable.properties?.writeWithoutResponse && writable.writeValueWithoutResponse) await writable.writeValueWithoutResponse(part);
      else await writable.writeValue(part);
      await new Promise((r) => setTimeout(r, 25));
    }
    return device.name || "printer Bluetooth";
  } catch (error) {
    cachedDevice = null;
    throw error;
  }
}

const RECEIPT_STATUS: Record<string, string> = {
  SUCCESS: "Berhasil", COMPLETED: "Berhasil", PROCESSING: "Sedang diproses", WAITING: "Sedang diproses",
  PENDING: "Menunggu pembayaran", FAILED: "Gagal", REFUNDED: "Dana dikembalikan", CANCELLED: "Dibatalkan",
};

/** Label status yang ramah untuk pelanggan. */
export function receiptStatusLabel(status: string | null | undefined): string {
  return RECEIPT_STATUS[String(status || "").toUpperCase()] || String(status || "-");
}

/** Tanggal ala struk: 21/09/2026 20:48:53 (WIB). */
export function formatReceiptDate(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  }).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Angka polos tanpa "Rp", contoh: 18.766 */
export function plainNumber(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(Number(n) || 0)));
}