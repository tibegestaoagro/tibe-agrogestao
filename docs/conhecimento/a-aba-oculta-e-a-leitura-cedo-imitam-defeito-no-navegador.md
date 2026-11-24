---
tipo: armadilha
data: 2026-10-07
tags: [validacao, navegador, browser-harness, ambiente]
origem: docs/agents/current-handoff.md (seção Ambiente, até 07/10)
---

# A aba oculta e a leitura cedo imitam defeito no navegador

## O que aconteceu

A validação de tela com `browser-harness` funciona nas duas máquinas, e foi
assim que os Módulos 36 e 37 e as dívidas 3.2 e 5.8 foram validados. Mas seis
atritos do controle se repetem e, nos dois piores, o sintoma é igual ao de
defeito do app. Em 07/10, na 5.8, dois deles apareceram na mesma tela: o painel
de encerrar estadia "não abriu" (aba oculta) e o envio "não gravou" (lido aos
9 s, o POST respondeu em 18 s por ser a primeira compilação da rota).

## Por que importa

Cada um já custou uma investigação de defeito que não existia. A conclusão
errada ("a tela não grava") vira correção desnecessária no código.

## Como aplicar

1. A primeira conexão exige `new_tab(url)` explícito.
2. Clique por coordenada não dispara o botão no rodapé do `FormSheet`: use
   `js` com `click()` e ache por `[role=dialog] button[type=submit]` (texto com
   acento não casa).
3. Os ids da árvore de acessibilidade mudam a cada render: resolva na mesma
   chamada.
4. **Aba em segundo plano pausa a animação do Radix**: o painel fica fechado
   ou fora da tela e parece defeito. `activate_tab(current_tab())` no começo
   de todo roteiro.
5. **Texto passado ao `js(...)` chega com acento corrompido**: compare por
   prefixo sem acento ou monte o caractere com `String.fromCharCode`. Um
   `includes("Você já recebeu?")` falso não prova que o texto falta.
6. **A primeira visita a uma rota ainda não compilada leva até 20 s**, no
   `goto_url` e no primeiro POST. Não renavegue: espere a linha da rota no log
   do `next dev`, e decida pelo banco, não pelo painel.

Cenário de tela se monta com script `tsx`, nunca com `curl` (acento em
Windows-1252 entra torto no banco).

## Acréscimo de 2026-10-29: o `innerText` já vem com o `uppercase`

Sétimo atrito, na F5 do Empório: o roteiro procurava "Seu Empório" e
"Essenciais" e reprovou dois itens com a tela certa. Os dois títulos têm a
classe `uppercase`, e o `innerText` devolve o texto **depois** do
`text-transform` ("SEU EMPÓRIO"); o `textContent` devolveria o original, mas
inclui texto escondido. Saída usada no `scripts/navegador/emporio-f5.py`:
comparar sem diferenciar caixa. Título de seção pequeno neste projeto
(`text-xs`/`text-sm` com `tracking-wide`) quase sempre é `uppercase`.

## Acréscimo de 2026-11-06: aba que sobrou faz o `next dev` recarregar em laço

Oitavo atrito, no roteiro `emporio-clientes`: o painel "não abria", o
`readyState` ficava em `loading` e o log do `next dev` repetia, a cada segundo,
a página, `/login?callbackUrl=...` e `✓ Compiled in 1ms`. Não era defeito: o
Chrome de testes guardava abas de roteiros que tinham morrido no meio (uma
delas apontando para outra porta). Cada carga de uma aba gera um evento de HMR
que recarrega a outra, e as duas ficam em pingue-pongue. Reiniciar o `next dev`
não resolve. Fechar todas as abas resolve:
`curl http://127.0.0.1:9333/json` lista, e `/json/close/<id>` fecha (o Chrome
de testes fecha junto, e o `npm run navegador` o sobe de novo).

## Acréscimo de 2026-11-07: o laço também vem logo depois de subir, e o daemon fica preso

Nono e décimo atritos, no roteiro `emporio-escolha`:

- **O `next dev` entra em laço de recarga mesmo sem aba sobrando**, logo depois
  de subir (o mesmo sintoma do oitavo: a página e `/login` repetidos no log).
  Resolve: derrubar o servidor, subir de novo e abrir `/login` uma vez, na
  mão, antes do roteiro.
- **Depois de fechar o Chrome de testes, o daemon do browser-harness fica
  preso**, e o roteiro seguinte morre com `PermissionError` antes de fazer
  qualquer coisa. Resolve: `BU_NAME=tibe browser-harness --reload`, e rodar o
  roteiro de novo.

## Relacionado

- [[a-data-dita-vence-a-palavra-que-quita]]

## Acréscimo de 2026-11-17: o `npm run navegador` fecha as abas sozinho

Pedido do usuário (cada aba custa memória da estação). Desde o commit
`c44d3e0`, o `scripts/navegador.ts` fecha, antes do roteiro, as abas que
sobraram de rodadas anteriores e, depois, as que o roteiro abriu, passe ou
caia. Isso também elimina a causa do oitavo atrito (aba que sobrou e recarga
em laço).

- **Fica sempre uma aba aberta.** Fechar a última encerra o Chrome de testes.
- Fechar à mão: `npm run navegador -- --limpar`.
- Aba aberta fora do comando (browser-harness direto, `new_tab`): feche ao
  terminar de olhar. A regra está em `.claude/agents/prova-viva.md`.

## Acréscimo de 2026-11-18: o dinheiro vem com espaço não separável

Décimo primeiro atrito, no roteiro `emporio-paginacao-listas`: a tela das
Aprovações mostrava "R$ 700,00" e a checagem `"R$ 700,00" in texto` reprovou.
O `reaisBr` (Intl) põe um espaço não separável (U+00A0) entre "R$" e o número,
e o `innerText` o devolve assim; a string do roteiro tem espaço comum. Saída:
normalizar o texto lido com `.replace(" ", " ")` antes de comparar. O
roteiro do balcão rápido bateu na mesma pedra no mesmo dia.

⚠️ Escreva essa substituição com Edit/Write, nunca por `sed` no shell: o
`sed -i` do mesmo dia gravou `"00a0"` no lugar de `" "` (o invariante 5 do
`CLAUDE.md`), e a checagem passaria a não normalizar nada sem avisar.

## Acréscimo de 2026-11-23: o clique antes da hidratação não faz nada

Décimo segundo atrito, no passo 1 do `emporio-franqueado`: o painel "Novo
franqueado" não abria em 6 de 6 tentativas, num `next dev` recém-subido. No
momento do clique, `document.readyState` era `loading` e o botão ainda não
tinha `__reactProps`: o HTML estava na tela, mas o React não tinha ligado os
eventos. O clique caía num botão morto. Saída: esperar `readyState` igual a
`complete` e o botão com `__reactProps` (até 90 s) antes de clicar.

No mesmo dia, um `timeout` que matou o `tsx` do `npm run navegador` deixou o
daemon do browser-harness órfão, e toda página passou a recarregar em laço
(o mesmo sintoma do oitavo e do nono atritos). Matar o daemon órfão resolveu.
