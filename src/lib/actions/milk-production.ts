import type { MilkShift } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { conferirLote } from "@/lib/actions/milk-groups";
import { contagemPorDia, type Contagem } from "@/lib/actions/milk-lactation";
import {
  diaDoProdutor,
  diasEntre,
  fimDoDia,
  inicioDoDia,
  janelasDoPeriodo,
  type JanelaChave,
} from "@/lib/milk/periodos";

/**
 * Produção de leite (Área Leite, §8 a §11). Ver
 * docs/specs/module-32-area-leite.md.
 *
 * UMA LINHA POR REGISTRO, com turno. O total do dia é a soma das linhas
 * daquela data, nunca um campo gravado (invariante 2). Linha por dia com três
 * colunas foi descartada porque o WhatsApp chega em pedaços, e ali o segundo
 * registro do dia viraria uma edição.
 *
 * O §8 lista "quantidade de vacas em lactação" como campo opcional do registro,
 * e ele NÃO existe no model: gravá-lo aqui criaria uma segunda fonte para o
 * mesmo número. Quando o formulário manda `vacas_em_lactacao`, o que acontece é
 * um `LactationEntry` do tipo `definir` na mesma data, na mesma transação.
 */

export type MilkProductionRecord = {
  id: string;
  property_id: string;
  liters: number;
  shift: MilkShift;
  recorded_at: Date;
  group_id: string | null;
  notes: string | null;
  cancelled_at: Date | null;
};

const CAMPOS = {
  id: true,
  property_id: true,
  liters: true,
  shift: true,
  recorded_at: true,
  group_id: true,
  notes: true,
  cancelled_at: true,
} as const;

type LinhaCrua = {
  id: string;
  property_id: string;
  liters: unknown;
  shift: MilkShift;
  recorded_at: Date;
  group_id: string | null;
  notes: string | null;
  cancelled_at: Date | null;
};

function serializar(linha: LinhaCrua): MilkProductionRecord {
  return { ...linha, liters: decToNum(linha.liters) ?? 0 };
}

export type RecordProductionInput = {
  property_id: string;
  recorded_at?: Date | null;
  /** §9.1: o dia inteiro num número só. */
  dia?: number | null;
  /** §9.2: as ordenhas detalhadas. */
  manha?: number | null;
  tarde?: number | null;
  noite?: number | null;
  group_id?: string | null;
  notes?: string | null;
  /** §8: o atalho que grava um `definir` de lactação na mesma data. */
  vacas_em_lactacao?: number | null;
  recorded_by_user_id?: string | null;
};

const TURNOS: { campo: "dia" | "manha" | "tarde" | "noite"; shift: MilkShift }[] = [
  { campo: "dia", shift: "dia" },
  { campo: "manha", shift: "manha" },
  { campo: "tarde", shift: "tarde" },
  { campo: "noite", shift: "noite" },
];

