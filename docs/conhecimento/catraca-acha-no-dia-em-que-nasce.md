---
tipo: licao
data: 2026-09-16
tags: [teste, catraca, agente, whatsapp]
---

# A catraca acha no dia em que nasce, não só no futuro

A justificativa de uma catraca é sempre o futuro: "ela impede que alguém,
daqui a meses, esqueça de X". Na Fase 4 do agente, a catraca da seção 1c da
`m68` (toda intenção de escrita ou está declarada na lista de quem grava sem
confirmar, ou o handler dela tem portão de confirmação) foi escrita com essa
justificativa, e **achou quatro defeitos reais na primeira execução**:
cadastro de animal, peso, vacina e previsão de vacina gravam sem pedir "sim" e
não estavam declaradas.

Ou seja: a lista que eu tinha acabado de escrever para fechar uma gravação
indevida ([[a-porta-fraca-nao-pode-alcancar-quem-grava-sem-confirmar]]) estava
ela mesma incompleta, e a guarda parecia mais forte do que era. A revisão
independente não pegou isso, e a medição contra o modelo também não.

## O que fazer com isso

Quando a decisão for "registro a dívida agora e escrevo a catraca depois",
lembre que escrever a catraca é também **uma auditoria do presente**, não só um
seguro contra o futuro. Nesta ela custou 25 linhas e se pagou no mesmo dia.

⚠️ **Escrever a catraca é iterar o critério, não acertá-lo de primeira.** Esta
passou por três versões, e cada uma errou de um jeito diferente:

1. procurar a palavra "confirmacao" no arquivo: acusou seis handlers que
   confirmam por outro nome;
2. procurar `confirmFlow(` na função: ainda acusava quem confirma com pendente
   próprio (negócio, confinamento);
3. procurar os três portões possíveis (`confirmFlow`, `confirmed`,
   `requires_confirmation: true`) **e** seguir a fábrica quando o handler nasce
   de uma (`fabricarEntrada`, `fabricarLactacao`), porque o portão mora dentro
   dela.

Cortar por ARQUIVO aprovaria os quatro defeitos reais, porque `rebanho.ts`
chama `confirmFlow` três vezes para outras intenções. O corte tem que ser por
função. Vale o [[trava-so-vale-depois-de-voce-a-ver-falhar]]: esta foi provada
nos dois sentidos, comentando uma intenção da lista e vendo a suíte acusar.
