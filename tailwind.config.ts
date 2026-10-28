import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Acuan warna Design System AIDIL STORE (identitas baru: biru + hijau muda di atas gelap):
// - gold 50-950  : NAMA TOKEN LEGACY, nilainya kini gradasi BIRU listrik.
//                  DEFAULT #2E9EF5 = gold-400 (biru terang), gold-600 #1565E0 = biru dalam.
//                  Nama dipertahankan agar ribuan class gold-* tidak perlu di-rename;
//                  jangan menambah pemakaian baru — gunakan makna "biru/brand".
// - mint 50-950  : aksen sekunder HIJAU MUDA (DEFAULT #8CD93A = mint-400).
//                  Dipakai berdampingan dengan biru, bukan dicampur: biru = aksi utama,
//                  mint = highlight/aksen/status aktif. Jangan pakai mint untuk status
//                  "Berhasil" — status tetap emerald (success-*).
// - brand-gradient: gradasi diagonal biru → hijau muda untuk branding (logo container,
//                  header utama, CTA paling penting). Utility: bg-brand-gradient.
// - zinc         : netral memakai palet bawaan Tailwind (lengkap 50-950), dipakai untuk
//                  hitam pekat (zinc-950 = #09090b) dan teks sekunder.
// - app-*        : token tema dual-mode (terang/gelap) dari CSS var di globals.css —
//                  SELALU dipakai untuk latar/teks/border agar tema tidak rusak.
// - success/danger/warning : token semantik status transaksi & badge (Berhasil/Gagal/
//                  Pending). Alias 1:1 palet bawaan emerald/red/amber yang sudah dipakai
//                  di seluruh situs — nilainya identik, hanya namanya yang distandarkan.
//                  Komponen memakai shade eksplisit (mis. success-600, danger-400 di dark).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: "#09090b",
        app: {
          bg: "rgb(var(--app-bg) / <alpha-value>)",
          surface: "rgb(var(--app-surface) / <alpha-value>)",
          inset: "rgb(var(--app-inset) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
          text: "rgb(var(--app-text) / <alpha-value>)",
          muted: "rgb(var(--app-muted) / <alpha-value>)",
          subtle: "rgb(var(--app-subtle) / <alpha-value>)",
          accent: "rgb(var(--app-accent) / <alpha-value>)",
          "accent-soft": "rgb(var(--app-accent-soft) / <alpha-value>)",
          kicker: "rgb(var(--app-kicker) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "#2E9EF5",
          dark: "#1565E0",
          mint: "#8CD93A",
        },
        gold: {
          DEFAULT: "#2E9EF5",
          50: "#EFF8FF",
          100: "#D9EEFF",
          200: "#B6E0FF",
          300: "#7CC9FC",
          400: "#2E9EF5",
          500: "#1B85EE",
          600: "#1565E0",
          700: "#1151B8",
          800: "#0E418F",
          900: "#0B326B",
          950: "#071F45",
        },
        mint: {
          DEFAULT: "#8CD93A",
          50: "#F5FDE8",
          100: "#E9FBD0",
          200: "#D4F6A5",
          300: "#B8EE70",
          400: "#8CD93A",
          500: "#74CC2A",
          600: "#5BBE1F",
          700: "#469A17",
          800: "#367712",
          900: "#2A5B10",
          950: "#17330A",
        },
        success: { ...colors.emerald, DEFAULT: colors.emerald[600] },
        danger: { ...colors.red, DEFAULT: colors.red[600] },
        warning: { ...colors.amber, DEFAULT: colors.amber[500] },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #2E9EF5 0%, #1565E0 45%, #5BBE1F 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
