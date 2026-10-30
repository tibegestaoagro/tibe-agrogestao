import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import { exigir, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lojasSemGestor } from "@/lib/actions/emporio-equipe";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, F5: "Primeiros passos" por loja (Módulo 39, Q116).
 *
 * Só leitura do que as fases anteriores gravam. Os essenciais são os passos
 * sem os quais o Resultado da loja é estimado; os recomendados melhoram o dia
 * a dia. Cada passo aponta para a tela onde o formulário normal vive.
 */

export type PassoKey =
  | "preco"
  | "estoque_inicial"
  | "saldo_caixa"
  | "taxa_cartao"
  | "despesa_fixa"
  | "minimo_maximo"
  | "conta_pix";

export type PassoView = {
  key: PassoKey;
  essential: boolean;
  done: boolean;
  detail?: string;
  href: string;
};

export type PrimeirosPassosLojaView = {
  establishment_id: string;
  name: string;
  steps: PassoView[];
  /** Q132: aviso de loja sem Gestor ativo; recomendado, nunca essencial. Nulo quando não se aplica. */
  sem_gestor: { essential: false; message: string; href: string } | null;
};

export type PrimeirosPassosView = {
  /** Verdadeiro quando todos os essenciais de todas as lojas estão feitos. */
  complete: boolean;
  establishments: PrimeirosPassosLojaView[];
};

const ROTULO_CARTAO: Record<string, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  credito_parcelado: "crédito parcelado",
};

export async function primeirosPassosAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { agora?: Date } = {},
): Promise<ActionResult<PrimeirosPassosView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "ver os primeiros passos da loja");
  if (neg) return neg;
  const agora = opts.agora ?? new Date();
  const visiveis = await lojasDoAtor(db, ator);
  const lojas = await db.establishment.findMany({
    where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
    select: { id: true, name: true, pix_bank_account_id: true },
    orderBy: { name: "asc" },
  });

  const podeDefinirGestor = pode(await papelDoEmporio(db, ator), "conta");
  const semGestor = podeDefinirGestor ? await lojasSemGestor(db, lojas.map((l) => l.id)) : new Set<string>();

  const establishments: PrimeirosPassosLojaView[] = [];
  for (const loja of lojas) {
    const [precos, implantacoes, saldo, cartaoVendido, regras, fixas, limites] = await Promise.all([
      db.presentationPrice.count({ where: { establishment_id: loja.id, price: { not: null } } }),
      db.stockMovement.findMany({
        where: { establishment_id: loja.id, movement_type: "implantacao", canceled_at: null },
        select: { product_id: true, unit_cost: true },
      }),
      db.cashMovement.count({ where: { establishment_id: loja.id, origin: "implantacao" } }),
      db.emporioSalePayment.findMany({
        where: {
          kind: { in: ["debito", "credito_vista", "credito_parcelado"] },
          sale: { establishment_id: loja.id, status: "concluida" },
        },
        select: { kind: true },
        distinct: ["kind"],
      }),
      db.cardFeeRule.findMany({ where: { establishment_id: loja.id }, select: { kind: true } }),
      db.fixedExpenseSplit.count({
        where: {
          establishment_id: loja.id,
          template: { OR: [{ ended_at: null }, { ended_at: { gt: agora } }] },
        },
      }),
      db.stockLimit.count({
        where: { establishment_id: loja.id, min_qty: { not: null }, max_qty: { not: null } },
      }),
    ]);

    const semCusto = new Set(implantacoes.filter((m) => m.unit_cost === null).map((m) => m.product_id));
    const comRegra = new Set(regras.map((r) => r.kind as string));
    const faltam = cartaoVendido.map((p) => p.kind as string).filter((k) => !comRegra.has(k));

    const steps: PassoView[] = [
      { key: "preco", essential: true, done: precos > 0, href: "/emporio/produtos" },
      {
        key: "estoque_inicial",
        essential: true,
        done: implantacoes.length > 0 && semCusto.size === 0,
        ...(semCusto.size > 0
          ? { detail: `${semCusto.size} ${semCusto.size === 1 ? "produto sem custo" : "produtos sem custo"}` }
          : {}),
        href: "/emporio/produtos",
      },
      { key: "saldo_caixa", essential: true, done: saldo > 0, href: "/emporio/caixa" },
    ];
    if (cartaoVendido.length > 0) {
      steps.push({
        key: "taxa_cartao",
        essential: true,
        done: faltam.length === 0,
        ...(faltam.length > 0
          ? { detail: `Falta a taxa de ${faltam.map((k) => ROTULO_CARTAO[k] ?? k).join(", ")}` }
          : {}),
        href: "/emporio/caixa",
      });
    }
    steps.push(
      { key: "despesa_fixa", essential: true, done: fixas > 0, href: "/emporio/despesas" },
      { key: "minimo_maximo", essential: false, done: limites > 0, href: "/emporio/produtos" },
      { key: "conta_pix", essential: false, done: loja.pix_bank_account_id !== null, href: "/emporio/caixa" },
    );
    // Q132: só quem pode definir o Gestor vê o aviso, e ele nunca conta como essencial
    // (nem entra em `steps`: `PassoKey` é fechado e a tela mapeia cada chave a um rótulo).
    establishments.push({
      establishment_id: loja.id,
      name: loja.name,
      steps,
      sem_gestor:
        podeDefinirGestor && semGestor.has(loja.id)
          ? { essential: false, message: `Defina um Gestor para a ${loja.name}`, href: "/emporio/equipe" }
          : null,
    });
  }

  const complete = establishments.every((l) => l.steps.every((s) => !s.essential || s.done));
  return ok({ complete, establishments });
}
