import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import TaskForm from "@/components/meu-dia/task-form";
import TaskActions from "@/components/meu-dia/task-actions";
import { serializeTask, type EffectiveStatus } from "@/lib/actions/tasks";

const STATUS: Record<EffectiveStatus, { label: string; variant: "green" | "amber" | "gray" | "red" }> = {
  pending: { label: "Pendente", variant: "amber" },
  overdue: { label: "Atrasada", variant: "red" },
  completed: { label: "Concluída", variant: "green" },
  cancelled: { label: "Cancelada", variant: "gray" },
};

export default async function MeuDiaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const writable = canWrite(user.role, "tarefas");
  const db = await getTenantDb();

  const tasks = await db.task.findMany({ orderBy: { due_date: "asc" } });
  const rows = tasks.map(serializeTask);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Meu Dia</h1>
        {writable && <TaskForm />}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>O que precisa ser feito</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Lembrete</TableHead>
              <TableHead>Status</TableHead>
              {writable && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={writable ? 5 : 4} className="py-6 text-center text-gray-500">
                  Nenhuma tarefa cadastrada.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => {
              const st = STATUS[t.effective_status];
              const isOpen = t.status === "pending";
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>{new Date(t.due_date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{t.remind ? "Sim" : "Não"}</TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  {writable && (
                    <TableCell>{isOpen && <TaskActions taskId={t.id} />}</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
