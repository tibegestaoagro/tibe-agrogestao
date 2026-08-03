import { prismaForTenant, scoped } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * CRUD de PushSubscription (Onda 2). Fica dentro do seam de notificação, não
 * em src/lib/actions/: é o próprio notify() (src/lib/notify/index.ts) quem
 * consome essas inscrições, e não há outro consumidor de negócio hoje.
 */

export type SaveSubscriptionInput = {
  tenant_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Registra a inscrição do aparelho atual (um endpoint = um aparelho+navegador
 * inscrito neste tenant). Reassinar o MESMO endpoint no MESMO tenant atualiza
 * a linha (troca de usuário no mesmo aparelho, chaves renovadas etc).
 *
 * `endpoint` é único GLOBALMENTE (é o próprio push service do navegador quem
 * garante isso, não o Tibé): em tese o mesmo aparelho poderia reaparecer sob
 * OUTRO tenant (navegador compartilhado, troca de conta). Esse caso não é
 * silenciosamente resolvido aqui: exigiria o client Prisma base para realocar
 * a linha entre tenants (mesma necessidade estrutural de RefreshToken/
 * PasswordResetCode em CLAUDE.md), e usar o client base fora dos casos já
 * documentados é decisão de arquitetura, não deste agente sozinho. Em vez
 * disso, o client ESCOPADO tenta a operação normalmente e, se o endpoint já
 * pertencer a outro tenant, a criação é rejeitada com erro claro, não um 500
 * cru.
 *
 * ⚠️ Deliberadamente NÃO usa `db.pushSubscription.upsert()`: testado e
 * descartado. O `where` combinando um campo único (`endpoint`) com o filtro
 * de tenant injetado pela extension (`extendedWhereUnique`) faz o Prisma
 * gerar `INSERT ... ON CONFLICT (endpoint) DO UPDATE ... WHERE tenant_id =
 * $x`: quando a linha em conflito pertence a OUTRO tenant, o Postgres não
 * lança erro nenhum, só pula a escrita silenciosamente (0 linhas afetadas,
 * `WHERE` do `DO UPDATE` não bateu), e o Prisma resolve o upsert como
 * `null`. Por isso o fluxo abaixo é find-then-create/update explícito: só a
 * `create()` (INSERT puro, sem `ON CONFLICT`) realmente colide com o índice
 * único e dispara P2002 de verdade.
 */
export async function saveSubscription(
  input: SaveSubscriptionInput,
): Promise<ActionResult<{ id: string }>> {
  const db = prismaForTenant(input.tenant_id);

  // Escopado: só enxerga a linha se já pertencer a ESTE tenant. Encontrada,
  // é uma reinscrição normal do mesmo aparelho (chaves renovadas, troca de
  // usuário no aparelho etc).
  const existing = await db.pushSubscription.findFirst({ where: { endpoint: input.endpoint } });
  if (existing) {
    const updated = await db.pushSubscription.update({
      where: { id: existing.id },
      data: { user_id: input.user_id, p256dh: input.p256dh, auth: input.auth },
    });
    return ok({ id: updated.id });
  }

  try {
    const created = await db.pushSubscription.create({
      data: scoped({
        user_id: input.user_id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      }),
    });
    return ok({ id: created.id });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return fail(
        "ENDPOINT_IN_USE",
        "Este aparelho já está inscrito para notificações em outra conta.",
        409,
      );
    }
    throw e;
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Remove a inscrição do usuário atual pelo endpoint. Escopada por tenant E
 * usuário: notificação é preferência pessoal do aparelho, não um recurso
 * compartilhado do tenant (um usuário não cancela a inscrição de outro,
 * mesmo sendo Owner). Idempotente: endpoint inexistente, de outro usuário ou
 * de outro tenant respondem igual (nenhuma linha afetada), sem distinguir os
 * casos para quem chama (mesmo padrão de revokeRefreshToken em auth-token.ts).
 */
export async function removeSubscription(params: {
  tenant_id: string;
  user_id: string;
  endpoint: string;
}): Promise<boolean> {
  const db = prismaForTenant(params.tenant_id);
  const deleted = await db.pushSubscription.deleteMany({
    where: { endpoint: params.endpoint, user_id: params.user_id },
  });
  return deleted.count > 0;
}
