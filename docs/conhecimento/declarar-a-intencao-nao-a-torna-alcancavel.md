---
tipo: licao
data: 2026-09-16
tags: [agente, whatsapp, avaliacao, prompt]
---

# Declarar a intenção não a torna alcançável

Na Fase 5, três intenções novas entraram no registro, com handler, suíte verde e
`tsc` limpo. A primeira medição contra o modelo deu **44,4% de acerto de
intenção**. O modelo não estava errando: ele nunca via as intenções.

A etapa de domínio escolhe o domínio ANTES da extração, e a extração só enxerga
as intenções daquele domínio. As descrições de domínio diziam outra coisa:

- `prestador` reivindicava, textualmente, "quanto um cliente deve ou já pagou",
  então "o João já pagou?" ia para lá, onde a intenção nova não existia;
- `financeiro` dizia receita "**avulsa**", o que exclui quitar conta de cliente;
- `conversa` reivindicava "a relação de contas a pagar ou a receber";
- `mao_de_obra` só falava de pagamento **já feito**, não de agendar.

Corrigidas as quatro descrições: 44,4% para 94-97%, sem tocar em uma linha de
handler.

## A regra

Intenção nova é **duas** edições, não uma: a definição dela, e a descrição do
domínio que precisa passar a reivindicá-la. Se a descrição de outro domínio já
reivindica o mesmo assunto, uma das duas tem que ceder, e isso é decisão de
produto, não de redação.

⚠️ **Esta é a mesma lição de [[a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder]],
escrita na Fase 3 e repetida na Fase 5.** Ela estava no cofre e não impediu
nada, porque o plano da fase seguinte não mandou revisar os domínios. Lição
escrita só funciona quando vira passo de um plano ou trava de suíte: ver
[[escrever-a-licao-nao-impede-repeti-la]] e [[catraca-acha-no-dia-em-que-nasce]].

## O efeito colateral que ninguém pediu

Ao reescrever `prestador` para ceder o assunto, `consultar_cliente` (que vivia
nele) ficou **inalcançável sem ninguém decidir isso**. A revisão achou; o
usuário decidiu unificar as duas consultas. Mexer em descrição de domínio
aposenta intenção em silêncio: depois de mexer, confira quem mais morava ali.
