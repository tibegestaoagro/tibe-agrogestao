# Módulo 30: Rebanho como livro-razão

**Origem:** dois documentos do cliente em `docs/Modulo Rebanho/`
(`TIBÉ — Área Rebanho.docx` e `complemento - modulo Rebanho.doc`).
**Decisões tomadas com o usuário em 2026-08-05**, por entrevista, antes de
qualquer código. Este documento registra o motivo de cada uma: é o motivo que
permite revisitar a decisão sem repetir a discussão.

> O documento do cliente se declara "versão inicial para análise e possíveis
> alterações". Se a Agromax alterá-lo, confira esta spec contra a versão nova
> antes de continuar: as decisões abaixo assumem o texto de 2026-08-05.

---

## 1. O problema

O rebanho de hoje é uma linha por lote: `AnimalBatch` = categoria +
quantidade + fazenda. Isso mistura três coisas que o complemento exige
separar:

- **quantidade** de animais,
- **propriedade** (de quem são),
- **localização** (onde estão fisicamente).

Um animal pode ser do produtor e estar fora da fazenda (leilão, pasto de
terceiros, boitel). E a fazenda pode abrigar animais que não são dela
(aluguel de pasto). Nenhuma das duas situações cabe numa linha que só sabe
"categoria, quantidade, fazenda".

A **regra de ouro** que o cliente escreveu é a formulação exata disso: toda
movimentação precisa responder três perguntas.

1. O animal continua pertencendo ao produtor?
2. O animal continua fisicamente na fazenda?
3. Essa movimentação altera o total do rebanho próprio?

---

## 2. Decisão central: saldo é derivado, nunca digitado

**O saldo de cada posição é a soma das movimentações, e não um número
gravado.**

Alternativa descartada: manter o saldo materializado numa linha e gravar o
histórico ao lado. É mais rápido de ler, mas os dois podem divergir em
silêncio, e quando divergem o número errado é justamente o que o produtor vê.
O documento ainda exige (§10.8) que editar ou cancelar um lançamento recalcule
o saldo: com saldo gravado isso é um recálculo manual que alguém vai esquecer
de disparar em algum caminho.

Com livro-razão, a regra de ouro deixa de ser disciplina e vira estrutura:
cada movimentação declara de onde saiu e para onde foi, e as três respostas
caem de graça.

### Posição

Uma **posição** é a interseção de cinco eixos:

```
categoria x fazenda x pasto x situação x dono
```

| Eixo | Valores |
|---|---|
| `situação` | `presente`, `evento`, `pasto_terceiro`, `boitel`, `confinamento`, `desaparecido` |
| `dono` | `proprio`, `terceiro` |

E as perguntas do cliente viram filtros:

| Pergunta do cliente | Filtro |
|---|---|
| Rebanho próprio total | `dono = proprio` |
| Próprios na fazenda | `dono = proprio` e `situação = presente` |
| Próprios fora da fazenda | `dono = proprio` e `situação ≠ presente` |
| Animais de terceiros aqui | `dono = terceiro` e `situação = presente` |
| **Ocupação real do pasto** | `situação = presente`, **os dois donos** |

A última linha é o motivo de animais de terceiros viverem no mesmo
livro-razão, e não num módulo separado de agistamento: a pergunta que o
produtor faz de verdade é "cabe mais gado no Pasto da Baixada?", e essa conta
precisa somar os dois donos. Com dois sistemas, toda tela de ocupação teria
que juntar duas fontes à mão. O próprio cliente pediu a visão conjunta:
"próprio 180, presentes 150, fora 30, terceiros 40, total físico 190".

---

## 3. As 12 categorias são constante de código

O documento (§5) manda cadastrar 12 categorias fixas por sexo e faixa de
idade, e diz que "o usuário não deverá precisar criar essas categorias
manualmente".

Hoje `AnimalCategory` é uma tabela por tenant com um `name` de texto livre,
semeada com nomes populares (Boi, Vaca, Novilha, Garrote...). **Um nome
digitado não sustenta o que o documento pede:**

- §12 exige "total de machos" e "total de fêmeas": precisa do sexo por categoria.
- §14 exige traduzir "novilha" para uma faixa etária: precisa da idade.
- §9 exige mudança de categoria por envelhecimento: precisa da ordem.
- §10.6 dá prioridade às categorias reprodutivas sobre as de idade.

Por isso as 12 viram **constante no código**, com sexo, faixa em meses e flag
de reprodutiva, no mesmo padrão de `PLAN_PRICES`/`PLAN_SEATS` (metadado de
produto numa fonte só). Se cada tenant pudesse editar, "total de machos" e a
tradução de apelidos parariam de funcionar para quem mexeu, e duas fazendas
chamariam a mesma coisa de nomes diferentes, quebrando o assistente.

Os nomes populares que existem hoje **não somem**: viram a tabela de apelidos
do §14, que é o papel que o próprio documento dá a eles.

**Migração:** produção tem 2 cabeças, ambas em "Não classificado". O custo é
próximo de zero, e essa janela fecha quando os primeiros clientes cadastrarem
rebanho de verdade.

---

## 4. O que existe hoje e não é jogado fora

O §15 lista fora do MVP: brinco, raça, peso individual, vacinação individual,
histórico individual.

**Decisão: manter como anexo opcional do lote, não remover.** O documento diz
que essas informações não serão *exigidas*, não que devem ser apagadas.
Remover quebraria duas coisas em produção e já validadas:

