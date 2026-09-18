# Telefone sempre com o nono dígito, e o selo de conta interna

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o agente do WhatsApp reconhece quem tem WhatsApp com número antigo (sem o nono dígito), e o usuário passa a marcar pelo painel as contas internas que não devem vencer, sem precisar prorrogar trial à mão.

**Architecture:** duas mudanças independentes. A do telefone é na raiz: `toBrazilPhoneDigits` (`src/lib/phone.ts`) já é o funil por onde TODO telefone entra no banco, e passa a completar o nono dígito; o reconhecimento da mensagem (`identificarContato`) passa a usar o mesmo funil. A do selo é um campo novo no `Tenant`, que o acesso por cobrança respeita e que só o painel da Plataforma liga e desliga.

**Tech Stack:** Next.js 16, Prisma 7 (migração no Neon), Zod 4, painel da Plataforma (segunda instância NextAuth).

## O diagnóstico, de 18/09/2026

Três tenants da equipe (Lucas, Laíza e Max Agromax) não conseguiam usar o sistema:

| sintoma | causa | é defeito? |
|---|---|---|
| "número não reconhecido pelo Tibé" (Lucas e Max) | cadastrados com 13 dígitos (`5538997449264`), e o WhatsApp deles manda **12**, sem o 9. Conta de WhatsApp criada antes da mudança do nono dígito guarda o número antigo. `identificarContato` compara exato | **sim, e geral**: atinge todo produtor com WhatsApp antigo, que no campo é o normal |
| "tempo expirado" (os três) | trial de 14 dias criado em 28/07, vencido em 11/08 | não: é o trial. Mas contas internas não deveriam vencer, e a plataforma não tem como dizer isso |
| "perfis: nenhum" (Lucas e Max) | tenant criado pelo painel nasce sem perfil de propósito; o perfil é escolhido no primeiro login, e eles nunca chegaram lá | não: resolve quando entrarem |

Medido em produção:

```
Lucas: WhatsApp manda 553897449264  -> casa exato: 0 | com o 9 (5538997449264): 1
Max:   WhatsApp manda 553899925508  -> casa exato: 0 | com o 9 (5538999925508): 1
```

## Decisões do usuário, de 18/09/2026

| tema | decisão |
|---|---|
| telefone | forma canônica é **55 + DDD + 9 + oito dígitos**. Ninguém é obrigado a digitar o 9: o sistema completa **ao cadastrar e ao reconhecer** |
| trial das contas da equipe | **não prorrogar à mão**: um selo que o usuário controla pelo painel, e que tira o vencimento. Cliente novo continua com os 14 dias de sempre |

## Global Constraints

- **Telefone fixo NÃO ganha o 9.** Fixo começa com 2, 3, 4 ou 5 depois do DDD, e WhatsApp Business funciona em fixo. A regra é a das operadoras: só completa o 9 quando o número tem 12 dígitos, começa com `55`, e o primeiro dígito depois do DDD é **6, 7, 8 ou 9**. Caso de fixo é teste obrigatório.
- **Um funil só.** Todo lugar que grava ou compara telefone passa por `toBrazilPhoneDigits`. Não criar uma segunda função de normalização.
- **Toda escrita em produção mostra antes o que vai gravar**: a lista da conversão e a conferência de colisão vão para o usuário antes do `UPDATE`.
- **O selo nasce desligado** (`@default(false)`). Tenant novo continua com trial de 14 dias; nada no cadastro público muda.
- **O selo só é alterado pela Plataforma** (segunda instância NextAuth), nunca pelo próprio tenant.
- **Migração antes do push** (invariante 3). O campo novo entra no Docker local, roda as suítes, e só então no Neon.
- `tenant_id` nunca vem do client.
- URLs inline sempre: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"`.
- Nunca travessão (U+2014). Commits em português, `git add` só dos arquivos tocados.

---

### Task 1: o nono dígito no funil

**Files:**
- Modify: `src/lib/phone.ts`
- Modify: `src/lib/actions/whatsapp-contato.ts`
- Test: suíte nova `scripts/m71-telefone.test.ts` (próximo número livre, conferir no `package.json`)

**Interfaces:**
- `toBrazilPhoneDigits(phone)` passa a devolver a forma canônica: 13 dígitos para celular brasileiro, com o 9; fixo e número estrangeiro ficam como estão.

- [ ] **Step 1: os casos, escritos antes**

