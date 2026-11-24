import { veAPagina } from "@/lib/emporio/paginas";
import type { PapelContexto } from "@/lib/emporio/papel";

export type ItemDoMenu = { href: string; rotulo: string; exact?: boolean; destaque?: boolean };
export type EntradaDoMenu = ({ tipo: "item" } & ItemDoMenu) | { tipo: "grupo"; rotulo: string; itens: ItemDoMenu[] };

/** O menu da onda 1: duas folhas no topo e cinco grupos, na ordem em que a pessoa trabalha. */
const ESTRUTURA: readonly EntradaDoMenu[] = [
  { tipo: "item", href: "/emporio", rotulo: "Início", exact: true },
  { tipo: "item", href: "/emporio/vender", rotulo: "Vender", destaque: true },
  {
    tipo: "grupo",
    rotulo: "Vendas",
    itens: [
      { href: "/emporio/vendas", rotulo: "Vendas" },
      { href: "/emporio/orcamentos", rotulo: "Orçamentos" },
      { href: "/emporio/clientes", rotulo: "Clientes" },
      { href: "/emporio/fiado", rotulo: "Fiado" },
      { href: "/emporio/franqueados", rotulo: "Franqueados" },
    ],
  },
  {
    tipo: "grupo",
    rotulo: "Estoque",
    itens: [
      { href: "/emporio/produtos", rotulo: "Produtos" },
      { href: "/emporio/estoque", rotulo: "Estoque" },
      { href: "/emporio/compras", rotulo: "Compras" },
      { href: "/emporio/transferencias", rotulo: "Transferências" },
      { href: "/emporio/fornecedores", rotulo: "Fornecedores" },
    ],
  },
  {
    tipo: "grupo",
    rotulo: "Dinheiro",
    itens: [
      { href: "/emporio/financeiro", rotulo: "Hoje" },
      { href: "/emporio/caixa", rotulo: "Caixa" },
      { href: "/emporio/financeiro/receber", rotulo: "A receber" },
      { href: "/emporio/financeiro/pagar", rotulo: "A pagar" },
      { href: "/emporio/despesas", rotulo: "Despesas" },
      { href: "/emporio/financeiro/aprovacoes", rotulo: "Aprovações" },
    ],
  },
  {
    tipo: "grupo",
    rotulo: "Estatísticas",
    itens: [
      { href: "/emporio/relatorios", rotulo: "Relatórios" },
      { href: "/emporio/resultado", rotulo: "Resultado" },
      { href: "/emporio/financeiro/projecao", rotulo: "Projeção" },
    ],
  },
  {
    tipo: "grupo",
    rotulo: "Ajustes",
    itens: [
      { href: "/emporio/estabelecimentos", rotulo: "Lojas" },
      { href: "/emporio/equipe", rotulo: "Equipe" },
      { href: "/emporio/historico", rotulo: "Histórico" },
      { href: "/emporio/configuracoes", rotulo: "Configurações" },
    ],
  },
];

/** As subtelas do financeiro abrem para quem abre o financeiro: a página-mãe decide. */
function abre(c: PapelContexto, href: string): boolean {
  return veAPagina(c, href.startsWith("/emporio/financeiro/") ? "/emporio/financeiro" : href);
}

/**
 * O menu do Empório para o papel: só o que ele abre, sem grupo vazio, com o
 * grupo de um item só virando item. Sobrando até 5 itens além de Início e
 * Vender, o menu sai plano (é o menu do Caixa).
 */
export function menuDoEmporio(c: PapelContexto): EntradaDoMenu[] {
  const entradas: EntradaDoMenu[] = [];
  for (const e of ESTRUTURA) {
    if (e.tipo === "item") {
      if (abre(c, e.href)) entradas.push(e);
      continue;
    }
    const itens = e.itens.filter((i) => abre(c, i.href));
    if (itens.length === 0) continue;
    if (itens.length === 1) entradas.push({ tipo: "item", ...itens[0] });
    else entradas.push({ tipo: "grupo", rotulo: e.rotulo, itens });
  }

  const folhas = entradas.flatMap((e) => (e.tipo === "item" ? [e] : e.itens.map((i) => ({ tipo: "item" as const, ...i }))));
  const semTopo = folhas.filter((f) => f.href !== "/emporio" && f.href !== "/emporio/vender");
  return semTopo.length <= 5 ? folhas : entradas;
}
