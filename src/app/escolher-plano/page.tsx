import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/tenant-context";
import { redirectIfGatePassed } from "@/lib/session-gate";
import ChoosePlanForm from "./choose-plan-form";

/**
 * Escolha de plano (spec 2026-07-27): só para tenants criados manualmente
 * pelo painel da plataforma (plan_confirmed=false). Mesmo padrão de
 * src/app/trocar-senha/page.tsx e src/app/onboarding/page.tsx: fora do route
 * group (dashboard), sessão própria. Fica entre a troca de senha e o
 * onboarding de perfil na cadeia de gates.
 */
export default async function EscolherPlanoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await redirectIfGatePassed(user, "plan_confirmed");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Escolha seu plano</h1>
        <p className="mt-2 text-gray-600">
          Antes de continuar, escolha o plano que melhor combina com sua operação. Você pode mudar
          depois em Configurações → Assinatura.
        </p>
        <div className="mt-6">
          <ChoosePlanForm />
        </div>
      </div>
    </main>
  );
}
