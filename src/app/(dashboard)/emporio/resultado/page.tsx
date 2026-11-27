import { redirect } from "next/navigation";
import { enderecoDaEstatistica } from "@/lib/emporio/estatisticas";

/** O endereço antigo do Resultado: virou a aba Resultado das Estatísticas, com o mês em de/ate. */
export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaEstatistica("/emporio/resultado", umPorChave(await searchParams)));
}

function umPorChave(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
