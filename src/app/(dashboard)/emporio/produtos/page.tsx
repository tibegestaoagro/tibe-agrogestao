import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import {
  listarProdutosEmporioAction,
  listarCandidatosAction,
  EMPORIO_SPECIES,
} from "@/lib/actions/emporio-catalogo";
import { ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { getBillingAccess } from "@/lib/billing-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ProdutoNovoForm, ProdutoDaFazendaForm } from "../_components/produto-novo-form";
import { nomeComConteudo } from "../_components/formato";
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { BarraDeFiltros } from "../_components/barra-de-filtros";
import { Paginacao } from "../_components/paginacao";
import { PaginacaoDaUrl } from "../_components/paginacao-da-url";
import { lerPaginacaoDaUrl } from "../_components/paginacao-opcoes";
import { fatiarPagina } from "@/lib/emporio/dinheiro-telas";

export default async function ProdutosEmporioPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string; q?: string; species?: string; pagina?: string; por_pagina?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const params = await searchParams;
  const { arquivados, q = "", species = "" } = params;
  const { pagina, porPagina } = lerPaginacaoDaUrl(params);
  const mostrarArquivados = arquivados === "1";
  const busca = q.trim();
  const filtrando = busca !== "" || species !== "";
  // Mudar arquivados, busca ou espécie larga a `pagina`: a lista é outra.
  const linkSemArquivados = (arq: boolean) => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (species) params.set("species", species);
    if (arq) params.set("arquivados", "1");
    if (porPagina !== 20) params.set("por_pagina", String(porPagina));
    const texto = params.toString();
    return texto ? `/emporio/produtos?${texto}` : "/emporio/produtos";
  };

  const db = await getTenantDb();
  // O Caixa não abre esta tela: só vende, recebe fiado e opera o caixa.
  if ((await papelDoEmporio(db, user)).papel === "caixa") redirect("/emporio");
  // F6b: cadastrar e editar produto é por chave (Vendedor com a chave, Gestor para cima).
  const podeEscrever = pode(await papelDoEmporio(db, user), "chave:cadastrar_produto");

  // As categorias nascem na primeira visita de quem escreve, como no Estoque:
  // sem elas o painel de "Novo produto" abriria com a lista vazia.
  if (podeEscrever && (await getBillingAccess(user.tenant_id)) === "full") {
    await ensureProductCategories(db);
  }

  const [res, candidatosRes, categorias, apresentacoes] = await Promise.all([
    listarProdutosEmporioAction(db, user, {
      incluir_arquivados: mostrarArquivados,
      ...(busca ? { q: busca } : {}),
      ...(species ? { species } : {}),
    }),
    podeEscrever ? listarCandidatosAction(db, user) : Promise.resolve(null),
    listProductCategories(db),
    db.productPresentation.findMany({
      where: { archived_at: null },
      select: { emporio_product_id: true },
    }),
  ]);
  const todos = res.ok ? res.data : [];
  const fatia = fatiarPagina(todos, pagina, porPagina);
  const produtos = fatia.linhas;

  function hrefDe(n: number): string {
    const p = new URLSearchParams();
    if (busca) p.set("q", busca);
    if (species) p.set("species", species);
    if (mostrarArquivados) p.set("arquivados", "1");
    if (porPagina !== 20) p.set("por_pagina", String(porPagina));
    if (n > 1) p.set("pagina", String(n));
    const texto = p.toString();
    return texto ? `/emporio/produtos?${texto}` : "/emporio/produtos";
  }
  const candidatos = candidatosRes && candidatosRes.ok ? candidatosRes.data : [];

  const qtdApresentacoes = new Map<string, number>();
  for (const a of apresentacoes) {
    qtdApresentacoes.set(a.emporio_product_id, (qtdApresentacoes.get(a.emporio_product_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="Produtos"
        acoes={
          podeEscrever && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/emporio/produtos/etiquetas">Etiquetas</Link>
              </Button>
              <ProdutoDaFazendaForm
                candidatos={candidatos.map((c) => ({ id: c.id, name: c.name, category_name: c.category_name }))}
              />
              <ProdutoNovoForm
                categorias={categorias}
                especiesLista={EMPORIO_SPECIES.map((e) => ({ id: e.id, label: e.label }))}
              />
            </div>
          )
        }
      />

      {/* Formulário comum (GET): a busca vive na URL e a página server relê. */}
      <form method="get" action="/emporio/produtos">
        {mostrarArquivados && <input type="hidden" name="arquivados" value="1" />}
        {porPagina !== 20 && <input type="hidden" name="por_pagina" value={porPagina} />}
        <BarraDeFiltros
          busca={
            <div className="space-y-1">
              <Label htmlFor="busca-q">Buscar</Label>
              <Input id="busca-q" name="q" defaultValue={busca} placeholder="Nome, marca, fabricante ou código" />
            </div>
          }
          filtros={
            <>
              <div className="w-full space-y-1 sm:w-48">
                <Label htmlFor="busca-species">Espécie</Label>
                <select
                  id="busca-species"
                  name="species"
                  defaultValue={species}
                  className="flex min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-1 text-base shadow-sm sm:h-9 sm:min-h-0 sm:text-sm"
                >
                  <option value="">Todas</option>
                  {EMPORIO_SPECIES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="outline">
                Buscar
              </Button>
            </>
          }
          ajustes={<PaginacaoDaUrl porPagina={porPagina} chavePorPagina="por_pagina" chavePagina="pagina" />}
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={linkSemArquivados(!mostrarArquivados)}>
            {mostrarArquivados ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Link>
        </Button>
        {filtrando && (
          <Button asChild variant="ghost" size="sm">
            <Link href={mostrarArquivados ? "/emporio/produtos?arquivados=1" : "/emporio/produtos"}>Limpar busca</Link>
          </Button>
        )}
      </div>

      {produtos.length === 0 ? (
        <EmptyState titulo={filtrando ? "Nenhum produto encontrado" : "Nenhum produto no Empório"}>
          {filtrando
            ? "Nenhum produto bate com a busca. Tente outro nome, código ou espécie."
            : podeEscrever
              ? "Cadastre um produto novo ou use um que já existe na fazenda."
              : "Peça a um operador ou administrador para cadastrar os produtos."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Unidade-base</TableHead>
              <TableHead>Apresentações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-texto">
                  <Link href={`/emporio/produtos/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  {p.archived_at && (
                    <Badge variant="gray" className="ml-2">
                      Arquivado
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{p.brand ?? "-"}</TableCell>
                <TableCell>{p.internal_code ?? "-"}</TableCell>
                <TableCell>{p.category_name}</TableCell>
                <TableCell>{nomeComConteudo(p.base_unit, p.content_qty, p.content_unit)}</TableCell>
                <TableCell>{qtdApresentacoes.get(p.id) ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {todos.length > 0 && <Paginacao page={fatia.pagina} perPage={porPagina} total={fatia.total} hrefDe={hrefDe} />}
    </div>
  );
}
