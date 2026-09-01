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

- Atualizado em: 2026-09-01.

### O Confinamento ESTÁ NA `main` E NO AR

**Empurrado em 2026-09-01** (`430a1db..1fe1ccf`, 31 commits), com autorização do
usuário, e **depois** das migrações, como manda o invariante 3.

As **três** migrações estão aplicadas no Neon, que está nas **38** e up to date:

1. `20260831140000_confinamento`
2. `20260831150000_formas_de_cobranca`
3. `20260831160000_boitel_para_confinamento` (reclassifica o dinheiro de boitel
   já gravado; predicado provado antes de aplicar, com três linhas plantadas no
   banco de dev: a do boitel virou `confinamento`, a de pasto de terceiro e a
   solta sem `related_id` não se mexeram)

⚠️ **`npm run db:deploy` contra o Neon é recusado pelo classificador de
permissões**, inclusive com a marca `AUTORIZADO_PELO_USUARIO=1`, que só vale
para o hook do repositório. Leitura (`npx prisma migrate status`) passa. O
usuário pôs um bloco `autoMode.allow` em `.claude/settings.local.json` (local,
fora do git) em 01/09, mas **a sessão que já estava aberta não recarregou**:
quem rodou a migração foi o usuário, no terminal. Numa sessão nova a permissão
deve valer; se não valer, o caminho é pedir para ele rodar.

⚠️ **Isso torna o invariante 3 mais caro:** commit que mexe em schema agora
depende de um passo manual do usuário antes do push. Não afrouxe a ordem por
causa disso.

### O rejulgamento deu 4/10, e a onda 7 fechou oito dos dez achados

O juiz independente (por `general-purpose`, com o contrato embutido) leu o range
inteiro sem o relato de quem implementou, e reprovou: **4/10**, com R3, R4 e R5
empatados no fundo. Dez achados, todos com cenário concreto. Os cinco mais
graves foram conferidos à mão antes de virar tarefa, e os cinco procedem.

**Onda 7, seis commits (`237d548..9523c45`), fechou:**

- **T20:** `cancelStay` procurava a conta com `related_module: "rebanho"` fixo, e
  a do confinamento nasce em `"confinamento"`: cancelar deixava a despesa
  `pending` para sempre. A busca agora é por `related_id` sozinho. Junto, o §15
  do cliente: boitel passou a `related_module: "confinamento"`, **só para
  lançamento novo**, e a divisão histórica está em comentário.
- **T21:** `HERD_CHARGE_TYPES` virou `Object.values(HerdChargeType)`, e a rota do
  confinamento passou a importá-la em vez de escrever o enum à mão. O §16 do
  cliente ("R$ 12,00 por cabeça/dia") era oferecido pela tela e recusado com 422.
- **T22:** o `/rebanho` oferecia "Encerrar" num painel sem nenhum campo, e o
  título "Fora da fazenda agora" mentia para dois dos seis tipos. Virou
  "Estadias em aberto".
- **T23:** oito campos em três formulários engoliam a recusa do servidor por
  completo, incluindo a `ORIGEM_AMBIGUA` criada uma tarefa antes. E as colunas
  "Saídas" e "Mortes" do §24 contavam as mesmas cabeças duas vezes.
- **T24:** no WhatsApp, "sim" à pergunta do pasto jogava a conversa fora, e
  alimentar lote em boitel era negado com uma frase falsa. Os quatro handlers do
  Confinamento não tinham suíte nenhuma; agora têm a seção 15 da `m51`.
- **T25:** **conferência 15** do `npm run check`, que pergunta campo por campo o
  que a 10 pergunta por arquivo. Ela achou mais nove campos mudos fora do
  Confinamento, corrigidos em vez de baselinados: a linha de base nasce vazia.

**Cada trava e cada tipagem foi provada nos dois sentidos**, com a saída real nos
commits.

**Verde agora:** `tsc` 0, `lint` 0 erros, `npm run check` **15/15**, e
**`npm run test:all` em 54/54**, com Postgres E Redis locais, em ~3 min. É a
primeira vez nesta frente que a suíte inteira roda de uma vez, e não só as da
área.

### O passo que falta: validação ao vivo, agora em PRODUÇÃO

O juiz foi explícito: os achados de tela ele derivou por leitura, **sem abrir
navegador**. O roteiro abaixo nunca foi executado, e agora o código está no ar,
então ele vale contra `https://tibe-agrogestao.vercel.app` tanto quanto contra o
`next dev`.

⚠️ **Confirmar o deploy é verificação de navegador**, nunca `curl` em laço: 28
chamadas em poucos minutos já dispararam a proteção anti-bot da Vercel neste
projeto. A impressão digital desta frente é `/docs/api` listando as rotas de
`/api/v1/confinement/*`.

⚠️ **No painel, "Confinamento" fica DENTRO do grupo "Operação"**
(`src/lib/nav.ts`), que nasce fechado, e só aparece com `hasFazenda`. Um cliente
que não expande o grupo não vê o módulo, e isso já gerou a pergunta "cadê o
Confinamento?" em 01/09.

