import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import MovementForm from "@/components/rebanho/movement-form";
import MovementCancel from "@/components/rebanho/movement-cancel";
import { decToNum } from "@/lib/serialize";
import { getPeriodTotals, getPositions, listMovements } from "@/lib/actions/herd-ledger";
import { summarizePositions } from "@/lib/herd/summary";
import { findCategory } from "@/lib/herd/categories";

/**
 * Rebanho como livro-razão (Módulo 30, §11 e §12).
 *
 * A tela abre com o SALDO, que é sempre a soma das movimentações não
 * canceladas, nunca um número gravado. A tabela de lotes que ocupava esta
 * página virou a seção "Animais identificados", no fim, e só mostra registro
 * que tem brinco, peso ou vacinação: o §4 manda manter esses dados como anexo
 * opcional, e o §6 proíbe duas contagens de rebanho disputando a mesma tela.
 *
 * Nenhum somatório vem de rota nova: tudo é derivado das posições por
 * `summarizePositions`, função pura testada em `test:m32` contra os números do
 * exemplo do §12.
 */

const TIPO_LABEL: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  nascimento: "Nascimento",
  compra: "Compra",
  venda: "Venda",
  morte: "Morte",
  transferencia_pasto: "Mudança de pasto",
  transferencia_fazenda: "Mudança de fazenda",
  mudanca_categoria: "Mudança de categoria",
  ajuste: "Ajuste",
};

function nomeCategoria(id: string | null | undefined) {
  if (!id) return null;
  return findCategory(id)?.label ?? id;
}

