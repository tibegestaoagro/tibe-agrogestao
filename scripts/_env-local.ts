/**
 * Carrega o ambiente dos scripts que só rodam contra o banco LOCAL (suítes,
 * seed, cenários, sessão de teste): `.env.local` primeiro, `.env` depois.
 *
 * Desde 14/10/2026 o `.env` aponta para o Neon e o Redis de PRODUÇÃO, e o
 * `.env.local` guarda as URLs do Docker. Em cada chave vence o primeiro arquivo
 * que a define, e variável já posta no ambiente (URL inline) vence os dois.
 * O Next faz a mesma ordem sozinho no `next dev`; o Prisma CLI lê só o `.env`
 * (`prisma.config.ts`), por isso `migrate status` e `db:deploy` vão ao Neon.
 *
 * Os scripts que leem produção de propósito (`observar-canario`,
 * `n8n-workflow`, `diagnostico-integridade`) continuam em `dotenv/config`.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
