import type { LojaDoResultadoView } from "@/lib/actions/emporio-resultado";
import { reaisBr } from "@/lib/numero-br";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { pctBr } from "./formato";

const corDoResultado = (n: number) =>
  n < 0 ? "text-perigo-tinta" : n > 0 ? "text-sucesso-tinta" : "text-texto";

/** As lojas lado a lado, na visão somada (Q103). */
export function ResultadoLojas({ lojas }: { lojas: LojaDoResultadoView[] }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-texto">Loja por loja</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">Margem</TableHead>
            <TableHead className="text-right">Margem %</TableHead>
            <TableHead className="text-right">Perdas</TableHead>
            <TableHead className="text-right">Fixas</TableHead>
            <TableHead className="text-right">Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lojas.map((l) => (
            <TableRow key={l.establishment_id}>
              <TableCell className="font-medium">{l.name}</TableCell>
              <TableCell className="text-right">{reaisBr(l.sales)}</TableCell>
              <TableCell className={`text-right ${l.margin < 0 ? "text-perigo-tinta" : ""}`}>{reaisBr(l.margin)}</TableCell>
              <TableCell className="text-right">{l.margin_pct !== null ? pctBr(l.margin_pct) : "-"}</TableCell>
              <TableCell className="text-right">{reaisBr(l.losses)}</TableCell>
              <TableCell className="text-right">{reaisBr(l.fixed_expenses)}</TableCell>
              <TableCell className={`text-right font-semibold ${corDoResultado(l.result)}`}>{reaisBr(l.result)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
