import { pode, type AcaoEmporio, type PapelContexto } from "@/lib/emporio/papel";

/**
 * As telas do Meu Empório, na ordem do menu lateral, com a ação que cada uma
 * exige. Lista pura: o menu e os cartões do início leem a mesma, então um não
 * oferece o que o outro esconde. `exige: null` é página aberta a quem tem papel.
 */
export const PAGINAS_DO_EMPORIO: readonly {
  href: string;
  rotulo: string;
  /** Lista: a página abre se ALGUMA das ações passa. */
  exige: AcaoEmporio | AcaoEmporio[] | null;
}[] = [
  { href: "/emporio", rotulo: "Início", exige: null },
  { href: "/emporio/vender", rotulo: "Vender", exige: "vendedor_da_loja" },
  { href: "/emporio/vendas", rotulo: "Vendas", exige: null },
  { href: "/emporio/orcamentos", rotulo: "Orçamentos", exige: "fora_do_caixa" },
  { href: "/emporio/fiado", rotulo: "Fiado", exige: null },
  { href: "/emporio/clientes", rotulo: "Clientes", exige: ["vendedor_da_loja", "dinheiro"] },
  { href: "/emporio/caixa", rotulo: "Caixa", exige: null },
  { href: "/emporio/financeiro", rotulo: "Financeiro", exige: "dinheiro" },
  { href: "/emporio/produtos", rotulo: "Produtos", exige: "fora_do_caixa" },
  { href: "/emporio/estoque", rotulo: "Estoque", exige: "fora_do_caixa" },
  { href: "/emporio/compras", rotulo: "Compras", exige: "fora_do_caixa" },
  { href: "/emporio/fornecedores", rotulo: "Fornecedores", exige: "fora_do_caixa" },
  { href: "/emporio/franqueados", rotulo: "Franqueados", exige: "fora_do_caixa" },
  { href: "/emporio/transferencias", rotulo: "Transferências", exige: "fora_do_caixa" },
  { href: "/emporio/despesas", rotulo: "Despesas", exige: ["gestor_da_loja", "dinheiro"] },
  { href: "/emporio/resultado", rotulo: "Resultado", exige: ["gestor_da_loja", "dinheiro"] },
  { href: "/emporio/relatorios", rotulo: "Relatórios", exige: ["gestor_da_loja", "dinheiro"] },
  { href: "/emporio/equipe", rotulo: "Equipe", exige: "conta" },
  { href: "/emporio/estabelecimentos", rotulo: "Lojas", exige: "fora_do_caixa" },
  { href: "/emporio/historico", rotulo: "Histórico", exige: ["gestor_da_loja", "dinheiro"] },
  { href: "/emporio/configuracoes", rotulo: "Configurações", exige: ["gestor_da_loja", "dinheiro"] },
];

export function veAPagina(c: PapelContexto, href: string): boolean {
  const p = PAGINAS_DO_EMPORIO.find((x) => x.href === href);
  if (!p) return false;
  if (p.exige === null) return true;
  const acoes = Array.isArray(p.exige) ? p.exige : [p.exige];
  return acoes.some((a) => pode(c, a));
}

export function paginasVisiveis(c: PapelContexto): { href: string; rotulo: string }[] {
  return PAGINAS_DO_EMPORIO.filter((p) => veAPagina(c, p.href)).map(({ href, rotulo }) => ({ href, rotulo }));
}
