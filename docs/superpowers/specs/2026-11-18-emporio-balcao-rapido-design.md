# Empório: balcão rápido (frente D, Q357 a Q361)

Frente D do plano das ideias do GestãoClick
([2026-11-17-emporio-plano-gestaoclick.md](2026-11-17-emporio-plano-gestaoclick.md),
dívida 2.74). Spec do módulo:
[../../specs/module-39-meu-emporio.md](../../specs/module-39-meu-emporio.md).

## Por que

Na Agromax quem vende usa **computador**. A loja ainda não tem leitor de código
de barras nem impressora de etiquetas, e o usuário quer o sistema **pronto para
os dois** quando chegarem (18/11). Os atalhos servem desde o primeiro dia; o
leitor e a etiqueta, no dia em que o equipamento for comprado, sem nova entrega.

A ideia veio das telas do PDV do GestãoClick (atalhos com legenda no rodapé,
leitor, etiqueta de gôndola), não de um pedido na reunião. O que não copiar
está no plano.

## O que existe hoje

- **Balcão** (`/emporio/vender`, `_components/balcao.tsx` e
  `_components/venda-campos.tsx`): busca de produto no navegador, sobre o
  catálogo já carregado (`catalogo-venda.ts`, tipo `ProdutoVenda` em
  `venda-estado.ts`); `produtoCasaBusca` compara nome, marca, fabricante e
  `internal_code`. Enter com um resultado só escolhe. `adicionarProduto` entra
  com a apresentação padrão e **já soma 1** quando a mesma apresentação do
  mesmo produto está na lista. Nenhum atalho de teclado além do Enter.
- **Apresentação** (`ProductPresentation`): nome, `base_qty`, embalagem
  fechada. Editada em `apresentacao-form.tsx` (POST
  `/api/v1/emporio/products/:id/presentations`, PATCH
  `/api/v1/emporio/presentations/:id`, arquivar e desarquivar), pela chave
  `cadastrar_produto` (Dono, Gerente geral, Gestor nas lojas dele, Vendedor
  com a chave).
- **Impressão** em `src/app/(impressao)/emporio/imprimir/` (A4 e cupom, papéis
  em `src/components/emporio/impresso/`).
- **Configurações** (`EmporioSettings`, uma linha por conta; tela
  `/emporio/configuracoes`; action em `emporio-configuracoes.ts` com a chave
  `conta`).
- Nenhum código de barras no schema nem biblioteca de barras no
  `package.json`. `EmporioCounter` dá sequência atômica por conta e chave.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q357 | **Escopo:** atalhos de teclado no balcão (só no computador), leitor de código de barras e etiqueta de prateleira, tudo nesta frente | decisão do usuário em 18/11: vende no computador, ainda sem leitor e sem impressora, "deixar pronto para esses recursos" |
| Q358 | **O código é da apresentação**, digitado (o oficial da embalagem) **ou gerado aqui** (para o que não tem código de fábrica), e **editável a qualquer momento** (cadastrar um provisório e trocar pelo correto depois) | decisão do usuário em 18/11 |
| Q359 | **Caminho A:** um código por apresentação (um campo), não uma lista de códigos | decisão do usuário em 18/11 |
| Q360 | **Etiqueta nos dois formatos:** folha A4 de etiquetas adesivas na impressora comum e rolo de impressora térmica; quem imprime escolhe | decisão do usuário em 18/11: "deixar preparado para os 2 tipos de impressora" |
| Q361 | **Configurável nas Configurações do Empório:** as teclas dos atalhos, a legenda e as medidas das etiquetas (folha e rolo) e o formato padrão | decisão do usuário em 18/11 |

## Abordagens consideradas

- **A (escolhida, Q359): um código por apresentação.** Campo único, botão
  "Gerar código", trocar é sobrescrever. Código repetido entre apresentações
  ativas é recusado, então a leitura nunca fica ambígua.
- **B: vários códigos por apresentação** (oficial antigo e novo convivendo na
  prateleira). Mais cliques e uma regra de qual sai na etiqueta, para um caso
  raro. Se aparecer, o campo único vira o "principal" da lista sem desfazer
  nada.
- Barras desenhadas **por nós** (SVG, EAN-13 e EAN-8), sem biblioteca nova:
  os dois padrões são pequenos e são os únicos que esta frente imprime.

## Comportamento

### O código na apresentação

- Campo **"Código de barras"** (`barcode` na API, opcional) no criar e no
  editar apresentação, com o botão **"Gerar código"** ao lado.
- **Aceita** só dígitos, com **8, 12 ou 13** números, e o **dígito verificador
  conferido** (pega erro de digitação). Espaços nas pontas são aparados; vazio
  vira nulo (sem código). O de 12 (UPC-A) é gravado com um 0 na frente, como
  EAN-13. Recusas em `barcode`, 422: "O código de barras tem 8 ou 13
  números." e "O código de barras não confere: verifique os números.".
