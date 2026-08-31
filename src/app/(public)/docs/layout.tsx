import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Documentação",
    template: "%s | Documentação Tibé",
  },
  description: "Documentação técnica do Tibé: arquitetura, schema do banco, API e guias de setup e deploy.",
};

const NAV: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Visão geral",
    items: [{ href: "/docs", label: "Início" }],
  },
  {
    label: "Referência",
    items: [
      { href: "/docs/arquitetura", label: "Arquitetura" },
      { href: "/docs/schema", label: "Schema do banco" },
      { href: "/docs/api", label: "API" },
      { href: "/docs/whatsapp", label: "Agente WhatsApp" },
    ],
  },
  {
    label: "Guias",
    items: [
      { href: "/docs/setup", label: "Setup local" },
      { href: "/docs/deploy", label: "Deploy" },
      { href: "/docs/glossario", label: "Glossário agro" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-superficie">
      <header className="border-b border-borda">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold text-tibe-dark">Tibé</Link>
            <span className="text-texto-discreto">/</span>
            <Link href="/docs" className="text-sm font-medium text-texto-secundario hover:text-tibe-dark">
              Documentação
            </Link>
          </div>
          <Link href="/" className="text-sm text-primaria-tinta hover:underline">
            ← Voltar ao site
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <aside className="w-52 shrink-0">
          <nav className="sticky top-10 space-y-6">
            {NAV.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-texto-discreto">
                  {group.label}
                </p>
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-md px-2 py-1.5 text-sm text-texto-secundario transition hover:bg-tibe-light hover:text-tibe-dark"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24">{children}</main>
      </div>
    </div>
  );
}
