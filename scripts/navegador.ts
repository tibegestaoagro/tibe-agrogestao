import "./_env-local";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { emitirCookiePlataforma, emitirCookieTenant, type CookieEmitido } from "./_sessao-cookie";

/**
 * Roda um roteiro de validacao viva (`scripts/navegador/<nome>.py`) num Chrome
 * SO DE TESTES, com perfil e porta proprios, e nunca no navegador do usuario:
 * la ficam o WhatsApp Business, o CRM e a Evolution abertos, e um passo errado
 * de automacao mexeria neles.
 *
 *   npm run navegador                 # lista os roteiros
 *   npm run navegador -- emporio-f0   # roda um
 *   npm run navegador -- --abrir      # so sobe o Chrome de testes
 *   npm run navegador -- --limpar     # fecha as abas sobrando (fica uma)
 *
 * O roteiro declara no cabecalho o que precisa, e este script prepara:
 *
 *   # cenario: scripts/_cenario-emporio-f0.ts
 *   # sessao: owner owner@example.com
 *   # sessao-plataforma: plat
 *
 * Os cookies sao emitidos sem senha (`_sessao-cookie.ts`). O roteiro chega ao
 * browser-harness pelo stdin, depois de `_lib.py` e de um `CTX` com cookies e
 * tenants. Precisa do `npm run dev` de pe, contra o banco LOCAL.
 */
exigirBancoLocal();

const PORTA = 9333;
const CDP = `http://127.0.0.1:${PORTA}`;
// TIBE_BASE existe para quando a 3000 esta ocupada e o next dev sobe em outra
// porta: o roteiro precisa seguir, e o next dev precisa do NEXTAUTH_URL da
// mesma porta (ver exigirRedirecionamentoNaMesmaPorta).
const BASE = process.env.TIBE_BASE ?? "http://localhost:3000";
const PASTA = join(__dirname, "navegador");
const PERFIL = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".cache"), "tibe-chrome-testes");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

async function responde(url: string, ms: number): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.status < 500;
  } catch {
    return false;
  }
}

/**
 * O NextAuth troca a origem do pedido pela do `NEXTAUTH_URL` antes do proxy, e
 * o `.env.local` diz a 3000. Com o next dev em outra porta, todo redirecionamento
 * do proxy (login, trava do só da loja) ia para a 3000, onde não havia servidor:
 * o `emporio-f6b` passou semanas vermelho por isso. A página sem sessão
 * redireciona ao login com o `callbackUrl`, que leva a origem trocada (o host
 * do próprio Location não: ele sai do `nextUrl`, que guarda o pedido real).
 */
