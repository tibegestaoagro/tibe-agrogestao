import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

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
        // Identidade visual do Tibé. Onda 3 (C3, 2026-08-03) aplicou uma
        // estimativa extraída por pixel de docs/idVisual/ (mockup de
        // dashboard); Onda 4 (2026-08-04) corrigiu para os hex oficiais que
        // o cliente enviou depois (docs/idVisual/paleta-de cores.png), fonte
        // de verdade a partir de agora. "darkest" é um tom extra que a
        // paleta oficial trouxe além do "dark" já existente (dois verdes
        // bem escuros e próximos: mantidos os dois, sem descartar dado do
        // cliente). "accent*" continua sendo laranja como cor de ação.
        tibe: {
          primary: "#649721",
          dark: "#022E20",
          darkest: "#09241B",
          light: "#FCF8F5",
          accent: "#E97D0F",
          accentDark: "#BA640C",
          accentLight: "#FCEFE2",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
