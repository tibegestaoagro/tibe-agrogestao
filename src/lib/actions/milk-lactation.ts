import type { LactationEntryType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { conferirLote } from "@/lib/actions/milk-groups";
import { diaDoProdutor, fimDoDia, inicioDoDia } from "@/lib/milk/periodos";

/**
 * Vacas em lactação (Área Leite, §4 e §7). Ver
 * docs/specs/module-32-area-leite.md.
 *
 * A CONTAGEM NUNCA É GRAVADA (invariante 2): é o dobramento destas linhas, a
 * partir do último `definir`, somando `entrada` e subtraindo `saida`.
 *
 * A chave do saldo é a FAZENDA, não o lote (decisão 4.2 da spec). O lote e o
 * pasto são informação do registro, e servem para filtrar histórico.
 *
 * Nada aqui toca no livro-razão do rebanho: "em lactação" é uma condição, não
 * uma categoria (§37.2), e entrar ou sair da lactação não altera o total do
 * rebanho (§37.4).
 */

/** Uma linha do dobramento, já ordenada. */
type LinhaDeLactacao = {
  type: LactationEntryType;
  quantity: number;
  recorded_at: Date;
};

/**
 * O estado da contagem num ponto da linha do tempo.
 *
 * `null` NÃO é zero. Antes do primeiro `definir` a contagem é desconhecida, e
 * zero seria uma afirmação ("não tenho vaca em lactação") que ninguém fez. A
 * tela precisa dizer coisas diferentes nos dois casos, e a média por vaca
 * precisa excluir os dias desconhecidos em vez de dividir por zero.
 */
export type Contagem = number | null;

function ordenar(linhas: LinhaDeLactacao[]): LinhaDeLactacao[] {
  return [...linhas].sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
}

/**
 * Dobra as linhas em ordem, devolvendo o valor da contagem ao FIM de cada dia.
 *
 * Uma `entrada` anterior ao primeiro `definir` não inventa contagem: ela fica
 * no histórico e passa a contar assim que existir um `definir` antes dela. É o
 * preço de deixar o produtor registrar na ordem que quiser, e é preferível a
 * chutar que a fazenda tinha zero vaca antes do primeiro registro.
 */
function dobrar(linhas: LinhaDeLactacao[]): Map<string, number> {
  const porDia = new Map<string, number>();
  let atual: Contagem = null;

  for (const linha of ordenar(linhas)) {
    if (linha.type === "definir") {
      atual = linha.quantity;
    } else if (atual !== null) {
      atual += linha.type === "entrada" ? linha.quantity : -linha.quantity;
    }
    if (atual !== null) porDia.set(diaDoProdutor(linha.recorded_at), atual);
  }

  return porDia;
}

async function carregarLinhas(
  db: TenantPrismaClient,
  property_id: string,
  ateDiaISO?: string,
): Promise<LinhaDeLactacao[]> {
  return db.lactationEntry.findMany({
    where: {
      property_id,
      cancelled_at: null,
      ...(ateDiaISO ? { recorded_at: { lt: fimDoDia(ateDiaISO) } } : {}),
    },
    orderBy: [{ recorded_at: "asc" }, { created_at: "asc" }],
    select: { type: true, quantity: true, recorded_at: true },
  });
}

/**
 * A contagem vigente ao fim de cada dia do intervalo, carregando o último valor
 * conhecido para a frente nos dias sem registro nenhum.
 */
export async function contagemPorDia(
  db: TenantPrismaClient,
  property_id: string,
  dias: string[],
): Promise<Map<string, Contagem>> {
  const saida = new Map<string, Contagem>();
  if (dias.length === 0) return saida;

  const ultimoDia = dias[dias.length - 1];
  const porDia = dobrar(await carregarLinhas(db, property_id, ultimoDia));

  // O valor de um dia sem registro é o do último dia que teve. Percorrer os
  // dias do mapa em ordem, uma vez, evita uma consulta por dia.
  const diasComRegistro = Array.from(porDia.keys()).sort();
  let i = 0;
  let carregado: Contagem = null;
  for (const dia of dias) {
    while (i < diasComRegistro.length && diasComRegistro[i] <= dia) {
      carregado = porDia.get(diasComRegistro[i]) ?? carregado;
      i++;
    }
    saida.set(dia, carregado);
  }

  return saida;
}

/** A contagem vigente numa data (por padrão, agora). */
export async function contagemAtual(
  db: TenantPrismaClient,
  property_id: string,
  quando: Date = new Date(),
): Promise<Contagem> {
  const dia = diaDoProdutor(quando);
  const mapa = await contagemPorDia(db, property_id, [dia]);
  return mapa.get(dia) ?? null;
}

export type RecordLactationInput = {
  property_id: string;
  type: LactationEntryType;
  quantity: number;
  recorded_at?: Date | null;
  pasture_id?: string | null;
  group_id?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export type LactationEntryRecord = {
  id: string;
  property_id: string;
  type: LactationEntryType;
  quantity: number;
  recorded_at: Date;
  pasture_id: string | null;
  group_id: string | null;
  notes: string | null;
  cancelled_at: Date | null;
};

const CAMPOS: Record<keyof LactationEntryRecord, true> = {
  id: true,
  property_id: true,
  type: true,
  quantity: true,
  recorded_at: true,
  pasture_id: true,
  group_id: true,
  notes: true,
  cancelled_at: true,
};

/**
 * A conferência que impede contagem negativa (§6.2 da spec).
 *
 * Confere o dobramento INTEIRO a partir do registro novo, e não só o valor no
 * dia dele. Uma saída retroativa pode fechar o próprio dia em zero e deixar
 * todos os dias seguintes negativos, e essa é justamente a versão do erro que
 * ninguém vê acontecer.
 */
function conferirNaoNegativo(
  linhas: LinhaDeLactacao[],
  novaLinha: LinhaDeLactacao,
): { disponivel: number } | null {
  // `ordenar` é estável e `novaLinha` entra por último: no empate de data, ela
  // se aplica depois das que já existiam, que é a leitura certa de um registro
  // feito agora para uma data que já tem registro.
  const todas = ordenar([...linhas, novaLinha]);
  const posNova = todas.indexOf(novaLinha);

  let atual: Contagem = null;
  let disponivel = 0;
  let pior: number | null = null;

  for (let i = 0; i < todas.length; i++) {
    const linha = todas[i];
    if (linha.type === "definir") {
      atual = linha.quantity;
    } else if (atual !== null) {
      if (i === posNova) disponivel = atual;
      atual += linha.type === "entrada" ? linha.quantity : -linha.quantity;
    } else if (i === posNova) {
      // Sem `definir` antes dela, a linha nova não muda contagem nenhuma:
      // não há saldo para ficar negativo.
      return null;
    }
    if (atual !== null && i >= posNova && (pior === null || atual < pior)) pior = atual;
  }

  if (pior === null || pior >= 0) return null;
  return { disponivel };
}

export async function recordLactationEntry(
  db: TenantPrismaClient,
  input: RecordLactationInput,
): Promise<ActionResult<LactationEntryRecord>> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return fail(
      "QUANTIDADE_INVALIDA",
      "A quantidade de vacas deve ser um número inteiro.",
      422,
      "quantity",
    );
  }
  // `definir` pode ser zero ("não tenho mais nenhuma vaca em lactação"), que é
  // uma afirmação legítima. Entrada e saída de zero não afirmam nada.
  if (input.quantity === 0 && input.type !== "definir") {
    return fail(
      "QUANTIDADE_INVALIDA",
      "Informe quantas vacas entraram ou saíram da lactação.",
      422,
      "quantity",
    );
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");

  if (input.group_id) {
    const conferido = await conferirLote(db, input.group_id, input.property_id);
    if (!conferido.ok) return conferido;
  }

  if (input.pasture_id) {
    const pasto = await db.pasture.findFirst({
      where: { id: input.pasture_id },
      select: { property_id: true },
    });
    if (!pasto || pasto.property_id !== input.property_id) {
      return fail("INVALID_PASTURE", "Pasto inválido para esta fazenda.", 422, "pasture_id");
    }
  }

  const recorded_at = input.recorded_at ?? new Date();
  const novaLinha: LinhaDeLactacao = {
    type: input.type,
    quantity: input.quantity,
    recorded_at,
  };

  if (input.type === "saida") {
    const linhas = await carregarLinhas(db, input.property_id);
    const problema = conferirNaoNegativo(linhas, novaLinha);
    if (problema) {
      return fail(
        "SALDO_INSUFICIENTE",
        `Não é possível retirar ${input.quantity} da lactação: há ${problema.disponivel} em produção nesta data.`,
        422,
        "quantity",
      );
    }
  }

  const created = await db.lactationEntry.create({
    data: scoped({
      property_id: input.property_id,
      type: input.type,
      quantity: input.quantity,
      recorded_at,
      pasture_id: input.pasture_id ?? null,
      group_id: input.group_id ?? null,
      notes: input.notes?.trim() || null,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
    }),
    select: CAMPOS,
  });

  return ok(created);
}

/**
 * Cancela um registro (§37.11): ele sai das somas e FICA na lista, marcado.
 *
 * Cancelar um `definir` antigo pode deixar dias seguintes negativos, e isso é
 * aceito de propósito: recusar prenderia o produtor a um número errado. O que
 * a tela mostra nesse caso é a contagem real do dobramento, e cabe a ele
 * registrar o `definir` que corrige.
 */
export async function cancelLactationEntry(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<LactationEntryRecord>> {
  const entry = await db.lactationEntry.findFirst({
    where: { id },
    select: { id: true, cancelled_at: true },
  });
  if (!entry) return fail("NOT_FOUND", "Registro de lactação não encontrado.", 404);
  if (entry.cancelled_at) {
    return fail("JA_CANCELADO", "Este registro já está cancelado.", 422);
  }

  const updated = await db.lactationEntry.update({
    where: { id },
    data: { cancelled_at: new Date() },
    select: CAMPOS,
  });

  return ok(updated);
}

export async function listLactationEntries(
  db: TenantPrismaClient,
  filtros: {
    property_id?: string;
    group_id?: string;
    de?: string;
    ate?: string;
    limit?: number;
  } = {},
): Promise<LactationEntryRecord[]> {
  const { de, ate } = filtros;
  return db.lactationEntry.findMany({
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
}
