import type { listarDespesasFixasAction } from "@/lib/actions/emporio-despesas";
import { ehCriterioAutomatico } from "@/lib/emporio/rateio";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DespesaFixaAcoes } from "./despesa-fixa-acoes";
import { DespesaFixaForm } from "./despesa-fixa-form";
import { pctBr } from "./formato";
import { mesBr } from "./meses";
import { RATEIO_ROTULO } from "./venda-rotulos";

type Fixas = Extract<Awaited<ReturnType<typeof listarDespesasFixasAction>>, { ok: true }>["data"];

/** A seção "Despesas fixas" (era da página Despesas), hoje uma aba do A pagar. */
export function DespesasFixasSecao({
  fixas,
  lojas,
  podeAutomatico,
  mesesDeInicio,
  mesAtual,
}: {
  fixas: Fixas;
  lojas: { id: string; name: string }[];
  podeAutomatico: boolean;
  mesesDeInicio: React.ComponentProps<typeof DespesaFixaForm>["mesesDeInicio"];
  /** O mês atual por extenso (`textoDoMes`). */
  mesAtual: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-texto">Despesas fixas</h2>
        {lojas.length > 0 && (
          <DespesaFixaForm podeAutomatico={podeAutomatico} lojas={lojas} mesesDeInicio={mesesDeInicio} mesAtual={mesAtual} />
        )}
      </div>
      <p className="text-sm text-texto-secundario">
        Aluguel, contador, internet: cada uma gera a conta a pagar dos próximos 12 meses, dividida entre as lojas.
      </p>
      {fixas.length === 0 ? (
        <EmptyState titulo="Nenhuma despesa fixa">Cadastre as despesas que se repetem todo mês.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Despesa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Rateio</TableHead>
              <TableHead>Gerada até</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fixas.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-texto">
                  {d.name}
                  <span className="block text-xs font-normal text-texto-secundario">
                    Vence todo dia {d.due_day}
                    {d.category !== d.name ? `, ${d.category}` : ""}
                  </span>
                </TableCell>
                <TableCell>{reaisBr(d.amount)}</TableCell>
                <TableCell className="text-sm">
                  <span className="block text-xs text-texto-secundario">{RATEIO_ROTULO[d.split_kind]}</span>
                  {d.splits.map((s) => (
                    <span key={s.establishment_id} className="block">
                      {s.establishment_name}: {d.split_kind === "percentual" ? pctBr(s.value) : reaisBr(s.value)}
                    </span>
                  ))}
                  {d.avisos.map((a) => (
                    <span key={a} role="status" className="mt-1 block text-xs text-texto-secundario">
                      {a}
                    </span>
                  ))}
                </TableCell>
                <TableCell>
                  {d.generated_until ? mesBr(d.generated_until) : "-"}
                  {d.needs_renewal && !ehCriterioAutomatico(d.split_kind) && (
                    <Badge variant="amber" className="ml-2">
                      Renovar
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <DespesaFixaForm
                      podeAutomatico={podeAutomatico}
                      lojas={lojas}
                      mesesDeInicio={mesesDeInicio}
                      mesAtual={mesAtual}
                      despesa={{
                        id: d.id,
                        name: d.name,
                        category: d.category,
                        amount: d.amount,
                        due_day: d.due_day,
                        split_kind: d.split_kind,
                        splits: d.splits.map((s) => ({ establishment_id: s.establishment_id, value: s.value })),
                        base_label: d.base_label,
                        avisos: d.avisos,
                      }}
                    />
                    <DespesaFixaAcoes
                      despesaId={d.id}
                      nome={d.name}
                      podeRenovar={d.needs_renewal && !ehCriterioAutomatico(d.split_kind)}
                      automatica={ehCriterioAutomatico(d.split_kind)}
                      mesAtual={mesAtual}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
