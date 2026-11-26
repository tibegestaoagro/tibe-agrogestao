import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigirUma, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia, somarDias } from "@/lib/emporio/cartao";
import { diaDoMes, inicioDoMesInstante, mesAtualEmBrasilia, somarMeses } from "@/lib/emporio/mes";
import {
  DIAS_DO_ORCAMENTO_VENCENDO,
  colunasDoInicio,
  ordenarAvisos,
  plural,
  reaisTexto,
  variacaoDoMes,
  type AvisoDoInicio,
  type NumerosDoDia,
} from "@/lib/emporio/inicio";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { precisaReporAction } from "@/lib/actions/emporio-estoque";
import { listarTurnosAction } from "@/lib/actions/emporio-turno";
import { lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { resumoDoAPagarAction } from "@/lib/actions/emporio-despesas";
import { listarBoletosAction } from "@/lib/actions/emporio-caixa";

const TRES_HORAS = 3 * 3_600_000;
const DIA_MS = 86_400_000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

type Lojas = Set<string> | null;
const filtroDeLojas = (lojas: Lojas) => (lojas ? { establishment_id: { in: [...lojas] } } : {});

async function somaDeVendas(db: TenantPrismaClient, lojas: Lojas, de: Date, ate: Date) {
  const vendas = await db.emporioSale.findMany({
    where: { ...filtroDeLojas(lojas), status: "concluida", sold_at: { gte: de, lt: ate } },
    select: { net_amount: true },
  });
  return { cent: vendas.reduce((s, v) => s + centavos(decToNum(v.net_amount) ?? 0), 0), quantidade: vendas.length };
}

/**
 * O Início do Empório: o que precisa de ação (avisos, cada um com a fonte que já
 * existe, filtrado por papel e pelas lojas que a pessoa alcança) e os números do
 * dia. Nada é gravado. O Caixa recebe 403; o Vendedor recebe os números e nenhum aviso.
 *
 * `opts.agora` fixa o relógio das contas feitas aqui (vendas, orçamento, caixa de
 * dia anterior). As leituras reaproveitadas (financeiro, A pagar, boletos) calculam o
 * próprio "hoje" pelo relógio real.
 */
export async function lerInicioAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { agora?: Date } = {},
): Promise<ActionResult<{ avisos: AvisoDoInicio[]; numeros: NumerosDoDia }>> {
  const neg = await exigirUma(db, ator, ["fora_do_caixa"], "ver o início");
  if (neg) return neg;

  const agora = opts?.agora instanceof Date && !Number.isNaN(opts.agora.getTime()) ? opts.agora : new Date();
  const papel = await papelDoEmporio(db, ator);
  const colunas = colunasDoInicio(papel);
  const visiveis = await lojasDoAtor(db, ator);

  const hoje = hojeEmBrasilia(agora); // meia-noite UTC do dia de São Paulo (data de calendário)
  const inicioHoje = new Date(hoje.getTime() + TRES_HORAS); // o mesmo dia como instante
  const fimHoje = new Date(inicioHoje.getTime() + DIA_MS);

  // Números do dia: vendas das lojas que a pessoa alcança.
  const mes = mesAtualEmBrasilia(agora);
  const inicioMes = inicioDoMesInstante(mes);
  const mesAnterior = somarMeses(mes, -1);
  const inicioMesAnterior = inicioDoMesInstante(mesAnterior);
  // O mesmo trecho do mês anterior: do dia 1 ao mesmo dia, limitado ao fim dele.
  const diaDeHoje = hoje.getUTCDate();
  const fimDoTrechoAnterior = new Date(
    Math.min(diaDoMes(mesAnterior, diaDeHoje).getTime() + TRES_HORAS + DIA_MS, inicioMes.getTime()),
  );
  const [vHoje, vMes, vAnterior] = await Promise.all([
    somaDeVendas(db, visiveis, inicioHoje, fimHoje),
    somaDeVendas(db, visiveis, inicioMes, fimHoje),
    somaDeVendas(db, visiveis, inicioMesAnterior, fimDoTrechoAnterior),
  ]);

  const avisos: AvisoDoInicio[] = [];
  let entra: NumerosDoDia["entra_hoje"] = null;
  let sai: NumerosDoDia["sai_hoje"] = null;

  if (colunas.gestor) {
    const lojas = await db.establishment.findMany({
      where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const minhas = lojas.filter((l) => pode(papel, "gestor_da_loja", l.id));
    const idsMinhas = new Set(minhas.map((l) => l.id));

    for (const l of minhas) {
      const r = await precisaReporAction(db, ator, { establishment_id: l.id });
      if (!r.ok) return r;
      if (r.data.length > 0) {
        avisos.push({
          chave: "estoque_baixo",
          coluna: "gestor",
          quantidade: r.data.length,
          valor: null,
          texto: `${plural(r.data.length, "produto", "produtos")} para repor em ${l.name}`,
          href: `/emporio/estoque?loja=${l.id}`,
          acao: "Ver",
        });
      }
    }

    if (idsMinhas.size > 0) {
      const ate = somarDias(hoje, DIAS_DO_ORCAMENTO_VENCENDO);
      const orcamentos = await db.emporioQuote.findMany({
        where: {
          establishment_id: { in: [...idsMinhas] },
          sale_id: null,
          canceled_at: null,
          valid_until: { gte: hoje, lte: ate },
        },
        select: { net_amount: true },
      });
      if (orcamentos.length > 0) {
        avisos.push({
          chave: "orcamento_vencendo",
          coluna: "gestor",
          quantidade: orcamentos.length,
          valor: orcamentos.reduce((s, o) => s + centavos(decToNum(o.net_amount) ?? 0), 0) / 100,
          texto: `${plural(orcamentos.length, "orçamento", "orçamentos")} em aberto perto de vencer`,
          href: "/emporio/orcamentos?situacao=aberto",
          acao: "Ver",
        });
      }

      const turnos = await listarTurnosAction(db, ator, { status: "open" });
      if (!turnos.ok) return turnos;
      for (const t of turnos.data) {
        if (!idsMinhas.has(t.establishment_id)) continue;
        if (new Date(t.opened_at).getTime() >= inicioHoje.getTime()) continue;
        avisos.push({
          chave: "caixa_de_ontem",
          coluna: "gestor",
          quantidade: 1,
          valor: null,
          texto: `${t.nome} de ${t.establishment_name} segue aberto desde um dia anterior`,
          href: "/emporio/caixa",
          acao: "Fechar",
        });
      }
    }
  }

  if (colunas.dinheiro) {
    const hojeFin = await lerResumoHojeAction(db, ator);
    if (!hojeFin.ok) return hojeFin;
    const h = hojeFin.data;

    if (h.overdue_fiado.customers > 0) {
      avisos.push({
        chave: "fiado_vencido",
        coluna: "dinheiro",
        quantidade: h.overdue_fiado.customers,
        valor: h.overdue_fiado.total,
        texto: `${plural(h.overdue_fiado.customers, "cliente", "clientes")} com fiado vencido`,
        href: "/emporio/financeiro/receber?ver=vencido",
        acao: "Cobrar",
      });
    }

    const apagar = await resumoDoAPagarAction(db, ator);
    if (!apagar.ok) return apagar;
    const { overdue, due_today: devidoHoje } = apagar.data.summary;
    const qtdPagar = overdue.count + devidoHoje.count;
    if (qtdPagar > 0) {
      avisos.push({
        chave: "pagar_hoje",
        coluna: "dinheiro",
        quantidade: qtdPagar,
        valor: (centavos(overdue.total) + centavos(devidoHoje.total)) / 100,
        texto: plural(qtdPagar, "conta a pagar vencida ou vencendo hoje", "contas a pagar vencidas ou vencendo hoje"),
        href: "/emporio/financeiro/pagar",
        acao: "Pagar",
      });
    }

    if (h.pending_approvals.count > 0) {
      avisos.push({
        chave: "aprovacao_pendente",
        coluna: "dinheiro",
        quantidade: h.pending_approvals.count,
        valor: h.pending_approvals.total,
        texto: `${plural(h.pending_approvals.count, "pedido", "pedidos")} de pagamento esperando aprovação`,
        href: "/emporio/financeiro/aprovacoes",
        acao: "Ver",
      });
    }

    const boletos = await listarBoletosAction(db, ator, { status: "vencido" });
    if (!boletos.ok) return boletos;
    const cheques = await db.emporioCheck.findMany({
      where: { status: { in: ["recebido", "depositado"] }, good_for: { lt: hoje }, ...filtroDeLojas(visiveis) },
      select: { amount: true },
    });
    const qtdBc = boletos.data.length + cheques.length;
    if (qtdBc > 0) {
      const cent =
        boletos.data.reduce((s, b) => s + centavos(b.amount), 0) +
        cheques.reduce((s, c) => s + centavos(decToNum(c.amount) ?? 0), 0);
      avisos.push({
        chave: "boleto_cheque_vencido",
        coluna: "dinheiro",
        quantidade: qtdBc,
        valor: cent / 100,
        texto: plural(qtdBc, "boleto ou cheque vencido sem baixa", "boletos e cheques vencidos sem baixa"),
        href: `/emporio/financeiro/receber?aba=${boletos.data.length > 0 ? "boletos" : "cheques"}&ver=vencido`,
        acao: "Ver",
      });
    }

    if (h.unreconciled.count > 0) {
      const conta = h.positions.find((p) => p.kind === "conta");
      avisos.push({
        chave: "conferir_banco",
        coluna: "dinheiro",
        quantidade: h.unreconciled.count,
        valor: h.unreconciled.total,
        texto: `${plural(h.unreconciled.count, "linha", "linhas")} da conta sem conferir com o banco`,
        href: conta
          ? `/emporio/caixa?lugar=conta:${conta.id}&carimbo=sem`
          : "/emporio/caixa",
        acao: "Conferir",
      });
    }

    // "Entra hoje" e "sai hoje": o sentido da aba Hoje do Financeiro (o que vence hoje).
    const r = h.receivables_due;
    const partes = [
      ["fiado", r.fiado.total],
      ["cheque", r.checks.total],
      ["boleto", r.boletos.total],
      ["cartão", r.cards.total],
    ] as const;
    entra = {
      total: partes.reduce((s, [, v]) => s + centavos(v), 0) / 100,
      detalhe: partes
        .filter(([, v]) => v > 0)
        .map(([nome, v]) => `${nome} ${reaisTexto(v)}`)
        .join(", "),
    };
    sai = { total: h.payables_due.total, quantidade: h.payables_due.count };
  }

  return ok({
    avisos: ordenarAvisos(avisos),
    numeros: {
      vendas_hoje: { total: vHoje.cent / 100, quantidade: vHoje.quantidade },
      vendas_mes: { total: vMes.cent / 100, variacao_pct: variacaoDoMes(vMes.cent, vAnterior.cent) },
      entra_hoje: entra,
      sai_hoje: sai,
    },
  });
}
