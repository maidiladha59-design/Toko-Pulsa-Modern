import type { Config } from "tailwindcss";

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
      },
    },
  },
  plugins: [],
};
export default config;
