---
tipo: armadilha
data: 2026-08-31
tags: [ambiente, time-de-agentes, claude-code]
origem: .claude/agents/
---

# Agente só de leitura pode sumir do registro, e o juiz é sempre um deles

## O que aconteceu

Os cinco agentes de `.claude/agents/` foram criados juntos e registraram
juntos, com alguns minutos de atraso (skill carrega a quente, agente demora).

Depois, **dois deles sumiram** e passaram a dar `Agent type not found`, em
várias tentativas ao longo de vinte minutos. A correlação é exata, 5 de 5:

| agente | ferramentas | modelo | registrou |
|---|---|---|---|
| `explorador` | só leitura | haiku | não |
| `prova-juiz` | só leitura | opus | não |
| `prova-suite` | com `Write`/`Edit` | sonnet | sim |
| `tela-kit` | com `Write`/`Edit` | sonnet | sim |
| `tela-pagina` | com `Write`/`Edit` | sonnet | sim |

⚠️ **Duas variáveis mudam juntas**, e por isso a primeira leitura foi errada.
A hipótese inicial foi o **modelo** (haiku e opus fora, sonnet dentro). Ela foi
testada: a linha `model:` saiu do frontmatter, o tier passou a ser dado no
despacho, esperou-se o registro, e **continuou indisponível**. A hipótese caiu,
e a mudança foi revertida.

Sobra a outra: os dois que somem são exatamente **os dois sem `Write` nem
`Edit`**. Não está provado (testar exigiria dar `Write` ao juiz, que destrói o
motivo de ele existir), mas é o que resta de pé.

O `explorador` chegou a ser despachado com sucesso uma vez antes de sumir, o
que descarta erro de formato: o frontmatter é idêntico ao dos agentes globais
que funcionam.

## Por que importa

O `prova-juiz` é o último portão de toda frente. Se ele não registra, a
tentação é substituí-lo por uma revisão da própria sessão que orquestrou, e
isso é exatamente o julgamento contaminado que o desenho existe para evitar.

## Como aplicar

- **Se um agente sumir, espere e repita** antes de mexer no arquivo: o registro
  é lento e intermitente, e uma repetição custa nada.
- ⚠️ **Não mexa na configuração mais de uma vez por hipótese não provada.**
  Aqui a config foi alterada duas vezes seguindo um palpite, e as duas
  precisaram ser desfeitas. Quando duas variáveis mudam juntas, a correlação
  não diz qual é a causa: ou se isola uma, ou se admite que não se sabe.
- **Não substitua o juiz pela sessão que orquestrou.** Uma frente entregue sem
  julgamento independente é uma frente com uma lacuna, e dizer isso vale mais
  do que preencher a lacuna com a opinião de quem fez o trabalho.
- A ferramenta de despacho aceita `model` por chamada, e ele vence o
  frontmatter. Continua sendo o caminho se o frontmatter algum dia se provar
  culpado, mas **não foi** o que resolveu aqui.

## Correção em 2026-11-10: a causa era o YAML do cabeçalho

A hipótese das ferramentas também estava errada. Em 10/11 sumiram quatro:
`explorador`, `prova-juiz`, `prova-viva` e `servidor-dados`, e os dois últimos
têm `Write` e `Edit`. O que os quatro tinham em comum era um `: ` (dois pontos e
espaço) dentro do `description:` sem aspas, como em "Use para localizar código:
onde está X". Para o YAML isso abre um mapa no meio do valor, o cabeçalho não
lê e o Claude Code descarta o agente sem avisar (`Agent type not found`).
Provado com o `js-yaml`: a versão antiga dos quatro dava "bad indentation of a
mapping entry", a versão com a descrição entre aspas lê, e os seis que
registravam já liam. "O frontmatter é idêntico ao dos que funcionam" foi o
engano de 31/08: idêntico na forma, não no conteúdo.

- Descrição de agente ou skill com `: ` vai entre aspas duplas.
- Agente que some: leia o cabeçalho com um parser de YAML antes de qualquer
  hipótese sobre modelo ou ferramenta.

## Relacionado

- [[suite-cega-cobra-mais-do-que-o-briefing-mandou]]
