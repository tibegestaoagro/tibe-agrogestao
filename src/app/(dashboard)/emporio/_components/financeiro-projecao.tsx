import Link from "next/link";
import type { FluxoProjetadoView } from "@/lib/actions/emporio-projecao";
import { reaisBr } from "@/lib/numero-br";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { FluxoProjetadoGrafico } from "./fluxo-projetado-grafico";
import { SemVencimentoBloco } from "./financeiro-relatorios";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const JANELAS = [30, 60, 90] as const;

const ddmm = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

/** Os três botões-link de janela: preservam a loja e marcam a atual. */
export function ProjecaoJanelas({ dias, loja }: { dias: number; loja: string }) {
  return (
    <nav aria-label="Janela da projeção" className="flex flex-wrap gap-2">
      {JANELAS.map((d) => {
        const p = new URLSearchParams();
        if (loja) p.set("loja", loja);
        p.set("dias", String(d));
        return (
          <Link
            key={d}
            href={`/emporio/financeiro/projecao?${p.toString()}`}
            aria-current={d === dias ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria sm:min-h-9",
              d === dias
                ? "border-primaria bg-primaria text-sobre-primaria"
                : "border-borda bg-superficie text-texto hover:border-borda-forte",
            )}
          >
            {d} dias
          </Link>
        );
      })}
    </nav>
  );
}

/** O fluxo projetado por semana; a última linha (o saldo final da janela) em destaque. */
export function FluxoProjetadoTabela({ fluxo }: { fluxo: FluxoProjetadoView }) {
  if (fluxo.weeks.length === 0) {
    return <EmptyState titulo="Nada para projetar">Não há semanas na janela escolhida.</EmptyState>;
  }
  const ultima = fluxo.weeks.length - 1;
  return (
    <div className="space-y-3">
      <p className="text-sm text-texto">
        Saldo de hoje: <strong>{reaisBr(fluxo.opening_balance)}</strong>
      </p>
      <FluxoProjetadoGrafico abertura={fluxo.opening_balance} semanas={fluxo.weeks} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Semana</TableHead>
            <TableHead>A receber</TableHead>
            <TableHead>A pagar</TableHead>
            <TableHead>Saldo ao fim</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fluxo.weeks.map((s, i) => (
            <TableRow key={s.numero} className={i === ultima ? "font-semibold" : undefined}>
              <TableCell className="whitespace-nowrap">
                Semana {s.numero}
                <span className="block text-xs font-normal text-texto-secundario">
                  de {ddmm(s.de)} a {ddmm(s.ate)}
                </span>
              </TableCell>
              <TableCell>
                {reaisBr(s.receivables.total)}
                <span className="block text-xs font-normal text-texto-secundario">
                  fiado {reaisBr(s.receivables.fiado)}, cartão {reaisBr(s.receivables.cards)}, cheque {reaisBr(s.receivables.checks)}
                </span>
              </TableCell>
              <TableCell>
                {reaisBr(s.payables.total)}
                <span className="block text-xs font-normal text-texto-secundario">
                  contas {reaisBr(s.payables.entries)}, fixas estimadas {reaisBr(s.payables.fixed_estimated)}
                  {s.payables.fixed_estimated > 0 && (
                    <>
                      {" "}
                      <Badge variant="gray">estimativa</Badge>
                    </>
                  )}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">{reaisBr(s.closing_balance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SemVencimentoBloco r={fluxo.without_due} />
      {fluxo.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-texto-secundario">
          {fluxo.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
