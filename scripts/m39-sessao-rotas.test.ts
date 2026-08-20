import "dotenv/config";
import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Quem pode entrar onde, sem sessao e com sessao.
 *
 * Esta suite existe por causa do defeito de 2026-08-01: o middleware nao
 * bloqueava NADA por sessao de tenant havia meses, porque `auth()` na forma
 * HOF descarta o resultado de `callbacks.authorized`. Passou por `tsc`, por
 * `lint` e pela suite inteira, e so apareceu quando alguem foi olhar. O que
 * faltava nao era outra biblioteca de auth: era um teste que provasse que a
 * porta fecha.
 *
 * `authorized` e uma funcao pura (recebe a sessao e a requisicao), entao roda
 * sem banco e sem servidor, no job rapido do CI.
 *
 * Roda: `npm run test:m39` (sem DB necessario).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

/** Sessao de tenant minima, na forma que o next-auth entrega ao callback. */
const COM_SESSAO = {
  user: { id: "u1", tenant_id: "t1", role: "OWNER" },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Parameters<typeof authConfig.callbacks.authorized>[0]["auth"];

/**
 * As rotas do route group `(public)`, derivadas dos `page.tsx` em disco. O
 * nome do grupo entre parenteses nao entra na URL, e os segmentos dinamicos
 * ficam de fora: nao ha nenhum ali hoje, e inventar um valor tornaria o teste
 * uma afirmacao sobre dado, nao sobre rota.
 */
function rotasPublicasEmDisco(): string[] {
  const raiz = path.join(process.cwd(), "src", "app", "(public)");
  const achadas: string[] = [];

  function andar(dir: string, prefixo: string) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name.startsWith("_") || item.name.startsWith("[")) continue;
        const segmento = item.name.startsWith("(") ? "" : `/${item.name}`;
        andar(caminho, `${prefixo}${segmento}`);
      } else if (item.name === "page.tsx") {
        achadas.push(prefixo === "" ? "/" : prefixo);
      }
    }
  }

  andar(raiz, "");
  return achadas.sort();
}

function podeEntrar(pathname: string, auth: typeof COM_SESSAO | null): boolean {
  const request = new NextRequest(new URL(pathname, "https://tibe-agrogestao.vercel.app"));
  return authConfig.callbacks.authorized({ auth, request }) as boolean;
}

function main() {
  console.log("🔒 Teste de gate de sessao por rota (M39)\n");

  console.log("1. Rota de painel exige sessao");
  for (const rota of ["/dashboard", "/rebanho", "/financeiro", "/configuracoes/usuarios"]) {
    assert(podeEntrar(rota, null) === false, `${rota} sem sessao e recusada`);
    assert(podeEntrar(rota, COM_SESSAO) === true, `${rota} com sessao e liberada`);
  }

  console.log("\n2. Rota de API nunca redireciona: quem responde e o handler");
  // Redirecionar aqui devolveria 307 HTML para um cliente que espera 401 JSON.
  // O aplicativo movel depende disso para distinguir "sem sessao" de "sem rede".
  for (const rota of ["/api/v1/animals", "/api/v1/financial-entries", "/api/internal/whatsapp/execute-action", "/api/webhooks/asaas"]) {
    assert(podeEntrar(rota, null) === true, `${rota} passa pelo middleware sem sessao`);
  }

  console.log("\n3. Rotas publicas de verdade");
  for (const rota of ["/", "/login", "/faq", "/manifest.webmanifest", "/sw.js", "/offline.html", "/robots.txt", "/sitemap.xml"]) {
    assert(podeEntrar(rota, null) === true, `${rota} e publica`);
  }

  console.log("\n4. Prefixos publicos alcancam as sub-rotas");
  // O cadastro do Modulo 19 tem etapas em sub-rota: como caminho exato, o
  // middleware mandaria o visitante ao /login no meio do cadastro.
  for (const rota of [
    "/criar-conta",
    "/criar-conta/whatsapp",
    "/criar-conta/email",
    "/planos",
    "/politicas/privacidade",
    "/docs/api",
    "/esqueci-senha/verificar",
  ]) {
    assert(podeEntrar(rota, null) === true, `${rota} e publica`);
  }

  console.log("\n5. /plataforma sai da checagem de tenant (tem sessao propria)");
  // Nao e permissividade: o gate de PlatformUser roda em middleware.ts, com
  // cookie e secret proprios. Aqui so precisa nao ser barrado pela sessao errada.
  assert(podeEntrar("/plataforma", null) === true, "/plataforma passa pelo gate de tenant");
  assert(podeEntrar("/plataforma/tenants", null) === true, "/plataforma/tenants tambem");

  console.log("\n6. Prefixo publico nao vaza para rota vizinha");
  // `startsWith` cru transformaria qualquer rota futura que COMECE com o texto
  // de um prefixo publico numa rota publica, calada. Nenhuma existe hoje: o
  // teste esta aqui para que criar uma seja uma decisao, nao um acidente.
  for (const rota of ["/planosecreto", "/docsinterno", "/plataformax", "/criar-contas-em-massa"]) {
    assert(podeEntrar(rota, null) === false, `${rota} NAO herda publicidade do prefixo`);
  }

  console.log("\n7. Toda pagina de (public) em disco e alcancavel sem sessao");
  // Lido do disco, nao de uma lista escrita a mao: pagina publica nova que
  // ninguem liberou no auth.config aparece aqui, em vez de so no primeiro
  // visitante que for mandado ao /login sem motivo.
  for (const rota of rotasPublicasEmDisco()) {
    assert(podeEntrar(rota, null) === true, `${rota} (em disco) e alcancavel`);
  }

  console.log("");
  if (failures > 0) {
    console.error(`❌ ${failures} falha(s).`);
    process.exit(1);
  }
  console.log("✅ Gate de sessao consistente: 0 falhas.");
}

main();
