# Módulo 37: Calculadora Pecuária

Terceira das quatro áreas. **Não é módulo novo**: é a fase que fecha a área que
já existe com 12 ferramentas no ar (decisão 24). O mapa das quatro e as 34
decisões estão em
[2026-09-10-sequencia-das-quatro-areas.md](2026-09-10-sequencia-das-quatro-areas.md).

Documento do cliente: `docs/modulo-calculadora/`. As seções citadas com § são
dele.

**O que a área é, na frase do próprio documento (§1):** "o objetivo não será
oferecer apenas uma calculadora matemática. O produtor não deverá precisar
conhecer fórmulas. Ele deverá informar o que pretende fazer e alguns dados
básicos."

⚠️ **O princípio que governa a área inteira (§4):** o cálculo é **simulação**.
Não cria despesa, não movimenta estoque, não altera rebanho, não cria conta a
pagar, não cria tarefa. O resultado só vira alguma coisa **mediante
confirmação** do produtor, e o único destino nesta fase é a Lista de Compra,
que por sua vez também não é compra (§3 do Módulo 36).

É o mesmo princípio do Módulo 36, um degrau antes: **calcular não é anotar, e
anotar não é comprar.**

---

## O que existe hoje, medido

Doze ferramentas, em `src/lib/calculadoras/` (funções puras) e
`src/app/(dashboard)/calculadoras/` (telas). Nenhuma chama rede: o
`calc-page.tsx` roda tudo no navegador, na hora.

| ferramenta | existe | o que o documento pede a mais |
|---|---|---|
| Cerca (§6, §7) | mourões, arame, rolos | estacas, grampos, porteiras, margem de segurança, e o **custo** do §7 |
| Sementes (§8) | **não existe** | a ferramenta inteira |
| Adubação (§10) | dose de nutriente com teor do produto | sacas e custo |
| Calagem (§11) | saturação por bases | cargas de caminhão e custo |
| Lotação (§13, §14) | UA/ha e cabeças/ha | nada |
| Pastagem | capacidade de suporte | **não é o §8**: é outra ferramenta |
| Sal mineral (§15, §16) | consumo por faixa de peso | sacas e custo |
| Ração (§17) | matéria seca e volumoso | sacas e custo |
| Água (§22) | litros/dia e no período | o reservatório do §23 |
| Cocho (§24) | metros lineares | quantidade de cochos |
| Mão de obra (§29, §30) | quantos funcionários | **o custo das diárias**, que é o que o §29 pede |
| Máquinas (§31) | litros e custo de combustível | operador, outros custos, custo por hora |
| Compra e venda (§25, §26) | margem compra para venda | valor por arroba a partir do valor total |

⚠️ **A auditoria do delta foi prometida na decisão 1 e nunca feita.** O plano de
10/09 listou "sete calculadoras novas" e tratou as 12 como prontas. Elas não
estão: quatro dos 25 itens do critério de aceite (§51) dependem de coisa que
não existe, e uma ferramenta inteira do §52 (sementes) nunca foi escrita. O
usuário decidiu em 11/09 fechar o delta nesta fase.

### O que já está pronto para ser reusado

| o que | onde |
|---|---|
| casca de tela de calculadora | `_components/calc-page.tsx`, com campo numérico, select e checkbox |
| catálogo das ferramentas | `src/lib/calculadoras/catalog.ts`, fonte única, usado também no dashboard |
| `round`, `isPositiveNumber`, `CalcResult` | `src/lib/calculadoras/shared.ts` |
| dinheiro escrito em português | `reaisBr`, `src/lib/numero-br.ts` |
| número dito pelo produtor | `lerNumeroBr`, mesmo arquivo |
| criar item de lista | `criarItemAction`, `src/lib/actions/shopping-items.ts` |
| saldo de estoque | `getStockBalance`, `src/lib/actions/stock-ledger.ts` |
| vocabulário de unidade | `src/lib/stock/units.ts` |
| finalidade do item | enum `ShoppingPurpose`, **já compartilhado** com esta área |

---

## O desenho

### Nada de persistência, de novo

Nenhum model novo. Nenhuma migração. **Toda calculadora continua função pura**
(decisão 6), e salvar cálculo, memória do cálculo, favoritos e busca (§42, §43,
§44, §48, §49) seguem fora: são conveniência, e a régua é medir se alguém pede
antes de construir.

Consequência aceita: quem quiser refazer o cálculo de outro tamanho digita de
novo. Para uma tela de cinco campos isso é mais barato que uma tabela.

### As referências técnicas continuam em código

Decisão 17. "Atualizável pela equipe TIBÉ" (§45) é satisfeito por um deploy.
Tabela editável significaria tela de administração, permissão, histórico de quem
mudou, e a pergunta sem boa resposta sobre o que acontece com o cálculo feito
antes da mudança.

