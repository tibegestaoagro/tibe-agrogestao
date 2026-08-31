---
name: memoria-cofre
description: Use ao guardar uma lição, decisão ou armadilha no cofre de conhecimento do Tibé (`docs/conhecimento/`), ou quando o usuário disser "guarda isso", "lembra disso" ou "registra essa lição". Define o que merece nota, o formato, e como não duplicar o que já está no CLAUDE.md, nas regras ou no handoff.
---

# Escrever no cofre de conhecimento

`docs/conhecimento/` é a camada de memória longa do Tibé: uma nota por lição,
ligadas por `[[wikilink]]`, buscável por tag. **Ela nunca carrega em contexto**,
e é isso que a torna barata.

## O teste que decide se merece nota

> **Uma sessão futura ficaria surpresa e grata de saber disto antes de começar,
> em vez de descobrir do jeito difícil?**

Se a resposta não for um sim claro, **não escreva**. Um cofre pequeno e de
sinal alto vale mais que um grande e ignorado.

## O que NÃO entra

- **O que o código já diz.** Estrutura, assinatura, quem chama quem.
- **O que o `git log` já diz.** "Corrigimos X no commit Y."
- **O que está no `CLAUDE.md`.** Invariante, comando, armadilha de ambiente.
- **O que está numa regra de `.claude/rules/`.** Aquilo carrega sozinho ao abrir
  o arquivo da área, e sempre na versão de hoje.
- **O que está numa spec ou num plano de `docs/superpowers/`.**
- **Estado do projeto.** Isso é `current-handoff.md`, e é volátil por desenho.
- **Dívida em aberto.** Isso é `dividas.md`.
- **O que só um humano pode fazer.** Isso é `pendencias-do-usuario.md`.

⚠️ **Duplicata não é redundância inofensiva: é mentira futura.** As duas cópias
divergem, e a de cá não tem quem a corrija. Este projeto já achou uma dúzia de
comentários afirmando o oposto do que o código fazia, e cada um tinha sido
verdade quando foi escrito.

## O que entra

| tipo | o que é | exemplo real |
|---|---|---|
| `licao` | o que aprendemos errando | trava só vale depois de vista falhar |
| `decisao` | o que foi decidido, **e a alternativa descartada** | por que a Negociação é um envelope |
| `armadilha` | o que quebra em silêncio neste ambiente | a pílula invisível |
| `referencia` | onde mora informação externa | painel, documento do cliente, ticket |

O caso mais forte é a **história de falha**: um defeito que passou por tudo e só
apareceu no mundo. É o que este projeto mais precisa não repetir.

## Antes de criar: procure

```
grep -ril "<termo>" docs/conhecimento/
```

**Se já existe nota sobre o assunto, acrescente nela.** Nota é append-only:
corrigir é adicionar uma seção datada, não reescrever a história. Duas notas
sobre a mesma coisa é o começo do apodrecimento.

## O formato

Copie `docs/conhecimento/_template.md`. Frontmatter obrigatório:

```yaml
---
tipo: licao | decisao | armadilha | referencia
data: YYYY-MM-DD
tags: [area, tema]
origem: <hash, arquivo ou documento>
---
```

- **`tipo` fora do vocabulário reprova o `npm run check`** (conferência 13).
  Não invente categoria nova.
- **`data` é absoluta, sempre.** "Semana passada" deixa de ser verdade na semana
  seguinte, e ninguém percebe.
- **`tags` em minúscula, sem acento, kebab-case.**
- **O nome do arquivo é o slug**, kebab-case sem acento, e casa com o título.

**O título é a lição em uma frase, não o assunto.** "A pílula que o portão
aprovou porque o texto continuava legível" se acha depois; "Sobre contraste"
não.

Quatro seções, nesta ordem: `## O que aconteceu`, `## Por que importa`,
`## Como aplicar`, `## Relacionado`.

⚠️ **Se você não consegue escrever uma consequência concreta em "Por que
importa", a nota não deveria existir.**

## Os links

`[[nome-da-nota]]`, sem `.md`. **Link para nota que não existe reprova o
`npm run check`.** É o que impede a pasta de virar cemitério.

Ligue com generosidade **para notas que existem**: o valor do cofre está no
grafo, não nas folhas soltas. Se perceber que falta uma nota vizinha, escreva as
duas.

Ao criar nota nova, **acrescente a linha em `_indice.md`**.

## Depois de escrever

```
npm run check
```

A conferência 13 confere link e frontmatter, e a conferência 1 confere que todo
caminho citado na nota existe de verdade.

⚠️ **Nunca use travessão** (U+2014). Use dois pontos, vírgula, parênteses ou
ponto final.
