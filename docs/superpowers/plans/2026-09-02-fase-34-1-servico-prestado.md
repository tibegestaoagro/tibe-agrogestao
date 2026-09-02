# Fase 34.1 (serviço prestado): plano de implementação

> **Para quem executa:** use `superpowers:executing-plans` para tocar tarefa por
> tarefa. Os passos usam caixa (`- [ ]`) para marcação.

**Objetivo:** entregar o serviço PRESTADO com máquina própria: receita, conta a
receber com saldo aberto, o operador do §8, o histórico da máquina do §32, a
agenda do §39, e os serviços na ficha do contato (§37).

**Arquitetura:** a mesma `ServiceJob` da fase 33.2 ganha a direção `prestado`.
Tudo que já existe (o total derivado, o saldo aberto, o cancelamento, os logs)
vale nas duas direções; o que muda é o SINAL do dinheiro. Nenhum modelo novo.

**Stack:** Next.js 16 (App Router), Prisma 7, PostgreSQL 17, Zod 4, Redis, UI kit
próprio.

**Spec:** [2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md](../specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md),
com as quatro decisões da seção 3.2.

## Restrições globais

- **`tenant_id` nunca vem do client.** Model novo com `tenant_id` entra em
  `TENANT_SCOPED_MODELS`; `npm run test:isolation` reprova se faltar.
- **Regra de negócio em `src/lib/actions/*`**, nunca no route handler.
- **Ordem de entrega: action, depois rota, depois tela.**
- **Nunca use travessão** (U+2014). **Nunca escreva conteúdo com escape por
  heredoc:** use Edit/Write. O hook recusa, e ele está certo.
- **Banco e Redis locais, inline**:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`
  e `REDIS_URL="redis://127.0.0.1:6390"`. Use `127.0.0.1`, não `localhost`.
  ⚠️ O Redis local desta máquina é `tibe-redis-local` na porta **6390**, não a
  56379 do `CLAUDE.md`.
- **Migração antes do push**, e **quem aplica no Neon é o usuário**.
- **`npm run check` com 0 falhas** ao fim de cada tarefa que toca tela ou doc.
- **Commit ao fim de cada tarefa.** Branch: **`servico-prestado-fase-1`**, já
  criada. Merge e push na `main` exigem autorização explícita.
- **Suíte:** `m59` (nova). A `m58` continua sendo a do serviço CONTRATADO e não
  deve ser inflada, mas **precisa continuar verde**: esta fase altera
  `service-jobs.ts`, que ela cobre com 145 conferências.
- **Padrão de referência:** a fase 33.2 é o molde.
  `src/lib/actions/service-jobs.ts`, `src/app/api/v1/service-jobs/route.ts`,
  `src/components/servicos/service-job-form.tsx`,
  `src/lib/actions/whatsapp-handlers/servico.ts`.

## ⚠️ Quatro coisas que a fase 33.2 FIXOU e esta fase precisa abrir

Elas não eram descuido: `contratado` era a única direção, então o valor único era
o correto. Agora cada uma vira uma bifurcação, e **cada uma precisa de teste nas
duas pontas**.

| onde | o que está fixo hoje | o que passa a ser |
|---|---|---|
| `service-jobs.ts:337` | `status: "concluido"` sempre | `agendado` quando a data é futura |
| `service-jobs.ts:375` e `:483` | `entry_type: "expense"` | `income` no `prestado` |
| `service-jobs.ts:69` | `CATEGORIA = "Serviço terceirizado"` | "Serviço prestado" no `prestado` |
| `service-jobs.ts:220` | `machine_id` recusado sempre | aceito no `prestado`, recusado no `contratado` |

⚠️ **A recusa de `machine_id` NÃO some.** Ela existe pela decisão 10 (manutenção
de máquina é `MachineMaintenance`), e continua valendo para `contratado`: a
máquina de um terceiro não está na tabela `Machine` do produtor, então nem
poderia ser FK. No `prestado`, `machine_id` é a máquina DELE, e o §32 depende
dela.

---

## Task 1: o schema da 34.1

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20260905100000_servico_prestado/migration.sql`

