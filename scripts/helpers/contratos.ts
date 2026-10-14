import type { z } from "zod";

/**
 * O que a `m73` usa para prender um contrato de `packages/contracts` à rota de
 * verdade. Separado da suíte para cada domínio ter a sua seção num arquivo
 * próprio (`scripts/helpers/contratos/<dominio>.ts`), com tenant próprio e
 * limpeza própria, sem todos editarem o mesmo arquivo.
 */

export type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export type Rota = { [k: string]: unknown };
type Def = { type: string; shape?: Record<string, unknown>; element?: unknown; innerType?: unknown; valueType?: unknown; options?: unknown[]; in?: unknown };

let failures = 0;
export function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}
export const falhas = () => failures;

function def(schema: unknown): Def {
  return (schema as { _zod: { def: Def } })._zod.def;
}

/**
 * Anda pelo valor guiado pelo schema e anota (a) chave que o valor tem e o
 * schema não declara, (b) para cada lista, se ela já apareceu com item
 * (`listas`: caminho para "teve item"). Não valida tipo: isso é do `safeParse`.
 */
function percorre(schema: unknown, valor: unknown, caminho: string, extras: string[], listas: Map<string, boolean>) {
  const d = def(schema);
  if (valor === null || valor === undefined) return;
  switch (d.type) {
    case "optional":
    case "nullable":
    case "default":
      return percorre(d.innerType, valor, caminho, extras, listas);
    case "pipe":
      return percorre(d.in, valor, caminho, extras, listas);
    case "union":
      // Usa a primeira opção que aceita o valor.
      for (const opcao of d.options ?? []) {
        if ((opcao as z.ZodType).safeParse(valor).success) return percorre(opcao, valor, caminho, extras, listas);
      }
      return;
    case "array": {
      const lista = valor as unknown[];
      listas.set(caminho, (listas.get(caminho) ?? false) || lista.length > 0);
      lista.forEach((item) => percorre(d.element, item, `${caminho}[]`, extras, listas));
      return;
    }
    case "record":
      for (const [k, v] of Object.entries(valor as object)) percorre(d.valueType, v, `${caminho}.${k}`, extras, listas);
      return;
    case "object": {
      const shape = d.shape ?? {};
      for (const chave of Object.keys(valor as object)) {
        if (!(chave in shape)) extras.push(`${caminho}.${chave}`);
        else percorre(shape[chave], (valor as Record<string, unknown>)[chave], `${caminho}.${chave}`, extras, listas);
      }
      return;
    }
  }
}

/** Listas que nunca apareceram com item. */
export const nuncaCheias = (listas: Map<string, boolean>) => [...listas].filter(([, cheia]) => !cheia).map(([p]) => p);

/** `chama`, `cria` e `confere` com o token do aplicativo de um usuário. */
export async function clienteDaApi(token: string) {
  const { withBearer } = await import("../_escopo-de-requisicao");

  async function chama(route: Rota, metodo: string, url: string, params: Record<string, string> = {}, corpo?: unknown) {
    const req = new Request(`http://localhost${url}`, {
      method: metodo,
      ...(corpo !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : {}),
    });
    const res = await withBearer(token, () => (route[metodo] as Handler)(req, { params: Promise.resolve(params) }));
    return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown> & { id?: string } } };
  }

  /** Cenário: cria pela rota e devolve o id. Reprova se a rota recusar. */
  async function cria(nome: string, route: Rota, url: string, corpo: unknown, params: Record<string, string> = {}) {
    const r = await chama(route, "POST", url, params, corpo);
    const ok = r.status === 201 || r.status === 200;
    if (!ok) assert(false, `cenário: ${nome} (veio ${r.status} ${JSON.stringify(r.body).slice(0, 200)})`);
    return ok ? String(r.body.data?.id ?? "") : "";
  }

  /**
   * Três provas por resposta: passa no schema, não tem chave que o schema não
   * declare (em toda a profundidade) e toda lista aparece com item.
   * `listas` compartilhado: várias chamadas da mesma rota somam, e quem chama
   * confere as listas vazias no fim, com `nuncaCheias`.
   */
  async function confere<T extends z.ZodType>(
    nome: string,
    route: Rota,
    url: string,
    schema: T,
    params: Record<string, string> = {},
    compartilhado?: Map<string, boolean>,
  ): Promise<z.infer<T> | null> {
    const r = await chama(route, "GET", url, params);
    if (r.status !== 200) {
      assert(false, `${nome}: responde 200 (veio ${r.status} ${JSON.stringify(r.body).slice(0, 160)})`);
      return null;
    }
    const parsed = schema.safeParse(r.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      assert(false, `${nome}: passa no contrato (${issue?.path.join(".")}: ${issue?.message})`);
      return null;
    }
    const extras: string[] = [];
    const listas = compartilhado ?? new Map<string, boolean>();
    percorre(schema, r.body, "", extras, listas);
    const vazias = compartilhado ? [] : nuncaCheias(listas);
    assert(
      extras.length === 0 && vazias.length === 0,
      `${nome}: passa no contrato${extras.length ? `, mas o contrato não descreve ${extras.join(", ")}` : ""}${vazias.length ? `, mas veio vazio: ${vazias.join(", ")}` : ""}`,
    );
    return parsed.data;
  }

  return { chama, cria, confere };
}

/**
 * Tenant próprio da seção, com dono, os dois perfis, uma fazenda e o token do
 * aplicativo. Cada seção apaga o que criou e chama `apagaTenant` no fim.
 */
export async function tenantDaSecao(sigla: string) {
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { signAccessToken } = await import("@/lib/auth-token");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `${sigla} ${stamp}`, document: `${sigla}${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: `${sigla} Dono`,
      email: `${sigla.toLowerCase()}-${stamp}@teste.local`,
      password_hash: await bcrypt.hash("SenhaForte#2026", 4),
      role: "OWNER",
    },
  });
  const db = prismaForTenant(tenant.id);
  await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
  await db.tenantProfile.create({ data: scoped({ profile_type: "prestador", active: true }) });
  const fazenda = await db.property.create({ data: scoped({ name: `Fazenda ${sigla}`, area_hectares: 100 }) });
  const token = signAccessToken(user.id);
  return { tenant, user, db, fazenda, token, ...(await clienteDaApi(token)) };
}

export type SecaoDeContrato = {
  /** Título impresso pela suíte. */
  titulo: string;
  /** Monta o cenário pelas rotas de escrita, confere as de leitura e limpa. */
  roda: () => Promise<void>;
  /** Pares [nome, enum do pacote, enum do Prisma] que a seção 6 confere. */
  enums: [string, z.ZodEnum, Record<string, string>][];
};
