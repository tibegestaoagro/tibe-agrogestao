import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/tenant-context";
import { requireSessionGateForPage } from "@/lib/session-gate";
import { getBillingState, isBillingExemptPath } from "@/lib/billing-access";

/**
 * Casca das páginas de impressão: fora do painel, sem menu nem cabeçalho.
 * A folha é sempre branca, como o papel, qualquer que seja o tema do usuário.
 * Na impressão, 100vh é a altura da página: com o mínimo, qualquer sobra
 * empurrava o cupom para uma segunda folha.
 *
 * Fora do painel, mas com os MESMOS gates dele (sessão, troca de senha
 * obrigatória, plano e cobrança): o papel não abre para conta bloqueada,
 * como a rota irmã `/receipt` já não abre (402).
 */
export default async function ImpressaoLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await requireSessionGateForPage(user);

  const pathname = (await headers()).get("x-pathname") ?? "";
  const { access } = await getBillingState(user.tenant_id);
  if (access === "blocked" && !isBillingExemptPath(pathname)) redirect("/configuracoes/assinatura");

  return (
    <div className="min-h-screen print:min-h-0" style={{ background: "#fff", color: "#000" }}>
      {children}
    </div>
  );
}
