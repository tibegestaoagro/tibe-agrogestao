import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerRelatorioDoTurnoAction } from "@/lib/actions/emporio-relatorio-turno";
import { RelatorioTurnoA4 } from "@/components/emporio/impresso/relatorio-turno-a4";
import { RelatorioTurnoCupom } from "@/components/emporio/impresso/relatorio-turno-cupom";
import { BotaoImprimir } from "@/components/emporio/impresso/botao-imprimir";

export const metadata = { title: "Fechamento de caixa" };

/** `?formato=a4` (padrão) ou `?formato=cupom`. Nunca imprime sozinha. */
export default async function ImprimirTurnoPage({
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
  const res = await lerRelatorioDoTurnoAction(db, user, id);
  if (!res.ok) notFound();

  return (
    <main className="p-3 print:p-0">
      <div className="flex justify-center pb-3 print:hidden">
        <BotaoImprimir />
      </div>
      {formato === "cupom" ? <RelatorioTurnoCupom d={res.data} /> : <RelatorioTurnoA4 d={res.data} />}
    </main>
  );
}