⚠️ **O §45 pede que a referência seja apresentada COMO referência.** O
`calc-page` já tem o rótulo de confiança (`alta`, `media`, `baixa`), e toda
ferramenta nova declara o dela. Onde não existir fonte técnica única e
confiável, **o número é pedido ao produtor**, nunca inventado: é a regra que a
pasta já segue.

### A ponte com a Lista de Compra, e o desvio que ela obriga

O §37 e o §39 querem que o resultado vire item de lista, comparado com o
estoque: "você precisa de 20 sacas e possui 5. Faltam comprar 15."

⚠️ **Isso quebra a premissa de que a tela não fala com a rede.** As 12
existentes são client puro, e comparar com o estoque exige ler o saldo do
tenant. O desenho:

1. A função de cálculo continua **pura** e sem saber que a Lista existe. Ela
   passa a devolver, além das linhas de resultado, uma lista de **materiais**:
   `{ descricao, quantidade, unidade }`.
2. A tela pede o saldo por uma rota de leitura só quando o produtor **abre** o
   painel "adicionar à lista". Cálculo que ninguém vai comprar não chama nada.
3. O que vai para a Lista é a **falta** (necessidade menos saldo), com a
   necessidade cheia oferecida como alternativa visível.

**Casar o material com o produto do catálogo é por escolha do produtor, nunca
por adivinhação de nome.** "Arame liso 500m" e "arame" são o mesmo material para
uma pessoa e dois produtos diferentes para o estoque. O item nasce com
`product_id` quando ele escolhe, e como descrição livre quando não escolhe, que
é exatamente o item híbrido da decisão 11.

### O WhatsApp, com o classificador congelado

Mesma postura do evento, da permuta e da Lista de Compra: **os handlers ficam
prontos, roteados e testados**, e as intenções entram no n8n quando o usuário
descongelar o classificador. O §40 pede quatro conversas (cerca, sementes, sal,
ração), e elas são as quatro que entram.

⚠️ **A conversa do §40 pergunta só o que falta.** "Vou fazer 1.000 metros de
cerca com 5 fios" já traz dois dos três parâmetros: o handler pergunta o
espaçamento, e não os três de novo. O mecanismo de pendência do Módulo 31 já faz
isso e é o que se reusa.

---

## As decisões desta fase

| # | decisão | alternativa descartada |
|---|---|---|
| 37.1 | O delta das 12 entra junto com as 7 novas | deixar como dívida, com o §51 descumprido em quatro itens |
| 37.2 | A ponte com a Lista de Compra entra | adiar, e o produtor redigitar o que o sistema acabou de calcular |
| 37.3 | Material casa com produto por ESCOLHA | casar por nome parecido, que erraria em silêncio no estoque |
| 37.4 | Handlers do WhatsApp para as quatro conversas do §40 | esperar o classificador, e a fase nunca fechar |
| 37.5 | Custo é sempre OPCIONAL | exigir preço, e travar quem só quer saber a quantidade |
| 37.6 | Sementes é ferramenta nova, separada da Pastagem | ampliar a de Pastagem, misturando capacidade de suporte com semeadura |
| 37.7 | Sem persistência, de novo (decisão 6 mantida) | salvar cálculo, favoritos e memória |
| 37.8 | Simulação de engorda fica fora (decisão 16 mantida) | seis entradas cruzando consumo e custo, sem o documento dizer o que é "simples" |

---

## Tarefas

### T01: as quatro conversões e o cálculo de área (§35, §36)

`src/lib/calculadoras/conversoes.ts`, função pura, sem tela nova ainda.

Área (hectare, metro quadrado, alqueire) e as rurais do §36 (kg para tonelada,
litro, saca, arroba, metro, quilômetro).

⚠️ **Alqueire não é uma unidade só** (§35): o paulista tem 24.200 m², o mineiro
48.400 m², o do norte 27.225 m². O documento manda "sempre identificar qual
medida está sendo utilizada", então o alqueire é escolhido por nome, nunca
assumido.

⚠️ **Saca e arroba dependem do contexto**: saca de semente de 10 kg e saca de
adubo de 50 kg são a mesma palavra. O peso da saca é entrada, não constante.

### T02: piquetes (§12)

`calcularPiquetes`: área disponível, número de lotes, piquetes desejados, dias
de ocupação e, opcional, dias de descanso.

Devolve piquetes sugeridos, área média por piquete e a distribuição.

⚠️ **O §12 manda deixar claro quando o cálculo é apenas indicativo.** A relação
entre ocupação e descanso define o número de piquetes
(`piquetes = descanso / ocupação + 1` por lote), e isso é geometria, não
agronomia: a ferramenta declara confiança `media` e diz que a taxa de lotação
real depende da forragem.

