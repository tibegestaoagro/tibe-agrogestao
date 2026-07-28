import type { Metadata } from "next";

export const metadata: Metadata = { title: "Deploy" };

export default function DeployPage() {
  return (
    <article className="max-w-3xl space-y-10 text-sm leading-relaxed text-gray-700">
      <div>
        <h1 className="text-3xl font-bold text-tibe-dark">Deploy</h1>
        <p className="mt-3 text-gray-600">Como o deploy de produção funciona hoje.</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Infraestrutura</h2>
        <table className="mt-3 w-full border-collapse text-left">
          <tbody className="divide-y divide-gray-100">
            {[
              ["Aplicação", "Vercel: deploy automático a cada push na branch main; Pull Requests geram preview deployment com banco Neon isolado (branch de banco automática)"],
              ["Banco", "Neon.tech, projeto tibe-agrogestao, banco neondb, região AWS São Paulo"],
              ["Fila / lock", "Redis Cloud (mesma instância usada em dev: uso é só fila/lock efêmero, sem dado de negócio)"],
              ["Cron", "Vercel Cron (vercel.json), roda o job diário de alertas"],
              ["Domínio", "*.vercel.app até o registro de tibe.com.br ser confirmado"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="w-40 py-2 pr-4 align-top font-medium text-gray-900">{k}</td>
                <td className="py-2 text-gray-600">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Variáveis de ambiente de produção</h2>
        <p className="mt-2">
          As mesmas de <code className="rounded bg-gray-100 px-1">.env.example</code> (ver{" "}
          <a href="/docs/setup" className="text-tibe-primary hover:underline">Setup local</a>), configuradas em
          Project Settings → Environment Variables na Vercel. Duas merecem atenção especial:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-gray-100 px-1">DATABASE_URL</code> em runtime usa a connection string{" "}
            <strong>pooled</strong> do Neon (com <code className="rounded bg-gray-100 px-1">-pooler</code> no
            host): necessária em ambiente serverless.
          </li>
          <li>
            <code className="rounded bg-gray-100 px-1">CRON_SECRET</code> não precisa ser configurado
            manualmente para autenticação: a própria Vercel injeta o header{" "}
            <code className="rounded bg-gray-100 px-1">Authorization: Bearer</code> nas chamadas de cron. Basta
            definir o mesmo valor como variável de ambiente para a rota conseguir validar.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Migrações em produção</h2>
        <p className="mt-2">
          Aplique sempre primeiro em desenvolvimento local, rode os testes, e só depois replique em produção: com
          a connection string <strong>Direct</strong> do Neon (sem <code className="rounded bg-gray-100 px-1">-pooler</code>),
          exigida pelo Prisma Migrate:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
{`DATABASE_URL="<connection string Direct do Neon>" npx prisma migrate deploy`}
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Cron de alertas</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
{`// vercel.json
{
  "crons": [{ "path": "/api/internal/jobs/generate-alerts", "schedule": "0 9 * * *" }]
}`}
        </pre>
        <p className="mt-2">
          09:00 UTC = 06:00 no horário de Brasília. Não há worker persistente hospedado em lugar nenhum: o
          processamento roda síncrono dentro da própria requisição de cron (ver{" "}
          <a href="/docs/arquitetura" className="text-tibe-primary hover:underline">Arquitetura</a>).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Dependências externas ainda não provisionadas</h2>
        <p className="mt-2">
          O código destes fluxos está completo, mas depende de infraestrutura fora do Tibé que ainda não foi
          configurada:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>N8N em produção (Railway) + número Salvy + Meta Business Manager verificado: necessários para o agente WhatsApp responder de verdade.</li>
          <li><code className="rounded bg-gray-100 px-1">ASAAS_API_KEY</code> de produção: sem ela, as rotas de cobrança respondem 503 de forma controlada.</li>
          <li>Domínio próprio (<code className="rounded bg-gray-100 px-1">tibe.com.br</code>) com SSL: hoje a aplicação responde apenas no domínio gerado pela Vercel.</li>
        </ul>
      </section>
    </article>
  );
}