export async function recordMilkProduction(
  db: TenantPrismaClient,
  input: RecordProductionInput,
): Promise<ActionResult<MilkProductionRecord[]>> {
  const informados = TURNOS.map(({ campo, shift }) => ({
    campo,
    shift,
    litros: input[campo],
  })).filter((t) => t.litros != null);

  if (informados.length === 0) {
    return fail(
      "VALIDATION_ERROR",
      "Informe a produção do dia ou de pelo menos uma ordenha.",
      422,
      "dia",
    );
  }

  // O §9 apresenta as duas formas como alternativas, não como soma. Aceitar as
  // duas juntas faria "500 no dia" mais "300 de manhã" virar 800 litros em
  // silêncio, que é exatamente o número que ninguém consegue explicar depois.
  const temDia = informados.some((t) => t.campo === "dia");
  if (temDia && informados.length > 1) {
    return fail(
      "FORMAS_MISTURADAS",
      "Informe a produção do dia OU as ordenhas separadas, não as duas.",
      422,
      "dia",
    );
  }

  for (const t of informados) {
    const litros = t.litros as number;
    if (!Number.isFinite(litros) || litros <= 0) {
      return fail(
        "QUANTIDADE_INVALIDA",
        "A quantidade em litros deve ser maior que zero.",
        422,
        t.campo,
      );
    }
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
  if (property.archived_at) {
    return fail(
      "PROPERTY_ARCHIVED",
      "Não é possível registrar produção em fazenda arquivada.",
      422,
      "property_id",
    );
  }

  if (input.group_id) {
    const conferido = await conferirLote(db, input.group_id, input.property_id);
    if (!conferido.ok) return conferido;
  }

  const vacas = input.vacas_em_lactacao;
  if (vacas != null && (!Number.isInteger(vacas) || vacas < 0)) {
    return fail(
      "QUANTIDADE_INVALIDA",
      "A quantidade de vacas em lactação deve ser um número inteiro.",
      422,
      "vacas_em_lactacao",
    );
  }

  const recorded_at = input.recorded_at ?? new Date();

  // A lactação e a produção entram juntas ou não entram: metade gravada
  // deixaria a média por vaca daquele dia contando uma coisa que não aconteceu.
  const criados = await db.$transaction(async (tx) => {
    const linhas: LinhaCrua[] = [];
    for (const t of informados) {
      const linha = await tx.milkProduction.create({
        data: scoped({
          property_id: input.property_id,
          liters: t.litros as number,
          shift: t.shift,
          recorded_at,
          group_id: input.group_id ?? null,
          notes: input.notes?.trim() || null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
        select: CAMPOS,
      });
      linhas.push(linha);
    }

    if (vacas != null) {
      await tx.lactationEntry.create({
        data: scoped({
          property_id: input.property_id,
          type: "definir",
          quantity: vacas,
          recorded_at,
          group_id: input.group_id ?? null,
          notes: null,
          pasture_id: null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
      });
    }

    return linhas;
  });

  return ok(criados.map(serializar));
}

export async function cancelMilkProduction(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<MilkProductionRecord>> {
  const registro = await db.milkProduction.findFirst({
    where: { id },
    select: { id: true, cancelled_at: true },
  });
  if (!registro) return fail("NOT_FOUND", "Registro de produção não encontrado.", 404);
  if (registro.cancelled_at) {
    return fail("JA_CANCELADO", "Este registro já está cancelado.", 422);
  }

  const updated = await db.milkProduction.update({
    where: { id },
    data: { cancelled_at: new Date() },
    select: CAMPOS,
  });

  return ok(serializar(updated));
}

export async function listMilkProduction(
  db: TenantPrismaClient,
  filtros: {
    property_id?: string;
    group_id?: string;
    de?: string;
    ate?: string;
    limit?: number;
  } = {},
): Promise<MilkProductionRecord[]> {
  const { de, ate } = filtros;
  const linhas = await db.milkProduction.findMany({
    where: {
      ...(filtros.property_id ? { property_id: filtros.property_id } : {}),
      ...(filtros.group_id ? { group_id: filtros.group_id } : {}),
      ...(de || ate
        ? {
            recorded_at: {
              ...(de ? { gte: inicioDoDia(de) } : {}),
              ...(ate ? { lt: fimDoDia(ate) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ recorded_at: "desc" }, { created_at: "desc" }],
    take: Math.min(filtros.limit ?? 100, 200),
    select: CAMPOS,
  });
  return linhas.map(serializar);
}

// ─────────────────────────────────────────────────────────────
// Leitura: o painel do §34 e as seis janelas do §11
// ─────────────────────────────────────────────────────────────

export type ResumoDePeriodo = {
  chave: JanelaChave;
  rotulo: string;
  de: string;
  ate: string;
  litros: number;
  /** Dias corridos da janela. Divisor da média diária. */
  dias: number;
  media_diaria: number;
  /**
   * Litros por vaca/dia (§10). `null` quando nenhum dia da janela tem contagem
   * de vacas conhecida: mostrar zero afirmaria uma produtividade que ninguém
   * mediu.
   */
  media_por_vaca: number | null;
  /** Quantos dias entraram na conta da média por vaca, dos `dias` da janela. */
  dias_com_contagem: number;
};

export type ResumoDoLeite = {
  property_id: string;
  hoje: {
    dia: string;
    vacas_em_lactacao: Contagem;
    litros: number;
    media_por_vaca: number | null;
  };
  periodos: ResumoDePeriodo[];
};

async function litrosPorDia(
  db: TenantPrismaClient,
  property_id: string,
  de: string,
  ate: string,
): Promise<Map<string, number>> {
  const linhas = await db.milkProduction.findMany({
    where: {
      property_id,
      cancelled_at: null,
      recorded_at: { gte: inicioDoDia(de), lt: fimDoDia(ate) },
    },
    select: { liters: true, recorded_at: true },
  });

  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    const dia = diaDoProdutor(linha.recorded_at);
    mapa.set(dia, (mapa.get(dia) ?? 0) + (decToNum(linha.liters) ?? 0));
  }
  return mapa;
}

/**
 * A média por vaca de uma janela é LITROS POR VACA/DIA: o total de litros
 * dividido pela soma, dia a dia, das vacas em lactação naqueles dias.
 *
 * Os dias sem contagem conhecida saem dos DOIS lados da divisão. Dividir o
 * total pela contagem de hoje daria média errada em todo mês em que o rebanho
 * leiteiro mudou de tamanho, que é todo mês; e somar litros de dias cuja
 * contagem ninguém sabe inflaria o numerador contra um denominador menor.
 */
function mediaPorVaca(
  dias: string[],
  litros: Map<string, number>,
  contagens: Map<string, Contagem>,
): { media: number | null; dias_com_contagem: number } {
  let numerador = 0;
  let denominador = 0;
  let diasContados = 0;

  for (const dia of dias) {
    const vacas = contagens.get(dia) ?? null;
    if (vacas === null || vacas <= 0) continue;
    numerador += litros.get(dia) ?? 0;
    denominador += vacas;
    diasContados++;
  }

  if (denominador === 0) return { media: null, dias_com_contagem: 0 };
  return {
    media: Math.round((numerador / denominador) * 100) / 100,
    dias_com_contagem: diasContados,
  };
}

export async function getResumoDoLeite(
  db: TenantPrismaClient,
  property_id: string,
  agora: Date = new Date(),
): Promise<ResumoDoLeite> {
  const janelas = janelasDoPeriodo(agora);
  const hoje = diaDoProdutor(agora);

  // A janela mais antiga é o começo do ano; a mais nova é hoje. Uma consulta de
  // produção e uma de lactação cobrem as seis, em vez de doze idas ao banco.
  const inicioGeral = janelas.reduce((menor, j) => (j.de < menor ? j.de : menor), hoje);
  const todosOsDias = diasEntre(inicioGeral, hoje);

  const [litros, contagens] = await Promise.all([
    litrosPorDia(db, property_id, inicioGeral, hoje),
    contagemPorDia(db, property_id, todosOsDias),
  ]);

  const periodos: ResumoDePeriodo[] = janelas.map((janela) => {
    const dias = diasEntre(janela.de, janela.ate);
    const total = dias.reduce((soma, dia) => soma + (litros.get(dia) ?? 0), 0);
    const { media, dias_com_contagem } = mediaPorVaca(dias, litros, contagens);
    return {
      chave: janela.chave,
      rotulo: janela.rotulo,
      de: janela.de,
      ate: janela.ate,
      litros: Math.round(total * 100) / 100,
      dias: dias.length,
      media_diaria: Math.round((total / Math.max(dias.length, 1)) * 100) / 100,
      media_por_vaca: media,
      dias_com_contagem,
    };
  });

  const vacasHoje = contagens.get(hoje) ?? null;
  const litrosHoje = litros.get(hoje) ?? 0;

  return {
    property_id,
    hoje: {
      dia: hoje,
      vacas_em_lactacao: vacasHoje,
      litros: Math.round(litrosHoje * 100) / 100,
      media_por_vaca:
        vacasHoje && vacasHoje > 0
          ? Math.round((litrosHoje / vacasHoje) * 100) / 100
          : null,
    },
    periodos,
  };
}
