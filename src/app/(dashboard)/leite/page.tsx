import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { getActivePropertyId } from "@/lib/active-property";
import { canWrite } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import ProductionForm from "@/components/leite/production-form";
import LactationForm from "@/components/leite/lactation-form";
import GroupList from "@/components/leite/group-list";
import HistoryList from "@/components/leite/history-list";
import { litros } from "@/components/leite/labels";
import { listMilkGroups } from "@/lib/actions/milk-groups";
import { listLactationEntries } from "@/lib/actions/milk-lactation";
import { getResumoDoLeite, listMilkProduction } from "@/lib/actions/milk-production";

/**
 * Área Leite, fase 1 (Módulo 32, §4 a §11). Ver
 * docs/specs/module-32-area-leite.md.
 *
 * A tela mostra SÓ o que existe: o bloco "Hoje" do §34 e o histórico do §11.
 * Armazenamento (tanque, ponto de coleta, leite de terceiros) é a fase 2, e
 * dinheiro (venda, comprador, a receber) é a fase 3. Cartão vazio prometendo
 * um número que ninguém pode preencher é pior que cartão ausente.
 *
 * O resumo é POR FAZENDA porque a contagem de vacas e a média por vaca só
 * existem por fazenda (decisão 4.2 da spec): a fazenda ativa vem do seletor do
 * topo, e sem escolha vale a primeira.
 */

/** Um número que ainda não existe é traço, nunca zero: zero é uma afirmação. */
function ouTraco(valor: number | null, formatar: (n: number) => string): string {
  return valor === null ? "-" : formatar(valor);
}

export default async function LeitePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const [properties, pastures, grupos] = await Promise.all([
    db.property.findMany({
      where: { archived_at: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.pasture.findMany({
      where: { archived_at: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, property_id: true },
    }),
    listMilkGroups(db, { include_archived: true }),
  ]);

  if (properties.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-texto">Leite</h1>
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre uma fazenda antes de usar a Área Leite (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      </div>
    );
  }

  const ativa = await getActivePropertyId(db);
  const propertyId = ativa ?? properties[0].id;
  const nomeDaFazenda = properties.find((p) => p.id === propertyId)?.name ?? "";

  const [resumo, producoes, lactacoes] = await Promise.all([
    getResumoDoLeite(db, propertyId),
    listMilkProduction(db, { property_id: propertyId, limit: 15 }),
    listLactationEntries(db, { property_id: propertyId, limit: 15 }),
  ]);

  const gruposAtivos = grupos.filter((g) => g.archived_at === null);
  const nomeDoLote = Object.fromEntries(grupos.map((g) => [g.id, g.name]));

  const formProps = {
    properties,
    groups: gruposAtivos.map((g) => ({ id: g.id, name: g.name, property_id: g.property_id })),
    defaultPropertyId: propertyId,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Leite</h1>
          <p className="text-sm text-texto-secundario">{nomeDaFazenda}</p>
        </div>
        {writable && (
          <div className="flex flex-wrap gap-2">
            <LactationForm {...formProps} pastures={pastures} />
            <ProductionForm {...formProps} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {(
          [
            [
              "Vacas em lactação",
              ouTraco(resumo.hoje.vacas_em_lactacao, (n) => n.toLocaleString("pt-BR")),
            ],
            ["Produção de hoje", litros(resumo.hoje.litros)],
            [
              "Média por vaca hoje",
              ouTraco(resumo.hoje.media_por_vaca, (n) => `${litros(n)}/vaca`),
            ],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-borda bg-superficie p-4">
            <p className="text-xs text-texto-discreto">{rotulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-texto">{valor}</p>
          </div>
        ))}
      </div>

      {resumo.hoje.vacas_em_lactacao === null && (
        <p className="rounded-md bg-info-suave px-4 py-3 text-sm text-info-tinta">
          O TIBÉ ainda não sabe quantas vacas estão em lactação nesta fazenda, então não calcula
          a média por vaca. Use &quot;Atualizar lactação&quot; para informar.
        </p>
      )}

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Histórico de produção
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-px bg-borda sm:grid-cols-2 lg:grid-cols-3">
          {resumo.periodos.map((p) => (
            <div key={p.chave} className="bg-superficie p-4">
              <p className="text-xs text-texto-discreto">{p.rotulo}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-texto">
                {litros(p.litros)}
              </p>
              <p className="mt-1 text-xs text-texto-secundario">
                Média diária: {litros(p.media_diaria)}
              </p>
              <p className="text-xs text-texto-secundario">
                Por vaca:{" "}
                {p.media_por_vaca === null
                  ? "sem contagem de vacas no período"
                  : `${litros(p.media_por_vaca)}/vaca/dia`}
              </p>
              {p.media_por_vaca !== null && p.dias_com_contagem < p.dias && (
                <p className="text-xs text-texto-discreto">
                  {p.dias_com_contagem} de {p.dias} dias entraram na conta
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {producoes.length === 0 && lactacoes.length === 0 ? (
        <EmptyState titulo="Nada registrado nesta fazenda ainda.">
          Comece informando quantas vacas estão em lactação e quantos litros saíram hoje. A média
          por vaca aparece sozinha quando os dois existirem.
        </EmptyState>
      ) : (
        <HistoryList
          producoes={producoes.map((p) => ({
            id: p.id,
            liters: p.liters,
            shift: p.shift,
            recorded_at: p.recorded_at.toISOString(),
            group_id: p.group_id,
            notes: p.notes,
            cancelled: p.cancelled_at != null,
          }))}
          lactacoes={lactacoes.map((l) => ({
            id: l.id,
            type: l.type,
            quantity: l.quantity,
            recorded_at: l.recorded_at.toISOString(),
            group_id: l.group_id,
            notes: l.notes,
            cancelled: l.cancelled_at != null,
          }))}
          nomeDoLote={nomeDoLote}
          canWrite={writable}
        />
      )}

      <GroupList
        groups={grupos.map((g) => ({
          id: g.id,
          name: g.name,
          property_id: g.property_id,
          notes: g.notes,
          archived: g.archived_at != null,
        }))}
        properties={properties}
        canWrite={writable}
        defaultPropertyId={propertyId}
      />
    </div>
  );
}
