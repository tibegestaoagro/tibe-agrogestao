"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { User, KeyRound, LogOut, ChevronDown } from "lucide-react";
import { useDropdown } from "@/components/ui/use-dropdown";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Menu de conta no topo (briefing de layout, seção 12): Perfil, Minha senha,
 * Sair. Os atalhos de senha/logout já existiam no rodapé da sidebar (Fase
 * 1); mantidos lá também, fiel ao mockup (os dois elementos coexistem).
 */
export default function UserMenu({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-superficie-afundada"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium text-texto">{userName}</span>
          <span className="block text-xs text-texto-discreto">{roleLabel}</span>
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primaria text-sm font-semibold text-sobre-primaria"
          title={userName}
        >
          {initialsOf(userName)}
        </span>
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-texto-discreto sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-borda bg-superficie py-1 shadow-lg">
          <Link
            href="/configuracoes/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-texto-secundario hover:bg-tibe-light"
          >
            <User className="h-4 w-4 text-texto-discreto" />
            Perfil
          </Link>
          <Link
            href="/configuracoes/senha"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-texto-secundario hover:bg-tibe-light"
          >
            <KeyRound className="h-4 w-4 text-texto-discreto" />
            Minha senha
          </Link>
          <div className="my-1 border-t border-borda" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-texto-secundario hover:bg-tibe-light"
          >
            <LogOut className="h-4 w-4 text-texto-discreto" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