- **Único entre as apresentações ativas da conta.** Repetido: 409
  `BARCODE_IN_USE` em `barcode`, nomeando o produto e a apresentação donos
  dele. Vale ao criar, ao editar e ao **desarquivar** (a arquivada não segura o
  código).
- **"Gerar código"** pede ao servidor o próximo código interno: EAN-13 que
  começa com **"20"**, 10 dígitos de sequência (`EmporioCounter`, chave
  `codigo_de_barras`) e o dígito verificador. Pula o número que já estiver em
  uma apresentação ativa. O botão só preenche o campo; grava ao salvar o
  painel, como os outros campos.
- Editar o código é trocar o valor (provisório pelo oficial). Registra no
  Histórico com antes e depois, como o resto da apresentação.
- Enter no campo do código **não envia o painel** (o leitor manda Enter depois
  dos números; minha chamada).

### O balcão com leitor

- O leitor USB funciona como teclado: digita o código na **busca de produto**
  e aperta Enter. Por isso tudo é testável sem o aparelho.
- O catálogo do balcão passa a trazer o `barcode` de cada apresentação.
- **Enter na busca:** se o texto (aparado, 12 dígitos viram 13 com o 0) é
  **exatamente** o código de uma apresentação ativa, o produto entra **nessa
  apresentação**, com o mesmo efeito de tocar no resultado: linha nova com
  quantidade 1, ou **mais 1** na linha que já tem essa apresentação (o
  comportamento de hoje). A busca limpa e o foco fica nela, pronta para a
  próxima leitura.
- Sem preço nesta loja: o aviso de hoje ("sem preço nesta loja").
- Só dígitos (8 a 14) que não casam com código nenhum: "Nenhum produto com o
  código 789...". A busca por nome, marca e código interno continua igual, e
  digitar parte do código de barras também acha o produto.
- Vale no modo Venda, no Orçamento, na troca e no editar venda (o mesmo
  componente).

### Atalhos do balcão (só no computador)

- Ações e teclas padrão:

| ação | padrão | o que faz |
|---|---|---|
| Produto | F2 | foco na busca de produto |
| Cliente | F4 | abre o "Escolher cliente" (ou o "Trocar", se já há cliente) |
| Vendedor | F8 | foco no campo Vendedor (quando ele aparece) |
| Pagamento | F9 | foco no primeiro botão de forma de pagamento |
| Fechar | Ctrl+Enter | aciona o botão principal do rodapé: "Fechar a venda", "Salvar a venda nova" ou "Salvar orçamento" |

- O **Esc** que fecha janela e painel continua como é hoje (não é atalho
  configurável).
- Com uma janela ou painel aberto por cima do balcão, os atalhos não agem.
- Ação sem alvo na tela (o Caixa não vê "Vendedor", por exemplo) não faz nada.
- **Legenda** fixa no rodapé do balcão, com as teclas configuradas, só a
  partir da largura de computador (`md`); some no celular e quando desligada
  nas configurações.
- Teclas que o navegador não deixa a página usar ficam fora da lista: F1
  (ajuda), F3 (localizar), F5 (recarregar), F6 (barra de endereço), F7, F10,
  F11, F12, e Shift com letra (escreveria a maiúscula no campo).

### Etiquetas

- Tela nova **"Etiquetas"**, a partir de Produtos (minha chamada:
  `/emporio/produtos/etiquetas`), para quem tem `cadastrar_produto`; a loja
  limitada às lojas da pessoa.
- Escolhe a **loja** (o preço é o da loja), o **formato** (folha A4 ou rolo; o
  padrão vem das configurações) e as **apresentações**, com a quantidade de
  **cópias** de cada uma. Busca por nome e "Selecionar todas".
