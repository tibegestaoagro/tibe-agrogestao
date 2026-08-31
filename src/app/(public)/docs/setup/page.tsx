import type { Metadata } from "next";

export const metadata: Metadata = { title: "Setup local" };

export default function SetupPage() {
  return (
    <article className="max-w-3xl space-y-10 text-sm leading-relaxed text-texto-secundario">
      <div>
        <h1 className="text-3xl font-bold text-tibe-dark">Setup local</h1>
        <p className="mt-3 text-texto-secundario">Como rodar o Tibé na sua máquina, do zero.</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-texto">Pré-requisitos</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Node.js 20+ e npm</li>
          <li>Docker (para um Postgres local: ou uma connection string de um Postgres 17 já rodando)</li>
          <li>Uma instância Redis acessível (ex: Redis Cloud, free tier): só necessária para os fluxos de alertas/billing</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">1. Clonar e instalar</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`git clone https://github.com/tibegestaoagro/tibe-agrogestao.git
cd tibe-agrogestao
npm install`}
        </pre>
        <p className="mt-2">
          O <code className="rounded bg-superficie-afundada px-1">postinstall</code> já roda{" "}
          <code className="rounded bg-superficie-afundada px-1">prisma generate</code> automaticamente.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">2. Banco de dados local</h2>
        <p className="mt-2">Suba um Postgres 17 via Docker (qualquer nome/porta funciona, ajuste a connection string de acordo):</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`docker run --name tibe-pg -e POSTGRES_USER=tibe -e POSTGRES_PASSWORD=tibe \\
  -e POSTGRES_DB=tibe_dev -p 55432:5432 -d postgres:17`}
        </pre>
        <p className="mt-2">Connection string resultante:</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public`}
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">3. Variáveis de ambiente</h2>
        <p className="mt-2">
          Copie <code className="rounded bg-superficie-afundada px-1">.env.example</code> para{" "}
          <code className="rounded bg-superficie-afundada px-1">.env</code> e preencha:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><code className="rounded bg-superficie-afundada px-1">DATABASE_URL</code>: a connection string do passo anterior (ou de um Neon próprio)</li>
          <li><code className="rounded bg-superficie-afundada px-1">NEXTAUTH_SECRET</code>: gere com <code className="rounded bg-superficie-afundada px-1">openssl rand -base64 32</code></li>
          <li><code className="rounded bg-superficie-afundada px-1">NEXTAUTH_URL</code>: <code className="rounded bg-superficie-afundada px-1">http://localhost:3000</code> em dev</li>
          <li><code className="rounded bg-superficie-afundada px-1">INTERNAL_API_SECRET</code>: qualquer string, só é usado para chamar rotas <code className="rounded bg-superficie-afundada px-1">/api/internal/*</code> manualmente</li>
          <li><code className="rounded bg-superficie-afundada px-1">REDIS_URL</code>: opcional para desenvolvimento do dia a dia; necessário para testar o job de alertas</li>
        </ul>
        <p className="mt-2">
          As demais variáveis (<code className="rounded bg-superficie-afundada px-1">META_WHATSAPP_*</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">ASAAS_API_KEY</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">N8N_*</code>) só são necessárias para testar esses
          fluxos integrados de ponta a ponta: o app funciona sem elas (as chamadas correspondentes falham de
          forma controlada, sem quebrar o resto do sistema).
        </p>
        <div className="mt-3 rounded-lg bg-atencao-suave p-4 text-atencao-tinta">
          <code className="rounded bg-atencao-suave px-1">CLOUDFLARE_R2_*</code> existe no{" "}
          <code className="rounded bg-atencao-suave px-1">.env.example</code> por herança do PRD original, mas não é
          usado por nenhum código atual: os PDFs são gerados sob demanda, sem storage (ver{" "}
          <a href="/docs/arquitetura" className="underline">Arquitetura</a>). Pode deixar em branco.
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">4. Migrar e popular o banco</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`npm run db:deploy   # aplica as migrações já versionadas em prisma/migrations
npm run db:seed      # cria o tenant de exemplo, owner e catálogo de vacinas`}
        </pre>
        <p className="mt-2">
          Login de exemplo criado pelo seed:{" "}
          <code className="rounded bg-superficie-afundada px-1">owner@damata.com.br</code> /{" "}
          <code className="rounded bg-superficie-afundada px-1">tibe123</code>.
        </p>
        <p className="mt-3 font-medium text-texto">Alterando o schema</p>
        <p className="mt-1">
          <code className="rounded bg-superficie-afundada px-1">prisma migrate dev</code> é interativo e não funciona bem em
          shells não-interativos. O fluxo usado neste projeto:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# salve o SQL gerado em prisma/migrations/<timestamp>_nome/migration.sql
npm run db:deploy`}
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">5. Rodar</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`npm run dev`}
        </pre>
        <p className="mt-2">Abra http://localhost:3000.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">6. Testes</h2>
        <p className="mt-2">
          Os testes de isolamento chamam os route handlers diretamente (via <code className="rounded bg-superficie-afundada px-1">tsx</code>),
          sem precisar de um servidor rodando:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`npm run test:isolation   # isolamento multi-tenant genérico
npm run test:m1          # Rebanho e Lavoura
npm run test:m2          # Prestador de Serviço
npm run test:m3          # Agente WhatsApp
npm run test:m4          # Financeiro e Alertas`}
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Notas úteis</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Páginas autenticadas do dashboard só são bem testadas em um navegador real (dev server ou produção):
            um cookie jar automatizado contra <code className="rounded bg-superficie-afundada px-1">next start</code> não é
            reconhecido de forma confiável pelo Edge Middleware neste setup. Rotas <code className="rounded bg-superficie-afundada px-1">/api/v1/*</code> (Node
            runtime) não têm esse problema.
          </li>
          <li>
            Sem N8N/Meta configurados, o agente WhatsApp pode ser testado chamando{" "}
            <code className="rounded bg-superficie-afundada px-1">/api/internal/whatsapp/*</code> diretamente com o header{" "}
            <code className="rounded bg-superficie-afundada px-1">x-internal-secret</code>: ver{" "}
            <a href="/docs/whatsapp" className="text-primaria-tinta hover:underline">Agente WhatsApp</a>.
          </li>
        </ul>
      </section>
    </article>
  );
}