**O que abrir no navegador** (`npm run dev`; `npx tsx scripts/_sessao-local.ts`
emite o cookie do owner do seed, sem digitar senha):

- `/confinamento`, "Registrar entrada": escolher **"Por cabeça/dia"** e salvar.
  Antes devolvia 422 calado; precisa aceitar.
- `/confinamento`, mesma tela: deixar "Pasto de origem" em branco com saldo em
  dois pastos. A recusa `ORIGEM_AMBIGUA` precisa **aparecer embaixo do campo**.
  Era o defeito mais grave: a tela ficava muda.
- `/confinamento`: encerrar informando **menos** que o saldo (15 de 40). Salva,
  diz que restam 25, o lote continua com os dias contando. Informar **mais**
  continua bloqueado. Conferir "Saídas" e "Mortes" não somando as mesmas cabeças.
- `/rebanho`: um lote de confinamento aparece sob **"Estadias em aberto"**, com
  rótulo "Confinamento", e o botão "Encerrar" abre painel **com** campos.
- `/financeiro`: cancelar uma estadia de confinamento com cobrança. A conta a
  pagar precisa **sumir**. E o filtro "Módulo" mostra boitel em Confinamento.

### Escopo que ficou de fora, de propósito

Dois pedidos do documento do cliente que a spec calou, achados pelo juiz: o §29
(custos por lote não têm caminho no produto) e o §17 (sete destinos de saída,
três na tela). **Não são defeito de implementação, são escopo.** Foram para
`dividas.md` §2.8, e por decisão do usuário entram numa **onda 8 própria**, com
as perguntas de produto trazidas junto da spec.

### O time de agentes tem DEZ, e está na `main` desde 31/08

`servidor-acao`, `servidor-dados`, `servidor-agente`, `tela-pagina`, `tela-kit`,
`prova-suite`, `prova-juiz`, `prova-viva`, `n8n-fluxo`, `explorador`. Mais as
skills `orquestrar-ondas` e `memoria-cofre`, os comandos `/onda`, `/juiz` e
`/lembrar`, e o manual em [como-orquestrar.md](como-orquestrar.md).

⚠️ **`prova-juiz` e `explorador` não registram** (ver
`docs/conhecimento/agente-com-modelo-nao-padrao-pode-nao-registrar.md`). Os três
julgamentos rodaram por `general-purpose` com o contrato do juiz embutido no
prompt, conferidos por `git status` de que não escreveram nada.

⚠️ **Os seis agentes da onda 7 morreram todos no limite de sessão** antes de
terminar, e um deles alcançou escrever no working tree. A onda foi refeita pela
sessão principal, tarefa por tarefa. Lição registrada: **conferir o working tree
depois de agente que morre**, porque o que ele deixou não está verificado.

**O cofre tem 18 notas.** As desta rodada:
`campo-no-ordem-sem-error-engole-a-recusa`,
`record-string-e-onde-o-enum-cresce-sem-avisar`,
`filtro-na-busca-esconde-o-defeito-que-o-teste-procura`.

### O que vem depois

1. **Onda 8:** os dois pedidos do cliente da `dividas.md` §2.8.
2. **A Área Leite**, ainda sem spec. Documento em
   `docs/area-funcional-confinamento/` (o do leite tem travessão no nome, por
   isso não é citado literal). Decisão já tomada: **lactação será contagem com
   data, desacoplada do livro-razão** (§37.2 e §4).
3. **A correção do rebanho invisível**, adiada pelo usuário: `dividas.md` §2.9.

⚠️ **`ponytail` está ativo** (modo `full`), com 3 hooks globais, e o
`ponytail-subagent` propaga para os agentes despachados.

---

- **2026-09-01:** **Confinamento no ar** (`430a1db..1fe1ccf`, 31 commits), com
  as três migrações aplicadas no Neon ANTES do push. A terceira reclassifica o
  dinheiro de boitel já gravado de `rebanho` para `confinamento`, fechando a
  divisão histórica que o T20 tinha deixado registrada. Descoberto no caminho:
  `npm run db:deploy` contra produção é recusado pelo classificador de
  permissões, e a marca `AUTORIZADO_PELO_USUARIO=1` não vale para ele; quem
  rodou foi o usuário, no terminal. A validação ao vivo continua pendente, e
  agora é contra produção.

- **2026-08-31:** Confinamento (fase 3 do Módulo 30) rejulgado e corrigido. O
  juiz independente deu **4/10** com dez achados, e a onda 7 fechou oito deles
  em seis commits. Os quatro que importam: a conta a pagar do confinamento
  sobrevivia ao cancelamento; a tela oferecia uma forma de cobrança que a rota
  recusava; o `/rebanho` abria um painel de encerramento sem nenhum campo; e
  oito campos engoliam a recusa do servidor por completo. A causa comum dos
  três últimos era `Record<string, ...>` em mapa com chave de enum, que não
  quebra o `tsc` quando o enum cresce. Conferência 15 nova, e o handoff
  arquivado depois de 487 linhas.

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

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md), que também guarda as 358 linhas
arquivadas deste arquivo em 31/08.

