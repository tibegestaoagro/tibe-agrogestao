# Roteiro da prova do push

Escrito para você, Dilton. São dois minutos, e é a única parte da Fase 6 que
nenhum programa consegue fazer sozinho.

## Por que você precisa entrar nessa

O caminho de notificação push está construído inteiro: banco, service worker,
o convite na tela, as chaves. Passa no `tsc`, tem suíte, está montado no
layout do painel. E **nunca entregou uma notificação na vida**: produção tem
zero inscrições, para cinco usuários, desde que foi construído.

Suíte verde não prova entrega. O `endpoint` de uma inscrição é emitido pelo
serviço de push do **seu navegador**, então não dá para simular: alguém precisa
clicar em "Ativar" num navegador de verdade e aceitar a permissão.

Este projeto já pagou caro por confiar em verde sem mundo: o `archived_at` que
não fazia nada, o middleware que não bloqueava nada, o formulário de máquina
que não abria sem sinal. O push é o próximo da fila.

## O que fazer

### 1. Abrir o painel no computador

https://tibe-agrogestao.vercel.app, logado. **Use o Chrome ou o Edge**, e não
uma janela anônima: em janela anônima o navegador descarta a inscrição ao
fechar.

### 2. Esperar o convite

Aparece um cartão no rodapé da tela, com um sininho, escrito **"Ativar
notificações"**. Ele pode demorar um segundo, porque o painel pergunta a chave
ao servidor antes de mostrar.

### 3. Clicar em "Ativar" e aceitar

O navegador vai perguntar se permite notificações. Aceite. Não aparece nada
depois disso: o cartão só some, e é esse o comportamento certo.

### 4. Me avisar

Só isso. Eu confiro no banco se a inscrição nasceu e disparo um alerta de
verdade pelo caminho de produção.

### 5. Me dizer se a notificação apareceu

Essa é a parte que vale. O servidor responder "enviado" só prova que o serviço
do navegador aceitou a mensagem, não que ela chegou na sua tela. **Quem sabe se
chegou é você.**

---

## Se o convite NÃO aparecer

É o resultado mais provável de dar informação, e não é fracasso: é o defeito
aparecendo. Me diga qual destes casos é o seu, que cada um aponta para um lugar
diferente:

| o que acontece | o que provavelmente é |
|---|---|
| já apareceu antes e você dispensou | o "não" fica guardado no navegador (`tibe.push.convite-dispensado` no localStorage). Limpe os dados do site e recarregue |
| você já tinha bloqueado notificação para esse site | nenhum navegador deixa perguntar de novo depois de um bloqueio. Tem que liberar no cadeado da barra de endereço |
| nunca apareceu nada | é o caso interessante: ou o servidor não está servindo a chave, ou o service worker não registrou. É defeito nosso, e eu investigo |
| apareceu o convite de INSTALAR o app, não o de notificação | os dois disputam o mesmo canto; o de notificação espera a próxima visita. Dispense o de instalar e recarregue |

## O que acontece depois

- **Se a notificação chegar:** a Fase 6 segue e o alerta crítico passa a ser
  push mais email, com WhatsApp só para quem não tem push. É a decisão 5 da
  spec, e ela só faz sentido com o canal provado.
- **Se não chegar:** a fase vira conserto do push, e a política dos alertas
  críticos fica exatamente como está hoje. Tirar o WhatsApp do aviso de "vacina
  vence amanhã" apoiado num canal que não entrega seria trocar ruído por
  silêncio, e silêncio é o defeito caro.
