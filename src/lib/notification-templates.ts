import { z } from "zod";
import { containsInternalTerm } from "@/lib/labels";

// Template notifikasi (site_settings.notification_templates, migrasi v107).
//
//  - Nilai menggantikan teks bawaan tabel notification_templates untuk sembilan
//    peristiwa penting. Bila belum diterbitkan/disable, mesin notifikasi tetap
//    memakai teks lama sebagai cadangan.
//  - Variabel memakai kurung kurawal tunggal: {nama}, {produk}, ...
//    Daftar putih dijaga di sini dan divalidasi ulang di server saat simpan.
//  - Istilah internal (status mentah, nama gateway/supplier) ditolak saat
//    Terbitkan walau admin menuliskannya sendiri.

export const NOTIFICATION_TEMPLATES_SETTINGS_KEY = "notification_templates";

export const NOTIFICATION_VARIABLES = [
  { key: "nama", label: "Nama pengguna", sample: "Rina" },
  { key: "produk", label: "Nama produk", sample: "Pulsa Telkomsel 10.000" },
  { key: "nominal", label: "Nominal", sample: "Rp10.000" },
  { key: "tujuan", label: "Nomor / ID tujuan", sample: "0812••••7890" },
  { key: "invoice", label: "Nomor invoice", sample: "INV-20261101-8F3C21" },
  { key: "saldo", label: "Saldo terkini", sample: "Rp125.000" },
  { key: "tanggal", label: "Tanggal", sample: "1 November 2026" },
  { key: "alasan", label: "Alasan / keterangan", sample: "Nomor tujuan tidak valid" },
] as const;

export type NotificationVariableKey = (typeof NOTIFICATION_VARIABLES)[number]["key"];

export const NOTIFICATION_VARIABLE_KEYS = NOTIFICATION_VARIABLES.map((item) => item.key) as NotificationVariableKey[];

export const NOTIFICATION_TEMPLATE_DEFINITIONS = [
  {
    key: "transaction_success",
    eventKey: "TRANSACTION_SUCCESS",
    label: "Pembelian berhasil",
    description: "Dikirim saat pesanan selesai diproses.",
    title: "Pesanan Berhasil",
    message: "Halo {nama}, pesanan {produk} senilai {nominal} berhasil. Nomor invoice: {invoice}.",
  },
  {
    key: "transaction_processing",
    eventKey: "TRANSACTION_PROCESSING",
    label: "Pembelian diproses",
    description: "Dikirim saat pesanan mulai diproses.",
    title: "Pesanan Sedang Diproses",
    message: "Halo {nama}, pesanan {produk} senilai {nominal} sedang diproses. Kami akan memberi tahu Anda setelah selesai.",
  },
  {
    key: "transaction_failed",
    eventKey: "TRANSACTION_FAILED",
    label: "Pembelian gagal",
    description: "Dikirim saat pesanan tidak dapat diproses.",
    title: "Pesanan Tidak Berhasil",
    message: "Halo {nama}, pesanan {produk} senilai {nominal} tidak dapat diproses. {alasan}",
  },
  {
    key: "transaction_refund",
    eventKey: "TRANSACTION_REFUND",
    label: "Refund saldo",
    description: "Dikirim saat nominal dikembalikan ke saldo.",
    title: "Saldo Dikembalikan",
    message: "Halo {nama}, nominal {nominal} untuk pesanan {invoice} telah dikembalikan ke saldo Anda. Saldo terkini {saldo}.",
  },
  {
    key: "topup_success",
    eventKey: "TOPUP_SUCCESS",
    label: "Top Up berhasil",
    description: "Dikirim setelah pembayaran Top Up terverifikasi.",
    title: "Top Up Berhasil",
    message: "Halo {nama}, Top Up senilai {nominal} berhasil masuk. Saldo terkini Anda {saldo}.",
  },
  {
    key: "topup_failed",
    eventKey: "TOPUP_FAILED",
    label: "Top Up gagal",
    description: "Dikirim saat Top Up tidak berhasil.",
    title: "Top Up Tidak Berhasil",
    message: "Halo {nama}, Top Up senilai {nominal} tidak berhasil. {alasan}",
  },
  {
    key: "kyc_approved",
    eventKey: "KYC_APPROVED",
    label: "KYC disetujui",
    description: "Dikirim saat verifikasi identitas disetujui.",
    title: "Verifikasi Disetujui",
    message: "Selamat {nama}, verifikasi akun Anda telah disetujui. Batas transaksi dan fitur akun kini meningkat.",
  },
  {
    key: "kyc_rejected",
    eventKey: "KYC_REJECTED",
    label: "KYC ditolak",
    description: "Dikirim saat verifikasi identitas ditolak.",
    title: "Verifikasi Perlu Diperbaiki",
    message: "Halo {nama}, pengajuan verifikasi Anda belum dapat disetujui. {alasan} Silakan ajukan ulang melalui halaman Verifikasi.",
  },
  {
    key: "transfer_received",
    eventKey: "TRANSFER_RECEIVED",
    label: "Saldo masuk dari transfer",
    description: "Dikirim ke penerima saat transfer saldo berhasil.",
    title: "Saldo Masuk",
    message: "Halo {nama}, Anda menerima transfer {nominal} pada {tanggal}. Saldo terkini {saldo}.",
  },
] as const;

export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_DEFINITIONS)[number]["key"];

export type NotificationTemplate = {
  key: NotificationTemplateKey;
  title: string;
  message: string;
  enabled: boolean;
  inApp: boolean;
  push: boolean;
};

export type NotificationTemplatesSettings = {
  templates: NotificationTemplate[];
};

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplatesSettings = {
  templates: NOTIFICATION_TEMPLATE_DEFINITIONS.map((definition) => ({
    key: definition.key,
    title: definition.title,
    message: definition.message,
    enabled: true,
    inApp: true,
    push: true,
  })),
};

