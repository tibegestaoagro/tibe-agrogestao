import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import { getBillingAccess } from "@/lib/billing-access";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import ProductForm from "@/components/estoque/product-form";
import StockMovementForm from "@/components/estoque/stock-movement-form";
import {
  ensureProductCategories,
  listProductCategories,
  listProductsWithBalance,
} from "@/lib/actions/products";
import { listStockMovements } from "@/lib/actions/stock-ledger";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Estoque de insumos (Módulo 31, §9 e §10).
 *
 * Todo número desta tela é SOMA de movimentações, nunca campo gravado. É a
 * mesma regra do saldo do rebanho, e é o que impede a tela mostrar um número
 * que o banco não sustenta.
 *
 * A tela responde "o que eu tenho, onde, e o que está acabando", nessa ordem.
 * O §2 do documento pede que a área não tenha aparência nem linguagem de
 * sistema contábil, então a coluna é "Tem hoje", não "Saldo atual".
 */

const TIPO_LABEL: Record<string, string> = {
  compra: "Comprei",
  venda: "Vendi",
  utilizacao: "Usei",
  ajuste: "Corrigi",
  permuta_entrada: "Entrou por permuta",
  permuta_saida: "Saiu por permuta",
};

export default async function EstoquePage(
  props: {
    searchParams: Promise<{ property_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const activePropertyId = await getActivePropertyId(db);
  const effectivePropertyId = searchParams.property_id ?? activePropertyId ?? undefined;

  /**
   * As 15 categorias do §9.1 nascem aqui, na primeira abertura da tela, mas
   * SO para quem pode escrever.
   *
   * Endurecer a rota `/api/v1/product-categories` nao bastou, e um revisor
   * mostrou por que: aquela rota nao e chamada por ninguem ainda, e quem semeia
   * de verdade e esta pagina. Sem esta condicao, um VISUALIZADOR gravava 15
   * linhas so de abrir a tela, e um tenant em `read_only` por atraso de
   * pagamento tambem, furando a promessa de que naquele estado nada e gravado
   * (o layout do dashboard so barra `blocked`).
   */
  const acesso = await getBillingAccess(user.tenant_id);
  if (writable && acesso === "full") await ensureProductCategories(db);

  const [produtos, produtosTodasFazendas, categorias, properties, { items: movimentos }] = await Promise.all([
    listProductsWithBalance(db, { property_id: effectivePropertyId }),
    /**
     * O painel de "usar ou corrigir" deixa TROCAR de fazenda, então precisa do
     * saldo de todas.
     *
     * Com a lista filtrada, o produtor que abria o painel com a Fazenda A no
     * seletor do topo, trocava para a B e digitava 2, ouvia "existem apenas 0
     * sacas disponíveis" para um estoque de 30 que o servidor teria aceitado.
     * A trava do §10.7 na tela vale para avisar antes, nunca para impedir o que
     * o servidor permite.
     */
    effectivePropertyId ? listProductsWithBalance(db) : Promise.resolve(null),
    listProductCategories(db),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    listStockMovements(
      db,
      effectivePropertyId ? { property_id: effectivePropertyId } : {},
      { limit: 20 },
    ),
  ]);

  const abaixoDoMinimo = produtos.filter((p) => p.abaixo_do_minimo);
  const comSaldo = produtos.filter((p) => p.saldo_total > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Estoque</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {produtos.length.toLocaleString("pt-BR")} produto(s) cadastrado(s), {comSaldo.length} com
            saldo
          </p>
        </div>
        {writable && (
          <div className="flex flex-wrap gap-2">
            {produtos.length > 0 && properties.length > 0 && (
              <StockMovementForm
                products={(produtosTodasFazendas ?? produtos).map((p) => ({
                  id: p.id,
                  name: p.name,
                  unit: p.unit,
                  saldo_por_fazenda: p.saldo_por_fazenda,
                }))}
                properties={properties.map((p) => ({ id: p.id, name: p.name }))}
                defaultPropertyId={effectivePropertyId ?? null}
              />
            )}
            <ProductForm categories={categorias} />
          </div>
        )}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cadastre uma fazenda antes de movimentar o estoque (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      {/*
        §10.8: o aviso vem antes da lista, porque é a única informação da tela
        que pede uma ação hoje. Enterrado no meio de 40 produtos, ele não seria
        visto por quem abriu a tela para outra coisa.
      */}
      {abaixoDoMinimo.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {abaixoDoMinimo.length === 1
              ? "1 produto precisa de reposição"
              : `${abaixoDoMinimo.length} produtos precisam de reposição`}
          </p>
          {/*
            "no limite" seria mentira para quem está em zero: o produto acabou,
            não está chegando perto. Os dois casos disparam o mesmo aviso, mas
            não são a mesma notícia para quem vai ao curral hoje.
          */}
          <p className="mt-1 text-sm text-amber-800">
            {abaixoDoMinimo
              .map((p) =>
                p.saldo_no_tenant === 0
                  ? `${p.name} (acabou)`
                  : `${p.name} (${descreverQuantidade(p.saldo_no_tenant, p.unit)}, mínimo ${descreverQuantidade(p.minimum_stock ?? 0, p.unit)})`,
              )
              .join(", ")}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            O que eu tenho
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tem hoje</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead>Onde fica</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-gray-500">
                  Nenhum produto cadastrado ainda. Cadastre o primeiro para começar a controlar o
                  estoque.
                </TableCell>
              </TableRow>
            )}
            {produtos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.name}
                  {p.brand && <span className="block text-xs text-gray-500">{p.brand}</span>}
                </TableCell>
                <TableCell className="text-gray-600">{p.category_name}</TableCell>
                <TableCell className="tabular-nums">
                  {descreverQuantidade(p.saldo_total, p.unit)}
                  {p.abaixo_do_minimo && (
                    <Badge variant="red" className="ml-2">
                      {p.saldo_no_tenant === 0 ? "acabou" : "acabando"}
                    </Badge>
                  )}
                  {/*
                    Filtrado por fazenda, o total do tenant vira contexto: zero
                    aqui com 50 na fazenda vizinha é uma notícia bem diferente
                    de zero em lugar nenhum, e é o segundo número que diz qual
                    das duas é.
                  */}
                  {p.saldo_no_tenant !== p.saldo_total && (
                    <span className="block text-xs text-gray-500">
                      {descreverQuantidade(p.saldo_no_tenant, p.unit)} somando as fazendas
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-gray-600">
                  {p.minimum_stock == null
                    ? "sem aviso"
                    : descreverQuantidade(p.minimum_stock, p.unit)}
                </TableCell>
                <TableCell className="text-gray-600">{p.storage_location ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            Últimas movimentações
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>O que aconteceu</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Quanto</TableHead>
              <TableHead>Para quê</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-gray-500">
                  Nenhuma movimentação registrada ainda.
                </TableCell>
              </TableRow>
            )}
            {movimentos.map((m) => {
              const cancelado = m.canceled_at != null;
              return (
                <TableRow key={m.id} className={cancelado ? "text-gray-400" : undefined}>
                  <TableCell>{new Date(m.occurred_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">
                    {TIPO_LABEL[m.movement_type] ?? m.movement_type}
                    {cancelado && <span className="block text-xs">cancelado</span>}
                  </TableCell>
                  <TableCell>{m.product_name}</TableCell>
                  {/*
                    O sinal vem do `delta`, calculado pelo livro-razão, e não de
                    uma segunda regra escrita aqui: duas fontes para o mesmo
                    sinal é como o ajuste para menos vira soma sem ninguém ver.
                  */}
                  <TableCell className="tabular-nums">
                    {/*
                      A saída precisa do sinal tanto quanto a entrada. Sem o
                      menos, "2,5 sacas" numa linha de uso ficava ao lado de
                      "+10 sacas" numa de compra, e as duas pareciam somar.
                    */}
                    {m.delta > 0 ? "+" : m.delta < 0 ? "-" : ""}
                    {descreverQuantidade(Math.abs(m.delta), m.unit)}
                    {m.movement_type === "ajuste" && m.corrected_balance != null && (
                      <span className="block text-xs text-gray-500">
                        de {descreverQuantidade(m.previous_balance ?? 0, m.unit)} para{" "}
                        {descreverQuantidade(m.corrected_balance, m.unit)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600">{m.purpose ?? m.notes ?? "-"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
