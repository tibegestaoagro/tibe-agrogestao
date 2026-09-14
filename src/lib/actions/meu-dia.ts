import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { diasAte, inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { listStays } from "@/lib/actions/herd-stays";

/**
 * Módulo 38, Meu Dia: as três seções (§30 a §32), lidas AO VIVO.
 *
 * Decisão 21: consulta no request, como o `/dashboard` já fazia. O §61 é
 * explícito que o Meu Dia "não deverá criar bases paralelas": uma conta a
 * pagar continua sendo do Financeiro, e esta função só a apresenta.
 * Materializar daria a cada módulo um segundo lugar para escrever, e no dia em
 * que os dois divergirem a tela MENTE, que é o pior defeito possível numa
 * tela cuja única promessa é mostrar a verdade do dia.
 *
 * ⚠️ **As fontes são só as que já guardam data no banco** (decisão 38.1):
 * financeiro, tarefas, vacinas, serviços agendados, estadias com saída
 * prevista, e o alerta de estoque baixo. Retirada de negociação, coleta de
 * leite e troca de óleo ficam fora porque não têm campo de data, e criá-los
 * para encher uma tela seria a cauda balançando o cachorro.
 */

export type OrigemDoItem = "tarefa" | "pagar" | "receber" | "vacina" | "servico" | "estadia" | "estoque";

export type ItemDoDia = {
  /** `origem:id`, estável entre renderizações. */
  chave: string;
  origem: OrigemDoItem;
  titulo: string;
  /** Data de calendário; nula só em tarefa sem data e em alerta de estoque. */
  data: Date | null;
  /** "HH:MM", só tarefa tem. É o que sobe o item na ordem do §50. */
  horario: string | null;
  /** Saldo AINDA devido, e não o valor original, para conta parcialmente paga. */
  valor: number | null;
  urgente: boolean;
  /** Negativo quando passou, zero hoje, positivo quando vem. Nulo sem data. */
  dias: number | null;
  fazenda: string | null;
  href: string;
  /** Presente só em tarefa: é o que a tela usa para concluir e adiar. */
  task_id?: string;
};

export type MeuDia = {
  atencao: ItemDoDia[];
  hoje: ItemDoDia[];
  proximos: ItemDoDia[];
  semData: ItemDoDia[];
};

/** §32: "amanhã" e "próximos 7 dias". Mais que isso é calendário, e o §33 o tira do centro. */
export const JANELA_DE_PROXIMOS_DIAS = 7;

/**
 * Lê as seis fontes e devolve os itens CRUS, ainda sem seção.
 *
 * Separada de `classificar` para a suíte poder provar a regra das seções com
 * itens montados à mão, sem banco.
 *
 * ⚠️ **Item sem fazenda aparece em TODAS as fazendas.** É o oposto do que a
 * tela do Financeiro faz desde a 35.1, que esconde o lançamento sem fazenda e
 * conta quantos ficaram de fora. Aqui esconder seria pior: o Meu Dia é a tela
 * que diz "você não esqueceu nada", e uma conta que some porque ninguém
 * preencheu a fazenda é justamente a conta esquecida.
 */
export async function lerItensDoDia(
  db: TenantPrismaClient,
  opts: { property_id?: string | null; agora?: Date } = {},
): Promise<ItemDoDia[]> {
  const agora = opts.agora ?? new Date();
  const limite = new Date(agora.getTime() + (JANELA_DE_PROXIMOS_DIAS + 1) * 86_400_000);
  const porFazenda = opts.property_id
    ? { OR: [{ property_id: opts.property_id }, { property_id: null }] }
    : {};

  const [tarefas, contas, vacinas, servicos, estadias, alertasDeEstoque] = await Promise.all([
    db.task.findMany({
      where: { status: "pending", ...porFazenda },
      include: { property: { select: { name: true } }, worker: { select: { name: true } } },
    }),
    /*
     * Tudo o que está pendente até o fim da janela, sem piso: o vencido de
     * três meses atrás é exatamente o que "Atenção" existe para mostrar.
     */
    db.financialEntry.findMany({
      where: { status: "pending", due_date: { lte: limite }, ...porFazenda },
      include: {
        property: { select: { name: true } },
        contact: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
    /*
     * Com piso em HOJE, ao contrário das contas: a spec põe vacina em "Hoje" e
     * "Próximos dias", nunca em "Atenção". Medido no banco de dev em 14/09:
     * sem o piso, 83 vacinas entravam como atrasadas, uma delas de 220 dias, e
     * a seção inteira virava ruído (§45).
     */
    db.animalVaccination.findMany({
      where: {
        next_due_at: { gte: inicioDoDiaEmSaoPaulo(agora), lte: limite },
        ...(opts.property_id ? { batch: { property_id: opts.property_id } } : {}),
      },
      include: {
        vaccine: { select: { name: true } },
        batch: { select: { ear_tag: true, property: { select: { name: true } } } },
      },
    }),
    db.serviceJob.findMany({
      where: {
        status: "agendado",
        occurred_at: { gte: inicioDoDiaEmSaoPaulo(agora), lte: limite },
        ...(opts.property_id ? { property_id: opts.property_id } : {}),
      },
      include: { property: { select: { name: true } } },
    }),
    listStays(db, { apenas_abertas: true, ...(opts.property_id ? { property_id: opts.property_id } : {}) }),
    /*
     * §15: o alerta, e não uma segunda varredura do saldo. Decisão 27 do
     * Módulo 36: dois lugares decidindo o que é estoque baixo divergem.
     */
    db.alert.findMany({
      where: { alert_type: "low_stock", status: "pending" },
      select: { id: true, message: true },
    }),
  ]);

  const itens: ItemDoDia[] = [];

  for (const t of tarefas) {
    itens.push({
      chave: `tarefa:${t.id}`,
      origem: "tarefa",
      titulo: t.worker?.name || t.assignee ? `${t.worker?.name ?? t.assignee}: ${t.title}` : t.title,
      data: t.due_date,
      horario: t.due_date ? t.due_time : null,
      valor: null,
      urgente: t.priority === "urgente",
      dias: t.due_date ? diasAte(t.due_date, agora) : null,
      fazenda: t.property?.name ?? null,
      href: "/meu-dia",
      task_id: t.id,
    });
  }

  for (const c of contas) {
    if (!c.due_date) continue;
    const valor = decToNum(c.amount) ?? 0;
    const pago = c.payments.reduce((soma, p) => soma + (decToNum(p.amount) ?? 0), 0);
    const saldo = Math.max(0, Math.round((valor - pago) * 100) / 100);
    const quem = c.contact?.name ?? c.category ?? "lançamento";
    const receber = c.entry_type === "income";
    itens.push({
      chave: `${receber ? "receber" : "pagar"}:${c.id}`,
      origem: receber ? "receber" : "pagar",
      titulo: receber ? `Receber de ${quem}` : `Pagar ${quem}`,
      data: c.due_date,
      horario: null,
      valor: saldo,
      urgente: false,
      dias: diasAte(c.due_date, agora),
      fazenda: c.property?.name ?? null,
      href: "/financeiro",
    });
  }

  /*
   * ⚠️ **Cada aplicação guarda a SUA próxima dose, e a reaplicação não apaga a
   * antiga.** Aplicada em 01/09 com próxima em 20/09, e reaplicada em 10/09
   * com próxima em março: a linha de 01/09 continua dizendo 20/09, e sem este
   * filtro o Meu Dia mandaria vacinar um animal que já foi vacinado.
   *
   * A mais recente é buscada entre TODAS as aplicações do par, e não só entre
   * as da janela: a reaplicação costuma ter a próxima dose FORA dela.
   * Medido em 14/09 no banco de dev: 12 das 83 vacinas vencidas já tinham sido
   * reaplicadas.
   */
  const ultimaAplicacao = new Map<string, number>();
  if (vacinas.length > 0) {
    const maximos = await db.animalVaccination.groupBy({
      by: ["batch_id", "vaccine_id"],
      where: {
        batch_id: { in: [...new Set(vacinas.map((v) => v.batch_id))] },
        vaccine_id: { in: [...new Set(vacinas.map((v) => v.vaccine_id))] },
      },
      _max: { applied_at: true },
    });
    for (const m of maximos) {
      if (m._max.applied_at) ultimaAplicacao.set(`${m.batch_id}:${m.vaccine_id}`, m._max.applied_at.getTime());
    }
  }

  for (const v of vacinas) {
    if (!v.next_due_at) continue;
    const ultima = ultimaAplicacao.get(`${v.batch_id}:${v.vaccine_id}`);
    if (ultima !== undefined && v.applied_at.getTime() < ultima) continue;
    itens.push({
      chave: `vacina:${v.id}`,
      origem: "vacina",
      titulo: `Vacinar ${v.batch?.ear_tag ? `o brinco ${v.batch.ear_tag}` : "o lote"}: ${v.vaccine?.name ?? "vacina"}`,
      data: v.next_due_at,
      horario: null,
      valor: null,
      urgente: false,
      dias: diasAte(v.next_due_at, agora),
      fazenda: v.batch?.property?.name ?? null,
      href: "/rebanho",
    });
  }

  for (const s of servicos) {
    itens.push({
      chave: `servico:${s.id}`,
      origem: "servico",
      titulo: s.description,
      data: s.occurred_at,
      horario: null,
      valor: null,
      urgente: false,
      dias: diasAte(s.occurred_at, agora),
      fazenda: s.property?.name ?? null,
      href: "/servicos",
    });
  }

  if (estadias.ok) {
    for (const e of estadias.data) {
      /* Como a vacina e o serviço: saída prevista é compromisso, e a que já
         passou sem encerramento é assunto da tela do Confinamento, onde o lote
         pode ser encerrado. Aqui ela só viraria mais uma linha de Atenção. */
      if (!e.expected_end_at || diasAte(e.expected_end_at, agora) < 0) continue;
      itens.push({
        chave: `estadia:${e.id}`,
        origem: "estadia",
        titulo: `Saída prevista: ${e.location_name ?? e.counterparty_name ?? "lote"} (${e.saldo_aberto} cabeças)`,
        data: e.expected_end_at,
        horario: null,
        valor: null,
        urgente: false,
        dias: diasAte(e.expected_end_at, agora),
        fazenda: null,
        href: "/confinamento",
      });
    }
  }

  for (const a of alertasDeEstoque) {
    itens.push({
      chave: `estoque:${a.id}`,
      origem: "estoque",
      titulo: a.message,
      data: null,
      horario: null,
      valor: null,
      urgente: true,
      dias: null,
      fazenda: null,
      href: "/estoque",
    });
  }

  return itens;
}

/**
 * Distribui os itens nas seções. Função PURA, e é ela que decide o que é
 * "Atenção".
 *
 * ⚠️ **"Atenção" recebe só o que JÁ passou, e não o que vence hoje** (§31: "o
 * TIBÉ deverá evitar usar Atenção para situações normais"). Conta que vence
 * hoje é compromisso de hoje; conta que venceu ontem é problema. Misturar as
 * duas faz o produtor ignorar a seção inteira na segunda semana.
 *
 * O alerta de estoque baixo não tem data e vai para "Atenção" por natureza: o
 * §31 lista "estoque crítico" entre os exemplos.
 */
export function classificar(itens: ItemDoDia[]): MeuDia {
  const dia: MeuDia = { atencao: [], hoje: [], proximos: [], semData: [] };

  for (const item of itens) {
    if (item.origem === "estoque") {
      dia.atencao.push(item);
    } else if (item.dias === null) {
      dia.semData.push(item);
    } else if (item.dias < 0) {
      dia.atencao.push(item);
    } else if (item.dias === 0) {
      dia.hoje.push(item);
    } else if (item.dias <= JANELA_DE_PROXIMOS_DIAS) {
      dia.proximos.push(item);
    }
  }

  return dia;
}
