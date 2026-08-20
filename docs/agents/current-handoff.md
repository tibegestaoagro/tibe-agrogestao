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

- Atualizado em: 2026-08-20.
- **Produção: `21d5641` no ar**, e a fase 0 fechou por completo na branch. Ela foi mesclada e
  implantada inteira, em duas levas (`fundacao` e `observabilidade`), com o
  worker por cima. As **duas migrações foram aplicadas no Neon antes do push**,
  conforme o invariante 3, e `prisma migrate status` responde "Database schema
  is up to date!".
- **Conferido contra produção depois do deploy:** os seis cabeçalhos de
  segurança saem na resposta; `/dashboard` e `/docsinterno` devolvem 307;
  `/planos` devolve 200; `/api/v1/products` devolve 401 com o envelope; e o
  agente respondeu pelo banco de provas. A conferência de integridade contra o
  Neon voltou zero órfãos e zero duplicatas depois das migrações.
- **Duas correções provadas com o classificador real**, não só em teste:
  "me lembra de comprar sal dia 10" virou 10/09/2026 (antes o `new Date` cru
  daria outubro de 2001), e "gastei 1.200,00 com combustível" foi lido como
  R$ 1200.00 (antes viraria `NaN` e o assistente pediria o valor de novo).
  A recusa também segue cancelando, como deve.
- **O que a fase 0 entregou:** CI de verdade (com Postgres e Redis proprios, e
  drift de migracao), suites que provam gate de sessao e envelope de erro,
  Next 16 com React 19, quatro advisories de auth fechadas, cabecalhos de
  seguranca, integridade e auditoria no banco, `execute-action` endurecido,
  captura de excecao em pagina, normalizacao uniforme dos parametros do
  agente, e o worker da rotina diaria (codigo pronto, nao provisionado).
  O relato completo esta em [historico/2026-08.md](historico/2026-08.md); o
  plano que originou tudo vive fora do repo, em
  `C:\Users\dilto\.claude\plans\analise-o-projeto-me-elegant-walrus.md`.
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

O levantamento dos payloads reais mostrou que schema estrito é o instrumento
errado neste canal: rejeitar contradiz o desenho ("não entendi, pergunto"), o
`strip` do Zod apagaria cerca de 34 aliases que os handlers leem e que não
estão no contrato documentado, e `z.number()` quebraria com o que já está
medido em produção (`1200`, `"1200"`, `"60.000"`, `"60 mil"`). O que fazia
falta era normalização, e ela foi feita. Se um schema entrar um dia, que seja
por coerção e com `passthrough`, nunca por rejeição.

### A fase 0 está fechada

O último item era o rebanho cadastrado que não aparecia no saldo, e ele foi
corrigido: `createBatchAction` passa a emitir movimentação quando a categoria
antiga traduz para uma das 12, e quando não traduz o resíduo fica **visível**
(log e `scripts/diagnostico-integridade.ts`) em vez de silencioso.

Fechou junto: `npm run test:all` (as 48 suítes num comando, ~2 min) e
`medir-saldo.ts`, que é o gatilho escrito que autorizaria um dia introduzir
cache de saldo, decisão que o plano deliberadamente adiou.

**Próxima fase é a 1: identidade e sistema de design.** É onde a diferença
passa a aparecer na tela, e não só no comportamento.

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

**Fase 1 do plano: identidade e sistema de design.** A ordem interna dela já
está desenhada e importa: direção visual escolhida olhando, depois tokens
semânticos e o kit de componentes (serial, tudo depende deles), e só então as
telas, em ondas, com um commit por tela.

O primeiro commit da fase, antes até do kit, é a varredura das sete ações que
falham em silêncio hoje. É o que torna todo o resto testável por um humano.

Dois itens saíram do escopo da fase 0 com motivo, e não por esquecimento: o
esquema Zod por intenção (acima) e o coletor de erro externo (o ponto de plugue
está em `src/instrumentation.ts`; a razão de não instalar o SDK está em
[pendencias-do-usuario.md](pendencias-do-usuario.md), item 8).

Continua pendente, de antes: **teste no aparelho** pelo roteiro em
[roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md), cadastrando antes os
três produtos do bloco 0 em `/estoque`.

### Pendências

O levantamento completo, com evidência e custo de cada item, está em
**[dividas.md](dividas.md)** (2026-08-18). As três que mais pesam:

- **Estoque nunca foi testado no aparelho**, embora esteja em produção. É o
  próximo passo acima.
- **`app-mobile-fundacao` tem 3 commits fora da `main` desde 05/08**, com 5
  defeitos corrigidos e nunca retestados, enquanto a `main` recebeu os Módulos
  30 e 31 inteiros. É a dívida que mais cresce sozinha.
- ~~**Não existe CI.**~~ Resolvido em 2026-08-20 e já na `main`. Falta ligar a
  proteção de branch no GitHub, que é trabalho de interface web, e conferir a
  primeira execução (sem `gh` aqui, quem lê o resultado é o usuário).

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

- **2026-08-20:** fase 0 da evolução inteira em produção (`21d5641`), em duas
  levas mais o worker: CI de verdade, Next 16, quatro advisories de auth
  fechadas, envelope de erro e log estruturado, cabeçalhos de segurança,
  integridade e auditoria no banco, e a porta do agente endurecida. Validado em
  navegador, por requisição real e contra o classificador de produção.
- **2026-08-18:** higiene das instruções. `CLAUDE.md` de 1.211 para ~270 linhas,
  com a arqueologia movida para `.claude/rules/*.md` (carregam sozinhas por
  glob); travas de agente versionadas para travessão, heredoc com escape e
  merge/push/deploy; `npm run check`; `CONTRIBUTING.md` apagado.
- **2026-08-18:** missão 2 do Módulo 31 (Estoque) em produção, mais o
  classificador do n8n ensinado. O teste contra produção achou um defeito que
  gravava dinheiro, corrigido no mesmo dia.
- **2026-08-14:** missão 1 do Módulo 31 (Negociações, gado) em produção,
  validada por áudio no aparelho.
- **2026-08-13:** banco de provas do agente (`npm run wa`) em produção: conversa
  com o agente real e lê a resposta por programa, sem depender de print.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
