/**
 * As figuras do capítulo do Meu Empório: o contrato com quem tira os prints.
 *
 * `id` vira o arquivo: `public/manual/emporio/<id>.png` (computador) e
 * `<id>-celular.png` (390 px). `pagina` é a rota do Tibé que o roteiro abre,
 * `papel` é quem precisa estar logado, e cada marca descreve em palavras o
 * elemento a numerar (`alvo`) e o que o número explica (`texto`).
 *
 * Os prints saem do cenário fictício (o repositório é público): nunca de dado
 * de cliente. Enquanto a imagem não existe, a página mostra o quadro "Imagem em
 * preparação" com a mesma legenda.
 */

export type PapelDaFigura = "dono" | "gerente_geral" | "gestor" | "vendedor" | "caixa";

export type MarcaDaFigura = {
  numero: number;
  /** O elemento da tela, em palavras, para quem tira o print achar. */
  alvo: string;
  /** O que o número explica ao leitor. */
  texto: string;
};

export type Figura = {
  id: string;
  pagina: string;
  papel: PapelDaFigura;
  legenda: string;
  alt: string;
  marcas: MarcaDaFigura[];
};

export const FIGURAS: Figura[] = [
  {
    id: "inicio-primeiros-passos",
    pagina: "/emporio",
    papel: "dono",
    legenda: "O início do Meu Empório, com os primeiros passos",
    alt: "Tela inicial do Meu Empório com o cartão Primeiros passos e os cartões das áreas",
    marcas: [
      { numero: 1, alvo: "o cartão Primeiros passos", texto: "A lista do que falta para os números da loja ficarem confiáveis. Cada item abre o formulário certo." },
      { numero: 2, alvo: "a marca Pendente de um item", texto: "Pendente é o que ainda falta fazer. Feito já está pronto." },
      { numero: 3, alvo: "os cartões das áreas (Estoque, Vendas, Caixa e outros)", texto: "Atalhos para as áreas do dia a dia." },
    ],
  },
  {
    id: "equipe-lista",
    pagina: "/emporio/equipe",
    papel: "dono",
    legenda: "A Equipe: quem trabalha nas suas lojas",
    alt: "Tela Equipe com a lista de pessoas, a função e as lojas de cada uma",
    marcas: [
      { numero: 1, alvo: "o botão Cadastrar pessoa", texto: "Abre o formulário para convidar alguém." },
      { numero: 2, alvo: "a coluna Função na lista", texto: "Dono, Gerente geral, Gestor, Vendedor ou Caixa." },
      { numero: 3, alvo: "a coluna das lojas", texto: "As lojas em que a pessoa trabalha." },
      { numero: 4, alvo: "o aviso de assentos em uso, embaixo do título", texto: "Quantas pessoas o seu plano ainda comporta." },
    ],
  },
  {
    id: "equipe-cadastrar",
    pagina: "/emporio/equipe",
    papel: "dono",
    legenda: "Cadastrando um Vendedor e ligando as chaves",
    alt: "Painel Cadastrar pessoa com nome, email, telefone, função, lojas e as chaves",
    marcas: [
      { numero: 1, alvo: "o campo Função", texto: "Gerente geral, Gestor, Vendedor ou Caixa. A função vale para todas as lojas da pessoa." },
      { numero: 2, alvo: "o campo Lojas", texto: "Marque as lojas em que ela trabalha. Gestor, Vendedor e Caixa precisam de pelo menos uma." },
      { numero: 3, alvo: "o campo Chaves, que só aparece para o Vendedor", texto: "Tudo começa desligado. Ligue só o que a pessoa merece." },
      { numero: 4, alvo: "o botão Cadastrar", texto: "Cria a pessoa, conta um assento do plano e mostra a senha temporária uma vez." },
    ],
  },
  {
    id: "estabelecimentos-lista",
    pagina: "/emporio/estabelecimentos",
    papel: "dono",
    legenda: "Suas lojas",
    alt: "Tela Estabelecimentos com a lista de lojas e os botões Editar, Quem trabalha aqui e Arquivar",
    marcas: [
      { numero: 1, alvo: "o botão Novo estabelecimento", texto: "Cria uma loja nova. Só o Dono e o Gerente geral fazem isso." },
      { numero: 2, alvo: "o nome de uma loja na lista", texto: "Cada linha é uma loja. O botão Editar abre os dados dela, como o desconto máximo." },
      { numero: 3, alvo: "o botão Quem trabalha aqui", texto: "Escolhe quem trabalha na loja. As contas bancárias e o PIX ficam no Caixa." },
    ],
  },
  {
    id: "produto-novo",
    pagina: "/emporio/produtos",
    papel: "gestor",
    legenda: "Cadastrando um produto vendido em saca",
    alt: "Painel de novo produto com nome, medida, conteúdo, marca, código e espécie",
    marcas: [
      { numero: 1, alvo: "o campo Nome", texto: "O nome que aparece no balcão." },
      { numero: 2, alvo: "o campo Unidade-base (Quilo, Litro, Metro, Unidade, Saca ou Fardo)", texto: "Como o estoque é contado." },
      { numero: 3, alvo: "o campo Quanto pesa ou quanto cabe em uma saca", texto: "Quanto pesa ou quantos litros cabem em uma saca ou fardo." },
      { numero: 4, alvo: "os campos Marca, Código interno e Espécie (dentro de Mais dados)", texto: "Ajudam a separar produtos parecidos e a achar no balcão." },
    ],
  },
  {
    id: "produto-apresentacoes",
    pagina: "/emporio/produtos/[id]",
    papel: "gestor",
    legenda: "As apresentações de um produto: a saca fechada e o granel",
    alt: "Tela do produto com a seção Apresentações mostrando saca fechada e quilo a granel",
    marcas: [
      { numero: 1, alvo: "a seção Apresentações", texto: "Cada jeito de vender o produto." },
      { numero: 2, alvo: "a apresentação da saca fechada", texto: "Vende a embalagem lacrada inteira." },
      { numero: 3, alvo: "a apresentação a granel (Quilo, 1 kg)", texto: "Vende uma parte. A saca abre sozinha quando faltar avulso." },
      { numero: 4, alvo: "o botão Nova apresentação", texto: "Cria outra forma de vender." },
    ],
  },
  {
    id: "produto-preco-por-loja",
    pagina: "/emporio/produtos/[id]",
    papel: "gestor",
    legenda: "O preço de cada apresentação, loja por loja",
    alt: "Seção Preço por loja com o preço atual e o preço sugerido de cada apresentação",
    marcas: [
      { numero: 1, alvo: "a seção Preço por loja", texto: "Cada loja tem o seu preço." },
      { numero: 2, alvo: "a coluna Sugerido", texto: "Calculado do custo mais os percentuais. Ele nunca muda o preço sozinho." },
      { numero: 3, alvo: "a coluna Preço (o preço atual)", texto: "Você decide se aceita o sugerido." },
    ],
  },
  {
    id: "compra-nova",
    pagina: "/emporio/compras",
    papel: "gestor",
    legenda: "Lançando uma compra de mercadoria",
    alt: "Painel Nova compra com fornecedor, itens, frete e forma de pagamento",
    marcas: [
      { numero: 1, alvo: "o campo Fornecedor", texto: "Opcional. Escolha de Contatos." },
      { numero: 2, alvo: "a lista de itens (produto, quantidade, valor total do item)", texto: "Digite o valor total de cada item, não o valor por unidade." },
      { numero: 3, alvo: "o campo Frete (R$)", texto: "É dividido entre os itens pelo valor de cada um." },
      { numero: 4, alvo: "a caixa Já recebi a mercadoria", texto: "Se ainda não chegou, a conta a pagar nasce hoje e o estoque entra quando você receber." },
    ],
  },
  {
    id: "compra-receber",
    pagina: "/emporio/compras",
    papel: "vendedor",
    legenda: "Recebendo uma compra que chegou",
    alt: "Lista de compras com uma compra pendente e o botão Receber",
    marcas: [
      { numero: 1, alvo: "a situação Pendente da compra", texto: "Mercadoria que ainda não entrou no estoque." },
      { numero: 2, alvo: "o botão Receber", texto: "Confirma que chegou tudo. O estoque entra na hora." },
    ],
  },
  {
    id: "estoque-por-loja",
    pagina: "/emporio/produtos/[id]",
    papel: "gestor",
    legenda: "O estoque de um produto em uma loja, com lacrado e avulso",
    alt: "Cartão da loja na tela do produto, com o saldo lacrado e avulso e os botões Contar estoque e Registrar perda",
    marcas: [
      { numero: 1, alvo: "o cartão da Loja Centro, na seção Estoque por loja", texto: "Cada loja tem o seu saldo. Para ver outra loja, olhe o cartão dela." },
      { numero: 2, alvo: "Lacrado e Avulso", texto: "Quantas embalagens fechadas e quanto solto você tem." },
      { numero: 3, alvo: "o botão Contar estoque", texto: "Corrige o saldo pelo que você contou na prateleira." },
      { numero: 4, alvo: "o botão Registrar perda", texto: "Registra o que venceu, estragou ou sumiu, com o motivo." },
    ],
  },
  {
    id: "estoque-precisa-repor",
    pagina: "/emporio/estoque",
    papel: "dono",
    legenda: "A lista Precisa repor",
    alt: "Seção Precisa repor com os produtos abaixo do mínimo e a quantidade sugerida de compra",
    marcas: [
      { numero: 1, alvo: "a seção Precisa repor", texto: "Produtos com saldo abaixo do mínimo." },
      { numero: 2, alvo: "a coluna Sugestão", texto: "Quanto falta para chegar ao máximo, já contando compras que ainda não chegaram." },
      { numero: 3, alvo: "o botão Encaminhar à Lista", texto: "Manda o item para a Lista de Compra. Só o Dono e o Gerente geral veem esse botão." },
    ],
  },
  {
    id: "transferencia-nova",
    pagina: "/emporio/transferencias",
    papel: "gestor",
    legenda: "Enviando mercadoria para outra loja",
    alt: "Painel Nova transferência com loja de origem, loja de destino e itens",
    marcas: [
      { numero: 1, alvo: "o campo da loja de destino", texto: "Você envia da sua loja para outra, nunca o contrário." },
      { numero: 2, alvo: "a lista de itens", texto: "Escolha o produto e quanto vai, lacrado e avulso separados." },
      { numero: 3, alvo: "o botão de enviar", texto: "A mercadoria sai do seu estoque e fica em trânsito." },
    ],
  },
  {
    id: "transferencia-receber",
    pagina: "/emporio/transferencias",
    papel: "vendedor",
    legenda: "Recebendo uma transferência",
    alt: "Painel Receber transferência com o que foi enviado e o campo Chegou de cada item",
    marcas: [
      { numero: 1, alvo: "o texto Veio de..., no alto do painel", texto: "A loja de onde a mercadoria saiu, a caminho da sua loja." },
      { numero: 2, alvo: "o campo Chegou, em cada item", texto: "Digite o que chegou de verdade. Se for menos, o Gestor resolve." },
      { numero: 3, alvo: "o botão Confirmar recebimento", texto: "Se chegou tudo, o estoque entra na hora." },
    ],
  },
  {
    id: "transferencia-aguardando-gestor",
    pagina: "/emporio/transferencias",
    papel: "gestor",
    legenda: "Transferência que chegou com diferença, aguardando o Gestor",
    alt: "Painel Resolver diferença com o resumo do que saiu e do que chegou, as duas saídas e o campo Motivo",
    marcas: [
      { numero: 1, alvo: "o resumo do que saiu e do que chegou", texto: "Chegou menos do que saiu, e nada entrou no estoque ainda." },
      { numero: 2, alvo: "o campo O que aconteceu?", texto: "As duas saídas: Perda no caminho (a perda fica registrada) e Não foi enviada (a mercadoria volta para a origem)." },
      { numero: 3, alvo: "o campo Motivo", texto: "Obrigatório. Fica gravado no Histórico." },
    ],
  },
  {
    id: "balcao-venda",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "O balcão: montando uma venda",
    alt: "Tela Vender com Venda e Orçamento no alto, a loja, a busca de produto, os itens da venda e o total",
    marcas: [
      { numero: 1, alvo: "o campo Buscar por nome, marca ou código", texto: "Digite o nome, a marca ou o código e toque no produto para adicionar." },
      { numero: 2, alvo: "um item da venda, com a quantidade, o preço e o Preço sugerido embaixo", texto: "Mude a quantidade ou o preço de cada item aqui." },
      { numero: 3, alvo: "o campo Preço do item", texto: "Digite um preço menor que o sugerido para dar desconto. Até o limite da loja. Acima dele, só o Gestor ou o Dono." },
      { numero: 4, alvo: "o Total da venda, no rodapé", texto: "O que o cliente vai pagar." },
    ],
  },
  {
    id: "balcao-pagamento",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "Como o cliente paga: dinheiro, PIX, cartão, cheque e fiado",
    alt: "Parte de baixo da tela Vender com o Cliente, os botões de pagamento, o quanto falta pagar e o botão Fechar a venda",
    marcas: [
      { numero: 1, alvo: "o campo Cliente", texto: "Obrigatório. Quem não se identifica entra como Consumidor final, que não compra fiado nem paga em cheque." },
      { numero: 2, alvo: "os botões + Dinheiro, + PIX, + Débito, + Crédito, + Parcelado, + Cheque e + Fiado", texto: "Você pode dividir a venda em mais de uma forma." },
      { numero: 3, alvo: "o valor em cada forma e a linha de baixo (Falta, Troco ou Pagamento fechado)", texto: "A soma precisa fechar o total." },
      { numero: 4, alvo: "o botão Fechar a venda", texto: "Grava a venda no caixa aberto, tira do estoque e lança o dinheiro." },
    ],
  },
  {
    id: "venda-detalhe",
    pagina: "/emporio/vendas/[id]",
    papel: "gestor",
    legenda: "O detalhe de uma venda",
    alt: "Detalhe da venda com o número, o vendedor, os botões de imprimir, Devolver, Trocar e Cancelar venda, os itens e os pagamentos",
    marcas: [
      { numero: 1, alvo: "o título Venda nº e a linha Vendedor", texto: "O número da venda e quem atendeu. Registrada por aparece quando outra pessoa registrou." },
      { numero: 2, alvo: "os botões Imprimir A4 e Imprimir cupom", texto: "Imprimem a venda de novo, a qualquer momento." },
      { numero: 3, alvo: "as seções Itens e Pagamentos", texto: "O que foi vendido, a que preço e como o cliente pagou." },
      { numero: 4, alvo: "o botão Devolver", texto: "Devolve parte dos itens." },
      { numero: 5, alvo: "o botão Trocar", texto: "Devolve e já faz uma venda nova ligada a esta." },
      { numero: 6, alvo: "o botão Cancelar venda", texto: "Desfaz a venda inteira. É do Gestor e do Dono." },
    ],
  },
  {
    id: "fiado-lista",
    pagina: "/emporio/fiado",
    papel: "vendedor",
    legenda: "O fiado: quem deve e quanto",
    alt: "Tela Fiado com os clientes devedores, o total devido e o botão Receber",
    marcas: [
      { numero: 1, alvo: "a linha de um cliente", texto: "O total que ele deve, somando todas as vendas em aberto." },
      { numero: 2, alvo: "a marca de vencido", texto: "O fiado que já passou da data combinada." },
      { numero: 3, alvo: "o botão Receber", texto: "Abre o painel para registrar o pagamento." },
    ],
  },
  {
    id: "fiado-receber",
    pagina: "/emporio/fiado",
    papel: "vendedor",
    legenda: "Recebendo um pagamento de fiado",
    alt: "Painel Receber fiado com o valor, a forma de pagamento e as vendas abatidas",
    marcas: [
      { numero: 1, alvo: "o campo Valor", texto: "Pode ser menos do que o cliente deve." },
      { numero: 2, alvo: "a forma de pagamento", texto: "Dinheiro entra na gaveta. PIX entra na conta bancária." },
      { numero: 3, alvo: "o botão de salvar", texto: "Abate da dívida mais antiga primeiro." },
    ],
  },
  {
    id: "caixa-gaveta",
    pagina: "/emporio/caixa",
    papel: "vendedor",
    legenda: "O caixa: os caixas de cada loja",
    alt: "Tela Caixa com os caixas de cada loja, aberto ou fechado, os botões Sangria, Conferir e Encerrar na linha do caixa aberto e os movimentos",
    marcas: [
      { numero: 1, alvo: "a linha de um caixa (Caixa 1), com o saldo e a marca Aberto ou Fechado", texto: "Cada caixa é uma gaveta, com o saldo que o sistema calculou. No aberto, a tela diz quem abriu e desde quando." },
      { numero: 2, alvo: "os botões Sangria, Conferir e Encerrar, na linha do caixa aberto", texto: "O que se faz durante o turno. No caixa fechado, aparece o botão Abrir." },
      { numero: 3, alvo: "a seção Movimentos", texto: "Tudo que entrou e saiu dos caixas." },
    ],
  },
  {
    id: "caixa-conferir",
    pagina: "/emporio/caixa",
    papel: "vendedor",
    legenda: "Conferindo o caixa no meio do turno",
    alt: "Painel Conferir o Caixa 1 com o valor que o sistema espera, o Valor contado e o Motivo da diferença",
    marcas: [
      { numero: 1, alvo: "a frase O sistema espera R$ ... na gaveta", texto: "O que o sistema calculou." },
      { numero: 2, alvo: "o campo Valor contado (R$)", texto: "O que você contou no caixa." },
      { numero: 3, alvo: "o campo Motivo da diferença", texto: "Obrigatório quando os dois valores não batem." },
      { numero: 4, alvo: "o botão Registrar conferência", texto: "Grava a conferência. O turno continua aberto." },
    ],
  },
  {
    id: "caixa-cartao-cheques",
    pagina: "/emporio/caixa",
    papel: "gestor",
    legenda: "Cartão a receber e cheques na carteira",
    alt: "Seções A receber do cartão e Cheques da tela Caixa",
    marcas: [
      { numero: 1, alvo: "a seção A receber do cartão", texto: "Parcelas que ainda não caíram na conta, com data e valor líquido." },
      { numero: 2, alvo: "a seção Cheques", texto: "Cheques recebidos, depositados, compensados e devolvidos." },
      { numero: 3, alvo: "o botão Transferir dinheiro", texto: "Leva o dinheiro que está com a gerência para o banco." },
    ],
  },
  {
    id: "despesas-fixas",
    pagina: "/emporio/despesas",
    papel: "gestor",
    legenda: "Despesas fixas e Vendeu, Pagou",
    alt: "Tela Despesas com a lista de despesas fixas e as regras de Vendeu, Pagou",
    marcas: [
      { numero: 1, alvo: "o botão Nova despesa fixa", texto: "Aluguel, luz, salário. Gera as contas dos próximos 12 meses." },
      { numero: 2, alvo: "a coluna Rateio da lista", texto: "Mostra como a despesa é dividida entre as lojas, em percentual ou em reais." },
      { numero: 3, alvo: "a seção Vendeu, Pagou", texto: "Despesas que nascem junto com a venda, como comissão e entrega." },
      { numero: 4, alvo: "a seção Contas a pagar", texto: "O que vence e o botão para pagar várias de uma vez." },
    ],
  },
  {
    id: "resultado-loja",
    pagina: "/emporio/resultado",
    papel: "gestor",
    legenda: "O resultado da loja no mês",
    alt: "Tela Resultado da loja com vendas, custo, margem, perdas, despesas fixas e resultado",
    marcas: [
      { numero: 1, alvo: "o seletor de loja e de mês", texto: "Escolha o recorte. Todas as lojas só o Dono e o Gerente geral veem." },
      { numero: 2, alvo: "as linhas de vendas, custo e margem", texto: "O que sobrou das vendas depois do custo." },
      { numero: 3, alvo: "a linha de perdas e quebras", texto: "Aparece separada para você ver quanto custou." },
      { numero: 4, alvo: "o aviso Este resultado é uma estimativa", texto: "Aparece quando algum custo está provisório ou falta, ou quando há conta fixa ainda não paga. Ele diz o motivo." },
    ],
  },
  {
    id: "resultado-equilibrio",
    pagina: "/emporio/resultado",
    papel: "gestor",
    legenda: "O ponto de equilíbrio e os produtos do mês",
    alt: "Ponto de equilíbrio, os produtos que mais dão margem e as vendas com margem negativa",
    marcas: [
      { numero: 1, alvo: "o ponto de equilíbrio", texto: "Quanto a loja precisa vender no mês para cobrir as despesas fixas." },
      { numero: 2, alvo: "a frase que diz se o ponto foi batido ou quanto falta", texto: "Compara o que você vendeu com o ponto de equilíbrio." },
      { numero: 3, alvo: "a lista Mais dão margem", texto: "Os produtos que mais deixam dinheiro no mês." },
      { numero: 4, alvo: "a lista Vendas com margem negativa", texto: "Vendas que deram prejuízo, com a causa mais provável." },
    ],
  },
  {
    id: "historico-filtros",
    pagina: "/emporio/historico",
    papel: "dono",
    legenda: "O Histórico: quem fez o quê",
    alt: "Tela Histórico com os filtros e a lista de ações com pessoa, data, loja e o antes e o depois",
    marcas: [
      { numero: 1, alvo: "os filtros de pessoa, loja, período e ação", texto: "Estreitam a lista." },
      { numero: 2, alvo: "uma linha da lista", texto: "Quem fez, quando, em que loja e o quê." },
      { numero: 3, alvo: "o antes e o depois de uma edição", texto: "Mostra o que mudou, por exemplo um preço." },
    ],
  },
  // As figuras das entregas de impressão, caixa com turno, vendedor e orçamento.
  {
    id: "configuracoes-impressao",
    pagina: "/emporio/configuracoes",
    papel: "dono",
    legenda: "Configurações: a impressão, a validade do orçamento e o logo",
    alt: "Tela Configurações com a seção Impressão e orçamento, o botão Editar e o logo",
    marcas: [
      { numero: 1, alvo: "a seção Impressão e orçamento (Validade do orçamento, Largura da bobina, Rodapé do orçamento, Rodapé da venda)", texto: "Vale para todas as lojas da conta." },
      { numero: 2, alvo: "o botão Editar da seção", texto: "Só o Dono e o Gerente geral veem. O Gestor só lê." },
      { numero: 3, alvo: "o logo e o botão Enviar logo (ou Trocar logo)", texto: "PNG ou JPEG, até 200 KB. Sai no papel A4. A bobina sai sem logo." },
    ],
  },
  {
    id: "configuracoes-loja",
    pagina: "/emporio/configuracoes",
    papel: "dono",
    legenda: "Configurações: o cabeçalho de cada loja e os caixas dela",
    alt: "Cartão de uma loja em Cabeçalho das lojas, com CNPJ, endereço, telefone, WhatsApp, o botão Editar e a lista Caixas com o botão Novo caixa",
    marcas: [
      { numero: 1, alvo: "o cartão da loja, com CNPJ, Endereço, Telefone e WhatsApp", texto: "O que sai no alto do papel da venda e do orçamento." },
      { numero: 2, alvo: "o botão Editar do cartão", texto: "Abre os dados da loja. O Gestor da loja também edita." },
      { numero: 3, alvo: "a lista Caixas, com Aberto por ou Fechado", texto: "Os caixas da loja. Toda loja nasce com o Caixa 1." },
      { numero: 4, alvo: "o botão Novo caixa", texto: "Cria o próximo caixa da loja: Caixa 2, Caixa 3." },
    ],
  },
  {
    id: "equipe-caixa",
    pagina: "/emporio/equipe",
    papel: "dono",
    legenda: "Cadastrando uma pessoa com a função Caixa",
    alt: "Painel Cadastrar pessoa com a Função Caixa escolhida e o campo Lojas, sem o campo Chaves",
    marcas: [
      { numero: 1, alvo: "o campo Função, com Caixa escolhido", texto: "O Caixa recebe o pagamento e opera o caixa. Não vende em nome próprio." },
      { numero: 2, alvo: "o campo Lojas", texto: "Obrigatório. Marque as lojas em que ele trabalha." },
      { numero: 3, alvo: "o lugar onde ficaria o campo Chaves", texto: "O Caixa não tem chaves: o campo nem aparece." },
    ],
  },
  {
    id: "caixa-abrir",
    pagina: "/emporio/caixa",
    papel: "caixa",
    legenda: "Abrindo o caixa: contar o troco",
    alt: "Painel Abrir o Caixa 1 com o Reforço da gerência, o valor que o sistema espera, o Troco contado e o Motivo da diferença",
    marcas: [
      { numero: 1, alvo: "o campo Reforço da gerência (R$)", texto: "Opcional. Para quando falta troco: o dinheiro sai de Com a gerência e entra no caixa." },
      { numero: 2, alvo: "a frase O sistema espera R$ ... no caixa", texto: "O troco que ficou do turno anterior, mais o reforço." },
      { numero: 3, alvo: "o campo Troco contado (R$)", texto: "Conte tudo o que está na gaveta, com o reforço, e digite aqui." },
      { numero: 4, alvo: "o campo Motivo da diferença", texto: "Obrigatório quando o contado não bate com o esperado." },
    ],
  },
  {
    id: "caixa-sangria",
    pagina: "/emporio/caixa",
    papel: "caixa",
    legenda: "Sangria: tirar o excesso de dinheiro do caixa",
    alt: "Painel Sangria do Caixa 1 com o Valor retirado, a Observação e o botão Registrar sangria",
    marcas: [
      { numero: 1, alvo: "o campo Valor retirado (R$)", texto: "Não passa do que está no caixa." },
      { numero: 2, alvo: "o campo Observação", texto: "Opcional. Por exemplo, notas de 100." },
      { numero: 3, alvo: "o botão Registrar sangria", texto: "O dinheiro sai do caixa e fica aguardando o gerente confirmar." },
    ],
  },
  {
    id: "caixa-encerrar",
    pagina: "/emporio/caixa",
    papel: "caixa",
    legenda: "Encerrando o turno: contar, separar o malote e deixar o troco",
    alt: "Painel Encerrar o Caixa 1 com o valor esperado, o Valor contado, o Malote e o troco que fica no caixa",
    marcas: [
      { numero: 1, alvo: "o campo Valor contado (R$)", texto: "Tudo o que está na gaveta." },
      { numero: 2, alvo: "o campo Malote (R$)", texto: "O que vai para o gerente. Não passa do contado." },
      { numero: 3, alvo: "a frase Troco que fica no caixa", texto: "O resto fica na gaveta para o próximo turno." },
      { numero: 4, alvo: "o botão Encerrar o turno", texto: "Encerra e mostra os botões Relatório A4 e Relatório na bobina." },
    ],
  },
  {
    id: "caixa-entregas",
    pagina: "/emporio/caixa",
    papel: "gestor",
    legenda: "O dinheiro que chega ao gerente: Aguardando o gerente",
    alt: "Seção Aguardando o gerente com as sangrias e os malotes e os botões Confirmar e Relatório do turno",
    marcas: [
      { numero: 1, alvo: "uma linha da seção Aguardando o gerente (Sangria ou Malote do Caixa N)", texto: "Dinheiro que saiu do caixa e ainda não foi confirmado." },
      { numero: 2, alvo: "o botão Confirmar", texto: "Abre o painel para digitar o Valor recebido (R$)." },
      { numero: 3, alvo: "o botão Relatório do turno", texto: "O fechamento do caixa que mandou o dinheiro." },
      { numero: 4, alvo: "a linha Com a gerência, no cartão da loja", texto: "O dinheiro que você já confirmou. Daqui ele vai ao banco por Transferir dinheiro." },
    ],
  },
  {
    id: "balcao-cliente-vendedor",
    pagina: "/emporio/vender",
    papel: "caixa",
    legenda: "No balcão do Caixa: o cliente e o vendedor que atendeu",
    alt: "Tela Vender com o campo Cliente, o botão Cliente novo e o campo Vendedor obrigatório",
    marcas: [
      { numero: 1, alvo: "o campo Cliente", texto: "Obrigatório. Consumidor final é o primeiro da lista." },
      { numero: 2, alvo: "o botão Cliente novo", texto: "Cadastra na hora: tipo, nome, CPF ou CNPJ e telefone." },
      { numero: 3, alvo: "o campo Vendedor", texto: "Para o Caixa, obrigatório e vazio a cada venda. Escolha quem atendeu." },
      { numero: 4, alvo: "o botão Fechar a venda", texto: "Grava a venda no caixa aberto." },
    ],
  },
  {
    id: "venda-impressa",
    pagina: "/emporio/imprimir/venda/[id]",
    papel: "vendedor",
    legenda: "A venda no papel A4",
    alt: "Papel A4 da venda com o logo e os dados da loja, o título VENDA com o número, o cliente, os itens, os pagamentos e o rodapé",
    marcas: [
      { numero: 1, alvo: "o logo e os dados da loja, no alto à esquerda", texto: "Vêm de Configurações." },
      { numero: 2, alvo: "o título VENDA, com o número e a data", texto: "O mesmo número da Venda nº da tela." },
      { numero: 3, alvo: "o rodapé, com Vendedor e Documento sem valor fiscal.", texto: "O papel não é nota fiscal." },
      { numero: 4, alvo: "o botão Imprimir", texto: "Abre a impressão do navegador. Para PDF, escolha Salvar como PDF." },
    ],
  },
  {
    id: "orcamento-balcao",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "Montando um orçamento no balcão",
    alt: "Tela Vender no modo Orçamento, com os itens, o cliente, a Observação e os botões Faturar e Salvar orçamento",
    marcas: [
      { numero: 1, alvo: "o botão Orçamento, no alto da tela", texto: "Troca a venda pelo orçamento. Não pede pagamento nem caixa." },
      { numero: 2, alvo: "o campo Cliente", texto: "Precisa de nome, CPF ou CNPJ e telefone. Consumidor final não serve." },
      { numero: 3, alvo: "o campo Observação", texto: "Opcional. Fica guardada no orçamento, para quem o abrir depois." },
      { numero: 4, alvo: "os botões Faturar e Salvar orçamento", texto: "Faturar leva os itens para a venda sem salvar. Salvar orçamento guarda com número e validade." },
    ],
  },
  {
    id: "orcamento-salvo",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "O orçamento salvo",
    alt: "Quadro verde Orçamento nº salvo, com a validade, o cliente, os itens e os botões Imprimir A4, Imprimir cupom, Faturar agora e Novo atendimento",
    marcas: [
      { numero: 1, alvo: "a linha Orçamento nº ... salvo, válido até ...", texto: "O número que o cliente leva e a data até quando vale o preço." },
      { numero: 2, alvo: "Imprimir A4 e Imprimir cupom", texto: "O papel para entregar ao cliente." },
      { numero: 3, alvo: "o botão Faturar agora", texto: "O cliente já quer levar: o orçamento vai para a venda." },
      { numero: 4, alvo: "o botão Novo atendimento", texto: "Limpa o balcão para o próximo cliente." },
    ],
  },
  {
    id: "orcamentos-lista",
    pagina: "/emporio/orcamentos",
    papel: "gestor",
    legenda: "A lista de orçamentos",
    alt: "Tela Orçamentos com os filtros de loja e situação, a busca e a lista com número, cliente, telefone, valor, data, validade, situação e vendedor",
    marcas: [
      { numero: 1, alvo: "o filtro de situação (Em acompanhamento, Em aberto, Vencidos, Faturados, Todos)", texto: "Começa em Em acompanhamento: os abertos e os vencidos, que ainda podem virar venda." },
      { numero: 2, alvo: "a busca Telefone, CPF, CNPJ, nome ou nº e o botão Buscar", texto: "Ache o orçamento pelo que o cliente diz ao telefone." },
      { numero: 3, alvo: "a coluna Situação", texto: "Aberto, Vencido ou Faturado (com o número da venda)." },
      { numero: 4, alvo: "o botão Ver de uma linha", texto: "Abre o orçamento, com Imprimir A4, Imprimir cupom e, se ainda não foi faturado, Faturar." },
    ],
  },
  {
    id: "orcamento-faturar",
    pagina: "/emporio/vender",
    papel: "caixa",
    legenda: "Faturando um orçamento pelo número",
    alt: "Tela Vender com a faixa Faturando o orçamento nº, os avisos de preço e o campo Vendedor com o vendedor do orçamento",
    marcas: [
      { numero: 1, alvo: "a faixa Faturando o orçamento nº ..., com o cliente, o vendedor e Válido até", texto: "O orçamento carregado. Os itens e o cliente já entraram na venda." },
      { numero: 2, alvo: "os avisos da faixa (O preço mudou, Orçamento vencido, Falta estoque)", texto: "Leia antes de fechar. Eles dizem o preço que vale hoje e o que falta no estoque." },
      { numero: 3, alvo: "o campo Vendedor, com O vendedor do orçamento.", texto: "Vem do orçamento. Ninguém precisa escolher." },
      { numero: 4, alvo: "o botão Tirar orçamento", texto: "Desfaz a carga, se foi o orçamento errado." },
    ],
  },
  {
    id: "relatorios-periodo",
    pagina: "/emporio/relatorios",
    papel: "gestor",
    legenda: "Relatórios: o período, a loja e as vendas por vendedor",
    alt: "Tela Relatórios com os campos De, Até e Loja, os botões Ver relatório e Mês atual e o bloco Vendas por vendedor",
    marcas: [
      { numero: 1, alvo: "os campos De e Até", texto: "O período, com os dois dias inclusos. Até 366 dias." },
      { numero: 2, alvo: "o campo Loja (Todas as minhas lojas)", texto: "Escolha uma loja ou todas as suas. Com uma loja só, ela aparece fixa." },
      { numero: 3, alvo: "os botões Ver relatório e Mês atual", texto: "Mês atual volta para o dia 1 do mês até hoje." },
      { numero: 4, alvo: "o bloco Vendas por vendedor", texto: "Vendas, Total e Ticket médio de cada vendedor. Serve para acertar a comissão." },
    ],
  },
];

const PORTA_DE_BUSCA = new Map(FIGURAS.map((f) => [f.id, f]));

export function figuraPorId(id: string): Figura {
  const f = PORTA_DE_BUSCA.get(id);
  if (!f) throw new Error(`Figura do manual inexistente: ${id}`);
  return f;
}
