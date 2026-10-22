import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Acuan warna Design System AIDIL STORE:
// - gold 50-950  : identitas emas (DEFAULT #F5C542 = gold-400). Skala sudah lengkap.
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
          DEFAULT: "#F5C542",
          dark: "#B8941F",
        },
        gold: {
          DEFAULT: "#F5C542",
          50: "#FFFBEA",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#F5C542",
          500: "#E4B93A",
          600: "#D4AF37",
          700: "#B8941F",
          800: "#8A6D14",
          900: "#5C480D",
          950: "#3A2D08",
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
