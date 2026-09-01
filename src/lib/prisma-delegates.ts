import type { Prisma } from "@/generated/prisma/client";

/**
 * Colapsa `TenantPrismaClient | Prisma.TransactionClient` numa ponta só, para
 * o TypeScript conseguir resolver a chamada.
 *
 * NASCEU DE UM LIMITE DO COMPILADOR, não de um problema de desenho.
 *
 * Várias funções deste projeto aceitam **o client escopado OU um `tx` de
 * transação**, e essa flexibilidade é deliberada: é o que permite
 * `findOrCreateContact` criar o contato junto da negociação, tudo ou nada.
 * O tipo do parâmetro é uma união de dois clients do Prisma, e cada um deles
 * carrega uma delegate genérica enorme por model.
 *
 * Enquanto o schema era menor, o TypeScript resolvia. Ao acrescentar os três
 * models da fase 2 da Área Leite, ele passou do orçamento de instanciação e
 * começou a reprovar chamadas que **não mudaram**, em quatro arquivos, com
 * `TS2349: This expression is not callable` e `TS2321: Excessive stack depth`.
 * Nenhuma linha de negócio estava errada: o compilador desistiu de comparar as
 * duas assinaturas.
 *
 * Reduzir o schema foi testado e não resolveu: tirar cinco relações dos models
 * novos manteve os mesmos oito erros. O gatilho é o tamanho do grafo de tipos,
 * não uma relação específica.
 *
 * ⚠️ **A conversão é só de tipo, e por isso é segura.** As duas pontas expõem
 * a mesma delegate em runtime, e o objeto que chega aqui continua sendo o
 * mesmo: se for o client escopado, a extensão de isolamento continua injetando
 * `tenant_id` normalmente, porque ela vive no objeto e não no tipo. Isto NÃO
 * afrouxa o invariante 1.
 *
 * ⚠️ **Não use isto para aceitar um client cru onde se espera o escopado.**
 * O propósito é estreitar uma união que já existe, nunca alargar o que uma
 * função aceita.
 */
export function delegates(db: unknown): Prisma.TransactionClient {
  return db as Prisma.TransactionClient;
}
