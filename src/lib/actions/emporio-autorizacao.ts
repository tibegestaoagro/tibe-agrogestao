import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { exigir, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { registrarNoHistorico } from "@/lib/emporio/historico";
import { autorizadoresDaLoja } from "@/lib/emporio/autorizadores";
import { assinarAutorizacao, marcaDoPin } from "@/lib/emporio/autorizacao-desconto";
import { registrarFalha, resetLoginRateLimit } from "@/lib/rate-limit";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório: o PIN do gestor e a autorização de desconto (Q331 a Q333). Validação em TypeScript
 * puro de propósito: o WhatsApp chama estas funções sem passar pelo Zod da rota. O PIN e o token
 * nunca vão para o histórico nem para o log.
 */

type Ator = { id: string; role: AppUserRole };

const MAX_TENTATIVAS = 5;
const JANELA_SEG = 900;

export type AutorizadorView = { id: string; name: string };

export type AutorizacaoView = {
  authorization: string;
  discount_pct: number;
  expires_at: string;
  authorizer: AutorizadorView;
};

async function lojaDoAtor(db: TenantPrismaClient, ator: Ator, establishmentId: unknown) {
  if (typeof establishmentId !== "string" || !establishmentId) {
    return { loja: null, neg: fail("VALIDATION_ERROR", "Escolha a loja.", 422, "establishment_id") };
  }
  const loja = await db.establishment.findFirst({
    where: { id: establishmentId, archived_at: null },
    select: { id: true, name: true },
  });
  if (!loja) return { loja: null, neg: fail("NOT_FOUND", "Loja não encontrada.", 404) };
  const neg = await exigir(db, ator, "vendedor_da_loja", "vender nessa loja", loja.id);
  if (neg) return { loja: null, neg };
  return { loja, neg: null };
}

export async function listarAutorizadoresDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
): Promise<ActionResult<AutorizadorView[]>> {
  const { loja, neg } = await lojaDoAtor(db, ator, establishment_id);
  if (neg || !loja) return neg ?? fail("NOT_FOUND", "Loja não encontrada.", 404);
  return ok(await autorizadoresDaLoja(db, loja.id));
}

export async function autorizarDescontoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id: string; authorizer_user_id: string; pin: string; discount_pct: number },
): Promise<ActionResult<AutorizacaoView>> {
  const { loja, neg } = await lojaDoAtor(db, ator, input.establishment_id);
  if (neg || !loja) return neg ?? fail("NOT_FOUND", "Loja não encontrada.", 404);

  const pct = input.discount_pct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    return fail("VALIDATION_ERROR", "O desconto deve ficar entre 0 e 100%.", 422, "discount_pct");
  }
  if (typeof input.authorizer_user_id !== "string" || !input.authorizer_user_id) {
    return fail("VALIDATION_ERROR", "Escolha quem autoriza.", 422, "authorizer_user_id");
  }
  const autorizador = (await autorizadoresDaLoja(db, loja.id)).find((a) => a.id === input.authorizer_user_id);
  if (!autorizador) {
    return fail("VALIDATION_ERROR", "Essa pessoa não pode autorizar desconto nessa loja.", 422, "authorizer_user_id");
  }
  if (typeof input.pin !== "string" || !input.pin) {
    return fail("VALIDATION_ERROR", "Informe o PIN.", 422, "pin");
  }

  // Conta ANTES de conferir, num passo atômico do Redis: pedidos em paralelo recebem contagens
  // distintas, e do 6º em diante nenhum chega ao bcrypt.
  const tentativa = await registrarFalha("emporio-pin", autorizador.id, MAX_TENTATIVAS, JANELA_SEG);
  if (tentativa > MAX_TENTATIVAS) {
    return fail("PIN_LOCKED", "Muitas tentativas. Tente de novo em 15 minutos.", 429, "pin");
  }
  const dono = await db.user.findFirst({ where: { id: autorizador.id }, select: { emporio_auth_pin_hash: true } });
  const hash = dono?.emporio_auth_pin_hash;
  const confere = hash ? await bcrypt.compare(input.pin, hash) : false;
  if (!hash || !confere) {
    return fail("INVALID_PIN", "PIN incorreto.", 422, "pin");
  }
  await resetLoginRateLimit("emporio-pin", autorizador.id);

  const token = assinarAutorizacao({
    establishment_id: loja.id,
    authorizer_user_id: autorizador.id,
    requester_user_id: ator.id,
    max_pct: pct,
    pin_fp: marcaDoPin(hash),
  });
  const exp = Number(JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf-8")).exp);

  const quem = await db.user.findFirst({ where: { id: ator.id }, select: { name: true } });
  await registrarNoHistorico(db, ator, {
    action: "desconto.autorizar",
    establishment_id: loja.id,
    target_type: "usuario",
    target_id: autorizador.id,
    summary: `${autorizador.name} autorizou com PIN desconto de até ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% na ${loja.name} para ${quem?.name ?? "o vendedor"}`,
  });

  return ok({
    authorization: token,
    discount_pct: pct,
    expires_at: new Date(exp).toISOString(),
    authorizer: { id: autorizador.id, name: autorizador.name },
  });
}

export async function definirMeuPinAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { pin: string; password: string },
): Promise<ActionResult<{ has_pin: true }>> {
  const contexto = await papelDoEmporio(db, ator);
  if (!pode(contexto, "gestor_da_loja")) {
    return fail("FORBIDDEN", "Só o dono, o gerente geral e o gestor têm PIN de autorização.", 403);
  }
  if (typeof input.pin !== "string" || !/^\d{4,6}$/.test(input.pin)) {
    return fail("VALIDATION_ERROR", "O PIN deve ter de 4 a 6 números.", 422, "pin");
  }
  if (typeof input.password !== "string" || !input.password) {
    return fail("VALIDATION_ERROR", "Informe sua senha.", 422, "password");
  }
  const tentativa = await registrarFalha("emporio-pin-senha", ator.id, MAX_TENTATIVAS, JANELA_SEG);
  if (tentativa > MAX_TENTATIVAS) {
    return fail("PASSWORD_LOCKED", "Muitas tentativas. Tente de novo em 15 minutos.", 429, "password");
  }
  const u = await db.user.findFirst({ where: { id: ator.id }, select: { password_hash: true } });
  if (!u) return fail("NOT_FOUND", "Usuário não encontrado.", 404);
  if (!(await bcrypt.compare(input.password, u.password_hash))) {
    return fail("INVALID_PASSWORD", "Senha incorreta.", 422, "password");
  }
  await resetLoginRateLimit("emporio-pin-senha", ator.id);

  const hash = await bcrypt.hash(input.pin, 10);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ator.id }, data: { emporio_auth_pin_hash: hash } });
    await registrarNoHistorico(tx, ator, {
      action: "pin.definir",
      target_type: "usuario",
      target_id: ator.id,
      summary: "Definiu o PIN de autorização",
    });
  });
  return ok({ has_pin: true });
}
