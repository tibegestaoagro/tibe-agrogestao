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

- Atualizado em: 2026-09-02.

### O Confinamento está no ar, e o que dele ainda vale saber

Subiu em 2026-09-01 (`430a1db..1fe1ccf`, 31 commits), com as três migrações
aplicadas no Neon antes do push, depois de um rejulgamento 4/10 e da onda 7 que
fechou oito dos dez achados. O detalhe está nas mensagens dos commits e em
`historico/2026-08.md`; o que sobrevive aqui é só o que ainda muda decisão:

⚠️ **`npm run db:deploy` contra o Neon é recusado pelo classificador de
permissões**, inclusive com `AUTORIZADO_PELO_USUARIO=1`, que só vale para o hook
do repositório. Leitura (`npx prisma migrate status`) passa. **Quem aplica
migração em produção é o usuário, no terminal.** Isso torna o invariante 3 mais
caro: commit que mexe em schema depende de um passo manual antes do push. Não
afrouxe a ordem por causa disso.

⚠️ **Item de menu dentro de grupo pode nascer invisível.** "Confinamento" fica
no grupo "Operação" (`src/lib/nav.ts`), e a pergunta "cadê o Confinamento?"
apareceu no mesmo dia do deploy. Vale para toda frente que criar item ali.

⚠️ **Confirmar deploy é verificação de navegador**, nunca `curl` em laço: 28
chamadas em poucos minutos já dispararam a proteção anti-bot da Vercel neste
projeto.

**Dois olhares de navegador ainda não feitos no Confinamento**, os dois sobre o
que só existe depois do JavaScript: a frase da `ORIGEM_AMBIGUA` embaixo do campo
"Pasto de origem" em `/confinamento`, e o painel "Encerrar" do `/rebanho` com os
três destinos. A cadeia inteira está provada; falta o pixel.

### Escopo que ficou de fora, de propósito

Dois pedidos do documento do cliente que a spec do Confinamento calou, achados
pelo juiz: o §29 (custos por lote) e o §17 (sete destinos de saída, três na
tela). **Não são defeito, são escopo.** Estão em `dividas.md` §2.8, e por
decisão do usuário entram numa **onda 8 própria**.

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

**O cofre tem 22 notas.** A desta rodada:
`media-de-periodo-precisa-dividir-dia-a-dia`.

### A FASE 1 DO LEITE ESTÁ PRONTA na branch, validada ao vivo

Branch **`area-leite-fase-1`**, cinco commits (`cc8a2e4..`), **não empurrada**.
Spec em `docs/specs/module-32-area-leite.md`.

Verde: `tsc` 0, `lint` 0 erros, `npm run check` **15/15**, `test:isolation`,
`test:docs-api` e `npm run test:m52` (78 asserções, 11 seções), e `npm run
build` limpo com as sete rotas e a tela.

**O que entrou:** três models (`MilkGroup`, `LactationEntry`, `MilkProduction`),
dois enums, a migração `20260902120000_area_leite_fase_1` (aplicada **só no
Docker local**), dez rotas em `/api/v1/milk/*`, a tela `/leite` dentro de
"Operação", e quatro intenções de WhatsApp roteadas e testadas.

⚠️ **A migração NÃO foi aplicada no Neon**, e o push depende disso primeiro
(invariante 3). Quem roda é o usuário, no terminal: o classificador de
permissões recusa `db:deploy` contra produção.

**Quatro decisões de 02/09, todas com o motivo na spec:** lote leiteiro é model
novo e não `AnimalBatch`; contagem por fazenda, lote é rótulo; uma linha por
registro de produção, com turno; cancela, não edita.

⚠️ **São QUATRO intenções de WhatsApp, não as três da spec.** O
`ajustar_vacas_em_lactacao` virou `registrar_entrada_lactacao` e
`registrar_saida_lactacao`: "entraram 4" e "sequei 4" carregam o mesmo número e
diferem só no verbo. A spec foi corrigida junto. O classificador do n8n **não
foi tocado**; o guia ganhou a seção 4.3, que lista o que existe e não é emitido.

**A validação ao vivo aconteceu**, contra `next dev` com o banco local, o cookie
de `scripts/_sessao-local.ts` e o cenário de `scripts/_cenario-leite.ts`
(idempotente). Desta vez **com navegador de verdade**, pela extensão do Chrome:

| caso | resultado real |
|---|---|
| painel | 32 vacas, 480 L, 15 L/vaca, com os seis períodos |
| média por vaca de ontem | 14,72 L/vaca/dia, ou seja, dividiu por 36 (a contagem DAQUELE dia), não por 32 |
| secar 500 de 32 | recusa **embaixo do campo**, em vermelho, com o foco nele |
| ordenha vazia | "Informe pelo menos uma ordenha" embaixo de "Manhã" |
| registrar 200 + 100 | duas linhas, 480 vira 780, média vira 24,38 |
| cancelar 100 L | 780 vira 680, média vira 21,25, linha marcada "Cancelado" |
| fazenda sem contagem | traço nos dois cartões, e a frase explicando |

⚠️ **Uma coisa que só a tela mostrou, e é decisão de produto, não defeito:** a
"média diária" divide pelos dias corridos da janela, então "Acumulado no ano:
120 L, média diária 0,49 L" numa fazenda com um registro. Está correto pela
definição escrita na spec (seção 6.4), e mesmo assim lê mal. A média POR VACA já
diz "6 de 31 dias entraram na conta"; a média diária não diz nada equivalente.

### ⏭️ PRÓXIMO PASSO: a decisão do usuário sobre a Fase 1

Nada é empurrado sem autorização. Quando ela vier, a ordem é: usuário aplica a
migração no Neon, confere `migrate status`, e só então o push (invariante 3).

Depois disso, a **Fase 2** (§12 a §22: tanque, ponto de coleta, leite de
terceiros), cuja análise estrutural está na **seção 12 da spec**. O ponto sem
paralelo continua sendo o §20: saldo por PROPRIETÁRIO dentro do mesmo tanque.

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

- **2026-09-02:** Fase 1 da Área Leite escrita e implementada, na branch
  `area-leite-fase-1`, ainda não empurrada. Quatro decisões que o documento do
  cliente não resolvia foram levadas ao usuário ANTES da primeira linha de
  código: lote leiteiro é model novo e não `AnimalBatch`; contagem por fazenda,
  lote é rótulo; cada registro de produção é uma linha com turno; e nada é
  editado, cancela e registra de novo. Implementar mudou uma coisa da spec, e a
  spec foi corrigida junto: são QUATRO intenções de WhatsApp, não três, porque
  "entraram 4" e "sequei 4" só diferem no verbo. A validação ao vivo foi feita
  com NAVEGADOR de verdade pela primeira vez neste projeto (extensão do Chrome),
  e mostrou a recusa embaixo do campo, o registro de duas ordenhas mudando o
  painel, o cancelamento recalculando a média, e o traço na fazenda sem
  contagem. Achado que só a tela deu: a "média diária" divide pelos dias
  corridos, e "0,49 L" no acumulado do ano está certo pela definição e lê mal.

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

