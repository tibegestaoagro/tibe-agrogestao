---
tipo: armadilha
data: 2026-09-10
tags: [spec, levantamento, grep, financeiro, modulo-35]
origem: cc25d3e
---

# Tabela feita por grep mede o nome da variável, não o que está disponível

## O que aconteceu

Ao escrever a spec da fase 35.1, precisei saber em quais das 15 origens que
chamam `createLinkedEntry` os valores de propriedade e contato já estavam à
mão, para dimensionar a tarefa. Levantei com grep:

```
grep -cE "contact_id|contactId" src/lib/actions/<arquivo>.ts
```

`milk-storage.ts` deu **zero**, e a tabela da spec registrou "sem nenhum dos
dois". Isso virou uma instrução para o especialista que executou a tarefa.

Ele leu o código e devolveu a divergência: `recordMilkCharge` **já busca e
valida o `Contact`** antes de criar o lançamento. A variável se chama `dono`.

```ts
const dono = await db.contact.findFirst({
  where: { id: input.owner_id },
  select: { id: true, name: true, archived_at: true },
});
```

O grep não estava errado. A pergunta é que estava: eu perguntei "o arquivo
contém a string `contact`" e anotei a resposta como se fosse "o arquivo tem o
contato disponível".

## Por que passou

Porque a tabela **parecia** levantamento de código e era levantamento de texto.
Ela tinha número, arquivo e coluna, e nada nela avisava que a medida era
sintática. Uma spec com tabela desse tipo é lida como fato apurado.

O erro só apareceu porque quem executou **leu o código em vez de confiar na
tabela**, e teve o cuidado de sinalizar a divergência em vez de seguir a
instrução ao pé da letra.

## O que fazer

1. **Grep serve para achar candidatos, não para concluir.** O resultado de um
   grep é uma lista de arquivos para abrir, e a conclusão vem da leitura.
2. **Desconfie de contagem zero.** Zero quase nunca significa "não existe":
   significa "não existe com esse nome". Domínio em português é especialmente
   traiçoeiro, porque o conceito é `Contact` e a variável é `dono`, `comprador`
   ou `produtor`.
3. **Escreva na spec de onde veio o número.** Se a tabela nasceu de grep, diga
   isso na própria tabela. Quem executa passa a saber o que conferir.
4. **Quem executa deve sinalizar a divergência**, e não obedecer a spec contra
   o que o código mostra. Ver
   [[briefing-de-suite-cega-precisa-carregar-o-contrato]], que é o mesmo tema
   pelo lado de quem escreve o briefing.
