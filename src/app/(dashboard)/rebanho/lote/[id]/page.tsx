import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { decToNum } from "@/lib/serialize";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/**
 * Detalhe de um lote (Módulo 25, spec §2.8): categoria, quantidade, peso
 * médio, custo de aquisição e data. Sem GMD/vacina/agenda (exclusivo do
 * modelo individual) e sem histórico de movimentação (spec §2.7, fora de
 * escopo nesta rodada): o rastro é o próprio lote + os lançamentos
 * financeiros vinculados a ele (compra/venda).
 */

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ENTRY_TYPE_LABEL: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export default async function LoteDetail({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const db = await getTenantDb();
  const batch = await db.animalBatch.findFirst({
    where: { id: params.id },
    include: {
      category: { select: { name: true } },
      property: { select: { name: true } },
    },
  });
  if (!batch) notFound();

  const entries = await db.financialEntry.findMany({
    where: { related_module: "rebanho", related_id: params.id },
    orderBy: { created_at: "desc" },
  });

  const averageWeight = decToNum(batch.average_weight);
  const acquisitionCost = decToNum(batch.acquisition_cost);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/rebanho" className="text-sm text-tibe-primary hover:underline">
          ← Rebanho
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-gray-900">
          Lote de {batch.category?.name ?? "categoria não informada"}
          <Badge variant={batch.quantity > 0 ? "green" : "gray"}>
            {batch.quantity > 0 ? "Ativo" : "Esgotado"}
          </Badge>
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-5 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Categoria" value={batch.category?.name ?? "não informada"} />
        <Stat label="Quantidade atual" value={`${batch.quantity} cabeça(s)`} />
        <Stat label="Peso médio" value={averageWeight != null ? `${averageWeight} kg` : "sem valor"} />
        <Stat
          label="Custo de aquisição"
          value={acquisitionCost != null ? brl(acquisitionCost) : "sem custo informado"}
        />
        <Stat label="Propriedade" value={batch.property?.name ?? "não informada"} />
        <Stat label="Adquirido em" value={batch.acquired_at.toLocaleDateString("pt-BR")} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b px-5 py-3 text-sm font-medium text-gray-700">
          Lançamentos financeiros vinculados
        </h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-gray-500">
                    Nenhum lançamento vinculado.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type}</TableCell>
                  <TableCell>{e.category ?? "sem categoria"}</TableCell>
                  <TableCell>{brl(decToNum(e.amount) ?? 0)}</TableCell>
                  <TableCell>
                    {(e.paid_at ?? e.due_date)?.toLocaleDateString("pt-BR") ?? "sem data"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
