import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superficies — grafito frío profundo (no negro puro, no navy)
        ink: "#0B0D11", // fondo de la app
        base: "#0F1218", // fondo alterno / barras
        soft: "#14171D", // paneles / cards
        raised: "#1A1E26", // elevado / hover
        industrial: "#242a33", // hairline principal (borde/separador)
        cement: "#2c333d", // borde secundario / inputs
        // Acento — iris/periwinkle (≤10% de la superficie, solo estado/acción)
        accent: "#6E7CF7",
        volt: "#6E7CF7", // alias para clases heredadas
        // Semánticos P&L — esmeralda / rosa refinados
        long: "#34C98A",
        short: "#F2567A",
        // Texto
        white: "#E7E9EE", // primario (blanco suave, no #fff)
        dim: "#A0A7B4", // secundario
        muted: "#6B7280", // terciario
      },
      fontFamily: {
        // Una sola familia (Inter); el "display" es la misma con más peso
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        body: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem", // 10px
        xl: "0.875rem", // 14px
      },
      boxShadow: {
        elevated: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.55)",
        ring: "0 0 0 1px rgba(110,124,247,0.45)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.82)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        ticker: "ticker 60s linear infinite",
        fadeUp: "fadeUp 0.25s cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
