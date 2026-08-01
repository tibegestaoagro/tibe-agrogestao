import type { MetadataRoute } from "next";

/**
 * Manifesto do aplicativo instalavel (Onda 1, agente A3).
 *
 * Convencao de arquivo do Next: este modulo e servido em /manifest.webmanifest
 * e o proprio Next injeta o <link rel="manifest"> no HTML.
 *
 * `start_url` aponta para /dashboard, nao para a home publica: o objetivo da
 * onda e tornar o PAINEL instalavel, e um aplicativo que abre no site de
 * marketing seria o comportamento errado. Quem nao tem sessao cai no /login
 * pelo middleware, que ja e o fluxo normal do painel.
 *
 * Icones sao PROVISORIOS (gerados por scripts/pwa-icons.mjs a partir das cores
 * de marca de tailwind.config.ts). A arte definitiva vem na Onda 3, junto com a
 * identidade visual nova; trocar os arquivos em public/icons/ basta, este
 * arquivo nao muda.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identidade estavel do aplicativo. Sem isto, o navegador usa a start_url
    // como identidade e mudar a start_url um dia criaria um aplicativo novo em
    // vez de atualizar o instalado.
    id: "/",
    name: "Tibé",
    short_name: "Tibé",
    description:
      "Gestão agropecuária: rebanho, lavoura, prestação de serviço e financeiro.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#2E7D32",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // O Android recorta o icone no formato do lancador. As versoes maskable
      // sangram ate a borda e mantem a marca dentro dos 80% centrais, senao o
      // recorte comeria parte do desenho.
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
