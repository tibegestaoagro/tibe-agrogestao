# Onda 3: briefings dos agentes

**Agentes desta onda: C1, C2 e C3.**

**Base:** [plano-separacao-e-mobile.md](plano-separacao-e-mobile.md) (seção
Onda 3) e [docs/specs/module-25-rebanho-por-categoria.md](../specs/module-25-rebanho-por-categoria.md)
(C1, spec fechada). Decisões confirmadas pelo usuário em 2026-08-03: seguir
com a recomendação de rebanho por categoria mesmo sem confirmação formal da
Agromax; os 3 agentes disparam em paralelo, mesmo sem spec de conteúdo
validada para C2.

---

## Regras válidas para os três agentes

1. **Trabalhe apenas nos arquivos listados em "Escopo exclusivo".**
2. **`prisma/schema.prisma`, as migrações e `src/lib/prisma.ts` são de uso
   EXCLUSIVO do C1 nesta onda.** C2 e C3 não tocam schema sob nenhuma
   circunstância: se sentir necessidade, pare e sinalize no relatório.
3. **Leia `AGENTS.md` e `docs/agents/current-handoff.md` antes de começar.**
4. **Nunca use o caractere U+2014 (travessão)** em código, comentário, texto
   de interface, documentação ou mensagem de commit. Regra repetidamente
   quebrada em rodadas anteriores mesmo com aviso explícito: verifique o
   próprio trabalho ao final com
   `grep -rl $'\xe2\x80\x94' <seus arquivos>` (busca por bytes UTF-8 do
   caractere, não pelo código Unicode escapado, que dá falso negativo neste
   ambiente), não confie só em não ter digitado de propósito.
5. **Entregue em branch própria**, com a suíte de testes relevante passando,
   e **não faça merge na `main`**. Integração é decisão humana.
6. **Não invente decisão de produto.** O que não estiver definido aqui,
   pergunte antes de assumir.
7. **`tenant_id` nunca vem do client.**

---

## Agente C1: rebanho por categoria e quantidade

### Objetivo

Implementar [docs/specs/module-25-rebanho-por-categoria.md](../specs/module-25-rebanho-por-categoria.md)
por completo. Leia a spec inteira antes de começar: todas as decisões de
produto já estão fechadas lá, não precisa perguntar de novo.

### Escopo exclusivo

```
prisma/schema.prisma                      (modelos AnimalCategory, AnimalBatch)
prisma/migrations/**                      (nova migração)
src/lib/prisma.ts                         (registrar os 2 modelos novos)
src/lib/actions/animal-categories.ts      (novo)
src/lib/actions/animal-batches.ts         (novo)
src/app/api/v1/animal-categories/**       (novo)
src/app/api/v1/animal-batches/**          (novo)
src/lib/whatsapp-intents.ts               (AUTORIZADO: só adicionar registrar_lote_animal)
src/lib/actions/whatsapp-router.ts        (AUTORIZADO: só rotear a intenção nova)
src/lib/actions/whatsapp-handlers/**      (AUTORIZADO: só o handler da intenção nova)
src/app/(dashboard)/rebanho/page.tsx      (unificar lotes + individual na tabela)
src/app/(dashboard)/rebanho/[id]/page.tsx (AUTORIZADO: só se precisar de rota irmã pra lote, ex: /rebanho/lote/[id])
src/app/(dashboard)/configuracoes/**      (nova seção de gestão de categorias)
scripts/m25-rebanho-categoria.test.ts     (novo)
```

**Proibido tocar:** qualquer arquivo do modelo `Animal` individual existente
(`animals.ts` além do necessário para a listagem unificada, `AnimalWeightLog`,
`AnimalVaccination`, `AnimalMovement`), `src/components/ui/**` (é escopo do
C3: use os componentes existentes como estão, não redesenhe).

### Decisões já tomadas

