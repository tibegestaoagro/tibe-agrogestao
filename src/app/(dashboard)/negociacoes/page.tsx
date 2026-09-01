import Link from "next/link";
import { redirect } from "next/navigation";
import type { NegotiationType } from "@/generated/prisma/client";
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
import NegotiationForm from "@/components/negociacoes/negotiation-form";
import NegotiationCancel from "@/components/negociacoes/negotiation-cancel";
import EventForm from "@/components/negociacoes/event-form";
import EventCloseForm from "@/components/negociacoes/event-close-form";
import BarterForm from "@/components/negociacoes/barter-form";
import { listNegotiations, getOpenTotals, situacaoLabel } from "@/lib/actions/negotiations";
import { listStays } from "@/lib/actions/herd-stays";
import { findCategory } from "@/lib/herd/categories";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Área Negociações (Módulo 31, §19).
 *
 * A tela responde as perguntas do §2 na ordem em que o produtor as faz: o que
 * comprei, o que vendi, com quem, quanto ainda tenho a pagar e a receber. E
 * segue o §2 na forma: "a área não deverá ter aparência ou linguagem de um
 * sistema contábil".
 *
 * Todos os números aqui são SOMA dos filhos, nunca campo gravado: é a mesma
 * regra do saldo do rebanho, e é o que impede a tela mostrar um número que o
 * banco não sustenta.
 */

/**
 * `Record<NegotiationType, string>` e NÃO `Record<string, string>`.
 *
 * Era `Record<string, ...>` até 2026-09-02, e o tipo novo `venda_leite` teria
 * aparecido CRU na tela sem o `tsc` reclamar: é a armadilha registrada em
 * docs/conhecimento/record-string-e-onde-o-enum-cresce-sem-avisar.md, que já
 * custou três defeitos de tela no confinamento.
 */
const TIPO_LABEL: Record<NegotiationType, string> = {
  compra_gado: "Comprei gado",
  venda_gado: "Vendi gado",
  compra_produto: "Comprei produtos",
  venda_produto: "Vendi produtos",
  permuta: "Permuta",
  evento: "Remessa para evento",
  venda_leite: "Vendi leite",
};


