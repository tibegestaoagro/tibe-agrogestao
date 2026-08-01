/**
 * @tibe/contracts
 *
 * Fonte unica de verdade dos formatos de entrada e saida da API do Tibe, para
 * o aplicativo consumir com seguranca de tipo, sem geracao de codigo.
 *
 * REGRAS DESTE PACOTE
 *
 * 1. A unica dependencia e `zod`. Nada de Prisma, Next, ou qualquer coisa de
 *    servidor. Se um contrato precisar de um deles, o desenho esta errado.
 *    `tsconfig.json` compila `src/` com `types: []` e sem "dom" no `lib`,
 *    entao a violacao quebra a compilacao em vez de passar despercebida.
 *
 * 2. Os nomes seguem o contrato ATUAL, nao uma versao idealizada. Onde o
 *    codigo hoje diz `ear_tag`, o contrato diz `ear_tag`. Renomear campo e
 *    mudanca de contrato e nao acontece aqui.
 *
 * 3. Onde o codigo e a documentacao em `/docs/api` divergem, vale o CODIGO, e
 *    a divergencia fica registrada em comentario no schema correspondente.
 *
 * ESCOPO (Onda 1)
 *
 * Autenticacao e conta, financeiro (lancamentos e pendencias), alertas e
 * usuarios.
 *
 * REBANHO FICA DE FORA DE PROPOSITO. O modelo muda na Onda 3 (categoria e
 * quantidade) e extrair o contrato antes disso garante retrabalho. O mesmo
 * vale, por consequencia, para lavoura e prestador de servico, que nao estao
 * no escopo desta onda.
 *
 * Tambem fora: `/api/platform/*` (sessao de PlatformUser, ferramenta interna),
 * `/api/internal/*` (chamadas pelo N8N com segredo no header) e os relatorios
 * financeiros (DRE, fluxo de caixa, PDF assinado).
 *
 * ESTE PACOTE APENAS DECLARA. Nesta onda nenhuma rota passa a usar estes
 * schemas: a troca vem depois, para nao colidir com o trabalho paralelo em
 * `src/`.
 */

export * from "./envelope";
export * from "./primitives";
export * from "./errors";
export * from "./auth";
export * from "./financial";
export * from "./alerts";
export * from "./users";
