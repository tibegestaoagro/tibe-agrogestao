import Link from "next/link";
import { redirect } from "next/navigation";
import type { HerdMovementType } from "@/generated/prisma/client";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import SiteList from "@/components/confinamento/site-list";
import StayOpenForm from "@/components/confinamento/stay-open-form";
import LotFeedingForm from "@/components/confinamento/lot-feeding-form";
import LotCloseForm from "@/components/confinamento/lot-close-form";
import { TIPO_ESTADIA_LABEL, CHARGE_LABEL, MOVIMENTO_LABEL } from "@/components/confinamento/labels";
import {
  listConfinementSites,
  listConfinementLots,
  getConfinementLotSummary,
  type ConfinementLotSummary,
} from "@/lib/actions/confinement";
import { listProductsWithBalance } from "@/lib/actions/products";
import { decToNum } from "@/lib/serialize";
import { findCategory } from "@/lib/herd/categories";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Confinamento: fase 3 do Módulo 30 (§25 do documento do cliente). "Agora",
 * lotes ativos e últimas movimentações, sobre o mesmo livro-razão do
 * Rebanho: princípio do §3, "o animal continua pertencendo ao produtor",
 * exatamente o que a fase 2 já entregou.
 *
 * As rotas de listagem (`GET /confinement/stays` e `/stays/:id`) não devolvem
 * categoria nem quantidade de entrada: essa informação só existe no
 * `HerdMovement` de abertura do lote (`envio_confinamento`/`envio_boitel`), e
 * não em `ConfinementLotListItem`/`ConfinementLotSummary`. Por isso esta
 * página lê `HerdMovement`/`StockMovement` direto pelo `db` (mesmo padrão de
 * `db.animalBatch.findMany` em `/rebanho`), em vez de inventar o dado ou
 * deixar a categoria de fora da tela.
 */

/** Os movimentos que abrem um lote: usados para achar a entrada de cada um. */
const TIPOS_MOVIMENTO_ENTRADA: HerdMovementType[] = ["envio_confinamento", "envio_boitel"];

