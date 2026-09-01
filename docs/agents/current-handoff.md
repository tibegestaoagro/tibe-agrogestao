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
inteiro sem o relato de quem implementou e reprovou: **4/10**, dez achados, todos
com cenário concreto. Os cinco mais graves foram conferidos à mão antes de virar
tarefa, e os cinco procediam.

**A onda 7 são seis commits, `237d548..9523c45`, e cada mensagem carrega o
defeito, a correção e a prova nos dois sentidos.** O resumo: a conta a pagar do
confinamento sobrevivia ao cancelamento (T20); a tela oferecia uma forma de
cobrança que a rota recusava (T21); o `/rebanho` abria painel de encerramento
sem nenhum campo (T22); oito campos engoliam a recusa do servidor por completo
(T23); o "sim" do WhatsApp jogava a conversa fora (T24); e a **conferência 15**
nasceu para pegar por campo o que a 10 só pergunta por arquivo (T25).

⚠️ **A causa comum de três dos quatro defeitos de tela era a mesma:**
`Record<string, ...>` em mapa cuja chave é valor de enum. Quando o enum cresce,
o `tsc` não reclama. Ver
`docs/conhecimento/record-string-e-onde-o-enum-cresce-sem-avisar.md`.

**Verde no fim da onda:** `tsc` 0, `lint` 0 erros, `npm run check` **15/15**, e
`npm run test:all` em **54/54** com Postgres E Redis locais, em ~3 min.

### A validação ao vivo ACONTECEU, e o que ela alcançou

Feita em 2026-09-01, contra `next dev` com o banco local e o cookie de
`scripts/_sessao-local.ts`. O cenário está em `scripts/_cenario-confinamento.ts`
(idempotente). **Os cinco casos do juiz passaram**, contra o app de verdade:

| caso | resultado real |
|---|---|
| §16 "por cabeça/dia" | `POST /api/v1/confinement/stays` devolveu **201**; antes era 422 |
| `ORIGEM_AMBIGUA` | **422** com `field: "pasture_id"` e a frase nomeando os dois pastos |
| conta órfã | conta em `confinamento` antes, **zero em módulo nenhum** depois de cancelar |
| saída parcial (§20) | 15 de 40: `encerrada: false`, `saldo_aberto: 25`. 30 recusado com `field: "quantity"` |
| boitel na DRE (§15) | a conta de R$ 12.000 aparece sob `related_module=confinamento` |