function reais(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Um lado da permuta, em uma frase.
 *
 * Lê os FILHOS, nunca um campo de item: é a decisão 6 da spec da missão 4. O
 * texto só entra quando o lado é serviço ou outro, que são os únicos sem filho
 * para ler. Uma máquina não aparece aqui porque ela não é filha da negociação
 * por movimentação, e sim pelo vínculo em `Machine`: a linha diz "uma máquina"
 * e o detalhe fica em Máquinas.
 */
function resumoDoLado(
  n: {
    movimentos: { movement_type: string; quantity: number; category_id: string | null }[];
    produtos: { quantity: number; unit: string; product_name: string; movement_type: string }[];
  },
  tipo: "permuta_saida" | "permuta_entrada",
  texto: string | null,
): string {
  if (texto) return texto;

  const animaisDoLado = n.movimentos.filter((m) => m.movement_type === tipo);
  if (animaisDoLado.length > 0) {
    const cabecas = animaisDoLado.reduce((s, m) => s + m.quantity, 0);
    const categorias = Array.from(
      new Set(
        animaisDoLado
          .map((m) => (m.category_id ? findCategory(m.category_id)?.label : null))
          .filter(Boolean),
      ),
    ).join(", ");
    return `${cabecas.toLocaleString("pt-BR")} ${categorias || "cabeças"}`;
  }

  // O tipo do movimento de ESTOQUE tem os mesmos nomes do rebanho, então o
  // mesmo filtro serve: sem ele, uma permuta de produto por máquina mostraria
  // o produto nos dois lados.
  const produtosDoLado = n.produtos.filter((p) => p.movement_type === tipo);
  if (produtosDoLado.length > 0) {
    return produtosDoLado
      .map((p) => `${descreverQuantidade(p.quantity, p.unit)} de ${p.product_name}`)
      .join(", ");
  }

  // Sobrou a máquina, que não é filha por movimentação e sim pelo vínculo em
  // `Machine`. O detalhe dela fica em Máquinas.
  return "uma máquina";
}

export default async function NegociacoesPage(
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

  const [
    { items, total },
    totais,
    properties,
    contacts,
    pastures,
    machines,
    produtos,
    remessas,
  ] = await Promise.all([
    listNegotiations(
      db,
      effectivePropertyId ? { property_id: effectivePropertyId } : {},
      { limit: 30 },
    ),
    getOpenTotals(db, effectivePropertyId ? { property_id: effectivePropertyId } : {}),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.contact.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.pasture.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    // Só as máquinas que ainda são do produtor: uma já negociada ou vendida
    // não pode ser entregue de novo, e oferecê-la seria convidar a recusa.
    db.machine.findMany({
      where: { status: { notIn: ["sold", "negociada"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: { archived_at: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
    // As remessas ainda ABERTAS, para a linha mostrar quantas cabeças estão no
    // evento e oferecer o encerramento. "Aberta" é saldo maior que zero,
    // derivado das movimentações: não existe campo dizendo isso.
    listStays(db, { type: "evento", apenas_abertas: true }),
  ]);

  const remessaPorNegociacao = new Map(
    (remessas.ok ? remessas.data : [])
      .filter((e) => e.negotiation_id)
      .map((e) => [e.negotiation_id!, e]),
  );

  // §19: "valores a pagar" e "valores a receber", de TODAS as negociações
  // vivas, não só das 30 que a lista abaixo mostra. Ver getOpenTotals.
  const { aPagar, aReceber } = totais;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Negociações</h1>
          <p className="mt-0.5 text-sm text-texto-discreto">
            {total.toLocaleString("pt-BR")} negócio(s) registrado(s)
          </p>
        </div>
        {writable && properties.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <EventForm
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              pastures={pastures.map((p) => ({
                id: p.id,
                name: p.name,
                property_id: p.property_id,
              }))}
              defaultPropertyId={effectivePropertyId ?? null}
            />
            <BarterForm
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              pastures={pastures.map((p) => ({
                id: p.id,
                name: p.name,
                property_id: p.property_id,
              }))}
              machines={machines}
              produtos={produtos}
              defaultPropertyId={effectivePropertyId ?? null}
            />
            <NegotiationForm
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
              defaultPropertyId={effectivePropertyId ?? null}
            />
          </div>
        )}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre uma fazenda antes de registrar negócios (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Ainda tenho a pagar
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-texto">
            {reais(aPagar)}
          </p>
        </div>
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Ainda tenho a receber
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-texto">
            {reais(aReceber)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Negócios recentes
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>O que</TableHead>
              <TableHead>O quê</TableHead>
              <TableHead>Com quem</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-texto-discreto">
                  Nenhum negócio registrado ainda.
                </TableCell>
              </TableRow>
            )}
            {items.map((n) => {
              const cancelada = n.canceled_at != null;
              // A remessa de evento tem movimentação de IDA e de VOLTA na
              // mesma negociação (envio, venda, retorno), então somar todas
              // contava as mesmas cabeças três vezes: uma remessa de 20
              // encerrada aparecia como 40. Aqui conta só o envio, que é
              // quantas cabeças o negócio moveu de fato.
              const animais =
                n.type === "evento"
                  ? n.movimentos
                      .filter((m) => m.movement_type === "envio_evento")
                      .reduce((s, m) => s + m.quantity, 0)
                  : n.movimentos.reduce((s, m) => s + m.quantity, 0);
              // `recebe_dinheiro`, nunca `ehVenda(n.type)`: numa PERMUTA a
              // direção depende da diferença, não do tipo, e chamar `ehVenda`
              // aqui faria a linha dizer "A pagar" numa troca em que o
              // produtor recebeu.
              const venda = n.recebe_dinheiro;
              // A remessa aberta é a única linha em que ainda não há valor
              // nenhum, e é assim de propósito: o §17.8 proíbe receita antes
              // da confirmação. A coluna do valor mostra onde o gado está.
              const remessaAberta = remessaPorNegociacao.get(n.id);
              return (
                <TableRow key={n.id} className={cancelada ? "text-texto-discreto" : undefined}>
                  <TableCell>{n.occurred_at.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">
                    {TIPO_LABEL[n.type] ?? n.type}
                    {cancelada && n.canceled_reason && (
                      <span className="block text-xs">{n.canceled_reason}</span>
                    )}
                  </TableCell>
                  {/*
                    Gado e produto na mesma coluna, cada um contado do seu jeito:
                    animal por cabeça e categoria, produto pela unidade dele. Sem
                    isso, "Comprei produtos" aparecia com um traço, e o produtor
                    não via o que tinha comprado.
                  */}
                  <TableCell>
                    {/*
                      A PERMUTA tem os dois lados na mesma negociação, então
                      somar todos os movimentos contaria uma troca de 15 por 10
                      como 25. Aqui cada lado aparece por si, que é como o
                      produtor pensa a troca.
                    */}
                    {n.type === "permuta" ? (
                      <>
                        <span className="block text-xs">
                          entregou {resumoDoLado(n, "permuta_saida", n.barter_out_note)}
                        </span>
                        <span className="block text-xs">
                          recebeu {resumoDoLado(n, "permuta_entrada", n.barter_in_note)}
                        </span>
                      </>
                    ) : (
                      animais > 0 && (
                      <>
                        {animais.toLocaleString("pt-BR")}
                        <span className="block text-xs text-texto-discreto">
                          {/* Sem o `Set`, a remessa encerrada repetia "Fêmea -
                              acima de 36 meses" uma vez por movimentação. */}
                          {Array.from(
                            new Set(
                              n.movimentos
                                .map((m) =>
                                  m.category_id ? findCategory(m.category_id)?.label : null,
                                )
                                .filter(Boolean),
                            ),
                          ).join(", ") || ""}
                        </span>
                      </>
                      )
                    )}
                    {n.type !== "permuta" && n.produtos.length > 0 && (
                      <span className="block text-xs text-texto-secundario">
                        {n.produtos
                          .map((p) => `${descreverQuantidade(p.quantity, p.unit)} de ${p.product_name}`)
                          .join(", ")}
                      </span>
                    )}
                    {n.type !== "permuta" && animais === 0 && n.produtos.length === 0 && "-"}
                  </TableCell>
                  <TableCell>{n.contact_name ?? "não informado"}</TableCell>
                  {/*
                    §15 pede os quatro números separados: valor principal,
                    custos adicionais, total da compra e líquido da venda. Antes
                    o valor dos custos em si não aparecia em lugar nenhum da
                    web, só o total já somado, então o produtor via a diferença
                    e não sabia de onde ela vinha.
                  */}
                  <TableCell className="tabular-nums">
                    {remessaAberta ? (
                      <span className="text-texto-secundario">
                        {remessaAberta.saldo_aberto.toLocaleString("pt-BR")} no evento
                        <span className="block text-xs">ainda sem venda</span>
                      </span>
                    ) : n.situacao === "sem_valor" ? (
                      // "R$ 0,00" lê como "valeu zero", e não é isso: não
                      // houve dinheiro nenhum. A situação ao lado já diz qual
                      // dos dois casos é.
                      <span className="text-texto-discreto">sem dinheiro</span>
                    ) : (
                      reais(n.totais.principal)
                    )}
                    {!remessaAberta && n.totais.custos > 0 && (
                      <span className="block text-xs text-texto-discreto">
                        {venda ? "menos" : "mais"} {reais(n.totais.custos)} de custos
                        <span className="block">
                          {venda
                            ? `líquido ${reais(n.totais.liquido)}`
                            : `total ${reais(n.totais.total)}`}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        cancelada ? "gray" : n.situacao === "paga" ? "green" : n.situacao === "vencida" ? "red" : "gray"
                      }
                    >
                      {/* O terceiro argumento é o que faz a troca seca dizer
                          "Troca sem dinheiro" em vez de "Sem venda". */}
                      {situacaoLabel(n.situacao, venda, n.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    {writable && !cancelada && remessaAberta && (
                      <EventCloseForm
                        negotiationId={n.id}
                        saldoAberto={remessaAberta.saldo_aberto}
                        descricao={`${remessaAberta.location_name ?? "Evento"}, ${remessaAberta.saldo_aberto.toLocaleString("pt-BR")} cabeça(s)`}
                      />
                    )}
                    {writable && !cancelada && (
                      <NegotiationCancel
                        negotiationId={n.id}
                        venda={venda}
                        valorRecebido={n.lancamentos
                          .filter((l) => l.status === "paid" && l.entry_type === "income")
                          .reduce((s, l) => s + l.amount, 0)}
                        valorPago={n.lancamentos
                          .filter((l) => l.status === "paid" && l.entry_type === "expense")
                          .reduce((s, l) => s + l.amount, 0)}
                        descricao={`${TIPO_LABEL[n.type] ?? n.type}, ${reais(n.totais.principal)}, em ${n.occurred_at.toLocaleDateString("pt-BR")}`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
