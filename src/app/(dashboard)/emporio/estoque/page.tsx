import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import {
  saldoDaLojaAction,
  estoqueConsolidadoAction,
  precisaReporAction,
} from "@/lib/actions/emporio-estoque";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EncaminharBotao } from "../_components/encaminhar-botao";
import { UNIDADE_BASE_SUFIXO, numeroBr, textoLacrado } from "../_components/formato";

const TODAS = "todas";

/**
 * Estoque do Meu Empório (F2a, Q60 a Q71). A loja escolhida vive na URL
 * (`?loja=`), então a página continua sendo server e o link é compartilhável.
 * O saldo nunca é lido de um campo: as actions somam as movimentações.
 */
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaParam } = await searchParams;

  const db = await getTenantDb();
  // F6b (Q120): encaminhar à Lista é do Gestor para cima, mas quem é só da loja
  // não tem a Lista de Compra, então não encaminha para ela.
  const papel = await papelDoEmporio(db, user);
  const podeEncaminhar = pode(papel, "gestor_da_loja") && !papel.soDaLoja;
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data : [];

  const consolidado = lojaParam === TODAS;
  const lojaAtual = consolidado ? null : (lojas.find((l) => l.id === lojaParam) ?? lojas[0] ?? null);

  const [saldoRes, consolidadoRes, reporRes] = await Promise.all([
    lojaAtual ? saldoDaLojaAction(db, user, lojaAtual.id) : Promise.resolve(null),
    consolidado ? estoqueConsolidadoAction(db, user) : Promise.resolve(null),
    precisaReporAction(db, user, lojaAtual ? { establishment_id: lojaAtual.id } : {}),
  ]);
  const linhas = saldoRes?.ok ? saldoRes.data : [];
  const linhasConsolidadas = consolidadoRes?.ok ? consolidadoRes.data : [];
  const repor = reporRes.ok ? reporRes.data : [];

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Estoque</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O saldo de cada loja, somado das entradas e saídas. Para dar entrada, registre uma compra.
        </p>
      </header>

      {lojas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma loja cadastrada"
          acao={
            <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Estabelecimentos
            </Link>
          }
        >
          Cadastre uma loja para controlar o estoque dela.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Loja" className="flex flex-wrap gap-2">
            {lojas.map((l) => (
              <Button key={l.id} asChild size="sm" variant={lojaAtual?.id === l.id ? "default" : "outline"}>
                <Link href={`/emporio/estoque?loja=${l.id}`} aria-current={lojaAtual?.id === l.id ? "page" : undefined}>
                  {l.name}
                </Link>
              </Button>
            ))}
            <Button asChild size="sm" variant={consolidado ? "default" : "outline"}>
              <Link href={`/emporio/estoque?loja=${TODAS}`} aria-current={consolidado ? "page" : undefined}>
                Todas as lojas
              </Link>
            </Button>
          </nav>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-texto">Precisa repor</h2>
            {repor.length === 0 ? (
              <EmptyState titulo="Nada abaixo do mínimo">
                Defina o mínimo de cada produto na tela dele (Estoque por loja) para ser avisado aqui.
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {!lojaAtual && <TableHead>Loja</TableHead>}
                    <TableHead>Produto</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Mínimo</TableHead>
                    <TableHead>Sugestão</TableHead>
                    {podeEncaminhar && <TableHead>Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repor.map((r) => {
                    const sufixo = UNIDADE_BASE_SUFIXO[r.base_unit] ?? r.base_unit;
                    return (
                      <TableRow key={`${r.establishment_id}:${r.emporio_product_id}`}>
                        {!lojaAtual && <TableCell>{r.establishment_name}</TableCell>}
                        <TableCell className="font-medium text-texto">
                          <Link href={`/emporio/produtos/${r.emporio_product_id}`} className="hover:underline">
                            {r.product_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {numeroBr(r.total_qty)} {sufixo}
                        </TableCell>
                        <TableCell>
                          {r.min_qty == null ? "-" : `${numeroBr(r.min_qty)} ${sufixo}`}
                        </TableCell>
                        <TableCell>
                          {r.suggested_qty == null ? (
                            <span className="text-texto-secundario">sem máximo</span>
                          ) : (
                            `${numeroBr(r.suggested_qty)} ${sufixo}`
                          )}
                        </TableCell>
                        {podeEncaminhar && (
                          <TableCell>
                            <EncaminharBotao
                              establishmentId={r.establishment_id}
                              produtoId={r.emporio_product_id}
                              baseUnit={r.base_unit}
                              sugestao={r.suggested_qty}
                              titulo={`${r.establishment_name}, ${r.product_name}`}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          {consolidado ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-texto">Todas as lojas</h2>
              {linhasConsolidadas.length === 0 ? (
                <EmptyState titulo="Sem estoque lançado">
                  Registre uma compra ou lance o estoque inicial na tela do produto.
                </EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Lacrado</TableHead>
                      <TableHead>Avulso</TableHead>
                      <TableHead>Custo médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasConsolidadas.map((c) => {
                      const sufixo = UNIDADE_BASE_SUFIXO[c.base_unit] ?? c.base_unit;
                      return (
                        <TableRow key={c.emporio_product_id}>
                          <TableCell className="font-medium text-texto">
                            <Link href={`/emporio/produtos/${c.emporio_product_id}`} className="hover:underline">
                              {c.product_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {numeroBr(c.total_qty)} {sufixo}
                          </TableCell>
                          <TableCell>{textoLacrado(c.sealed)}</TableCell>
                          <TableCell>{`${numeroBr(c.loose_qty)} ${sufixo}`}</TableCell>
                          <TableCell>
                            {c.average_cost == null ? "-" : `${reaisBr(c.average_cost)} por ${sufixo}`}
                            {c.estimated && <EstimadoSelo />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          ) : (
            lojaAtual && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-texto">{lojaAtual.name}</h2>
                {linhas.length === 0 ? (
                  <EmptyState titulo="Sem estoque lançado nesta loja">
                    Registre uma compra, ou lance o estoque inicial na tela do produto.
                  </EmptyState>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Lacrado</TableHead>
                        <TableHead>Avulso</TableHead>
                        <TableHead>Custo médio</TableHead>
                        <TableHead>Mínimo</TableHead>
                        <TableHead>Máximo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map((l) => {
                        const sufixo = UNIDADE_BASE_SUFIXO[l.base_unit] ?? l.base_unit;
                        return (
                          <TableRow key={l.emporio_product_id}>
                            <TableCell className="font-medium text-texto">
                              <Link href={`/emporio/produtos/${l.emporio_product_id}`} className="hover:underline">
                                {l.product_name}
                              </Link>
                              {l.needs_restock && (
                                <Badge variant="amber" className="ml-2">
                                  repor
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {numeroBr(l.total_qty)} {sufixo}
                            </TableCell>
                            <TableCell>{textoLacrado(l.sealed)}</TableCell>
                            <TableCell>{`${numeroBr(l.loose_qty)} ${sufixo}`}</TableCell>
                            <TableCell>
                              {l.average_cost == null ? "-" : `${reaisBr(l.average_cost)} por ${sufixo}`}
                              {l.estimated && <EstimadoSelo />}
                            </TableCell>
                            <TableCell>{l.min_qty == null ? "-" : numeroBr(l.min_qty)}</TableCell>
                            <TableCell>{l.max_qty == null ? "-" : numeroBr(l.max_qty)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}

function EstimadoSelo() {
  return (
    <Badge variant="amber" className="ml-2">
      estimado
    </Badge>
  );
}