No HTML renderizado: **"Estadias em aberto"** (não mais "Fora da fazenda
agora"), rótulo "Confinamento", `tipo: "confinamento"` chegando ao
`StayCloseForm` com `saldoAberto: 40`, "Por cabeça/dia: R$ 12,00", e **zero**
ocorrências de rótulo cru de enum.

⚠️ **O que essa validação NÃO alcança:** o `browser-harness` não está instalado
nesta máquina, então nada foi clicado. Tudo que só existe depois do JavaScript
rodar (a recusa aparecendo embaixo do campo, foco, contraste) ficou provado
**por cadeia**, não por pixel: a rota devolve o `field` certo, o
`aplicarErroDoServidor` manda para `erros.<campo>`, a conferência 15 garante o
`error=` em todo campo do `ORDEM`, e o `Field` renderiza `<p role="alert">`.
Cada elo foi verificado; o conjunto não foi visto.

**Se alguém abrir o navegador**, o que ainda vale olhar é só isso: a frase da
`ORIGEM_AMBIGUA` embaixo do campo "Pasto de origem", e o painel "Encerrar" do
`/rebanho` com os três destinos aparecendo.

### O que sobrou para o navegador, e duas armadilhas do painel

Só dois olhares, e os dois são sobre o que acontece DEPOIS do JavaScript:

- `/confinamento`, "Registrar entrada": deixar "Pasto de origem" em branco com
  saldo em dois pastos. A frase da `ORIGEM_AMBIGUA` precisa **aparecer embaixo
  do campo**. A rota já devolve o `field` certo (provado); falta ver o pixel.
- `/rebanho`: o botão "Encerrar" de um lote de confinamento abre painel **com**
  os três destinos.

⚠️ **"Confinamento" fica DENTRO do grupo "Operação"** (`src/lib/nav.ts`), que
nasce fechado, e só aparece com `hasFazenda`. Um cliente que não expande o grupo
não vê o módulo, e isso gerou a pergunta "cadê o Confinamento?" em 01/09. Vale
para toda frente que criar item de menu dentro de grupo.

⚠️ **Confirmar deploy é verificação de navegador**, nunca `curl` em laço: 28
chamadas em poucos minutos já dispararam a proteção anti-bot da Vercel neste
projeto. A impressão digital desta frente é `/docs/api` listando as rotas de
`/api/v1/confinement/*`.

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

### A spec da Fase 1 do Leite ESTÁ ESCRITA, esperando aprovação

`docs/specs/module-32-area-leite.md`, na branch **`area-leite-fase-1`**
(commit `cc8a2e4`, um arquivo, nenhum código). `npm run check` em 15/15.

A spec detalha a **Fase 1** (§4 a §11: lactação, produção, média por vaca,
histórico) e guarda na seção 12 a análise das fases 2 e 3, que saiu deste
handoff para não ser resumida destrutivamente a cada rodada.

**Quatro decisões novas, tomadas com o usuário em 02/09. Execute, não
redecida:**

1. O lote leiteiro é um model novo e leve (`MilkGroup`), **não** o
   `AnimalBatch`: o §37.3 mantém os animais nas categorias do Rebanho.
2. A contagem de vacas em lactação é **por fazenda**; o lote é rótulo do
   registro, sem saldo próprio.
3. Cada registro de produção é **uma linha**, com turno (`dia`, `manha`,
   `tarde`, `noite`). O total do dia é a soma.
4. Nada é editado nem apagado: cancela e registra de novo (§37.11).

⚠️ **A Área Leite não escreve no livro-razão do rebanho.** Nenhuma
`HerdMovement`, nenhum `AnimalBatch` tocado (§37.1, §37.2, §37.4). Se a
implementação importar `herd-ledger`, parou no lugar errado.

⚠️ **O §8 pede "quantidade de vacas em lactação" no registro de produção, e
o model NÃO tem esse campo, de propósito.** Ele vive no formulário e grava um
`LactationEntry` na mesma transação: gravar ali criaria uma segunda fonte
para o mesmo número.

**Próximo passo:** com a aprovação do usuário, implementar a Fase 1 na ordem
da spec, e na ordem do contrato (action, rota, tela). Três models novos, dois
enums, uma migração, dez rotas em `/api/v1/milk/*`, a tela `/leite` dentro do
grupo "Operação", e os três handlers do §36 nascendo sem o classificador
emitir. Suíte nova: o próximo número livre é `m52`.

### Depois do Leite

1. **Onda 8:** os dois pedidos do cliente da `dividas.md` §2.8.
2. **A correção do rebanho invisível**, adiada pelo usuário: `dividas.md` §2.9.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **`.env.example` está modificado e NÃO commitado no desktop**, desde antes de
  31/08. A mudança REMOVE a documentação das duas variáveis do banco de provas
  (`npm run wa`), escrita em 24/08 porque o código as lê. Ficou parada ali,
  esperando decisão do usuário. Ela não viaja: é edição local do desktop.
- **O desktop tem pouca memória para este projeto** (relato do usuário em
  01/09), e o Turbopack morre lá quando outro projeto está rodando teste. Ver
  `docs/conhecimento/turbopack-nao-cria-processo-quando-a-maquina-esta-cheia.md`.

⚠️ **`ponytail` está ativo** (modo `full`), com 3 hooks globais, e o
`ponytail-subagent` propaga para os agentes despachados.

---

- **2026-09-02:** spec da Fase 1 da Área Leite escrita, na branch
  `area-leite-fase-1` (`cc8a2e4`, nenhum código). Quatro decisões que o
  documento do cliente não resolvia foram levadas ao usuário antes de
  qualquer linha: o lote leiteiro é model novo e não o `AnimalBatch`; a
  contagem de vacas é por fazenda e o lote é rótulo; cada registro de
  produção é uma linha com turno; e nada é editado, cancela e registra de
  novo. A análise estrutural das fases 2 e 3 saiu deste handoff e passou a
  viver na seção 12 da spec.

- **2026-09-01:** **Confinamento no ar** (`430a1db..1fe1ccf`, 31 commits), com
  as três migrações aplicadas no Neon ANTES do push. A terceira reclassifica o
  dinheiro de boitel já gravado de `rebanho` para `confinamento`, fechando a
  divisão histórica que o T20 tinha deixado registrada. Descoberto no caminho:
  `npm run db:deploy` contra produção é recusado pelo classificador de
  permissões, e a marca `AUTORIZADO_PELO_USUARIO=1` não vale para ele; quem
  rodou foi o usuário, no terminal. **A validação ao vivo foi feita no mesmo
  dia**, contra `next dev` com cookie de sessão: os cinco casos do juiz passaram
  no app de verdade, e o que só existe depois do JavaScript ficou provado por
  cadeia, não por pixel (o `browser-harness` não está instalado). Documento da
  Área Leite lido inteiro, com as três decisões de produto tomadas.

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

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md), que também guarda as 358 linhas
arquivadas deste arquivo em 31/08.

