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

- Atualizado em: 2026-08-27.
- ⚠️ **O trabalho vivo NÃO está na `main`.** A branch é
  `piloto-design-rebanho`, com a frente 1 inteira e nada mesclado ainda. A
  `main` continua no `727db50`, e o que está no ar é o `979ba2e`: nenhum
  commit depois dele tocou `src/` até esta branch nascer.
- **Nenhuma migração nova desde o `21d5641`**, e a frente 1 não toca schema.
  O invariante 3 não está em jogo.
- **Nenhuma migração nova desde o `21d5641`.** Os commits posteriores não tocam
  em `prisma/`, então o invariante 3 não está em jogo e o Neon segue em dia.
- **A fase 1 (identidade e sistema de design) começou**, com três commits na
  `main`, na ordem que o plano exige: falha visível e alvo de 44px (`60e4d87`),
  tokens semânticos de cor com a catraca de contraste (`638d0f6`), e leitura de
  número em português com `Field`, `FormSheet` e `MoneyInput` (`979ba2e`). O
  detalhe de cada um está na mensagem do commit; as três catracas novas rodam
  no `npm run check`.
- **O `.env.enc` saiu do git em 25/08** e voltou a ser arquivo local: backup de
  chaveiro não transita pelo repositório. O `.gitignore` cobre todo `.env*` sem
  exceção. Caminho atual em [../backup-env.md](../backup-env.md).
- **O classificador do n8n já conhece as 4 intenções de estoque**, ensinadas em
  2026-08-18 pelo MCP do n8n. Backup do workflow anterior em `D:\tmp\n8n-backup`.
  Ele segue **congelado** por decisão do usuário: só volta a ser mexido quando o
  sistema estiver revisado, para não retrabalhar a cada mudança.

### A fase 0 está fechada, e o Zod por intenção não foi feito

Os dois relatos estão em [historico/2026-08.md](historico/2026-08.md): o que a
fase 0 entregou (CI, Next 16, envelope de erro, cabeçalhos, integridade,
auditoria, worker), e por que schema estrito é o instrumento errado no canal do
WhatsApp. Em uma linha, sobre o Zod: faltava normalização, e ela foi feita.

⚠️ **O plano que originou a fase 0 vive FORA do repositório** e não viajou para
esta cópia. O que o substituiu está em `docs/superpowers/`, versionado.

### A cópia nova: `C:\projetos\tibe-agrogestao`

Clonada em 2026-08-24, preparada e conferida na mesma rodada: `npm run check`
com 0 falhas e **48/48 suítes verdes**. O que montar do zero revelou (container
que precisa ser criado antes, `seed:demo` obrigatório, Redis local, `openssl`
fora do PATH) já virou texto no `CLAUDE.md`, e o relato está arquivado em
[historico/2026-08.md](historico/2026-08.md).

**`gh` continua não existindo**, como já acontecia na outra máquina. O que
existe, desde 25/08, é a extensão do Claude em **dois perfis do Chrome**: um
logado como `dilton-pleno`, colaboradora, e outro como `tibegestaoagro`, a
conta dona. Configuração de repositório só abre pelo segundo, e a extensão
precisa estar **conectada à conta Claude em cada perfil**, não só instalada.

⚠️ **A identidade do git neste repositório é local** (`user.name` e
`user.email` apontando para `tibegestaoagro` desde 25/08). A credencial de
push, porém, continua sendo a do Gerenciador de Credenciais do Windows: assinar
o commit e empurrar são coisas diferentes, e a Vercel olha para quem empurra.

### O que depende do usuário, e degrada em silêncio até ser feito

A lista completa, com passo a passo e o que acontece se não for feito, está em
**[pendencias-do-usuario.md](pendencias-do-usuario.md)**. Em resumo:

⚠️ **Nem tudo está lá.** O que envolve segredo, chaveiro e rotação **não é
versionado**, por decisão do usuário em 25/08: vive num arquivo local, numa
pasta irmã da do projeto, com o sufixo `-local` no nome. Ele não viaja com o
clone e não existe na outra máquina. Se você é uma sessão futura: não traga
esse conteúdo para cá, nem redescubra e escreva de novo.

1. **Subir o plano da Vercel.** No gratuito, push de colaborador não dispara
   deploy, e o `dilton-pleno` é colaborador: o commit entra na `main` e nenhum
   deploy nasce, sem erro. Enquanto isso, empurrar pela conta dona.
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

**A frente 1 está pronta na branch `piloto-design-rebanho`, esperando sua
aprovação para mesclar.** Depois dela vem a frente 2, a fase 2 do Módulo 30.

O plano de sequência das cinco frentes está em
[../superpowers/specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md](../superpowers/specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md)
e o plano de execução da frente 1, em
[../superpowers/plans/2026-08-27-piloto-design-rebanho.md](../superpowers/plans/2026-08-27-piloto-design-rebanho.md).
Decisões do usuário registradas ali: app mobile e n8n só depois do sistema
completo; nas missões novas o handler de WhatsApp nasce junto, o classificador
não; e nos primitivos compartilhados, só troca de cor invisível.

**O que a frente 1 entregou**, em dez commits: o envelope de erro passa a dizer
qual campo o servidor recusou (e a fiação atravessa `ActionResult`, `fail()` e
as 59 rotas); as duas decisões de formulário viraram função pura com suíte
(`npm run test:m46`); os quatro painéis do Rebanho viraram `<form>` de verdade,
com erro por campo, foco no primeiro inválido e limpeza ao corrigir;
`EmptyState` e `Carregando` nasceram (o primeiro esqueleto do projeto); a
tabela larga passou a rolar dentro do quadro; o Rebanho zerou a cor crua; e o
`npm run check` ganhou a catraca de cor, com linha de base de 125 arquivos que
só pode encolher.

**Validado no navegador em 27/08**, contra o Postgres local, com as seis
conferências do plano fechadas por medição e não por impressão: foco no campo
certo, refoco na segunda tentativa, saldo insuficiente aparecendo no campo de
quantidade, submit pelo `requestSubmit` (o caminho da tecla do teclado), os
dois estados vazios, e a 400px a tabela de 419px rolando por dentro sem a
página rolar de lado.

A referência visual continua sendo
[../design/briefing-novo-layout.md](../design/briefing-novo-layout.md), que é
planejamento e não spec fechada.

Dois itens saíram do escopo da fase 0 com motivo, e não por esquecimento: o
esquema Zod por intenção (acima) e o coletor de erro externo (o ponto de plugue
está em `src/instrumentation.ts`; a razão de não instalar o SDK está em
[pendencias-do-usuario.md](pendencias-do-usuario.md), item 11).

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

- **2026-08-27:** frente 1 (piloto de design no Rebanho) pronta na branch
  `piloto-design-rebanho`, em dez commits, validada no navegador contra o banco
  local. O alinhamento das cinco frentes e o plano de execução estão em
  `docs/superpowers/`.
- **2026-08-25:** `dividas.md` perdeu os itens 3.2, 3.3 e 3.4, que estavam
  fechados desde 18 a 24/08 (Redis local, `npm run test:all`, CI). Da seção 3
  sobrou o 3.1, o `m23-token-auth.test.ts` que não compila. O `.env.enc` saiu
  do controle de versão, e a identidade do git deste repositório passou a ser a
  conta dona.
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

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
