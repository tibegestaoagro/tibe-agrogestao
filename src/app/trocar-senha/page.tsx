import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import ChangePasswordForm from "./change-password-form";

/**
 * Troca obrigatória de senha (spec 2026-07-24) — só para usuários com
 * must_change_password=true (tenants criados manualmente pelo painel).
 * Mesmo padrão de src/app/onboarding/page.tsx: fora do route group
 * (dashboard), sessão própria, fora do fluxo normal se não se aplicar.
 */
export default async function TrocarSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getTenantDb();
  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.must_change_password) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Defina sua nova senha</h1>
        <p className="mt-2 text-gray-600">
          Por segurança, você precisa trocar a senha temporária antes de continuar.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
