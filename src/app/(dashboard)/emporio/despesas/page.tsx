import { redirect } from "next/navigation";
import { enderecoDaTelaNova } from "@/lib/emporio/dinheiro-telas";

/** O endereço antigo das Despesas: as seções moraram no A pagar. O destino confere a permissão. */
export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaTelaNova("/emporio/despesas", await searchParams));
}
