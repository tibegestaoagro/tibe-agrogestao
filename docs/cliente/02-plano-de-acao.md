# TIBÉ: plano de ação

**De:** Pleno Digital
**Data:** 31 de julho de 2026
**Depende de:** confirmações da seção 10 do documento
[01-entendimento-do-produto.md](01-entendimento-do-produto.md)

Este plano assume que o rebanho passa a ser por **categoria e quantidade**, com
o controle individual virando recurso opcional. Se essa decisão mudar, as fases
1 e 2 mudam junto.

---

## Princípio de priorização

Ordenamos por **impacto na promessa do produto dividido pelo esforço**, e não
por facilidade de execução. Duas regras guiaram a ordem:

1. **O que bloqueia outras entregas vem primeiro.** O modelo de rebanho define a
   linguagem do assistente, os relatórios e a tela inicial. Construir qualquer
   uma dessas coisas antes de decidir o rebanho é aceitar refazer.
2. **O que faz o produtor abrir o aplicativo sem ter nada para registrar vem
   cedo.** É o que sustenta o hábito.

---

## Fase 1: o modelo de rebanho (bloqueante)

**Por que primeiro:** enquanto o rebanho for individual, cada registro exige
brinco, e isso contraria o princípio de perguntar o mínimo. Toda entrega
seguinte herda essa fricção.

**Entregas:**

1. **Rebanho por categoria e quantidade.** Bezerros, bezerras, garrotes,
   novilhas, bois, vacas, touros e outros, com saldo por propriedade.
2. **Movimentações em lote:** compra, nascimento, venda, morte, transferência
   entre fazendas e ajuste de quantidade, cada uma com data, categoria,
   quantidade, valor quando houver, e observação.
3. **Compra e venda de gado como operação única e integrada.** Ao confirmar,
   atualiza o rebanho, cria a despesa ou receita, e cria a conta a pagar ou a
   receber quando a data for futura. O produtor lança uma vez só.
4. **Controle individual vira opcional**, desligado por padrão. O que já existe
   continua funcionando para quem quiser.
5. **Assistente do WhatsApp falando em lote.** *"Comprei 20 bezerros por 60 mil
   para pagar dia 10 de setembro"* passa a ser uma frase que o sistema entende
   inteira, com confirmação antes de gravar.

**Resultado esperado:** o exemplo do Manifesto funciona de ponta a ponta.

---

## Fase 2: completar as quatro áreas prometidas

**2.1 Meu Dia**

Compromissos e tarefas criados pelo produtor, com situação (pendente,
concluída, atrasada, cancelada) e lembrete opcional. Hoje o produtor só recebe
o que o sistema decide sozinho; falta ele poder dizer *"me lembra de comprar
sal na quinta"*.

**2.2 Máquinas e equipamentos**

Cadastro (nome, tipo, marca, modelo, ano, aquisição, horímetro, situação) e
manutenções, com próxima manutenção e geração automática de despesa. É uma das
quatro áreas da primeira versão e não existe hoje.

**2.3 Tela inicial reformulada**

Os oito indicadores da seção 5.1 (total de animais, a pagar, a receber, saldo,
próximos compromissos, contas vencidas, manutenções próximas e últimos
lançamentos) e os sete atalhos da 5.2.

**2.4 Ajustes de comportamento financeiro**

Adiar vencimento, cancelar conta, categorias personalizadas de receita e
despesa, e preferências de quais lembretes receber.

---

## Fase 3: Calculadora Pecuária

**Por que separada e por que não é a última:** é a entrega de **melhor relação
valor por esforço** de todo o projeto. São cálculos, sem banco de dados novo,
sem integração e sem risco de quebrar o que existe. E é o que dá ao produtor um
motivo para abrir o TIBÉ num dia em que ele não tem nada para registrar, que é
justamente o dia em que a maioria dos aplicativos é esquecida.

Doze ferramentas: cerca, formação de pastagem, lotação animal, compra e venda de
gado, sal mineral e suplementos, rações e misturas, consumo de água,
dimensionamento de cochos, adubação, calagem, mão de obra, e máquinas e
combustível.

**Duas regras que respeitaremos**, conforme o documento de vocês:

- A simulação **não alimenta** os registros automaticamente. Salvar é uma ação
  voluntária e confirmada.
- Os conteúdos técnicos (doses, consumos, referências) **precisam de validação
  da equipe TIBÉ** antes de irem ao ar. Nós construímos a ferramenta; a
  responsabilidade técnica do número é de vocês.

---

## Fase 4: reduzir o custo de conversa (detalhada no documento 03)

Esta fase existe por causa da mudança de cobrança do WhatsApp em outubro de
2026, e está detalhada no documento
[03-canal-whatsapp-e-app.md](03-canal-whatsapp-e-app.md).

Resumo: consolidar respostas, encurtar o cadastro guiado, transformar vários
alertas num resumo diário, e medir o consumo por cliente.

**Recomendação de sequência:** os dois primeiros itens dessa fase são baratos e
melhoram a experiência independentemente do custo. Sugerimos executá-los junto
com a Fase 1, e não esperar.

---

## Fora deste plano, por decisão

**Módulo Lavoura:** mantido disponível e funcionando, sem evolução. Não faz
parte das quatro áreas da primeira versão e o pilar é "Pecuária Primeiro".
Desligar destruiria valor já entregue; evoluir consumiria esforço fora do foco.

**Consultor TIBÉ, diagnóstico inteligente e recomendações:** ficam para depois
que o produtor estiver usando o sistema naturalmente, conforme o próprio
documento de vocês coloca. Antes disso não há dado suficiente para recomendar
nada com honestidade.

---

## Riscos que registramos agora

| Risco | Impacto | O que propomos |
|---|---|---|
| A decisão sobre o rebanho demorar | Trava as fases 1 e 2 e gera retrabalho em tudo que for feito antes | Decidir isso antes de qualquer nova linha de código |
| Conteúdo técnico das calculadoras sem validação | Recomendação errada em campo, com prejuízo real ao produtor | Nenhuma calculadora vai ao ar sem validação assinada pela equipe TIBÉ |
| Cobrança do WhatsApp a partir de outubro | Custo por cliente cresce junto com o engajamento | Documento 03, com ação antes da data |
| Dependência de um único canal | Bloqueio do número derruba todos os clientes ao mesmo tempo | Documento 03, seção de aplicativo próprio |

---

## O que precisamos para começar

As quatro confirmações da seção 10 do documento 01. A primeira delas, sobre o
modelo de rebanho, é a única que bloqueia o início.