### T03: receitas e misturas (§18 a §21)

A ferramenta mais importante da fase, na palavra do próprio documento.

`calcularMistura`: uma lista de ingredientes com percentual, mais a quantidade
final desejada. Devolve o peso de cada ingrediente e, quando o preço vier, o
custo de cada um, o total, o custo por kg, por saca e o custo diário por animal
(§20).

Redimensionar (§19) não é função nova: é a mesma, com outra quantidade final.

⚠️ **Os percentuais precisam somar 100.** Recusa com a diferença dita por
extenso ("os ingredientes somam 98%, faltam 2%"), no campo, nunca no rodapé.

As receitas padrão do §21 nascem em **constante de código**, e cada uma declara
a fonte. Receita salva pelo produtor fica para a fase de persistência, se vier.

### T04: reservatório de água (§23)

`calcularReservatorio`: consumo diário (que vem da calculadora de água) e dias
de autonomia desejados. Devolve o volume mínimo.

Reusa `calcularAgua` em vez de recalcular o consumo: uma fórmula, um lugar.

### T05: ganho de peso (§27)

`calcularGanhoDePeso`: peso inicial, peso desejado, ganho médio diário.
Devolve os quilos a ganhar e os dias aproximados.

⚠️ **Ganho médio diário é do produtor, nunca do sistema.** Depende de dieta,
categoria e estação, e chutar aqui é o "diagnóstico automático" que o §46
proíbe.

### T06: custo por hectare e serviço terceirizado (§32, §33)

`calcularCustoPorHectare`: custo total e área, devolvendo o custo por hectare, e
as horas quando a operação for medida em hora.

`calcularServicoTerceirizado`: preço por unidade (hora, hectare, metro) vezes o
tamanho da operação. É multiplicação, e o valor está em **não fazer o produtor
errar a unidade**: a unidade é escolhida, e o resultado repete qual foi.

**A comparação do §34 fica fora**: ela precisa das duas pontas calculadas ao
mesmo tempo, e o próprio documento a coloca como "futuramente".

### T07: sementes (§8, §9)

`calcularSementes`: área, taxa por hectare, peso da embalagem, preço opcional.
Devolve o total em kg, o número de sacas **arredondado para cima**, a sobra e o
custo.

⚠️ **Arredondar para cima não é detalhe:** o §41 manda dizer "isso corresponde a
5 sacas de 50 kg". Ninguém compra 4,8 sacas. A sobra é informada junto, porque
é ela que o produtor guarda.

O §9 quer a taxa vinda do catálogo de variedades. **A Base Rural não existe como
cadastro neste projeto**, então a taxa é entrada do produtor, com as variedades
comuns e suas faixas oferecidas como sugestão em constante. Registrar como
dívida se o cadastro nascer depois.

### T08: o delta das existentes

Uma tarefa por ferramenta, todas em função pura já existente:

| ferramenta | o que entra |
|---|---|
| Cerca | estacas, grampos, porteiras, margem de segurança, e o custo do §7 (material, mão de obra, total, por metro) |
| Sal mineral | peso da embalagem, sacas, custo |
| Ração | peso da embalagem, sacas, custo |
| Adubação | sacas e custo |
| Calagem | cargas de caminhão e custo |
| Cocho | quantidade de cochos, a partir do comprimento de cada um |
| Máquinas | valor do operador, outros custos, custo total e por hora |
| Compra e venda | valor por arroba a partir do valor total e do peso (§25) |

**Mão de obra ganha ferramenta nova em vez de crescer**: a atual responde
"quantos funcionários", e o §29 pergunta "quanto custa". São perguntas
diferentes, com entradas diferentes. `calcularCustoDeMaoDeObra`: trabalhadores,
diária, dias, mais alimentação, transporte, hospedagem e outros, todos
opcionais. A produtividade do §30 (metros por dia levando a dias de trabalho)
entra na mesma ferramenta, como segundo resultado.

⚠️ **Custo é sempre opcional** (decisão 37.5). Quem quer saber só a quantidade
não informa preço nenhum, e as linhas de custo somem do resultado.

### T09: as telas

Uma por ferramenta nova, no padrão do `calc-page`, e a atualização das oito
existentes que ganharam campo.

O catálogo (`catalog.ts`) ganha as entradas novas. **Ele é fonte única**, e a
grade do dashboard lê dele: nada de segunda lista.

⚠️ **A tela de receitas não cabe no `calc-page` genérico**: ela precisa de
lista de ingredientes com adicionar e remover, e o componente só sabe campo
fixo. Ou o `calc-page` ganha um tipo de campo "lista", ou a receita tem tela
própria. Decidir ao implementar, com a régua do projeto: três linhas parecidas
são melhores que uma abstração prematura.

