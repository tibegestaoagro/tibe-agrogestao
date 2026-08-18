---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "scripts/**/*.ts"
---
<!-- Carrega sozinho ao ler qualquer arquivo de codigo.
     Resgatado do CONTRIBUTING.md, apagado em 2026-08-18: era a unica coisa la
     que nao existia em nenhum outro lugar. O resto do arquivo repetia o
     CLAUDE.md em versao mais fraca, e ensinava o comando de teste errado. -->

## Convenções de código

- **TypeScript estrito.** Evite `any`; prefira tipar o retorno de funções
  públicas.
- **Nomenclatura:** modelos Prisma em PascalCase, campos em snake_case (espelham
  os contratos de API, que também usam snake_case).
- **Não adicione abstração, configuração ou tratamento de erro para casos que
  não existem.** Três linhas parecidas são melhores que uma abstração
  prematura. Se notar algo assim no código existente, é mais provável que exista
  um motivo (leia o comentário ou a spec) do que seja descuido.
- **Comentários só quando o "porquê" não é óbvio**: uma decisão não trivial, o
  contorno de um bug específico, um desvio deliberado da spec. Não comente o que
  o código já diz por si.

  E um comentário é uma **afirmação verificável**: se ele diz o que o código
  faz, precisa estar certo hoje. Numa auditoria de 2026-08-16, uma dúzia de
  comentários deste projeto afirmava o oposto do que o código fazia, e cada um
  deles tinha sido verdade quando foi escrito.

## Testes

Toda mudança que adiciona ou altera um endpoint roda a suíte de isolamento
correspondente, e endpoint novo ganha cobertura. Os scripts em `scripts/`
chamam o route handler **diretamente**, com um `Request` construído, sem subir
servidor: criam dois tenants e confirmam que um nunca enxerga o dado do outro.

O comando exato, com a trava de banco local, está no `CLAUDE.md`. Não copie
comando de teste daqui: é assim que a versão errada se espalha.

## Commits

Mensagens curtas em português, girando em torno do **porquê**, não de uma lista
do que mudou linha a linha. O formato mais usado hoje é `Área: descrição`
(`Estoque: ...`, `Handoff: ...`).

## Deploy

**Não há ambiente de staging** além dos previews de PR: merge na `main` dispara
produção. É por isso que o invariante 7 exige autorização a cada vez.
