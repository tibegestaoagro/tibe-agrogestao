import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { lerProdutoEmporioAction } from "@/lib/actions/emporio-catalogo";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ArquivarBotao } from "../../_components/arquivar-botao";
import { DadosComerciaisForm } from "../../_components/dados-comerciais-form";
import { ApresentacaoForm } from "../../_components/apresentacao-form";
import { PrecoForm, AplicarSugeridoBotao } from "../../_components/preco-form";
import {
  UNIDADE_BASE_ROTULO,
  UNIDADE_BASE_SUFIXO,
  rotuloCustoBase,
  numeroBr,
  pctBr,
} from "../../_components/formato";

export default async function ProdutoEmporioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;
  const podeEscrever = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const res = await lerProdutoEmporioAction(db, user, id);
  if (!res.ok) notFound();
  const p = res.data;

  const sufixo = UNIDADE_BASE_SUFIXO[p.base_unit] ?? p.base_unit;
  const ativas = p.presentations.filter((a) => !a.archived_at);
  const nomeApresentacao = new Map(p.presentations.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio/produtos" className="text-sm text-texto-secundario hover:text-texto">
            Produtos
          </Link>
          <h1 className="text-2xl font-semibold text-texto">
            {p.name}
            {p.archived_at && (
              <Badge variant="gray" className="ml-2 align-middle">
                Arquivado
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-texto-secundario">
            {p.category_name}, vendido por {(UNIDADE_BASE_ROTULO[p.base_unit] ?? p.base_unit).toLowerCase()}
          </p>
        </div>
        {podeEscrever && (
          <ArquivarBotao
            url={`/api/v1/emporio/products/${p.id}/archive`}
            arquivado={!!p.archived_at}
            rotulo="Arquivar produto"
          />
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Dados comerciais</h2>
          {podeEscrever && <DadosComerciaisForm produto={p} podeExcecao={ehAdmin} />}
        </div>
        <dl className="grid gap-3 rounded-lg border border-borda bg-superficie p-4 text-sm sm:grid-cols-2">
          <Item rotulo="Marca" valor={p.brand ?? "-"} />
          <Item
            rotulo={rotuloCustoBase(p.base_unit)}
            valor={p.reference_cost == null ? "Não informado" : reaisBr(p.reference_cost)}
          />
          <Item
            rotulo="Lacrado e avulso"
            valor={
              p.track_sealed === null
                ? `Automático (${p.track_sealed_efetivo ? "ligado" : "desligado"})`
                : p.track_sealed
                  ? "Ligado"
                  : "Desligado"
            }
          />
          <Item rotulo="Lote" valor={p.track_lot ? "Controlado" : "Não controlado"} />
          <Item rotulo="Validade" valor={p.track_expiry ? "Controlada" : "Não controlada"} />
          {ehAdmin && (
            <>
              <Item rotulo="Despesas do produto" valor={p.expense_pct == null ? "Padrão da loja" : pctBr(p.expense_pct)} />
              <Item rotulo="Lucro do produto" valor={p.profit_pct == null ? "Padrão da loja" : pctBr(p.profit_pct)} />
            </>
          )}
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Apresentações</h2>
          {podeEscrever && <ApresentacaoForm produtoId={p.id} baseUnit={p.base_unit} />}
        </div>
        {p.presentations.length === 0 ? (
          <EmptyState titulo="Nenhuma apresentação">
            Cadastre as formas em que o produto é vendido, como o saco fechado e o quilo avulso.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Vale</TableHead>
                <TableHead>Embalagem</TableHead>
                {podeEscrever && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.presentations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-texto">
                    {a.name}
                    {a.archived_at && (
                      <Badge variant="gray" className="ml-2">
                        Arquivada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {numeroBr(a.base_qty)} {sufixo}
                  </TableCell>
                  <TableCell>{a.is_sealed_package ? "Fechada" : "Avulsa"}</TableCell>
                  {podeEscrever && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <ApresentacaoForm produtoId={p.id} baseUnit={p.base_unit} apresentacao={a} />
                        <ArquivarBotao
                          url={`/api/v1/emporio/presentations/${a.id}/archive`}
                          arquivado={!!a.archived_at}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Preço por loja</h2>
        {p.prices.length === 0 ? (
          <EmptyState
            titulo={ativas.length === 0 ? "Sem apresentação ativa" : "Nenhuma loja cadastrada"}
            acao={
              ativas.length === 0 ? undefined : (
                <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
                  Ir para Estabelecimentos
                </Link>
              )
            }
          >
            {ativas.length === 0
              ? "Cadastre uma apresentação para poder formar preço."
              : "Cadastre uma loja para formar o preço deste produto."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Apresentação</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Despesas</TableHead>
                <TableHead>Lucro</TableHead>
                <TableHead>Sugerido</TableHead>
                <TableHead>Preço</TableHead>
                {ehAdmin && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.prices.map((r) => {
                const nome = nomeApresentacao.get(r.presentation_id) ?? "";
                return (
                  <TableRow key={`${r.establishment_id}:${r.presentation_id}`}>
                    <TableCell className="font-medium text-texto">{r.establishment_name}</TableCell>
                    <TableCell>{nome}</TableCell>
                    <TableCell>{r.cost == null ? "sem custo" : reaisBr(r.cost)}</TableCell>
                    <TableCell>
                      {pctBr(r.expense_pct_efetivo)}
                      {r.expense_pct != null && <Excecao />}
                    </TableCell>
                    <TableCell>
                      {pctBr(r.profit_pct_efetivo)}
                      {r.profit_pct != null && <Excecao />}
                    </TableCell>
                    <TableCell>{r.suggested_price == null ? "-" : reaisBr(r.suggested_price)}</TableCell>
                    <TableCell>
                      {r.price == null ? (
                        <span className="text-texto-secundario">sem preço</span>
                      ) : (
                        <span className="font-medium text-texto">{reaisBr(r.price)}</span>
                      )}
                    </TableCell>
                    {ehAdmin && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {r.price == null && <AplicarSugeridoBotao preco={r} />}
                          <PrecoForm preco={r} titulo={`${r.establishment_name}, ${nome}`} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-texto-secundario">{rotulo}</dt>
      <dd className="font-medium text-texto">{valor}</dd>
    </div>
  );
}

function Excecao() {
  return (
    <Badge variant="amber" className="ml-1">
      exceção
    </Badge>
  );
}