O §47 quer as ferramentas agrupadas por necessidade (Pastagem, Animais,
Alimentação, Estrutura, Custos). O catálogo ganha o grupo como campo, e a tela
passa a renderizar por seção.

### T10: a ponte com a Lista de Compra (§37, §39)

As ferramentas de material (cerca, sementes, adubação, calagem, sal, ração,
receita) passam a devolver `materiais`, e a tela ganha o painel "adicionar à
Lista de Compra".

Rota nova de leitura: o saldo de estoque dos produtos escolhidos, para a
comparação do §39. Reusa `getStockBalance`, sem varredura própria.

Ao confirmar, chama `criarItemAction` **uma vez por material**, com
`purpose` preenchido (o enum já é compartilhado) e `product_id` só quando o
produtor tiver escolhido o produto.

⚠️ **O aviso de duplicata da Lista continua valendo**, e aqui ele vale mais: o
produtor que calcula a mesma cerca duas vezes precisa ver que já anotou aquilo.
Não recusar, avisar.

### T11: os handlers do WhatsApp (§40)

Quatro intenções novas em `src/lib/whatsapp-intents.ts`, com o mesmo módulo de
permissão da Lista (`rebanho`, perfil `fazenda`), e os handlers que as roteiam:

| intenção | conversa do §40 |
|---|---|
| `calcular_cerca` | "vou fazer 1.000 metros de cerca com 5 fios" |
| `calcular_sementes` | "quantas sacas de Mombaça preciso para 20 hectares?" |
| `calcular_sal` | "quanto de sal 100 bois comem em um mês?" |
| `calcular_racao` | "quero fazer 500 kg daquela ração de 65% milho, 29% soja e 6% núcleo" |

Reusam o mecanismo de pendência: **pergunta só o que falta**, e a resposta
entra no campo perguntado sem apagar o que já foi dito.

⚠️ **O resultado sai em linguagem simples** (§41): "você precisará de
aproximadamente 248 kg, que são 5 sacas de 50 kg", nunca
"0,2475 tonelada/unidade". E o dinheiro sai por `reaisBr`, que a conferência 16
do `npm run check` agora exige.

⚠️ **O classificador do n8n NÃO emitirá estas quatro**, como não emite as da
Lista, as do evento e as da permuta. Registrar no handoff, junto com as outras.

### T12: a suíte

Escrita **da spec**, sem ler a implementação. Função pura é o caso mais fácil de
testar e o mais fácil de testar mal: o caso que discrimina é sempre o da ponta.

- arredondamento de saca **para cima**, com sobra (T07);
- percentual que não soma 100 (T03);
- alqueire de cada região dando resultado diferente (T01);
- custo ausente sumindo do resultado, em vez de sair zerado (T08);
- material com saldo maior que a necessidade, que **não vira item** (T10).

### T13: validação ao vivo

Navegador real, e o banco de provas do WhatsApp. A ordem que funciona: quebre a
trava de propósito, rode a suíte, e **abra a tela**.

O que só o navegador prova aqui: a lista de ingredientes que cresce e encolhe,
o painel de adicionar à lista com o saldo lido ao vivo, e a grade por seção do
§47 num telefone de 400px.

---

## Critérios de aceite (§51)

Os 25 itens do documento, menos os que as decisões tiraram:

| § | item | como fica |
|---|---|---|
| §51 | escolher atividade, informar poucos parâmetros | tela por ferramenta, no catálogo agrupado |
| §51 | cerca, sementes, adubação, calagem, lotação | T07, T08, e as existentes |
| §51 | sal, ração, redimensionar receitas, custo de ração | T03 e T08 |
| §51 | água, cocho | existente e T08 |
| §51 | compra e venda, arroba, ganho de peso | T05 e T08 |
| §51 | mão de obra, combustível, máquinas, custo por hectare | T06 e T08 |
| §51 | conversões rurais | T01 |
| §51 | adicionar à Lista de Compra, comparar com estoque | T10 |
| §51 | principais calculadoras pelo WhatsApp | T11, com o classificador congelado |
| §51 | **salvar e reutilizar cálculo** | **fora** (decisão 6) |

---

## Fora desta versão

| o que | por quê |
|---|---|
| Salvar, reutilizar, memória, favoritos, busca (§42 a §44, §48, §49) | decisão 6: conveniência, medir antes de construir |
| Simulação de engorda (§28) | decisão 16: o documento pede "simples" sem dizer o que é simples |
| Comparação trator próprio contra terceirizado (§34) | o próprio documento a coloca como futura |
| Base Rural como cadastro (§9, §38) | não existe neste projeto; a taxa vem do produtor, com sugestão em constante |
| Tudo do §50 | o documento já os tira: modelo zootécnico, formulação profissional, curva de crescimento, clima, mercado, fiscal, engenharia, hidráulica, diagnóstico |
