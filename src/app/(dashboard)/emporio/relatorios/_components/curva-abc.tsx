import Link from "next/link";
import type { CurvaAbc, CurvaAbcClasse } from "@/lib/actions/emporio-relatorios";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { UNIDADE_BASE_SUFIXO, numeroBr, pctBr } from "../../_components/formato";

const VARIANTE: Record<CurvaAbcClasse, "green" | "amber" | "gray"> = { A: "green", B: "amber", C: "gray" };

const ABA =
  "inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium sm:min-h-9";
const ABA_ATIVA = `${ABA} border-borda-campo bg-superficie-afundada text-texto`;
const ABA_INATIVA = `${ABA} border-borda text-texto-secundario hover:text-texto`;

/**
 * A seção "Curva ABC" do Relatórios. Sem estado: as abas e a medida são links
 * que mudam a URL, e a página server relê. `erro` traz a recusa do servidor (a
 * do lucro, por exemplo), que aparece aqui sem derrubar o resto da página.
 */
export function CurvaAbcSecao({
  curva,
  erro,
  kind,
  measure,
  mostrarMedida,
  href,
}: {
  curva: CurvaAbc | null;
  erro: string | null;
  kind: "products" | "customers";
  measure: "revenue" | "profit";
  mostrarMedida: boolean;
  href: (abc: "produtos" | "clientes", medida: "faturamento" | "lucro") => string;
}) {
  const medidaUrl = measure === "profit" ? "lucro" : "faturamento";
  const abcUrl = kind === "customers" ? "clientes" : "produtos";
  const rotuloValor = measure === "profit" ? "Lucro" : "Faturamento";
  const substantivo = kind === "customers" ? ["cliente", "clientes"] : ["produto", "produtos"];

  return (
    <section className="space-y-4 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-texto">Curva ABC</h2>
        <p className="text-sm text-texto-secundario">
          Quem mais pesa no resultado. A são os que somam os primeiros 80%, B até 95% e C o resto.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href("produtos", medidaUrl)} className={abcUrl === "produtos" ? ABA_ATIVA : ABA_INATIVA}>
          Produtos
        </Link>
        <Link href={href("clientes", medidaUrl)} className={abcUrl === "clientes" ? ABA_ATIVA : ABA_INATIVA}>
          Clientes
        </Link>
      </div>

      {mostrarMedida && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Medida da curva">
          <Link href={href(abcUrl, "faturamento")} className={measure === "revenue" ? ABA_ATIVA : ABA_INATIVA}>
            Faturamento
          </Link>
          <Link href={href(abcUrl, "lucro")} className={measure === "profit" ? ABA_ATIVA : ABA_INATIVA}>
            Lucro (venda menos custo)
          </Link>
        </div>
      )}

      {erro && (
        <p role="status" className="text-sm text-texto-secundario">
          {erro}
        </p>
      )}

      {!curva ? (
        !erro && <EmptyState compacto titulo="Sem curva para mostrar">Escolha o período e a loja.</EmptyState>
      ) : curva.itens.length === 0 && !curva.fora_da_curva ? (
        <EmptyState compacto titulo="Nenhuma venda no período">A curva aparece aqui quando houver venda.</EmptyState>
      ) : (
        <>
          {curva.classes.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sem vendas positivas no período.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {curva.classes.map((c) => (
                <li key={c.classe} className="flex items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto">
                  <Badge variant={VARIANTE[c.classe]}>{c.classe}</Badge>
                  <span>
                    {c.count} {c.count === 1 ? substantivo[0] : substantivo[1]}, {reaisBr(c.amount)}, {pctBr(c.share_pct)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {curva.fora_da_curva && (
            <p className="text-sm text-texto-secundario">
              {curva.fora_da_curva.label}: {reaisBr(curva.fora_da_curva.amount)} em {curva.fora_da_curva.sales_count}{" "}
              {curva.fora_da_curva.sales_count === 1 ? "venda" : "vendas"}. Ficam fora da curva.
            </p>
          )}

          {curva.itens.length > 0 && (
            <div className="min-w-0 max-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Pos.</TableHead>
                    <TableHead>{kind === "customers" ? "Cliente" : "Produto"}</TableHead>
                    <TableHead className="text-right">{kind === "customers" ? "Vendas" : "Quantidade"}</TableHead>
                    <TableHead className="text-right">{rotuloValor}</TableHead>
                    <TableHead className="text-right">Participação</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                    <TableHead>Classe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {curva.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-right">{i.posicao}</TableCell>
                      <TableCell className="font-medium">
                        {i.name}
                        {i.cost_missing && <span className="block text-xs font-normal text-atencao-tinta">sem custo</span>}
                        {i.cost_estimated && !i.cost_missing && (
                          <span className="block text-xs font-normal text-texto-secundario">custo estimado</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {kind === "customers"
                          ? (i.sales_count ?? 0)
                          : `${numeroBr(i.quantity ?? 0)} ${UNIDADE_BASE_SUFIXO[i.base_unit ?? ""] ?? i.base_unit ?? ""}`}
                      </TableCell>
                      <TableCell className={`text-right ${i.amount < 0 ? "text-perigo-tinta" : ""}`}>
                        {reaisBr(i.amount)}
                      </TableCell>
                      <TableCell className="text-right">{pctBr(i.share_pct)}</TableCell>
                      <TableCell className="text-right">{pctBr(i.cumulative_pct)}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE[i.classe]}>{i.classe}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
