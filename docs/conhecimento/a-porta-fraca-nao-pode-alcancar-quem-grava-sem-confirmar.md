---
tipo: armadilha
data: 2026-09-16
tags: [agente, whatsapp, estoque, conversa]
---

# A porta fraca não pode alcançar quem grava sem confirmar

O turno do agente tem duas portas que jogam texto do produtor dentro de um
campo pendente. A antiga (`respostaLiteral`, em `turno.ts`) exige **quatro**
coisas: cursor vivo, o modelo ter dito "isto é resposta", o valor ser recorte
literal da mensagem, e a mensagem não ser pergunta.

Na Fase 4 eu abri uma segunda porta, para o caso em que o produtor responde
certo mas a leitura recusa (a resposta trazia mais do que o campo pedido). Ela
reaproveitou **duas** guardas e descartou duas, e as descartadas eram
exatamente as de segurança de escrita. Resultado: a mensagem INTEIRA entrava no
campo, `resolverProduto` casa por substring, e "nem precisei do sal afinal"
gravou uso de sal.

**A raiz não é a porta, é o destino.** `registrar_uso_estoque` é a única
intenção do domínio de estoque que grava sem pedir "sim" (§10.3, o gesto mais
frequente e que não mexe em dinheiro). Em qualquer outra, a mensagem duvidosa
pararia na confirmação e o produtor veria o disparate antes de virar dado.

## A regra que ficou

Toda porta que empurra texto não verificado para dentro de um campo pendente
tem que perguntar **quem vai executar**, não só se o texto parece uma resposta.
`INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR` (`whatsapp-handlers/shared.ts`) é a lista,
e ela é lida pelas duas pontas que precisam concordar: o handler do estoque e o
turno. Quando cada ponta tinha sua cópia da regra, foi a divergência que abriu
o buraco.

⚠️ A lista nasceu com UMA intenção e estava errada: a catraca escrita para
protegê-la achou **mais quatro** no mesmo dia (cadastro de animal, peso, vacina
e previsão de vacina, todas em `rebanho.ts`, nenhuma recebendo `confirmed`).
Ver [[catraca-acha-no-dia-em-que-nasce]].

Ver também [[zero-defeito-na-suite-pode-ser-cegueira-da-suite]], que conta por
que os 60 blocos de conversa não podiam achar isso.
