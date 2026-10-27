import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import {
  listarProdutosEmporioAction,
  listarCandidatosAction,
} from "@/lib/actions/emporio-catalogo";
import { ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { getBillingAccess } from "@/lib/billing-access";
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
import { ProdutoNovoForm, ProdutoDaFazendaForm } from "../_components/produto-novo-form";
import { UNIDADE_BASE_ROTULO } from "../_components/formato";

export default async function ProdutosEmporioPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { arquivados } = await searchParams;
  const mostrarArquivados = arquivados === "1";
  const podeEscrever = hasMinRole(user.role, "OPERADOR");

  const db = await getTenantDb();

  // As categorias nascem na primeira visita de quem escreve, como no Estoque:
  // sem elas o painel de "Novo produto" abriria com a lista vazia.
  if (podeEscrever && (await getBillingAccess(user.tenant_id)) === "full") {
    await ensureProductCategories(db);
  }

  const [res, candidatosRes, categorias, apresentacoes] = await Promise.all([
    listarProdutosEmporioAction(db, user, { incluir_arquivados: mostrarArquivados }),
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
            <ProdutoNovoForm categorias={categorias} />
          </div>
        )}
      </header>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={mostrarArquivados ? "/emporio/produtos" : "/emporio/produtos?arquivados=1"}>
            {mostrarArquivados ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Link>
        </Button>
      </div>

      {produtos.length === 0 ? (
        <EmptyState titulo="Nenhum produto no Empório">
          {podeEscrever
            ? "Cadastre um produto novo ou use um que já existe na fazenda."
            : "Peça a um operador ou administrador para cadastrar os produtos."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
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
                <TableCell>{p.category_name}</TableCell>
                <TableCell>{UNIDADE_BASE_ROTULO[p.base_unit] ?? p.base_unit}</TableCell>
                <TableCell>{qtdApresentacoes.get(p.id) ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
