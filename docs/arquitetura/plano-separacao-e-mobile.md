# Plano de arquitetura: separação e aplicativo React Native

**Data:** 31 de julho de 2026
**Autor:** Pleno Digital (análise técnica)
**Vocabulário:** módulo, interface, seam, adapter, profundidade, alavancagem,
localidade (ver `mattpocock-skills:codebase-design`)

---

## 1. Conclusão primeiro

**A separação que você quer já existe. Ela só não está empacotada.**

O seam entre regra de negócio e transporte foi criado no Módulo 3, quando as
actions foram extraídas de dentro das rotas. Hoje `src/lib/actions/*` é um
módulo profundo: interface pequena (funções que recebem um client escopado e um
objeto de entrada, devolvem `ActionResult<T>`), implementação grande (toda a
regra de rebanho, financeiro, cobrança, agente).

E esse seam **já tem dois adapters em produção**, o que segundo o critério de
desenho é o que separa um seam real de um hipotético:

| Adapter | Consumidor |
|---|---|
| `/api/v1/*` | Painel web (componentes client) |
| `/api/internal/whatsapp/execute-action` | Agente WhatsApp via n8n |

O aplicativo React Native seria o **terceiro adapter no mesmo seam**. Não é um
seam novo. É a prova de que o desenho estava certo.

### O que o teste da deleção diz sobre separar o back-end em deploy próprio

Imagine deletar o back-end separado e voltar tudo para o Next.js. A complexidade
desaparece ou reaparece nos chamadores?

**Desaparece.** Some um pipeline de deploy, some CORS, some a necessidade de
token para o próprio web, e somem cerca de quinze páginas Server Component que
hoje leem o banco direto e teriam que ser reescritas para consumir HTTP.

Nenhum comportamento é perdido. Isso caracteriza o back-end separado como
**módulo raso**: interface enorme (superfície HTTP, autenticação, versionamento,
deploy, latência de rede) com implementação fina, porque ele apenas repassa
chamadas para as mesmas actions.

**Recomendação:** não separar em três deploys. Separar por **contrato**, não por
infraestrutura. Você obtém back-end, front-end e mobile com fronteiras nítidas,
sem pagar a reescrita das páginas nem dobrar a operação.

Se, mesmo assim, a separação física for exigência comercial ou contratual, ela
fica **muito mais barata depois** deste plano do que antes dele, porque o
contrato já estará formalizado. É uma porta que continua aberta.

---

## 2. Os cinco seams, analisados

### 2.1 Seam de regra de negócio (existe, saudável)

**Interface:** `action(db: TenantPrismaClient, input) => Promise<ActionResult<T>>`

**Profundidade:** alta. Quem chama `createServiceOrderAction` não precisa saber
de precificação, cálculo de total, status inicial por data nem geração de
lançamento financeiro. Aprende uma assinatura e recebe todo o comportamento.

**Invariante que faz parte da interface, mesmo sem estar no tipo:** o `db`
precisa ser escopado por tenant e resolvido da sessão no servidor. Isso é a
regra mais importante do projeto e hoje depende de disciplina humana.

**Melhoria de profundidade recomendada:** transformar essa invariante em
garantia de tipo, com marca (`branded type`) em `TenantPrismaClient`, de forma
que só `prismaForTenant()` consiga produzir um valor desse tipo. Passar um
client não escopado deixa de compilar. É pouca linha de código e move uma regra
de "todo mundo precisa lembrar" para "o compilador não deixa esquecer".

**Ação:** manter o seam onde está. Não mover para pacote separado agora.

### 2.2 Seam de identidade (existe para web, falta adapter para mobile)

Este é **o ponto de maior alavancagem do plano inteiro**.

Hoje `guard()` chama `getSessionUser()`, que lê o cookie do NextAuth. O
aplicativo não usa cookie de sessão: precisa de token.

**O erro a evitar:** criar rotas paralelas para mobile. Isso duplicaria a
superfície e faria toda regra nova precisar ser escrita duas vezes.

**O desenho correto:** `getSessionUser()` vira um seam com **dois adapters**,
resolvendo a mesma identidade por caminhos diferentes:

| Adapter | Como chega a identidade |
|---|---|
| Cookie (existente) | Sessão NextAuth |
| Bearer token (novo) | Cabeçalho `Authorization`, JWT curto + refresh |

Ambos produzem o **mesmo** `SessionUser`. A partir daí, `guard()`,
`requireSessionGateApi()` e o escopo de tenant funcionam sem alteração.

**Alavancagem:** uma função alterada e cerca de trinta rotas passam a atender o
aplicativo, sem tocar em nenhuma delas. É o melhor retorno por linha do projeto.

**Localidade:** a decisão "como esta requisição prova quem é" fica num lugar só.
Quando o token expirar, girar ou mudar de formato, muda ali.