```ts
// Os dois números reais que falharam em produção.
check("Lucas sem o 9 ganha o 9", toBrazilPhoneDigits("553897449264") === "5538997449264");
check("Max sem o 9 ganha o 9", toBrazilPhoneDigits("553899925508") === "5538999925508");
// Idempotente: quem já tem o 9 não ganha outro.
check("com o 9 fica igual", toBrazilPhoneDigits("5538997449264") === "5538997449264");
// Sem DDI: ganha 55 e o 9.
check("so DDD e numero antigo", toBrazilPhoneDigits("3897449264") === "5538997449264");
// FIXO: nunca ganha o 9.
check("fixo com DDI fica igual", toBrazilPhoneDigits("553832214567") === "553832214567");
check("fixo sem DDI ganha so o 55", toBrazilPhoneDigits("3832214567") === "553832214567");
// Formatação solta.
check("com mascara", toBrazilPhoneDigits("+55 (38) 9744-9264") === "5538997449264");
// Estrangeiro não é mexido.
check("numero de fora", toBrazilPhoneDigits("14155552671") === "14155552671");
```

E o caso de ponta a ponta: um usuário cadastrado com `5538997449264` é **reconhecido** por `identificarContato("553897449264")`.

- [ ] **Step 2: rodar e ver FALHAR**
- [ ] **Step 3: implementar em `phone.ts`, e trocar `normalizePhone` por `toBrazilPhoneDigits` em `identificarContato`**, inclusive na criação do `WhatsAppContact`, senão o contato nasce com o número de 12 dígitos
- [ ] **Step 4: `grep` por todo outro lugar que compara telefone** (`whatsapp-buffer`, a caixa de saída, o banco de provas) e conferir que passa pelo mesmo funil
- [ ] **Step 5: rodar `m71`, `m68`, `m67`, `test:isolation`, e commitar**

---

### Task 2: o envio continua chegando?

**Por que é uma task:** a Task 1 faz o Tibé **gravar** o número com o 9. Resposta de conversa não corre risco, porque ela volta para o número de onde veio a mensagem. Mas **alerta e resumo diário são enviados ao número cadastrado**. Se o WhatsApp de alguém só existe sem o 9, o envio para o número com o 9 pode falhar.

- [ ] **Step 1: perguntar à Evolution, sem mandar mensagem**

A Evolution tem uma consulta que diz se um número existe no WhatsApp e qual é o identificador real dele, **sem enviar nada**. Consultar os dois formatos do Lucas e do Max e registrar o que ela devolve.

- [ ] **Step 2: decidir com o resultado**

Se a Evolution resolve o número com o 9 para o identificador certo, nada a fazer. Se não resolve, o envio precisa usar o identificador que a própria Evolution devolve, e isso vira uma task nova. **Não mandar mensagem de teste a ninguém sem autorização do usuário**: Lucas e Max são pessoas reais.

---

### Task 3: converter os telefones já cadastrados

**Files:**
- Create: `scripts/converter-telefones.ts` (roda uma vez, fica no repositório como registro)

- [ ] **Step 1: modo leitura primeiro**

O script, sem argumento, **só lista**: cada `User.phone` e `WhatsAppContact.phone` que mudaria, o antes e o depois, e o tenant. E **para com erro** se a conversão fizer dois registros virarem o mesmo número (hoje `identificarContato` escolheria um deles por sorteio).

- [ ] **Step 2: rodar em leitura contra produção e mostrar ao usuário**
- [ ] **Step 3: com o "sim" dele, rodar com `--gravar`**, e conferir lendo de volta

---

### Task 4: o selo de conta interna

**Files:**
- Modify: `prisma/schema.prisma` (`Tenant.conta_interna Boolean @default(false)`)
- Create: migração em `prisma/migrations/`
- Modify: `src/lib/billing-access.ts`
- Modify: a ação e a rota da Plataforma que editam tenant
- Modify: a tela da Plataforma com a lista e a edição de tenant
- Test: a suíte de acesso por cobrança e a da Plataforma

- [ ] **Step 1: casos que falham**

1. tenant com o selo e trial vencido tem acesso **total**;
2. tenant sem o selo e trial vencido continua bloqueado como hoje;
3. tenant novo nasce **sem** o selo;
4. **só a Plataforma** muda o selo: a rota do tenant não aceita o campo.

- [ ] **Step 2: migração no Docker local, suítes, e só então no Neon**, com `migrate status` conferido antes do push
- [ ] **Step 3: o selo aparece na lista de tenants da Plataforma**, para o usuário ver de relance quem é conta interna

---

### Task 5: fechar

- [ ] Handoff, pendências (o que o usuário faz: marcar Lucas, Laíza e Max no painel), e dívidas se algo ficar de fora.

---

## Critério de pronto

1. `identificarContato("553897449264")` reconhece o Lucas, provado por teste e depois por mensagem real dele.
2. Fixo não ganha o 9, provado por teste.
3. Nenhum telefone cadastrado mudou sem o usuário ter visto a lista antes.
4. O usuário marca uma conta como interna pelo painel, e ela deixa de vencer; cliente novo continua com 14 dias.
