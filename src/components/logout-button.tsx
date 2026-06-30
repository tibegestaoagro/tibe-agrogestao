"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
    >
      Sair
    </button>
  );
}
