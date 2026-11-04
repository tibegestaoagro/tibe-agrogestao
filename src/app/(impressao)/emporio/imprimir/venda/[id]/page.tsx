import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerImpressoDaVendaAction } from "@/lib/actions/emporio-impressao";
import { PapelA4 } from "@/components/emporio/impresso/papel-a4";
import { PapelCupom } from "@/components/emporio/impresso/papel-cupom";
import { BotaoImprimir } from "@/components/emporio/impresso/botao-imprimir";

export const metadata = { title: "Imprimir venda" };

/** `?formato=a4` (padrão) ou `?formato=cupom`. Nunca imprime sozinha. */
export default async function ImprimirVendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;
  const { formato } = await searchParams;

  const db = await getTenantDb();
  const res = await lerImpressoDaVendaAction(db, user, id);
  if (!res.ok) notFound();

  return (
    <main className="p-3 print:p-0">
      <div className="flex justify-center pb-3 print:hidden">
        <BotaoImprimir />
      </div>
      {formato === "cupom" ? <PapelCupom d={res.data} /> : <PapelA4 d={res.data} />}
    </main>
  );
}
