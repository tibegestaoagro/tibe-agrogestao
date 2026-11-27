import { redirect } from "next/navigation";
import { enderecoDaEstatistica } from "@/lib/emporio/estatisticas";

/** O endereço antigo da Projeção: virou o fluxo projetado da aba Dinheiro das Estatísticas. */
export default async function FinanceiroProjecaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaEstatistica("/emporio/financeiro/projecao", umPorChave(await searchParams)));
}

function umPorChave(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
