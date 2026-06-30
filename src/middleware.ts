import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware de proteção de rotas (Edge runtime). Usa apenas a config edge-safe
 * (sem Prisma/bcrypt). A regra de acesso está em authConfig.callbacks.authorized.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Roda em tudo, exceto assets estáticos e arquivos de imagem.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
