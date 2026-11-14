/**
 * As animações do capítulo do Meu Empório: o contrato com quem gera os GIFs.
 *
 * `id` vira o arquivo: `public/manual/emporio/<id>.gif`, e o último quadro vai
 * para `<id>.png` (quem pede menos movimento vê só ele). `pagina` é a rota que o
 * roteiro abre, `papel` é quem precisa estar logado, e cada passo da lista é um
 * passo do GIF, na mesma ordem e na mesma quantidade.
 *
 * Os GIFs saem do cenário fictício (o repositório é público): nunca de dado de
 * cliente. Enquanto o arquivo não existe, a página mostra o quadro "Animação em
 * preparação" com a mesma legenda.
 */

import type { PapelDaFigura } from "./figuras";

export type PassoDaAnimacao = {
  numero: number;
  texto: string;
};

export type Animacao = {
  id: string;
  pagina: string;
  papel: PapelDaFigura;
  legenda: string;
  alt: string;
  passos: PassoDaAnimacao[];
};

export const ANIMACOES: Animacao[] = [
  {
    id: "conta-pix-cadastrar",
    pagina: "/emporio/caixa",
    papel: "dono",
    legenda: "Cadastrar uma conta PIX",
    alt: "Animação do cadastro de uma conta bancária em Caixa, com identificador, banco, CNPJ, favorecido e as lojas onde ela vale para o PIX",
    passos: [
      { numero: 1, texto: "Em Caixa, na seção Contas bancárias, toque em Nova conta." },
      { numero: 2, texto: "Dê um identificador e, se quiser, o banco, o CNPJ e o favorecido." },
      { numero: 3, texto: "Em Disponível para PIX em, escolha Todas as lojas, Lojas escolhidas ou Não recebe PIX." },
      { numero: 4, texto: "Com Lojas escolhidas, marque as lojas onde a conta vale." },
      { numero: 5, texto: "Toque em Cadastrar conta: a tabela mostra o CNPJ, o favorecido e onde a conta vale." },
    ],
  },
  {
    id: "balcao-conta-pix",
    pagina: "/emporio/vender",
    papel: "vendedor",
    legenda: "Escolher a conta do PIX no balcão",
    alt: "Animação do balcão com um pagamento em PIX, mostrando a conta da loja já marcada, a lista de contas liberadas e o favorecido e o CNPJ embaixo",
    passos: [
      { numero: 1, texto: "Monte a venda e toque em + PIX." },
      { numero: 2, texto: "Em Conta do PIX já vem a conta da loja." },
      { numero: 3, texto: "Para faturar em outra conta, abra a lista: só aparecem as liberadas para a loja." },
      { numero: 4, texto: "Embaixo aparecem o favorecido e o CNPJ, para conferir." },
      { numero: 5, texto: "Feche a venda: o cupom mostra só PIX, e a conta fica na venda e no relatório." },
    ],
  },
  {
    id: "franqueado-cadastrar",
    pagina: "/emporio/franqueados",
    papel: "dono",
    legenda: "Cadastrar um franqueado",
    alt: "Animação do cadastro de um franqueado, com nome e telefone, e o franqueado novo aparecendo na lista com o saldo",
    passos: [
      { numero: 1, texto: "Em Franqueados, toque em Novo franqueado." },
      { numero: 2, texto: "Só o nome e o telefone são obrigatórios." },
      { numero: 3, texto: "Toque em Cadastrar: o franqueado aparece na lista com o saldo." },
    ],
  },
  {
    id: "balcao-credito-franqueado",
    pagina: "/emporio/vender",
    papel: "dono",
    legenda: "O crédito do franqueado na venda",
    alt: "Animação do balcão com um franqueado escolhido e o crédito do franqueado somando ao total da venda",
    passos: [
      { numero: 1, texto: "Monte a venda e escolha o Franqueado." },
      { numero: 2, texto: "Digite o Crédito do franqueado: ele soma ao total que o cliente paga." },
      { numero: 3, texto: "Feche a venda: o crédito fica fora do faturamento e entra no saldo do franqueado." },
    ],
  },
  {
    id: "franqueado-pagar",
    pagina: "/emporio/franqueados",
    papel: "dono",
    legenda: "Pagar o crédito do franqueado",
    alt: "Animação da ficha de um franqueado com o extrato, o painel Pagar crédito e o saldo caindo depois do pagamento",
    passos: [
      { numero: 1, texto: "Abra o franqueado: o extrato mostra os créditos e os pagamentos." },
      { numero: 2, texto: "Toque em Pagar crédito, informe o valor e de onde sai o dinheiro." },
      { numero: 3, texto: "Confirme: o saldo cai e o pagamento entra no extrato." },
    ],
  },
  {
    id: "produto-converter-quilo",
    pagina: "/emporio/produtos",
    papel: "dono",
    legenda: "Converter um produto de saca para quilo",
    alt: "Animação do produto em saca com a prévia da conversão para quilo, mostrando saldo e custo de cada loja antes e depois",
    passos: [
      { numero: 1, texto: "No produto em saca, toque em Converter para quilo." },
      { numero: 2, texto: "A prévia mostra o saldo e o custo de cada loja, antes e depois." },
      { numero: 3, texto: "Confira as formas de venda: a marca confira aponta a fração que não fecha." },
      { numero: 4, texto: "Toque em Converter: o produto passa a ser contado em quilo." },
    ],
  },
  {
    id: "produto-fracao-gramas",
    pagina: "/emporio/produtos",
    papel: "dono",
    legenda: "Vender em gramas com preço próprio",
    alt: "Animação de um produto em quilo com a apresentação 300 g, o preço por loja, a venda no balcão e o estoque com sacas fechadas e o resto em quilo",
    passos: [
      { numero: 1, texto: "No produto em quilo, crie a apresentação 300 g (vale 0,3 kg)." },
      { numero: 2, texto: "Dê o preço da fração em cada loja." },
      { numero: 3, texto: "No balcão, venda 1 × 300 g." },
      { numero: 4, texto: "Sem granel, a saca abre sozinha: o estoque mostra as sacas fechadas e o resto em kg." },
    ],
  },
  {
    id: "estoque-atacado-mesma-saca",
    pagina: "/emporio/estoque",
    papel: "gestor",
    legenda: "Saca e Atacado são a mesma saca",
    alt: "Animação do estoque com uma linha só para Saca 40 kg e ATACADO, e a contagem com um campo por tamanho",
    passos: [
      { numero: 1, texto: "Saca 40 kg e ATACADO têm o mesmo tamanho: o estoque mostra uma linha só." },
      { numero: 2, texto: "Vender em qualquer uma tira da mesma conta." },
      { numero: 3, texto: "Na contagem, um campo por tamanho." },
    ],
  },
];

export function animacaoPorId(id: string): Animacao {
  const a = ANIMACOES.find((x) => x.id === id);
  if (!a) throw new Error(`Animação do manual não existe: ${id}`);
  return a;
}
