import Link from "next/link";
import type { HojeView, PosicaoView } from "@/lib/actions/emporio-financeiro";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { dataBr } from "@/lib/emporio/datas";
import { enderecoDaAba } from "./financeiro-abas";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ROTULO_DO_LUGAR: Record<PosicaoView["kind"], string> = {
  gaveta: "Gaveta",
  gerencia: "Com a gerência",
  conta: "Conta",
};

function Cartao({
  titulo,
  href,
  verTudo,
  children,
}: {
  titulo: string;
  href: string;
  verTudo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <div className="flex-1 space-y-2">{children}</div>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center text-sm font-medium text-texto-marca hover:underline sm:min-h-0"
      >
        {verTudo}
      </Link>
    </section>
  );
}

function Linha({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 text-texto-secundario">{rotulo}</span>
      <span className={destaque ? "shrink-0 text-base font-semibold text-texto" : "shrink-0 text-texto"}>{valor}</span>
    </div>
  );
}

/** A tela "Hoje" do Financeiro: quatro cartões, cada um levando à aba que resolve. */
export function FinanceiroHoje({ resumo, loja }: { resumo: HojeView; loja: string }) {
  const { positions, total_balance, payables_due, receivables_due, overdue_fiado, pending_approvals } = resumo;
  const aReceberHoje = receivables_due.fiado.total + receivables_due.checks.total + receivables_due.cards.total;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pending_approvals.count > 0 && (
        <Cartao titulo="Esperando aprovação" href="/emporio/financeiro/aprovacoes" verTudo="Ver os pedidos">
          <p className="text-2xl font-semibold text-atencao-tinta">{reaisBr(pending_approvals.total)}</p>
          <p className="text-sm text-texto-secundario">
            {plural(pending_approvals.count, "pedido de pagamento", "pedidos de pagamento")} acima do teto
          </p>
        </Cartao>
      )}

      <Cartao titulo="Posição de caixa" href={enderecoDaAba("/emporio/financeiro/caixa", loja)} verTudo="Ver as posições e o extrato">
        {positions.length === 0 ? (
          <EmptyState compacto titulo="Nenhum lugar com dinheiro ainda." />
        ) : (
          <ul className="divide-y divide-borda">
            {positions.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="py-1.5">
                <Linha rotulo={`${ROTULO_DO_LUGAR[p.kind]}: ${p.name}`} valor={reaisBr(p.balance)} />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-borda pt-2">
          <Linha rotulo="Total" valor={reaisBr(total_balance)} destaque />
        </div>
      </Cartao>

      <Cartao titulo="Vence hoje a pagar" href={enderecoDaAba("/emporio/financeiro/pagar", loja)} verTudo="Pagar contas">
        {payables_due.count === 0 ? (
          <EmptyState compacto titulo="Nada vence hoje, e nada está atrasado." />
        ) : (
          <>
            <Linha
              rotulo={`${plural(payables_due.count, "conta", "contas")} (hoje ou atrasadas)`}
              valor={reaisBr(payables_due.total)}
              destaque
            />
            <ul className="divide-y divide-borda">
              {payables_due.items.slice(0, 5).map((c) => (
                <li key={c.entry_id} className="py-1.5">
                  <Linha
                    rotulo={`${c.name}${c.due_date ? `, ${dataBr(c.due_date)}` : ""}`}
                    valor={reaisBr(c.open_amount)}
                  />
                </li>
              ))}
            </ul>
            {payables_due.count > 5 && (
              <p className="text-xs text-texto-secundario">E mais {payables_due.count - 5} na aba A pagar.</p>
            )}
          </>
        )}
      </Cartao>

      <Cartao titulo="Vence hoje a receber" href={enderecoDaAba("/emporio/financeiro/receber", loja)} verTudo="Ver o que receber">
        {aReceberHoje === 0 ? (
          <EmptyState compacto titulo="Nada a receber hoje." />
        ) : (
          <Linha rotulo="Total" valor={reaisBr(aReceberHoje)} destaque />
        )}
        <Linha
          rotulo={`Fiado (${plural(receivables_due.fiado.count, "cliente", "clientes")})`}
          valor={reaisBr(receivables_due.fiado.total)}
        />
        <Linha
          rotulo={`Cheques (${plural(receivables_due.checks.count, "cheque", "cheques")})`}
          valor={reaisBr(receivables_due.checks.total)}
        />
        <Linha
          rotulo={`Cartões (${plural(receivables_due.cards.count, "parcela", "parcelas")})`}
          valor={reaisBr(receivables_due.cards.total)}
        />
      </Cartao>

      <Cartao titulo="Fiado vencido" href={enderecoDaAba("/emporio/financeiro/receber", loja)} verTudo="Cobrar e receber">
        {overdue_fiado.customers === 0 ? (
          <EmptyState compacto titulo="Nenhum fiado vencido">Quem comprou fiado está em dia.</EmptyState>
        ) : (
          <>
            <p className="text-2xl font-semibold text-perigo-tinta">{reaisBr(overdue_fiado.total)}</p>
            <p className="text-sm text-texto-secundario">
              {plural(overdue_fiado.customers, "cliente atrasado", "clientes atrasados")}
            </p>
          </>
        )}
      </Cartao>
    </div>
  );
}
