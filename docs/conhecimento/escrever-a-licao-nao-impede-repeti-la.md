---
tipo: licao
data: 2026-08-31
tags: [processo, qualidade, catraca, time-de-agentes]
origem: d2927ac
---

# Escrever a lição não impede repeti-la: o que impede é o portão

## O que aconteceu

Na onda 3 da frente do Confinamento, o time achou que a seção 13 da suíte
`m47` **prometia no título** testar encerramento parcial e não testava. Foi
corrigido, e a lição virou nota no cofre:
[[portao-mede-a-relacao-que-lhe-deram]].

Três ondas depois, na **mesma frente**, um julgamento independente achou que a
suíte `m51`, escrita do zero por este time, tinha 34 asserções verdes que
provavam apenas o **terreno herdado**: importava as funções da fase 2 e do
Módulo 31, criava o registro com Prisma cru, e não chamava uma única linha das
482 escritas naquela frente.

O caso mais nítido era idêntico ao da `m47`: a seção "dias confinados" lia a
data do banco e **calculava os dias ela mesma**. Passaria intacta se a função
de produção devolvesse zero fixo.

⚠️ **A nota já estava escrita, no cofre, versionada, e mandava procurar
exatamente isso.** Não impediu nada.

## Por que importa

A conclusão desconfortável: **documentar uma classe de defeito não a previne.**
Quem escreveu a `m51` não estava desatento; estava escrevendo uma suíte nova, e
a nota não aparece no momento em que se escreve `check("dias batem", ...)`.

O que **de fato** pegou o defeito das duas vezes foi alguém de fora olhando com
a pergunta certa: na `m47`, um agente com a tarefa explícita de conferir se
título e asserção batiam; na `m51`, um juiz independente.

## Como aplicar

- **Ao escrever suíte nova, pergunte de cada afirmação: ela reprovaria se a
  função devolvesse um valor fixo?** Se não reprovaria, ela mede a fixture, não
  o código.
- **Peça a prova de discriminação no briefing**, e não só o resultado verde.
  A melhor resposta que este time deu foi usar **duas entradas diferentes
  exigindo dois resultados diferentes**: nenhum retorno constante satisfaz as
  duas.
- **Não confie em "0 falhas" como cobertura.** Pergunte **o que** a suíte
  chama. `grep` nos imports responde em segundos.
- Lição escrita é para quem **procura** por ela. O que age sozinho é o portão:
  a conferência que roda no CI, ou o agente cuja única tarefa é aquela pergunta.

## Relacionado

- [[portao-mede-a-relacao-que-lhe-deram]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[suite-cega-cobra-mais-do-que-o-briefing-mandou]]
