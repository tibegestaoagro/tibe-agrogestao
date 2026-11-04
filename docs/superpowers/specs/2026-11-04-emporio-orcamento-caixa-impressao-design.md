# Empório: impressão, caixa com turno, vendedor e orçamento

Design de 04/11/2026, tirado em entrevista com o usuário (Dilton, pela Agromax).
Módulo 39 (Meu Empório), spec `docs/specs/module-39-meu-emporio.md`. As
decisões entram na tabela da spec a partir da **Q145**.

## Por que

A loja de hoje vende e recebe, mas três coisas do balcão real ficam de fora:

1. **O cliente pede preço e leva um papel.** Não existe orçamento, nem papel
   nenhum: o Empório não imprime nada.
2. **Em loja com mais movimento, quem atende não é quem recebe.** O vendedor
   atende e um caixa recebe, em turnos, com troco inicial, sangria e malote
   para o gerente. Hoje a gaveta é uma só por loja, com conferência livre
   (Q35), e não há como fechar o turno de uma pessoa.
3. **A loja quer acertar comissão e entender o que vende.** A venda guarda só
   quem a registrou, e não há relatório por vendedor.

Sucesso, nas palavras do usuário: o vendedor orça, o cliente leva o papel, e
quando volta (ou vai ao caixa) a venda sai com os produtos orçados; o caixa
fecha o turno com um relatório que vai junto com o malote; e a loja sabe quem
vendeu o quê, por período.

## As quatro entregas, nesta ordem

Cada uma vai para produção sozinha, com a sua branch, as suas provas e a
autorização do usuário para o merge (invariante 7). A ordem segue a
dependência: as de baixo usam o que as de cima criam.

1. **Configurações e impressão da venda.**
2. **Caixa com turno** (e o papel Caixa).
3. **Vendedor na venda e relatórios.**
4. **Orçamento.**

---

## Entrega 1: configurações e impressão da venda

### Configurações do Empório (área nova)

Uma tela de configuração do Empório, para "configurar os detalhes" (palavras
do usuário); o que surgir de configurável depois entra nela. Conteúdo
aprovado pelo usuário no modelo visual de 04/11:

| item | onde vale |
|---|---|
| dados do cabeçalho: nome, CNPJ, endereço, telefone e WhatsApp | **por loja** (cada loja tem os seus) |
| logo | a conta (uma marca) *(decisão minha; o usuário aprovou "logo" sem dizer o escopo)* |
| validade do orçamento, em dias | a conta |
| texto de rodapé do orçamento | a conta |
| texto de rodapé da venda | a conta |
| largura da bobina: 80 mm ou 58 mm | a conta |

- Os dados do cabeçalho moram na loja (`Establishment` já tem `address` e
  `city`; faltam CNPJ, telefone, WhatsApp, UF e CEP). O CNPJ da loja segue a
  mesma conferência do CNPJ do contato (`cnpjValido`, aceita o alfanumérico,
  Q143), e é opcional.
- **Não existe armazenamento de arquivo no projeto** (nem R2, nem upload). O
  logo fica no próprio banco, como imagem pequena (limite de tamanho decidido
  pelo builder, na casa de 200 KB, PNG ou JPEG). *(decisão minha)*
- Quem edita: os itens da conta, o Dono e o Gerente geral (ação `conta`); os
  dados de cabeçalho de uma loja, também o Gestor daquela loja (ação
  `gestor_da_loja`). *(decisão minha)*

### Número da venda

Hoje a venda só tem o id interno. O papel precisa de um número legível
("Venda nº 004581"). Número sequencial **por conta**, gerado no servidor, sem
buraco por corrida (o builder escolhe como: contador com trava ou
`MAX + 1` com chave única e nova tentativa). As vendas antigas recebem número
na migração, pela ordem de `sold_at`. *(decisão minha)*

### Impressão

