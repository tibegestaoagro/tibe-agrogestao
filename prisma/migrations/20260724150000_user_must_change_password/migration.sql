-- Troca obrigatória de senha no primeiro login (tenants criados manualmente
-- pelo painel da plataforma — spec 2026-07-24).
ALTER TABLE "User" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
