import type { TenantPrismaClient } from "@/lib/prisma";
import { curvaAbcAction, podeVerLucroAction, relatorioDeVendasAction, type CurvaAbc } from "@/lib/actions/emporio-relatorios";
import { EmptyState } from "@/components/ui/empty-state";
import { RelatoriosBlocos } from "./relatorios-blocos";
import { CurvaAbcSecao } from "../relatorios/_components/curva-abc";

/**
 * A aba Vendas das Estatísticas: a curva ABC e os blocos do relatório de vendas, no período e na loja
 * do filtro do topo. Os links da curva (produtos, clientes, medida) voltam para esta aba.
 */
export async function EstatisticasVendas({
  db,
  user,
  de,
  ate,
  loja,
  abc,
  medida,
}: {
  db: TenantPrismaClient;
  user: Parameters<typeof relatorioDeVendasAction>[1];
  de: string;
  ate: string;
  /** Vazio: todas as lojas ao alcance. */
  loja: string;
  abc: string;
  medida: string;
}) {
  const estab = loja ? { establishment_id: loja } : {};
  const res = await relatorioDeVendasAction(db, user, { from: de, to: ate, ...estab });
  if (!res.ok) {
    return <EmptyState titulo="Não foi possível montar o relatório">{res.message}</EmptyState>;
  }

  // Curva ABC: a recusa do lucro (403) não derruba a aba: cai para o faturamento e avisa.
  const kind = abc === "clientes" ? "customers" : "products";
  // Quem não vê o lucro nem recebe o seletor: decidido aqui, antes de renderizar.
  const mostrarMedida = await podeVerLucroAction(db, user);
  let measure: "revenue" | "profit" = mostrarMedida && medida === "lucro" ? "profit" : "revenue";
  let erroAbc: string | null = null;
  let curva: CurvaAbc | null = null;
  const pedirAbc = (m: "revenue" | "profit") => curvaAbcAction(db, user, { from: de, to: ate, kind, measure: m, ...estab });
  let resAbc = await pedirAbc(measure);
  if (!resAbc.ok && measure === "profit" && resAbc.status === 403) {
    measure = "revenue";
    erroAbc = resAbc.message;
    resAbc = await pedirAbc(measure);
  }
  if (resAbc.ok) curva = resAbc.data;
  else erroAbc = resAbc.message;

  const hrefAbc = (a: "produtos" | "clientes", m: "faturamento" | "lucro") => {
    const q = new URLSearchParams({ aba: "vendas", de, ate, abc: a, medida: m });
    return `/emporio/estatisticas?${q.toString()}`;
  };

  return (
    <>
      <CurvaAbcSecao curva={curva} erro={erroAbc} kind={kind} measure={measure} mostrarMedida={mostrarMedida} href={hrefAbc} />
      <RelatoriosBlocos r={res.data} />
    </>
  );
}
