import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb, getActiveProfiles } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getBillingAccess } from "@/lib/billing-access";
import { decToNum } from "@/lib/serialize";
import { listarItensAction } from "@/lib/actions/shopping-items";
import { ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { STOCK_UNITS, descreverQuantidade } from "@/lib/stock/units";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import ItemForm from "@/components/lista-de-compra/item-form";
import ItemActions from "@/components/lista-de-compra/item-actions";

/**
 * Minha Lista de Compra (Módulo 36, §10 e §20).
 *
 * ⚠️ **A tela é deliberadamente pobre.** O §20 pede "extremamente simples", e o
 * §1 diz o que ela substitui: o papel, o caderno, a mensagem de WhatsApp para
 * si mesmo. Uma tabela com oito colunas e filtros não é isso. O que aparece é o
 * que o produtor lê andando pelo corredor da loja: o que comprar, quanto, e o
 * que é urgente.
 *
 * O agrupamento é por LOCAL de compra (§16), quando ele existe: é assim que a
 * ida à cidade acontece, uma parada por vez.
 */

const FINALIDADE: Record<string, string> = {
  rebanho: "Rebanho",
  pasto: "Pasto",
  confinamento: "Confinamento",
  leite: "Leite",
  maquina: "Máquina",
  cerca: "Cerca",
  fazenda_geral: "Fazenda em geral",
  outro: "Outro",
};

const SEM_LOCAL = "__sem_local__";

export default async function ListaDeCompraPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  /*
   * As categorias nascem aqui também, e não só no Estoque: o produtor pode
   * chegar por esta tela primeiro. Igual lá, só para quem pode escrever e com
   * a conta em dia, senão um VISUALIZADOR gravaria 25 linhas só de abrir.
   */
  const acesso = await getBillingAccess(user.tenant_id);
  if (writable && acesso === "full") await ensureProductCategories(db);

  const [itens, comprados, fazendas, categorias, produtos] = await Promise.all([
    listarItensAction(db),
    listarItensAction(db, { status: "comprado" }),
    db.property.findMany({
      where: { archived_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listProductCategories(db),
    db.product.findMany({
      where: { archived_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const unidades = STOCK_UNITS.map((u) => ({ id: u.id, label: u.label }));

  // §16: uma parada por vez. Quem não disse onde compra fica no fim, junto.
  const porLocal = new Map<string, typeof itens>();
  for (const item of itens) {
    const chave = item.place ?? SEM_LOCAL;
    porLocal.set(chave, [...(porLocal.get(chave) ?? []), item]);
  }
  const locais = [...porLocal.keys()].sort((a, b) => {
    if (a === SEM_LOCAL) return 1;
    if (b === SEM_LOCAL) return -1;
    return a.localeCompare(b, "pt-BR");
  });
  const temLocalDeVerdade = locais.some((l) => l !== SEM_LOCAL);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Minha Lista de Compra</h1>
          <p className="mt-0.5 text-sm text-texto-discreto">
            {itens.length === 0
              ? "Nada anotado por enquanto."
              : `${itens.length} ${itens.length === 1 ? "item para comprar" : "itens para comprar"}`}
          </p>
        </div>
        {writable && (
          <ItemForm fazendas={fazendas} categorias={categorias} unidades={unidades} />
        )}
      </div>

      {itens.length === 0 ? (
        <EmptyState titulo="Sua lista está vazia">
          Anote aqui o que não pode esquecer de comprar quando for à cidade. Só o nome já
          basta.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {locais.map((local) => (
            <div key={local} className="space-y-2">
              {temLocalDeVerdade && (
                <p className="text-sm font-medium text-texto-secundario">
                  {local === SEM_LOCAL ? "Sem local definido" : local}
                </p>
              )}
              <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
                {(porLocal.get(local) ?? []).map((item) => {
                  const quantidade = decToNum(item.quantity);
                  const linha =
                    quantidade != null && item.unit
                      ? `${descreverQuantidade(quantidade, item.unit)} de ${item.description}`
                      : quantidade != null
                        ? `${quantidade} ${item.description}`
                        : item.description;
                  const detalhes = [
                    item.property?.name,
                    item.purpose ? FINALIDADE[item.purpose] : null,
                    item.category?.name,
                    item.notes,
                  ].filter(Boolean);

                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-texto">{linha}</span>
                          {item.priority === "urgente" && <Badge variant="red">Urgente</Badge>}
                        </div>
                        {detalhes.length > 0 && (
                          <p className="mt-0.5 truncate text-xs text-texto-discreto">
                            {detalhes.join(" · ")}
                          </p>
                        )}
                      </div>
                      {writable && (
                        <ItemActions
                          item={{
                            id: item.id,
                            description: item.description,
                            product_id: item.product_id,
                            quantity: decToNum(item.quantity),
                            unit: item.unit,
                            property_id: item.property_id,
                          }}
                          fazendas={fazendas}
                          produtos={produtos}
                          categorias={categorias}
                          unidades={unidades}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* §18: o histórico existe, e fica fora do caminho principal. */}
      {comprados.length > 0 && (
        <details className="rounded-lg border border-borda bg-superficie p-4">
          <summary className="cursor-pointer text-sm font-medium text-texto-secundario">
            Já comprei ({comprados.length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {comprados.slice(0, 30).map((item) => (
              <li key={item.id} className="text-sm text-texto-discreto">
                {item.description}
                {item.resolved_at ? ` · ${item.resolved_at.toLocaleDateString("pt-BR")}` : ""}
                {item.negotiation_id ? " · compra registrada" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
