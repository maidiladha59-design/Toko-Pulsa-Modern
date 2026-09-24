// Panduan & validasi "data tujuan" per jenis produk (pulsa, game, PLN, e-wallet, tagihan, dst).
// Dipakai di halaman checkout supaya pelanggan tahu persis apa yang harus diisi.

export type GuideField = {
  name: string;
  label: string;
  placeholder: string;
  inputMode: "numeric" | "tel" | "text";
  maxLength: number;
  numeric: boolean;
  required?: boolean;
  help?: string;
};

export type TargetGuide = {
  heading: string;
  intro: string;
  fields: GuideField[];
  tips: string[];
  /** null = valid; string = pesan error untuk pelanggan */
  validate: (values: Record<string, string>) => string | null;
  /** nilai yang dikirim sebagai customer_no ke provider */
  compose: (values: Record<string, string>) => string;
  /** label deteksi otomatis (mis. operator), tampil saat pelanggan mengetik */
  detect?: (values: Record<string, string>) => string | null;
};

export type GuideInput = {
  category?: string | null;
  brand?: string | null;
  productName?: string | null;
  serviceKind: "prepaid" | "postpaid";
  schemaFields?: Array<{ name: string; label: string; type?: string; required?: boolean; placeholder?: string }> | null;
};

// ---------- Nomor HP & operator ----------
export type Operator = "Telkomsel" | "Indosat" | "XL/AXIS" | "Tri" | "Smartfren";

const PREFIXES: Record<Operator, string[]> = {
  Telkomsel: ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"],
  Indosat: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"],
  "XL/AXIS": ["0817", "0818", "0819", "0859", "0877", "0878", "0831", "0832", "0833", "0838"],
  Tri: ["0895", "0896", "0897", "0898", "0899"],
  Smartfren: ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"],
};

/** 62812xxx / +62 812-xxx / 812xxx  ->  0812xxx */
export function normalizePhone(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  else if (d.startsWith("8")) d = "0" + d;
  return d;
}

export function detectOperator(raw: string): Operator | null {
  const n = normalizePhone(raw);
  if (n.length < 4) return null;
  const prefix = n.slice(0, 4);
  for (const op of Object.keys(PREFIXES) as Operator[]) if (PREFIXES[op].includes(prefix)) return op;
  return null;
}

/** Operator dari nama produk/brand (by.U = jaringan Telkomsel). */
export function operatorFromText(text: string): Operator | null {
  const t = ` ${String(text || "").toLowerCase()} `;
  if (/telkomsel|simpati|kartu\s?as|loop|by\.?u/.test(t)) return "Telkomsel";
  if (/indosat|im3|mentari|only4u/.test(t)) return "Indosat";
  if (/\bxl\b|axis|xl axiata|cuanku/.test(t)) return "XL/AXIS";
  if (/\btri\b|\bthree\b|cuanmax/.test(t)) return "Tri";
  if (/smartfren/.test(t)) return "Smartfren";
  return null;
}

// ---------- Builder ----------
const digits = (v: string) => String(v || "").replace(/\D/g, "");
const clean = (v: string) => String(v || "").trim();

function phoneField(label = "Nomor HP", placeholder = "Contoh: 081234567890"): GuideField {
  return { name: "customer_no", label, placeholder, inputMode: "tel", maxLength: 16, numeric: true };
}

function phoneGuide(opts: { heading: string; intro: string; label?: string; productOperator?: Operator | null; tips: string[]; help?: string }): TargetGuide {
  return {
    heading: opts.heading,
    intro: opts.intro,
    fields: [{ ...phoneField(opts.label), help: opts.help }],
    tips: opts.tips,
    compose: (v) => normalizePhone(v.customer_no),
    detect: (v) => {
      const op = detectOperator(v.customer_no || "");
      return op ? `Operator terdeteksi: ${op}` : null;
    },
    validate: (v) => {
      const n = normalizePhone(v.customer_no);
      if (!n) return "Nomor HP wajib diisi.";
      if (!/^08\d{8,12}$/.test(n)) return "Nomor HP harus diawali 08 (atau 62) dan terdiri dari 10–13 digit. Contoh: 081234567890.";
      const detected = detectOperator(n);
      if (opts.productOperator && detected && detected !== opts.productOperator) {
        return `Nomor ini terdeteksi ${detected}, sedangkan produk yang dipilih untuk ${opts.productOperator}. Silakan pilih produk ${detected} yang sesuai.`;
      }
      return null;
    },
  };
}

