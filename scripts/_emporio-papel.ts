/**
 * Fixtures das suítes do Empório (m78 a m86) depois da F6b (Q118): o papel da
 * conta (ADMIN, OPERADOR) já não decide nada no Empório, quem decide é o
 * `emporio_role`. Estes campos dão ao usuário de teste o papel equivalente:
 * - ADMIN vira Gerente geral (vê todas as lojas, faz tudo o que o ADMIN fazia);
 * - OPERADOR vira Vendedor com TODAS as chaves ligadas (o OPERADOR de antes
 *   cadastrava produto, contava, lançava compra etc.), e precisa de loja:
 *   use `vincularTodas` depois de criar os estabelecimentos;
 * - OWNER e VISUALIZADOR ficam como estavam (Dono sempre vê; VISUALIZADOR sem função).
 */
export const TODAS_AS_CHAVES = [
  "devolver_trocar",
  "lancar_compra",
  "contagem",
  "perda",
  "estoque_inicial",
  "producao",
  "transferir_caixa",
  "depositar_cheque",
  "cadastrar_produto",
] as const;

export function papelDeFixture(role: "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR") {
  if (role === "ADMIN") return { emporio_role: "gerente_geral" as const };
  if (role === "OPERADOR") return { emporio_role: "vendedor" as const, emporio_keys: [...TODAS_AS_CHAVES] };
  return {};
}

type Vinculavel = {
  userEstablishment: { createMany: (a: { data: { tenant_id: string; user_id: string; establishment_id: string }[]; skipDuplicates?: boolean }) => Promise<unknown> };
};

/** Liga cada usuário a cada loja (o Vendedor e o Gestor só veem as lojas que têm). */
export async function vincularTodas(prisma: Vinculavel, tenantId: string, userIds: string[], lojaIds: string[]) {
  await prisma.userEstablishment.createMany({
    data: userIds.flatMap((u) => lojaIds.map((e) => ({ tenant_id: tenantId, user_id: u, establishment_id: e }))),
    skipDuplicates: true,
  });
}

/** Gestor: o Gerente geral não é limitado por vínculo (Q118), então quem testa vínculo precisa ser Gestor. */
export async function virarGestor(
  prisma: { user: { update: (a: { where: { id: string }; data: { emporio_role: "gestor"; emporio_keys: string[] } }) => Promise<unknown> } },
  userId: string,
) {
  await prisma.user.update({ where: { id: userId }, data: { emporio_role: "gestor", emporio_keys: [] } });
}

/** Vendedor com todas as chaves: quem testa vínculo sem ganhar a leitura de estoque do Gestor (Q128). */
export async function virarVendedor(
  prisma: { user: { update: (a: { where: { id: string }; data: { emporio_role: "vendedor"; emporio_keys: string[] } }) => Promise<unknown> } },
  userId: string,
) {
  await prisma.user.update({ where: { id: userId }, data: { emporio_role: "vendedor", emporio_keys: [...TODAS_AS_CHAVES] } });
}
