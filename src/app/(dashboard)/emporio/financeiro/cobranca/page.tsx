import { redirect } from "next/navigation";
import { enderecoDaTelaNova } from "@/lib/emporio/dinheiro-telas";

/** A Cobrança virou a aba Vencidos do A receber. A permissão é conferida no destino. */
export default async function FinanceiroCobrancaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(enderecoDaTelaNova("/emporio/financeiro/cobranca", await searchParams));
}
