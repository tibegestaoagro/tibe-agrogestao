import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config do ESLint 9, substituindo o `.eslintrc.json` (2026-08-20, junto
 * com a subida para Next 16, que removeu `next lint`). As regras sao as mesmas
 * de antes: `next/core-web-vitals` e `next/typescript`. O que mudou foi o
 * formato, e o `eslint-config-next` 16 ja publica flat config nativa, entao
 * nao ha camada de compatibilidade no meio.
 */
export default [
  {
    // O client do Prisma e gerado; o aplicativo Expo tem lint proprio; e o
    // service worker e JavaScript de navegador escrito a mao, fora do projeto
    // TypeScript.
    ignores: [
      "src/generated/**",
      "apps/**",
      ".next/**",
      "node_modules/**",
      "public/sw.js",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
