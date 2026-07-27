import { redirect } from "next/navigation";
import { getActiveProfiles, getSessionUser, getTenantDb } from "@/lib/tenant-context";
import OnboardingForm from "./onboarding-form";

/**
 * Onboarding bifurcado (spec task 0.5). Exibido apenas quando o tenant ainda não
 * tem nenhum TenantProfile ativo. Se já tem, redireciona ao dashboard.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getTenantDb();
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { must_change_password: true },
  });
  if (dbUser?.must_change_password) redirect("/trocar-senha");

  const profiles = await getActiveProfiles();
  if (profiles.length > 0) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Bem-vindo ao Tibé</h1>
        <p className="mt-2 text-gray-600">
          Sua empresa trabalha com fazenda, prestação de serviço, ou os dois?
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
