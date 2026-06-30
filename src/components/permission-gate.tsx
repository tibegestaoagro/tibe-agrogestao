import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/tenant-context";
import {
  canAccess,
  canWrite,
  hasMinRole,
  type ModuleKey,
} from "@/lib/permissions";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Server Component que protege elementos de UI por permissão (spec task 0.6).
 *
 * Uso (qualquer combinação):
 *   <PermissionGate module="usuarios" action="write">...</PermissionGate>
 *   <PermissionGate roles={["OWNER", "ADMIN"]}>...</PermissionGate>
 *   <PermissionGate minRole="ADMIN">...</PermissionGate>
 *
 * Renderiza `fallback` (default: nada) quando o usuário da sessão não atende.
 */
export default async function PermissionGate({
  module,
  action = "read",
  roles,
  minRole,
  fallback = null,
  children,
}: {
  module?: ModuleKey;
  action?: "read" | "write";
  roles?: AppUserRole[];
  minRole?: AppUserRole;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) return <>{fallback}</>;

  let allowed = true;
  if (module) {
    allowed = action === "write"
      ? canWrite(user.role, module)
      : canAccess(user.role, module);
  }
  if (allowed && roles) allowed = roles.includes(user.role);
  if (allowed && minRole) allowed = hasMinRole(user.role, minRole);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
