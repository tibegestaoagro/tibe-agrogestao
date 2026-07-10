import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

/** Sitemap.xml automático (spec 5.12) — apenas rotas públicas e indexáveis. */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/planos", "/faq", "/politicas/privacidade", "/politicas/termos", "/docs", "/criar-conta", "/login"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}
