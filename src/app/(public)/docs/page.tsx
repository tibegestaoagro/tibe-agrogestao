import Link from "next/link";

const CARDS = [
  { href: "/docs/arquitetura", title: "Arquitetura", desc: "Stack, isolamento multi-tenant, padrão de rotas e autenticação." },
  { href: "/docs/schema", title: "Schema do banco", desc: "Todas as tabelas do Postgres, campos e relações." },
  { href: "/docs/api", title: "API", desc: "Todos os endpoints de /api/v1, com exemplo de request e response." },
  { href: "/docs/whatsapp", title: "Agente WhatsApp", desc: "Como o agente identifica o usuário, interpreta a mensagem e executa ações." },
  { href: "/docs/setup", title: "Setup local", desc: "Como rodar o projeto na sua máquina, do zero." },
  { href: "/docs/deploy", title: "Deploy", desc: "Como o deploy funciona em produção (Vercel, Neon, cron)." },
  { href: "/docs/glossario", title: "Glossário agro", desc: "Termos do domínio agropecuário usados no sistema." },
];

export default function DocsIndexPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-tibe-dark">Documentação técnica</h1>
      <p className="mt-3 max-w-2xl text-gray-600">
        Referência para quem vai integrar, manter ou estender o Tibé: uma plataforma
        SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de
        serviço e financeiro), com um agente de IA no WhatsApp e cobrança recorrente
        via Asaas.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-gray-200 p-5 transition hover:border-tibe-primary hover:shadow-sm"
          >
            <h2 className="font-semibold text-gray-900">{c.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{c.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-lg bg-tibe-light p-5 text-sm text-tibe-dark">
        Esta documentação cobre o estado atual do sistema (Módulos 0 a 5). O Módulo 6
        (painel interno da Pleno Digital) ainda não foi implementado.
      </div>
    </div>
  );
}
