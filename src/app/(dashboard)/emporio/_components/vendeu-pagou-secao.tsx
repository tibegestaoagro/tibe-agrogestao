import type { listarRegrasVariaveisAction } from "@/lib/actions/emporio-despesas";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RegraVariavelArquivar } from "./regra-variavel-arquivar";
import { RegraVariavelForm } from "./regra-variavel-form";
import { numeroBr, pctBr } from "./formato";
import { FORMA_ROTULO, TIPO_REGRA_ROTULO } from "./venda-rotulos";

type Regras = Extract<Awaited<ReturnType<typeof listarRegrasVariaveisAction>>, { ok: true }>["data"];
type Regra = Regras[number];
type FormProps = React.ComponentProps<typeof RegraVariavelForm>;

/** A seção "Vendeu, Pagou" (era da página Despesas), hoje uma aba do A pagar. */
export function VendeuPagouSecao({
  regras,
  lojas,
  produtos,
  nomesDeApresentacao,
  nomeDoProduto,
  nomeDaApresentacao,
}: {
  regras: Regras;
  lojas: { id: string; name: string }[];
  produtos: FormProps["produtos"];
  nomesDeApresentacao: FormProps["nomesDeApresentacao"];
  nomeDoProduto: Map<string, string>;
  nomeDaApresentacao: Map<string, string>;
}) {
  function condicoes(r: Regra): string {
    const partes: string[] = [];
    if (r.payment_kind) partes.push(`pagando em ${(FORMA_ROTULO[r.payment_kind] ?? r.payment_kind).toLowerCase()}`);
    if (r.emporio_product_id) partes.push(`produto ${nomeDoProduto.get(r.emporio_product_id) ?? "?"}`);
    if (r.presentation_id) partes.push(`apresentação ${nomeDaApresentacao.get(r.presentation_id) ?? "?"}`);
    if (r.presentation_name) partes.push(`Apresentação ${r.presentation_name} (qualquer produto)`);
    return partes.length === 0 ? "Vale para toda venda da loja" : `Só ${partes.join(", ")}`;
  }

  function valorDaRegra(r: Regra): string {
    if (r.kind === "percentual") return pctBr(r.value);
    if (r.kind === "fixo_por_venda") return `${reaisBr(r.value)} por venda`;
    if (r.kind === "por_unidade") return `${reaisBr(r.value)} por unidade`;
    const embalagem = r.packaging_emporio_product_id ? nomeDoProduto.get(r.packaging_emporio_product_id) : null;
    return `${numeroBr(r.value)} de ${embalagem ?? "embalagem"} por unidade`;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-texto">Vendeu, Pagou</h2>
        {lojas.length > 0 && <RegraVariavelForm lojas={lojas} produtos={produtos} nomesDeApresentacao={nomesDeApresentacao} />}
      </div>
      <p className="text-sm text-texto-secundario">
        O que sai de cada venda: comissão, entrega, sacola. A taxa de cartão já entra sozinha, pela taxa cadastrada no
        Caixa.
      </p>
      {regras.length === 0 ? (
        <EmptyState titulo="Nenhuma regra cadastrada">Sem regras, a venda não gera despesa além da taxa de cartão.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regra</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Cálculo</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regras.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-texto">
                  {r.name}
                  <span className="block text-xs font-normal text-texto-secundario">{condicoes(r)}</span>
                </TableCell>
                <TableCell>{r.establishment_name}</TableCell>
                <TableCell className="text-sm">
                  <span className="block text-xs text-texto-secundario">{TIPO_REGRA_ROTULO[r.kind] ?? r.kind}</span>
                  {valorDaRegra(r)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <RegraVariavelForm lojas={lojas} produtos={produtos} nomesDeApresentacao={nomesDeApresentacao} regra={r} />
                    <RegraVariavelArquivar regraId={r.id} nome={r.name} />
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