async function exigirRedirecionamentoNaMesmaPorta(): Promise<void> {
  const r = await fetch(`${BASE}/dashboard`, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  const destino = r.headers.get("location");
  const volta = destino ? new URL(destino, BASE).searchParams.get("callbackUrl") : null;
  if (!volta) return;
  const origem = new URL(volta, BASE).origin;
  if (origem !== new URL(BASE).origin) {
    throw new Error(
      `O app redireciona para ${origem}, e o roteiro roda em ${BASE}. Suba o next dev com NEXTAUTH_URL=${BASE} AUTH_URL=${BASE} na frente.`,
    );
  }
}

async function subirChrome(): Promise<void> {
  if (await responde(`${CDP}/json/version`, 2000)) return;
  const exe = CHROME.find((c) => existsSync(c));
  if (!exe) throw new Error("Chrome nao encontrado nos caminhos conhecidos.");
  // Perfil proprio e obrigatorio: o Chrome recusa a porta de depuracao no
  // perfil padrao, e e justamente o que separa o teste do navegador do usuario.
  spawn(
    exe,
    [
      `--user-data-dir=${PERFIL}`,
      `--remote-debugging-port=${PORTA}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  ).unref();
  for (let i = 0; i < 30; i++) {
    if (await responde(`${CDP}/json/version`, 1000)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`O Chrome de testes nao respondeu em ${CDP}.`);
}

// As abas do Chrome de testes: cada uma custa memória da estação de trabalho, e um roteiro que cai
// no meio (ou um "Imprimir A4", que abre aba própria) deixava aba para trás a cada rodada.
async function abas(): Promise<string[]> {
  try {
    const r = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(3000) });
    const lista = (await r.json()) as { id: string; type: string }[];
    return lista.filter((t) => t.type === "page").map((t) => t.id);
  } catch {
    return [];
  }
}

async function fecharAba(id: string): Promise<void> {
  for (const method of ["PUT", "GET"]) {
    try {
      const r = await fetch(`${CDP}/json/close/${id}`, { method, signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch {
      // a aba pode já ter fechado sozinha
    }
  }
}

/** Fecha as abas que não estão em `manter`, deixando sempre uma aberta (fechar a última encerra o Chrome). */
async function fecharAbasExceto(manter: string[]): Promise<number> {
  const atuais = await abas();
  let sobrando = atuais.filter((id) => !manter.includes(id));
  if (sobrando.length === atuais.length) sobrando = sobrando.slice(1);
  for (const id of sobrando) await fecharAba(id);
  return sobrando.length;
}

type Cabecalho = { cenarios: string[]; sessoes: [string, string][]; plataforma: string[] };

function lerCabecalho(codigo: string): Cabecalho {
  const cab: Cabecalho = { cenarios: [], sessoes: [], plataforma: [] };
  for (const linha of codigo.split(/\r?\n/)) {
    const m = linha.match(/^#\s*(cenario|sessao|sessao-plataforma):\s*(.+)$/);
    if (!m) continue;
    const partes = m[2].trim().split(/\s+/);
    if (m[1] === "cenario") cab.cenarios.push(m[2].trim());
    else if (m[1] === "sessao") cab.sessoes.push([partes[0], partes[1]]);
    else cab.plataforma.push(...partes);
  }
  return cab;
}

function listar(): string[] {
  return readdirSync(PASTA)
    .filter((f) => f.endsWith(".py") && !f.startsWith("_"))
    .map((f) => f.slice(0, -3));
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Roteiros em scripts/navegador/:");
    for (const r of listar()) console.log(`  npm run navegador -- ${r}`);
    return;
  }
  await subirChrome();
  if (arg === "--abrir") {
    console.log(`Chrome de testes de pe em ${CDP} (perfil ${PERFIL}).`);
    return;
  }
  if (arg === "--limpar") {
    console.log(`Fechadas ${await fecharAbasExceto([])} aba(s); ficou uma aberta.`);
    return;
  }

  const arquivo = join(PASTA, `${arg}.py`);
  if (!existsSync(arquivo)) throw new Error(`Roteiro ${arg} nao existe. Rode sem argumento para listar.`);
  if (!(await responde(`${BASE}/robots.txt`, 60000))) throw new Error(`O app nao responde em ${BASE}: suba o npm run dev.`);
  await exigirRedirecionamentoNaMesmaPorta();

  const roteiro = readFileSync(arquivo, "utf8");
  const cab = lerCabecalho(roteiro);

  for (const cenario of cab.cenarios) {
    console.log(`Cenario: ${cenario}`);
    // Uma string so: com `shell` (o npx do Windows e .cmd), argumentos em
    // lista disparam o aviso DEP0190 do Node.
    const r = spawnSync(`npx tsx ${cenario}`, { stdio: "inherit", shell: true, env: process.env });
    if (r.status !== 0) throw new Error(`O cenario ${cenario} falhou.`);
  }

  const cookies: Record<string, CookieEmitido> = {};
  for (const [nome, email] of cab.sessoes) cookies[nome] = await emitirCookieTenant(email);
  for (const nome of cab.plataforma) cookies[nome] = await emitirCookiePlataforma();
  await prisma.$disconnect();

  const ctx = { base: BASE, cookies };
  const lib = readFileSync(join(PASTA, "_lib.py"), "utf8");
  const entrada = `import json\nCTX = json.loads(${JSON.stringify(JSON.stringify(ctx))})\n${lib}\n${roteiro}\nfim()\n`;

  // Um roteiro por vez neste Chrome: o que sobrou de uma rodada anterior que caiu é fechado agora,
  // e o que esta rodada abrir é fechado no fim, passe ou reprove.
  const restos = await fecharAbasExceto([]);
  if (restos > 0) console.log(`Fechadas ${restos} aba(s) que sobraram de rodadas anteriores.`);
  const antes = await abas();

  const r = spawnSync("browser-harness", [], {
    input: entrada,
    encoding: "utf8",
    // Sem o UTF-8 explicito, o acento dentro do js() chega trocado ("SÃ³").
    env: { ...process.env, BU_NAME: "tibe", BU_CDP_URL: CDP, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(saida);
  const fechadas = await fecharAbasExceto(antes);
  if (fechadas > 0) console.log(`Fechadas ${fechadas} aba(s) abertas pelo roteiro.`);
  const resultado = saida.match(/RESULTADO: (\d+) falha/);
  if (!resultado) {
    console.error("\n❌ O roteiro nao chegou ao fim (sem linha RESULTADO).");
    process.exit(1);
  }
  process.exit(Number(resultado[1]) === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  await prisma.$disconnect();
  process.exit(1);
});
