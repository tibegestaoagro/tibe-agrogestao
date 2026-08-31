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

- Atualizado em: 2026-08-31.

### ⚠️ CHECKPOINT: o Confinamento está pronto e NÃO empurrado

**`main` local está 22 commits à frente do `origin`** (`430a1db..HEAD`), tudo
commitado, working tree limpo. **Nada foi mesclado nem empurrado.**

Verde agora: `tsc` 0, `lint` 0 erros, `npm run check` 14/14,
`npm run test:docs-api`, e nove suítes em 0 falhas (`m51`, `m47`, `m48`, `m4`,
`m34`, `isolation`, `drift`, `herd`, `nav`).

⚠️ **DUAS MIGRAÇÕES ESPERAM O NEON, e o push não pode acontecer antes delas**
(invariante 3). Nesta ordem, por timestamp:

1. `prisma/migrations/20260831140000_confinamento/`
2. `prisma/migrations/20260831150000_formas_de_cobranca/`

O banco local está nas **37** e up to date. Produção continua nas 35.

**Os três passos que faltam, em ordem:**

1. **Rejulgar** o range `430a1db..HEAD`. O primeiro julgamento deu **3/10** com
   13 achados; os 13 foram fechados na onda 6, e o rejulgamento não rodou.
2. **Validação ao vivo no navegador.** O juiz foi explícito: os achados de tela
   ele derivou por leitura, sem abrir navegador. Roteiro no fim desta seção.
3. **Migrações no Neon, depois merge e push**, com autorização do usuário.

**O que validar no navegador** (`npm run dev`, sem login para `/docs`, com
login para o painel):

- `/confinamento`: encerrar um lote informando **menos** que o saldo (15 de 40).
  Precisa salvar, dizer que restam 25, e o lote continuar na tabela com os dias
  contando. Informar **mais** que o saldo continua bloqueado.
- `/confinamento`: coluna "Categoria" com muitos lotes movimentados.
- `/financeiro`: filtro "Módulo" oferece Confinamento, e um lançamento de
  confinamento mostra o rótulo em vez de branco.
- Trocar o confinamento depois de escolher pasto: o campo precisa limpar.

### O time de agentes tem DEZ, e está na `main` desde 31/08

`servidor-acao`, `servidor-dados`, `servidor-agente`, `tela-pagina`,
`tela-kit`, `prova-suite`, `prova-juiz`, `prova-viva`, `n8n-fluxo`,
`explorador`. Mais as skills `orquestrar-ondas` e `memoria-cofre`, os comandos
`/onda`, `/juiz` e `/lembrar`, e o manual em
[como-orquestrar.md](como-orquestrar.md).

⚠️ **`prova-juiz` e `explorador` não registram** (ver
`docs/conhecimento/agente-com-modelo-nao-padrao-pode-nao-registrar.md`). Os
dois julgamentos rodaram por `general-purpose` com o contrato do juiz embutido
no prompt, e conferidos por `git status` de que não escreveram nada.

**O cofre tem 15 notas.** As desta rodada que mais importam para quem retomar:
`escrever-a-licao-nao-impede-repeti-la`,
`briefing-de-suite-cega-precisa-carregar-o-contrato`,
`migrate-diff-le-o-env-e-o-env-e-producao`,
`git-checkout-descarta-o-trabalho-do-agente`.

### O que vem depois do Confinamento

1. **A Área Leite**, ainda sem spec. Documento em
   `docs/area-funcional-confinamento/` (o do leite tem travessão no nome, por
   isso não é citado literal). Decisão já tomada: **lactação será contagem com
   data, desacoplada do livro-razão** (§37.2 e §4). A peça mais complexa é a
   fazenda como ponto de coleta (§18 a §21), que é o mesmo padrão do rebanho:
   mesmo espaço físico, donos diferentes, saldo por dono.
