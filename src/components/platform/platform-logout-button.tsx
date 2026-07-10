"use client";

import { signOut } from "next-auth/react";

export default function PlatformLogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/plataforma/login" })}
      className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-800"
    >
      Sair
    </button>
  );
}
