import { exigirBancoLocal } from "./_banco-local";

/**
 * O único jeito de suítes e cenários abrirem um turno de caixa (entrega 2): pela
 * própria `abrirTurnoAction`, nunca por insert direto, para o turno nascer com a
 * contagem de abertura e o Histórico como na tela.
 *
 * Sem `counted`, conta exatamente o esperado (o saldo do caixa), então a
 * abertura não cria dinheiro: o troco de quem precisa de um número entra antes,
 * pelo saldo inicial do caixa ou pelo reforço da gerência. Sem `cash_register_id`,
 * abre o Caixa 1 da loja; se o caixa já está aberto, devolve o turno aberto.
 */

type Db = import("@/lib/prisma").TenantPrismaClient;
type Ator = import("@/lib/actions/emporio-catalogo").Ator;

let seq = 0;

export async function abrirTurnoDeTeste(
  db: Db,
  user: Ator,
  establishmentId: string,
  counted?: number,
  opts: { cash_register_id?: string; reinforcement?: number; justification?: string } = {},
): Promise<{ id: string; cash_register_id: string }> {
  exigirBancoLocal();
  const { abrirTurnoAction } = await import("@/lib/actions/emporio-turno");
  const { saldoDoCaixa } = await import("@/lib/actions/emporio-caixa");

  const caixa = opts.cash_register_id
    ? await db.cashRegister.findFirst({ where: { id: opts.cash_register_id, establishment_id: establishmentId } })
    : await db.cashRegister.findFirst({ where: { establishment_id: establishmentId, number: 1 } });
  if (!caixa) throw new Error(`abrirTurnoDeTeste: a loja ${establishmentId} não tem o caixa pedido`);

  const aberto = await db.cashSession.findFirst({ where: { open_register_id: caixa.id }, select: { id: true } });
  if (aberto) return { id: aberto.id, cash_register_id: caixa.id };

  const reforco = opts.reinforcement ?? 0;
  const contado = counted ?? ((await saldoDoCaixa(db, caixa.id)) + Math.round(reforco * 100)) / 100;
  const r = await abrirTurnoAction(db, user, {
    operation_key: `teste-turno-${caixa.id}-${Date.now()}-${(seq += 1)}`,
    cash_register_id: caixa.id,
    counted: contado,
    reinforcement: opts.reinforcement,
    justification: opts.justification,
  });
  if (!r.ok) throw new Error(`abrirTurnoDeTeste: ${JSON.stringify(r)}`);
  return { id: r.data.id, cash_register_id: caixa.id };
}
