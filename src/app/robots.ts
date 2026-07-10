import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

/** robots.txt (spec 5.12) — bloqueia painel/API de indexação, libera site público. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/rebanho", "/lavoura", "/prestador", "/financeiro", "/alertas", "/configuracoes", "/api"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
