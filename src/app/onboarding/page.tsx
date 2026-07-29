import { redirect } from "next/navigation";
import { getActiveProfiles, getSessionUser } from "@/lib/tenant-context";
import { redirectIfGatePassed } from "@/lib/session-gate";
import OnboardingForm from "./onboarding-form";

/**
 * Onboarding bifurcado (spec task 0.5). Exibido apenas quando o tenant ainda não
 * tem nenhum TenantProfile ativo. Se já tem, redireciona ao dashboard.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await redirectIfGatePassed(user, "profile");

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
