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
import StoragePanel from "@/components/leite/storage-panel";
import StorageForm from "@/components/leite/storage-form";
import WithdrawForm from "@/components/leite/withdraw-form";
import SiteForm from "@/components/leite/site-form";
import ChargeForm from "@/components/leite/charge-form";
import ChargeList from "@/components/leite/charge-list";
import { litros } from "@/components/leite/labels";
import { listMilkGroups } from "@/lib/actions/milk-groups";
import { listLactationEntries } from "@/lib/actions/milk-lactation";
import { getResumoDoLeite, listMilkProduction } from "@/lib/actions/milk-production";
import { listMilkSites } from "@/lib/actions/milk-sites";
import { getMilkPositions, getPhysicalVolumeBySite, listMilkMovements } from "@/lib/actions/milk-ledger";
import { getMilkStorageSummary, listMilkCharges } from "@/lib/actions/milk-storage";
import { listContacts } from "@/lib/actions/contacts";

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

  const [
    resumo,
    producoes,
    lactacoes,
    sites,
    posicoes,
    fisicoPorSite,
    movimentos,
    armazenamento,
    cobrancas,
    contatos,
  ] = await Promise.all([
    getResumoDoLeite(db, propertyId),
    listMilkProduction(db, { property_id: propertyId, limit: 15 }),
    listLactationEntries(db, { property_id: propertyId, limit: 15 }),
    // Os locais NÃO são filtrados por fazenda: um ponto de coleta de terceiros
    // não pertence a fazenda nenhuma (§16), e esconder os arquivados apagaria
    // da tela o leite que ainda está dentro deles.
    listMilkSites(db, { include_archived: true }),
    getMilkPositions(db),
    getPhysicalVolumeBySite(db),
    listMilkMovements(db, { limit: 20 }),
    getMilkStorageSummary(db),
    listMilkCharges(db, { limit: 20 }),
    listContacts(db),
  ]);

  const gruposAtivos = grupos.filter((g) => g.archived_at === null);
  const nomeDoLote = Object.fromEntries(grupos.map((g) => [g.id, g.name]));

  const nomeDoContato = new Map(contatos.map((c) => [c.id, c.name]));
  const nomeDoLocal = new Map(sites.map((s) => [s.id, s.name]));
  /** "Próprio" é o rótulo de `owner_id: null`, e não um contato chamado assim. */
  const nomeDoDono = (id: string | null) => (id ? (nomeDoContato.get(id) ?? "produtor removido") : "Próprio");

  const sitesParaTela = sites.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    counterparty_name: s.counterparty_name,
    capacity: s.capacity,
    liters: fisicoPorSite.get(s.id) ?? 0,
    acima_da_capacidade: s.capacity != null && (fisicoPorSite.get(s.id) ?? 0) > s.capacity,
    archived: s.archived_at != null,
  }));

  const posicoesParaTela = posicoes.map((p) => ({
    ...p,
    owner_name: nomeDoDono(p.owner_id),
  }));

  // O formulário de retirada só pode oferecer donos COM saldo, e agrupados por
  // local: oferecer quem não tem nada seria convidar a um lançamento que a
  // rota recusa.
  const posicoesPorLocal: Record<string, typeof posicoesParaTela> = {};
  for (const p of posicoesParaTela) {
    posicoesPorLocal[p.site_id] = [...(posicoesPorLocal[p.site_id] ?? []), p];
  }

  const sitesAtivos = sitesParaTela.filter((s) => !s.archived);
  const contatosParaTela = contatos.map((c) => ({ id: c.id, name: c.name }));

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

      {/* §34, bloco "Armazenamento": os quatro números que o documento pede,
          separando o que é meu do que é dos outros (§18). O físico total é a
          soma, e existe porque é ele que responde "cabe mais leite?". */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["Meu leite no tanque", armazenamento.proprio_em_tanque],
            ["Meu leite em ponto de coleta", armazenamento.proprio_em_ponto_de_coleta],
            ["Leite de terceiros comigo", armazenamento.de_terceiros],
            ["Volume físico total", armazenamento.fisico_total],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-borda bg-superficie p-4">
            <p className="text-xs text-texto-discreto">{rotulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-texto">{litros(valor)}</p>
          </div>
        ))}
      </div>

      <StoragePanel
        sites={sitesParaTela}
        posicoes={posicoesParaTela}
        movimentos={movimentos.map((m) => ({
          id: m.id,
          movement_type: m.movement_type,
          liters: m.liters,
          occurred_at: m.occurred_at.toISOString(),
          from_site_name: m.from_site_id ? (nomeDoLocal.get(m.from_site_id) ?? null) : null,
          to_site_name: m.to_site_id ? (nomeDoLocal.get(m.to_site_id) ?? null) : null,
          owner_name: nomeDoDono(m.to_owner_id ?? m.from_owner_id),
          destination: m.destination,
          canceled: m.canceled_at != null,
        }))}
        canWrite={writable}
        acoes={
          <>
            <SiteForm properties={properties} defaultPropertyId={propertyId} />
            {sitesAtivos.some((s) => s.type === "proprio") && (
              <>
                <StorageForm sites={sitesAtivos} owners={contatosParaTela} />
                {posicoesParaTela.length > 0 && (
                  <WithdrawForm sites={sitesAtivos} posicoesPorLocal={posicoesPorLocal} />
                )}
              </>
            )}
          </>
        }
      />

      <ChargeList
        cobrancas={cobrancas.map((c) => ({
          id: c.id,
          owner_name: nomeDoContato.get(c.owner_id) ?? "produtor removido",
          type: c.type,
          amount: c.amount,
          occurred_at: c.occurred_at.toISOString(),
          period_label: c.period_label,
          canceled: c.canceled_at != null,
        }))}
        canWrite={writable}
        acao={
          contatosParaTela.length > 0 ? (
            <ChargeForm owners={contatosParaTela} sites={sitesAtivos} />
          ) : undefined
        }
      />

      {writable && contatosParaTela.length === 0 && (
        <p className="rounded-md bg-info-suave px-4 py-3 text-sm text-info-tinta">
          Para receber leite de outro produtor ou cobrar pelo ponto de coleta, cadastre o produtor
          primeiro em{" "}
          <Link href="/negociacoes" className="font-medium underline">
            Negociações
          </Link>
          . O nome vira o dono de um saldo, e por isso vem da lista de contatos, não digitado.
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