- A apresentação **sem preço na loja não entra** (aparece desabilitada, "sem
  preço"). A **sem código** entra e sai sem barras (aparece com "sem código").
- **Folha A4:** "começar na etiqueta nº" (para aproveitar folha já usada).
- Cada etiqueta: nome do produto, apresentação, preço da loja ("R$ 89,90"),
  as barras e o número embaixo. Nome longo corta em duas linhas.
- **Imprimir** abre a página de impressão (grupo `(impressao)`, como as
  outras), já com o diálogo do navegador; a medida vem das configurações. A
  impressão vai pelo diálogo do navegador nos dois formatos (a térmica
  aparece como impressora comum, com o driver dela).

### Configurações do Empório (Q361)

Uma seção nova, "Balcão e etiquetas", com a chave `conta` (como as outras
configurações da conta):

- **Atalhos:** a tecla de cada uma das cinco ações, escolhida de uma lista
  fechada de teclas permitidas (F2, F4, F8, F9, Ctrl+Enter, e Alt+1 a Alt+9);
  duas ações com a mesma tecla: 422 no campo da segunda. "Voltar ao padrão".
  Liga e desliga a **legenda**.
- **Etiqueta na folha A4:** colunas, linhas, largura e altura da etiqueta,
  margem de cima e da esquerda, espaço entre colunas e entre linhas, em mm.
  Padrão do modelo de 21 etiquetas (3 x 7, 63,5 x 38,1 mm; margem de cima
  15,15 mm, da esquerda 7,2 mm, 2,5 mm entre colunas, 0 entre linhas).
- **Etiqueta no rolo:** largura e altura da etiqueta, colunas por linha (1 a
  3) e espaço entre colunas. Padrão: 40 x 25 mm, 1 coluna.
- **Formato padrão** da tela de etiquetas: folha ou rolo.
- As medidas são conferidas no servidor (positivas, e a grade da folha cabe
  nos 210 x 297 mm do A4), com recusa no campo.

### Contrato e documentação

- `barcode` na apresentação (criar, editar, GET do produto e do catálogo).
- `POST /api/v1/emporio/presentations/barcode` (minha chamada; o nome final
  é do plano) devolve `{ barcode }`, o próximo código interno, sem gravar.
- Os campos novos de configuração no GET e no PATCH de configurações.
- `/docs/api` atualizado.

## Fora do escopo

- Balança que imprime etiqueta com o peso dentro do código (granel pesado na
  hora): outro aparelho, outra integração.
- Código de 14 números das caixas fechadas (DUN-14) e outros padrões de barras
  (Code 128, ITF, QR).
- Vários códigos por apresentação (caminho B).
- Impressão direta na térmica sem o diálogo do navegador (ZPL, EPL, agente
  local).
- Atalhos fora do balcão (Caixa, Financeiro, cadastro).
- Leitor no celular pela câmera.

## Anti-objetivos

- Um atalho que **feche a venda sem querer**: o Fechar passa pelas mesmas
  conferências do botão, e não existe atalho de cancelar ou limpar a venda.
- Atalho que **come a letra** digitada num campo, ou que **briga com o
  navegador**.
- Leitura que entra na **apresentação errada** (a padrão em vez da lida).
- Etiqueta que **não bate com a folha** e desperdiça adesivo: a medida segue a
  configuração ao décimo de milímetro.
- Barras que o leitor **não lê**: o desenho segue o padrão EAN à risca.

## Riscos que a validação precisa cobrir

- O Enter do leitor no meio da venda: não pode enviar o formulário nem
  disparar o Fechar.
- Código de 12 dígitos lido de um produto americano casando com o gravado de
  13.
- Duas apresentações tentando o mesmo código ao mesmo tempo (a recusa vale
  também na corrida).
- Desarquivar uma apresentação cujo código foi para outra.
- A grade da folha A4 medida no navegador (posição de cada etiqueta em mm),
  e "começar na etiqueta nº" pulando as certas.
- As barras conferidas contra exemplos conhecidos do padrão EAN-13 e EAN-8, e
  lidas de verdade por um leitor de celular (o usuário pode conferir com um
  aplicativo gratuito de leitura de código de barras).
- Atalho com o foco dentro de um campo de texto (deve agir, sem escrever nada).

## Respostas da revisão (18/11)

Chamadas minhas, a partir das perguntas do revisor:

1. **"Ativa" é apresentação E produto sem arquivar.** O balcão e a etiqueta já
   ignoram produto arquivado (o catálogo filtra). Arquivar o produto solta o
   código; desarquivar o produto confere os códigos das apresentações dele, e
   o repetido dá 409 `BARCODE_IN_USE` (nomeando quem tem o código), sem
   desarquivar.
2. **A corrida é tratada na action**, com `runSerializableTenantTransaction`
   (o padrão do projeto), sem índice parcial novo: o `schema.prisma` não
   representa índice parcial, e já são dois que o `migrate diff` tenta
   derrubar. Índice comum `[tenant_id, barcode]` para a busca.
3. **Código digitado que começa com "20" é aceito** (pode ser um provisório
   escrito à mão). O gerador pula qualquer código já usado em apresentação
   ativa, então não colide.
4. **O `barcode` é visível a quem vê o produto** (catálogo do balcão, GET do
   produto). Só gravar exige `cadastrar_produto`.
5. **O Ctrl+Enter vale em qualquer foco**, inclusive na busca, e passa pelas
   mesmas conferências do botão. O leitor manda Enter, não Ctrl+Enter. O
   Enter com o foco no botão "Fechar a venda" é o de hoje (aciona o botão).
6. **Configurações em colunas** de `EmporioSettings`, não JSON: cada campo tem
   recusa própria (conferência 15 do `check`).
7. **Etiquetas sem nada a imprimir** (nenhuma apresentação com preço na loja):
   a tela mostra o estado vazio "Nenhum produto com preço nesta loja".

## Validação

Suíte escrita da spec (código, unicidade, geração, configurações, catálogo),
roteiro de navegador provado nos dois sentidos (leitura simulada pela busca,
teclas reais pelo navegador, impresso medido em mm), juiz, manual com as
tarefas novas (cadastrar e gerar código, vender com leitor, imprimir
etiquetas, configurar) e merge com autorização.
