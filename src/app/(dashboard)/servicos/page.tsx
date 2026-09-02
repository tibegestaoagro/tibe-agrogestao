import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ServiceDirection,
  ServiceJobStatus,
  ServicePricing,
} from "@/generated/prisma/client";
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
import { listServiceJobs } from "@/lib/actions/service-jobs";
import { getServiceAgenda } from "@/lib/actions/machine-services";
import { getLaborSummary } from "@/lib/actions/labor-summary";
import { listConfinementLots } from "@/lib/actions/confinement";
import { listMilkSites } from "@/lib/actions/milk-sites";
import ServiceJobForm from "@/components/servicos/service-job-form";
import {
  PRICING_LABELS,
  PRICING_UNIDADE,
  SERVICE_STATUS_LABELS,
  SERVICE_DIRECTION_LABELS,
  moeda,
  dataCurta,
  quantidadeBr,
} from "@/components/servicos/labels";

/**
 * Serviços contratados (§38 do Módulo 33: "Serviços em andamento: prestador,
 * serviço, valor, situação").
 *
 * O topo traz o resumo do §30, separado nas três colunas que o documento pede.
 * Ele soma só o que foi PAGO no mês, porque o §30 pergunta "quanto estou
 * gastando", e conta a pagar ainda não é gasto.
 *
 * ⚠️ Guard `servicos`, OPERACIONAL: OPERADOR entra aqui e não entra em
 * `/mao-de-obra`. A diária de um serviço não tem a sensibilidade de um
 * salário.
 */

