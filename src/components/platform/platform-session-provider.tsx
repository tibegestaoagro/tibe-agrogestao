"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Wrapper fino em torno do SessionProvider apontando para a instância
 * NextAuth da plataforma (/api/platform-auth/*), não a de tenant
 * (/api/auth/*): é o basePath que faz signIn()/signOut() chamados dentro de
 * app/plataforma/* baterem na rota certa.
 */
export default function PlatformSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider basePath="/api/platform-auth">{children}</SessionProvider>;
}
