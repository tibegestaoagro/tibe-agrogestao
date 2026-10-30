import Link from "next/link";
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

export default async function ProdutosEmporioPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string; q?: string; species?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { arquivados, q = "", species = "" } = await searchParams;
  const mostrarArquivados = arquivados === "1";
  const busca = q.trim();
  const filtrando = busca !== "" || species !== "";
  const linkSemArquivados = (arq: boolean) => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (species) params.set("species", species);
    if (arq) params.set("arquivados", "1");
    const texto = params.toString();
    return texto ? `/emporio/produtos?${texto}` : "/emporio/produtos";
  };

  const db = await getTenantDb();
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
  const produtos = res.ok ? res.data : [];
  const candidatos = candidatosRes && candidatosRes.ok ? candidatosRes.data : [];

  const qtdApresentacoes = new Map<string, number>();
  for (const a of apresentacoes) {
    qtdApresentacoes.set(a.emporio_product_id, (qtdApresentacoes.get(a.emporio_product_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Produtos</h1>
        </div>
        {podeEscrever && (
          <div className="flex flex-wrap gap-2">
            <ProdutoDaFazendaForm
              candidatos={candidatos.map((c) => ({ id: c.id, name: c.name, category_name: c.category_name }))}
            />
            <ProdutoNovoForm
              categorias={categorias}
              especiesLista={EMPORIO_SPECIES.map((e) => ({ id: e.id, label: e.label }))}
            />
          </div>
        )}
      </header>

      {/* Formulário comum (GET): a busca vive na URL e a página server relê. */}
      <form method="get" action="/emporio/produtos" className="grid gap-3 sm:max-w-2xl sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        {mostrarArquivados && <input type="hidden" name="arquivados" value="1" />}
        <div className="space-y-1">
          <Label htmlFor="busca-q">Buscar</Label>
          <Input id="busca-q" name="q" defaultValue={busca} placeholder="Nome, marca, fabricante ou código" />
        </div>
        <div className="space-y-1">
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
    </div>
  );
}
