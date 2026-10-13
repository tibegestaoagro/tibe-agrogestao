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
 * ESCOPO
 *
 * Autenticacao e conta, financeiro (lancamentos e pendencias), alertas,
 * usuarios e, desde 2026-10-13, as respostas de leitura de rebanho, lavoura,
 * servicos, negociacoes e maquinas.
 *
 * Fora: `/api/platform/*` (sessao de PlatformUser, ferramenta interna),
 * `/api/internal/*` (chamadas pelo N8N com segredo no header), os relatorios
 * financeiros (DRE, fluxo de caixa, PDF assinado) e as sub-rotas de leitura
 * do rebanho (pesagens, vacinas, custo do lote).
 *
 * O PACOTE QUASE SO DECLARA. A excecao sao as tres rotas de escrita de
 * maquinas, que o aplicativo usa e importam o schema de entrada daqui. Nas
 * outras, quem prende o contrato ao servidor e `npm run test:m73`: ele chama
 * as rotas GET de verdade e confere a resposta e cada enum contra o Prisma.
 */

export * from "./envelope";
export * from "./primitives";
export * from "./errors";
export * from "./auth";
export * from "./financial";
export * from "./alerts";
export * from "./users";
export * from "./herd";
export * from "./crops";
export * from "./services";
export * from "./negotiations";
export * from "./machines";
