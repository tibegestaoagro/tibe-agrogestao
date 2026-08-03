import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
import { getDre, getCashFlow, getUpcoming, resolvePeriod } from "@/lib/actions/financial-reports";
import { MODULE_LABEL } from "@/lib/related-modules";
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
import PayButton from "@/components/financeiro/pay-button";
import PostponeButton from "@/components/financeiro/postpone-button";
import CancelButton from "@/components/financeiro/cancel-button";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ENTRY_LABEL: Record<string, string> = { income: "Receita", expense: "Despesa" };
const STATUS: Record<string, { label: string; variant: "amber" | "green" | "red" | "gray" }> = {
  pending: { label: "Pendente", variant: "amber" },
  paid: { label: "Pago", variant: "green" },
  overdue: { label: "Vencido", variant: "red" },
  cancelled: { label: "Cancelado", variant: "gray" },
};

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-tibe-dark">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: {
    entry_type?: string;
    category?: string;
    related_module?: string;
    status?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const writable = canWrite(user.role, "financeiro");
  const db = await getTenantDb();
  const { start, end } = resolvePeriod(null, null); // mês atual

  const [dre, cashFlow, upcoming, pendingIncome, pendingExpense, entries] = await Promise.all([
    getDre(db, { start, end }),
    getCashFlow(db, { start, end, groupBy: "day" }),
    getUpcoming(db, 7),
    db.financialEntry.aggregate({
      where: { status: "pending", entry_type: "income" },
      _sum: { amount: true },
    }),
    db.financialEntry.aggregate({
      where: { status: "pending", entry_type: "expense" },
      _sum: { amount: true },
    }),
    db.financialEntry.findMany({
      where: {
        ...(searchParams.entry_type ? { entry_type: searchParams.entry_type as "income" | "expense" } : {}),
        ...(searchParams.related_module
          ? { related_module: searchParams.related_module as "rebanho" | "lavoura" | "servico" | "maquinas" | "geral" }
          : {}),
        ...(searchParams.status ? { status: searchParams.status as "pending" | "paid" | "overdue" } : {}),
      },
      orderBy: { due_date: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Financeiro</h1>
        <div className="flex gap-2">
          <ExportReportButton />
          {writable && <EntryForm />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Resultado do mês" value={brl(dre.total_result)} />
        <Card label="Total a receber" value={brl(decToNum(pendingIncome._sum.amount) ?? 0)} />
        <Card label="Total a pagar" value={brl(decToNum(pendingExpense._sum.amount) ?? 0)} />
        <Card label="Vencendo em 7 dias" value={String(upcoming.length)} sub="contas pendentes" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-gray-700">Fluxo de caixa (mês atual)</p>
        <CashFlowChart data={cashFlow} />
      </div>

      <div className="space-y-3">
        <EntryFilters />
        <div className="rounded-lg border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => {
                const st = STATUS[e.status];
                return (
                  <TableRow key={e.id}>
                    <TableCell>{e.due_date ? e.due_date.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                    <TableCell>{ENTRY_LABEL[e.entry_type]}</TableCell>
                    <TableCell>{e.category ?? "não informado"}</TableCell>
                    <TableCell>{MODULE_LABEL[e.related_module ?? "geral"]}</TableCell>
                    <TableCell>{brl(decToNum(e.amount) ?? 0)}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      {writable && e.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <PayButton entryId={e.id} />
                          <PostponeButton entryId={e.id} />
                          <CancelButton entryId={e.id} />
                        </div>
                      )}
                      {writable && e.status === "overdue" && <CancelButton entryId={e.id} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
