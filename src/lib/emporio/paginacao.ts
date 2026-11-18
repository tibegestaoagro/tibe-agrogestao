import { fail, type ActionResult } from "@/lib/actions/types";

/** Tamanhos de página aceitos nas listas do Empório (Q365, Q366). */
export const POR_PAGINA = [20, 40, 80, 100];

export type OpcoesDePagina = {
  /** O corte antigo: só vale quando `page` e `per_page` não vêm. */
  limit?: number;
  page?: number;
  per_page?: number;
  order?: "asc" | "desc";
};

export type PaginaLida = {
  order: "asc" | "desc";
  porPagina: number;
  /** Pedida pelo cliente (1 quando não veio). */
  pedida: number;
};

/**
 * Valida `page`, `per_page` e `order` em TypeScript puro (o agente do WhatsApp não
 * passa pelo Zod da rota). `rotulo` entra na frase do `per_page` ("orçamentos").
 * Com `page` ou `per_page`, vale `per_page` (padrão 20); sem os dois e com `limit`,
 * o corte antigo continua valendo (a tela inicial do Empório); sem nada, 20.
 */
export function lerPagina(
  f: OpcoesDePagina,
  rotulo: string,
  campos: { page: string; per_page: string; order: string } = { page: "page", per_page: "per_page", order: "order" },
): ActionResult<PaginaLida> {
  const order = f.order ?? "desc";
  if (order !== "asc" && order !== "desc") {
    return fail("VALIDATION_ERROR", "Escolha a ordem: crescente ou decrescente.", 422, campos.order);
  }
  const modoAntigo = f.page === undefined && f.per_page === undefined && !!f.limit && f.limit > 0;
  const porPagina = modoAntigo ? Math.min(Math.floor(f.limit as number), 500) : (f.per_page ?? 20);
  if (!modoAntigo && !POR_PAGINA.includes(porPagina)) {
    return fail("VALIDATION_ERROR", `Escolha 20, 40, 80 ou 100 ${rotulo} por página.`, 422, campos.per_page);
  }
  if (f.page !== undefined && (!Number.isInteger(f.page) || f.page < 1)) {
    return fail("VALIDATION_ERROR", "A página começa em 1.", 422, campos.page);
  }
  return { ok: true, data: { order, porPagina, pedida: f.page ?? 1 } };
}

/** A página que vale (além da última devolve a última) e o recorte do `findMany`. */
export function recortar(total: number, p: PaginaLida): { page: number; skip: number; take: number } {
  const ultima = Math.max(1, Math.ceil(total / p.porPagina));
  const page = Math.min(p.pedida, ultima);
  return { page, skip: (page - 1) * p.porPagina, take: p.porPagina };
}
