/** O que existe no manual, em ordem. Metadados só: o texto de cada parte mora em `conteudos.tsx`. */

export type GrupoDoCapitulo = "Por função" | "Por tarefa" | "Consulta";

export type Parte = {
  slug: string;
  titulo: string;
  grupo: GrupoDoCapitulo;
  resumo: string;
};

export const BASE_DO_EMPORIO = "/manual/emporio";

export const PARTES_DO_EMPORIO: Parte[] = [
  { slug: "dono", titulo: "Sou o Dono", grupo: "Por função", resumo: "Montar as lojas, a Equipe e acompanhar o resultado." },
  { slug: "gestor", titulo: "Sou Gestor", grupo: "Por função", resumo: "Comandar a sua loja: preço, estoque, caixa e despesas." },
  { slug: "vendedor", titulo: "Sou Vendedor", grupo: "Por função", resumo: "Vender no balcão, receber fiado e conferir a gaveta." },
  { slug: "primeiros-passos", titulo: "Primeiros passos", grupo: "Por tarefa", resumo: "O que fazer antes da primeira venda." },
  { slug: "equipe", titulo: "Montar a Equipe", grupo: "Por tarefa", resumo: "Cadastrar Gestores e Vendedores e ligar permissões." },
  { slug: "produtos", titulo: "Cadastrar produto", grupo: "Por tarefa", resumo: "Saca, fardo, granel, marca, código e espécie." },
  { slug: "preco", titulo: "Preço por loja", grupo: "Por tarefa", resumo: "Cada loja com o seu preço, sem surpresa." },
  { slug: "compras", titulo: "Comprar e receber", grupo: "Por tarefa", resumo: "Lançar a compra e dar entrada no estoque." },
  { slug: "estoque", titulo: "Estoque", grupo: "Por tarefa", resumo: "Contagem, perda, mínimo e máximo, precisa repor." },
  { slug: "transferencias", titulo: "Transferir entre lojas", grupo: "Por tarefa", resumo: "Enviar, receber e resolver diferença." },
  { slug: "vender", titulo: "Vender no balcão", grupo: "Por tarefa", resumo: "Dinheiro, PIX, cartão, cheque, fiado e desconto." },
  { slug: "devolver", titulo: "Devolver, trocar e cancelar", grupo: "Por tarefa", resumo: "Quando o cliente volta atrás." },
  { slug: "fiado", titulo: "Fiado e receber fiado", grupo: "Por tarefa", resumo: "Vender para pagar depois e cobrar." },
  { slug: "caixa", titulo: "Caixa", grupo: "Por tarefa", resumo: "Gaveta, conferência, banco, cartão a receber e cheques." },
  { slug: "despesas", titulo: "Despesas", grupo: "Por tarefa", resumo: "Despesas fixas e Vendeu, Pagou." },
  { slug: "resultado", titulo: "Resultado e ponto de equilíbrio", grupo: "Por tarefa", resumo: "Saber se a loja está dando lucro." },
  { slug: "historico", titulo: "Histórico", grupo: "Por tarefa", resumo: "Quem fez cada coisa e quando." },
  { slug: "glossario", titulo: "Glossário", grupo: "Consulta", resumo: "As palavras do sistema, explicadas." },
  { slug: "perguntas", titulo: "Perguntas frequentes", grupo: "Consulta", resumo: "Por que o sistema recusou, e o que fazer." },
];

export const GRUPOS: GrupoDoCapitulo[] = ["Por função", "Por tarefa", "Consulta"];

/** Página extra, fora da sequência anterior/próximo. */
export const GUIA_DO_VENDEDOR = {
  href: `${BASE_DO_EMPORIO}/vendedor-imprimir`,
  titulo: "Guia do Vendedor para imprimir",
  resumo: "Uma folha A4 com o essencial do balcão.",
};

export type CapituloDoSistema = {
  slug: string;
  titulo: string;
  resumo: string;
  /** Sem `href` o capítulo ainda não existe e aparece como "em breve". */
  href?: string;
};

export const CAPITULOS_DO_MANUAL: CapituloDoSistema[] = [
  { slug: "emporio", titulo: "Meu Empório", resumo: "Lojas, produtos, estoque, balcão, caixa e resultado.", href: BASE_DO_EMPORIO },
  { slug: "fazenda", titulo: "Minha Fazenda", resumo: "Pastos, rebanho e lavoura." },
  { slug: "financeiro", titulo: "Financeiro", resumo: "Contas a pagar e a receber." },
  { slug: "whatsapp", titulo: "Agente no WhatsApp", resumo: "Registrar pelo celular, por conversa." },
];

export function vizinhasDe(slug: string): { anterior: Parte | null; proxima: Parte | null } {
  const i = PARTES_DO_EMPORIO.findIndex((p) => p.slug === slug);
  return {
    anterior: i > 0 ? PARTES_DO_EMPORIO[i - 1] : null,
    proxima: i >= 0 && i < PARTES_DO_EMPORIO.length - 1 ? PARTES_DO_EMPORIO[i + 1] : null,
  };
}
