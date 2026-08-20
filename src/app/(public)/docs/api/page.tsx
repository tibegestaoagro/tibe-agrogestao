import type { Metadata } from "next";
import { EndpointCard } from "@/components/public/endpoint-card";
import { GROUPS } from "./endpoints";

export const metadata: Metadata = { title: "API" };

export default function ApiDocsPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-tibe-dark">API</h1>
      <p className="mt-3 max-w-2xl text-gray-600">
        Todos os endpoints usam o mesmo contrato de resposta:{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">{"{ data, meta }"}</code> em sucesso,{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">{'{ error: { code, message } }'}</code> em erro. Rotas
        sob <code className="rounded bg-gray-100 px-1 text-xs">/api/v1/*</code> exigem sessão de tenant (cookie do
        NextAuth) salvo indicação em contrário; a permissão por módulo segue a matriz descrita em{" "}
        <a href="/docs/arquitetura" className="text-primaria-tinta hover:underline">Arquitetura</a>. Rotas sob{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">/api/platform/*</code> exigem uma sessão de{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">PlatformUser</code>: uma instância NextAuth
        completamente separada (cookie próprio), nunca a mesma sessão de tenant.
      </p>
      <p className="mt-3 max-w-2xl text-gray-600">
        <code className="rounded bg-gray-100 px-1 text-xs">meta</code> está sempre presente numa resposta de
        sucesso, mesmo quando um exemplo abaixo mostra só{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">{"{}"}</code> por brevidade: o servidor nunca a omite.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <a
            key={g.title}
            href={`#group-${g.title}`}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-tibe-primary hover:text-tibe-dark"
          >
            {g.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12">
        {GROUPS.map((group) => (
          <section key={group.title} id={`group-${group.title}`} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-tibe-dark">{group.title}</h2>
            {group.note && <p className="mt-1 text-sm text-gray-500">{group.note}</p>}
            <div className="mt-4 space-y-4">
              {group.endpoints.map((e) => (
                <EndpointCard key={e.method + e.path} endpoint={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
