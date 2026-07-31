# TIBÉ: nosso entendimento do produto

**De:** Pleno Digital
**Para:** Equipe TIBÉ / Agromax
**Data:** 31 de julho de 2026
**Base:** Manifesto e Visão do Produto (v1.0), Arquitetura Funcional do Sistema (v0.1)
e Caderno Digital do Fazendeiro (v0.1)

Este documento registra o que entendemos do que vocês descreveram, para que
vocês confirmem ou corrijam antes de seguirmos. Onde encontramos diferença
entre o que foi pedido e o que já foi construído, dizemos abertamente.

---

## 1. O que o TIBÉ é

O TIBÉ não é um sistema de gestão rural. É um **ajudante digital** que substitui
o caderno de papel do pequeno pecuarista.

A frase que guia o projeto, e que adotamos como critério de decisão:

> "O TIBÉ não existe para controlar fazendas. Ele existe para facilitar a vida
> de quem vive delas."

Entendemos que isso tem consequências práticas duras, e não apenas retóricas:

- **Se uma funcionalidade não facilita a vida do produtor, ela não deve
  existir.** Mesmo que seja tecnicamente interessante ou comum no mercado.
- **O produtor não pensa em módulos, pensa em tarefas.** Ele não diz "vou abrir
  o financeiro", diz "preciso saber quanto tenho para pagar".
- **O sistema nunca deve parecer software.** Deve parecer um ajudante.
- **Toda pergunta feita ao produtor precisa de justificativa.** Perguntar menos
  é uma meta de produto, não um detalhe de tela.

## 2. Quem é o usuário

Pequeno e médio pecuarista, que trabalha na fazenda, usa WhatsApp todo dia, tem
pouca familiaridade com tecnologia e nunca usou sistema de gestão.

O que isso significa para nós: **ele não vai ler manual, não vai fazer
treinamento e não vai preencher formulário longo.** Se a primeira experiência
exigir esforço, ele não volta. Tratamos isso como restrição de projeto, não como
característica do público.

## 3. Os dois ambientes

**WhatsApp:** canal principal de registro, consulta e lembrete. Não é canal de
atendimento; é parte do produto.

**Plataforma de gestão:** ambiente visual para acompanhar, editar e organizar.
Entendemos do documento de arquitetura que, nesta primeira fase, ela pode ser um
**sistema web responsivo**, preparado para celular, tablet e computador.

## 4. As quatro áreas da primeira versão

1. **Organizar minha fazenda:** fazenda, rebanho, financeiro, compromissos,
   máquinas e equipamentos.
2. **Ferramentas do fazendeiro (Calculadora Pecuária):** cerca, pastagem,
   lotação, sal mineral, ração, água, cocho, adubação, calagem, mão de obra,
   máquinas e combustível, compra e venda de gado.
3. **Meu Dia:** o que exige atenção hoje. Pagamentos, recebimentos, vacinação,
   manutenção, tarefas e lembretes.
4. **Minha fazenda em números:** o essencial, sem excesso de gráficos.

## 5. As regras de comportamento que entendemos como inegociáveis

- **Confirmação antes de registrar.** Toda interpretação de mensagem do WhatsApp
  mostra um resumo antes de gravar.
- **Um registro alimenta todos os módulos.** Uma compra de gado atualiza rebanho,
  despesa, conta a pagar e indicadores, sem o produtor lançar duas vezes.
- **Quando faltar informação, perguntar só o que falta.** Nunca devolver a lista
  inteira de campos.
- **Quando a mensagem for ambígua, não registrar.** Oferecer opções simples.
- **Linguagem do campo.** Sem termo contábil ou técnico desnecessário.

## 6. O rebanho: o ponto mais importante deste documento

Entendemos, da seção 6.2 da Arquitetura Funcional, que o rebanho deve ser
controlado **por grupos ou categorias (bezerros, garrotes, vacas, bois...), com
quantidade, sem exigir identificação individual dos animais nesta primeira
versão.**

