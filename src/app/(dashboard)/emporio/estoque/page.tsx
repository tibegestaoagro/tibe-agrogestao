import Link from "next/link";
import { redirect } from "next/navigation";
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
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { AbasDaTela } from "../_components/abas-da-tela";
import { BarraDeFiltros } from "../_components/barra-de-filtros";
import { Paginacao } from "../_components/paginacao";
import { PaginacaoDaUrl } from "../_components/paginacao-da-url";
import { lerPaginacaoDaUrl } from "../_components/paginacao-opcoes";
import { abaDoEstoque, fatiarPagina } from "@/lib/emporio/dinheiro-telas";
import { EncaminharBotao } from "../_components/encaminhar-botao";
import { UNIDADE_BASE_SUFIXO, numeroBr, textoLacrado, ORIGEM_DO_CUSTO_AVISO } from "../_components/formato";

const TODAS = "todas";

/**
 * Estoque do Meu Empório (F2a, Q60 a Q71). A loja escolhida vive na URL
 * (`?loja=`), então a página continua sendo server e o link é compartilhável.
 * O saldo nunca é lido de um campo: as actions somam as movimentações.
 */
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; aba?: string; pagina?: string; por_pagina?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const params = await searchParams;
  const { loja: lojaParam } = params;
  const aba = abaDoEstoque(params.aba);
  const { pagina, porPagina } = lerPaginacaoDaUrl(params);

  const db = await getTenantDb();
  // O Caixa não abre esta tela: só vende, recebe fiado e opera o caixa.
  if ((await papelDoEmporio(db, user)).papel === "caixa") redirect("/emporio");
  // F6b (Q120): encaminhar à Lista é do Gestor para cima, mas quem é só da loja
  // não tem a Lista de Compra, então não encaminha para ela.
  const papel = await papelDoEmporio(db, user);
  const podeEncaminhar = pode(papel, "gestor_da_loja") && !papel.soDaLoja;
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data : [];

  const consolidado = lojaParam === TODAS;
  const lojaAtual = consolidado ? null : (lojas.find((l) => l.id === lojaParam) ?? lojas[0] ?? null);

  // Cada aba carrega só o que mostra.
  const [saldoRes, consolidadoRes, reporRes] = await Promise.all([
    aba === "tudo" && lojaAtual ? saldoDaLojaAction(db, user, lojaAtual.id) : Promise.resolve(null),
    aba === "tudo" && consolidado ? estoqueConsolidadoAction(db, user) : Promise.resolve(null),
    aba === "repor" ? precisaReporAction(db, user, lojaAtual ? { establishment_id: lojaAtual.id } : {}) : Promise.resolve(null),
  ]);
  const fatiaLinhas = fatiarPagina(saldoRes?.ok ? saldoRes.data : [], pagina, porPagina);
  const fatiaConsolidadas = fatiarPagina(consolidadoRes?.ok ? consolidadoRes.data : [], pagina, porPagina);
  const fatiaRepor = fatiarPagina(reporRes?.ok ? reporRes.data : [], pagina, porPagina);
  const linhas = fatiaLinhas.linhas;
  const linhasConsolidadas = fatiaConsolidadas.linhas;
  const repor = fatiaRepor.linhas;
  const lojaQuery = consolidado ? TODAS : (lojaAtual?.id ?? "");

  function hrefDe(n: number): string {
    const p = new URLSearchParams();
    if (lojaQuery) p.set("loja", lojaQuery);
    if (aba !== "repor") p.set("aba", aba);
    if (porPagina !== 20) p.set("por_pagina", String(porPagina));
    if (n > 1) p.set("pagina", String(n));
    const texto = p.toString();
    return texto ? `/emporio/estoque?${texto}` : "/emporio/estoque";
  }
  // Trocar de loja ou de aba larga a `pagina`; o tamanho da página fica.
  function hrefAba(novaAba: string, loja: string): string {
    const p = new URLSearchParams();
    if (loja) p.set("loja", loja);
    if (novaAba !== "repor") p.set("aba", novaAba);
    if (porPagina !== 20) p.set("por_pagina", String(porPagina));
    const texto = p.toString();
    return texto ? `/emporio/estoque?${texto}` : "/emporio/estoque";
  }

  return (
    <div className="space-y-8">
      <CabecalhoDaTela
        titulo="Estoque"
        ajuda="O saldo de cada loja, somado das entradas e saídas. Para dar entrada, registre uma compra."
      />

      {lojas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma loja cadastrada"
          acao={
            <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Lojas
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
                <Link href={hrefAba(aba, l.id)} aria-current={lojaAtual?.id === l.id ? "page" : undefined}>
                  {l.name}
                </Link>
              </Button>
            ))}
            <Button asChild size="sm" variant={consolidado ? "default" : "outline"}>
              <Link href={hrefAba(aba, TODAS)} aria-current={consolidado ? "page" : undefined}>
                Todas as lojas
              </Link>
            </Button>
          </nav>

          <AbasDaTela
            rotulo="Abas do Estoque"
            atual={aba}
            abas={[
              { valor: "repor", rotulo: "Precisa repor", href: hrefAba("repor", lojaQuery) },
              { valor: "tudo", rotulo: "Tudo", href: hrefAba("tudo", lojaQuery) },
            ]}
          />

          <BarraDeFiltros
            ajustes={<PaginacaoDaUrl porPagina={porPagina} chavePorPagina="por_pagina" chavePagina="pagina" />}
          />

          {aba === "repor" && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-texto">Precisa repor</h2>
            {fatiaRepor.total === 0 ? (
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
            <Paginacao page={fatiaRepor.pagina} perPage={porPagina} total={fatiaRepor.total} hrefDe={hrefDe} />
          </section>
          )}

          {aba === "tudo" && (consolidado ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-texto">Todas as lojas</h2>
              {fatiaConsolidadas.total === 0 ? (
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
              <Paginacao page={fatiaConsolidadas.pagina} perPage={porPagina} total={fatiaConsolidadas.total} hrefDe={hrefDe} />
            </section>
          ) : (
            lojaAtual && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-texto">{lojaAtual.name}</h2>
                {fatiaLinhas.total === 0 ? (
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
                        <TableHead>Custo</TableHead>
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
                              {/* Um custo só (Q299): o médio com estoque; sem estoque, a última compra. */}
                              {l.suggested_cost == null ? "-" : `${reaisBr(l.suggested_cost)} por ${sufixo}`}
                              {l.estimated && <EstimadoSelo />}
                              {l.suggested_cost_source && ORIGEM_DO_CUSTO_AVISO[l.suggested_cost_source] && (
                                <span className="block text-xs text-texto-secundario">
                                  {ORIGEM_DO_CUSTO_AVISO[l.suggested_cost_source]}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{l.min_qty == null ? "-" : numeroBr(l.min_qty)}</TableCell>
                            <TableCell>{l.max_qty == null ? "-" : numeroBr(l.max_qty)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                <Paginacao page={fatiaLinhas.pagina} perPage={porPagina} total={fatiaLinhas.total} hrefDe={hrefDe} />
              </section>
            )
          ))}
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
