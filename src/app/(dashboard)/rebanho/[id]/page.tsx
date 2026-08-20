import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import WeightChart from "@/components/rebanho/weight-chart";
import AnimalActions from "@/components/rebanho/animal-actions";
import AnimalEditForm from "@/components/rebanho/animal-edit-form";

const SEX: Record<string, string> = { male: "Macho", female: "Fêmea" };
const MOV: Record<string, string> = {
  purchase: "Compra",
  sale: "Venda",
  transfer: "Transferência",
  death: "Morte",
};
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export default async function AnimalDetail(
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
  const animal = await db.animalBatch.findFirst({
    where: { id: params.id },
    include: { property: { select: { name: true } } },
  });
  if (!animal) notFound();

  const [weightLogs, vaccinations, movements, vaccines, propertiesRaw, expenses, purchase] =
    await Promise.all([
      db.animalWeightLog.findMany({
        where: { batch_id: params.id },
        orderBy: { measured_at: "asc" },
      }),
      db.animalVaccination.findMany({
        where: { batch_id: params.id },
        orderBy: { applied_at: "desc" },
        include: { vaccine: { select: { name: true } } },
      }),
      db.animalMovement.findMany({
        where: { batch_id: params.id },
        orderBy: { occurred_at: "desc" },
      }),
      db.vaccine.findMany({ orderBy: { name: "asc" } }),
      db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
      db.financialEntry.findMany({
        where: { related_module: "rebanho", related_id: params.id, entry_type: "expense" },
        select: { amount: true },
      }),
      db.animalMovement.findFirst({
        where: { batch_id: params.id, movement_type: "purchase" },
        orderBy: { occurred_at: "asc" },
        select: { occurred_at: true },
      }),
    ]);

  const writable = canWrite(user.role, "rebanho");
  const gmd = computeGmd(weightLogs);
  const totalCost = expenses.reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);
  const since = purchase?.occurred_at ?? animal.created_at;
  // Ver a nota em configuracoes/assinatura: Server Component le o relogio uma
  // vez por requisicao, e a regra de pureza mira re-render de cliente.
  // eslint-disable-next-line react-hooks/purity
  const agora = Date.now();
  const months = Math.max(1, (agora - since.getTime()) / (30.4375 * 86_400_000));
  const monthlyAvg = totalCost / months;
  // Sem `status` no modelo único: o que resta é `quantity`.
  const st =
    animal.quantity > 0
      ? { label: `${animal.quantity} cabeça(s)`, variant: "green" as const }
      : { label: "Sem saldo", variant: "gray" as const };

  const chartData = weightLogs.map((w) => ({
    date: w.measured_at.toLocaleDateString("pt-BR"),
    weight: decToNum(w.weight) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/rebanho" className="text-sm text-tibe-primary hover:underline">
            ← Rebanho
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-gray-900">
            Brinco {animal.ear_tag}
            <Badge variant={st.variant}>{st.label}</Badge>
          </h1>
        </div>
        {writable && (
          <div className="flex flex-wrap items-center gap-2">
            <AnimalEditForm
              animal={{
                id: animal.id,
                ear_tag: animal.ear_tag ?? "",
                breed: animal.breed,
                sex: animal.sex ?? "male",
                property_id: animal.property_id,
                birth_date: animal.birth_date ? animal.birth_date.toISOString() : null,
              }}
              properties={propertiesRaw.map((p) => ({ id: p.id, name: p.name }))}
            />
            <AnimalActions
              animalId={animal.id}
              vaccines={vaccines.map((v) => ({ id: v.id, name: v.name }))}
              properties={propertiesRaw.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        )}
      </div>

      {/* Dados cadastrais + custo */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-5 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Raça" value={animal.breed ?? "não informada"} />
        <Stat label="Sexo" value={animal.sex ? (SEX[animal.sex] ?? animal.sex) : "não informado"} />
        <Stat label="Propriedade" value={animal.property?.name ?? "não informada"} />
        <Stat
          label="Peso atual"
          value={decToNum(animal.average_weight) != null ? `${decToNum(animal.average_weight)} kg` : "sem valor"}
        />
        <Stat label="GMD" value={gmd != null ? `${gmd} kg/dia` : "sem valor"} />
        <Stat
          label="Nascimento"
          value={animal.birth_date ? animal.birth_date.toLocaleDateString("pt-BR") : "sem data"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">Custo total acumulado</p>
          <p className="mt-1 text-2xl font-semibold text-tibe-dark">{brl(totalCost)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Média mensal: {brl(monthlyAvg)} · desde {since.toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="lg:col-span-2 rounded-lg border border-gray-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium text-gray-700">Evolução de peso</p>
          <WeightChart data={chartData} />
        </div>
      </div>

      {/* Histórico de vacinação */}
      <Section title="Histórico de vacinação">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vacina</TableHead>
              <TableHead>Aplicada em</TableHead>
              <TableHead>Próxima dose</TableHead>
              <TableHead>Custo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vaccinations.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-4 text-center text-gray-500">Nenhuma vacinação.</TableCell></TableRow>
            )}
            {vaccinations.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.vaccine?.name ?? "não informada"}</TableCell>
                <TableCell>{v.applied_at.toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{v.next_due_at ? v.next_due_at.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                <TableCell>{decToNum(v.cost) != null ? brl(decToNum(v.cost)!) : "sem valor"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {/* Histórico de movimentação */}
      <Section title="Histórico de movimentação">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-4 text-center text-gray-500">Nenhuma movimentação.</TableCell></TableRow>
            )}
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{MOV[m.movement_type] ?? m.movement_type}</TableCell>
                <TableCell>{m.occurred_at.toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{decToNum(m.value) != null ? brl(decToNum(m.value)!) : "sem valor"}</TableCell>
                <TableCell>{m.notes ?? "sem observação"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b px-5 py-3 text-sm font-medium text-gray-700">{title}</h2>
      <div className="p-2">{children}</div>
    </div>
  );
}
