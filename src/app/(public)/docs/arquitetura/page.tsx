import type { Metadata } from "next";

export const metadata: Metadata = { title: "Arquitetura" };

export default function ArquiteturaPage() {
  return (
    <article className="max-w-3xl space-y-10 text-sm leading-relaxed text-texto-secundario">
      <div>
        <h1 className="text-3xl font-bold text-tibe-dark">Arquitetura</h1>
        <p className="mt-3 text-texto-secundario">
          Tibé é um SaaS multi-tenant: uma única aplicação e um único banco de dados
          atendem várias empresas clientes (tenants), com isolamento de dados por
          linha desde a primeira tabela do schema: não há schema nem banco separado
          por cliente.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-texto">Stack</h2>
        <table className="mt-3 w-full border-collapse text-left">
          <tbody className="divide-y divide-borda">
            {[
              ["Aplicação", "Next.js 14 (App Router) + TypeScript, hospedado na Vercel"],
              ["UI", "Tailwind CSS + kit de componentes próprio (Radix UI + class-variance-authority)"],
              ["Banco", "PostgreSQL 17 via Neon.tech (serverless, região São Paulo)"],
              ["ORM", "Prisma 7, com Client Extensions para isolamento multi-tenant e adapter-pg como driver"],
              ["Autenticação", "NextAuth v5 (beta), provider Credentials (email + senha com bcrypt)"],
              ["Fila / cache", "Redis Cloud + BullMQ (registro auditável de execuções de job)"],
              ["Agendamento", "Vercel Cron (substitui um worker BullMQ persistente, que não existe nesta arquitetura)"],
              ["Agente WhatsApp", "WhatsApp Business Cloud API (Meta) + N8N (orquestração) + LLM"],
              ["Cobrança", "Asaas (PIX, boleto e cartão de crédito recorrentes)"],
              ["PDF", "pdf-lib, gerado sob demanda (sem storage: ver seção Relatórios abaixo)"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="py-2 pr-4 font-medium text-texto align-top whitespace-nowrap">{k}</td>
                <td className="py-2 text-texto-secundario">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Isolamento multi-tenant</h2>
        <p className="mt-2">
          Toda tabela de negócio carrega uma coluna <code className="rounded bg-superficie-afundada px-1">tenant_id</code>.
          Em vez de filtrar manualmente cada query, o app usa uma{" "}
          <strong>Prisma Client Extension</strong> (<code className="rounded bg-superficie-afundada px-1">src/lib/prisma.ts</code>)
          que injeta automaticamente <code className="rounded bg-superficie-afundada px-1">where: {"{"} tenant_id {"}"}</code> em
          toda leitura e o próprio <code className="rounded bg-superficie-afundada px-1">tenant_id</code> em toda escrita, para
          o tenant resolvido da sessão NextAuth ativa. Rotas de negócio nunca recebem um Prisma Client “cru”:
          sempre o client já escopado, obtido via <code className="rounded bg-superficie-afundada px-1">guard()</code>.
        </p>
        <p className="mt-2">
          Isso significa que esquecer um filtro de tenant em uma query específica não é um risco: o isolamento
          acontece em uma camada central, não repetida em cada endpoint.
        </p>
        <p className="mt-3 font-medium text-texto">Exceções documentadas ao isolamento automático</p>
        <p className="mt-1">
          Um pequeno número de rotas legitimamente precisa olhar através de tenants ou rodar sem sessão, porque
          o chamador ainda não tem um tenant conhecido. Todas usam o client Prisma base
          (não escopado) de forma deliberada:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><code className="rounded bg-superficie-afundada px-1">PlatformUser</code> e <code className="rounded bg-superficie-afundada px-1">SubscriptionStatusLog</code>: painel interno da Pleno Digital (Módulo 6), vivem inteiramente fora do conceito de tenant.</li>
          <li>Login (NextAuth): busca o <code className="rounded bg-superficie-afundada px-1">User</code> por email antes de saber o tenant.</li>
          <li><code className="rounded bg-superficie-afundada px-1">POST /api/v1/signup</code>: cria o tenant; não existe tenant antes disso.</li>
          <li><code className="rounded bg-superficie-afundada px-1">POST /api/internal/whatsapp/resolve-contact</code>: identifica o tenant a partir do telefone.</li>
          <li><code className="rounded bg-superficie-afundada px-1">POST /api/webhooks/asaas</code>: o Asaas não tem sessão de tenant; a assinatura é localizada por <code className="rounded bg-superficie-afundada px-1">asaas_subscription_id</code>.</li>
          <li>Job diário de alertas (<code className="rounded bg-superficie-afundada px-1">generateAllAlerts</code>): por natureza, itera por todos os tenants ativos.</li>
          <li>Rotas <code className="rounded bg-superficie-afundada px-1">/api/platform/tenants*</code> (Módulo 6): o painel interno lê explicitamente por <code className="rounded bg-superficie-afundada px-1">tenant_id</code> qualquer tenant, por desenho (é o ponto do módulo).</li>
          <li><code className="rounded bg-superficie-afundada px-1">prisma/seed.ts</code>: popula dados iniciais de mais de um tenant.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Autenticação e permissões</h2>
        <p className="mt-2">
          A sessão NextAuth carrega <code className="rounded bg-superficie-afundada px-1">tenant_id</code> e{" "}
          <code className="rounded bg-superficie-afundada px-1">role</code> no JWT. Existem 4 roles, em ordem crescente de
          privilégio: <code className="rounded bg-superficie-afundada px-1">VISUALIZADOR</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">OPERADOR</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">ADMIN</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">OWNER</code>. Cada módulo (rebanho, lavoura, prestador,
          financeiro, alertas, usuários, assinatura) tem um nível de acesso: nenhum, leitura ou escrita: por
          role, definido em <code className="rounded bg-superficie-afundada px-1">src/lib/permissions.ts</code>.
        </p>
        <p className="mt-2">
          Rotas de API chamam <code className="rounded bg-superficie-afundada px-1">guard(module, action)</code> como
          primeira linha: ele resolve a sessão, checa a permissão do módulo, checa se o perfil de tenant exigido
          (fazenda ou prestador) está ativo, checa o status de cobrança (ver abaixo), e devolve o client Prisma já
          escopado. Qualquer falha retorna o erro pronto no contrato padrão.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Painel da plataforma (Módulo 6)</h2>
        <p className="mt-2">
          O painel interno da Pleno Digital (<code className="rounded bg-superficie-afundada px-1">/plataforma</code>) usa
          uma <strong>segunda instância NextAuth</strong>, genuinamente separada da de tenant: cookie próprio
          (<code className="rounded bg-superficie-afundada px-1">tibe-platform-session</code>) e secret próprio
          (<code className="rounded bg-superficie-afundada px-1">PLATFORM_AUTH_SECRET</code>), nunca a mesma sessão com um
          campo de “tipo”. Isso significa que uma sessão de tenant nunca é aceita em{" "}
          <code className="rounded bg-superficie-afundada px-1">/plataforma/*</code> e vice-versa: a separação é estrutural
          (cookies diferentes), não uma checagem de código que poderia ser esquecida num endpoint novo.
        </p>
        <p className="mt-2">
          <code className="rounded bg-superficie-afundada px-1">PlatformUser</code> tem dois papéis:{" "}
          <code className="rounded bg-superficie-afundada px-1">EQUIPE</code> (lê a lista e o detalhe de tenants) e{" "}
          <code className="rounded bg-superficie-afundada px-1">MASTER_ADMIN</code> (tudo que a equipe vê, mais os KPIs
          financeiros: MRR, churn, LTV, funil: e as duas ações administrativas: forçar mudança manual de status
          de uma assinatura e gerenciar a própria equipe da plataforma).
        </p>
        <p className="mt-2">
          Toda transição de status de uma <code className="rounded bg-superficie-afundada px-1">Subscription</code>:
          automática (webhook do Asaas) ou manual (ação de um{" "}
          <code className="rounded bg-superficie-afundada px-1">MASTER_ADMIN</code>): é registrada em{" "}
          <code className="rounded bg-superficie-afundada px-1">SubscriptionStatusLog</code>. É esse histórico que permite
          calcular churn (quem estava ativo no início do período, quem cancelou dentro dele) e o tempo médio de
          conversão trial→pago no funil, além de servir como log de auditoria das mudanças manuais.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Padrão de rotas</h2>
        <p className="mt-2">Toda rota de API de negócio segue o mesmo formato:</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`guard(módulo, ação)  →  valida sessão + permissão + billing, devolve { db, user }
readJson + zod        →  valida o corpo da requisição
lib/actions/*.ts       →  função pura de negócio, recebe "db" (client escopado)
serializers            →  converte Decimal/Date do Prisma para number/ISO string
apiOk / apiError        →  resposta no contrato { data, meta } | { error }`}
        </pre>
        <p className="mt-2">
          A lógica de negócio mora em <code className="rounded bg-superficie-afundada px-1">src/lib/actions/*.ts</code>, como
          funções puras que recebem o client escopado: nunca dentro da rota HTTP nem duplicada. O endpoint de
          execução do agente WhatsApp (<code className="rounded bg-superficie-afundada px-1">/api/internal/whatsapp/execute-action</code>)
          chama exatamente as mesmas funções que as rotas usadas pelo painel web: uma única fonte de verdade para
          cada regra de negócio, dois canais de entrada.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Contrato de resposta</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`Sucesso  → { "data": ..., "meta": {} }
Erro     → { "error": { "code": "STRING_CODE", "message": "legível para humanos" } }`}
        </pre>
        <p className="mt-2">
          Códigos de status HTTP acompanham o tipo de erro: 401 sem sessão, 403 sem permissão, 402 conta
          bloqueada/em atraso, 404 recurso não encontrado, 409 conflito (duplicidade), 422 validação.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Cobrança e bloqueio por inadimplência</h2>
        <p className="mt-2">
          <code className="rounded bg-superficie-afundada px-1">src/lib/billing-access.ts</code> calcula um de três níveis de
          acesso: <code className="rounded bg-superficie-afundada px-1">full</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">read_only</code>,{" "}
          <code className="rounded bg-superficie-afundada px-1">blocked</code>: a partir de dias em atraso (assinatura) ou
          dias após o fim do trial (sem assinatura). A mesma régua vale para os dois casos: até 5 dias, acesso
          total; de 5 a 15 dias, leitura liberada e escrita bloqueada; acima de 15 dias, bloqueio total (exceto a
          própria página de assinatura). <code className="rounded bg-superficie-afundada px-1">guard()</code> aplica essa
          checagem em toda rota, e o layout do dashboard aplica a mesma regra a nível de página.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Relatórios em PDF</h2>
        <p className="mt-2">
          Não há Cloudflare R2 nem outro storage de arquivo neste ambiente: o PDF é gerado sob demanda, em
          memória, e transmitido direto na resposta HTTP. O link de download (usado pelo botão “Exportar
          relatório” e pelo agente WhatsApp) é uma URL assinada com HMAC (<code className="rounded bg-superficie-afundada px-1">src/lib/reports/report-token.ts</code>),
          válida por 1 hora: a autorização vem inteiramente da assinatura do token, não de sessão, porque quem
          abre o link pode não estar logado no navegador.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-texto">Estrutura de pastas</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-codigo-fundo p-4 text-xs text-codigo-texto">
{`src/app/(public)/     páginas sem autenticação (home, planos, faq, políticas, docs, login, criar-conta)
src/app/(dashboard)/  painel autenticado, por módulo (rebanho, lavoura, prestador, financeiro, alertas, configuracoes)
src/app/api/v1/       API de negócio, sempre atrás de guard()
src/app/api/internal/ rotas chamadas pelo N8N e pela Vercel Cron, autenticadas por secret (não por sessão)
src/app/api/webhooks/ rotas chamadas por serviços externos (Asaas), autenticadas por token
src/lib/actions/      lógica de negócio pura, testável, compartilhada entre painel e agente WhatsApp
src/lib/serializers.ts conversão Prisma → JSON (Decimal/Date → number/string)
src/components/       componentes React, organizados por módulo`}
        </pre>
      </section>
    </article>
  );
}