function idGuide(opts: {
  heading: string; intro: string; label: string; placeholder: string; min: number; max: number;
  tips: string[]; numeric?: boolean; help?: string; unitName?: string;
}): TargetGuide {
  const numeric = opts.numeric !== false;
  return {
    heading: opts.heading,
    intro: opts.intro,
    fields: [{ name: "customer_no", label: opts.label, placeholder: opts.placeholder, inputMode: numeric ? "numeric" : "text", maxLength: opts.max, numeric, help: opts.help }],
    tips: opts.tips,
    compose: (v) => (numeric ? digits(v.customer_no) : clean(v.customer_no)),
    validate: (v) => {
      const val = numeric ? digits(v.customer_no) : clean(v.customer_no);
      if (!val) return `${opts.label} wajib diisi.`;
      const unit = opts.unitName || (numeric ? "digit" : "karakter");
      if (val.length < opts.min || val.length > opts.max) {
        return opts.min === opts.max
          ? `${opts.label} harus ${opts.min} ${unit}. Yang Anda isi saat ini ${val.length} ${unit}.`
          : `${opts.label} harus ${opts.min}–${opts.max} ${unit}. Yang Anda isi saat ini ${val.length} ${unit}.`;
      }
      return null;
    },
  };
}

// ---------- Game ----------
type GameDef = { re: RegExp; guide: () => TargetGuide };

const GAMES: GameDef[] = [
  {
    re: /mobile\s*legend|mlbb|\bml\b/,
    guide: () => ({
      heading: "Data akun Mobile Legends",
      intro: "Masukkan User ID dan Zone ID akun Mobile Legends yang akan diisi.",
      fields: [
        { name: "user_id", label: "User ID", placeholder: "Contoh: 12345678", inputMode: "numeric", maxLength: 12, numeric: true },
        { name: "zone_id", label: "Zone ID", placeholder: "Contoh: 1234", inputMode: "numeric", maxLength: 5, numeric: true },
      ],
      tips: [
        "Buka Mobile Legends, ketuk foto profil di kiri atas.",
        "ID tertulis seperti 12345678 (1234). Angka pertama = User ID, angka dalam kurung = Zone ID.",
        "Pastikan sama persis. Diamond yang sudah masuk ke akun lain tidak bisa dibatalkan.",
      ],
      compose: (v) => digits(v.user_id) + digits(v.zone_id),
      validate: (v) => {
        const u = digits(v.user_id), z = digits(v.zone_id);
        if (!u) return "User ID wajib diisi.";
        if (u.length < 6 || u.length > 12) return "User ID Mobile Legends biasanya 6–12 digit.";
        if (!z) return "Zone ID wajib diisi.";
        if (z.length < 3 || z.length > 5) return "Zone ID Mobile Legends biasanya 4–5 digit.";
        return null;
      },
    }),
  },
  {
    re: /free\s*fire|\bff\b/,
    guide: () => idGuide({
      heading: "Data akun Free Fire", intro: "Masukkan ID Pemain (Player ID) akun Free Fire yang akan diisi.",
      label: "ID Pemain", placeholder: "Contoh: 123456789", min: 8, max: 12,
      tips: ["Buka Free Fire, ketuk foto profil di kiri atas.", "Salin ID Pemain (sekitar 9–11 digit) yang tertera di bawah nama.", "Pastikan ID benar — top up tidak bisa dipindahkan ke akun lain."],
    }),
  },
  {
    re: /pubg|battlegrounds/,
    guide: () => idGuide({
      heading: "Data akun PUBG Mobile", intro: "Masukkan ID Karakter akun PUBG Mobile yang akan diisi.",
      label: "ID Karakter", placeholder: "Contoh: 5123456789", min: 8, max: 12,
      tips: ["Buka PUBG Mobile, ketuk foto profil.", "ID Karakter tertulis di bawah nama karakter.", "Periksa lagi sebelum membayar."],
    }),
  },
  {
    re: /genshin|honkai|zenless|star\s*rail/,
    guide: () => idGuide({
      heading: "Data akun game", intro: "Masukkan UID akun game yang akan diisi.",
      label: "UID", placeholder: "Contoh: 800123456", min: 8, max: 10,
      tips: ["UID ada di pojok kanan bawah layar game atau di menu Profil.", "UID terdiri dari 9 digit (kadang 10).", "Pilih server yang sesuai dengan akun Anda."],
    }),
  },
  {
    re: /call\s*of\s*duty|codm/,
    guide: () => idGuide({
      heading: "Data akun Call of Duty Mobile", intro: "Masukkan Open ID akun Call of Duty Mobile.",
      label: "Open ID", placeholder: "Contoh: 6742019283746501234", min: 8, max: 25,
      tips: ["Buka Call of Duty Mobile, masuk ke menu Pengaturan / Profil.", "Salin Open ID (angka panjang) yang tertera.", "Pastikan tidak ada angka yang terlewat."],
    }),
  },
  {
    re: /higgs|domino/,
    guide: () => idGuide({
      heading: "Data akun Higgs Domino", intro: "Masukkan ID Pemain akun Higgs Domino.",
      label: "ID Pemain", placeholder: "Contoh: 123456789", min: 6, max: 14,
      tips: ["Buka Higgs Domino, ketuk foto profil.", "ID Pemain tertulis di bawah nama.", "Periksa lagi sebelum membayar."],
    }),
  },
];

