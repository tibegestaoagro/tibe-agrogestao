# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo autorizado.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima.**
Se ele passar de umas 200, arquive antes de acrescentar.

## Estado atual

- Atualizado em: 2026-08-25.
- **O topo da `main` é o commit desta rodada**, e a `main` local está igual à
  `origin/main` (o commit anterior a este é o `17cd95d`; um handoff nunca cita
  o próprio hash, então esta linha é sempre uma atrás). O deploy da Vercel é
  automático em push. `https://tibe-agrogestao.vercel.app` responde 200,
  conferido em 25/08, mas **a última validação funcional ao vivo continua sendo
  a de 2026-08-20**, sobre o `21d5641`.
- **Os quatro commits depois do `cbe4afb` são só de documentação** (`CLAUDE.md`
  e `docs/agents/`): nenhum toca em `src/` ou `prisma/`, então não há mudança
  de comportamento no ar desde o `979ba2e`.
- **Nenhuma migração nova desde o `21d5641`.** Os commits posteriores não tocam
  em `prisma/`, então o invariante 3 não está em jogo e o Neon segue em dia.
- **A fase 1 (identidade e sistema de design) começou**, com três commits na
  `main`, na ordem que o plano exige:
  - `60e4d87`: as sete escritas que falhavam em silêncio passam a avisar, e os
    alvos de toque chegam a 44px. É o que torna o resto testável por um humano.
  - `638d0f6`: cor sai de 142 arquivos e vira token semântico em `globals.css`.
    O achado: texto branco sobre o verde da marca dava 3,51:1, reprovando em AA.
    Mudou a cor do TEXTO, não os hex da Agromax, e `check-contraste.ts` entrou
    no `npm run check`.
  - `979ba2e`: `<input type="number">` lia "1.500" como 1,5 e "1.500,00" como
    zero, em 31 campos, sem mensagem. Vieram `MoneyInput`, `Field` e
    `FormSheet` (os 27 painéis de escrita eram `<div>`, sem `<form>`), mais uma
    catraca no `npm run check` que reprova `type="number"` novo.
- **`cbe4afb` acrescentou o `.env.enc`**, backup cifrado do `.env`, para o
  projeto viajar sem o chaveiro em texto puro. Passo a passo em
  [../backup-env.md](../backup-env.md).
- **O classificador do n8n já conhece as 4 intenções de estoque**, ensinadas em
  2026-08-18 pelo MCP do n8n. Backup do workflow anterior em `D:\tmp\n8n-backup`.
  Ele segue **congelado** por decisão do usuário: só volta a ser mexido quando o
  sistema estiver revisado, para não retrabalhar a cada mudança.

### Sobre o Zod por intenção, que estava no plano e NÃO foi feito

A razão (schema estrito é o instrumento errado neste canal) está arquivada em
[historico/2026-08.md](historico/2026-08.md). Em uma linha: o que faltava era
normalização, e ela foi feita. Se um schema entrar um dia, que seja por coerção
e com `passthrough`, nunca por rejeição.

### A fase 0 está fechada

Entregou CI, Next 16, quatro advisories de auth, envelope de erro e log
estruturado, cabeçalhos de segurança, integridade e auditoria no banco, a porta
do agente endurecida, o worker da rotina diária (código pronto, não
provisionado), `npm run test:all` e `medir-saldo.ts`, o gatilho escrito que
autorizaria um dia introduzir cache de saldo. Relato completo em
[historico/2026-08.md](historico/2026-08.md).

⚠️ **O plano que originou a fase 0 e desenha a fase 1 vive FORA do repositório**,
em `C:\Users\dilto\.claude\plans\analise-o-projeto-me-elegant-walrus.md`, e por
isso **não viajou para a cópia nova**: lá aquela pasta nem existe. Quem retomar
fora da máquina de origem trabalha pelo que está escrito aqui e nos commits.

### A cópia nova: `C:\projetos\tibe-agrogestao`

Clonada em 2026-08-24, preparada e conferida na mesma rodada: `npm run check`
com 0 falhas e **48/48 suítes verdes**. O que montar do zero revelou (container
que precisa ser criado antes, `seed:demo` obrigatório, Redis local, `openssl`
fora do PATH) já virou texto no `CLAUDE.md`, e o relato está arquivado em
[historico/2026-08.md](historico/2026-08.md).

**`gh` continua não existindo**, como já acontecia na outra máquina. E a conta
logada no navegador é a `dilton-pleno`, colaboradora: para regra de branch,
visibilidade e security log, é preciso a conta dona, `tibegestaoagro`.

### O que depende do usuário, e degrada em silêncio até ser feito

A lista completa, com passo a passo e o que acontece se não for feito, está em
**[pendencias-do-usuario.md](pendencias-do-usuario.md)**. Em resumo:

1. **Descobrir por quanto tempo o repositório ficou público** (era, em 25/08 de
   manhã; fechou na mesma manhã). Enquanto o `.env.enc` esteve baixável, o
   chaveiro cifrado circulou. O security log da conta `tibegestaoagro` diz o
   tamanho da janela, e é ele que decide se basta trocar a senha do backup ou
   se vale rotacionar credencial.
2. **`REPORT_LINK_SECRET` na Vercel.** Sem ela o link de relatório segue
   assinado com o segredo interno. Falta também no `.env` local.
3. **O n8n passar `provider_message_id`.** Sem o campo a idempotência não vale.
   É edição de um nó.
