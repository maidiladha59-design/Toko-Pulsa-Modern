import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Acuan warna Design System AIDIL STORE:
// - gold 50-950  : identitas emas tua (DEFAULT #C9A227 = gold-400). Skala lengkap:
//                  gold-200 #F0D878 = shine, gold-300 #D9B73B = hover, gold-400 #C9A227 = base,
//                  gold-600/700 = teks emas di atas latar terang (kontras AA).
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
          DEFAULT: "#C9A227",
          dark: "#B08D21",
        },
        gold: {
          DEFAULT: "#C9A227",
          50: "#FBF7E9",
          100: "#F5EDCB",
          200: "#F0D878",
          300: "#D9B73B",
          400: "#C9A227",
          500: "#B08D21",
          600: "#8A6D14",
          700: "#7A5F12",
          800: "#5E4A0E",
          900: "#413309",
          950: "#241C05",
        },
        success: { ...colors.emerald, DEFAULT: colors.emerald[600] },
        danger: { ...colors.red, DEFAULT: colors.red[600] },
        warning: { ...colors.amber, DEFAULT: colors.amber[500] },
      },
    },
  },
  plugins: [],
};
export default config;