**Interfaces:**
- Produz: `ServiceJob` ganha `client_location`, `implement`,
  `operator_worker_id`, `operator_note`.

- [ ] **Passo 1: os quatro campos**

Em `model ServiceJob`, junto de `machine_id`:

```prisma
  /// §10: ONDE o serviço aconteceu, quando foi fora daqui.
  ///
  /// `property_id` continua obrigatório e significa DE QUAL FAZENDA A MÁQUINA
  /// SAIU, que é informação real e útil. Este campo guarda o nome da fazenda e
  /// o município do cliente, que o §10 lista como opcionais.
  ///
  /// ⚠️ NÃO é uma `Property`: cadastrar a fazenda do vizinho poluiria Minha
  /// Fazenda e ofereceria ao rebanho, ao confinamento e ao leite um destino
  /// que não existe. E `property_id` não virou anulável de propósito: a coluna
  /// ficaria anulável para TODOS os serviços, e o filtro por fazenda ganharia
  /// um caso que ninguém lembra de tratar. Ver a decisão 13 da spec.
  client_location String?

  /// §7 de Máquinas: grade, arado, plantadeira. Texto livre e opcional, porque
  /// o documento diz "o preenchimento será opcional" e a lista termina em
  /// "Outro". Implemento não é modelo próprio: ele não tem histórico, custo
  /// nem manutenção separada da máquina que o puxa.
  implement String?

  /// §8: quem operou a máquina.
  ///
  /// A FK cobre funcionário fixo e diarista, que é o "reutilizar o mesmo
  /// cadastro" que o §8 pede em letra e o §36 repete. O texto cobre "próprio
  /// produtor", "outro" e o avulso. Três colunas (worker, contact e texto)
  /// foram descartadas: toda leitura checaria as três na ordem certa, e o
  /// prestador que OPERA a máquina é caso raro, porque normalmente ele é o dono
  /// do serviço. Ver a decisão 14 da spec.
  operator_worker_id String?
  operator_note      String?
```

E a relação, junto das outras:

```prisma
  operator Worker? @relation("ServiceJobOperator", fields: [operator_worker_id], references: [id], onDelete: SetNull)
```

Mais `@@index([operator_worker_id])` e `@@index([machine_id])`.

⚠️ **`Worker` já tem uma relação com `ServiceJob`** (`service_jobs`, o diarista
que ENTROU no serviço). Esta é uma segunda, com nome próprio. Em `model Worker`,
acrescente:

```prisma
  /// Os serviços que ele OPEROU (§8), diferente de `service_jobs`, que são
  /// aqueles em que ele entrou como diarista. Um tratorista pode operar a
  /// máquina num serviço prestado sem ser a contraparte dele.
  service_jobs_operated ServiceJob[] @relation("ServiceJobOperator")
```

- [ ] **Passo 2: validar, gerar e conferir a migração**

```
npx prisma format && npx prisma validate
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/mig-341.sql
grep -c "DROP" /tmp/mig-341.sql
```

Esperado: **0**. Se não for zero, leia o que ele quer derrubar antes de salvar;
os dois índices parciais (`WhatsAppProviderConfig_one_active` e
`AnimalBatch_tenant_ear_tag_key`) nunca podem cair.

Salve em `prisma/migrations/20260905100000_servico_prestado/migration.sql`, com
um cabeçalho dizendo o que foi conferido, no molde da migração anterior.

