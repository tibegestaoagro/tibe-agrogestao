---
tipo: armadilha
data: 2026-08-31
tags: [ambiente, time-de-agentes, claude-code]
origem: .claude/agents/
---

# Agente com modelo diferente de sonnet pode sumir do registro

## O que aconteceu

Os cinco agentes de `.claude/agents/` foram criados juntos e registraram
juntos, com alguns minutos de atraso (skill carrega a quente, agente demora).

Depois, **dois deles sumiram** do registro, e voltaram a dar
`Agent type not found`. A correlação foi exata, 5 de 5:

| agente | modelo | registrou |
|---|---|---|
| `explorador` | haiku | não |
| `prova-juiz` | opus | não |
| `prova-suite` | sonnet | sim |
| `tela-kit` | sonnet | sim |
| `tela-pagina` | sonnet | sim |

O `explorador` chegou a ser despachado com sucesso uma vez antes de sumir, o
que descarta erro de formato: o frontmatter é idêntico ao dos agentes globais
que funcionam.

Tirar a linha `model:` e passar o tier no despacho **não** restaurou de
imediato, mas o registro é lento, então o teste não é conclusivo.

## Por que importa

O `prova-juiz` é o último portão de toda frente. Se ele não registra, a
tentação é substituí-lo por uma revisão da própria sessão que orquestrou, e
isso é exatamente o julgamento contaminado que o desenho existe para evitar.

## Como aplicar

- **Se um agente sumir, espere e repita** antes de investigar o arquivo: o
  registro é lento e intermitente.
- A ferramenta de despacho aceita `model` por chamada, e ele **vence** o
  frontmatter. Esse é o caminho se o frontmatter se provar o culpado, e é até
  mais aderente ao protocolo, que pede tier explícito por despacho.
- **Não substitua o juiz pela sessão que orquestrou.** Registre a lacuna e diga
  ao usuário, que é dono da decisão.

## Relacionado

- [[suite-cega-cobra-mais-do-que-o-briefing-mandou]]
