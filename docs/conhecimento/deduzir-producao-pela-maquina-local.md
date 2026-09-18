---
tipo: armadilha
data: 2026-09-18
tags: [ambiente, producao, vercel, verificacao]
---

# Estado de produção não se deduz da máquina local

Em 17/09, na prova do push, a `VAPID_SUBJECT` faltava no `.env` local. O usuário
tinha dito que "o env está replicado em produção". Daí eu concluí que produção
também não tinha a variável, e escrevi isso como FATO em seis documentos: a
pendência do usuário, o relato da prova, a spec, o handoff, uma dívida e uma
nota deste cofre. A frase era "produção não envia push nenhum".

Em 18/09 o usuário abriu o painel da Vercel: **a variável existe desde 3 de
agosto.** Produção sempre teve as três.

## Por que é armadilha, e não só descuido

"Replicado" é uma afirmação sobre **intenção**, não sobre o estado: as duas
cópias divergem assim que alguém mexe numa só. E o `.env` local deste projeto
já é conhecido por ser diferente de produção em pontos que importam (ele aponta
para o Neon de produção, mas a `CONFIG_ENCRYPTION_KEY` local não abre o segredo
de provider que produção grava, como apareceu no mesmo dia).

O dano não foi técnico, foi de **documentação**: uma pendência falsa mandou o
usuário ao painel da Vercel fazer algo que já estava feito, e a afirmação
entrou em lugares onde o próximo agente a leria como verdade verificada.

## A regra

**Variável de ambiente de produção só se afirma depois de ver produção.** As
maneiras de ver, da melhor para a pior:

1. um efeito observável que só acontece com a variável certa (desde a Fase 6, a
   rota `/api/v1/notifications/public-key` só devolve a chave quando as TRÊS
   variáveis VAPID existem, então ela virou uma sonda);
2. o usuário mostrar o painel;
3. perguntar ao usuário, deixando claro que é pergunta.

O que **não** vale: deduzir do `.env` local, de "está replicado", ou de o código
local se comportar de certo jeito.

E quando a dedução já foi escrita, a correção vai em **todo** lugar onde a
afirmação entrou, dizendo que era falsa e por quê, em vez de apagar em
silêncio: quem leu a versão errada precisa achar a correção no mesmo lugar.

Ver [[canal-construido-nao-e-canal-que-entrega]], que é onde o erro nasceu.
