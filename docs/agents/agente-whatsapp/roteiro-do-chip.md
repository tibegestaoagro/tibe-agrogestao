# Roteiro do dia do chip

Escrito para você, Dilton, não para o agente. É a parte da homologação do
agente que nenhum programa consegue fazer sozinho, porque depende de um
celular de verdade com um número de verdade.

## Por que existe um segundo número

O agente novo (Fase 2 e 3) já foi medido contra centenas de conversas, mas
tudo isso roda por dentro: mensagem simulada, banco local, resposta lida por
programa. Quatro coisas só aparecem com aparelho na mão:

1. **A entrega de fato no celular.** Até aqui, provamos que o Tibé produziu a
   resposta certa. Que ela chega, e chega legível, é outra coisa.
2. **Áudio de verdade.** O áudio é buscado na Evolution pelo id da mensagem, e
   esse id não existe numa mensagem simulada. Toda a medição de áudio até hoje
   foi feita com a transcrição digitada à mão.
3. **Foto de recibo de verdade**, pelo mesmo motivo.
4. **Mensagem picada com o tempo real de digitação.** O agente espera 12
   segundos por pedaços; quem digita de verdade não respeita cronômetro.

O segundo número serve para isso sem misturar com o número que os produtores
já usam.

## O que você faz, na ordem

### 1. Conectar o chip na Evolution

No painel da Evolution, crie uma instância nova (sugestão de nome:
`tibe-homologacao`) e conecte o chip lendo o QR code com o aparelho. Confirme
que a instância aparece como conectada.

⚠️ **Não reaproveite a instância de produção.** Se o número novo entrar na
instância que já atende os produtores, as duas conversas se misturam e o teste
deixa de ser teste.

### 2. Me avisar

Me diga que a instância existe e qual é o nome dela. Eu faço três coisas do
lado do sistema: aponto o webhook dela para a cópia de homologação do n8n,
ponho a chave dessa instância na guarda de entrada da cópia, e cadastro o
número novo como usuário do tenant de provas. Nada disso encosta em produção.

### 3. Mandar as mensagens, na ordem

Do aparelho do chip novo, para o agente. Espere a resposta de cada uma antes
de mandar a próxima, menos onde o roteiro disser o contrário.

| # | o que mandar | o que tem que acontecer |
|---|---|---|
| 1 | `bom dia` | ele responde. Nada é gravado |
| 2 | `quanto tenho de sal mineral?` | ele responde a quantidade. **Nada é gravado** |
| 3 | `comprei 20 bezerro do Joao por 60 mil` | ele PERGUNTA antes de gravar |
| 4 | `nao, deixa pra la` | ele desiste. **Nada é gravado** |
| 5 | mande `comprei 20 bezerro`, depois `do Joao`, depois `por 60 mil`, as três em menos de 10 segundos | ele junta as três numa coisa só e pergunta UMA vez |
| 6 | `sim` | agora sim grava, e ele diz o que gravou |
| 7 | `sim` de novo | **nada é gravado de novo** |
| 8 | um **áudio** dizendo "usei duas sacas de sal mineral hoje na fazenda da sede" | ele entende o áudio e trata como uso de estoque |
| 9 | uma **foto de recibo** de qualquer compra | ele lê o valor e pergunta antes de lançar |
| 10 | `nao` | **nada é gravado** |

### 4. O que me mandar de volta

Print das respostas dos passos 5 a 10, que são os que não dá para conferir de
outro jeito. Eu confiro no banco se alguma linha nasceu onde não devia.

## O critério

**Qualquer coisa gravada nos passos 1, 2, 4, 7 e 10 reprova a rodada.** Esses
cinco são o teste inteiro: o agente pode errar o que entendeu e a gente
conserta, mas gravar o que você não mandou é o erro que não se conserta
depois, porque o dado errado já está lá.

Resposta feia, texto repetido ou demora também importam, mas não reprovam:
viram lista de ajuste.

## Depois

Com a rodada aprovada, o que falta para o agente novo virar o de produção é a
Fase 7: trocar o fluxo, acompanhar uma semana e desligar o caminho antigo.
Enquanto isso não acontece, o número dos produtores continua no agente antigo,
sem nenhuma mudança.