**Atenção de segurança:** `session-gate.ts` (troca obrigatória de senha, plano
confirmado, perfil ativo) é um seam **diferente**, sobre estado de autorização,
não sobre transporte de identidade. Os dois não devem se misturar, e o token
precisa passar pelo gate exatamente como a sessão passa.

### 2.3 Seam de contrato (existe informalmente, precisa ser formalizado)

Hoje os schemas Zod moram dentro de cada arquivo de rota, e `/docs/api` é um
array mantido à mão. Já registramos que isso é fonte de divergência.

**Proposta:** `packages/contracts`, contendo **apenas** schemas Zod e tipos
inferidos. Sem Prisma, sem regra de negócio, sem dependência de servidor.

**Por que isso é profundo:** o aplicativo importa `z.infer<typeof
AnimalListResponse>` e ganha segurança de tipo de ponta a ponta, sem geração de
código, sem runtime novo e sem passo de build extra. Um pacote pequeno que
elimina uma classe inteira de erro.

**Efeito colateral bom:** `/docs/api` passa a poder ser gerado dos mesmos
schemas, e a divergência entre documentação e código deixa de ser possível.

**Regra de fronteira, que precisa ser mecânica e não combinada:** o aplicativo
**nunca** importa de `src/lib`. Se importar, arrasta Prisma para o bundle e a
build quebra de formas confusas. Isso vira regra de lint, não recomendação.

### 2.4 Seam de entrega de notificação (novo, motivado por custo)

Com a cobrança da Meta a partir de outubro, cada mensagem de saída tem preço.
Push é gratuito.

**Interface proposta:** `notify(user, message, urgency)`, com adapters de push,
WhatsApp e email, escolhidos por política e não pelo chamador.

