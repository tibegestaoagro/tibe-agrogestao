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

- Atualizado em: 2026-08-24.
- **`cbe4afb` é o topo da `main`, e a `main` local está igual à `origin/main`.**
  O deploy da Vercel é automático em push, então essa deve ser a versão no ar.
  **Isso não foi conferido contra produção nesta rodada**: a última conferência
  ao vivo registrada é a de 2026-08-20, sobre o `21d5641`.
- **Nenhuma migração nova desde o `21d5641`.** Os commits posteriores não tocam
  em `prisma/`, então o invariante 3 não está em jogo e o Neon segue em dia.
- **A fase 1 (identidade e sistema de design) começou**, com três commits na
  `main`, na ordem que o plano exige:
  - `60e4d87`: as sete escritas que falhavam em silêncio passam a avisar, e os
    alvos de toque chegam a 44px. É o que torna o resto testável por um humano.
  - `638d0f6`: os valores de cor saem de 142 arquivos e viram tokens semânticos
    em `globals.css`. O achado da rodada: texto branco sobre o verde da marca
    dava 3,51:1, reprovando em AA. A correção mudou a cor do TEXTO, não os hex
    da Agromax, e `scripts/check-contraste.ts` entrou no `npm run check`.
  - `979ba2e`: `<input type="number">` lia "1.500" como 1,5 e "1.500,00" como
    zero, em 31 campos, sem mensagem. Vieram `MoneyInput`, `Field` e
    `FormSheet` (os 27 painéis de escrita eram `<div>`, sem `<form>`), mais uma
    catraca no `npm run check` que reprova `type="number"` novo.
- **`cbe4afb` acrescentou o `.env.enc`**, backup cifrado do `.env` (AES-256-CBC,
  PBKDF2, 600 mil iterações), para o projeto viajar entre máquinas sem o
  chaveiro em texto puro. A senha vive fora do repositório, e o passo a passo
  está em [../backup-env.md](../backup-env.md).
- **O classificador do n8n já conhece as 4 intenções de estoque**, ensinadas em
  2026-08-18 pelo MCP do n8n. Backup do workflow anterior em `D:\tmp\n8n-backup`.
  Ele segue **congelado** por decisão do usuário: só volta a ser mexido quando o
  sistema estiver revisado, para não retrabalhar a cada mudança.

### As travas de agente, e como passar por elas

`.claude/settings.json` e `.claude/hooks/` são versionados, então valem também
no notebook. Eles **recusam** travessão novo, heredoc com escape, e merge, push
mirando a `main` e deploy.

Quando o usuário autorizar, o caminho é repetir o comando com a marca
`AUTORIZADO_PELO_USUARIO=1` na frente. **Nunca desligue o hook**: a marca existe
justamente para o caminho autorizado não ser desligá-lo, porque hook desligado
não volta sozinho. E a marca só vale para autorização dada NA CONVERSA, nunca
deduzida de uma anterior.

O `/doctor` de 2026-08-18 mudou `permissions.defaultMode` para `"auto"` no
escopo de usuário. Testado: **os hooks continuam bloqueando nesse modo**.

### Sobre o Zod por intenção, que estava no plano e NÃO foi feito

A razão (schema estrito é o instrumento errado neste canal) está arquivada em
[historico/2026-08.md](historico/2026-08.md). Em uma linha: o que faltava era
normalização, e ela foi feita. Se um schema entrar um dia, que seja por coerção
e com `passthrough`, nunca por rejeição.

### A fase 0 está fechada

Entregou CI de verdade (com Postgres e Redis próprios, e drift de migração),
Next 16 com React 19, quatro advisories de auth fechadas, envelope de erro e
log estruturado, cabeçalhos de segurança, integridade e auditoria no banco,
`execute-action` endurecido, normalização dos parâmetros do agente, o worker da
rotina diária (código pronto, não provisionado), `npm run test:all` (as 48
suítes num comando, ~2 min) e `medir-saldo.ts`, o gatilho escrito que
autorizaria um dia introduzir cache de saldo. O relato completo está em
[historico/2026-08.md](historico/2026-08.md).

⚠️ **O plano que originou a fase 0 e desenha a fase 1 vive FORA do repositório**,
em `C:\Users\dilto\.claude\plans\analise-o-projeto-me-elegant-walrus.md`, e por
isso **não viajou para a cópia nova**: lá aquela pasta nem existe. Quem retomar
fora da máquina de origem trabalha pelo que está escrito aqui e nos commits.

### A cópia nova: `C:\projetos\tibe-agrogestao`

Clonada em 2026-08-24, e preparada e conferida na mesma rodada: `npm install`
(628 pacotes, Prisma Client gerado), container `tibe-pg` criado do zero
(`postgres:17`, porta `55432`, `tibe`/`tibe`/`tibe_dev`), as 32 migrações
aplicadas, seed rodado, `npm run check` com 0 falhas e `npm run test:isolation`
verde. Note que o `docker start tibe-pg` do `CLAUDE.md` pressupõe o container já
existente: numa máquina nova ele precisa ser criado antes.

Duas coisas ficaram de fora, e valem para quem retomar aqui:

- **O `.env` ainda não foi decifrado nesta cópia**, porque depende da senha, que
  está no gerenciador. Sem ele só rodam as suítes que não precisam de segredo, e
  sempre com a URL do Docker inline.
- **`gh` continua não existindo**, como já acontecia na outra máquina.

### O que depende do usuário, e degrada em silêncio até ser feito

A lista completa, com passo a passo e o que acontece se não for feito, está em
**[pendencias-do-usuario.md](pendencias-do-usuario.md)**. Em resumo:

1. **`REPORT_LINK_SECRET` na Vercel.** Sem ela o link de relatório continua
   assinado com o segredo interno, avisando no log. É o buraco que o commit
   dos segredos separados existe para fechar.
2. **O n8n passar `provider_message_id`** (o `wamid` que ele já tem no
   payload). Sem o campo, a idempotência não vale e o log registra cada
   chamada desprotegida. É edição de um nó.
3. **Provisionar o worker no Railway**, seguindo
   [worker-de-rotina.md](worker-de-rotina.md). A ordem importa: subir o
   processo primeiro, conferir no log que ele está ouvindo, e **só então**
   ligar `ROTINA_COM_WORKER=1`. Inverter faz o sistema parar de gerar alerta
   sem nenhum erro.

Mais dois de higiene: ligar a proteção de branch no GitHub, e conferir se o CI
ficou verde (sem `gh` nesta máquina, quem lê o resultado é o usuário).

### Próximo passo

**Seguir a fase 1: as telas, em ondas, com um commit por tela.** As camadas de
que elas dependem já estão na `main`: falha visível, tokens semânticos e as três
primeiras peças do kit (`Field`, `FormSheet`, `MoneyInput`). A referência visual
é [../design/briefing-novo-layout.md](../design/briefing-novo-layout.md), que é
planejamento e não spec fechada, e cujas decisões pendentes valem reler antes de
codificar.

Antes disso, nesta cópia: **decifrar o `.env`**, sem o qual não dá para rodar a
suíte inteira nem falar com o agente pelo banco de provas.

Dois itens saíram do escopo da fase 0 com motivo, e não por esquecimento: o
esquema Zod por intenção (acima) e o coletor de erro externo (o ponto de plugue
está em `src/instrumentation.ts`; a razão de não instalar o SDK está em
[pendencias-do-usuario.md](pendencias-do-usuario.md), item 9).

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
- **2026-08-14:** missão 1 do Módulo 31 (Negociações, gado) em produção,
  validada por áudio no aparelho.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