function genericGameGuide(brand: string): TargetGuide {
  const name = brand ? ` ${brand}` : "";
  return idGuide({
    heading: `Data akun game${name}`, intro: "Masukkan ID akun game yang akan diisi.",
    label: "ID Game", placeholder: "Masukkan ID akun game", min: 4, max: 30, numeric: false,
    tips: ["Buka game, lalu lihat ID/UID di halaman profil.", "Jika game meminta Server/Zone, gabungkan sesuai petunjuk pada nama produk.", "Pastikan ID benar — top up tidak bisa dipindahkan ke akun lain."],
  });
}

// ---------- Fungsi utama ----------
export function guideFor(input: GuideInput): TargetGuide {
  const category = String(input.category || "").toLowerCase();
  const brand = String(input.brand || "").trim();
  const text = `${category} ${brand} ${input.productName || ""}`.toLowerCase();
  const kind = input.serviceKind;

  let guide = baseGuide(category, brand, text, kind);

  // Jika admin mendefinisikan form sendiri (lebih dari satu kolom / bukan customer_no), hormati itu.
  const schema = (input.schemaFields || []).filter((f) => f && f.name);
  const custom = schema.length > 0 && !(schema.length === 1 && schema[0].name === "customer_no");
  if (custom) {
    const fields: GuideField[] = schema.map((f) => ({
      name: f.name, label: f.label || f.name, placeholder: f.placeholder || `Masukkan ${String(f.label || f.name).toLowerCase()}`,
      inputMode: f.type === "number" ? "numeric" : "text", maxLength: 40, numeric: f.type === "number", required: f.required,
    }));
    guide = {
      ...guide,
      fields,
      compose: (v) => clean(v.customer_no) || fields.map((f) => clean(v[f.name])).filter(Boolean).join(""),
      validate: (v) => {
        for (const f of fields) if (f.required !== false && !clean(v[f.name])) return `${f.label} wajib diisi.`;
        return null;
      },
      detect: undefined,
    };
  }
  return guide;
}