const templateSchema = z.object({
  key: z.enum(NOTIFICATION_TEMPLATE_DEFINITIONS.map((item) => item.key) as [NotificationTemplateKey, ...NotificationTemplateKey[]]),
  title: z.string().trim().max(120, "Judul template maksimal 120 karakter."),
  message: z.string().trim().max(1000, "Isi template maksimal 1.000 karakter."),
  enabled: z.boolean(),
  inApp: z.boolean(),
  push: z.boolean(),
});

export const notificationTemplatesInputSchema = z.object({
  templates: z.array(templateSchema).max(20).default(DEFAULT_NOTIFICATION_TEMPLATES.templates),
});

export function normalizeNotificationTemplates(
  value: z.infer<typeof notificationTemplatesInputSchema>
): NotificationTemplatesSettings {
  const byKey = new Map(value.templates.map((template) => [template.key, template]));
  return {
    templates: NOTIFICATION_TEMPLATE_DEFINITIONS.map((definition) => {
      const current = byKey.get(definition.key);
      return {
        key: definition.key,
        title: (current?.title ?? definition.title).trim(),
        message: (current?.message ?? definition.message).trim(),
        enabled: current?.enabled ?? true,
        inApp: current?.inApp ?? true,
        push: current?.push ?? true,
      };
    }),
  };
}

export function templateForEvent(
  settings: NotificationTemplatesSettings,
  eventKey: string
): NotificationTemplate | null {
  const definition = NOTIFICATION_TEMPLATE_DEFINITIONS.find((item) => item.eventKey === eventKey);
  if (!definition) return null;
  return settings.templates.find((template) => template.key === definition.key) ?? null;
}

export function templateDefinition(key: NotificationTemplateKey) {
  return NOTIFICATION_TEMPLATE_DEFINITIONS.find((item) => item.key === key) ?? null;
}

/** Variabel di luar daftar putih, mis. {status} atau {supplier}. */
export function unknownTemplateVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of String(text || "").matchAll(/\{\s*([^{}]+?)\s*\}/g)) {
    const key = match[1].trim();
    if (!NOTIFICATION_VARIABLE_KEYS.includes(key as NotificationVariableKey)) found.add(key);
  }
  return [...found];
}

const FORBIDDEN_TERMS = ["COMPLETED", "PENDING", "MIDTRANS", "DIGIFLAZZ", "FR3", "NEWERA", "AYANOTE", "XENDIT", "TRIPAY", "SUPPLIER"];

/** Istilah internal yang tidak boleh tampil ke pelanggan, walau ditulis admin. */
export function forbiddenTemplateTerms(text: string): string[] {
  const upper = String(text || "").toUpperCase();
  const hits = FORBIDDEN_TERMS.filter((term) => upper.includes(term));
  if (containsInternalTerm(text) && !hits.length) hits.push("istilah internal");
  return [...new Set(hits)];
}

export function notificationTemplatesValidate(value: NotificationTemplatesSettings): string | null {
  for (const template of value.templates) {
    const definition = templateDefinition(template.key);
    const label = definition?.label ?? template.key;
    if (template.enabled && !template.title.trim()) return `Judul template "${label}" wajib diisi.`;
    if (template.enabled && !template.message.trim()) return `Isi template "${label}" wajib diisi.`;
    const unknown = unknownTemplateVariables(`${template.title} ${template.message}`);
    if (unknown.length) {
      return `Template "${label}" memakai variabel yang tidak diizinkan: ${unknown.map((key) => `{${key}}`).join(", ")}. Gunakan chip variabel yang tersedia.`;
    }
  }
  return null;
}

/** Istilah internal hanya menghalangi Terbitkan; draf tetap boleh disimpan. */
export function notificationTemplatesPublishError(value: NotificationTemplatesSettings): string | null {
  const invalid = notificationTemplatesValidate(value);
  if (invalid) return invalid;
  for (const template of value.templates) {
    if (!template.enabled) continue;
    const definition = templateDefinition(template.key);
    const label = definition?.label ?? template.key;
    const forbidden = forbiddenTemplateTerms(`${template.title} ${template.message}`);
    if (forbidden.length) {
      return `Template "${label}" memuat istilah internal (${forbidden.join(", ")}). Tulis dengan bahasa pelanggan, mis. "Berhasil", "Diproses", atau "Pembayaran".`;
    }
  }
  return null;
}

export function sampleTemplateVariables(): Record<NotificationVariableKey, string> {
  return Object.fromEntries(NOTIFICATION_VARIABLES.map((item) => [item.key, item.sample])) as Record<NotificationVariableKey, string>;
}

/** Render kurung kurawal tunggal; variabel tak dikenal dibiarkan kosong. */
export function renderNotificationTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>
): string {
  return String(template || "").replace(/\{\s*([^{}]+?)\s*\}/g, (_, key: string) => String(variables[key] ?? ""));
}

/** Peta variabel lama dari pemanggil notifyUser ke daftar putih. */
export function canonicalNotificationVariables(
  input: Record<string, unknown>
): Record<string, string> {
  const read = (key: string) => {
    const value = input[key];
    return value == null ? "" : String(value);
  };
  return {
    nama: read("nama") || read("name") || read("sender") || read("recipient") || read("recipient_name"),
    produk: read("produk") || read("product") || read("product_name"),
    nominal: read("nominal") || read("amount"),
    tujuan: read("tujuan") || read("target"),
    invoice: read("invoice") || read("reference") || read("order_number"),
    saldo: read("saldo") || read("balance"),
    tanggal: read("tanggal") || read("date") || read("time"),
    alasan: read("alasan") || read("reason"),
  };
}
