import Link from "next/link";
import { canAccess } from "@/lib/permissions";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";

/**
 * Navegação lateral. Mostra módulos conforme os perfis ATIVOS do tenant e o
 * acesso da role (PRD 5.2). Rebanho/Lavoura só com perfil fazenda; Prestador só
 * com perfil prestador.
 */
export default function Sidebar({
  profiles,
  role,
}: {
  profiles: ProfileType[];
  role: AppUserRole;
}) {
  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/dashboard", label: "Início", show: true },
    { href: "/rebanho", label: "Rebanho", show: hasFazenda },
    { href: "/lavoura", label: "Lavoura", show: hasFazenda },
    { href: "/prestador", label: "Prestador", show: hasPrestador },
    { href: "/financeiro", label: "Financeiro", show: true },
    { href: "/alertas", label: "Alertas", show: true },
    {
      href: "/configuracoes/usuarios",
      label: "Usuários",
      show: canAccess(role, "usuarios"),
    },
    {
      href: "/configuracoes/assinatura",
      label: "Assinatura",
      show: canAccess(role, "assinatura"),
    },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="px-5 py-5">
        <span className="text-2xl font-bold text-tibe-dark">Tibé</span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-tibe-light hover:text-tibe-dark"
            >
              {l.label}
            </Link>
          ))}
      </nav>
    </aside>
  );
}
