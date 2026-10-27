import "./_env-local";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { emitirCookiePlataforma, emitirCookieTenant } from "./_sessao-cookie";

/**
 * Emite o cookie de sessao do NextAuth para o owner do seed, no banco LOCAL.
 *
 * Existe porque validar tela autenticada exige uma sessao, e a unica outra
 * forma de obter uma e digitar a senha no formulario de login. Este agente nao
 * digita senha em campo nenhum, em ambiente nenhum: a regra e categorica, e
 * "e so o local" e exatamente como ela se perde. Aqui nenhuma senha em claro
 * aparece, nem no codigo nem na saida (a assinatura mora em `_sessao-cookie.ts`).
 *
 * Vale so para `npm run dev` contra o Postgres de dev. `exigirBancoLocal()`
 * recusa rodar apontando para producao.
 *
 * `--plataforma [email]` emite o cookie da OUTRA instancia (Painel da
 * Plataforma): nome, segredo e campos proprios, os de
 * `src/lib/platform-auth.config.ts`.
 *
 * Para roteiro de navegador, prefira `npm run navegador`, que emite os
 * cookies sozinho.
 */
exigirBancoLocal();

async function main() {
  const c =
    process.argv[2] === "--plataforma"
      ? await emitirCookiePlataforma(process.argv[3])
      : await emitirCookieTenant(process.argv[2] ?? "owner@damata.com.br");
  console.log(`${c.nome}=${c.valor}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