Todas em [docs/specs/module-25-rebanho-por-categoria.md](../specs/module-25-rebanho-por-categoria.md).
Destaques que costumam ser esquecidos:

- FIFO na venda entre lotes da mesma categoria, sem perguntar qual lote.
- Cada compra é um lote novo, nunca acumula numa linha existente.
- Sem peso individual/GMD/vacina/agenda pra lote: só peso médio simples.
- `/rebanho` fica com lotes e animais individuais na MESMA tabela.
- Sem migração de `Animal` existente: é aditivo, não substitui nada.

### Prova de entrega

Critérios de aceitação da seção 6 da spec, com `test:m25` cobrindo tudo.
`test:m1` e `test:m17` continuam passando sem alteração (prova de que o
modelo individual não foi tocado).

---

## Agente C2: Calculadora Pecuária

### Objetivo

12 ferramentas de cálculo do documento do cliente (Arquitetura Funcional,
área 2): cerca, pastagem, lotação, sal mineral, ração, água, cocho,
adubação, calagem, mão de obra, máquinas e combustível, compra e venda de
gado. Cada uma é um formulário simples (poucos campos de entrada) que
devolve um resultado calculado na hora, sem gravar nada no banco.

### Aviso importante sobre este agente

**A validação técnica do conteúdo das calculadoras (fórmulas, doses,
referências) é responsabilidade da equipe do Tibé perante o cliente, não
está fechada ainda.** Isso significa: use fórmulas e referências
**padrão, estabelecidas e citáveis** da zootecnia/agronomia brasileira (ex:
EMBRAPA, referências técnicas amplamente aceitas), **documente a fonte de
cada fórmula em comentário no código**, e no relatório final **liste
explicitamente quais cálculos têm menor confiança** e mereceriam revisão de
um técnico antes de ir ao ar para clientes reais. Não invente número sem
fonte só para preencher a tela. Se não encontrar uma referência confiável
para alguma das 12, pode entregar as outras 11 e sinalizar essa como
pendente, em vez de adivinhar.

### Escopo exclusivo

```
src/lib/calculadoras/**                        (novo, uma função pura por ferramenta)
src/app/(dashboard)/calculadoras/**             (novo, uma página por ferramenta ou um hub com abas)
src/components/layout/sidebar.tsx               (AUTORIZADO: só adicionar 1 link novo "Calculadoras")
scripts/m26-calculadora-pecuaria.test.ts        (novo)
```

**Proibido tocar:** schema, qualquer action/rota de negócio existente,
`src/components/ui/**` (use os componentes existentes; se faltar algum
tipo de input, crie dentro do seu próprio escopo, não edite o compartilhado).

### Decisões já tomadas

- **Sem persistência.** Cálculo puro: entrada -> saída, sem `FinancialEntry`,
  sem tabela nova, sem histórico salvo. Se um cálculo parecer que "deveria"
  virar um registro de verdade (ex: compra e venda de gado), **não
  integre** com `AnimalBatch`/financeiro nesta rodada: é uma calculadora de
  simulação, um recurso deliberadamente separado do Módulo 25 (que é sobre
  rebanho de verdade, não simulação).
- **Não mexe na navegação existente** (Rebanho, Lavoura, Prestador,
  Financeiro continuam onde estão): só adiciona 1 link novo para as
  calculadoras. Reestruturar a navegação toda para bater com o mockup do
  cliente é decisão de produto maior, fora desta rodada.
- **Sem chamada de LLM/API externa para os cálculos**: são fórmulas
  determinísticas, não IA generativa.

### Prova de entrega

- `npm run test:m26` cobrindo pelo menos 1 caso conhecido/verificável
  manualmente por ferramenta entregue (ex: um cálculo de lotação com número
  redondo que dá pra conferir de cabeça).
- Relatório final lista, por ferramenta: fórmula usada, fonte, e nível de
  confiança (alta/média/baixa). Ferramentas não entregues (por falta de
  fonte confiável) aparecem explicitamente como pendência, não como "não deu
  tempo".

