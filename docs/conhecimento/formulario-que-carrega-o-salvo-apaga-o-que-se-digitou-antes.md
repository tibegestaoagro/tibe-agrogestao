---
tipo: licao
data: 2026-11-07
tags: [ui, formulario, emporio, validacao-viva]
origem: fd7ca96
---

# O formulário que carrega o cadastro salvo apaga o que se digitou antes da carga

## O que aconteceu

O "Completar cadastro" do Empório (`ClienteForm` em modo `completar`) abre
vazio e busca o cadastro guardado do cliente. Quando a resposta chega, ela
substitui todos os valores do formulário. O que a pessoa digitou nesse
intervalo sumia sem aviso. O modo `completar` existe desde 03/11 (`6100159`),
e o defeito passou por todas as suítes e revisões até 07/11.

Foi corrigido em `fd7ca96`, no mesmo commit do roteiro `emporio-romaneio`: os
campos ficam num `<fieldset disabled>` e aparece "Carregando o cadastro..."
enquanto a busca pende. O passo 8b do roteiro atrasa a resposta em 2,5 s de
propósito (embrulha o `window.fetch` só para aquele GET) e confere o campo
travado durante a carga e liberado depois.

## Por que importa

No balcão a rede é lenta, e o Caixa começa a digitar o CPF assim que o painel
abre. O dado digitado some, a pessoa não percebe, e o cadastro sai incompleto
ou o painel recusa sem explicar por quê. Nenhuma suíte de servidor vê isso, e
no `next dev` local a resposta chega rápido demais para alguém notar à mão.

## Como aplicar

- Todo formulário que abre e depois busca o valor salvo precisa decidir o que
  acontece com o que se digita antes da resposta. O padrão daqui é travar os
  campos e mostrar a carga.
- Para provar, atrase a resposta no navegador (o embrulho do `fetch` do passo
  8b) e confira nos dois sentidos: sem a trava, o roteiro reprova.
- Ao revisar tela nova que lê dado salvo depois de abrir, procure o `useEffect`
  que chama `setValores` com a resposta inteira.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
