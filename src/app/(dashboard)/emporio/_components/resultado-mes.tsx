import type { ReactNode } from "react";
import type { ResultadoDaLojaView } from "@/lib/actions/emporio-resultado";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { AcompanhamentoGrafico } from "./acompanhamento-grafico";
import { pctBr } from "./formato";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Linha da conta: o rótulo, o valor e, se houver, o detalhe que abre embaixo (sem JavaScript). */
function Linha({
  rotulo,
  valor,
  forte,
  tom,
  nota,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  tom?: "perigo" | "sucesso";
  nota?: string;
  detalhe?: ReactNode;
}) {
  const cor = tom === "perigo" ? "text-perigo-tinta" : tom === "sucesso" ? "text-sucesso-tinta" : "text-texto";
  const corpo = (
    <span className={`flex items-baseline justify-between gap-3 ${forte ? "text-base font-semibold" : "text-sm"}`}>
      <span className="text-texto">
        {rotulo}
        {nota && <span className="block text-xs font-normal text-texto-secundario">{nota}</span>}
      </span>
      <span className={`shrink-0 ${forte ? "text-lg" : ""} ${cor}`}>{valor}</span>
    </span>
  );
  return (
    <div className={`py-2.5 ${forte ? "border-t border-borda-forte" : "border-t border-borda first:border-t-0"}`}>
      {detalhe ? (
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {corpo}
            <span className="mt-0.5 block text-xs text-texto-marca group-open:hidden">Ver detalhe</span>
            <span className="mt-0.5 hidden text-xs text-texto-marca group-open:block">Esconder detalhe</span>
          </summary>
          <div className="mt-2 space-y-1 rounded-md bg-superficie-afundada p-3 text-sm text-texto-secundario">{detalhe}</div>
        </details>
      ) : (
        corpo
      )}
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: ReactNode; valor: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span>{rotulo}</span>
      <span className="shrink-0 text-texto">{valor}</span>
    </p>
  );
}

/** O Resultado da Loja de um mês, como uma conta de cima para baixo (Q26 e Q101). */
export function ResultadoMes({ r }: { r: ResultadoDaLojaView }) {
  const pe = r.break_even;
  const tomDoResultado = r.result < 0 ? "perigo" : r.result > 0 ? "sucesso" : undefined;
  const d = r.losses_detail;

  return (
    <div className="space-y-6">
      {r.estimated && (
        <div role="status" className="rounded-lg border border-atencao-tinta/30 bg-atencao-suave p-4 text-sm text-atencao-tinta">
          <p className="font-semibold">Este resultado é uma estimativa</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {r.estimated_reasons.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-lg border border-borda bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-texto">Resultado de {r.establishment_name}</h2>
        <div className="mt-2">
          <Linha
            rotulo="Vendas"
            valor={reaisBr(r.sales)}
            nota={
              r.sales_count === 0
                ? "Nenhuma venda no mês"
                : `${r.sales_count} ${r.sales_count === 1 ? "venda" : "vendas"}${r.returns_amount > 0 ? `, já sem ${reaisBr(r.returns_amount)} devolvidos` : ""}`
            }
          />
          <Linha rotulo="(-) Custo das mercadorias" valor={reaisBr(r.cost)} />
          <Linha
            rotulo={'(-) "Vendeu, Pagou"'}
            valor={reaisBr(r.variable_expenses)}
            nota="Comissão, entrega, embalagem e taxa de cartão"
            detalhe={
              r.variable_expenses_by_rule.length === 0 && r.card_fees === 0 ? (
                <p>Nenhuma despesa de venda no mês.</p>
              ) : (
                <>
                  {r.variable_expenses_by_rule.map((x) => (
                    <Item key={x.name} rotulo={x.name} valor={reaisBr(x.amount)} />
                  ))}
                  <Item rotulo="Taxas de cartão" valor={reaisBr(r.card_fees)} />
                </>
              )
            }
          />
          <Linha
            rotulo="= Margem"
            forte
            valor={`${reaisBr(r.margin)}${r.margin_pct !== null ? ` (${pctBr(r.margin_pct)})` : ""}`}
            tom={r.margin < 0 ? "perigo" : undefined}
          />
          <Linha
            rotulo="(-) Perdas e quebras"
            valor={reaisBr(r.losses)}
            nota="Fora do custo: estoque perdido, diferença de transferência e de caixa"
            detalhe={
              <>
                <Item rotulo="Perda de estoque" valor={reaisBr(d.stock_losses)} />
                <Item rotulo="Diferença de transferência" valor={reaisBr(d.transfer_differences)} />
                <Item rotulo="Diferença de caixa" valor={reaisBr(d.cash_count_differences)} />
              </>
            }
          />
          <Linha
            rotulo="(-) Despesas fixas"
            valor={reaisBr(r.fixed_expenses)}
            nota="As contas que vencem neste mês"
            detalhe={
              r.fixed_expenses_items.length === 0 ? (
                <p>Nenhuma despesa fixa vence neste mês.</p>
              ) : (
                r.fixed_expenses_items.map((f, i) => (
                  <Item
                    key={`${f.name}-${f.due_date}-${i}`}
                    rotulo={
                      <>
                        {f.name}, vence {dataBr(f.due_date)}{" "}
                        <Badge variant={f.status === "paid" ? "green" : "amber"}>{f.status === "paid" ? "Paga" : "A pagar"}</Badge>
                      </>
                    }
                    valor={reaisBr(f.amount)}
                  />
                ))
              )
            }
          />
          <Linha rotulo="= Resultado" forte valor={reaisBr(r.result)} tom={tomDoResultado} />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-texto">Ponto de equilíbrio</h2>
        {pe.status === "ok" && pe.amount !== null && pe.missing !== null ? (
          <>
            <p className="text-sm text-texto-secundario">Quanto precisa vender no mês para cobrir as despesas fixas.</p>
            <p className="text-2xl font-semibold text-texto">{reaisBr(pe.amount)}</p>
            <p className={`text-sm font-medium ${pe.missing === 0 ? "text-sucesso-tinta" : "text-texto"}`}>
              {pe.missing === 0 ? "O ponto de equilíbrio do mês já foi batido." : `Faltam ${reaisBr(pe.missing)} em vendas.`}
            </p>
            <p className="text-xs text-texto-secundario">
              {pe.message}
              {pe.margin_pct_used !== null ? ` Margem usada: ${pctBr(pe.margin_pct_used)}.` : ""}
            </p>
          </>
        ) : (
          <p className={`text-sm ${pe.status === "nao_se_paga" ? "font-medium text-perigo-tinta" : "text-texto-secundario"}`}>
            {pe.message}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-texto">Acompanhamento do mês</h2>
        {r.tracking.days_elapsed === 0 ? (
          <p className="text-sm text-texto-secundario">Este mês ainda não começou.</p>
        ) : (
          <p className="text-sm text-texto-secundario">
            Dia {r.tracking.days_elapsed} de {r.tracking.days_in_month}
            {r.tracking.projected_sales !== null
              ? `. No ritmo de hoje, o mês fecha em ${reaisBr(r.tracking.projected_sales)} em vendas.`
              : "."}
          </p>
        )}
        <AcompanhamentoGrafico
          dias={r.tracking.days}
          decorridos={r.tracking.days_elapsed}
          projetado={r.tracking.projected_sales}
          pontoDeEquilibrio={pe.status === "ok" ? pe.amount : null}
        />
      </section>
    </div>
  );
}
