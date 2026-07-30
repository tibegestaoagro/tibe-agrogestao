import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import InviteForm from "@/components/usuarios/invite-form";
import UserRowActions from "@/components/usuarios/user-row-actions";
import { getSeatUsage } from "@/lib/seats";

/**
 * Configurações → Usuários (spec 5.2). Acesso: Owner e Admin (PRD 5.2).
 */
export default async function UsuariosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  if (!hasMinRole(sessionUser.role, "ADMIN")) redirect("/dashboard");

  const db = await getTenantDb();
  const [users, seats] = await Promise.all([
    db.user.findMany({ orderBy: { created_at: "asc" } }),
    getSeatUsage(db, sessionUser.tenant_id),
  ]);
  const seatsFull = !seats.has_room;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Usuários</h1>
          <p className={`text-sm ${seatsFull ? "text-amber-700" : "text-gray-500"}`}>
            {seats.used} de {seats.limit} assento(s) em uso
            {seatsFull && ": desative um usuário ou faça upgrade do plano para convidar mais"}
          </p>
        </div>
        <InviteForm canInviteOwner={sessionUser.role === "OWNER"} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Papel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name} {u.id === sessionUser.id && <span className="text-xs text-gray-400">(você)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.phone ?? "sem telefone"}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? "green" : "gray"}>
                    {u.active ? "Ativo" : "Desativado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <UserRowActions
                    userId={u.id}
                    role={u.role}
                    active={u.active}
                    isSelf={u.id === sessionUser.id}
                    canEdit={hasMinRole(sessionUser.role, "ADMIN")}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
