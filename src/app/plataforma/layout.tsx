import type { Metadata } from "next";
import PlatformSessionProvider from "@/components/platform/platform-session-provider";

export const metadata: Metadata = {
  title: { default: "Painel da Plataforma", template: "%s | Tibé Plataforma" },
  robots: { index: false, follow: false },
};

/**
 * Layout raiz de /plataforma/* (Módulo 6) — só provisiona o SessionProvider
 * da instância de PlatformUser. A proteção de rota real está no middleware
 * (getToken sobre o cookie tibe-platform-session) e, em defesa adicional, no
 * layout de (painel)/layout.tsx. Este layout não tem nav — /plataforma/login
 * também passa por aqui, sem chrome de painel autenticado.
 */
export default function PlataformaRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlatformSessionProvider>{children}</PlatformSessionProvider>;
}
