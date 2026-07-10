import Link from "next/link";
import type { BillingAccess } from "@/lib/billing-access";

export default function BillingBanner({ access }: { access: BillingAccess }) {
  if (access === "full") return null;

  const isBlocked = access === "blocked";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 text-sm ${
        isBlocked ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"
      }`}
    >
      <p className="font-medium">
        {isBlocked
          ? "Acesso bloqueado por pendência de pagamento. Regularize para voltar a usar o Tibé."
          : "Pagamento em atraso — o painel está em modo somente leitura até a regularização."}
      </p>
      <Link
        href="/configuracoes/assinatura"
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
          isBlocked ? "bg-white text-red-700" : "bg-amber-950 text-amber-50"
        }`}
      >
        Regularizar assinatura
      </Link>
    </div>
  );
}