function baseGuide(category: string, brand: string, text: string, kind: "prepaid" | "postpaid"): TargetGuide {
  // 1) Game
  if (category === "top-up-game" || /mobile\s*legend|mlbb|free\s*fire|pubg|genshin|honkai|zenless|call\s*of\s*duty|higgs/.test(text)) {
    for (const g of GAMES) if (g.re.test(text)) return g.guide();
    return genericGameGuide(brand);
  }

  // 2) PLN
  if (category === "pln-pascabayar") {
    return idGuide({ heading: "ID Pelanggan PLN", intro: "Masukkan ID Pelanggan (IDPEL) untuk cek tagihan listrik pascabayar.", label: "ID Pelanggan", placeholder: "12 digit, contoh: 531234567890", min: 12, max: 12, tips: ["IDPEL terdiri dari 12 digit, ada di struk/tagihan listrik bulanan.", "Bisa juga dicek di aplikasi PLN Mobile."] });
  }
  if (category === "pln-nontaglis") {
    return idGuide({ heading: "Nomor Registrasi PLN", intro: "Masukkan Nomor Registrasi untuk layanan non-taglis (mis. pasang baru, tambah daya).", label: "Nomor Registrasi", placeholder: "13 digit", min: 13, max: 13, tips: ["Nomor registrasi tertera pada surat/bukti layanan dari PLN."] });
  }
  if (category === "pln" || /\bpln\b|token listrik/.test(text)) {
    return idGuide({ heading: "Nomor Meter / ID Pelanggan PLN", intro: "Masukkan nomor meter atau ID pelanggan PLN yang akan diisi token listriknya.", label: "Nomor Meter / ID Pelanggan", placeholder: "11–12 digit, contoh: 12345678901", min: 11, max: 12, tips: ["Nomor meter (11 digit) atau ID pelanggan (12 digit) ada di meteran listrik atau struk token lama.", "Bisa juga dicek di aplikasi PLN Mobile.", "Token akan dikirim sebagai kode SN di struk transaksi."] });
  }

  // 3) E-wallet / e-money
  if (category === "e-wallet") {
    if (/brizzi|tapcash|e-?money|flazz|mandiri e|kartu/.test(text)) {
      return idGuide({ heading: "Nomor Kartu E-Money", intro: "Masukkan nomor kartu uang elektronik yang akan diisi saldonya.", label: "Nomor Kartu", placeholder: "16 digit tertera di kartu", min: 16, max: 16, tips: ["Nomor 16 digit tercetak di bagian depan/belakang kartu.", "Setelah top up, saldo perlu di-update lewat aplikasi bank atau mesin reader."] });
    }
    const wallet = /ovo|dana|gopay|go-pay|shopee|linkaja|isaku|doku|sakuku/.exec(text)?.[0];
    const walletName = wallet ? wallet.replace("go-pay", "gopay").toUpperCase() : "e-wallet";
    return phoneGuide({ heading: `Nomor ${walletName}`, intro: `Masukkan nomor HP yang terdaftar di akun ${walletName}.`, label: `Nomor HP ${walletName}`, tips: [`Gunakan nomor yang sama dengan yang terdaftar di aplikasi ${walletName}.`, "Contoh: 081234567890. Awalan +62 atau 62 juga bisa."] });
  }

  // 4) Pulsa, kuota, dan produk berbasis nomor HP
  const phoneCats = ["pulsa", "paket-data", "sms-telpon", "masa-aktif", "aktivasi-perdana", "aktivasi-voucher", "bundling", "telkomsel-omni", "indosat-only4u", "tri-cuanmax", "xl-axis-cuanku", "byu", "hp-pascabayar", "pascabayar"];
  if (phoneCats.includes(category)) {
    const op = operatorFromText(`${brand} ${category} ${text}`);
    const postpaid = kind === "postpaid";
    return phoneGuide({
      heading: postpaid ? "Nomor HP Pascabayar" : "Nomor HP Tujuan",
      intro: postpaid ? "Masukkan nomor HP pascabayar untuk cek tagihan." : `Masukkan nomor HP yang akan diisi${op ? ` (${op})` : ""}.`,
      productOperator: op,
      tips: [
        "Awali dengan 08 atau 62, contoh: 081234567890 (10–13 digit).",
        op ? `Produk ini khusus kartu ${op}. Operator akan dicek otomatis dari nomor yang Anda isi.` : "Operator akan dicek otomatis dari nomor yang Anda isi.",
        "Periksa kembali nomor sebelum membayar. Transaksi yang sudah berhasil tidak bisa dibatalkan.",
      ],
    });
  }
  if (/china|malaysia|philippines|singapore|thailand|vietnam/.test(category)) {
    return idGuide({ heading: "Nomor Tujuan", intro: "Masukkan nomor tujuan sesuai layanan yang dipilih.", label: "Nomor Tujuan", placeholder: "Nomor HP / ID akun tujuan", min: 5, max: 20, tips: ["Isi sesuai petunjuk pada nama produk.", "Gunakan format nomor internasional jika diminta, contoh: 60123456789."] });
  }

  // 5) Tagihan lain
  switch (category) {
    case "bpjs-kesehatan":
    case "bpjs":
      return idGuide({ heading: "Nomor BPJS Kesehatan", intro: "Masukkan nomor Virtual Account / nomor peserta BPJS Kesehatan.", label: "Nomor VA BPJS", placeholder: "Contoh: 8888801234567890", min: 10, max: 16, tips: ["Nomor VA ada di kartu BPJS atau aplikasi Mobile JKN.", "Satu nomor VA mewakili satu keluarga."] });
    case "bpjs-ketenagakerjaan":
      return idGuide({ heading: "Nomor BPJS Ketenagakerjaan", intro: "Masukkan nomor kartu peserta (KPJ).", label: "Nomor KPJ", placeholder: "11 digit", min: 8, max: 20, tips: ["Nomor KPJ tertera di kartu BPJS Ketenagakerjaan atau aplikasi JMO."] });
    case "pdam":
      return idGuide({ heading: "Nomor Pelanggan PDAM", intro: "Masukkan nomor pelanggan air PDAM.", label: "Nomor Pelanggan", placeholder: "Sesuai tagihan PDAM", min: 5, max: 20, numeric: false, tips: ["Nomor pelanggan ada di lembar tagihan air bulanan.", "Pastikan produk yang dipilih sesuai dengan PDAM di kota Anda."] });
    case "internet":
    case "internet-pascabayar":
      return idGuide({ heading: "Nomor Pelanggan Internet", intro: "Masukkan nomor pelanggan/nomor internet untuk cek tagihan.", label: "Nomor Pelanggan", placeholder: "Contoh IndiHome: 12 digit", min: 5, max: 20, numeric: false, tips: ["Nomor pelanggan ada di tagihan atau aplikasi provider internet (mis. myIndiHome).", "Pastikan produk sesuai dengan provider internet Anda."] });
    case "tv":
    case "tv-pascabayar":
      return idGuide({ heading: "Nomor Pelanggan TV", intro: "Masukkan nomor pelanggan TV berlangganan.", label: "Nomor Pelanggan", placeholder: "Sesuai kartu/tagihan", min: 5, max: 20, numeric: false, tips: ["Nomor pelanggan ada di kartu, decoder, atau tagihan TV Anda."] });
    case "gas":
    case "gas-negara":
      return idGuide({ heading: "Nomor Pelanggan Gas", intro: "Masukkan nomor pelanggan gas.", label: "Nomor Pelanggan", placeholder: "Sesuai tagihan gas", min: 5, max: 20, numeric: false, tips: ["Nomor pelanggan ada di tagihan atau meteran gas."] });
    case "multifinance":
      return idGuide({ heading: "Nomor Kontrak / Pelanggan", intro: "Masukkan nomor kontrak cicilan untuk cek tagihan.", label: "Nomor Kontrak", placeholder: "Sesuai kartu/tagihan cicilan", min: 5, max: 25, numeric: false, tips: ["Nomor kontrak ada di kartu angsuran atau aplikasi perusahaan pembiayaan.", "Pastikan produk yang dipilih sesuai dengan perusahaan pembiayaannya."] });
    case "pbb":
      return idGuide({ heading: "Nomor Objek Pajak (NOP)", intro: "Masukkan NOP untuk cek tagihan PBB.", label: "NOP", placeholder: "18 digit", min: 18, max: 18, tips: ["NOP terdiri dari 18 digit, tertera di SPPT PBB."] });
    case "samsat":
      return idGuide({ heading: "Data Pajak Kendaraan", intro: "Masukkan nomor sesuai petunjuk pada produk Samsat.", label: "Nomor Identitas Pajak", placeholder: "Sesuai petunjuk produk", min: 5, max: 30, numeric: false, tips: ["Nomor yang dibutuhkan berbeda tiap daerah. Ikuti keterangan pada nama produk."] });
    case "media-sosial":
      return idGuide({ heading: "Username / Link Akun", intro: "Masukkan username atau link akun yang akan diproses.", label: "Username / Link", placeholder: "Contoh: @namaakun", min: 3, max: 120, numeric: false, tips: ["Pastikan akun tidak dikunci/private agar pesanan bisa diproses."] });
    case "voucher":
    case "streaming":
    case "hotel":
      return idGuide({ heading: "Data Tujuan", intro: "Masukkan data yang dibutuhkan produk ini.", label: "Nomor / ID Tujuan", placeholder: "Nomor HP atau ID akun sesuai produk", min: 3, max: 64, numeric: false, tips: ["Isi sesuai petunjuk pada nama produk (nomor HP, email, atau ID akun).", "Jika produk berupa voucher kode, kode akan muncul di struk (kolom SN/Ref) setelah berhasil."] });
  }

  return idGuide({
    heading: "Data Tujuan", intro: kind === "postpaid" ? "Masukkan nomor pelanggan untuk cek tagihan." : "Lengkapi data tujuan sebelum membayar.",
    label: "Nomor Pelanggan", placeholder: "Masukkan nomor pelanggan / ID tujuan", min: 3, max: 64, numeric: false,
    tips: ["Isi sesuai petunjuk pada nama produk.", "Periksa kembali sebelum membayar."],
  });
}