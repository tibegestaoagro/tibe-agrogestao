import Link from "next/link";
import type { BillingAccess } from "@/lib/billing-access";

export default function BillingBanner({ access }: { access: BillingAccess }) {
  if (access === "full") return null;

  const isBlocked = access === "blocked";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 text-sm ${
        isBlocked
          ? "bg-perigo text-superficie"
          : "bg-atencao-suave text-atencao-tinta"
      }`}
    >
      <p className="font-medium">
        {isBlocked
          ? "Acesso bloqueado por pendência de pagamento. Regularize para voltar a usar o Tibé."
          : "Pagamento em atraso: o painel está em modo somente leitura até a regularização."}
      </p>
      <Link
        href="/configuracoes/assinatura"
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
          // O chip inverte o par da tarja: a razão de contraste é simétrica,
          // então o par que o gate confere vale nos dois sentidos.
          isBlocked
            ? "bg-superficie text-perigo-tinta"
            : "bg-atencao-tinta text-atencao-suave"
        }`}
      >
        Regularizar assinatura
      </Link>
    </div>
  );
}
