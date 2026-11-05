import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { diasAte, inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { isFeatureVisibleForUser } from "@/lib/features";
import { dinheiro } from "@/lib/emporio/historico";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
import { lojasSemGestor } from "@/lib/actions/emporio-equipe";
import { CATEGORIA_MERCADORIAS } from "@/lib/actions/emporio-compras";
import { JANELA_DE_PROXIMOS_DIAS, lerItensDoDia, type ItemDoDia } from "@/lib/actions/meu-dia";

/**
 * Meu Empório, F5: o Empório no Meu Dia (Módulo 39, Q108 a Q113).
 *
 * A fonte da fazenda (`lerItensDoDia`) não lê mais lançamento com loja. Quem
 * vê o Empório ganha estes itens por cima, e só ele: o WhatsApp continua
 * chamando `lerItensDoDia` sozinho. Nada é gravado aqui, é tudo leitura.
 */

const TRES_HORAS = 3 * 3_600_000;
const DIA_MS = 86_400_000;
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

type UsuarioDoDia = { id: string; tenant_id: string; role: Ator["role"] };

/**
 * "Vê o Empório": perfil `emporio` ativo e recurso visível para o usuário.
 * `isFeatureVisibleForUser` já confere o perfil quando a chave é `emporio`.
 */
export async function veEmporio(user: UsuarioDoDia): Promise<boolean> {
  return isFeatureVisibleForUser(user.tenant_id, user.id, "emporio");
}

/** As lojas do usuário: as do vínculo (Gestor, Vendedor) ou todas as não arquivadas (Dono, Gerente geral). */
async function lojasDoUsuario(db: TenantPrismaClient, ator: Ator): Promise<{ id: string; name: string }[]> {
  const visiveis = await lojasDoAtor(db, ator);
  return db.establishment.findMany({
    where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

function inicioDoDiaEmInstante(diaUtc: Date): Date {
  return new Date(diaUtc.getTime() + TRES_HORAS);
}

export async function itensDoEmporioNoDia(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { agora?: Date } = {},
): Promise<ItemDoDia[]> {
  const agora = opts.agora ?? new Date();
  const limite = new Date(agora.getTime() + (JANELA_DE_PROXIMOS_DIAS + 1) * DIA_MS);
  const lojas = await lojasDoUsuario(db, ator);
  if (lojas.length === 0) return [];
  const ids = lojas.map((l) => l.id);
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));
  const papel = await papelDoEmporio(db, ator);
  const ehAdmin = pode(papel, "gestor_da_loja");
  const itens: ItemDoDia[] = [];

  // --- emporio_pagar --------------------------------------------------------
  const contas = await db.financialEntry.findMany({
    where: {
      related_module: "emporio",
      entry_type: "expense",
      status: "pending",
      establishment_id: { in: ids },
      due_date: { lte: limite },
    },
    include: {
      contact: { select: { name: true } },
      payments: { select: { amount: true } },
      sale_variable_expense: { include: { rule: { select: { name: true } } } },
      fixed_occurrence: { include: { template: { select: { name: true } } } },
    },
  });
  for (const c of contas) {
    if (!c.due_date || !c.establishment_id) continue;
    const ehCompra = c.category === CATEGORIA_MERCADORIAS && !!c.related_id;
    const ehDespesa = !!c.sale_variable_expense || !!c.fixed_occurrence;
    // A tela de Despesas é do Gestor da loja para cima: o link nunca pode levar a um 403.
    if (!ehCompra && !(ehDespesa && ehAdmin)) continue;
    const pago = c.payments.reduce((s, p) => s + centavos(decToNum(p.amount) ?? 0), 0);
    const saldo = centavos(decToNum(c.amount) ?? 0) - pago;
    if (saldo <= 0) continue;
    const loja = nomeDaLoja.get(c.establishment_id) ?? "";
    const quem =
      c.contact?.name ??
      c.sale_variable_expense?.rule.name ??
      c.fixed_occurrence?.template.name ??
      c.category ??
      "conta";
    itens.push({
      chave: `emporio_pagar:${c.id}`,
      origem: "emporio_pagar",
      titulo: `Pagar ${quem} (${loja})`,
      data: c.due_date,
      horario: null,
      valor: saldo / 100,
      urgente: false,
      dias: diasAte(c.due_date, agora),
      fazenda: null,
      href: ehCompra ? "/emporio/compras" : "/emporio/despesas",
    });
  }

  // --- emporio_fiado --------------------------------------------------------
  const abertas = await entradasAbertas(db, {
    establishment_id: { in: ids },
    contact_id: { not: null },
    due_date: { not: null, lte: limite },
  });
  if (abertas.length > 0) {
    const contatos = await db.contact.findMany({
      where: { id: { in: [...new Set(abertas.map((e) => e.contact_id as string))] } },
      select: { id: true, name: true },
    });
    const nomeDoContato = new Map(contatos.map((c) => [c.id, c.name]));
    type Grupo = { contato: string; loja: string; vencido: boolean; total: number; data: Date };
    const grupos = new Map<string, Grupo>();
    for (const e of abertas) {
      if (!e.due_date || !e.contact_id || !e.establishment_id) continue;
      const vencido = diasAte(e.due_date, agora) < 0;
      const chave = `${e.contact_id}:${e.establishment_id}:${vencido ? "vencido" : "a_vencer"}`;
      const g = grupos.get(chave);
      if (!g) {
        grupos.set(chave, { contato: e.contact_id, loja: e.establishment_id, vencido, total: e.open_cent, data: e.due_date });
      } else {
        g.total += e.open_cent;
        // Vencido: o mais antigo. A vencer: o mais próximo. Nos dois casos, o menor.
        if (e.due_date.getTime() < g.data.getTime()) g.data = e.due_date;
      }
    }
    for (const [chave, g] of grupos) {
      const nome = nomeDoContato.get(g.contato);
      if (!nome) continue;
      itens.push({
        chave: `emporio_fiado:${chave}`,
        origem: "emporio_fiado",
        titulo: `Receber de ${nome} (fiado, ${nomeDaLoja.get(g.loja) ?? ""})`,
        data: g.data,
        horario: null,
        valor: g.total / 100,
        urgente: false,
        dias: diasAte(g.data, agora),
        fazenda: null,
        href: "/emporio/fiado",
      });
    }
  }

  // --- emporio_turno (entrega 2): turno aberto desde antes de hoje ----------
  // Substitui o aviso "caixa não conferido" (Q110): o turno que passa da
  // meia-noite continua valendo, e quem trabalha na loja é avisado.
  const naLoja = ids.filter((id) => pode(papel, "vendedor_da_loja", id));
  if (naLoja.length > 0) {
    const inicioDeHoje = inicioDoDiaEmInstante(inicioDoDiaEmSaoPaulo(agora));
    const antigos = await db.cashSession.findMany({
      where: { establishment_id: { in: naLoja }, open_register_id: { not: null }, opened_at: { lt: inicioDeHoje } },
      include: { cash_register: { select: { number: true } } },
      orderBy: { opened_at: "asc" },
    });
    for (const s of antigos) {
      const data = inicioDoDiaEmSaoPaulo(s.opened_at);
      itens.push({
        chave: `emporio_turno:${s.id}`,
        origem: "emporio_turno",
        titulo: `Caixa ${s.cash_register.number} da ${nomeDaLoja.get(s.establishment_id) ?? ""} aberto desde ${DIA_E_MES.format(s.opened_at)}`,
        data,
        horario: null,
        valor: null,
        urgente: false,
        dias: diasAte(data, agora),
        fazenda: null,
        href: "/emporio/caixa",
      });
    }
  }

  // --- emporio_entrega (entrega 2): dinheiro aguardando o gerente -----------
  const gerenciadas = ids.filter((id) => pode(papel, "gestor_da_loja", id));
  if (gerenciadas.length > 0) {
    const pendentes = await db.cashHandover.findMany({
      where: { establishment_id: { in: gerenciadas }, confirmed_at: null },
      select: { establishment_id: true, amount: true, created_at: true },
    });
    const porLoja = new Map<string, { total: number; desde: Date }>();
    for (const h of pendentes) {
      const g = porLoja.get(h.establishment_id);
      const v = centavos(decToNum(h.amount) ?? 0);
      if (!g) porLoja.set(h.establishment_id, { total: v, desde: h.created_at });
      else {
        g.total += v;
        if (h.created_at.getTime() < g.desde.getTime()) g.desde = h.created_at;
      }
    }
    for (const loja of lojas) {
      const g = porLoja.get(loja.id);
      if (!g || g.total <= 0) continue;
      const data = inicioDoDiaEmSaoPaulo(g.desde);
      itens.push({
        chave: `emporio_entrega:${loja.id}`,
        origem: "emporio_entrega",
        titulo: `${dinheiro(g.total / 100)} aguardando o gerente na ${loja.name}`,
        data,
        horario: null,
        valor: g.total / 100,
        urgente: false,
        dias: diasAte(data, agora),
        fazenda: null,
        href: "/emporio/caixa",
      });
    }
  }

  // --- emporio_equipe (Q132): loja sem Gestor, só para quem pode resolver ----
  if (pode(papel, "conta")) {
    const semGestor = await lojasSemGestor(db, ids);
    for (const loja of lojas) {
      if (!semGestor.has(loja.id)) continue;
      itens.push({
        chave: `emporio_equipe:${loja.id}`,
        origem: "emporio_equipe",
        titulo: `Defina um Gestor para a ${loja.name}`,
        data: null,
        horario: null,
        valor: null,
        urgente: false,
        dias: null,
        fazenda: null,
        href: "/emporio/equipe",
      });
    }
  }

  return itens;
}

export type ResumoDoEmporio = {
  sales_today: number;
  fiado_open: number;
  /** Só para o Gestor da loja ou mais; nulo para o Vendedor. */
  payables_open: number | null;
};

export async function resumoDoEmporio(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { agora?: Date } = {},
): Promise<ResumoDoEmporio> {
  const agora = opts.agora ?? new Date();
  const lojas = await lojasDoUsuario(db, ator);
  const ids = lojas.map((l) => l.id);
  const inicio = inicioDoDiaEmInstante(inicioDoDiaEmSaoPaulo(agora));
  const fim = new Date(inicio.getTime() + DIA_MS);
  const ehAdmin = pode(await papelDoEmporio(db, ator), "gestor_da_loja");

  const [vendas, fiado, pagar] = await Promise.all([
    db.emporioSale.aggregate({
      where: { status: "concluida", establishment_id: { in: ids }, sold_at: { gte: inicio, lt: fim } },
      _sum: { net_amount: true },
    }),
    entradasAbertas(db, { establishment_id: { in: ids }, contact_id: { not: null } }),
    ehAdmin
      ? db.financialEntry.findMany({
          where: { related_module: "emporio", entry_type: "expense", status: "pending", establishment_id: { in: ids } },
          select: { amount: true, payments: { select: { amount: true } } },
        })
      : Promise.resolve(null),
  ]);

  const aPagar = pagar
    ? pagar.reduce((soma, c) => {
        const pago = c.payments.reduce((s, p) => s + centavos(decToNum(p.amount) ?? 0), 0);
        return soma + Math.max(0, centavos(decToNum(c.amount) ?? 0) - pago);
      }, 0)
    : null;

  return {
    sales_today: centavos(decToNum(vendas._sum.net_amount) ?? 0) / 100,
    fiado_open: fiado.reduce((s, e) => s + e.open_cent, 0) / 100,
    payables_open: aPagar === null ? null : aPagar / 100,
  };
}

/**
 * Os itens do dia para quem tem tela: a fazenda mais, para quem vê o Empório,
 * o Empório. O Painel, o `/meu-dia` e a rota usam este caminho; o WhatsApp
 * chama `lerItensDoDia` direto e fica só com a fazenda (Q113).
 */
export async function lerItensDoDiaCompleto(
  db: TenantPrismaClient,
  user: UsuarioDoDia,
  opts: { property_id?: string | null; agora?: Date } = {},
): Promise<ItemDoDia[]> {
  const ve = await veEmporio(user);
  // Q120: quem é só da loja não recebe nenhuma seção da fazenda, só o Empório.
  const soLoja = ve && (await papelDoEmporio(db, user)).soDaLoja;
  const fazenda = soLoja ? [] : await lerItensDoDia(db, opts);
  if (!ve) return fazenda;
  const emporio = await itensDoEmporioNoDia(db, { id: user.id, role: user.role }, { agora: opts.agora });
  return [...fazenda, ...emporio];
}
