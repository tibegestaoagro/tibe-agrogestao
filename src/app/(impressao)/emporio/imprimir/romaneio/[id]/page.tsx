import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerRomaneioDaVendaAction } from "@/lib/actions/emporio-impressao";
import { RomaneioA4 } from "@/components/emporio/impresso/romaneio-a4";
import { RomaneioCupom } from "@/components/emporio/impresso/romaneio-cupom";
import { BotaoImprimir } from "@/components/emporio/impresso/botao-imprimir";

export const metadata = { title: "Imprimir romaneio" };

/** `?formato=a4` (padrão) ou `?formato=cupom`. Nunca imprime sozinha. */
export default async function ImprimirRomaneioPage({
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
  const res = await lerRomaneioDaVendaAction(db, user, id);
  if (!res.ok) notFound();

  return (
    <main className="p-3 print:p-0">
      <div className="flex justify-center pb-3 print:hidden">
        <BotaoImprimir />
      </div>
      {formato === "cupom" ? <RomaneioCupom d={res.data} /> : <RomaneioA4 d={res.data} />}
    </main>
  );
}
