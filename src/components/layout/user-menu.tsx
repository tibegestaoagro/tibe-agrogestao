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
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-gray-100"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium text-gray-900">{userName}</span>
          <span className="block text-xs text-gray-500">{roleLabel}</span>
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tibe-primary text-sm font-semibold text-white"
          title={userName}
        >
          {initialsOf(userName)}
        </span>
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <Link
            href="/configuracoes/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-tibe-light"
          >
            <User className="h-4 w-4 text-gray-400" />
            Perfil
          </Link>
          <Link
            href="/configuracoes/senha"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-tibe-light"
          >
            <KeyRound className="h-4 w-4 text-gray-400" />
            Minha senha
          </Link>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-tibe-light"
          >
            <LogOut className="h-4 w-4 text-gray-400" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
