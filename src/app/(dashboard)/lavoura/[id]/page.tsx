import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
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
import CycleActions from "@/components/lavoura/cycle-actions";

const CYCLE_STATUS: Record<string, { label: string; variant: "green" | "blue" | "gray" }> = {
  planted: { label: "Plantado", variant: "blue" },
  growing: { label: "Em crescimento", variant: "green" },
  harvested: { label: "Colhido", variant: "gray" },
};
const INPUT: Record<string, string> = {
  fertilizer: "Fertilizante",
  pesticide: "Defensivo",
  seed: "Semente",
};
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-tibe-dark">{value}</p>
    </div>
  );
}

export default async function PlotDetail(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const db = await getTenantDb();
  const plot = await db.plot.findFirst({
    where: { id: params.id },
    include: {
      property: { select: { name: true } },
      cycles: { orderBy: { created_at: "desc" } },
    },
  });
  if (!plot) notFound();

  const writable = canWrite(user.role, "lavoura");
  const active = plot.cycles.find(
    (c) => c.status === "planted" || c.status === "growing",
  );

  // Insumos + resumo do ciclo ativo.
  const inputs = active
    ? await db.plotInput.findMany({
        where: { cycle_id: active.id },
        orderBy: { created_at: "desc" },
      })
    : [];

  const area = decToNum(plot.area_hectares);
  const totalInputCost = inputs.reduce((s, i) => s + (decToNum(i.cost) ?? 0), 0);
  const costPerHa = area && area > 0 ? totalInputCost / area : null;
  const activeYield = decToNum(active?.yield_amount);
  const productivity =
    area && area > 0 && activeYield != null ? activeYield / area : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/lavoura" className="text-sm text-tibe-primary hover:underline">
            ← Lavoura
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">{plot.name}</h1>
          <p className="text-sm text-gray-500">
            {plot.property?.name ?? "não informada"} · {area ?? "não informada"} ha
          </p>
        </div>
        {writable && (
          <CycleActions plotId={plot.id} activeCycleId={active?.id ?? null} />
        )}
      </div>

      {/* Resumo do ciclo ativo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Cultura atual" value={plot.current_crop ?? "não informada"} />
        <Stat label="Custo de insumos" value={brl(totalInputCost)} />
        <Stat label="Custo / ha" value={costPerHa != null ? brl(costPerHa) : "sem valor"} />
        <Stat
          label="Produtividade / ha"
          value={
            productivity != null
              ? `${productivity.toFixed(2)} ${active?.yield_unit ?? ""}`
              : "sem valor"
          }
        />
      </div>

      {/* Insumos do ciclo ativo */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b px-5 py-3 text-sm font-medium text-gray-700">
          Insumos {active ? `(${active.crop_name})` : ""}
        </h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!active && (
                <TableRow><TableCell colSpan={4} className="py-4 text-center text-gray-500">Nenhum ciclo ativo.</TableCell></TableRow>
              )}
              {active && inputs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-4 text-center text-gray-500">Nenhum insumo registrado.</TableCell></TableRow>
              )}
              {inputs.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{INPUT[i.input_type] ?? i.input_type}</TableCell>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>
                    {decToNum(i.quantity) != null ? `${decToNum(i.quantity)} ${i.unit ?? ""}` : "sem valor"}
                  </TableCell>
                  <TableCell>{decToNum(i.cost) != null ? brl(decToNum(i.cost)!) : "sem valor"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Histórico de ciclos */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b px-5 py-3 text-sm font-medium text-gray-700">Ciclos</h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cultura</TableHead>
                <TableHead>Plantio</TableHead>
                <TableHead>Colheita</TableHead>
                <TableHead>Produção</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plot.cycles.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-4 text-center text-gray-500">Nenhum ciclo.</TableCell></TableRow>
              )}
              {plot.cycles.map((c) => {
                const st = CYCLE_STATUS[c.status];
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.crop_name}</TableCell>
                    <TableCell>{c.planted_at ? c.planted_at.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                    <TableCell>{c.harvested_at ? c.harvested_at.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                    <TableCell>
                      {decToNum(c.yield_amount) != null ? `${decToNum(c.yield_amount)} ${c.yield_unit ?? ""}` : "sem valor"}
                    </TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