2. **A correção do rebanho invisível**, adiada pelo usuário. Spec pronta em
   `../superpowers/specs/2026-08-31-rebanho-invisivel-do-cadastro-assistido.md`,
   com as duas perguntas em aberto respondidas **sim**.

⚠️ **`ponytail` está ativo** (modo `full`), com 3 hooks globais, e o
`ponytail-subagent` propaga para os agentes despachados.

---

- **O PILOTO DO TIME DE AGENTES ESTÁ NA `main` E NO AR**
  (`ec07f84..e52acfc`, 27 commits, mesclado e empurrado em 31/08 com
  autorização do usuário; a branch `piloto-token-site-publico` foi apagada
  depois do merge). Site público
  em token semântico: 22 arquivos, 286 ocorrências, em 4 ondas de 9 tarefas
  paralelas. Dois tokens novos para bloco de código, suíte `m50` escrita cega
  da spec (vermelha na onda 1, verde na 2), portão de contraste de 25 para 26
  pares, conferência 8 de 9 para 22 famílias de cor e de 3 para 14 prefixos,
  catraca de 52 para 34. `check`, `tsc`, `lint` e `m50` verdes.
- ⚠️ **O processo achou quatro coisas que a sessão sozinha não acharia**, e a
  pior delas é que **o `dividas.md` e este arquivo afirmavam o falso**: que o
  painel do tenant estava inteiro em token semântico. Quatro arquivos de
  `(dashboard)/` pintam `divide-gray` cru, e a regex não os enxergava. Os dois
  documentos foram corrigidos. As quatro lições estão em `docs/conhecimento/`.
- **O TIME DE AGENTES ESTÁ NA `main` E NO AR** (`bfaed95..ec07f84`, 4 commits,
  fase 1 do plano). Cinco agentes em `.claude/agents/` (`tela-pagina`,
  `tela-kit`, `prova-suite`, `prova-juiz`, `explorador`), a skill
  `orquestrar-ondas`, o cofre `docs/conhecimento/` com 6 notas e a
  **conferência 13** (wikilink quebrado reprova, vista falhar nos dois
  sentidos: exit 1 com defeito plantado, exit 0 depois de remover), a skill
  `memoria-cofre`, o comando `/lembrar`, e o manual em
  [como-orquestrar.md](como-orquestrar.md). `check` (13 conferências), `tsc` e
  `lint` limpos. O `explorador` foi despachado e respondeu certo.
- **Agente novo carrega a quente**, como as skills: o reinício da sessão não é
  necessário. A sessão que os criou levou alguns minutos para enxergá-los.
- **AS CINCO FRENTES ESTÃO FECHADAS, MESCLADAS E NO AR.** A frente 5 (rollout
  do design system) foi mesclada em `bd5c88b` e empurrada
  (`143b0c2..bd5c88b`, 18 commits, 164 arquivos). Ela **não teve migração**:
  nenhuma mudança de schema. A branch `frente-5-design-system` foi apagada
  depois de conferido que não sobrava commit nem diferença de arquivo.
- **Deploy confirmado em produção**, e a confirmação exigiu técnica nova: a
  frente 5 **não criou rota nenhuma**, então `/docs/api` não servia de
  impressão digital. O que provou foi o token `--sobreposicao`, que não existia
  em `143b0c2` e hoje é servido por produção. **Para uma frente só de
  interface, a impressão digital é um token de `globals.css`, lido no navegador
  com `getComputedStyle(document.documentElement)`.**
- ⚠️ **Não sonde produção em laço com `curl`.** 28 chamadas em poucos minutos
  dispararam a proteção anti-bot da Vercel: todas as rotas públicas passaram a
  devolver `403` com `X-Vercel-Mitigated: challenge`. Não era queda, e
  navegador real resolve o desafio sozinho, mas o susto é caro e a mitigação
  não é para ser contornada. Confirmar deploy é verificação de navegador.
- **O painel do tenant fala por token semântico**, com quatro exceções achadas
  em 31/08 (`dividas.md` §2.5: `divide-gray` cru, que o portão não enxergava),
  e todo formulário de escrita nasce no kit (`FormSheet` + `Field` +
  `useErrosDeFormulario`).
