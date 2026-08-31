"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-borda px-3 py-1.5 text-sm text-texto-secundario transition hover:bg-superficie-afundada"
    >
      Sair
    </button>
  );
}