**Profundidade:** quem dispara um alerta não decide canal. A política ("push
primeiro; WhatsApp quando for crítico e precisar de comprovação; email sempre
que precisar de rastro") mora dentro do módulo.

**Estado atual:** `alert-delivery.ts` já faz metade disso, escolhendo entre
WhatsApp e email. Ganha um terceiro adapter e uma política explícita.

### 2.5 Seam de aplicativo (novo)

O aplicativo é um adapter do seam de contrato. Ele **não** tem regra de negócio.
Se aparecer regra dentro dele, é sinal de que ela deveria estar numa action.

Essa é a linha que mantém o custo de manter dois clientes sob controle: dois
adapters, uma implementação.

---

## 3. Plano priorizado

A ordem é por **desbloqueio**, não por facilidade. Cada fase só existe se
destravar a seguinte ou entregar valor sozinha.

### Fase 0: fundação do contrato e da identidade (bloqueante)

Sem isto, o aplicativo não tem como existir.

1. **Token de acesso para mobile**, no seam de identidade (2.2), com emissão,
   renovação e revogação. Cookie continua valendo para o web.
2. **`packages/contracts`** com os schemas do que o aplicativo vai consumir
   primeiro (autenticação, rebanho, financeiro, alertas).
3. **Marca de tipo no client escopado** (2.1), fechando por compilador a regra
   de isolamento.
4. **Regra de lint** proibindo o aplicativo de importar `src/lib`.

### Fase 1: PWA e push (maior retorno imediato)

Independe do React Native e já corta custo de mensagem.

5. Manifesto, service worker e instalação na tela inicial.
6. **Push web** e o seam de notificação (2.4), com política de canal.
7. Migrar os alertas para push primeiro, WhatsApp como reforço.

### Fase 2: aplicativo React Native

8. Esqueleto Expo, navegação, sessão com token, armazenamento seguro.
9. Telas de leitura: início, rebanho, contas a pagar e receber.
10. Telas de escrita: registro rápido, com o mesmo padrão de confirmação do
    agente.
11. Push nativo, reusando o seam da fase 1.

### Fase 3: produto (do documento do cliente)

12. Rebanho por categoria e quantidade.
13. Compra e venda em lote integradas.
14. Máquinas, Meu Dia, Calculadora Pecuária.

**Observação importante de sequência:** a Fase 3 mexe no schema e nas actions de
rebanho. Se ela rodar **ao mesmo tempo** que a extração de contratos daquele
domínio, haverá conflito garantido. Por isso rebanho é o único domínio cujo
contrato deve ser extraído **depois** da mudança de modelo, e não antes.

---

## 4. Plano de execução com múltiplos agentes

### A restrição que define o desenho

Agentes em paralelo não podem editar o mesmo arquivo. Portanto **fronteira de
módulo vira fronteira de agente**, e três recursos são globais e precisam ser
serializados:

| Recurso global | Por quê | Regra |
|---|---|---|
| `prisma/schema.prisma` e migrações | Duas migrações simultâneas divergem o histórico | Um agente por vez, com trava explícita |
| `package.json` | Conflito em toda instalação de dependência | Dependências declaradas de uma vez, no início da onda |
| `src/lib/prisma.ts` (lista de modelos escopados) | Todo modelo novo passa por aqui | Alterado só pelo agente dono do schema |

### Onda 1: fundação (3 agentes em paralelo)

| Agente | Escopo exclusivo | Entrega |
|---|---|---|
| **A1 Identidade** | `src/lib/auth*`, `src/lib/api-guard.ts`, `src/app/api/v1/auth/**` | Token, renovação, revogação e o adapter no seam de identidade |
| **A2 Contratos** | `packages/contracts/**` (novo, sem colisão) | Schemas de autenticação, financeiro e alertas |
| **A3 PWA** | `public/**`, `src/app/manifest.ts`, service worker | Instalável e pronto para push |

Sem interseção de arquivos. A1 é o caminho crítico.

**Checkpoint de integração 1:** o aplicativo consegue autenticar e ler uma rota
protegida com token. Sem isso, a Onda 2 não começa.

### Onda 2: canal e cliente (3 agentes em paralelo)

| Agente | Escopo exclusivo | Entrega |
|---|---|---|
| **B1 Notificação** | `src/lib/notify/**`, `src/lib/actions/alert-delivery.ts` | Seam de notificação com push, WhatsApp e email |
| **B2 Mobile** | `apps/mobile/**` (novo) | Esqueleto Expo, sessão, telas de leitura |
| **B3 Economia de mensagem** | `src/lib/actions/whatsapp-handlers/**`, workflow n8n | Consolidar respostas, encurtar cadastro guiado, resumo diário |

B3 é o que já identificamos como reversão da fragmentação e corte de custo. Não
depende das outras duas.

**Checkpoint 2:** um alerta chega por push no aplicativo, sem passar pelo
WhatsApp.

### Onda 3: produto (2 agentes, com um serializado)

| Agente | Escopo exclusivo | Observação |
|---|---|---|
| **C1 Rebanho por categoria** | `prisma/schema.prisma`, `src/lib/actions/animals.ts`, herd novo | **Dono exclusivo do schema nesta onda.** Nenhum outro agente migra |
| **C2 Calculadora Pecuária** | `src/lib/calculadoras/**`, páginas próprias | Zero schema, zero colisão. Pode rodar junto com qualquer coisa |

C2 é o candidato ideal a paralelismo: cálculo puro, sem banco, sem integração.

### Regras de operação da frota

1. **Cada agente entrega em branch própria** e roda a suíte de testes antes de
   pedir integração.
2. **Contrato de entrada de cada agente:** os arquivos que ele pode tocar, os
   que não pode, e o teste que prova a entrega. Sem isso, a paralelização vira
   conflito.
3. **Nenhum agente faz merge na `main` sozinho.** Integração é ponto de decisão
   humana, e continua sendo.
4. **Testes são o cinto de segurança.** Os cerca de vinte scripts existentes
   chamam actions e rotas direto, sem subir servidor, então continuam válidos
   durante toda a refatoração. Quebra de teste em agente paralelo é sinal de
   invasão de escopo.
5. **Um agente por recurso global.** Schema, `package.json` e lista de modelos
   escopados nunca em paralelo.

---

## 5. Riscos e como tratamos

| Risco | Por que é real | Tratamento |
|---|---|---|
| Regra de negócio migrar para dentro do aplicativo | É o caminho de menor esforço quando falta um endpoint | Revisão específica: qualquer cálculo dentro de `apps/mobile` volta para uma action |
| Token quebrar o isolamento de tenant | `tenant_id` no token é tentador e seria uma brecha grave | O tenant continua sendo resolvido no servidor a partir do usuário, nunca lido do token |
| Dois clientes divergirem em comportamento | Web e mobile evoluindo separados | Contrato compartilhado e regra: comportamento vive na action, nunca no cliente |
| Paralelismo gerar conflito de migração | Duas migrações simultâneas corrompem o histórico | Dono único de schema por onda |
| Aplicativo virar réplica pior do web | Tentar espelhar todas as telas | Escopo do aplicativo é consulta, registro rápido e notificação. O restante fica no web |

---

## 6. O que eu recomendo decidir antes de começar

1. **Confirmar a separação por contrato** em vez de três deploys. Se a
   separação física for exigência, ela continua possível depois, e mais barata.
2. **Confirmar que o aplicativo não terá regra de negócio própria.** É a
   decisão que mantém o custo de manutenção sob controle.
3. **Confirmar a ordem:** fundação, PWA, aplicativo, produto. Trocar a ordem
   para começar pelo aplicativo é possível, mas aí ele nasce sem token e sem
   contrato, e o retrabalho é certo.
