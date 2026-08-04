import * as React from "react";

/**
 * Memoiza uma função assíncrona **dentro de um único request**.
 *
 * Por que não importar `cache` do React direto (auditoria de performance,
 * 2026-08-04): o projeto está no React 18, onde `cache` não existe no pacote
 * público. Ele existe no runtime do Next (que vendoriza um React canary para
 * o App Router), então `import { cache } from "react"` funciona no servidor
 * Next e **quebra** em qualquer coisa que rode no Node puro: os scripts
 * `scripts/*.test.ts` (via tsx), seeds e jobs. Descoberto quebrando os testes
 * de verdade, não em teoria.
 *
 * Fora do runtime do Next a função é devolvida sem memoização, e isso é o
 * comportamento CORRETO, não um remendo: sem request não há escopo ao qual
 * amarrar o cache. Num processo de vida longa que percorre vários tenants
 * (o job diário de alertas faz exatamente isso), memoizar entre chamadas
 * seria justamente o bug de vazamento cross-tenant que o projeto mais
 * precisa evitar.
 *
 * A garantia que importa: o cache do React é por request e descartado ao
 * final dele, nunca compartilhado entre requests de tenants diferentes.
 * **Nunca** troque isto por um `Map` em escopo de módulo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function perRequestCache<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  const reactCache = (React as unknown as { cache?: (f: T) => T }).cache;
  return typeof reactCache === "function" ? reactCache(fn) : fn;
}
