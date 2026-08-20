import "dotenv/config";
import { withApi } from "@/lib/route";

/**
 * O envelope de erro do contrato vale para TODA rota, inclusive quando ninguem
 * previu a excecao.
 *
 * Antes disto, 107 das 113 rotas nao tinham `try`: qualquer erro nao previsto
 * saia como erro padrao do Next, e o aplicativo, que faz parse de
 * `{ error: { code, message } }`, recebia HTML onde esperava JSON.
 *
 * Testa as DUAS bordas, porque so a positiva nao prova nada: que o wrapper
 * captura o que deve, e que ele NAO captura o que precisa subir.
 *
 * Roda: `npm run test:m40` (sem DB necessario).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

function req(url = "http://localhost/api/v1/teste") {
  return new Request(url);
}

/** Erro no formato que o Prisma devolve, com `code` no objeto. */
function erroPrisma(code: string) {
  return Object.assign(new Error(`Prisma disse ${code}`), { code });
}

async function main() {
  console.log("🛡️  M40: envelope de erro garantido\n");

  console.log("1. Sucesso passa intacto");
  {
    const rota = withApi(async (_req: Request) => Response.json({ data: { ok: 1 }, meta: {} }));
    const res = await rota(req());
    const body = (await res.json()) as { data?: { ok: number } };
    assert(res.status === 200 && body.data?.ok === 1, "resposta normal atravessa o wrapper sem mudanca");
  }

  console.log("\n2. Excecao nao prevista vira o envelope, com 500");
  {
    const rota = withApi(async (_req: Request) => {
      throw new TypeError("Cannot read properties of undefined (reading 'nome')");
    });
    const res = await rota(req());
    const body = (await res.json()) as { error?: { code: string; message: string } };
    assert(res.status === 500, "responde 500");
    assert(body.error?.code === "INTERNAL_ERROR", "devolve code INTERNAL_ERROR");
    assert(typeof body.error?.message === "string" && body.error.message.length > 0, "devolve message");
    assert(
      !JSON.stringify(body).includes("Cannot read properties"),
      "NAO vaza a mensagem interna do erro para o cliente",
    );
    assert(
      /c[oó]digo [0-9a-f]{8}/.test(body.error?.message ?? ""),
      "devolve um identificador para casar com o log",
    );
  }

  console.log("\n3. Erro conhecido do Prisma vira status de negocio");
  {
    const casos: [string, number, string][] = [
      ["P2002", 409, "DUPLICATE"],
      ["P2025", 404, "NOT_FOUND"],
      ["P2003", 422, "RELATED_NOT_FOUND"],
      ["P2034", 409, "CONFLICT"],
    ];
    for (const [code, status, esperado] of casos) {
      const rota = withApi(async (_req: Request) => {
        throw erroPrisma(code);
      });
      const res = await rota(req());
      const body = (await res.json()) as { error?: { code: string } };
      assert(
        res.status === status && body.error?.code === esperado,
        `${code} vira ${status} ${esperado} (e nao 500)`,
      );
    }
  }

  console.log("\n4. Controle de fluxo do Next NAO e engolido");
  {
    // `redirect()` e `notFound()` sinalizam por excecao com `digest`, e o
    // framework depende de ela subir. Transformar isso em 500 quebraria
    // redirecionamento legitimo, e seria um defeito silencioso.
    const rota = withApi(async (_req: Request) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    });
    let subiu = false;
    try {
      await rota(req());
    } catch (e) {
      subiu = typeof (e as { digest?: unknown })?.digest === "string";
    }
    assert(subiu, "excecao com digest sobe para o Next em vez de virar 500");
  }

  console.log("\n5. Erro sem `code` conhecido nao e confundido com erro de negocio");
  {
    const rota = withApi(async (_req: Request) => {
      throw erroPrisma("P9999");
    });
    const res = await rota(req());
    const body = (await res.json()) as { error?: { code: string } };
    assert(res.status === 500 && body.error?.code === "INTERNAL_ERROR", "codigo desconhecido do Prisma cai em 500");
  }

  console.log("\n6. Toda rota do repositorio esta envolvida");
  {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const raiz = path.join(process.cwd(), "src", "app", "api");
    const semWrapper: string[] = [];

    function andar(dir: string) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const caminho = path.join(dir, item.name);
        if (item.isDirectory()) andar(caminho);
        else if (item.name === "route.ts") {
          const texto = readFileSync(caminho, "utf-8");
          // As rotas do NextAuth reexportam os handlers da propria biblioteca
          // (`export const { GET, POST } = handlers`): nao ha handler nosso ali.
          if (texto.includes("from \"@/lib/auth\"") || texto.includes("from \"@/lib/platform-auth\"")) continue;
          if (/^export async function (GET|POST|PATCH|PUT|DELETE)/m.test(texto)) {
            semWrapper.push(path.relative(process.cwd(), caminho));
          }
        }
      }
    }

    andar(raiz);
    assert(
      semWrapper.length === 0,
      semWrapper.length === 0
        ? "nenhuma rota exporta handler cru"
        : `rotas sem withApi: ${semWrapper.join(", ")}`,
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`❌ ${failures} falha(s).`);
    process.exit(1);
  }
  console.log("✅ Envelope de erro garantido: 0 falhas.");
}

main();
