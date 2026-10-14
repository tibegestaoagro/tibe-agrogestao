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

/**
 * Cor de token que aceita opacidade (`bg-texto-invertido/10`).
 *
 * Com `"var(--x)"` puro, o Tailwind 3 nao sabe aplicar o `/10` e descarta a
 * classe em silencio: de 31/08 a 14/10 os realces da sidebar e os fundos
 * suaves nunca apareceram (divida 2.8). Sem modificador sai `var(--x)` puro,
 * como antes; com ele, `color-mix`, que navegador anterior ao Chrome 111
 * ignora (a classe volta a nao fazer nada, sem quebrar a cor de base).
 *
 * Funcao em vez de `<alpha-value>` na string porque a string poria
 * `color-mix` em TODA classe da cor, e o navegador antigo perderia a cor
 * inteira. Por isso tambem os plugins `*Opacity` estao desligados abaixo: com
 * eles, a classe sem modificador recebe `var(--tw-bg-opacity)` e cai no
 * `color-mix`. A conferencia 18 do `npm run check` prende as duas coisas.
 */
// O tipo `Config` do Tailwind 3 so declara string, mas o runtime aceita funcao.
const token = (nome: string) =>
  (({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(--${nome})`
      : `color-mix(in srgb, var(--${nome}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

const config: Config = {
  corePlugins: {
    backgroundOpacity: false,
    textOpacity: false,
    borderOpacity: false,
    ringOpacity: false,
    divideOpacity: false,
    placeholderOpacity: false,
  },
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
          DEFAULT: token("superficie"),
          afundada: token("superficie-afundada"),
          invertida: token("superficie-invertida"),
        },
        texto: {
          DEFAULT: token("texto"),
          secundario: token("texto-secundario"),
          discreto: token("texto-discreto"),
          invertido: token("texto-invertido"),
          marca: token("texto-marca"),
        },
        borda: {
          DEFAULT: token("borda"),
          forte: token("borda-forte"),
          campo: token("borda-campo"),
        },
        primaria: {
          DEFAULT: token("primaria"),
          hover: token("primaria-hover"),
          tinta: token("primaria-tinta"),
          suave: token("primaria-suave"),
        },
        "sobre-primaria": token("sobre-primaria"),
        codigo: {
          fundo: token("codigo-fundo"),
          texto: token("codigo-texto"),
        },
        // `rgb(... / <alpha-value>)` e nao `var(--x)` direto: e o unico token
        // usado com opacidade (`bg-sobreposicao/40`), e sem esta forma o `/40`
        // e ignorado em silencio. Ver o comentario em globals.css.
        sobreposicao: "rgb(var(--sobreposicao) / <alpha-value>)",
        acento: {
          DEFAULT: token("acento"),
          hover: token("acento-hover"),
          tinta: token("acento-tinta"),
          suave: token("acento-suave"),
        },
        "sobre-acento": token("sobre-acento"),
        perigo: {
          DEFAULT: token("perigo"),
          tinta: token("perigo-tinta"),
          suave: token("perigo-suave"),
        },
        sucesso: {
          DEFAULT: token("sucesso"),
          tinta: token("sucesso-tinta"),
          suave: token("sucesso-suave"),
        },
        atencao: {
          tinta: token("atencao-tinta"),
          suave: token("atencao-suave"),
        },
        info: {
          tinta: token("info-tinta"),
          suave: token("info-suave"),
        },
        // Os aliases depreciados `tibe.*` sairam em 07/10 (dividas 2.6 e 2.5).
        // A conferencia 17 do `npm run check` reprova classe que volte a usa-los.
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
