import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Os VALORES nao moram aqui: moram em `src/app/globals.css`, como variaveis
 * CSS. Este arquivo so da nome de utilitario Tailwind a elas.
 *
 * A separacao e o ponto todo. Trocar a identidade passa a ser editar um bloco
 * `:root`, e a conferencia de contraste (`scripts/check-contraste.ts`, dentro
 * de `npm run check`) le esse mesmo bloco: nao existe jeito de a paleta em
 * producao divergir da paleta conferida.
 *
 * Os nomes `tibe.*` continuam funcionando, como ALIAS DEPRECIADO, para as ~1140
 * classes ja escritas nao quebrarem no dia um. Codigo novo usa os nomes
 * semanticos. A migracao e por catraca, nao por mutirao.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Nomes semanticos: dizem o papel, nunca a cor.
        superficie: {
          DEFAULT: "var(--superficie)",
          afundada: "var(--superficie-afundada)",
          invertida: "var(--superficie-invertida)",
        },
        texto: {
          DEFAULT: "var(--texto)",
          secundario: "var(--texto-secundario)",
          discreto: "var(--texto-discreto)",
          invertido: "var(--texto-invertido)",
        },
        borda: {
          DEFAULT: "var(--borda)",
          forte: "var(--borda-forte)",
          campo: "var(--borda-campo)",
        },
        primaria: {
          DEFAULT: "var(--primaria)",
          hover: "var(--primaria-hover)",
          tinta: "var(--primaria-tinta)",
          suave: "var(--primaria-suave)",
        },
        "sobre-primaria": "var(--sobre-primaria)",
        acento: {
          DEFAULT: "var(--acento)",
          hover: "var(--acento-hover)",
          tinta: "var(--acento-tinta)",
          suave: "var(--acento-suave)",
        },
        "sobre-acento": "var(--sobre-acento)",
        perigo: {
          DEFAULT: "var(--perigo)",
          tinta: "var(--perigo-tinta)",
          suave: "var(--perigo-suave)",
        },
        sucesso: {
          DEFAULT: "var(--sucesso)",
          tinta: "var(--sucesso-tinta)",
          suave: "var(--sucesso-suave)",
        },
        atencao: {
          tinta: "var(--atencao-tinta)",
          suave: "var(--atencao-suave)",
        },
        info: {
          tinta: "var(--info-tinta)",
          suave: "var(--info-suave)",
        },

        // ALIAS DEPRECIADO. Nao use em codigo novo: use os nomes acima.
        // Apontam para as mesmas variaveis, entao uma troca de identidade
        // alcanca tambem as classes antigas sem ninguem precisar reescreve-las.
        tibe: {
          primary: "var(--primaria)",
          dark: "var(--superficie-invertida)",
          darkest: "var(--sobre-primaria)",
          light: "var(--superficie-afundada)",
          accent: "var(--acento)",
          accentDark: "var(--acento-hover)",
          accentLight: "var(--acento-suave)",
        },
      },
      boxShadow: {
        sm: "var(--sombra-1)",
        DEFAULT: "var(--sombra-1)",
        md: "var(--sombra-2)",
        lg: "var(--sombra-3)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--curva)",
        tibe: "var(--curva)",
      },
      transitionDuration: {
        DEFAULT: "var(--duracao-rapida)",
        media: "var(--duracao-media)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
