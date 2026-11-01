import { z } from "zod";
import {
  internalPathOrHttpsSchema,
  isInternalPathOrHttps,
  plainTextSchema,
} from "@/lib/setting-primitives";

// Teks & halaman statis (site_settings.pages_settings, migrasi v107).
//
// Isi halaman disimpan sebagai JSON blok, BUKAN HTML/Markdown bebas. Render
// hanya lewat komponen React (teks biasa) sehingga tidak ada jalur XSS:
//  - paragraph/heading/list selalu teks.
//  - link hanya path internal ("/...") atau https.
// File ini murni dan aman dipakai server maupun client.

export const PAGES_SETTINGS_KEY = "pages_settings";

export const STATIC_PAGE_SLUGS = [
  "syarat-ketentuan",
  "kebijakan-privasi",
  "tentang-kami",
  "kontak",
] as const;

export type StaticPageSlug = (typeof STATIC_PAGE_SLUGS)[number];

export const STATIC_PAGE_TITLES: Record<StaticPageSlug, string> = {
  "syarat-ketentuan": "Syarat & Ketentuan",
  "kebijakan-privasi": "Kebijakan Privasi",
  "tentang-kami": "Tentang Kami",
  kontak: "Kontak",
};

export type PageBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; text: string; href: string };

export type StaticPage = {
  title: string;
  intro: string;
  blocks: PageBlock[];
};

export type ContactSettings = {
  whatsapp1: string;
  whatsapp2: string;
  email: string;
  hours: string;
  address: string;
};

export type FooterSettings = {
  tagline: string;
  description: string;
  copyright: string;
};

export type LabelSettings = {
  /** Kosong = pakai judul dari Pengaturan Beranda. */
  heroTitle: string;
  guestCta: string;
  emptyOrdersTitle: string;
  emptyOrdersDescription: string;
};

export type PagesSettings = {
  pages: Record<StaticPageSlug, StaticPage>;
  contact: ContactSettings;
  footer: FooterSettings;
  labels: LabelSettings;
};

const termsBlocks: PageBlock[] = [
  { type: "paragraph", text: "Ketentuan ini mengatur penggunaan akun, pembelian produk digital, layanan PPOB, saldo, pembayaran, KYC, dan layanan lain pada AIDIL STORE. Dengan menggunakan layanan, pengguna menyatakan data yang diberikan benar dan memahami proses transaksi." },
  { type: "heading", text: "1. Akun dan data pengguna" },
  { type: "paragraph", text: "Pengguna wajib menjaga email, nomor telepon, password, PIN transaksi, dan perangkat. Dilarang menggunakan identitas orang lain, membuat transaksi palsu, melakukan manipulasi sistem, atau mencoba mengakses akun pengguna lain." },
  { type: "heading", text: "2. Produk dan layanan" },
  { type: "paragraph", text: "Produk digital dan PPOB diproses berdasarkan data tujuan yang dimasukkan pengguna dan ketersediaan mitra layanan. Kesalahan nomor tujuan dapat menyebabkan transaksi tidak dapat dikembalikan apabila pesanan telah diproses mitra layanan. Waktu proses dapat dipengaruhi gangguan layanan, jaringan, atau sistem pembayaran." },
  { type: "heading", text: "3. Pembayaran dan saldo" },
  { type: "paragraph", text: "Pengguna wajib membayar sesuai nominal dan batas waktu yang tercantum. Satu akun hanya dapat memiliki satu Top Up otomatis yang belum selesai. Saldo dikreditkan setelah pembayaran terverifikasi oleh sistem." },
  { type: "heading", text: "4. Transaksi dan pembatalan" },
  { type: "paragraph", text: "Status transaksi mengikuti catatan sistem dan mitra layanan. Pembatalan hanya tersedia pada status yang memang dapat dibatalkan. Refund diberikan sesuai status transaksi, ketentuan mitra layanan, dan hasil pemeriksaan sistem." },
  { type: "heading", text: "5. KYC dan layanan Reseller" },
  { type: "paragraph", text: "Akun baru berjenis Pelanggan. Layanan tertentu seperti transfer uang dapat mensyaratkan KYC. Setelah KYC diverifikasi admin, jenis akun berubah menjadi Reseller dan layanan yang mensyaratkan KYC dapat digunakan." },
  { type: "heading", text: "6. Penyalahgunaan" },
  { type: "paragraph", text: "AIDIL STORE dapat membatasi atau meninjau transaksi yang terindikasi tidak wajar, melanggar ketentuan mitra layanan, atau berpotensi merugikan pengguna maupun sistem." },
  { type: "heading", text: "7. Perubahan ketentuan" },
  { type: "paragraph", text: "Ketentuan dapat diperbarui untuk menyesuaikan perubahan layanan, mitra layanan, keamanan, atau kewajiban hukum. Versi terbaru akan ditampilkan pada halaman ini." },
  { type: "link", text: "Lihat identitas usaha lengkap", href: "/identitas-usaha" },
];

