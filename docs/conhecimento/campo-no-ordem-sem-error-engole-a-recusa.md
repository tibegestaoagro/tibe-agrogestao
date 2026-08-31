---
tipo: armadilha
data: 2026-08-31
tags: [ui, formulario, recusa, portao, confinamento]
origem: 9523c45
---

# Campo listado no `ORDEM` sem `error=` engole a recusa por completo

## O que aconteceu

Na tela do Confinamento, oito campos em três formulários tinham `id` listado no
`ORDEM` do `useErrosDeFormulario` e **não passavam `error=` para o `<Field>`**.

O efeito não é "a mensagem aparece no lugar errado". É pior: ela **não aparece
em lugar nenhum**. `aplicarErroDoServidor` (`src/lib/erros-de-formulario.ts`)
decide assim:

```ts
if (campo && ordem.includes(campo) && mensagem !== SEM_MENSAGEM) {
  return { erros: { [campo]: mensagem }, global: null };
}
return { erros: {}, global: mensagem };   // campo desconhecido: rodape
```

Ou seja, **estar no `ORDEM` é justamente o que tira a mensagem do rodapé**. Se o
`<Field>` daquele campo não a renderiza, ela morre entre os dois.

O caso mais caro foi a recusa `ORIGEM_AMBIGUA`, criada uma tarefa antes
exatamente para o produtor saber de qual pasto tirar os animais: ele tocava em
"Registrar entrada", o botão voltava ao normal, o foco pulava para o campo, e
não havia uma palavra escrita na tela.

## Por que importa

**Um campo opcional não tem recusa opcional.** Foi essa a leitura errada: os
cinco campos mudos do formulário de entrada eram todos "Opcional." no `hint`, e
o `error=` foi omitido junto do `required`, como se as duas props andassem
juntas. Elas não andam: `required` é sobre preencher, `error=` é sobre o
servidor ter algo a dizer.

E a conferência 10 do `npm run check` aprovava, porque ela pergunta se o
**arquivo** trata a recusa em algum lugar, não se **cada campo** renderiza a
sua. Terceira ocorrência do mesmo defeito de categoria neste projeto, e a nota
que já existia sobre ele não impediu.

## Como aplicar

- **Todo `<Field>` cujo `id` está no `ORDEM` recebe `error={err.erros.<id>}`.**
  Sem exceção para campo opcional.
- Quando o servidor recusa com um `field` que **não é o id de nenhum campo**
  (o `closeStay` manda `field: "quantity"`, que não é id de destino nenhum),
  escolha um campo para carregar a mensagem, de preferência o que o produtor
  está olhando. Deixá-la no `erros` sem dono é o mesmo que apagá-la.
- A **conferência 15** do `npm run check` reprova isso desde 31/08, campo por
  campo, com linha de base vazia.

## Relacionado

- [[portao-mede-a-relacao-que-lhe-deram]]
- [[escrever-a-licao-nao-impede-repeti-la]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