- [ ] **Passo 3: aplicar no local e conferir**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma generate
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:isolation
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:drift
docker exec tibe-pg psql -U tibe -d tibe_dev -t -c "SELECT indexname FROM pg_indexes WHERE indexname IN ('WhatsAppProviderConfig_one_active','AnimalBatch_tenant_ear_tag_key');"
```

Os dois índices têm que responder. Nenhum model novo, então
`TENANT_SCOPED_MODELS` não muda.

- [ ] **Passo 4: commit**

```
git add prisma
git commit -m "Schema: o local do cliente, o implemento e o operador"
```

⚠️ **Este commit mexe em schema.** Não vai para a `main` antes de o usuário
aplicar a migração no Neon.

---

## Task 2: a direção prestada nas actions

Esta é a tarefa que abre as quatro bifurcações da tabela acima.

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts`
- Criar: `scripts/m59-servico-prestado.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Consome: tudo da fase 33.2.
- Produz: `ServiceJobInput` ganha
  `direction?: "contratado" | "prestado"`, `client_location`, `implement`,
  `operator_worker_id`, `operator_note`. `ServiceJobView` ganha
  `client_location`, `implement`, `operator_worker_id`, `operator_note`,
  `machine_id`, `machine_name`, `operator_name`, `recebido`, `a_receber`.
- Produz também `SERVICOS_MECANIZADOS`, os 21 do §5 de Máquinas (gradagem,
  aração, subsolagem, nivelamento, plantio, semeadura, roçada, pulverização,
  adubação, aplicação de calcário, distribuição de fertilizante, colheita,
  ensilagem, corte de forragem, transporte, limpeza de área, abertura de
  estrada, manutenção de estrada, escavação, terraplanagem, outro).

⚠️ **A lista do §5 de Máquinas NÃO é a do §20 da Mão de Obra.** A que existe
hoje (`SERVICOS_SUGERIDOS`, 19 itens) é a de mão de obra, e tem "serviço
veterinário" e "eletricista", que nenhuma máquina faz; a de máquinas tem
"subsolagem" e "terraplanagem", que nenhuma delas tem. A tela oferece uma ou
outra conforme a direção. As duas são sugestão: `description` continua texto
livre nas duas pontas.

⚠️ **`pago` e `restante` continuam existindo e valendo para as duas direções**,
porque a soma é a mesma; `recebido` e `a_receber` são apelidos que a tela do
prestado usa para não dizer "pago" quando o dinheiro entrou. Derive um do outro
no `serializar`, **não** duplique a consulta.

- [ ] **Passo 1: escrever os blocos 1 a 4 da suíte**

Cabeçalho no molde da `m58` (`exigirBancoLocal()`, `check`, `process.exit`).

**Bloco 1, o exemplo do §13 de Máquinas:** roçada de 25 hectares a R$ 180 para o
João, com o trator, gera **receita** de R$ 4.500 e conta a **receber**.

A fixture, antes do bloco (a máquina é obrigatória no prestado, então ela vem
primeiro):

```ts
const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M59" }) });
// `Machine` exige property_id, name e type. Confira a assinatura real em
// `prisma/schema.prisma` antes de colar: ela não tem action de criação usada
// por suíte, então a `m59` cria direto pelo Prisma, como a `m51` faz com pasto.
const trator = await db.machine.create({
  data: scoped({ property_id: fazenda.id, name: "Trator Massey", type: "Trator" }),
});
```

```ts
console.log("1. §13 e §28: o serviço prestado gera RECEITA");
const roçada = await createServiceJob(db, {
  direction: "prestado",
  property_id: fazenda.id,
  occurred_at: new Date("2026-09-01T12:00:00.000Z"),
  description: "Roçada",
  pricing: "hectare",
  unit_price: 180,
  quantity: 25,
  machine_id: trator.id,
  contact_name: "João Vizinho",
  client_location: "Fazenda do João, Unaí",
});
check("cadastro devolve ok", roçada.ok, roçada.ok ? "" : roçada.message);
if (!roçada.ok) throw new Error("createServiceJob falhou");

check("total 4.500", roçada.data.total === 4500, String(roçada.data.total));
check("a receber 4.500", roçada.data.a_receber === 4500);
check("recebido 0", roçada.data.recebido === 0);