const privacyBlocks: PageBlock[] = [
  { type: "paragraph", text: "AIDIL STORE memproses data secara terbatas untuk membuat akun, menjalankan pembayaran, memproses transaksi, memberikan bantuan, mencegah penyalahgunaan, dan memenuhi kewajiban yang berlaku." },
  { type: "heading", text: "Data yang dapat diproses" },
  { type: "paragraph", text: "Data dapat mencakup nama, email, nomor WhatsApp/telepon, data akun, data transaksi, data perangkat yang diperlukan untuk keamanan, serta dokumen KYC yang diberikan pengguna." },
  { type: "heading", text: "Penggunaan data" },
  { type: "paragraph", text: "Data digunakan untuk autentikasi, verifikasi, pembayaran, pengiriman layanan digital, riwayat transaksi, dukungan pelanggan, keamanan, audit, dan pencegahan penyalahgunaan." },
  { type: "heading", text: "KYC" },
  { type: "paragraph", text: "Dokumen KYC disimpan pada penyimpanan privat dan hanya dapat diakses melalui jalur yang diizinkan untuk proses verifikasi. Dokumen tidak ditampilkan sebagai file publik." },
  { type: "heading", text: "Keamanan" },
  { type: "paragraph", text: "AIDIL STORE menerapkan kontrol akses, autentikasi, pembatasan hak akses, dan mekanisme keamanan transaksi. Pengguna tetap bertanggung jawab menjaga kredensial dan PIN." },
  { type: "heading", text: "Hak pengguna" },
  { type: "paragraph", text: "Pengguna dapat meminta koreksi atau penghapusan data melalui proses dukungan yang tersedia, dengan tetap memperhatikan data yang wajib disimpan berdasarkan transaksi, keamanan, atau kewajiban hukum." },
  { type: "heading", text: "Perubahan kebijakan" },
  { type: "paragraph", text: "Kebijakan dapat diperbarui ketika layanan atau kewajiban hukum berubah. Versi terbaru berlaku setelah dipublikasikan pada halaman ini." },
  { type: "link", text: "Lihat identitas usaha lengkap", href: "/identitas-usaha" },
];

const aboutBlocks: PageBlock[] = [
  { type: "paragraph", text: "AIDIL STORE adalah layanan digital yang menyediakan pulsa, paket data, top up game, saldo dompet digital, pembayaran tagihan, voucher, dan berbagai kebutuhan digital lain dalam satu akun." },
  { type: "heading", text: "Apa yang kami sediakan" },
  { type: "list", items: ["Pulsa, paket data, dan masa aktif semua operator.", "Top up game dan voucher hiburan digital.", "Pembayaran tagihan listrik, air, internet, dan cicilan.", "Saldo dompet digital, transfer antar pengguna, dan riwayat transaksi yang rapi."] },
  { type: "heading", text: "Komitmen kami" },
  { type: "paragraph", text: "Kami menjaga transparansi biaya, keamanan akun, dan kejelasan status transaksi. Setiap pesanan diproses berdasarkan data tujuan yang Anda masukkan, dengan dukungan pelanggan saat Anda membutuhkannya." },
];

const contactBlocks: PageBlock[] = [
  { type: "paragraph", text: "Tim AIDIL STORE siap membantu pertanyaan tentang pesanan, pembayaran, saldo, verifikasi akun, dan kendala layanan lainnya. Sertakan nomor pesanan agar penanganan lebih cepat." },
  { type: "heading", text: "Sebelum menghubungi" },
  { type: "list", items: ["Siapkan nomor pesanan atau nomor transaksi.", "Jelaskan kendala secara singkat dan jelas.", "Jangan pernah mengirim password, PIN, atau kode verifikasi kepada siapa pun."] },
];