4. **Provisionar o worker no Railway**, seguindo
   [worker-de-rotina.md](worker-de-rotina.md). A ordem importa: subir o
   processo, conferir no log que ele ouve, e **só então** ligar
   `ROTINA_COM_WORKER=1`. Inverter faz o sistema parar de alertar sem erro.

O CI **está verde**, conferido no navegador em 25/08 até o `17cd95d` (CI #26),
sem nenhuma das 26 execuções falhando. Segue de higiene ligar a proteção de
branch, que agora se sabe exigir a conta `tibegestaoagro`: por `dilton-pleno`,
que é colaboradora, as páginas de regra devolvem 404.

### Próximo passo

**Seguir a fase 1: as telas, em ondas, com um commit por tela.** As camadas de
que elas dependem já estão na `main`: falha visível, tokens semânticos e as três
primeiras peças do kit (`Field`, `FormSheet`, `MoneyInput`). A referência visual
é [../design/briefing-novo-layout.md](../design/briefing-novo-layout.md), que é
planejamento e não spec fechada, e cujas decisões pendentes valem reler antes de
codificar.

Dois itens saíram do escopo da fase 0 com motivo, e não por esquecimento: o
esquema Zod por intenção (acima) e o coletor de erro externo (o ponto de plugue
está em `src/instrumentation.ts`; a razão de não instalar o SDK está em
[pendencias-do-usuario.md](pendencias-do-usuario.md), item 10).

Continua pendente, de antes: **teste no aparelho** pelo roteiro em
[roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md), cadastrando antes os
três produtos do bloco 0 em `/estoque`.

### Pendências

O levantamento completo, com evidência e custo de cada item, está em
**[dividas.md](dividas.md)** (2026-08-18). As três que mais pesam:

- **Estoque nunca foi testado no aparelho**, embora esteja em produção.
- **`app-mobile-fundacao` tem 3 commits fora da `main` desde 05/08**, com 5
  defeitos corrigidos e nunca retestados, enquanto a `main` recebeu os Módulos
  30 e 31 inteiros. É a dívida que mais cresce sozinha.
- **Três segredos no `.env` que nenhuma linha de código lê** (2026-08-24):
  `OPENAI_API_KEY`, `N8N_API_KEY` e `N8N_WEBHOOK_SECRET`. A classificação
  acontece dentro do n8n, então eles deviam viver só lá. O da OpenAI gasta
  dinheiro se vazar, e hoje viaja no backup cifrado sem servir para nada.

Quatro achadas hoje, que não estavam em `dividas.md`:

- **`gh` CLI não existe nesta máquina**, embora `issue-tracker.md` o pressuponha.
  `git push` funciona; abrir issue, PR ou ler resultado de CI, não.
- **Defeito ativo no rebanho:** `whatsapp-flow-bridge.ts` e `POST /api/v1/animals`
  criam lote na categoria "Não classificado", e o saldo lê `HerdMovement`. Quem
  cadastra animal pelo assistente não o vê no rebanho. A recomendação de correção
  está no plano e no documento novo para o cliente.
- **12 calculadoras no ar sem a validação técnica assinada** que o próprio plano
  de ação exige. Cobrança preparada em
  [../cliente/04-decisoes-pendentes.md](../cliente/04-decisoes-pendentes.md),
  junto com o modelo de rebanho, o destino da Lavoura e as cinco decisões de
  canal. **Nada disso foi enviado ainda.**
- **Verificação de negócio na Meta não começou.** Recomendada em 31/07 com o
  aviso de que "se ficar para setembro, chega atrasado". A cobrança da Meta muda
  em 01/10/2026. É o maior risco de calendário aberto, e não depende de código.

## Histórico recente

- **2026-08-25:** `dividas.md` perdeu os itens 3.2, 3.3 e 3.4, que estavam
  fechados desde 18 a 24/08 (Redis local, `npm run test:all`, CI). Da seção 3
  sobrou o 3.1, o `m23-token-auth.test.ts` que não compila. Conferir o CI pelo
  navegador achou o repositório **público**, com o `.env.enc` baixável por
  qualquer um; fechado na mesma manhã, e a janela de exposição virou o item 1
  das pendências do usuário.
- **2026-08-24:** cópia nova do projeto em `C:\projetos\tibe-agrogestao`,
  preparada e conferida (dependências, `tibe-pg` criado, 32 migrações, seed,
  `check` e `test:isolation` verdes). Falta decifrar o `.env`. Este handoff
  estava quatro commits atrasado e passou a registrar a fase 1.
- **2026-08-20:** fase 0 da evolução inteira em produção (`21d5641`), em duas
  levas mais o worker: CI de verdade, Next 16, quatro advisories de auth
  fechadas, envelope de erro e log estruturado, cabeçalhos de segurança,
  integridade e auditoria no banco, e a porta do agente endurecida. Validado em
  navegador, por requisição real e contra o classificador de produção. No mesmo
  dia começou a fase 1, com três commits de interface (`60e4d87`, `638d0f6`,
  `979ba2e`) que este arquivo só registrou em 24/08.
- **2026-08-18:** higiene das instruções. `CLAUDE.md` de 1.211 para ~270 linhas,
  com a arqueologia movida para `.claude/rules/*.md` (carregam sozinhas por
  glob); travas de agente versionadas para travessão, heredoc com escape e
  merge/push/deploy; `npm run check`; `CONTRIBUTING.md` apagado.
- **2026-08-18:** missão 2 do Módulo 31 (Estoque) em produção, mais o
  classificador do n8n ensinado. O teste contra produção achou um defeito que
  gravava dinheiro, corrigido no mesmo dia.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
