import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Identidade visual do Tibé (Onda 3, C3, 2026-08-03): tons extraídos
        // de docs/idVisual/ (logo + mockup de dashboard fornecidos pelo
        // cliente). Valores ainda não confirmados formalmente pela Agromax:
        // ver relatório do agente C3 para os pixels de origem de cada tom.
        // "accent*" é novo (laranja como cor de ação: não existia na paleta
        // anterior).
        tibe: {
          primary: "#17802B",
          dark: "#0A2A1D",
          light: "#E7F5EA",
          accent: "#F2600A",
          accentDark: "#C24D08",
          accentLight: "#FDECE2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
