import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
import { getDre, getCashFlow, getUpcoming, resolvePeriod } from "@/lib/actions/financial-reports";
import { MODULE_LABEL } from "@/lib/related-modules";
import { listFinancialCategoriesAction } from "@/lib/actions/financial-categories";
import { situacaoDe, type SituacaoDePagamento } from "@/lib/actions/financial-payments";
import { getActivePropertyId } from "@/lib/active-property";
import { inicioDoDiaEmSaoPaulo, prazoVencido } from "@/lib/dia-calendario";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import CashFlowChart from "@/components/financeiro/cash-flow-chart";
import EntryForm from "@/components/financeiro/entry-form";
import EntryFilters from "@/components/financeiro/entry-filters";
import ExportReportButton from "@/components/financeiro/export-report-button";
import PaymentSheet from "@/components/financeiro/payment-sheet";
import PostponeButton from "@/components/financeiro/postpone-button";
import CancelButton from "@/components/financeiro/cancel-button";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ENTRY_LABEL: Record<string, string> = { income: "Receita", expense: "Despesa" };

/**
 * A situação que o produtor lê, com o vocabulário do §9 e do §10: quem recebe
 * lê "Recebida", quem paga lê "Paga". "Parcialmente paga" nunca é gravada,
 * nasce da soma dos pagamentos.
 *
 * "Vencida" também é derivada, e é o que substituiu o status `overdue`: ele
 * está no enum mas NUNCA é gravado, então o ramo que mostrava "Vencido" nesta
 * tela nunca executava.
 */
function situacaoNaTela(
  situacao: SituacaoDePagamento,
  entryType: string,
  vencida: boolean,
): { label: string; variant: "amber" | "green" | "red" | "gray" } {
  const recebimento = entryType === "income";
  if (situacao === "cancelada") return { label: "Cancelada", variant: "gray" };
  if (situacao === "paga") {
    return { label: recebimento ? "Recebida" : "Paga", variant: "green" };
  }
  if (situacao === "parcialmente_paga") {
    return {
      label: recebimento ? "Parcialmente recebida" : "Parcialmente paga",
      variant: vencida ? "red" : "amber",
    };
  }
  if (vencida) return { label: "Vencida", variant: "red" };
  return { label: "Em aberto", variant: "amber" };
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <p className="text-xs text-texto-discreto">{label}</p>
      <p className="mt-1 text-xl font-semibold text-tibe-dark">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-texto-discreto">{sub}</p>}
    </div>
  );
}

