# Contribuindo com o Tibé

Este projeto é conduzido em módulos (0 a 6), cada um implementado a partir de uma
spec em [`docs/specs/`](docs/specs/), com o [PRD](docs/tibe-prd.md) como fonte de
verdade para modelo de dados e contratos de API. Antes de mudar algo, vale ler a
spec do módulo relacionado — a arquitetura tem decisões deliberadas que nem sempre
são óbvias só olhando o código (ver `/docs/arquitetura` no app).

## Convenções de código

- **TypeScript estrito.** Evite `any`; prefira tipar o retorno de funções públicas.
- **Nomenclatura:** modelos Prisma em PascalCase, campos em snake_case (espelham
  os contratos de API, que também usam snake_case).
- **Isolamento multi-tenant é inegociável.** Toda query de negócio usa o client
  escopado (`getTenantDb()` / `prismaForTenant()`), nunca um filtro manual de
  `tenant_id`. Se você está adicionando um modelo novo com `tenant_id`, inclua-o
  em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`). Ver `/docs/arquitetura` no app
  para a lista completa e justificada das exceções legítimas.
- **Lógica de negócio vive em `src/lib/actions/*.ts`**, como funções que recebem o
  client escopado e devolvem `ActionResult<T>` (`{ ok: true, data } | { ok: false,
  code, message, status }`). Rotas HTTP são wrappers finos: validam com Zod, chamam
  a action, serializam a resposta. Não duplique regra de negócio dentro de uma
  rota — se o agente WhatsApp e o painel web precisam da mesma ação, os dois devem
  chamar a mesma função em `lib/actions`.
- **Contrato de resposta:** sucesso é sempre `{ data, meta }`, erro é sempre
  `{ error: { code, message } }`, via `apiOk`/`apiError` (`src/lib/api.ts`). Não
  invente um formato novo para um endpoint específico.
- **Serialização:** Prisma devolve `Decimal`/`Date`; a API devolve `number`/string
  ISO 8601. Use `decToNum()`/`isoOrNull()` (`src/lib/serialize.ts`) ou os
  serializers prontos (`src/lib/serializers.ts`) — não formate objetos Prisma à
  mão numa resposta.
- **Validação de entrada** com Zod em toda rota que recebe corpo de requisição.
- **Não adicione abstração, configuração ou tratamento de erro para casos que não
  existem.** Três linhas parecidas são melhores que uma abstração prematura. Se
  notar algo assim no código existente, é mais provável que exista um motivo (leia
  o comentário/spec) do que seja descuido.
- **Comentários só quando o "porquê" não é óbvio** (uma decisão não trivial, uma
  contorno de bug específico, um desvio deliberado da spec). Não comente o que o
  código já diz por si.

## Testes

Toda mudança que adiciona ou altera um endpoint deve rodar (e, se for endpoint
novo, ganhar cobertura em) os scripts de isolamento correspondentes:

```bash
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"  # PowerShell
npm run test:isolation   # sempre, se a mudança tocar em modelos/rotas
npm run test:m1          # Rebanho/Lavoura
npm run test:m2          # Prestador
npm run test:m3          # Agente WhatsApp
npm run test:m4          # Financeiro/Alertas
npx tsc --noEmit          # type-check completo
```

Novos endpoints seguem o padrão dos scripts existentes em `scripts/`: chamam o
route handler diretamente com um `Request` construído (sem precisar subir um
servidor), criam dois tenants de teste e confirmam que um nunca enxerga dado do
outro.

## Commits

O histórico usa mensagens curtas em português, no formato `Módulo N: descrição`
para trabalho de um módulo inteiro (normalmente um commit por módulo, já que cada
um só é fechado depois de validado), ou uma descrição curta e direta para mudanças
pontuais fora do ciclo de módulos. Escreva a mensagem em torno do **porquê**, não
de uma lista do que mudou linha a linha.

## Processo de PR

1. Branch a partir de `main`.
2. Abrir o PR gera automaticamente um preview deployment na Vercel com uma branch
   de banco Neon isolada — teste ali antes de pedir revisão.
3. Rode os testes relevantes e `npx tsc --noEmit` antes de abrir o PR.
4. Mudanças de produto ou arquitetura que a spec do módulo não resolve devem ser
   alinhadas com o responsável pelo produto antes da implementação — não assuma
   em silêncio. Extensões aditivas ao contrato (campo novo que não quebra nada
   existente) são aceitáveis se documentadas no PR.
5. Merge em `main` dispara deploy automático de produção — não há um ambiente de
   staging intermediário além dos previews de PR.
