# Deploy: Tibé (Módulo 0, task 0.8)

Passo a passo para colocar o Tibé no ar com **GitHub + Vercel + Neon**. As partes
que exigem login nas plataformas ficam por sua conta (Dilton); o código já está
pronto para plugar.

---

## 1. Repositório no GitHub

O projeto já tem `git init` (branch `main`) e `.gitignore` configurado
(`.env*` fora, exceto `.env.example`). Falta criar o repositório remoto e dar push:

```bash
# autenticado no gh CLI:
gh repo create tibe-agrogestao --private --source . --remote origin

git add .
git commit -m "Módulo 0: setup multi-tenant, auth e isolamento"
git push -u origin main
```

> Sem o `gh` CLI: crie o repositório privado `tibe-agrogestao` pelo site do GitHub
> e rode `git remote add origin <url>` antes do push.

---

## 2. Banco Neon

1. No painel da Neon, no projeto `tibe-agrogestao` / banco `neondb`, copie a
   **connection string** (pooled).
2. Habilite **Branching** (preview por PR) e instale a integração **Neon ↔ Vercel**
   na conta: ela gera uma branch de banco isolada por Pull Request.
3. Aplique as migrações no banco de produção:
   ```bash
   DATABASE_URL="<connection string da Neon>" npm run db:deploy
   DATABASE_URL="<connection string da Neon>" npm run db:seed   # opcional: tenant inicial
   ```

> O runtime usa o driver adapter `@prisma/adapter-pg`, que funciona com Neon via
> TCP/pooler: nenhuma configuração extra além de `DATABASE_URL`.

---

## 3. Vercel

1. **Import Project** → selecione o repositório `tibe-agrogestao`. Framework
   detectado: Next.js. Não precisa mudar build/output.
2. Em **Settings → Environment Variables**, configure as variáveis (use os nomes
   de [`.env.example`](../.env.example)). Mínimo para subir:
   - `DATABASE_URL`: connection string da Neon
   - `NEXTAUTH_SECRET`: gere com `openssl rand -base64 32`
   - `NEXTAUTH_URL`: URL pública (ex: `https://<projeto>.vercel.app`)
   - As demais (`META_*`, `ASAAS_*`, `REDIS_URL`, `CLOUDFLARE_R2_*`,
     `N8N_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`) entram nos módulos seguintes.
3. O script `postinstall` roda `prisma generate` automaticamente no build da Vercel.
4. **Deploy**. Push em `main` dispara deploy de produção; cada PR gera um
   **preview deployment** com a branch de banco isolada da Neon.

### Migrações no deploy

`prisma generate` roda no build. As **migrações** (`migrate deploy`) devem rodar
contra o banco: rode manualmente (passo 2.3) ou adicione ao build command da
Vercel: `prisma migrate deploy && next build`.

---

## 4. Subdomínios (quando o domínio for registrado)

- `app.tibe.com.br` → aplicação (painel por tenant)
- `tibe.com.br` → site comercial (rotas `(public)`)
- `dashboard.tibe.com.br` → painel da plataforma (rotas `(platform)`, Módulo 6)

Todos apontam para o **mesmo** deploy Vercel; a diferenciação é por rota/middleware.

---

## Checklist de validação pós-deploy

- [ ] `https://<app>/` carrega a home pública (200)
- [ ] `https://<app>/dashboard` sem sessão redireciona para `/login`
- [ ] Login com o usuário owner do seed funciona
- [ ] Primeiro login (sem profile) cai no onboarding
- [ ] Um PR gera preview com banco Neon isolado (não afeta produção)