export default async function ConfinamentoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const [properties, pastures, sites, allLots, produtos] = await Promise.all([
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.pasture.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    listConfinementSites(db),
    listConfinementLots(db, {}),
    listProductsWithBalance(db, {}),
  ]);

  const lotesAbertos = allLots.filter((l) => l.aberta);
  const lotIds = allLots.map((l) => l.id);
  const lotesAbertosIds = lotesAbertos.map((l) => l.id);

  const [resumos, movimentosDoConfinamento, alimentacoes, saidasPorLote, entradasDosLotesAbertos] =
    await Promise.all([
    Promise.all(lotesAbertos.map((l) => getConfinementLotSummary(db, l.id))),
    lotIds.length > 0
      ? db.herdMovement.findMany({
          where: { stay_id: { in: lotIds } },
          orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
          take: 30,
          select: {
            id: true,
            movement_type: true,
            quantity: true,
            to_category_id: true,
            stay_id: true,
            occurred_at: true,
            canceled_at: true,
          },
        })
      : [],
    lotIds.length > 0
      ? db.stockMovement.findMany({
          where: { stay_id: { in: lotIds }, movement_type: "utilizacao", canceled_at: null },
          orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
          take: 15,
          include: { product: { select: { name: true, unit: true } } },
        })
      : [],
    // Os contadores do §24 ("quantidade de saídas", "mortes") precisam de
    // TODOS os movimentos de saída de cada lote, não só os 30 mais recentes do
    // feed acima (que é de todos os lotes somados). `LotCloseForm` só oferece
    // três destinos de encerramento (`retorno_estadia`, `venda`, `morte`).
    // Os dois primeiros viram "saídas"; `morte` vira a coluna própria, sem
    // entrar nas saídas (ver o laço que monta os dois mapas, abaixo).
    lotIds.length > 0
      ? db.herdMovement.groupBy({
          by: ["stay_id", "movement_type"],
          where: {
            stay_id: { in: lotIds },
            canceled_at: null,
            movement_type: { in: ["retorno_estadia", "venda", "morte"] },
          },
          _sum: { quantity: true },
        })
      : [],
    // Categoria e quantidade de entrada (§24) precisam do movimento que abriu
    // CADA lote ativo, não só dos 30 mais recentes do feed acima (que somam
    // TODOS os lotes, ativos e encerrados): com dez lotes movimentados, a
    // entrada de um lote antigo cai fora da janela e a coluna "Categoria"
    // passa a mentir "não informada" para um lote que tem categoria gravada.
    // Mesmo risco que a tarefa anterior corrigiu para saídas e mortes, acima.
    lotesAbertosIds.length > 0
      ? db.herdMovement.findMany({
          where: {
            stay_id: { in: lotesAbertosIds },
            canceled_at: null,
            movement_type: { in: TIPOS_MOVIMENTO_ENTRADA },
          },
          select: { stay_id: true, to_category_id: true, quantity: true },
        })
      : [],
  ]);

  // As duas colunas do §24 são DISJUNTAS: "Saídas" conta quem saiu vivo
  // (voltou ao pasto ou foi vendido) e "Mortes" conta o resto. Até 31/08
  // "Saídas" incluía as mortes, e as mesmas duas cabeças apareciam nos dois
  // números: um lote de 40 com 2 mortes e nada mais lia "Saídas 2 / Mortes
  // 2", e o produtor somava quatro. Assim as duas colunas somam exatamente o
  // que deixou o lote.
  const saidasPorLoteId = new Map<string, number>();
  const mortesPorLoteId = new Map<string, number>();
  for (const linha of saidasPorLote) {
    if (!linha.stay_id) continue;
    const soma = linha._sum.quantity ?? 0;
    const destino = linha.movement_type === "morte" ? mortesPorLoteId : saidasPorLoteId;
    destino.set(linha.stay_id, (destino.get(linha.stay_id) ?? 0) + soma);
  }

  const resumoPorId = new Map<string, ConfinementLotSummary>();
  for (const r of resumos) {
    if (r.ok) resumoPorId.set(r.data.id, r.data);
  }

  // Categoria e quantidade de entrada vêm do movimento que abriu o lote: ver
  // comentário do topo do arquivo e o comentário da consulta acima.
  const entradaPorLote = new Map<string, { category_id: string | null; quantity: number }>();
  for (const m of entradasDosLotesAbertos) {
    if (!m.stay_id) continue;
    entradaPorLote.set(m.stay_id, { category_id: m.to_category_id, quantity: m.quantity });
  }

  const lotesById = new Map(allLots.map((l) => [l.id, l]));
  const lotesAtivosPorSite: Record<string, number> = {};
  for (const l of lotesAbertos) {
    if (!l.confinement_site_id) continue;
    lotesAtivosPorSite[l.confinement_site_id] = (lotesAtivosPorSite[l.confinement_site_id] ?? 0) + 1;
  }

  const totalConfinados = lotesAbertos.reduce((s, l) => s + l.quantity, 0);
  const totalProprio = lotesAbertos
    .filter((l) => l.type === "confinamento")
    .reduce((s, l) => s + l.quantity, 0);
  const totalBoitel = lotesAbertos.filter((l) => l.type === "boitel").reduce((s, l) => s + l.quantity, 0);

  type Atividade = { id: string; occurred_at: Date; label: string; local: string; quantidade: string };
  const atividades: Atividade[] = [
    ...movimentosDoConfinamento
      .filter((m) => m.canceled_at === null)
      .map((m) => ({
        id: `mov-${m.id}`,
        occurred_at: m.occurred_at,
        label: MOVIMENTO_LABEL[m.movement_type] ?? m.movement_type,
        local: m.stay_id ? lotesById.get(m.stay_id)?.location_name ?? "não informado" : "não informado",
        quantidade: `${m.quantity.toLocaleString("pt-BR")} cabeça(s)`,
      })),
    ...alimentacoes.map((a) => ({
      id: `alim-${a.id}`,
      occurred_at: a.occurred_at,
      label: "Alimentação",
      local: a.stay_id ? lotesById.get(a.stay_id)?.location_name ?? "não informado" : "não informado",
      quantidade: `${descreverQuantidade(decToNum(a.quantity) ?? 0, a.product.unit)} de ${a.product.name}`,
    })),
  ]
    .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime())
    .slice(0, 10);

  const produtosParaAlimentar = produtos.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    saldo_por_fazenda: p.saldo_por_fazenda,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-texto">Confinamento</h1>
        {writable && sites.length > 0 && properties.length > 0 && (
          <StayOpenForm
            sites={sites.map((s) => ({ id: s.id, name: s.name, type: s.type, property_id: s.property_id }))}
            properties={properties.map((p) => ({ id: p.id, name: p.name }))}
            pastures={pastures.map((p) => ({ id: p.id, name: p.name, property_id: p.property_id }))}
            defaultPropertyId={properties[0]?.id ?? null}
          />
        )}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre uma fazenda antes de usar o confinamento (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      {writable && properties.length > 0 && sites.length === 0 && (
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre um confinamento abaixo antes de registrar a primeira entrada.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["Confinados agora", totalConfinados],
            ["Confinamento próprio", totalProprio],
            ["Boitel", totalBoitel],
            ["Lotes ativos", lotesAbertos.length],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-borda bg-superficie p-4">
            <p className="text-xs text-texto-discreto">{rotulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-texto">
              {valor.toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>

      <SiteList
        sites={sites.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          property_id: s.property_id,
          counterparty_name: s.counterparty_name,
          city: s.city,
          capacity: s.capacity,
        }))}
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        lotesAtivosPorSite={lotesAtivosPorSite}
        canWrite={writable}
      />

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Lotes ativos
          </h2>
          <span className="text-xs text-texto-discreto">
            {lotesAbertos.length.toLocaleString("pt-BR")} no total
          </span>
        </div>

        {lotesAbertos.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhum lote ativo agora.">
              Registre uma entrada para começar a acompanhar dias, alimentação e custo do
              confinamento.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Cobrança</TableHead>
                <TableHead>Saídas</TableHead>
                <TableHead>Mortes</TableHead>
                <TableHead>Alimentação</TableHead>
                <TableHead>Custo acumulado</TableHead>
                {writable && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotesAbertos.map((lote) => {
                const resumo = resumoPorId.get(lote.id);
                const entrada = entradaPorLote.get(lote.id);
                const categoria = entrada?.category_id
                  ? findCategory(entrada.category_id)?.label ?? entrada.category_id
                  : "não informada";
                return (
                  <TableRow key={lote.id}>
                    <TableCell className="font-medium">
                      {lote.location_name ?? "não informado"}
                      <Badge variant={lote.type === "boitel" ? "blue" : "green"} className="ml-2">
                        {TIPO_ESTADIA_LABEL[lote.type] ?? lote.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{categoria}</TableCell>
                    <TableCell className="tabular-nums">
                      {lote.quantity.toLocaleString("pt-BR")}
                      {entrada && entrada.quantity !== lote.quantity && (
                        <span className="block text-xs text-texto-discreto">
                          de {entrada.quantity.toLocaleString("pt-BR")} na entrada
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{lote.started_at.toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="tabular-nums">{lote.days_confined}</TableCell>
                    <TableCell>
                      {resumo?.charge_type
                        ? `${CHARGE_LABEL[resumo.charge_type] ?? resumo.charge_type}${
                            resumo.charge_value != null
                              ? `: ${resumo.charge_value.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}`
                              : ""
                          }`
                        : "não combinada"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {(saidasPorLoteId.get(lote.id) ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {(mortesPorLoteId.get(lote.id) ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {resumo && resumo.feeding.length > 0 ? (
                        <ul className="space-y-0.5">
                          {resumo.feeding.map((f) => (
                            <li key={f.product_id} className="text-xs text-texto-secundario">
                              {descreverQuantidade(f.quantity, f.unit)} de {f.product_name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-texto-discreto">nada registrado</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {(resumo?.financial_cost ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    {writable && (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <LotFeedingForm
                            stayId={lote.id}
                            propertyId={lote.property_id}
                            products={produtosParaAlimentar}
                          />
                          <LotCloseForm
                            stayId={lote.id}
                            saldoAberto={lote.quantity}
                            descricao={`${TIPO_ESTADIA_LABEL[lote.type] ?? lote.type} em ${
                              lote.location_name ?? "local não informado"
                            }, desde ${lote.started_at.toLocaleDateString("pt-BR")}.`}
                            pastures={pastures
                              .filter((p) => p.property_id === lote.property_id)
                              .map((p) => ({ id: p.id, name: p.name }))}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Últimas movimentações
          </h2>
        </div>
        {atividades.length === 0 ? (
          <div className="p-4">
            <EmptyState compacto titulo="Nenhuma movimentação registrada ainda." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>O que</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Quanto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atividades.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.occurred_at.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">{a.label}</TableCell>
                  <TableCell>{a.local}</TableCell>
                  <TableCell className="tabular-nums">{a.quantidade}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
