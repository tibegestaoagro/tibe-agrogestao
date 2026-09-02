import Link from "next/link";
import { redirect } from "next/navigation";
import type { PayFrequency, WorkerType } from "@/generated/prisma/client";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite, canAccess } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listWorkers } from "@/lib/actions/workers";
import WorkerForm from "@/components/mao-de-obra/worker-form";
import {
  WORKER_TYPE_LABELS,
  PAY_FREQUENCY_FRASE,
  moeda,
  dataCurta,
} from "@/components/mao-de-obra/labels";

/**
 * Minha equipe (§38 do Módulo 33): nome, função e PRÓXIMO PAGAMENTO.
 *
 * O próximo pagamento na listagem é o pedido literal do §38, e é o que
 * transforma esta tela de um cadastro numa resposta à pergunta do §2 ("quando
 * preciso pagar?"). Ele vem junto da própria `listWorkers`, numa consulta só
 * para a equipe inteira: uma por linha seria N+1 numa tela que lista todo mundo.
 *
 * ⚠️ Guard `mao_de_obra`, mais fechado que o resto do painel: OPERADOR e
 * VISUALIZADOR não entram, porque isto guarda salário. Decisão do usuário em
 * 02/09.
 */

export default async function MaoDeObraPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");
  if (!canAccess(user.role, "mao_de_obra")) redirect("/dashboard");

  const writable = canWrite(user.role, "mao_de_obra");
  const db = await getTenantDb();

  const [workers, properties] = await Promise.all([
    listWorkers(db, {}),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
  ]);

  const ativos = workers.filter((w) => w.status === "ativo");
  const inativos = workers.filter((w) => w.status === "inativo");

  // O resumo do §30, na parte que esta fase cobre: o compromisso mensal com a
  // equipe fixa. Diaristas e terceirizados entram na fase 33.2, e é por isso
  // que o rótulo diz "fixa" em vez de "mão de obra".
  const compromissoMensal = ativos
    .filter((w) => w.type === "fixo" && w.pay_frequency === "mensal")
    .reduce((soma, w) => soma + (w.pay_amount ?? 0), 0);

  const aPagar = ativos.reduce((soma, w) => soma + (w.proximo_pagamento?.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Mão de Obra</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Quem trabalha na fazenda, quanto custa e o que falta pagar.
          </p>
        </div>
        {writable && <WorkerForm properties={properties} />}
      </header>

      {ativos.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
            <p className="text-xs uppercase tracking-wide text-texto-discreto">
              Compromisso mensal com a equipe fixa
            </p>
            <p className="mt-1 text-xl font-semibold text-texto">{moeda(compromissoMensal)}</p>
            <p className="text-sm text-texto-secundario">
              O que está combinado, não o que já foi pago.
            </p>
          </div>
          <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
            <p className="text-xs uppercase tracking-wide text-texto-discreto">
              Previsto nos próximos pagamentos
            </p>
            <p className="mt-1 text-xl font-semibold text-texto">{moeda(aPagar)}</p>
          </div>
        </section>
      )}

      {workers.length === 0 ? (
        <EmptyState titulo="Nenhum trabalhador cadastrado">
          Cadastre quem trabalha com você: nome, função e quanto recebe já bastam. O Tibé passa a
          avisar quando o pagamento estiver perto.
        </EmptyState>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Minha equipe</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Recebe</TableHead>
                <TableHead>Próximo pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ativos.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link
                      href={`/mao-de-obra/${w.id}`}
                      className="font-medium text-texto underline"
                    >
                      {w.name}
                    </Link>
                  </TableCell>
                  <TableCell>{w.role}</TableCell>
                  <TableCell>
                    <Badge variant="gray">
                      {WORKER_TYPE_LABELS[w.type as WorkerType] ?? w.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {w.pay_amount !== null && w.pay_frequency ? (
                      <>
                        {moeda(w.pay_amount)}{" "}
                        <span className="text-texto-secundario">
                          {PAY_FREQUENCY_FRASE[w.pay_frequency as PayFrequency]}
                        </span>
                      </>
                    ) : (
                      <span className="text-texto-discreto">Por diária</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {w.proximo_pagamento ? (
                      <>
                        {moeda(w.proximo_pagamento.amount)}{" "}
                        <span className="text-texto-secundario">
                          em {dataCurta(w.proximo_pagamento.due_date)}
                        </span>
                      </>
                    ) : (
                      <span className="text-texto-discreto">Sem previsão</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {inativos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Inativos</h2>
          <p className="text-sm text-texto-secundario">
            Não geram mais previsão de pagamento. O histórico do que já foi pago continua inteiro.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inativos.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link
                      href={`/mao-de-obra/${w.id}`}
                      className="font-medium text-texto underline"
                    >
                      {w.name}
                    </Link>
                  </TableCell>
                  <TableCell>{w.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