const lanc = await db.financialEntry.findFirst({
  where: { related_module: "servico", related_id: roçada.data.id },
});
check("o lançamento é RECEITA, não despesa", lanc?.entry_type === "income", String(lanc?.entry_type));
check("pendente (conta a receber)", lanc?.status === "pending");
check(
  "com a categoria do prestado, não a do terceirizado",
  lanc?.category === "Serviço prestado",
  String(lanc?.category),
);
check("e o local do cliente ficou gravado", roçada.data.client_location === "Fazenda do João, Unaí");
```

**Bloco 2, `machine_id` nas duas direções.** Aceito no `prestado`; **recusado no
`contratado`**, com a mensagem apontando para Máquinas. É a decisão 10, que não
some:

```ts
console.log("\n2. `machine_id`: aceito no prestado, RECUSADO no contratado");
check("no prestado, gravou a máquina", roçada.data.machine_id === trator.id);

const contratadoComMaquina = await createServiceJob(db, {
  direction: "contratado",
  property_id: fazenda.id,
  occurred_at: new Date(),
  description: "Manutenção do trator",
  pricing: "fechado",
  agreed_amount: 800,
  machine_id: trator.id,
});
check("no contratado, recusado", !contratadoComMaquina.ok);
check(
  "no campo machine_id, apontando para Máquinas",
  !contratadoComMaquina.ok && contratadoComMaquina.field === "machine_id",
  !contratadoComMaquina.ok ? String(contratadoComMaquina.field) : "aceitou",
);
```

**Bloco 3, o `status` que a 33.2 fixava em `concluido`:**

```ts
console.log("\n3. O status vem da DATA, e não é mais sempre `concluido`");
check("serviço de hoje nasce concluído", roçada.data.status === "concluido");

const amanha = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const futuro = await createServiceJob(db, {
  direction: "prestado",
  property_id: fazenda.id,
  occurred_at: amanha,
  description: "Gradagem",
  pricing: "hectare",
  unit_price: 200,
  quantity: 20,
  machine_id: trator.id,
  contact_name: "João Vizinho",
});
check("serviço marcado para o futuro nasce AGENDADO", futuro.ok && futuro.data.status === "agendado",
  futuro.ok ? futuro.data.status : "recusado");
```

**Bloco 4, as recusas próprias do prestado.** O §17 lista como obrigatórios
"Data; Tipo de serviço; Máquina; Cliente; Forma de cobrança; Quantidade
trabalhada ou valor fechado", então:

- sem `machine_id`, recusado no campo `machine_id` (o §32 depende dela);
- **sem cliente** (nem `contact_id` nem `contact_name`), recusado no campo
  `contact_name`. ⚠️ No `contratado` o cliente continua OPCIONAL, porque o §14
  da Mão de Obra descreve "vieram 3 homens" sem nome nenhum. A mesma coluna,
  duas exigências, e o teste cobra as duas pontas;
- máquina inexistente devolve 404 no campo `machine_id`;
- operador inexistente devolve 404 no campo `operator_worker_id`;
- `direction: "prestado"` com `worker_count` maior que 1 é aceito sem drama: um
  serviço prestado com dois operadores existe, e o multiplicador continua valendo.

E que nenhuma dessas recusas deixou serviço nem lançamento órfão.

- [ ] **Passo 2: acrescentar `"test:m59"` ao `package.json` e rodar**

Esperado: falha, porque `direction` ainda não é aceito.

- [ ] **Passo 3: implementar**

Cinco mudanças em `service-jobs.ts`, e o comentário de cada uma precisa dizer
**por que ela deixou de ser constante**:

1. `CATEGORIA` vira uma função:

```ts
/**
 * A categoria do lançamento, por direção. Era uma constante até a fase 34.1,
 * quando `prestado` chegou: "Serviço terceirizado" numa receita diria o
 * contrário do que aconteceu.
 */
