"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "clientes", label: "Clientes" },
  { key: "servicos", label: "Serviços" },
  { key: "ordens", label: "Ordens" },
];

export default function TabNav() {
  const sp = useSearchParams();
  const active = sp.get("tab") ?? "clientes";

  return (
    <div className="flex gap-1 border-b border-borda">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/prestador?tab=${t.key}`}
          className={cn(
            "flex min-h-11 items-center px-4 py-2 text-sm font-medium sm:min-h-0",
            active === t.key
              ? "border-b-2 border-tibe-primary text-tibe-dark"
              : "text-texto-discreto hover:text-texto",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