export default async function ServicosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");
  if (!canAccess(user.role, "servicos")) redirect("/dashboard");

  const writable = canWrite(user.role, "servicos");
  const db = await getTenantDb();

  const agora = new Date();
  const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1, 0));
  const fimDoMes = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  const [jobs, resumo, properties, pastures, lotes, pontos, maquinas, operadores, agenda] =
    await Promise.all([
      listServiceJobs(db, {}),
      getLaborSummary(db, { de: inicioDoMes, ate: fimDoMes }),
      /**
       * ⚠️ `select`, e não a linha inteira: as duas tabelas têm
       * `area_hectares` como `Decimal`, e o React 19 recusa passar um Decimal
       * de Server para Client Component ("Only plain objects can be passed").
       *
       * O erro só aparece no console do navegador: `tsc`, `lint` e as suítes
       * ficam verdes, e a tela renderiza. Estava assim desde a fase 33.2 e só
       * apareceu quando esta página foi aberta de verdade.
       */
      db.property.findMany({
        where: { archived_at: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.pasture.findMany({
        where: { archived_at: null },
        select: { id: true, name: true, property_id: true },
        orderBy: { name: "asc" },
      }),
      listConfinementLots(db, {}),
      listMilkSites(db, {}),
      // Só o que ainda pode rodar: a vendida, a negociada e a inativa saíram do
      // pátio, e oferecê-las convidaria a lançar um serviço com uma máquina
      // que não é mais do produtor. Em manutenção continua na lista, porque o
      // serviço pode ser de ontem.
      db.machine.findMany({
        where: { status: { in: ["active", "maintenance"] } },
        select: { id: true, name: true, property_id: true },
        orderBy: { name: "asc" },
      }),
      db.worker.findMany({
        where: { archived_at: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      getServiceAgenda(db),
    ]);

  /**
   * ⚠️ Os dois lados NÃO se somam. "A pagar" menos "a receber" daria um número
   * que parece pequeno justamente quando as duas pontas estão grandes, e o §28
   * separa receita de despesa exatamente para isso não acontecer.
   */
  const aPagar = jobs
    .filter((j) => j.direction !== "prestado" && j.restante > 0)
    .reduce((soma, j) => soma + j.restante, 0);
  const aReceber = jobs
    .filter((j) => j.direction === "prestado" && j.restante > 0)
    .reduce((soma, j) => soma + j.restante, 0);

  const lotesAbertos = lotes
    .filter((l) => l.aberta)
    .map((l) => ({ id: l.id, rotulo: `${l.location_name ?? "Confinamento"} (${l.quantity} cab.)` }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Serviços</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            O que você contratou de fora e o que prestou com máquina sua.
          </p>
        </div>
        {writable && (
          <ServiceJobForm
            properties={properties}
            pastures={pastures}
            lotes={lotesAbertos}
            pontosDeLeite={pontos.map((p) => ({ id: p.id, name: p.name }))}
            maquinas={maquinas}
            operadores={operadores}
          />
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Mão de obra fixa</p>
          <p className="mt-1 text-lg font-semibold text-texto">{moeda(resumo.fixa)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Diaristas</p>
          <p className="mt-1 text-lg font-semibold text-texto">{moeda(resumo.eventual)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Terceirizados</p>
          <p className="mt-1 text-lg font-semibold text-texto">{moeda(resumo.terceirizados)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Ainda a pagar</p>
          <p className="mt-1 text-lg font-semibold text-texto">{moeda(aPagar)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Ainda a receber</p>
          <p className="mt-1 text-lg font-semibold text-sucesso-tinta">{moeda(aReceber)}</p>
        </div>
      </section>
      <p className="text-xs text-texto-discreto">
        As três primeiras somam o que foi PAGO neste mês (§30). Conta a pagar ainda não é gasto, e
        aparece à parte. O que você tem a receber fica separado do que tem a pagar: os dois não se
        abatem.
      </p>

      {(agenda.hoje.length > 0 || agenda.proximos.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Agenda</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { titulo: "Hoje", linhas: agenda.hoje },
              { titulo: "Próximos", linhas: agenda.proximos },
            ].map((bloco) => (
              <div
                key={bloco.titulo}
                className="rounded-[var(--curva)] border border-borda bg-superficie p-4"
              >
                <p className="text-xs uppercase tracking-wide text-texto-discreto">
                  {bloco.titulo}
                </p>
                {bloco.linhas.length === 0 ? (
                  <p className="mt-2 text-sm text-texto-discreto">Nada marcado.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {bloco.linhas.map((l) => (
                      <li key={l.id} className="text-sm text-texto">
                        <Link href={`/servicos/${l.id}`} className="font-medium underline">
                          {l.description}
                        </Link>
                        <span className="text-texto-secundario">
                          {" "}
                          · {dataCurta(l.occurred_at)}
                          {l.contact_name ? ` · ${l.contact_name}` : ""}
                          {l.machine_name ? ` · ${l.machine_name}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {jobs.length === 0 ? (
        <EmptyState titulo="Nenhum serviço registrado">
          Registre o que você contratou de fora: a diária de quem veio ajudar, o empreito da cerca,
          a roçada por hectare. O Tibé cria a conta a pagar sozinho.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead>Quem fez</TableHead>
              <TableHead>Cobrança</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell>{dataCurta(j.occurred_at)}</TableCell>
                <TableCell>
                  <Link href={`/servicos/${j.id}`} className="font-medium text-texto underline">
                    {j.description}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={j.direction === "prestado" ? "green" : "gray"}>
                    {SERVICE_DIRECTION_LABELS[j.direction as ServiceDirection]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {j.contact_name ??
                    j.worker_name ?? (
                      <span className="text-texto-discreto">
                        {j.worker_count > 1 ? `${j.worker_count} pessoas` : "Não informado"}
                      </span>
                    )}
                </TableCell>
                <TableCell>
                  {PRICING_LABELS[j.pricing as ServicePricing]}
                  {j.pricing !== "fechado" && j.quantidade > 0 && (
                    <span className="text-texto-secundario">
                      {" "}
                      · {quantidadeBr(j.quantidade)}{" "}
                      {PRICING_UNIDADE[j.pricing as ServicePricing]}
                    </span>
                  )}
                </TableCell>
                <TableCell>{moeda(j.total)}</TableCell>
                <TableCell>
                  {j.restante === 0 ? (
                    <Badge variant="green">{j.direction === "prestado" ? "Recebido" : "Pago"}</Badge>
                  ) : j.pago > 0 ? (
                    <Badge variant="amber">Faltam {moeda(j.restante)}</Badge>
                  ) : (
                    <Badge variant="gray">
                      {SERVICE_STATUS_LABELS[j.status as ServiceJobStatus]}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