const categoriaDe = (d: ServiceDirection) =>
  d === "prestado" ? "Serviço prestado" : "Serviço terceirizado";
```

2. `entry_type` nos DOIS lugares (`createServiceJob` e
   `recordServiceJobPayment`) passa a ser
   `direction === "prestado" ? "income" : "expense"`.

⚠️ **`recordServiceJobPayment` precisa LER a direção do job**, que ele já busca
no início. Não passe a direção por parâmetro: o chamador poderia mentir, e o
sinal do dinheiro é a última coisa que pode depender de quem chama.

3. `status` passa a vir da data:

```ts
  // Serviço marcado para o futuro está AGENDADO, e é isso que a agenda do §39
  // lista. Até a fase 33.2 tudo nascia `concluido`, o que estava certo quando
  // só existia o contratado (que se registra depois do fato) e passa a mentir
  // no prestado, que se marca antes.
  const status: ServiceJobStatus =
    input.occurred_at.getTime() > Date.now() ? "agendado" : "concluido";
```

4. A validação de `machine_id` inverte por direção:

```ts
  if (direction === "prestado") {
    if (!input.machine_id) {
      return fail(
        "VALIDATION_ERROR",
        "Escolha a máquina que fez o serviço.",
        422,
        "machine_id",
      );
    }
  } else if (input.machine_id) {
    // A decisão 10 continua valendo para o contratado: manutenção de máquina é
    // `MachineMaintenance`, e a máquina de um terceiro nem está na tabela
    // `Machine` deste produtor, então não poderia ser FK.
    return fail(
      "VALIDATION_ERROR",
      "Manutenção e serviço com máquina de terceiro são registrados em Máquinas, na ficha da própria máquina.",
      422,
      "machine_id",
    );
  }
```

5. `serializar` ganha `recebido` e `a_receber` como apelidos de `pago` e
   `restante`, e os campos novos.

- [ ] **Passo 4: rodar a `m59` E a `m58`**

⚠️ **A `m58` é a prova de que nada quebrou.** Ela tem 145 conferências sobre o
`contratado`, e esta tarefa mexeu no arquivo inteiro. Se ela ficar vermelha, o
trabalho para.

- [ ] **Passo 5: quebrar de propósito**

Faça `entry_type` voltar a ser `"expense"` fixo. O bloco 1 tem que acusar que a
receita virou despesa. Devolva. Depois faça `status` voltar a `concluido` fixo:
o bloco 3 tem que acusar. Devolva.

- [ ] **Passo 6: commit**

```
git add src/lib/actions/service-jobs.ts scripts/m59-servico-prestado.test.ts package.json
git commit -m "Servico: a direcao prestada, e as quatro constantes que viraram bifurcacao"
```

---

## Task 3: o recebimento (§26, §27)

**Arquivos:**
- Modificar: `src/lib/actions/service-jobs.ts`
- Modificar: `scripts/m59-servico-prestado.test.ts` (bloco 5)

- [ ] **Passo 1: escrever o bloco 5, o exemplo literal do §27**

R$ 8.000, recebe R$ 3.000, ficam R$ 5.000 a receber. É o espelho exato do §22 e
usa a MESMA função:

```ts
console.log("\n5. §27: o exemplo literal (8.000, recebe 3.000, ficam 5.000)");
const oitomil = await createServiceJob(db, {
  direction: "prestado",
  property_id: fazenda.id,
  occurred_at: new Date("2026-09-01T12:00:00.000Z"),
  description: "Ensilagem",
  pricing: "fechado",
  agreed_amount: 8000,
  machine_id: trator.id,
  contact_name: "Cliente do §27",
});
if (!oitomil.ok) throw new Error("createServiceJob falhou");

