import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { diasAte, inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { isFeatureVisibleForUser } from "@/lib/features";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
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
const DIAS_DE_CAIXA = 7;

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

type UsuarioDoDia = { id: string; tenant_id: string; role: Ator["role"] };

/**
 * "Vê o Empório": perfil `emporio` ativo e recurso visível para o usuário.
 * `isFeatureVisibleForUser` já confere o perfil quando a chave é `emporio`.
 */
export async function veEmporio(user: UsuarioDoDia): Promise<boolean> {
  return isFeatureVisibleForUser(user.tenant_id, user.id, "emporio");
}

/** As lojas do usuário: as do vínculo, ou todas as não arquivadas quando não há vínculo. */
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
  const ehAdmin = hasMinRole(ator.role, "ADMIN");
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
    // A tela de Despesas é só de ADMIN: o link nunca pode levar a um 403.
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

  // --- emporio_caixa --------------------------------------------------------
  if (hasMinRole(ator.role, "OPERADOR")) {
    const hoje = inicioDoDiaEmSaoPaulo(agora);
    const inicio = new Date(inicioDoDiaEmInstante(hoje).getTime() - DIAS_DE_CAIXA * DIA_MS);
    const fim = inicioDoDiaEmInstante(hoje);
    const [movimentos, conferencias] = await Promise.all([
      db.cashMovement.findMany({
        where: { establishment_id: { in: ids }, occurred_at: { gte: inicio, lt: fim } },
        select: { establishment_id: true, occurred_at: true },
      }),
      db.cashCount.findMany({
        where: { establishment_id: { in: ids }, counted_at: { gte: inicio, lt: fim } },
        select: { establishment_id: true, counted_at: true },
      }),
    ]);
    const dia = (d: Date) => inicioDoDiaEmSaoPaulo(d).getTime();
    const conferidos = new Set(conferencias.map((c) => `${c.establishment_id}:${dia(c.counted_at)}`));
    const semConferir = new Map<string, Set<number>>();
    for (const m of movimentos) {
      if (!m.establishment_id) continue;
      const d = dia(m.occurred_at);
      if (conferidos.has(`${m.establishment_id}:${d}`)) continue;
      const set = semConferir.get(m.establishment_id) ?? new Set<number>();
      set.add(d);
      semConferir.set(m.establishment_id, set);
    }
    const ontem = hoje.getTime() - DIA_MS;
    for (const loja of lojas) {
      const dias = semConferir.get(loja.id);
      if (!dias || dias.size === 0) continue;
      const maisRecente = Math.max(...dias);
      const titulo =
        dias.size === 1 && maisRecente === ontem
          ? `Caixa de ontem da ${loja.name} não foi conferido`
          : `Caixa da ${loja.name} sem conferência em ${dias.size} dias`;
      const data = new Date(maisRecente);
      itens.push({
        chave: `emporio_caixa:${loja.id}`,
        origem: "emporio_caixa",
        titulo,
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

  return itens;
}

export type ResumoDoEmporio = {
  sales_today: number;
  fiado_open: number;
  /** Só para ADMIN ou mais; nulo abaixo disso. */
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
  const ehAdmin = hasMinRole(ator.role, "ADMIN");

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
  const fazenda = await lerItensDoDia(db, opts);
  if (!(await veEmporio(user))) return fazenda;
  const emporio = await itensDoEmporioNoDia(db, { id: user.id, role: user.role }, { agora: opts.agora });
  return [...fazenda, ...emporio];
}
