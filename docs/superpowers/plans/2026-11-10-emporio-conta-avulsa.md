# Meu Empório: plano de conta a pagar avulsa

**Branch:** `codex/dividas-264-265`

**Spec:** `docs/superpowers/specs/2026-11-10-emporio-conta-avulsa-design.md`

**Objetivo:** adicionar conta a pagar avulsa por loja, pendente ou paga, com fornecedor ou nome livre opcionais, sem entrar no Resultado da Loja.

**Ordem:** executar após as dívidas 2.65 e 2.64 do plano `2026-11-10-dividas-264-265.md`. A exportação individual deve reconhecer também a conta avulsa.

## Tarefa 1: origem explícita e migração local

**Arquivos:** `prisma/schema.prisma`, nova migração em `prisma/migrations/`, `src/lib/financial.ts`, `src/lib/prisma.ts` somente se houver model novo.

- [ ] Acrescentar a `FinancialEntry` a marca `emporio_manual Boolean @default(false)` e os textos anuláveis `emporio_manual_description` e `emporio_other_name`. Preservar `emporio_supplier_id` e `establishment_id` existentes. Não criar tabela de saldo.
- [ ] Gerar SQL com `DATABASE_URL` local inline por `prisma migrate diff`; retirar os `DROP INDEX` espúrios dos índices parciais descritos no `AGENTS.md`; aplicar no Docker local e gerar o Prisma Client. Conferir o SQL: registros antigos ficam com marca falsa e textos nulos.
- [ ] Testar que o client escopado mantém o isolamento de `FinancialEntry`; rodar `test:isolation` e a checagem de drift. Commitar schema e migração juntos.

## Tarefa 2: action de criação e alcance

**Arquivos:** `src/lib/actions/emporio-despesas.ts`, `src/lib/financial.ts`, nova suíte no próximo número livre do `package.json`.

- [ ] Escrever casos que falhem antes da implementação: descrição vazia, valor inválido, vencimento inválido, loja ausente ou fora do alcance, fornecedor de outro tenant, `Outros` sem nome, criação pendente e ausência de saldo gravado.
- [ ] Implementar `criarContaAvulsaAction(db, ator, input)` com `establishment_id`, `description`, `amount`, `due_date`, `status`, `emporio_supplier_id?`, `emporio_other_name?`, `paid_at?` e `from?`. O destinatário é exclusivo: fornecedor ou `Outros`, nunca ambos. `status: paid` exige `from`; pendente recusa `from`.
- [ ] Criar o lançamento via `createLinkedEntry` como pendente e registrar `despesa.avulsa.criar` no Histórico na mesma transação serializável. A marca e os textos devem ser gravados pelo helper ou por atualização no mesmo `tx`, sem janela de leitura intermediária.
- [ ] Reutilizar `executarPagamentoDeContas` e o fluxo de alçada Q227 para `status: paid`; a conta e o pagamento ou pedido de aprovação devem ser atômicos. Se o pagamento falhar, não deve restar conta nova. Provar gaveta com turno, conta bancária, saldo insuficiente e aprovação.
- [ ] Commitar action e prova da criação.

## Tarefa 3: reconhecer a conta avulsa nos fluxos existentes

**Arquivos:** `src/lib/actions/emporio-despesas.ts`, `src/lib/actions/emporio-relatorios-financeiro.ts`, `src/lib/actions/emporio-projecao.ts` apenas se a leitura atual excluir a nova origem; suíte da tarefa 2.

- [ ] Provar que a conta pendente aparece na listagem, no relatório, na projeção e no CSV individual; a paga não aparece entre pendentes. Provar isolamento por loja e tenant.
- [ ] Incluir `emporio_manual` no filtro de contas do Empório e no resolver por id. Dar à view a origem `avulsa`, a descrição própria e o destinatário exibível; não tratar a linha como compra. Usar as actions existentes de corrigir, adiar, cancelar e pagar, com as mesmas recusas e Histórico.
- [ ] Garantir que `resultadoDaLojaAction` não incorpora a conta avulsa; usar um caso de regressão com valor conhecido. Commitar reconhecimento e provas.

## Tarefa 4: rota, tela e documentação

**Arquivos:** `src/app/api/v1/emporio/payables/route.ts`, `src/app/(dashboard)/emporio/despesas/page.tsx`, `src/app/(dashboard)/emporio/_components/contas-a-pagar.tsx`, novo formulário em `_components/`, `src/app/(public)/docs/api/endpoints.ts`, manual se a seção Despesas mostrar o fluxo.

- [ ] Acrescentar `POST /api/v1/emporio/payables` com Zod e `apiErroDeZod`, chamar apenas a action e responder pelo padrão `{ data, meta }` ou `{ error }`. Cobrir 201, recusas e campos na suíte.
- [ ] Na seção Contas a pagar, mostrar `Adicionar conta` mesmo quando a lista está vazia. Formulário do kit: loja obrigatória, descrição, valor brasileiro, vencimento, destinatário opcional (fornecedor ou `Outros`), status e, se paga, data e origem do pagamento. Sem `<input type="number">`; recusa no campo.
- [ ] Mostrar na lista a origem `Avulsa`, o destinatário quando houver e o resultado `Aguardando aprovação` quando a alçada se aplicar. Atualizar `/docs/api` e o manual. Validar no navegador com Dono, Gestor e Financeiro; cobrir também tela estreita e lista vazia.
- [ ] Commitar rota e tela após provas.

## Fechamento

- [ ] Rodar `npm run check`, `npx tsc --noEmit`, `npm run lint`, `test:isolation`, suíte nova, `test:m104`, `test:m105`, `test:all -- --sem-redis`, `npm run build`, sempre com `DATABASE_URL` e `REDIS_URL` locais nas suítes. Verificar o diff e o SQL sem segredos, travessão ou drop dos índices parciais.
- [ ] Atualizar `docs/agents/current-handoff.md` com estado real, branch, commits, testes e próximo passo. Entregar a branch para revisão. Migração no Neon, merge, push na `main` e deploy dependem de autorização explícita na conversa.
