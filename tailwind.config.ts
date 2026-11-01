import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Acuan warna Design System AIDIL STORE (identitas default "Biru Neon":
// biru #1573D1 terang / #3AA7FF gelap + aksen hijau #7BD32A).
// - gold 50-950  : NAMA TOKEN LEGACY untuk BIRU brand. DEFAULT & 400 memakai
//                  --app-accent sehingga ikut berubah saat admin menerbitkan
//                  tema baru; shade lain tetap gradasi biru statis untuk
//                  background lembut/gradasi gelap yang sengaja tidak berubah.
//                  Nama dipertahankan agar ribuan class gold-* tidak perlu
//                  di-rename; jangan menambah pemakaian baru.
// - mint 50-950  : aksen sekunder HIJAU MUDA. DEFAULT & 400 memakai
//                  --theme-accent-rgb (warna aksen tema), shade lain tetap.
//                  Jangan pakai mint untuk status "Berhasil" — status emerald.
// - brand-gradient: gradasi diagonal biru → hijau muda dari variabel tema
//                  (--primary, --theme-primary-strong, --theme-accent-strong).
// Utility: bg-brand-gradient.
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
          "on-primary": "var(--primary-contrast)",
          "on-accent": "var(--accent-contrast)",
        },
        brand: {
          DEFAULT: "var(--primary)",
          dark: "var(--theme-primary-strong)",
          mint: "var(--accent)",
        },
        gold: {
          DEFAULT: "rgb(var(--app-accent) / <alpha-value>)",
          50: "#EFF8FF",
          100: "#D9EEFF",
          200: "#B6E0FF",
          300: "#7CC9FC",
          400: "rgb(var(--app-accent) / <alpha-value>)",
          500: "#1B85EE",
          600: "#1565E0",
          700: "#1151B8",
          800: "#0E418F",
          900: "#0B326B",
          950: "#071F45",
        },
        mint: {
          DEFAULT: "rgb(var(--theme-accent-rgb) / <alpha-value>)",
          50: "#F5FDE8",
          100: "#E9FBD0",
          200: "#D4F6A5",
          300: "#B8EE70",
          400: "rgb(var(--theme-accent-rgb) / <alpha-value>)",
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
          "linear-gradient(135deg, var(--primary) 0%, var(--theme-primary-strong) 45%, var(--theme-accent-strong) 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
