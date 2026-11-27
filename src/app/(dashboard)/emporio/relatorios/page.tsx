import { redirect } from "next/navigation";
import { enderecoDaEstatistica } from "@/lib/emporio/estatisticas";

/** O endereço antigo dos Relatórios: virou a aba Vendas das Estatísticas. O destino confere a permissão. */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaEstatistica("/emporio/relatorios", umPorChave(await searchParams)));
}

function umPorChave(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
