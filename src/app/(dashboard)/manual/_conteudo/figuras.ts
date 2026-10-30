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

export type PapelDaFigura = "dono" | "gerente_geral" | "gestor" | "vendedor";

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
      { numero: 2, alvo: "a coluna Função na lista", texto: "Dono, Gerente geral, Gestor ou Vendedor." },
      { numero: 3, alvo: "a coluna das lojas", texto: "As lojas em que a pessoa trabalha." },
      { numero: 4, alvo: "o aviso de assentos em uso, embaixo do título", texto: "Quantas pessoas o seu plano ainda comporta." },
    ],
  },
  {
    id: "equipe-cadastrar",
    pagina: "/emporio/equipe",
    papel: "dono",
    legenda: "Cadastrando um Vendedor e ligando as permissões extras",
    alt: "Painel Cadastrar pessoa com nome, email, função, lojas e as chaves de permissão",
    marcas: [
      { numero: 1, alvo: "o campo Função", texto: "Escolha Gestor ou Vendedor. A função vale para todas as lojas da pessoa." },
      { numero: 2, alvo: "a lista de lojas", texto: "Marque as lojas em que ela trabalha." },
      { numero: 3, alvo: "a seção Chaves (Devolver e trocar, Lançar compra e as outras)", texto: "Todas começam desligadas. Ligue só o que a pessoa merece." },
      { numero: 4, alvo: "o botão de salvar do painel", texto: "Cria a pessoa e conta um assento do plano." },
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
      { numero: 2, alvo: "o campo Unidade-base (Saca, Fardo, kg, L ou unidade)", texto: "Como o estoque é contado." },
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
    alt: "Tela Vender com a busca de produto, os itens da venda e o total",
    marcas: [
      { numero: 1, alvo: "o campo de busca de produto", texto: "Digite o nome, a marca ou o código." },
      { numero: 2, alvo: "a lista de itens da venda", texto: "Mude a quantidade ou o preço de cada item aqui." },
      { numero: 3, alvo: "o campo Preço do item", texto: "Digite um preço menor que o sugerido para dar desconto. Até o limite da loja. Acima dele, só o Gestor ou o Dono." },
      { numero: 4, alvo: "o total da venda", texto: "O que o cliente vai pagar." },
    ],
  },
  {
    id: "balcao-pagamento",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "Como o cliente paga: dinheiro, PIX, cartão, cheque e fiado",
    alt: "Parte de baixo da tela Vender com os botões de forma de pagamento e o quanto falta pagar",
    marcas: [
      { numero: 1, alvo: "os botões de forma de pagamento (Dinheiro, PIX, Débito, Crédito, Parcelado, Cheque)", texto: "Você pode dividir a venda em mais de uma forma." },
      { numero: 2, alvo: "o valor em cada forma", texto: "A soma precisa fechar o total." },
      { numero: 3, alvo: "o campo Cliente", texto: "Fiado exige cliente cadastrado." },
      { numero: 4, alvo: "o botão Fechar a venda", texto: "Grava a venda, tira do estoque e lança o dinheiro." },
    ],
  },
  {
    id: "venda-detalhe",
    pagina: "/emporio/vendas/[id]",
    papel: "gestor",
    legenda: "O detalhe de uma venda",
    alt: "Detalhe da venda com itens, pagamentos e os botões Cancelar, Devolver e Trocar",
    marcas: [
      { numero: 1, alvo: "a seção Itens", texto: "O que foi vendido e a que preço." },
      { numero: 2, alvo: "a seção Pagamentos", texto: "Como o cliente pagou, parte por parte." },
      { numero: 3, alvo: "o botão Devolver", texto: "Devolve parte dos itens." },
      { numero: 4, alvo: "o botão Trocar", texto: "Devolve e já faz uma venda nova ligada a esta." },
      { numero: 5, alvo: "o botão Cancelar venda", texto: "Desfaz a venda inteira. É do Gestor e do Dono." },
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
    legenda: "O caixa: a gaveta da loja",
    alt: "Tela Caixa com o saldo da gaveta, a seção Conferir gaveta com o botão Conferir e os movimentos do dia",
    marcas: [
      { numero: 1, alvo: "o saldo da gaveta de cada loja", texto: "O que o sistema acha que deveria ter em dinheiro." },
      { numero: 2, alvo: "o botão Conferir, na seção Conferir gaveta", texto: "Você conta o dinheiro e o sistema compara." },
      { numero: 3, alvo: "a seção Movimentos", texto: "Tudo que entrou e saiu da gaveta." },
    ],
  },
  {
    id: "caixa-conferir",
    pagina: "/emporio/caixa",
    papel: "vendedor",
    legenda: "Conferindo a gaveta",
    alt: "Painel Conferir gaveta com o valor esperado, o valor contado e o campo de justificativa",
    marcas: [
      { numero: 1, alvo: "o valor esperado", texto: "O que o sistema calculou." },
      { numero: 2, alvo: "o campo Valor contado (R$)", texto: "O que você contou na gaveta." },
      { numero: 3, alvo: "o campo Motivo da diferença", texto: "Obrigatório quando os dois valores não batem." },
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
      { numero: 3, alvo: "o botão Transferir entre caixas", texto: "Leva dinheiro da gaveta para o banco." },
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
];

const PORTA_DE_BUSCA = new Map(FIGURAS.map((f) => [f.id, f]));

export function figuraPorId(id: string): Figura {
  const f = PORTA_DE_BUSCA.get(id);
  if (!f) throw new Error(`Figura do manual inexistente: ${id}`);
  return f;
}