const parcial = await recordServiceJobPayment(db, {
  service_job_id: oitomil.data.id,
  amount: 3000,
});
check("recebimento parcial aceito", parcial.ok, parcial.ok ? "" : parcial.message);
check("recebido 3.000", parcial.ok && parcial.data.pago === 3000);
check("a receber 5.000", parcial.ok && parcial.data.restante === 5000);

const entries = await db.financialEntry.findMany({
  where: { related_module: "servico", related_id: oitomil.data.id },
});
check(
  "e os DOIS lançamentos são RECEITA",
  entries.length === 2 && entries.every((e) => e.entry_type === "income"),
  entries.map((e) => e.entry_type).join(","),
);
```

⚠️ **O caso que discrimina, e que a versão fraca perderia:** o lançamento de
recebimento também precisa ser `income`. Se `recordServiceJobPayment` continuar
criando `expense`, o serviço mostra "recebido 3.000" na tela **e o DRE registra
uma despesa de R$ 3.000**. O saldo bateria; o dinheiro estaria com o sinal
trocado.

Acrescente também: receber mais que o restante é recusado no campo `amount` (a
recusa já existe e vale para as duas direções, mas a mensagem diz "faltam", que
serve nas duas).

- [ ] **Passo 2: rodar, ver falhar, implementar, ver passar**

- [ ] **Passo 3: commit**

```
git add src/lib/actions/service-jobs.ts scripts/m59-servico-prestado.test.ts
git commit -m "Servico: o recebimento do §27, com o sinal certo nos dois lancamentos"
```

---

## Task 4: o histórico da máquina (§32) e a agenda (§39)

Duas consultas, nenhum modelo novo. Ficam juntas porque as duas são leitura
sobre `ServiceJob` e nenhuma sozinha justifica uma tarefa.

**Arquivos:**
- Criar: `src/lib/actions/machine-services.ts`
- Modificar: `scripts/m59-servico-prestado.test.ts` (blocos 6 e 7)

**Interfaces:**
- Produz:
  ```ts
  export type MachineServiceLine = {
    id: string; occurred_at: string; description: string;
    quantidade: number; pricing: string;
    contact_name: string | null; total: number;
  };
  export type MachineServiceSummary = {
    machine_id: string;
    servicos: number;
    quantidade_por_unidade: Record<string, number>;
    faturado: number;
    linhas: MachineServiceLine[];
  };
  export function getMachineServices(db, machineId: string): Promise<MachineServiceSummary>;

  export type AgendaLine = {
    id: string; occurred_at: string; description: string;
    contact_name: string | null; machine_name: string | null; status: string;
  };
  export function getServiceAgenda(db): Promise<{ hoje: AgendaLine[]; proximos: AgendaLine[] }>;
  ```

- [ ] **Passo 1: escrever os blocos 6 e 7**

O **bloco 6** é o exemplo do §32 ("Trator Massey: 12 horas de gradagem; Cliente
João"): dois serviços prestados com o mesmo trator somam as horas e o faturado,
e um serviço com OUTRA máquina **não entra**.

⚠️ **A soma é POR UNIDADE, não um número só.** Um trator que fez 12 horas de
gradagem e 25 hectares de roçada não trabalhou 37 de nada. `quantidade_por_unidade`
é um mapa `{ hora: 12, hectare: 25 }`, e somar tudo seria inventar uma unidade.

O **bloco 7** prova a agenda: um serviço de hoje aparece em `hoje`, um de daqui
a três dias aparece em `proximos`, um de ontem **não aparece em nenhum**, e um
cancelado também não.

- [ ] **Passo 2: rodar, ver falhar, implementar, ver passar**

`getServiceAgenda` filtra `status: { in: ["agendado", "em_andamento"] }` e
`canceled_at: null`, separando por `occurred_at` no dia de hoje em UTC.

- [ ] **Passo 3: quebrar de propósito**

Faça `quantidade_por_unidade` virar um número só somando tudo. O caso das duas
unidades tem que acusar. Devolva.

- [ ] **Passo 4: commit**

```
git add src/lib/actions/machine-services.ts scripts/m59-servico-prestado.test.ts
git commit -m "Servico: o historico da maquina do §32, somado POR UNIDADE, e a agenda do §39"
```

---

## Task 5: os serviços na ficha do contato (§37)

**Arquivos:**
- Modificar: `src/lib/actions/contacts.ts` (`getContactDetail`)
- Modificar: `scripts/m59-servico-prestado.test.ts` (bloco 8)
- Modificar: `src/app/(dashboard)/contatos/[id]/page.tsx`

**Interfaces:**
- Produz: `ContactDetailView` ganha
  `services: { id: string; occurred_at: string; description: string; direction: string; total: number }[]`.

- [ ] **Passo 1: escrever o bloco 8**

Prova que a ficha de um contato traz os serviços **das duas direções**, do mais
recente para o mais antigo, e que um serviço de OUTRO contato não aparece.

⚠️ **Um caso que não pode faltar:** o contato que só tem serviço e nenhuma
negociação continua devolvendo `ok`, com `negotiations: []`. É o caso comum de
um pedreiro, e uma implementação que assuma negociação quebraria nele.

- [ ] **Passo 2: rodar, ver falhar, implementar, ver passar**

- [ ] **Passo 3: a tela**

Em `/contatos/[id]`, uma seção "Serviços" ao lado de "Negócios", com link para
`/servicos/[id]`. É o §37 atendido: "o que já fiz com o João" passa a ter uma
resposta só.

- [ ] **Passo 4: `npm run check`, e commit**

```
git add src/lib/actions/contacts.ts "src/app/(dashboard)/contatos" scripts/m59-servico-prestado.test.ts
git commit -m "Contatos: os servicos na ficha, que e o §37 sem reabrir Negociacoes"
```

---

## Task 6: as rotas

**Arquivos:**
- Modificar: `src/app/api/v1/service-jobs/route.ts` (aceitar `direction` e os
  campos novos)
- Criar: `src/app/api/v1/machines/[id]/services/route.ts`
- Modificar: `src/app/(public)/docs/api/endpoints.ts`

- [ ] **Passo 1: o schema Zod de `POST /service-jobs`**

Acrescente `direction: z.enum(["contratado", "prestado"]).optional()`,
`client_location`, `implement`, `operator_worker_id`, `operator_note`, e
`machine_id` (que já estava no schema e era recusado pela action).

- [ ] **Passo 2: `GET /machines/:id/services`**

O histórico do §32, guard `maquinas:read` (é a ficha da máquina, e quem vê a
máquina vê o que ela fez).

- [ ] **Passo 3: `/docs/api`, `test:docs-api`, `check`, `tsc`**

- [ ] **Passo 4: provar a recusa contra o servidor**

Com `next dev` de pé, mande `POST /api/v1/service-jobs` com
`direction: "prestado"` e sem `machine_id`. A resposta tem que ser português com
`field: "machine_id"`.

- [ ] **Passo 5: commit**

---

## Task 7: as telas

**Arquivos:**
- Modificar: `src/components/servicos/service-job-form.tsx`
- Modificar: `src/app/(dashboard)/servicos/page.tsx`
- Modificar: `src/app/(dashboard)/servicos/[id]/page.tsx`
- Modificar: `src/app/(dashboard)/maquinas/[id]/page.tsx` (ou a tela de
  máquinas: confira onde fica a ficha antes de escrever)
- Modificar: `src/components/servicos/labels.ts`

- [ ] **Passo 1: o formulário ganha a direção**

Um seletor no topo: "Contratei de fora" ou "Prestei com minha máquina". Ele
comanda o resto da tela, e é a primeira pergunta porque muda tudo.

⚠️ **Campo que some não pode ser cobrado.** `machine_id`, `implement`,
`operator_*` e `client_location` só aparecem no `prestado`; a cobrança deles
tem que ser condicionada à visibilidade, como já é para `unit_price` e
`agreed_amount`.

⚠️ **Todo campo do `ORDEM` precisa de `error=` no `<Field>`** (conferência 15).

- [ ] **Passo 2: a listagem separa as duas direções**

Duas seções, ou uma coluna de direção. E os números do topo ganham "a receber"
ao lado de "a pagar": misturar os dois num número só esconderia o sinal.

- [ ] **Passo 3: a ficha usa o vocabulário certo**

No `prestado`, "Recebido" e "A receber", não "Pago" e "Restante". É a mesma
soma; o que muda é de quem é o dinheiro.

- [ ] **Passo 4: o histórico na ficha da máquina (§32)**

"Trator Massey: 12 horas de gradagem, cliente João" e o faturado.

- [ ] **Passo 5: a agenda na tela de Serviços (§39)**

"Hoje" e "Próximos", com data, cliente, serviço e máquina, como o §39 lista.

- [ ] **Passo 6: `check`, `tsc`, `lint`**

- [ ] **Passo 7: validar no navegador (invariante 8)**

⚠️ **Reinicie o `next dev` antes** se o schema mudou desde que ele subiu: o
servidor serve o client Prisma que existia quando começou. Está em
`docs/conhecimento/dev-server-servido-com-client-prisma-velho.md` e já mordeu
duas vezes nesta sequência.

Confirme, olhando: o §13 (25 hectares a 180 dá R$ 4.500), o §27 (recebe 3.000
de 8.000, ficam 5.000), a receita aparecendo em `/financeiro` como **Receita** e
não despesa, o histórico na ficha da máquina, e a agenda com um serviço futuro.

⚠️ Use o **browser-harness**, não o `claude-in-chrome`. Abra **aba nova**
(`new_tab`), porque o Chrome pode estar em uso.

- [ ] **Passo 8: commit**

---

## Task 8: o handler do WhatsApp

**Arquivos:**
- Modificar: `src/lib/actions/whatsapp-handlers/servico.ts`
- Modificar: `src/lib/actions/service-pending.ts` (campos novos)
- Modificar: `src/lib/whatsapp-intents.ts`, `src/lib/actions/whatsapp-router.ts`
- Modificar: `scripts/m59-servico-prestado.test.ts`

- [ ] **Passo 1: a intenção `registrar_servico_prestado`**

O §42 de Máquinas: "Amanhã vou gradear 20 hectares para o João a 180 reais o
hectare" pede confirmação mostrando "total previsto de R$ 3.600".

⚠️ **No segundo turno, mande APENAS o campo que faltava.** O classificador não
remonta o pedido.

⚠️ **A máquina é obrigatória no prestado**, então o handler precisa perguntá-la,
e resolver ambiguidade **perguntando** (dois tratores com "Massey" no nome),
copiando a forma de `resolverTrabalhador` e `resolverPrestador`, que já resolvem
isso.

- [ ] **Passo 2: rodar, implementar, e provar as travas quebrando**

As mesmas três de sempre: recusa cancela; o "sim" executa o MOSTRADO;
ambiguidade pergunta.

- [ ] **Passo 3: commit**

---

## Task 9: fechar a rodada

- [ ] **Passo 1: `npm run test:all`**

- [ ] **Passo 2: as dívidas**

Nada desta fase fecha dívida conhecida. **Confira antes de escrever que fecha:**
a §2.10 (o rótulo "Prestador") fica PIOR com esta fase, porque agora há receita
sob o mesmo rótulo. Reescreva o item dizendo isso.

- [ ] **Passo 3: o handoff**

Substitua "Estado atual". Se passar de 200 linhas, arquive antes.

- [ ] **Passo 4: a lição no cofre, se houver**

Procure antes de criar. Se nada surpreendeu, não invente nota.

- [ ] **Passo 5: commit e parar**

⚠️ **Não faça merge nem push.** A migração precisa ir ao Neon antes, e os dois
passos são do usuário.
