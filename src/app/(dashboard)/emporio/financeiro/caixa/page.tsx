import { redirect } from "next/navigation";
import { enderecoDaTelaNova } from "@/lib/emporio/dinheiro-telas";

/** A "Posição de caixa" agora vive dentro do Caixa: o endereço antigo leva para lá, com os filtros. */
export default async function FinanceiroCaixaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaTelaNova("/emporio/financeiro/caixa", await searchParams));
}