export default async function RebanhoPage({
  searchParams,
}: {
  searchParams: { property_id?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const activePropertyId = await getActivePropertyId(db);
  const effectivePropertyId = searchParams.property_id ?? activePropertyId ?? undefined;

  const agora = new Date();
  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimDoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

  const [positions, periodo, historico, properties, pastures, identificados] = await Promise.all([
    // `owner: proprio` é o que faz "total geral" significar o rebanho DO
    // produtor: animal de terceiro na fazenda não entra na conta dele.
    getPositions(db, {
      owner: "proprio",
      ...(effectivePropertyId ? { property_id: effectivePropertyId } : {}),
    }),
    getPeriodTotals(db, inicioDoMes, fimDoMes, { property_id: effectivePropertyId }),
    listMovements(
      db,
      effectivePropertyId ? { property_id: effectivePropertyId } : {},
      { limit: 8 },
    ),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.pasture.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.animalBatch.findMany({
      where: {
        ...(effectivePropertyId ? { property_id: effectivePropertyId } : {}),
        OR: [
          { ear_tag: { not: null } },
          { average_weight: { not: null } },
          { vaccinations: { some: {} } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 20,
      include: {
        property: { select: { name: true } },
        category: { select: { name: true } },
        vaccinations: { orderBy: { applied_at: "desc" }, take: 1, select: { applied_at: true } },
      },
    }),
  ]);

  const resumo = summarizePositions(positions);
  const nomeFazenda = new Map(properties.map((p) => [p.id, p.name]));
  const nomePasto = new Map(pastures.map((p) => [p.id, p.name]));

  const lugar = (propertyId: string | null, pastureId: string | null) =>
    [
      propertyId ? nomeFazenda.get(propertyId) ?? "fazenda removida" : null,
      pastureId ? nomePasto.get(pastureId) ?? "pasto removido" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Rebanho</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Total geral: {resumo.total.toLocaleString("pt-BR")} animais
          </p>
        </div>
        {writable && properties.length > 0 && (
          <MovementForm
            properties={properties.map((p) => ({ id: p.id, name: p.name }))}
            pastures={pastures.map((p) => ({
              id: p.id,
              name: p.name,
              property_id: p.property_id,
            }))}
            defaultPropertyId={effectivePropertyId ?? null}
          />
        )}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cadastre uma fazenda antes de registrar o rebanho (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      {resumo.unknown_category_quantity > 0 && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {resumo.unknown_category_quantity} cabeça(s) estão em uma categoria que não
          existe mais na lista oficial. O total geral acima já as inclui, mas elas não
          aparecem em nenhuma linha por categoria.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {resumo.by_sex.map((bloco) => (
          <div key={bloco.sex} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                {bloco.label}
              </h2>
              <span className="text-lg font-semibold text-gray-900">
                {bloco.total.toLocaleString("pt-BR")}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {bloco.categories.map((linha) => (
                // Zero fica mais discreto que o resto, mas continua LEGÍVEL:
                // com o rebanho ainda vazio a lista inteira é zero, e um cinza
                // fraco demais faz a tela parecer desabilitada ou quebrada.
                <li key={linha.id} className="flex justify-between gap-3 text-sm">
                  <span className={linha.quantity === 0 ? "text-gray-500" : "text-gray-700"}>
                    {linha.label}
                  </span>
                  <span
                    className={
                      linha.quantity === 0
                        ? "tabular-nums text-gray-500"
                        : "tabular-nums font-medium text-gray-900"
                    }
                  >
                    {linha.quantity.toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            Movimentações do mês
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Nascimentos", periodo.nascimentos],
              ["Compras", periodo.compras],
              ["Vendas", periodo.vendas],
              ["Mortes", periodo.mortes],
            ].map(([rotulo, valor]) => (
              <div key={String(rotulo)}>
                <p className="text-xs text-gray-500">{rotulo}</p>
                <p className="text-lg font-semibold tabular-nums text-gray-900">
                  {Number(valor).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            Onde estão
          </h2>
          {resumo.by_property.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nenhum animal registrado ainda.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {resumo.by_property.map((linha) => (
                <li key={linha.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-700">
                    {nomeFazenda.get(linha.id) ?? "fazenda removida"}
                  </span>
                  <span className="tabular-nums font-medium text-gray-900">
                    {linha.quantity.toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
              {resumo.by_pasture.map((linha) => (
                <li
                  key={linha.id}
                  className="flex justify-between gap-3 pl-4 text-sm text-gray-500"
                >
                  <span>{nomePasto.get(linha.id) ?? "pasto removido"}</span>
                  <span className="tabular-nums">{linha.quantity.toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            Últimas movimentações
          </h2>
          <span className="text-xs text-gray-500">
            {historico.total.toLocaleString("pt-BR")} no total
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>O que</TableHead>
              <TableHead>Cabeças</TableHead>
              <TableHead>De</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                  Nenhuma movimentação registrada ainda.
                </TableCell>
              </TableRow>
            )}
            {historico.items.map((m) => {
              const cancelada = m.canceled_at != null;
              return (
                <TableRow key={m.id} className={cancelada ? "text-gray-400" : undefined}>
                  <TableCell>{m.occurred_at.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">
                    {TIPO_LABEL[m.movement_type] ?? m.movement_type}
                    {cancelada && (
                      <Badge variant="gray" className="ml-2">
                        Cancelada
                      </Badge>
                    )}
                    {cancelada && m.canceled_reason && (
                      <span className="block text-xs">{m.canceled_reason}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {m.quantity.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    {m.from ? (
                      <>
                        {nomeCategoria(m.from.category_id)}
                        <span className="block text-xs text-gray-500">
                          {lugar(m.from.property_id, m.from.pasture_id)}
                        </span>
                      </>
                    ) : (
                      "entrada"
                    )}
                  </TableCell>
                  <TableCell>
                    {m.to ? (
                      <>
                        {nomeCategoria(m.to.category_id)}
                        <span className="block text-xs text-gray-500">
                          {lugar(m.to.property_id, m.to.pasture_id)}
                        </span>
                      </>
                    ) : (
                      "saída"
                    )}
                  </TableCell>
                  <TableCell>{m.recorded_by?.name ?? "não informado"}</TableCell>
                  <TableCell>
                    {writable && !cancelada && (
                      <MovementCancel
                        movementId={m.id}
                        descricao={`${TIPO_LABEL[m.movement_type] ?? m.movement_type} de ${m.quantity} cabeça(s) em ${m.occurred_at.toLocaleDateString("pt-BR")}`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {identificados.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Animais identificados
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Registros com brinco, peso ou vacinação. A quantidade do rebanho vem do
              saldo acima, não desta lista.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brinco</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fazenda</TableHead>
                <TableHead>Peso médio</TableHead>
                <TableHead>Última vacinação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {identificados.map((b) => {
                const peso = decToNum(b.average_weight);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link href={`/rebanho/${b.id}`} className="text-tibe-dark hover:underline">
                        {b.ear_tag ?? "sem brinco"}
                      </Link>
                    </TableCell>
                    <TableCell>{b.category?.name ?? "não informada"}</TableCell>
                    <TableCell>{b.property?.name ?? "não informada"}</TableCell>
                    <TableCell>{peso != null ? `${peso} kg` : "sem valor"}</TableCell>
                    <TableCell>
                      {b.vaccinations[0]
                        ? b.vaccinations[0].applied_at.toLocaleDateString("pt-BR")
                        : "sem data"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