- **M17** (previsão de vacina com custo, pelo WhatsApp),
- os **alertas de vacina** e o bloco de vencimentos do dashboard, que leem
  `AnimalVaccination.next_due_at`.

O livro-razão passa a mandar na **quantidade**; peso, vacina e brinco
continuam existindo para quem quiser.

### Limite conhecido, não resolvido nesta fase

`registrar_previsao_vacina` busca o lote **pelo brinco** e recusa sem ele.
O produtor que trabalha só por categoria (o alvo deste documento) não alcança
esse fluxo. Não é regressão: já era assim. Decidir se a previsão passa a
aceitar categoria é escopo próprio.

---

## 5. Entrega em duas fases

Como os eixos de **dono** e **situação** nascem já na fase 1, adiar os fluxos
do complemento é seguro: eles entram como tabelas e tipos novos por cima, sem
migrar o que já foi gravado.

### Fase 1: documento principal

Fecha sozinha os 16 critérios de aceite do §16.

- Livro-razão com os cinco eixos completos.
- 12 categorias fixas + tabela de apelidos.
- Cadastro inicial do rebanho (§6).
- Movimentações: `saldo_inicial`, `nascimento`, `compra`, `venda`, `morte`,
  `transferencia_pasto`, `transferencia_fazenda`, `mudanca_categoria`,
  `ajuste`.
- Histórico obrigatório (§10.7) e recálculo ao editar/cancelar (§10.8).
- Bloqueio de saldo negativo (§10.3).
- Tela de visualização (§11) e resumo (§12).
- Consultas e registros pelo WhatsApp (§13, §14).

### Fase 2: complemento

Leilão/feira, pasto de terceiros, boitel, confinamento próprio,
desaparecimento e animais de terceiros na fazenda. Cada um com seu
encerramento (a soma entre vendidos, retornados e outras destinações precisa
bater com a quantidade enviada).

**Por que nessa ordem:** é nos encerramentos parciais (12 vendidos, 8
retornados) que moram os piores bugs, e validá-los sem o básico rodando em uso
real é mais caro.

---

## 6. Compatibilidade: troca por dentro

O raio de impacto medido: ~20 arquivos no painel web, a tela do app mobile e
7 intenções do assistente.

**`GET /api/v1/animals` continua existindo com o mesmo formato**, servido
agora pelas posições do livro-razão. O app mobile e o dashboard sobrevivem
praticamente sem mudança.

A **escrita** muda de verdade: deixa de existir "criar lote" e passa a ser
"registrar movimentação", com rotas novas.

**`/api/v1/animal-batches` morre**, encerrando a duplicação que sobreviveu à
unificação de 2026-08-04.

Alternativa descartada: livro-razão novo ao lado do modelo atual, migrando
consumidores aos poucos. É exatamente o que o Módulo 25 fez, e dois modelos de
rebanho convivendo viraram o maior desalinhamento aberto do projeto, desfeito
só em 2026-08-04. Não repetir.

---

## 7. Decisões menores, tomadas sem consulta

- **`saldo_inicial` é um tipo de movimentação.** O livro-razão precisa de um
  primeiro lançamento, e o cadastro inicial do §6 é exatamente isso.
- **Compra e venda geram lançamento financeiro por `createLinkedEntry()`**,
  como o `CLAUDE.md` obriga. **Nascimento e morte não geram nada**, conforme
  §10.4 e §10.5.
- **Movimentação ganha `pasture_id` opcional**, que hoje não existe (só
  `from_property_id`/`to_property_id`).
- **Envelhecimento é manual**, conforme §9.
- **Saldo negativo é bloqueado na action**, com a mensagem que o cliente
  escreveu: "Existem apenas 12 animais nesta categoria. Revise a quantidade
  informada."

---

## 8. Critérios de aceite (§16 do cliente, um a um)

| # | Critério | Como será verificado |
|---|---|---|
| 1 | Cadastrar quantidade inicial por categoria | `test:m32`, movimento `saldo_inicial` |
| 2 | Ver total geral | soma das posições `dono = proprio` |
| 3 | Ver quantidade por categoria | agrupamento por categoria |
| 4 | Ver machos e fêmeas separados | derivado do sexo da constante |
| 5 | Registrar nascimento | machos em Bezerro, fêmeas em Bezerra, sem financeiro |
| 6 | Registrar compra | saldo sobe, `FinancialEntry` quando há valor |
| 7 | Registrar venda | saldo desce, `FinancialEntry` quando há valor |
| 8 | Registrar morte | saldo desce, sem financeiro |
| 9 | Transferir entre pastos | total inalterado |
| 10 | Transferir entre fazendas | total inalterado |
| 11 | Mudar de categoria | total inalterado |
| 12 | Ajuste de saldo | histórico preservado |
| 13 | Consultar histórico | toda movimentação com os 9 campos do §10.7 |
| 14 | Impedir saldo negativo | erro com a mensagem do cliente |
| 15 | Consultas pelo WhatsApp | §13.1 a §13.7 |
| 16 | Confirmar antes de registrar | reusa o mecanismo de confirmação do M3 |

Todos com teste automatizado (`npm run test:m32`) antes de reportar a fase
como concluída, e validação em navegador real depois.

---

## 9. Fora desta spec

- Identificação individual, genealogia, reprodução, rastreabilidade,
  confinamento zootécnico: §15 do cliente.
- Envelhecimento automático de categoria: §9 pede manual na primeira versão.
- Tela de rebanho do app mobile: a fase 1 preserva o contrato de leitura, então
  a tela continua funcionando. Refazê-la para o novo domínio é peça própria do
  roadmap do app.
