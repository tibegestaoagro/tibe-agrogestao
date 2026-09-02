/**
 * Recusa rodar uma suíte contra qualquer banco que não seja o de desenvolvimento.
 *
 * NASCEU DE UM ACIDENTE REAL (2026-08-15): um revisor independente rodou
 * `test:isolation` e as suítes do estoque com a variável de ambiente no formato
 * do PowerShell dentro do Bash. A variável não pegou, o `.env` do projeto
 * prevaleceu, e o `.env` aponta para o **Neon de produção**. As suítes criaram
 * tenants lá.
 *
 * Pior: a limpeza do `finally` FALHOU, porque as suítes de estoque apagam
 * `StockMovement` e `Product` primeiro e essas tabelas ainda não existem em
 * produção. O delete estourou, o `finally` morreu no meio e dois tenants de
 * teste ficaram contando como trial no funil do painel da plataforma, que é
 * exatamente o tipo de sujeira que o Módulo 19 foi escrito para evitar.
 *
 * "Lembrar de passar a URL certa" não é proteção: o `.env` apontar para
 * produção é uma armadilha documentada deste projeto, e documentação não
 * impede um comando. Esta trava impede.
 */
/**
 * A mesma trava, para o Redis.
 *
 * Faltava até 02/09, e a falta era do mesmo tamanho: o `.env` aponta para o
 * **Redis de produção** exatamente como aponta para o Neon, e uma suíte que só
 * usa Redis (a do store de pendência) passaria inteira pela `exigirBancoLocal`
 * sem nunca tocar em `DATABASE_URL`, escrevendo e apagando chaves na instância
 * que atende os clientes.
 *
 * O risco não é teórico: `clearPending*` apaga por chave, e a chave é
 * `tibe:<dominio>-pending:<tenant>:<user>`. Um tenant e um usuário inventados
 * pela suíte não colidem, mas o TTL, o `FLUSHDB` de um teste distraído e o
 * simples volume de conexões são problema num Redis compartilhado que já
 * derrubou três suítes por causa do lock diário.
 *
 * Aceita a ausência de `REDIS_URL` de propósito: sem ela o código cai no
 * padrão local do `getRedisConnection`, que é o que queremos.
 */
export function exigirRedisLocal(): void {
  const url = process.env.REDIS_URL ?? "";
  if (!url) return;
  const local = /(\/\/|@)(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (local) return;

  const alvo = url.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    [
      "",
      "🛑 Esta suite escreve e apaga chaves no Redis, e o apontado NAO e o local.",
      `   Alvo: ${alvo}`,
      "",
      "   Rode assim (Bash):",
      '     REDIS_URL="redis://127.0.0.1:6390" npm run test:mXX',
      "",
      "   Se nao houver Redis local nesta maquina, crie uma vez:",
      "     docker run -d --name tibe-redis-local -p 6390:6379 redis:7-alpine",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

export function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (local) return;

  const alvo = url ? url.replace(/:\/\/[^@]*@/, "://***@") : "(DATABASE_URL vazia)";
  console.error(
    [
      "",
      "🛑 Esta suite cria e apaga tenants, e o banco apontado NAO e o local.",
      `   Alvo: ${alvo}`,
      "",
      "   Rode assim (Bash):",
      '     DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public" npm run test:mXX',
      "",
      "   Ou assim (PowerShell):",
      '     $env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:mXX',
      "",
      "   Se o container estiver parado: docker start tibe-pg",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