---

## Agente C3: sistema de design (identidade visual nova)

### Objetivo

Aplicar a identidade visual em `docs/idVisual/` (logo + mockup de dashboard,
paleta mais escura com laranja como cor de ação) sobre os componentes
existentes, sem quebrar nenhuma página que já funciona.

### Escopo exclusivo

```
src/components/ui/**       (badge, button, input, label, select, sheet, table)
tailwind.config.ts         (AUTORIZADO: só a paleta de cores, seção "tibe")
src/app/globals.css        (variáveis de tema)
components.json            (se precisar criar/ajustar)
```

**Proibido tocar:** qualquer página de conteúdo (`(dashboard)/**/page.tsx`),
qualquer action ou rota, `src/components/layout/**` (sidebar/header:
estrutura de navegação não muda nesta rodada).

### Decisões já tomadas

- **Regra mais importante: preserve a INTERFACE de cada componente.** Nome
  do componente, props aceitas e o que cada uma faz não podem mudar.
  Troque o que tem por dentro (cores, espaçamento, sombra, estados hover/
  focus), nunca o contrato que as páginas existentes já consomem. Motivo:
  dezenas de páginas em produção importam `Button`/`Table`/`Badge` como
  estão hoje; mudar a interface quebra todas elas sem o agente conseguir
  ver isso (elas não fazem parte do seu escopo de arquivos).
- **`npx shadcn@latest init` trava neste ambiente** esperando prompt
  interativo (documentado em `CLAUDE.md`). Não tente rodá-lo interativamente.
  Os componentes atuais já seguem o padrão shadcn "na mão" (Radix primitives
  + `class-variance-authority` + `tailwind-merge`, `cn()` em
  `src/lib/utils.ts`): continue nesse padrão manual em vez de brigar com o
  CLI. Se as flags não-interativas do CLI funcionarem de primeira, ótimo;
  se travar, não insista, siga manual.
- **Paleta:** valores exatos ainda não confirmados pelo cliente (só temos os
  JPEGs em `docs/idVisual/`). Extraia os tons reais das imagens (não
  estime de memória) e documente no relatório final os hex exatos usados,
  para o usuário confirmar/corrigir com o cliente depois. Cor primária atual
  é `#2E7D32`/`#1B5E20` (`tailwind.config.ts`, seção `tibe`); laranja como
  cor de ação é novo, não existe hoje.
- **Não reestruture a navegação.** O mockup mostra "Início, Minha Fazenda,
  Meu Dia, Calculadora Pecuária, Fazenda em Números, WhatsApp"; a atual é
  "Rebanho, Lavoura, Prestador, Financeiro". Isso é mudança de produto, não
  de visual, e pertence a uma rodada própria.
- **Teste em pelo menos 3 páginas reais depois de mudar os componentes**
  (ex: `/dashboard`, `/rebanho`, `/financeiro`) para confirmar que nada
  quebrou visualmente antes de entregar.

### Prova de entrega

- Screenshot (ou descrição precisa) de antes/depois em pelo menos 2 páginas.
- Nenhuma mudança de prop/tipo exportado dos componentes de
  `src/components/ui/**` (comparar a assinatura exportada antes/depois).
- `npm run build` continua passando (prova de que nenhuma página quebrou por
  causa de uma mudança de interface).

---

## Ponto de integração da Onda 3

C1 é o caminho crítico (schema). C2 e C3 não dependem dele nem entre si.
Ao integrar, sequência recomendada: **C1 primeiro** (schema definido),
depois C2 e C3 em qualquer ordem (ambos só usam componentes/rotas que já
existiam antes desta onda). Se C3 mudar algo visualmente enquanto C1 ainda
não integrou, a nova página `/rebanho` unificada do C1 herda o estilo novo
naturalmente na integração, sem trabalho extra.
