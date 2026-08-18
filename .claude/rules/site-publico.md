---
paths:
  - "src/app/(public)/**"
  - "src/components/public/**"
  - "src/lib/seats.ts"
  - "src/lib/actions/users.ts"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     Paginas publicas, SEO, a armadilha de PUBLIC_PREFIXES, os limites de assento por plano e a gestao de usuarios. -->

## Site público, documentação e gestão de usuários (Módulo 5)

- **`app/(public)/`**: `/` (home com hero/módulos/como funciona), `/planos`
  (preços reais, ver seção de Signup acima), `/faq`, `/politicas/privacidade`
  e `/politicas/termos` (LGPD: `/politicas` sozinho é um redirect para
  `/politicas/privacidade`, não uma página própria). Nav/footer compartilhados
  em `src/components/public/` (`PublicNav`, `PublicFooter`): qualquer página
  pública nova deve reusar os dois, não duplicar o markup.
- **SEO**: `metadataBase` + title template (`"%s | Tibé"`) no `RootLayout`;
  cada página pública define seu próprio `title`/`description` (a home não
  sobrescreve `title`, herda o `default` do root). `app/sitemap.ts` e
  `app/robots.ts` geram `/sitemap.xml` e `/robots.txt` automaticamente: como
  são rotas especiais do Next, **precisam** estar em `PUBLIC_PATHS`
  (`src/lib/auth.config.ts`), senão o middleware redireciona o crawler para
  `/login`.
- **Documentação técnica em `/docs`** (dentro do próprio Tibé: decisão do
  usuário, sem Mintlify/Notion): `src/app/(public)/docs/`: layout com sidebar
  fixa (`src/app/(public)/docs/layout.tsx`) e uma página por seção (`arquitetura`, `schema`,
  `api`, `whatsapp`, `setup`, `deploy`, `glossario`). A página `/docs/api` é
  **gerada a partir de um array de dados** (`Endpoint[]`, componente
  `EndpointCard` em `src/components/public/`) cobrindo todos os endpoints
  `/api/v1` e `/api/internal` reais: ao adicionar/mudar um endpoint,
  atualize essa lista também, senão a documentação e o código divergem. `/docs`
  precisa estar em `PUBLIC_PREFIXES` (`auth.config.ts`): mesma armadilha do
  sitemap/robots.
- **Limite de assentos por plano** (`src/lib/seats.ts`, decisão 2026-07-30):
  `PLAN_SEATS` fica **ao lado de `PLAN_PRICES`** em `src/lib/asaas.ts`
  (metadado de plano numa fonte só, mesmo motivo de nunca duplicar o preço):
  campo 1, fazenda 2, grupo 5. Três semânticas decididas com o usuário, todas
  intencionais: o **Owner ocupa assento** (campo = uso individual); usuário
  **desativado não ocupa** (trocar de funcionário não força upgrade); e o
  limite **nunca desativa ninguém retroativamente** (um tenant que caiu de
  plano e está acima do limite continua com todo mundo funcionando, só não
  convida nem reativa). Aplicado em `inviteUserAction` e
  `setUserActiveAction(true)`, com `SEAT_LIMIT_REACHED` (422) nomeando plano e
  limite. Na `inviteUserAction`, a checagem vem **depois** da duplicidade de
  email de propósito: responder "faça upgrade" a quem digitou um email já
  existente mandaria o cliente pagar por um problema que não é esse.
  `GET /api/v1/users` ganhou `meta.seats` (extensão aditiva) para a tela
  mostrar "N de M assentos" sem rota nova. Gap conhecido: nada valida assentos
  em massa fora desses dois pontos.
- **Gestão de usuários** (`src/lib/actions/users.ts`): convite gera senha
  temporária (`generateTempPassword`) mostrada **uma única vez** na resposta.
  **O convite NÃO envia email**, embora o projeto tenha canal de email desde
  2026-07-29 (ver seção Email): quem convida precisa passar a senha ao
  convidado por fora. Ligar o email aqui é melhoria pendente, não limitação
  de infra.
  Regras de "não pode editar/desativar a si mesmo" e "só Owner promove a
  Owner" ficam nas rotas (`api/v1/users/[id]/role`, `.../active`), não nas
  actions: a action em si é mais simples (`updateUserRoleAction`,
  `setUserActiveAction`) e só bloqueia desativar um `OWNER`.
- **`README.md`** é a porta de entrada e aponta para o `CLAUDE.md` em vez de
  repetir o que está lá. O `CONTRIBUTING.md` foi **apagado em 2026-08-18**: o
  repo é privado, de um autor só, sem `.github/` e sem nenhum PR mesclado pelo
  GitHub, então a função dele (guiar contribuidor externo) não existia aqui.
  Ele ainda ensinava o comando de teste errado. O que só existia nele foi para
  `.claude/rules/convencoes-codigo.md`.
