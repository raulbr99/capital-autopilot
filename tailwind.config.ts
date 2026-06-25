import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mapeadas a variables CSS (ver globals.css) -> soportan dark + light
        ink: "rgb(var(--ink) / <alpha-value>)",
        base: "rgb(var(--base) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        industrial: "rgb(var(--industrial) / <alpha-value>)",
        cement: "rgb(var(--cement) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        onaccent: "rgb(var(--onaccent) / <alpha-value>)", // texto sobre acento
        long: "rgb(var(--long) / <alpha-value>)",
        short: "rgb(var(--short) / <alpha-value>)",
        white: "rgb(var(--white) / <alpha-value>)",
        dim: "rgb(var(--dim) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
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