export const DEFAULT_PAGES_SETTINGS: PagesSettings = {
  pages: {
    "syarat-ketentuan": {
      title: "Ketentuan Layanan",
      intro: "Ketentuan ini berlaku untuk seluruh pengguna AIDIL STORE. Identitas usaha lengkap tersedia pada halaman Identitas Usaha.",
      blocks: termsBlocks,
    },
    "kebijakan-privasi": {
      title: "Kebijakan Privasi",
      intro: "Kebijakan ini menjelaskan bagaimana AIDIL STORE memproses dan melindungi data pribadi pengguna.",
      blocks: privacyBlocks,
    },
    "tentang-kami": {
      title: "Tentang Kami",
      intro: "Satu akun untuk kebutuhan digital sehari-hari.",
      blocks: aboutBlocks,
    },
    kontak: {
      title: "Kontak",
      intro: "Hubungi kami melalui WhatsApp atau email berikut.",
      blocks: contactBlocks,
    },
  },
  contact: {
    whatsapp1: "085834043432",
    whatsapp2: "0895428242365",
    email: "cs@aidilstore.id",
    hours: "Setiap hari, 08.00–22.00 WIB",
    address: "",
  },
  footer: {
    tagline: "Layanan digital untuk kebutuhan sehari-hari.",
    description: "Pulsa, data, game, tagihan, dan saldo dompet digital dalam satu akun.",
    copyright: "AIDIL STORE. Seluruh hak cipta dilindungi.",
  },
  labels: {
    heroTitle: "",
    guestCta: "Masuk / Daftar",
    emptyOrdersTitle: "Belum ada pesanan",
    emptyOrdersDescription: "Pesanan yang Anda buat akan muncul di sini.",
  },
};

const headingBlock = z.object({
  type: z.literal("heading"),
  text: z.string().trim().min(1, "Judul bagian wajib diisi.").max(120, "Judul bagian maksimal 120 karakter."),
});

const paragraphBlock = z.object({
  type: z.literal("paragraph"),
  text: z.string().trim().min(1, "Paragraf wajib diisi.").max(2000, "Paragraf maksimal 2.000 karakter."),
});

const listBlock = z.object({
  type: z.literal("list"),
  items: z
    .array(z.string().trim().max(300, "Butir daftar maksimal 300 karakter."))
    .min(1, "Daftar perlu minimal satu butir.")
    .max(30, "Maksimal 30 butir per daftar."),
});

const linkBlock = z.object({
  type: z.literal("link"),
  text: z.string().trim().min(1, "Teks tautan wajib diisi.").max(120, "Teks tautan maksimal 120 karakter."),
  href: internalPathOrHttpsSchema,
});

export const pageBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  paragraphBlock,
  listBlock,
  linkBlock,
]);

const pageSchema = z.object({
  title: z.string().trim().min(1, "Judul halaman wajib diisi.").max(120, "Judul halaman maksimal 120 karakter."),
  intro: plainTextSchema(600),
  blocks: z.array(pageBlockSchema).max(60, "Maksimal 60 blok per halaman."),
});

const contactSchema = z.object({
  whatsapp1: plainTextSchema(24),
  whatsapp2: plainTextSchema(24),
  email: plainTextSchema(120),
  hours: plainTextSchema(120),
  address: plainTextSchema(240),
});

const footerSchema = z.object({
  tagline: plainTextSchema(160),
  description: plainTextSchema(600),
  copyright: plainTextSchema(160),
});

const labelsSchema = z.object({
  heroTitle: plainTextSchema(120),
  guestCta: plainTextSchema(40),
  emptyOrdersTitle: plainTextSchema(80),
  emptyOrdersDescription: plainTextSchema(240),
});

export const pagesSettingsInputSchema = z.object({
  pages: z
    .object({
      "syarat-ketentuan": pageSchema.default(DEFAULT_PAGES_SETTINGS.pages["syarat-ketentuan"]),
      "kebijakan-privasi": pageSchema.default(DEFAULT_PAGES_SETTINGS.pages["kebijakan-privasi"]),
      "tentang-kami": pageSchema.default(DEFAULT_PAGES_SETTINGS.pages["tentang-kami"]),
      kontak: pageSchema.default(DEFAULT_PAGES_SETTINGS.pages.kontak),
    })
    .default(DEFAULT_PAGES_SETTINGS.pages),
  contact: contactSchema.default(DEFAULT_PAGES_SETTINGS.contact),
  footer: footerSchema.default(DEFAULT_PAGES_SETTINGS.footer),
  labels: labelsSchema.default(DEFAULT_PAGES_SETTINGS.labels),
});