Entendemos também que **"controle individual por brinco" está explicitamente na
lista de funcionalidades fora da primeira versão** (seção 14).

**Aqui existe uma diferença que precisamos tratar com vocês.** O sistema hoje
construído controla o rebanho **animal por animal, com brinco obrigatório**,
incluindo peso individual e vacinação individual. Ou seja: foi construído o
modelo que o documento coloca como etapa futura, e não o modelo pedido para a
primeira versão.

Nossa leitura do impacto: o modelo individual **contraria diretamente o
princípio de perguntar o mínimo**. Para registrar a compra de 20 bezerros, o
produtor precisaria criar 20 fichas, quando o exemplo do próprio Manifesto é ele
dizer apenas *"comprei 20 bezerros por R$ 60.000"*.

**Nossa recomendação:** adotar categoria e quantidade como padrão, e manter o
controle individual como recurso opcional, desligado por padrão, para quem
quiser usá-lo no futuro. Assim atendemos o documento sem descartar o que já
está pronto e pago.

Precisamos da confirmação de vocês nesse ponto antes de seguir, porque ele
define o restante do trabalho.

## 7. Outras diferenças que identificamos

**O que já está pronto e alinhado:**

- WhatsApp como canal de registro, consulta e lembrete, funcionando em produção.
- Confirmação antes de gravar, com resumo.
- Integração automática entre módulos (uma venda já vira receita sozinha).
- Contas a pagar e a receber.
- Múltiplas propriedades, perfis de usuário e área administrativa da equipe.
- Reconhecimento de áudio e de foto de recibo pelo WhatsApp.

**O que ainda não existe:**

- Máquinas e equipamentos, com manutenção e próxima manutenção.
- Calculadora Pecuária (nenhuma das doze ferramentas).
- Meu Dia com compromissos e tarefas criados pelo produtor.
- Compra e venda de gado em lote, por categoria e quantidade.
- Categorias personalizadas de receita, despesa e animal.
- Preferências de quais lembretes receber.
- Adiar vencimento de uma conta.

**O que existe mas não estava previsto para esta fase:**

- Um módulo de **Lavoura** completo (talhões, ciclos, insumos, colheita). O
  Pilar 3 de vocês é "Pecuária Primeiro", e lavoura não aparece nas quatro áreas
  da primeira versão. Ele está pronto e funcionando. Nossa sugestão é mantê-lo
  disponível sem evoluí-lo agora, já que desligar destruiria valor sem ganho.

## 8. O que entendemos sobre o futuro

Registramos, como direção e não como escopo atual:

- **Consultor TIBÉ:** um parceiro digital para tirar dúvidas, fazer contas e
  apoiar decisões.
- **Diagnóstico inteligente** e **recomendações personalizadas**, depois que
  houver dado suficiente registrado.

Entendemos que essas funcionalidades só fazem sentido **depois** que o produtor
já estiver usando o sistema naturalmente, conforme o próprio documento coloca.

## 9. Como mediremos sucesso

Adotamos o critério de vocês: o sucesso não é quantidade de funcionalidades, é
**quanto tempo o produtor economiza**.

Na prática, propomos acompanhar:

- O produtor consegue registrar uma compra de gado sem treinamento.
- O produtor consegue saber quanto tem a pagar sem abrir mais de uma tela.
- O produtor volta a usar o sistema na semana seguinte sem ser lembrado.

## 10. O que precisamos de vocês

1. **Confirmação sobre o rebanho** (seção 6): categoria e quantidade como padrão?
2. **Confirmação sobre a Lavoura** (seção 7): manter disponível sem evoluir?
3. **Prioridade entre Calculadora Pecuária, Máquinas e Meu Dia**, caso não seja
   possível entregar as três ao mesmo tempo.
4. **Validação técnica dos conteúdos das calculadoras** (doses, consumos,
   referências), que conforme o documento é responsabilidade da equipe TIBÉ.

Assim que esses pontos estiverem confirmados, apresentamos o cronograma
detalhado por etapa.