- **Linhas de base, que só encolhem:** cor crua **125 → 52**; painel fora do
  kit **25 → 3**, sendo os três exceção permanente documentada
  (`postpone-button`, `user-row-actions`, `subscribe-form`). O que restou de
  cor crua é site público, auth e plataforma: ver `dividas.md` §2.5.
- ⚠️ **A validação ao vivo achou o que a suíte verde não achava, de novo.** As
  71 rotas devolviam a recusa do Zod crua: texto default **em inglês** ("Too
  small: expected number to be >=0") e sem o `field`, então a recusa caía no
  rodapé do painel em vez de embaixo do campo. Corrigido com um mapa de erro
  global (`src/lib/erros-de-zod.ts`) e `apiErroDeZod`, mais a **trava 12** no
  `npm run check`. A infraestrutura de `field` já existia e já funcionava:
  faltava ligá-la.
- **Dois defeitos herdados, do mesmo tronco:** `users.ts` recusava email
  repetido sem dizer o campo, e `fazenda-form` mandava município como string
  vazia quando em branco (o schema aceita ausente, recusa vazio), fazendo a
  recusa sair sobre um campo que a tela nem marca como obrigatório.
- **`npm run seed:demo` voltou a funcionar.** `wipeDemoData` não conhecia
  `HerdMovement`, `HerdStay`, `StockMovement` e `Negotiation`, que apontam para
  `Property` com `onDelete: Restrict`: o seed morria em chave estrangeira desde
  o Módulo 30, e `test:herd` falhava por falta de fixture. As duas coisas
  voltaram juntas.
- ⚠️ **Ferramenta nova para validar tela autenticada sem digitar senha:**
  `scripts/_sessao-local.ts` emite o cookie de sessão do NextAuth para o owner
  do seed, e `scripts/_cenario-onda2.ts` monta as cinco recusas no banco de
  dev. As duas travadas por `exigirBancoLocal()`.
- **As frentes 1 a 4 estão na `main` e no ar**, com o Módulo 31 fechado e o
  Neon nas 35 migrações (`npx prisma migrate status` responde "up to date"). O
  relato de cada uma está no histórico abaixo e nas mensagens de commit.
- ⚠️ **Confirme o deploy antes de supor que subiu.** O jeito barato de checar,
  sem senha: `/docs/api` é público e lista as rotas reais.
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

**O PILOTO FOI VALIDADO NO NAVEGADOR em 31/08, pelo usuário, e passou.**

Confirmado por observação direta, depois do deploy:

- **`/docs/setup`:** o aviso em âmbar está certo, e os dois chips que estavam
  invisíveis (1,000:1, o achado ALTO do juiz) **aparecem**. O conserto do T10
  (`border border-borda bg-superficie`) resolveu.
- **`/docs/api`:** os cinco selos de método **se distinguem** entre si, e o
  `PUT` verde, única mudança de pixel deliberada da frente, ficou de pé.

⚠️ **Isso resolve metade da dívida 2.7.** O que o usuário observou foram os
**selos**; os cerca de 107 chips `<code>` inline de `/docs/arquitetura`,
`/docs/schema` e `/docs/api`, a 1,056:1, não foram objeto de pergunta
específica. A dívida continua aberta para eles.

⚠️ **A ordem foi invertida nesta rodada, e vale registrar:** o merge e o push
foram autorizados ANTES da validação, então o site público foi ao ar com uma
frente reprovada duas vezes pelo juiz (6/10 e 5/10). Deu certo, e não é o
caminho: a regra 8 existe porque seis defeitos deste projeto passaram por suíte
verde.

Abrir sem login, em https://tibe-agrogestao.vercel.app (ou `npm run dev`):
`/`, `/planos`, `/faq`, `/politicas/termos`, `/criar-conta`, `/docs`,
`/docs/api`, `/docs/setup` e `/docs/schema`. Dois pontos exigem atenção:

1. ⚠️ **O badge `PUT` em `/docs/api` mudou de roxo para verde.** É a única
   mudança de pixel deliberada do piloto inteiro. Confira os cinco métodos
   lado a lado (GET azul, POST creme, PUT verde, PATCH âmbar, DELETE
   vermelho): **nenhum portão mede distinguibilidade entre eles**, nem para
   daltonismo.
2. Tabelas densas de `/docs/schema` e `/docs/glossario` (`divide-borda`), os
   chips `<code>` de `/docs/api`, e o separador "/" da trilha, que é decorativo
   e some sem ninguém notar.

⚠️ **NÃO trate "qualquer diferença visível" como defeito.** Esta instrução
estava aqui e era falsa: **cerca de 130 das 294 ocorrências mudam de tom de
propósito**, a maior delas `bg-gray-100` (#f3f4f6) virando
`--superficie-afundada` (#fcf8f5) em 106 lugares, o que clareia os chips
`<code>` de `/docs`. Quem validar com o critério errado reporta dezenas de
falsos positivos ou desiste de olhar, e nos dois casos o defeito de verdade
passa.

**O que procurar é elemento que SUMIU**, não elemento que mudou de tom: chip,
pílula, cartão ou linha de tabela que deixou de ter contorno próprio contra o
fundo. Foi assim que o juiz achou os chips invisíveis de `/docs/setup`.

⚠️ **O julgamento independente rodou DUAS vezes, e reprovou nas duas:
6/10 e depois 5/10.** O agente `prova-juiz` não registra (ver
`docs/conhecimento/agente-com-modelo-nao-padrao-pode-nao-registrar.md`), então
os dois foram por `general-purpose` com o contrato do juiz embutido: a rubrica
e a cegueira se preservam, mas a proibição de escrever virou disciplina em vez
de impossibilidade estrutural. Conferido nos dois: não escreveram nada.

**A segunda rodada achou sete coisas, e três continuam abertas:**

1. **Selos de método e ~107 chips `<code>` entre 1,037:1 e 1,100:1** contra o
   branco. O próprio T10 chamou 1,03:1 de "quase tão invisível quanto o
   defeito" ao recusar fundo branco puro para os chips do aviso, e depois
   deixou os cinco selos nessa faixa **sem borda**. É inconsistência do nosso
   próprio critério, e a decisão de fechar ou adiar é do usuário.
2. **`text-tibe-dark` pinta TEXTO com um token de SUPERFÍCIE**
   (`--superficie-invertida`), em 41 lugares do site público. No dia do tema
   escuro, o valor desse token será decidido pelo que a **sidebar** precisa
   ser, e essa decisão passa a governar a legibilidade dos títulos do site.
   Isso mina a justificativa da frente, que é destravar o modo escuro.
3. **`shadow-` e `outline-` escapam da conferência 8**, com `shadow-black/15`
   e `shadow-black/10` vivos em `confirm-dialog.tsx` e `toast.tsx`. O
   comentário do T09 afirma cobrir tudo que pinta pixel, e não cobre.

**A fase 3 está entregue: o time tem DEZ agentes.** Os quatro do Servidor
(`servidor-acao`, `servidor-dados`, `servidor-agente`, `prova-viva`), mais o
`n8n-fluxo`, pedido pelo usuário em 31/08 para alinhar as demandas de n8n que
vierem. Mais os comandos `/onda` e `/juiz`.

⚠️ **A skill `validacao-viva` que o plano previa NÃO foi escrita, de
propósito.** O conteúdo já vive no `CLAUDE.md` (carrega sempre) e no
`prova-viva.md` (carrega ao despachar). Terceira cópia é duplicata que
envelhece.

### O próximo passo real: os dois módulos parados em `.docx`

⚠️ **A correção do rebanho invisível está ADIADA por decisão do usuário em
31/08**, para não conflitar com o módulo novo. A spec já existe
([2026-08-31-rebanho-invisivel-do-cadastro-assistido.md](../superpowers/specs/2026-08-31-rebanho-invisivel-do-cadastro-assistido.md)),
com as decisões fechadas, e as duas perguntas em aberto (a pergunta a mais no
curral, e o levantamento dos lotes já invisíveis) o usuário respondeu **sim**
para as duas, a resolver **depois** da implementação.

O que vem é `docs/area-funcional-confinamento/`, com **dois** documentos, não
um:

- `Área Funcional Confinamento.docx`: confinamento próprio e boitel (v0.1,
  "documento em construção")
- o documento da **Área Leite**, na mesma pasta (o nome do arquivo tem
  travessão no meio, então não é citado literal aqui: a conferência 4 reprova)

Nenhum dos dois tem spec ainda. **Dá para lê-los sem instalar nada**: ver
`docs/conhecimento/ler-docx-do-cliente-sem-ferramenta-extra.md`.

As três frentes que o usuário separou continuam em aberto por trás disso:

1. **O app mobile**, congelado desde o início desta sequência. Nunca foi
   testado em aparelho de verdade (`dividas.md` §1.1 e §1.2).
2. **O classificador do n8n**, congelado pelo mesmo motivo: só volta a ser
   mexido com o sistema revisado, para não retrabalhar a cada mudança. Os
   handlers de WhatsApp das missões 3 e 4 existem e são testados, mas o agente
   **ainda não emite** `registrar_remessa_evento`, `encerrar_remessa_evento`
   nem `registrar_permuta`.
3. **Site público, auth e plataforma sem token semântico** (`dividas.md` §2.5,
   52 arquivos). É a frente que falta para o modo escuro ser possível no app
   inteiro, e não só no painel.

Próximo número livre de suíte: `m51`.

**Limpeza de branches feita em 2026-08-31.** Apagadas as 2 locais mescladas
(`modulo-31-leilao`, `modulo-31-permuta`) e 10 remotas já mescladas em `main`
(`backup/2026-08-18-interface`, `cancelamento-com-janela`, `estoque`,
`fundacao`, `higiene-instrucoes`, `modulo-31-leilao`, `modulo-31-permuta`,
`negociacoes`, `observabilidade`, `rebanho-livro-razao`). Ficou só
`origin/app-mobile-fundacao`, de propósito: tem os 3 commits com 5 defeitos
corrigidos e nunca retestados (ver Pendências). O `origin` agora só tem `main`
e essa. A `time-de-agentes` foi mesclada e apagada em 31/08, e o repositório
voltou a ter só as duas.

### O que estas cinco frentes ensinaram

**O método foi para o `CLAUDE.md`** (seção "Validação ao vivo"), porque é lá
que ele carrega em toda sessão: a ordem quebrar-trava → suíte → abrir a tela;
por que trava só vale depois de vista falhar; e por que teste que passa antes
E depois da correção não prova nada. **O detalhe de interface foi para
`.claude/rules/ui.md`**, que chega sozinho ao abrir qualquer arquivo de
`src/components/`, e o do contrato de erro para `.claude/rules/api.md`.

O que fica aqui é só o que não cabe em regra, porque é história desta rodada:

- **A trava 10 lê o ARQUIVO, não a função.** Os dois `category-manager`
  passavam tratando a recusa do painel enquanto o botão de ativar/desativar a
  engolia em silêncio. Quando desenhar trava nova, decida de propósito qual é
  a unidade que ela mede.
- **A trava 11 tem três exceções permanentes**, comentadas no `check-repo.ts`
  (`postpone-button`, `user-row-actions`, `subscribe-form`). Não as divida sem
  ler o porquê: as duas primeiras são controle inline em linha de tabela, e a
  terceira é pagamento, onde o QR do PIX precisa ficar na tela.
- **Fixture crua de rebanho precisa de `to_situation` e `to_owner`.**
  `getPositions` agrupa por (categoria, propriedade, situação, dono), e a venda
  procura o gado presente e próprio. Sem os dois campos o saldo fica invisível,
  e a tela parece errada quando quem errou foi a fixture.
- **A linha de base parou em 52, e o plano previa 32.** Não é trabalho
  esquecido: o plano contou os componentes de plataforma e de site público
  junto com os do painel. Ver `dividas.md` §2.5, que tem a tabela por
  categoria. Quando um plano e a realidade divergirem em número, escreva a
  conta: no mês que vem ninguém lembra.

O relato completo das **frentes 1, 3 e 4** foi para
[historico/2026-08.md](historico/2026-08.md) em 31/08: as tres estao em
producao, e o que precisava sobreviver aqui sao as decisoes, nao a narrativa.

O plano de sequencia das cinco frentes esta em
[../superpowers/specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md](../superpowers/specs/2026-08-27-sequencia-para-fechar-os-modulos-design.md)
e os planos de execucao, em `../superpowers/plans/`. Decisoes do usuario
registradas ali: app mobile e n8n so depois do sistema completo; nas missoes
novas o handler de WhatsApp nasce junto, o classificador nao; e nos primitivos
compartilhados, so troca de cor invisivel.

**O que a frente 1 deixou como padrão**, e que toda tela nova precisa seguir: o
envelope de erro diz qual campo o servidor recusou, e a fiação atravessa
`ActionResult`, `fail()` e as 59 rotas; o painel de escrita é `FormSheet` mais
`Field`, com o estado de erro pelo hook `useErrosDeFormulario`, que move o foco
e limpa o erro ao corrigir; vazio e espera são `EmptyState` e `Carregando`; e o
`npm run check` reprova cor crua nova, com linha de base que só encolhe.

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

- **2026-08-31:** time de agentes, fase 1, na branch `time-de-agentes` (3
  commits). O achado que orientou o desenho: este projeto já tinha inventado
  metade do protocolo (agentes A1/A2/A3 com "Escopo exclusivo" e "Proibido
  tocar", em `docs/arquitetura/onda-1-briefings.md`, e o juiz subagente com
  rubrica) e perdeu tudo junto com o Codex em 04/08. Voltou com as duas peças
  que faltavam: committer único e formação de onda por regra. De quebra, a
  stack passou a dizer Next 16, que é a versão real desde sempre.
- **2026-08-31:** frente 5 (rollout do design system) pronta na branch
  `frente-5-design-system`. O painel inteiro no kit e em token semântico, com
  duas travas novas no `check` (recusa engolida, painel fora do kit) e uma
  terceira depois da validação (recusa do Zod crua). A validação ao vivo achou
  o Zod falando inglês em 71 rotas, a recusa caindo no rodapé em vez do campo,
  o `seed:demo` quebrado desde o Módulo 30 e a pílula invisível do
  `bg-tibe-light`. Nenhum deles aparecia em suíte.
- **2026-08-28:** frente 4 (permuta) pronta na branch `modulo-31-permuta`, em
  nove commits, com o Módulo 31 fechando as quatro missões. A validação ao vivo
  achou `id` repetido no formulário de dois lados e o extrato do Rebanho
  mostrando nome de enum desde a frente 2, os dois corrigidos, o segundo com
  trava nova no `npm run check`.
- **2026-08-28:** frente 3 (leilão, feira e evento) pronta na branch
  `modulo-31-leilao`, em oito commits mais um de correções. A remessa é uma
  `Negotiation(evento)` sem valor com uma `HerdStay(evento)` filha, e o envio
  não gera lançamento nenhum. A validação no navegador achou quatro defeitos
  que a suíte verde não pegava, todos de sinal invertido na tela.
- **2026-08-28:** frente 2 (estadias temporárias do rebanho) pronta na branch
  `modulo-30-fase-2`, em nove commits, validada no navegador. O rebanho passa a
  separar propriedade de localização.
O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