export function normalizePagesSettings(
  value: z.infer<typeof pagesSettingsInputSchema>
): PagesSettings {
  const pages = {} as Record<StaticPageSlug, StaticPage>;
  for (const slug of STATIC_PAGE_SLUGS) {
    const page = value.pages[slug];
    pages[slug] = {
      title: page.title.trim(),
      intro: page.intro.trim(),
      blocks: page.blocks.map((block) => {
        if (block.type === "list") {
          return { type: "list" as const, items: block.items.map((item) => item.trim()).filter(Boolean) };
        }
        if (block.type === "link") {
          return { type: "link" as const, text: block.text.trim(), href: block.href.trim() };
        }
        return { type: block.type, text: block.text.trim() };
      }),
    };
  }

  return {
    pages,
    contact: {
      whatsapp1: value.contact.whatsapp1.trim(),
      whatsapp2: value.contact.whatsapp2.trim(),
      email: value.contact.email.trim(),
      hours: value.contact.hours.trim(),
      address: value.contact.address.trim(),
    },
    footer: {
      tagline: value.footer.tagline.trim(),
      description: value.footer.description.trim(),
      copyright: value.footer.copyright.trim(),
    },
    labels: {
      heroTitle: value.labels.heroTitle.trim(),
      guestCta: value.labels.guestCta.trim(),
      emptyOrdersTitle: value.labels.emptyOrdersTitle.trim(),
      emptyOrdersDescription: value.labels.emptyOrdersDescription.trim(),
    },
  };
}

/** Nomor tampilan ("0858…") menjadi tautan wa.me tanpa karakter aneh. */
export function whatsappHref(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}

export function safeLinkHref(href: string): string | null {
  return isInternalPathOrHttps(href) ? href : null;
}

export function pageFor(settings: PagesSettings, slug: StaticPageSlug): StaticPage {
  return settings.pages[slug] ?? DEFAULT_PAGES_SETTINGS.pages[slug];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function pagesValidate(value: PagesSettings): string | null {
  for (const slug of STATIC_PAGE_SLUGS) {
    const page = value.pages[slug];
    if (!page.title.trim()) return `Judul halaman ${STATIC_PAGE_TITLES[slug]} wajib diisi.`;
    if (page.blocks.length > 60) return `Halaman ${STATIC_PAGE_TITLES[slug]} maksimal 60 blok.`;
    for (const block of page.blocks) {
      if (block.type === "link" && !safeLinkHref(block.href)) {
        return `Tautan pada halaman ${STATIC_PAGE_TITLES[slug]} hanya boleh path internal (diawali /) atau https.`;
      }
      if (block.type === "list" && block.items.filter((item) => item.trim()).length === 0) {
        return `Daftar pada halaman ${STATIC_PAGE_TITLES[slug]} perlu minimal satu butir.`;
      }
    }
  }
  if (value.contact.email && !EMAIL_PATTERN.test(value.contact.email)) {
    return "Email kontak belum valid. Contoh: cs@contoh.com.";
  }
  if (value.contact.whatsapp1 && !whatsappHref(value.contact.whatsapp1)) {
    return "Nomor WhatsApp 1 minimal 8 digit angka.";
  }
  if (value.contact.whatsapp2 && !whatsappHref(value.contact.whatsapp2)) {
    return "Nomor WhatsApp 2 minimal 8 digit angka.";
  }
  if (value.labels.heroTitle.length > 120) return "Judul hero maksimal 120 karakter.";
  if (value.labels.guestCta.length > 40) return "Teks tombol utama maksimal 40 karakter.";
  return null;
}

/** Pemeriksaan sebelum terbit: teks wajib yang kosong tidak boleh tayang. */
export function pagesPublishError(value: PagesSettings): string | null {
  const invalid = pagesValidate(value);
  if (invalid) return invalid;
  if (value.pages.kontak.blocks.length === 0) {
    return "Halaman Kontak belum memiliki isi. Tambahkan minimal satu blok sebelum menerbitkan.";
  }
  if (!value.contact.whatsapp1 && !value.contact.email) {
    return "Isi minimal satu kanal kontak (WhatsApp atau email) sebelum menerbitkan.";
  }
  if (!value.footer.copyright.trim()) {
    return "Teks hak cipta footer wajib diisi sebelum menerbitkan.";
  }
  if (!value.labels.guestCta.trim()) {
    return "Teks tombol utama wajib diisi sebelum menerbitkan.";
  }
  return null;
}