- **Dois formatos: A4 e bobina.** O comprovante da bobina é **sem valor
  fiscal** ("COMPROVANTE DE VENDA, SEM VALOR FISCAL"). NFC-e e qualquer
  emissão fiscal estão fora (decisão do usuário: "sem valor fiscal por
  enquanto").
- **Layout aprovado** no modelo visual de 04/11, que segue anexado na seção
  "Os dois papéis" abaixo.
- **Impressão pelo navegador** (`window.print()`, com `@page` do tamanho
  certo: A4, ou `80mm auto` / `58mm auto` sem margem). Salvar em PDF é o
  "Salvar como PDF" do próprio diálogo de impressão. Não entra driver de
  impressora, nem biblioteca de PDF nova. *(decisão minha; o projeto já
  esconde o menu na impressão com `print:hidden`, e o manual já imprime A4
  assim)*
- Onde imprimir a venda: no resumo "Venda registrada" do balcão (botões
  **Imprimir A4** e **Imprimir cupom**) e na tela da venda (reimpressão a
  qualquer momento).

### Os dois papéis (aprovados)

**A4 (orçamento e venda):** logo e dados da loja no topo à esquerda; à direita
o título (ORÇAMENTO ou VENDA), o número, a data e hora, e, no orçamento, a
**validade em destaque**. Bloco do cliente (nome, documento, telefone,
endereço). Tabela de itens (produto, quantidade com a unidade, preço, total).
Subtotal, desconto e total. Rodapé com o vendedor, o texto configurado e
"Documento sem valor fiscal". Na venda, as formas de pagamento entram no lugar
da validade.

**Bobina (venda e, se o cliente quiser, orçamento):** nome da loja, CNPJ,
endereço e telefone centralizados; "COMPROVANTE DE VENDA / SEM VALOR FISCAL";
número e data; o orçamento de origem, quando houver; cada item em duas linhas
(nome, depois "qtd un x preço ... total"); subtotal, desconto, TOTAL; cada
forma de pagamento e o troco; cliente, vendedor e caixa; rodapé configurado.
Sem logo na bobina.

---

## Entrega 2: caixa com turno

**Revisa a Q35**, que decidiu "conferência livre, sem abertura e fechamento por
turno" para não travar o balcão. Decisão do usuário em 04/11: o turno passa a
existir em **toda** loja, e a trava é evitada abrindo o caixa no próprio
balcão.

### O papel Caixa

Novo papel na Equipe, ao lado de Gerente geral, Gestor e Vendedor. Ligado a
lojas, como o Vendedor. O Caixa pode, nas lojas dele:

- vender sem orçamento;
- faturar um orçamento digitando o número dele (entrega 4);
- receber fiado;
- ver as vendas do dia da loja;
- abrir caixa, fazer sangria e encerrar caixa.

Não pode mais nada: estoque, compras, produtos, despesas, resultado, Equipe,
devolução e troca ficam fora. Desconto: o mesmo limite do Vendedor
(`max_discount_pct` da loja). *(decisão minha)* O menu lateral mostra só o que
ele abre, como já faz para os outros papéis (Q142).

### Os caixas da loja (pontos de caixa)

- **Cada caixa é uma gaveta física.** A loja passa a ter caixas numerados
  ("Caixa 1", "Caixa 2"), e a gaveta deixa de ser a loja inteira (revisa o
  desvio "a gaveta é a loja" da seção F3a da spec). Decisão do usuário em
  04/11: dois caixas abertos ao mesmo tempo são duas gavetas diferentes.
- Toda loja nasce com o "Caixa 1". Outros caixas se criam na Configuração, por
  quem edita a loja. *(decisão minha)*
- **Um turno aberto por caixa.** Hoje os caixas revezam a mesma gaveta, um
  depois do outro. Para trabalhar em paralelo, abre-se outro caixa, com o
  próprio troco.
- O saldo da gaveta da loja, que o Caixa de hoje mostra, passa a ser a soma
  dos caixas dela.

### O turno (sessão de caixa)

- **Abrir caixa:** sempre com o **troco inicial**, mesmo quando é o único
  caixa da loja. Como o encerramento anterior deixa o troco na gaveta
  (abaixo), **abrir é conferir esse troco**. Se o contado bater com o que o
  sistema diz que está na gaveta, abre. Se não bater, a diferença segue a
  regra da conferência (Q93): justificativa e ajuste.
- **Gaveta vazia ou troco curto** (caixa novo, ou depois de um malote
  grande): na abertura, o operador pode lançar um **reforço de troco vindo da
  gerência**. É uma saída de "Com a gerência" para a gaveta, para nenhum
  dinheiro aparecer do nada. *(decisão minha)*
- **Cada lançamento de dinheiro da gaveta cai no turno aberto daquele caixa** e
  guarda quem o fez. Com um turno aberto na loja, vai para ele. Com mais de
  um, vai para o que o usuário abriu, e quem não abriu nenhum escolhe o caixa.
  *(decisão minha)*
- **Loja sem login de Caixa:** o mesmo turno, compartilhado. Quem estiver no
  balcão (vendedor ou gerente) abre, todos lançam nele, e qualquer um encerra.
  O relatório é o mesmo. "Loja sem Caixa" não é uma configuração: é só a
  loja onde ninguém tem esse papel. *(decisão minha)*
- **Na loja com Caixa**, o vendedor que fatura no próprio balcão lança no
  turno aberto de um dos caixas, escolhendo qual se houver mais de um.
  *(decisão minha)*
- **O Gestor pode encerrar o turno de outra pessoa**, com a contagem (por
  exemplo, o caixa que saiu sem fechar). Um turno que passa da meia-noite
  continua valendo, com um aviso no Meu Dia. *(decisão minha)*
- **As outras operações de dinheiro da gaveta também exigem turno aberto** e
  caem nele: cancelamento e devolução pagos em dinheiro, e a despesa paga da
  gaveta (Despesas). A venda sem caixa aberto abre ali mesmo; nas outras, a
  tela pede para escolher o caixa e abri-lo. *(decisão minha)*
- **A conferência livre (Q35, Q93) continua**, agora dentro do turno: conta a
  gaveta sem encerrar. O aviso "caixa não conferido" do Meu Dia (Q110) dá
  lugar a dois: "turno aberto desde ontem" e "dinheiro aguardando o
  gerente". *(decisão minha)*
- **A transferência direta da gaveta para o banco (Q92) sai.** O dinheiro da
  gaveta vai para o gerente pela sangria ou pelo malote, e da gerência para o
  banco pela transferência. A chave `transferir_caixa` do Vendedor perde o
  sentido; quem opera o caixa faz sangria. *(decisão minha; o usuário pode
  preferir manter a transferência direta para lojas pequenas)*
- **Na entrada no ar**, cada loja ganha o "Caixa 1" com o saldo atual da
  gaveta, sem turno aberto. A primeira abertura confere esse saldo. *(decisão
  minha)*
- **Caixa fechado não trava a venda:** se ninguém abriu, o balcão pede o troco
  inicial e abre o caixa ali mesmo, num passo só (decisão do usuário).
- PIX, cartão e cheque não passam pela gaveta (já é assim, Q34 e Q95), mas
  aparecem no relatório do turno, separados por forma de pagamento.

### Sangria

Retirada de notas da gaveta no meio do turno. O dinheiro **vai para o
gerente** (decisão do usuário). Fica lançada no turno, para o encerramento
bater. O sistema passa a ter um lugar de dinheiro **"Com a gerência"** (por
loja *(decisão minha)*), que recebe a sangria e o malote e de onde o gerente
leva ao banco pela transferência que já existe (Q92).

**O gerente confirma o recebimento** (decisão do usuário). A sangria e o
malote saem da gaveta na hora, mas ficam **"aguardando o gerente"** até
alguém confirmar o valor recebido. Pode confirmar o Gestor da loja, o Gerente
geral ou o Dono. Só então o dinheiro entra em "Com a gerência". Se o
recebido for diferente, a diferença fica registrada, como na transferência de
estoque com diferença (Q131). O que está aguardando aparece no Meu Dia de
quem pode confirmar. Mover dinheiro da gerência para o banco: Gestor da loja
para cima. *(decisão minha)*

### Encerrar caixa

- O operador informa quanto contou. O esperado é o troco inicial, mais o
  dinheiro que entrou, menos o que saiu (troco dado, devolução em dinheiro,
  sangria). A diferença segue a regra de hoje da conferência (Q93):
  justificativa obrigatória quando há diferença, ajuste na gaveta e
  lançamento "Diferença de caixa".
- **O troco fica na gaveta** (decisão do usuário). O operador conta tudo,
  separa o **malote** para o gerente (aguardando a confirmação dele) e deixa
  o resto na gaveta, como troco do próximo turno.
- **O relatório do encerramento:** loja, caixa (número) e operador, abertura e
  encerramento (data e hora), troco inicial e reforço da gerência, vendas por
  forma de pagamento, fiado recebido, sangrias (uma por linha), devoluções e
  despesas em dinheiro, esperado, contado, diferença e justificativa, o valor
  do malote e o troco que ficou. Sai em A4 e na bobina, com "Salvar como PDF"
  do navegador, para ir junto com o malote.
- Depois de encerrar, a tela fica aguardando a abertura do próximo turno, que
  pode ser do mesmo usuário.

---

## Entrega 3: vendedor na venda e relatórios

### O vendedor

- A venda ganha o **vendedor** (quem atendeu), separado de **quem registrou**
  (`sold_by_user_id`, que continua sendo o usuário logado: no caminho do
  Caixa, é o caixa).
- **Vendedor sozinho no balcão:** o campo já vem com ele.
- **Caixa vendendo sem orçamento:** escolhe numa lista o vendedor que atendeu
  (decisão do usuário). Campo obrigatório para o Caixa.
- **Orçamento faturado:** o vendedor da venda é o do orçamento.
- A lista traz quem tem papel no Empório naquela loja, menos o Caixa.
  *(decisão minha)*
- As vendas antigas ganham vendedor igual a quem registrou. *(decisão minha)*
- O vendedor aparece na tela da venda, na lista de vendas e nos dois papéis.

### Relatórios

Por **período** (data inicial e final), com filtro de loja:

- **Vendas por vendedor:** quantidade de vendas, total vendido e ticket médio.
  Serve para **acertar a comissão**; o sistema não calcula o percentual.
  *(decisão minha)*
- **Vendas por produto:** quantidade e total, do mais vendido ao menos.
- **Produtos parados:** produtos ativos da loja sem nenhuma venda no período.
- **Vendas por loja.**

Venda cancelada não conta, e a devolução desconta, como no Resultado.
*(decisão minha)* Quem vê: Gestor (das lojas dele) para cima. Vendedor e Caixa
não veem. *(decisão minha)* O Resultado já tem "mais vendidos" do mês
(`produtosDoMesAction`), que serve de base.

---

## Entrega 4: orçamento

### Como funciona

- No balcão, antes da venda, há o modo **Orçamento**, que se comporta como a
  venda (loja, produtos, quantidades, preços, desconto no mesmo limite), mas
  **não dá baixa no estoque, não recebe pagamento e não vai para a
  conclusão**. Não reserva estoque.
- Ao terminar, duas saídas:
  - **Salvar orçamento:** exige o cliente com os dados do balcão (PF ou PJ,
    nome, CPF ou CNPJ, telefone; Q139). Consumidor final não serve, porque o
    orçamento precisa ser achado depois. Recebe um **número** sequencial por
    conta e a **validade** (data de hoje mais os dias da configuração, no dia
    de Brasília), e pode ser impresso em A4 ou na bobina para entregar ao
    cliente.
  - **Faturar orçamento:** vai para a venda normal com os produtos orçados.
    Faturar sem ter salvado só leva os itens para a venda, sem guardar
    orçamento. *(decisão minha)*
- O vendedor do orçamento é quem o fez (no balcão do vendedor) ou o escolhido
  na lista (no balcão do Caixa).

### Achar e acompanhar

- Lista de orçamentos com **nome, telefone, valor, data e validade**; busca
  pelo **telefone, CPF, CNPJ, nome ou número**. Serve também para o
  acompanhamento: ligar para quem não voltou.
- Estados: **aberto**, **vencido** (passou da validade; fica marcado, decisão
  do usuário) e **faturado** (sai do acompanhamento). Não existe "recusado".
  *(decisão minha)*
- Orçamento salvo não se edita; para mudar, fatura ajustando os itens na venda
  ou faz um novo. *(decisão minha)*

### Faturar um orçamento salvo

- Pelo **vendedor**, no próprio balcão, ou pelo **Caixa**, digitando o número:
  o balcão carrega os itens e o total, e segue a venda normal (pagamento,
  baixa no estoque, caixa).
- **Preço:** dentro da validade, vale o **preço do orçamento**; depois dela,
  vale o **preço do dia**, com aviso de que o preço mudou (decisão do
  usuário).
- **Estoque:** se faltar, **avisa** (decisão do usuário); a venda continua
  seguindo a regra de estoque negativo da loja (`allow_negative_stock`).
- Um orçamento fatura uma vez só. A venda guarda de qual orçamento veio, e o
  orçamento guarda a venda.
- Vencido também pode ser faturado (pelo preço do dia).

---

## Fora do escopo (non-goals)

- Emissão fiscal (NFC-e, SAT, cupom fiscal de verdade).
- Cálculo de comissão (o relatório só mostra o que cada um vendeu).
- Reserva de estoque pelo orçamento.
- Envio do orçamento por WhatsApp ou email.
- Intenções novas no agente do WhatsApp para orçamento ou caixa.
- Contagem do encerramento por cédula e moeda (vai o total contado).
- Integração com impressora (driver, gaveta elétrica): a impressão é a do
  navegador.

## Anti-objetivos (o que tornaria isso um fracasso mesmo funcionando)

- **O balcão travar** porque o caixa não foi aberto (por isso abrir no próprio
  balcão).
- **O encerramento não bater** porque um lançamento de dinheiro caiu fora do
  turno (por exemplo, a devolução em dinheiro ou o fiado recebido).
- **O cliente voltar com o papel e pagar diferente do que leu** dentro da
  validade.
- Imprimir dado pessoal que o cliente não deveria ver (o papel do orçamento
  leva o documento do próprio cliente, e só dele).

## Restrições do projeto

- As oito invariantes do `CLAUDE.md`. Em especial: o saldo nunca é gravado
  (o turno e a gerência também são soma de movimentações), migração antes do
  push, nada de travessão, e regra de negócio em `src/lib/actions`.
- Ordem action, rota, tela; `/docs/api` e `packages/contracts` atualizados.
- Toda escrita do Empório registra no Histórico (`registrarNoHistorico`,
  conferência 19), e a permissão sai de `src/lib/emporio/papel.ts`.
- Suítes novas no próximo número livre (`test:m91` em diante), escritas a
  partir deste documento e vistas falhando antes; roteiro de navegador por
  entrega, provado nos dois sentidos; telas vistas no celular.

## O que fica para o builder

Nomes de tabela e campo, forma do contador de número, o limite exato do logo,
o layout fino das telas novas (seguindo o kit e o `FormSheet`), e onde fica a
tela de Configurações no menu do Empório.