export default async function FinanceiroPage(
  props: {
    searchParams: Promise<{
      entry_type?: string;
      category?: string;
      related_module?: string;
      status?: string;
      property_id?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const writable = canWrite(user.role, "financeiro");
  const db = await getTenantDb();
  const { start, end } = resolvePeriod(null, null); // mês atual

  /*
   * §32: o Financeiro de uma fazenda, ou de todas. A propriedade vem do
   * seletor do topo, como nas outras telas do painel; esta era a única que não
   * o lia. `property_id` na URL vence, para o link direto continuar valendo.
   *
   * ⚠️ Lançamento sem fazenda SOME quando o filtro está ligado, e isso não é
   * pouca coisa: `property_id` nasceu na fase 35.1 e não teve backfill, então
   * tudo que é anterior está nulo. O aviso abaixo da tabela conta quantos
   * ficaram de fora, para o produtor não achar que o histórico sumiu.
   */
  const activePropertyId = await getActivePropertyId(db);
  const propriedadeEscolhida = searchParams.property_id ?? activePropertyId ?? undefined;

  const hoje = inicioDoDiaEmSaoPaulo(new Date());
  const filtroDeStatus =
    searchParams.status === "overdue"
      ? { status: "pending" as const, due_date: { lt: hoje } }
      : searchParams.status
        ? { status: searchParams.status as "pending" | "paid" | "cancelled" }
        : {};

  const filtroDaTabela = {
    ...(searchParams.entry_type ? { entry_type: searchParams.entry_type as "income" | "expense" } : {}),
    ...(searchParams.related_module
      ? {
          related_module: searchParams.related_module as
            | "rebanho"
            | "lavoura"
            | "servico"
            | "maquinas"
            | "geral"
            | "confinamento",
        }
      : {}),
    ...filtroDeStatus,
    ...(propriedadeEscolhida ? { property_id: propriedadeEscolhida } : {}),
  };

  const [dre, cashFlow, upcoming, entries, categorias, semFazenda] = await Promise.all([
    getDre(db, { start, end, property_id: propriedadeEscolhida }),
    getCashFlow(db, { start, end, groupBy: "day", property_id: propriedadeEscolhida }),
    getUpcoming(db, 7, propriedadeEscolhida),
    db.financialEntry.findMany({
      where: filtroDaTabela,
      include: {
        property: { select: { name: true } },
        contact: { select: { name: true } },
      },
      orderBy: { due_date: "desc" },
      take: 100,
    }),
    // O seletor do formulário lista as categorias do tenant, não uma lista fixa.
    listFinancialCategoriesAction(db, { activeOnly: true }),
    propriedadeEscolhida
      ? db.financialEntry.count({ where: { ...filtroDaTabela, property_id: null } })
      : Promise.resolve(0),
  ]);

  /*
   * O valor pago é a soma dos pagamentos, então ele vem em uma consulta só
   * para as linhas da página, e não uma por linha.
   */
  const somaPorLancamento = new Map<string, number>();
  if (entries.length > 0) {
    const somas = await db.financialPayment.groupBy({
      by: ["entry_id"],
      where: { entry_id: { in: entries.map((e) => e.id) } },
      _sum: { amount: true },
    });
    for (const s of somas) {
      somaPorLancamento.set(s.entry_id, decToNum(s._sum.amount) ?? 0);
    }
  }

  const entradas = dre.by_module.reduce((soma, m) => soma + m.total_income, 0);
  const saidas = dre.by_module.reduce((soma, m) => soma + m.total_expense, 0);

  /*
   * "A receber" e "A pagar" são o que FALTA, não o valor cheio das contas
   * pendentes: com pagamento parcial, uma venda de 20 mil com 8 mil recebidos
   * deve aparecer como 12 mil a receber.
   */
  const pendentes = await db.financialEntry.findMany({
    where: {
      status: "pending",
      ...(propriedadeEscolhida ? { property_id: propriedadeEscolhida } : {}),
    },
    select: { id: true, entry_type: true, amount: true },
  });
  const pagoDosPendentes = new Map<string, number>();
  if (pendentes.length > 0) {
    const somas = await db.financialPayment.groupBy({
      by: ["entry_id"],
      where: { entry_id: { in: pendentes.map((e) => e.id) } },
      _sum: { amount: true },
    });
    for (const s of somas) {
      pagoDosPendentes.set(s.entry_id, decToNum(s._sum.amount) ?? 0);
    }
  }
  let aReceber = 0;
  let aPagar = 0;
  for (const p of pendentes) {
    const falta = Math.max(0, (decToNum(p.amount) ?? 0) - (pagoDosPendentes.get(p.id) ?? 0));
    if (p.entry_type === "income") aReceber += falta;
    else aPagar += falta;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-texto">Financeiro</h1>
        <div className="flex gap-2">
          <ExportReportButton />
          {writable && (
            <EntryForm
              categorias={categorias.map((c) => ({ name: c.name, entry_type: c.entry_type }))}
            />
          )}
        </div>
      </div>

      {/*
        §30: a diferença entre entradas e saídas NÃO é saldo bancário, e o
        documento pede que o sistema não a chame assim. O produtor pode ter
        dinheiro anterior, conta pessoal e saque que o Tibé nunca viu.
      */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card label="Entradas do período" value={brl(entradas)} />
        <Card label="Saídas do período" value={brl(saidas)} />
        <Card label="Diferença do período" value={brl(dre.total_result)} />
        <Card label="Total a receber" value={brl(aReceber)} sub="o que ainda falta entrar" />
        <Card label="Total a pagar" value={brl(aPagar)} sub="o que ainda falta sair" />
        <Card label="Vencendo em 7 dias" value={String(upcoming.length)} sub="contas pendentes" />
      </div>

      <div className="rounded-lg border border-borda bg-superficie p-5">
        <p className="mb-3 text-sm font-medium text-texto-secundario">
          Entradas e saídas (mês atual)
        </p>
        <CashFlowChart data={cashFlow} />
      </div>

      <div className="space-y-3">
        <EntryFilters />
        <div className="rounded-lg border border-borda bg-superficie">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fazenda</TableHead>
                <TableHead>Cliente ou fornecedor</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-texto-discreto">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => {
                const valor = decToNum(e.amount) ?? 0;
                const pago = somaPorLancamento.get(e.id) ?? 0;
                const situacao = situacaoDe(valor, pago, e.status);
                const vencida =
                  e.status === "pending" && !!e.due_date && prazoVencido(e.due_date);
                const st = situacaoNaTela(situacao, e.entry_type, vencida);
                return (
                  <TableRow key={e.id}>
                    <TableCell>{e.due_date ? e.due_date.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                    <TableCell>{ENTRY_LABEL[e.entry_type]}</TableCell>
                    <TableCell>{e.category ?? "não informado"}</TableCell>
                    <TableCell>{e.property?.name ?? "todas"}</TableCell>
                    <TableCell>{e.contact?.name ?? "não informado"}</TableCell>
                    <TableCell>{MODULE_LABEL[e.related_module ?? "geral"]}</TableCell>
                    <TableCell>
                      {brl(valor)}
                      {situacao === "parcialmente_paga" && (
                        <span className="block text-xs text-texto-discreto">
                          {e.entry_type === "income" ? "recebido" : "pago"} {brl(pago)}, falta{" "}
                          {brl(Math.max(0, valor - pago))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      {writable && e.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <PaymentSheet entryId={e.id} entryType={e.entry_type} valor={valor} />
                          <PostponeButton entryId={e.id} />
                          <CancelButton entryId={e.id} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {semFazenda > 0 && (
          <p className="text-xs text-texto-discreto">
            {semFazenda} {semFazenda === 1 ? "lançamento não tem" : "lançamentos não têm"} fazenda
            informada e {semFazenda === 1 ? "ficou" : "ficaram"} de fora deste filtro. Escolha
            &quot;todas as fazendas&quot; no seletor do topo para ver.
          </p>
        )}
      </div>
    </div>
  );
}
