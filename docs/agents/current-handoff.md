# Handoff compartilhado do Tibé

Este arquivo é a memória operacional curta e versionada do projeto. Codex,
Claude Code e qualquer outro agente devem lê-lo depois de `AGENTS.md` ou
`CLAUDE.md`.

## Protocolo de manutenção

- Atualize este arquivo ao encerrar cada módulo ou rodada significativa.
- Registre apenas fatos verificados, nunca planos tratados como concluídos.
- Informe estado, escopo entregue, validações, commit/deploy, pendências e
  próximo passo autorizado.
- Substitua a seção "Estado atual" a cada rodada. Mantenha no histórico apenas
  as cinco rodadas mais recentes, com uma linha por rodada.
- Não salve segredos, credenciais, transcrições da conversa ou detalhes que já
  estejam claros na spec, no código ou no commit.
- Toda tarefa concluída recebe commit automático na branch de trabalho, com o
  handoff incluído no mesmo commit sempre que possível.
- O push da branch de trabalho é permitido. Merge na `main`, push direto para
  a `main` e deploy exigem aprovação explícita do usuário.

## Estado atual

- Atualizado em: 2026-08-01
- Última rodada: integração da Onda 1, correcao de seguranca no middleware, varredura de travessao
- Estado: concluido, integrado na `main` e implantado em producao
- Commit principal: `e1c9e2d`
- Produção: <https://tibe-agrogestao.vercel.app/>
- Banco: migracao `20260801120000_refresh_token` aplicada no Neon

### Entregue nesta rodada

- **Onda 1 completa e integrada**: token de acesso para mobile (A1), pacote
  `packages/contracts` (A2), PWA instalavel (A3). As tres branches mesclaram
  sem nenhum conflito real, confirmando o desenho de escopo exclusivo por
  agente. Convite de instalacao escopado ao painel autenticado (decisao do
  usuario).
- **Correcao de seguranca no middleware**: `authConfig.callbacks.authorized`
  nunca era invocado pelo next-auth desde a reestruturacao do M5 (confirmado
  no codigo-fonte do pacote, nao por inferencia). O middleware nao bloqueava
  nada por sessao de tenant; so o `redirect()` de cada pagina protegia.
  Corrigido chamando `authorized` explicitamente. Validado local (`next
  start`) e em producao: rotas protegidas agora redirecionam com
  `callbackUrl=`, `/api/*` continua 401 JSON, `/plataforma` intacto.
- **Zero travessao (U+2014)** em todo arquivo rastreado pelo git (varredura
  completa a pedido do usuario). Excecoes por principio:
  `src/generated/prisma` (regenerado) e `prisma/migrations/*.sql`
  (historico aplicado, nunca editar retroativamente).

### Licoes registradas nesta rodada

- **O metodo de verificacao usado a sessao inteira estava quebrado**:
  `grep -q $'—'` da falso negativo neste shell. O padrao correto e por
  bytes UTF-8 (`â`). Qualquer afirmacao anterior de "sem
  travessao" nesta sessao deve ser considerada nao verificada.
- **Nunca confiar em next-auth aplicar `authorized` automaticamente** quando
  o middleware usa a forma `auth((req) => {...})`: a chamada precisa ser
  explicita. Documentado em `CLAUDE.md`/`AGENTS.md`.

### Pendências e proximo passo

- **Onda 2** (nao iniciada): seam de notificacao com push, esqueleto do
  aplicativo mobile (`apps/mobile`), reversao da fragmentacao de resposta do
  WhatsApp (economia de mensagem antes da cobranca da Meta em 01/10/2026).
- Confirmacoes ainda pendentes da Agromax (documento
  `docs/cliente/01-entendimento-do-produto.md`): modelo de rebanho (categoria
  x individual), destino da Lavoura, prioridade entre Calculadora/Maquinas/
  Meu Dia.
- Verificacao do negocio na Meta: ainda nao iniciada, item de maior prazo.
- Testar instalacao do PWA num Android e num iPhone reais contra a URL da
  Vercel (unico item de prova que nao dava para fechar localmente).
- Arte definitiva dos icones do PWA (atuais sao provisorios com a paleta
  antiga); identidade nova em `docs/idVisual/` entra na Onda 3.

## Histórico recente

- 2026-08-01: Onda 1 integrada, middleware corrigido (authorized() nao era
  chamado ha meses), varredura completa de travessao. Commit `e1c9e2d`,
  deploy verificado em producao.
- 2026-07-31: análise dos documentos do cliente, plano de arquitetura por
  contrato e disparo da Onda 1 de agentes.
- 2026-07-30: N8N auditado (já estava provisionado e ativo), prompt do
  classificador alinhado ao M17 e alerta por WhatsApp passando a sair direto
  pelo Tibé. Commits `8204e9b` e `31f54c0`.
- 2026-07-30: Módulo 19 (cadastro verificado em 4 etapas) concluído, migrado no
  Neon, integrado na `main` e implantado em produção no commit `db491bd`.
- 2026-07-30: limite de assentos por plano concluído, integrado na `main` e
  implantado em produção no commit `7e52563`.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
