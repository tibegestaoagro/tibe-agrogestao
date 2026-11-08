import Link from "next/link";
import type { CreditoView } from "@/lib/actions/emporio-credito";
import { reaisBr } from "@/lib/numero-br";
import { diasTexto } from "@/lib/emporio/fiado";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditoForm } from "./credito-form";
import { LiberarFiadoForm } from "./liberar-fiado-form";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

/** "2026-11-08" -> "08/11/2026", sem passar por Date (nada de fuso). */
const diaBr = (iso: string) => iso.split("-").reverse().join("/");

const SITUACAO: Record<CreditoView["status"], { rotulo: (c: CreditoView) => string; variante: "green" | "red" | "amber" }> = {
  em_dia: { rotulo: () => "Em dia", variante: "green" },
  no_limite: { rotulo: () => "No limite", variante: "amber" },
  bloqueado_por_atraso: {
    rotulo: (c) => `Bloqueado: fiado vencido há ${diasTexto(c.oldest_overdue?.days ?? c.block_after_days)}`,
    variante: "red",
  },
};

function textoDoLimite(c: CreditoView): string {
  if (c.limit === null) return "Sem limite de valor";
  return `${reaisBr(c.limit)}, ${c.limit_source === "cliente" ? "do cliente" : "padrão da conta"}`;
}

function textoDoPrazo(c: CreditoView): string {
  const r = c.due_rule;
  if (r.kind === "dia_do_mes") return `todo dia ${r.value}`;
  return `${diasTexto(r.value)} depois da venda${r.source === "conta" ? ", padrão da conta" : ""}`;
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-secundario">{rotulo}</dt>
      <dd className="text-sm text-texto">{children}</dd>
    </div>
  );
}

/**
 * A seção "Fiado e crédito" da ficha do cliente. O servidor decide se ela existe (a action recusa
 * quem não vê o crédito, e o Consumidor final não tem) e quem vê cada botão: `podeMudar` (dinheiro)
 * e `lojasQueLibera` (as lojas em que o ator é Gestor, ou todas se for da conta).
 */
export function CreditoDoCliente({
  credito,
  podeMudar,
  lojasQueLibera,
  agora,
}: {
  credito: CreditoView;
  podeMudar: boolean;
  lojasQueLibera: { id: string; name: string }[];
  /** Instante da leitura, em ISO: decide "válida até hoje" ou "venceu" em cada liberação. */
  agora: string;
}) {
  const s = SITUACAO[credito.status];
  const instante = new Date(agora).getTime();

  return (
    <section className="space-y-4" aria-label="Fiado e crédito">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-texto">Fiado e crédito</h2>
          <Badge variant={s.variante}>{s.rotulo(credito)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeMudar && <CreditoForm credito={credito} />}
          {lojasQueLibera.length > 0 && <LiberarFiadoForm customerId={credito.customer_id} lojas={lojasQueLibera} />}
        </div>
      </div>

      <dl className="grid gap-3 rounded-lg border border-borda p-4 sm:grid-cols-2">
        <Dado rotulo="Deve">
          <span className="font-semibold">{reaisBr(credito.owed_total)}</span>
          {credito.overdue_total > 0 && <span className="text-perigo-tinta">, {reaisBr(credito.overdue_total)} vencido</span>}
        </Dado>
        <Dado rotulo="Limite">{textoDoLimite(credito)}</Dado>
        <Dado rotulo="Prazo">{textoDoPrazo(credito)}</Dado>
        <Dado rotulo="Vencido mais antigo">
          {credito.oldest_overdue
            ? `${diaBr(credito.oldest_overdue.due_date)}, há ${diasTexto(credito.oldest_overdue.days)}`
            : "Nada vencido"}
        </Dado>
        <Dado rotulo="Cobrado pela última vez">
          {credito.last_charged_at ? DATA_HORA.format(new Date(credito.last_charged_at)) : "Nunca"}
        </Dado>
      </dl>

      {credito.owed_by_store.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-texto">Em aberto por loja</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Em aberto</TableHead>
                <TableHead>Vencido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credito.owed_by_store.map((l) => (
                <TableRow key={l.establishment_id}>
                  <TableCell>{l.establishment_name}</TableCell>
                  <TableCell>{reaisBr(l.owed)}</TableCell>
                  <TableCell>{reaisBr(l.overdue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {credito.releases.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-texto">Liberações recentes</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Quem liberou</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credito.releases.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{DATA.format(new Date(r.created_at))}</TableCell>
                  <TableCell>{r.establishment_name}</TableCell>
                  <TableCell>{r.released_by_name}</TableCell>
                  <TableCell className="max-w-64 break-words">{r.reason}</TableCell>
                  <TableCell>
                    {r.consumed_sale_id ? (
                      <Link href={`/emporio/vendas/${r.consumed_sale_id}`} className="font-medium text-texto-marca hover:underline">
                        Usada na venda
                      </Link>
                    ) : new Date(r.valid_until).getTime() >= instante ? (
                      "Válida até hoje"
                    ) : (
                      "Venceu"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
