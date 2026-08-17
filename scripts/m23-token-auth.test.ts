import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import { createTestAnimal } from "./helpers/herd";

exigirBancoLocal();


/**
 * Testes da identidade por token do aplicativo (Onda 1, agente A1).
 * Roda: `npm run test:m23`
 *
 * O ponto central deste módulo é que rotas `/api/v1/*` JÁ EXISTENTES passam a
 * aceitar `Authorization: Bearer` sem terem sido alteradas. Testar só as
 * funções de token provaria a metade fácil, então aqui os handlers reais de
 * `/api/v1/animals` são invocados dentro de um escopo de requisição do Next
 * montado à mão, com o header de verdade: é o que faz `headers()` funcionar
 * fora do servidor.
 *
 * `globalThis.AsyncLocalStorage` precisa existir ANTES de qualquer módulo do
 * Next ser carregado (é no carregamento que o Next decide entre o
 * AsyncLocalStorage real e um substituto que lança ao ser usado). Por isso
 * todo o resto é importado dinamicamente, dentro de `main()`.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

type Json = { data?: unknown; error?: { code: string; message: string } };
async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

async function main() {
  console.log("🔒 M23: identidade por token (aplicativo)\n");

  const bcrypt = (await import("bcryptjs")).default;
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const {
    signAccessToken,
    verifyAccessToken,
    readBearerToken,
    resolveSessionUserFromAccessToken,
  } = await import("@/lib/auth-token");
  const { requestAsyncStorage } = await import(
    "next/dist/client/components/request-async-storage.external"
  );
  const tokenRoute = await import("@/app/api/v1/auth/token/route");
  const refreshRoute = await import("@/app/api/v1/auth/token/refresh/route");
  const revokeRoute = await import("@/app/api/v1/auth/token/revoke/route");
  // Rotas de negócio EXISTENTES, importadas exatamente como estão no repositório.
  const animalsRoute = await import("@/app/api/v1/animals/route");
  const animalDetailRoute = await import("@/app/api/v1/animals/[id]/route");

  /** Executa `fn` como se fosse uma requisição com (ou sem) header Authorization. */
  function withBearer<T>(token: string | null, fn: () => Promise<T>): Promise<T> {
    const store = {
      headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
      cookies: { get: () => undefined, getAll: () => [], has: () => false },
      mutableCookies: { get: () => undefined, getAll: () => [], has: () => false, set: () => {} },
      draftMode: { isEnabled: false },
    } as unknown as Parameters<typeof requestAsyncStorage.run>[0];
    return requestAsyncStorage.run(store, fn);
  }

  function post(url: string, payload: unknown): Request {
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const stamp = Date.now();
  const password = "SenhaForte#2026";
  const hash = await bcrypt.hash(password, 10);

  async function makeTenant(label: string, earTag: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `M23 Tenant ${label}`,
        document: `M23${label}${stamp}`.slice(0, 14),
        plan: "fazenda",
      },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: `M23 User ${label}`,
        email: `m23-${label.toLowerCase()}-${stamp}@teste.local`,
        password_hash: hash,
        role: "OWNER",
      },
    });
    const db = prismaForTenant(tenant.id);
    await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
    const property = await db.property.create({ data: scoped({ name: `Faz ${label}` }) });
    const animal = await createTestAnimal(db, tenant.id, { ear_tag: earTag, breed: "Nelore", sex: "male", property_id: property.id });
    return { tenant, user, animal };
  }

  const A = await makeTenant("A", "M23-A-001");
  const B = await makeTenant("B", "M23-B-001");

  try {
    // ── 1. Login por senha ────────────────────────────────────────────────
    let res = await tokenRoute.POST(
      post("http://localhost/api/v1/auth/token", { email: A.user.email, password }),
    );
    const loginOk = await body(res);
    const pair = loginOk.data as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
      user: { id: string; role: string; tenant_id?: string };
    };
    assert(res.status === 200, "login com senha correta responde 200");
    assert(
      typeof pair?.access_token === "string" && typeof pair?.refresh_token === "string",
      "login devolve os dois tokens (access + refresh)",
    );
    assert(pair?.token_type === "Bearer" && pair?.expires_in === 900, "access token expira em 15 minutos");
    assert(pair?.user?.id === A.user.id, "login devolve o usuário autenticado");

    res = await tokenRoute.POST(
      post("http://localhost/api/v1/auth/token", { email: A.user.email, password: "errada" }),
    );
    const loginBad = await body(res);
    assert(
      res.status === 401 && loginBad.error?.code === "INVALID_CREDENTIALS" && !loginBad.data,
      "senha errada não devolve token nenhum (401 INVALID_CREDENTIALS)",
    );

    res = await tokenRoute.POST(
      post("http://localhost/api/v1/auth/token", {
        email: `nao-existe-${stamp}@teste.local`,
        password,
      }),
    );
    assert(
      res.status === 401 && (await body(res)).error?.code === "INVALID_CREDENTIALS",
      "conta inexistente devolve o MESMO erro de senha errada (sem oráculo de existência)",
    );

    // ── 2. tenant_id não é autoridade no token ────────────────────────────
    const claims = JSON.parse(
      Buffer.from(pair.access_token.split(".")[1], "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    assert(claims.sub === A.user.id, "access token carrega apenas o user_id como identidade (sub)");
    assert(
      !("tenant_id" in claims) && !("tid" in claims),
      "access token NÃO carrega tenant_id: o tenant é resolvido no servidor",
    );
    assert(
      pair.user?.tenant_id === undefined,
      "resposta do login não devolve tenant_id ao aplicativo",
    );
    const resolved = await resolveSessionUserFromAccessToken(pair.access_token);
    assert(
      resolved?.tenant_id === A.tenant.id && resolved?.role === "OWNER",
      "tenant_id e role vêm da linha de User no banco, não do token",
    );

    // ── 3. Rota /api/v1 EXISTENTE autentica por token, sem ter sido alterada ──
    res = await withBearer(pair.access_token, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    const list = (await body(res)).data as Array<{ id: string; ear_tag: string }>;
    assert(res.status === 200, "GET /api/v1/animals responde 200 com access token válido");
    assert(
      Array.isArray(list) && list.length === 1 && list[0].ear_tag === "M23-A-001",
      "a rota devolve os dados do tenant do token",
    );

    res = await withBearer(null, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(
      res.status === 401 && (await body(res)).error?.code === "UNAUTHORIZED",
      "a mesma rota responde 401 sem Authorization",
    );

    res = await withBearer("lixo-que-nao-e-token", () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(res.status === 401, "token malformado é recusado (401)");

    // ── 4. Isolamento entre tenants ───────────────────────────────────────
    res = await withBearer(pair.access_token, () =>
      animalDetailRoute.GET(new Request("http://localhost/api/v1/animals/x"), {
        params: { id: B.animal.id },
      }),
    );
    assert(
      res.status === 404 && (await body(res)).error?.code === "NOT_FOUND",
      "token do tenant A não alcança animal do tenant B (404)",
    );

    const tokenB = signAccessToken(B.user.id);
    res = await withBearer(tokenB, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    const listB = (await body(res)).data as Array<{ ear_tag: string }>;
    assert(
      listB.length === 1 && listB[0].ear_tag === "M23-B-001",
      "token do tenant B enxerga apenas o rebanho de B",
    );

    // ── 5. Validade e integridade do access token ─────────────────────────
    const expired = signAccessToken(A.user.id, -1);
    assert(verifyAccessToken(expired) === null, "token expirado é recusado pela verificação");
    res = await withBearer(expired, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(res.status === 401, "token expirado é recusado pela rota (401)");

    const [h, p, s] = pair.access_token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: B.user.id, typ: "mobile_access", iat: 1, exp: 4102444800 }),
      "utf-8",
    ).toString("base64url");
    assert(
      verifyAccessToken(`${h}.${forgedPayload}.${s}`) === null,
      "trocar o sub sem reassinar é recusado (assinatura confere antes de qualquer parse)",
    );
    const alg = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf-8").toString("base64url");
    assert(verifyAccessToken(`${alg}.${p}.`) === null, "token com alg:none é recusado");
    assert(
      readBearerToken("bearer abc") === "abc" && readBearerToken("Basic abc") === null,
      "readBearerToken aceita só o esquema Bearer (case-insensitive)",
    );

    // ── 6. Refresh com rotação e uso único ────────────────────────────────
    res = await refreshRoute.POST(
      post("http://localhost/api/v1/auth/token/refresh", { refresh_token: pair.refresh_token }),
    );
    const rotated = (await body(res)).data as { access_token: string; refresh_token: string };
    assert(res.status === 200, "refresh com token válido responde 200");
    assert(
      typeof rotated?.access_token === "string" &&
        typeof rotated?.refresh_token === "string" &&
        rotated.refresh_token !== pair.refresh_token,
      "refresh devolve um par novo, com refresh token diferente do anterior",
    );

    res = await refreshRoute.POST(
      post("http://localhost/api/v1/auth/token/refresh", { refresh_token: pair.refresh_token }),
    );
    assert(
      res.status === 401 && (await body(res)).error?.code === "INVALID_REFRESH_TOKEN",
      "refresh já usado é recusado (uso único: o anterior foi invalidado)",
    );

    res = await withBearer(rotated.access_token, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(res.status === 200, "o access token vindo da rotação autentica a rota existente");

    // ── 7. Revogação ──────────────────────────────────────────────────────
    res = await revokeRoute.POST(
      post("http://localhost/api/v1/auth/token/revoke", { refresh_token: rotated.refresh_token }),
    );
    assert(res.status === 200, "revoke responde 200");

    res = await refreshRoute.POST(
      post("http://localhost/api/v1/auth/token/refresh", { refresh_token: rotated.refresh_token }),
    );
    assert(
      res.status === 401 && (await body(res)).error?.code === "INVALID_REFRESH_TOKEN",
      "refresh revogado não renova mais: a sessão do aplicativo morre com o access atual",
    );

    res = await revokeRoute.POST(
      post("http://localhost/api/v1/auth/token/revoke", { refresh_token: "inexistente" }),
    );
    assert(res.status === 200, "revoke de token inexistente responde igual (sem oráculo)");

    // ── 8. Usuário desativado ─────────────────────────────────────────────
    await prisma.user.update({ where: { id: B.user.id }, data: { active: false } });
    res = await withBearer(tokenB, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(res.status === 401, "token de usuário desativado deixa de autenticar na hora");
    await prisma.user.update({ where: { id: B.user.id }, data: { active: true } });

    // ── 9. O gate de sessão continua valendo para quem entra por token ────
    await prisma.user.update({ where: { id: A.user.id }, data: { must_change_password: true } });

    res = await tokenRoute.POST(
      post("http://localhost/api/v1/auth/token", { email: A.user.email, password }),
    );
    const gated = (await body(res)).data as { access_token: string };
    assert(
      res.status === 200 && typeof gated?.access_token === "string",
      "usuário com must_change_password AUTENTICA (precisa entrar para trocar a senha)",
    );

    const gatedUser = await resolveSessionUserFromAccessToken(gated.access_token);
    assert(gatedUser?.id === A.user.id, "a identidade resolve normalmente nesse estado");

    res = await withBearer(gated.access_token, () =>
      animalsRoute.GET(new Request("http://localhost/api/v1/animals")),
    );
    assert(
      res.status === 403 && (await body(res)).error?.code === "MUST_CHANGE_PASSWORD",
      "mas o gate de sessão barra a rota de negócio, exatamente como no navegador",
    );
    await prisma.user.update({ where: { id: A.user.id }, data: { must_change_password: false } });

    // ── 10. Persistência: só o hash do refresh vai para o banco ───────────
    const stored = await prismaForTenant(A.tenant.id).refreshToken.findMany();
    assert(
      stored.length > 0 &&
        stored.every((r) => r.token_hash.length === 64 && r.token_hash !== pair.refresh_token),
      "o refresh token em claro nunca é persistido (só o hash)",
    );
    const seenFromB = await prismaForTenant(B.tenant.id).refreshToken.findMany({
      where: { user_id: A.user.id },
    });
    assert(seenFromB.length === 0, "RefreshToken é tenant-scoped: B não enxerga token de A");
  } finally {
    await prisma.tenant.delete({ where: { id: A.tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: B.tenant.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "\n✅ M23: 0 falhas." : `\n❌ M23: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
