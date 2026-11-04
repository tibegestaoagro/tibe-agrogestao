import { pode, type AcaoEmporio, type PapelContexto } from "@/lib/emporio/papel";

/**
 * As telas do Meu Empório, na ordem do menu lateral, com a ação que cada uma
 * exige. Lista pura: o menu e os cartões do início leem a mesma, então um não
 * oferece o que o outro esconde. `exige: null` é página aberta a quem tem papel.
 */
export const PAGINAS_DO_EMPORIO: readonly { href: string; rotulo: string; exige: AcaoEmporio | null }[] = [
  { href: "/emporio", rotulo: "Início", exige: null },
  { href: "/emporio/vender", rotulo: "Vender", exige: "vendedor_da_loja" },
  { href: "/emporio/vendas", rotulo: "Vendas", exige: null },
  { href: "/emporio/fiado", rotulo: "Fiado", exige: null },
  { href: "/emporio/caixa", rotulo: "Caixa", exige: null },
  { href: "/emporio/produtos", rotulo: "Produtos", exige: "fora_do_caixa" },
  { href: "/emporio/estoque", rotulo: "Estoque", exige: "fora_do_caixa" },
  { href: "/emporio/compras", rotulo: "Compras", exige: "fora_do_caixa" },
  { href: "/emporio/transferencias", rotulo: "Transferências", exige: "fora_do_caixa" },
  { href: "/emporio/despesas", rotulo: "Despesas", exige: "gestor_da_loja" },
  { href: "/emporio/resultado", rotulo: "Resultado", exige: "gestor_da_loja" },
  { href: "/emporio/equipe", rotulo: "Equipe", exige: "conta" },
  { href: "/emporio/estabelecimentos", rotulo: "Lojas", exige: "fora_do_caixa" },
  { href: "/emporio/historico", rotulo: "Histórico", exige: "gestor_da_loja" },
  { href: "/emporio/configuracoes", rotulo: "Configurações", exige: "gestor_da_loja" },
];

export function veAPagina(c: PapelContexto, href: string): boolean {
  const p = PAGINAS_DO_EMPORIO.find((x) => x.href === href);
  if (!p) return false;
  return p.exige === null || pode(c, p.exige);
}

export function paginasVisiveis(c: PapelContexto): { href: string; rotulo: string }[] {
  return PAGINAS_DO_EMPORIO.filter((p) => veAPagina(c, p.href)).map(({ href, rotulo }) => ({ href, rotulo }));
}
