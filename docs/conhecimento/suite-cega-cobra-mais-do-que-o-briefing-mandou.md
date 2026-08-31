---
tipo: licao
data: 2026-08-31
tags: [processo, teste, time-de-agentes, qualidade]
origem: 8f2c3a0
---

# A suíte escrita da spec cobra o que o briefing esqueceu de pedir

## O que aconteceu

No piloto do time de agentes, o `prova-suite` escreveu a suíte `m50` **a partir
da spec**, em paralelo às conversões, sem ler nenhum dos 22 arquivos que
estavam sendo alterados.

A suíte exigia zero `bg-tibe-light` no site público. Mas a exigência estava no
briefing dela e no de **um** dos três implementadores, e não na spec. Os outros
dois seguiram o mapa que receberam, corretamente, e o alias ficou em 6
arquivos.

Resultado: a suíte cobrava mais do que os implementadores foram mandados
fazer, e a lacuna era do orquestrador.

## Por que importa

Se quem escreve o teste lê a solução, o teste herda as suposições dela e vira
um espelho. Escrevendo só da spec, o teste vira **uma segunda leitura do
contrato**, e as duas leituras divergirem é informação.

A divergência aqui não apontou um bug no código: apontou um bug **no contrato**.
Isso é mais valioso, porque contrato errado gera defeito em toda tarefa futura
que o use.

Vale notar o limite: a suíte copiou a regex de cor crua **literalmente** da
conferência 8, o que foi boa prática (não reinventou), mas com isso herdou o
mesmo ponto cego dela. Cegueira copiada continua cegueira. Ver
[[portao-mede-a-relacao-que-lhe-deram]].

## Como aplicar

- Quem escreve a suíte recebe **a spec e o contrato**, nunca o diff nem o
  relato de quem implementou.
- Quando a suíte reprovar algo que ninguém foi mandado fazer, **suspeite do
  contrato antes de suspeitar do código**.
- A suíte precisa ser vista **vermelha antes e verde depois**. A `m50` reprovou
  na onda 1 e passou na onda 2, e é só por isso que se sabe que ela discrimina.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[contrato-incompleto-diverge-entre-agentes-paralelos]]
- [[portao-mede-a-relacao-que-lhe-deram]]
