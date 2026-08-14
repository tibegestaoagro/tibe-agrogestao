# Missão 1 do Módulo 31 (Negociações): relatório de evidências

Fechamento em 2026-08-14. O contrato pedia comando e saída real, não afirmação.

---

## 1. Gates do repositório

Todos com `DATABASE_URL` apontando para o Docker local, nunca o Neon.

```
$ npm run test:isolation   ✅ Isolamento multi-tenant validado: 0 falhas.
$ npm run test:docs-api    ✅ /docs/api sincronizado com as rotas reais: 0 falhas.
$ npm run test:nav         ✅ buildNavItems validado: 0 falhas.
$ npm run test:herd        ✅ getHerdEvolution validado em 9 cenário(s): 0 falhas.
$ npm run test:m1          ✅ Módulo 1: 0 falhas.
$ npm run test:m32         ✅ Categorias e resumo do rebanho: 0 falhas.
$ npm run test:m33         ✅ Livro-razão do rebanho: 0 falhas.
$ npm run test:m34         ✅ Rebanho pelo WhatsApp: 0 falhas.
$ npm run test:m35         ✅ Negociação de gado: 0 falhas.        (119 verificações)
$ npm run test:m36         ✅ Negócio de gado pelo WhatsApp: 0 falhas.  (110 verificações)

$ npm run build            ✓ Compiled successfully   (0 "Failed to compile")
$ npx tsc --noEmit         limpo, exceto erros PRÉ-EXISTENTES em
                           scripts/m23-token-auth.test.ts (confirmado com
                           `git stash`: aparecem também sem as mudanças)

$ git diff main...negociacoes | grep -cP "^\+.*\xe2\x80\x94"   -> 0 travessões
$ git diff main...negociacoes --shortstat
  40 files changed, 7122 insertions(+), 94 deletions(-)   em 24 commits
```

**`test:m4`** falhou uma vez durante a sessão e passou em seguida: é o lock
diário do Redis compartilhado, que o CLAUDE.md documenta como esperado na
segunda execução da mesma hora. Não é regressão.

---

## 2. O juiz: oito rodadas

Subagente novo a cada rodada, sem o contexto de quem implementou, recebendo o
diff e a rubrica. Notas na ordem R1/R2/R3/R4/R5:

| Rodada | R1 | R2 | R3 | R4 | R5 | O achado que dominou |
|---|---|---|---|---|---|---|
| 1 | 5 | 7 | 7 | 6 | 6 | Cancelar apagava lançamento já PAGO |
| 2 | 6 | 8 | 6 | 6 | 6 | A correção acima travou o cancelamento e criou registro impossível de desfazer |
| 3 | 7 | 9 | 7 | 8 | 7 | `getDre` contava dinheiro cancelado no resultado do mês |
| 4 | 7 | 8 | 7 | 7 | 7 | Estorno de venda somava receita com despesa: errava em 2x os custos |
| 5 | 7 | 9 | 9 | 8 | 8 | Compra sem valor registrava 20 cabeças e zero dinheiro, calado |
| 6 | 7 | 9 | 9 | 9 | 7 | A resposta a uma pergunta ia para o handler errado |
| 7 | 7 | 9 | 9 | 8 | 9 | A correção acima engolia "morreu 1 bezerro" no meio de uma compra |
| 8 | 7 | 9 | 8 | 9 | 7 | Frete de R$ 2.000 virava R$ 2,00 |

**Não atingiu a meta de 8 em todos os itens.** O R1 ficou em 7 nas oito
rodadas, sempre por motivo diferente e sempre corrigido em seguida. A missão
foi encerrada por decisão do usuário em 2026-08-14, com os achados restantes
documentados aqui e nas seções 7, 8 e 9 da spec, em vez de continuar iterando.

Na oitava rodada o juiz conferiu **31 citações "§X" contra o `.docx` do
cliente, uma a uma, e nenhuma estava errada**, o que não era verdade nas
primeiras rodadas.

---

## 3. O padrão que dominou a missão

Em **seis das oito rodadas**, uma correção introduziu o problema OPOSTO ao que
corrigia:

1. Cancelar apagava dinheiro pago → bloquear o cancelamento → registro
   impossível de desfazer, no caminho mais comum do módulo.
2. Situação olhava só o principal ("Quitada" com frete em aberto) → olhar tudo
   → venda inteiramente recebida virava "Parcialmente recebida".
3. Contato criado antes da confirmação → mover para dentro da transação → a
   action virou código morto, com dois comentários afirmando o contrário.
4. Resposta ia para o handler errado → guarda no roteador → "morreu 1 bezerro"
   engolido no meio de uma compra.
5. A guarda acima excluía o pendente de confirmação → um "sim" ouvia "não tenho
   nenhum registro esperando confirmação".
6. Formato de dinheiro corrigido no valor principal → custos do §15 continuaram
   lendo por `num()`, sob um comentário afirmando que dinheiro tinha deixado de
   confiar no LLM.

A causa foi sempre a mesma: corrigir a direção apontada sem testar a direção
oposta. O remédio que funcionou foi escrever **as duas bordas como teste com
nome**, e está no `m35`:

```
✅ venda inteiramente recebida continua "paga", mesmo com frete em aberto
✅ compra com frete em aberto não é "Quitada"
```

---

## 4. Defeitos de dinheiro encontrados, com o estrago medido

| Onde | O que acontecia | Como foi pego |
|---|---|---|
| `getDre` | Lançamento CANCELADO continuava no "Resultado do mês": desfazer um negócio de R$ 60.000 não tirava os R$ 60.000 | Juiz, rodada 3. Bug anterior ao módulo |
| Estorno de venda | Somava receita com despesa: com o exemplo do §15 (80.000 + 5.500), errava em 2x os custos e deixava o resultado em -11.000 onde devia ser 0 | Juiz, rodada 4 |
| `getPositions(db, {})` | Devolvia lista VAZIA com o livro cheio. `GET /api/v1/herd/positions` sem parâmetro respondia "rebanho vazio" a quem tem gado, e a asserção de isolamento do `m33` passava por causa disso | Eu, escrevendo o `m36` |
| `num("60.000")` | Devolvia 60: uma compra de sessenta mil virava sessenta reais | Juiz, rodada 6 |
| `num("2.000")` em custos | Frete de R$ 2.000 virava R$ 2,00; "2.000,00" sumia calado | Juiz, rodada 8 |
| `contact_name` na rota | O Zod descartava a chave: o nome digitado sumia entre a tela e o banco e o contato nunca nascia | Eu, ao tentar validar no navegador |

---

## 5. Validação ao vivo

**Navegador real, antes das rodadas de juiz:** registrei uma compra de 20
bezerros por R$ 60.000 em 3 parcelas com R$ 2.000 de comissão. A tela mostrou
"Ainda tenho a pagar R$ 62.000,00", o rebanho subiu de 270 para 290 sozinho, e
o banco tinha 1 `Negotiation`, 1 `HerdMovement` e 4 `FinancialEntry`.

**Rota interna de verdade** (`/api/internal/whatsapp/execute-action`, com
`Request` construído, dentro do `m36`): a intenção está registrada, o "sim"
grava, e o `VISUALIZADOR` é barrado.

**Banco de provas contra o fluxo REAL de produção** (`npm run wa`): conversa de
vários turnos com confirmação, lida por programa.

**O que NÃO foi validado ao vivo, e precisa do teste no aparelho:**

- Entrega de fato no celular pela Evolution.
- Áudio e foto de recibo.
- A tela nova de contato (o Chrome pediu permissão de depuração remota e o
  navegador não abriu nesta sessão).
- Qualquer coisa em produção: as 4 migrações ainda não foram aplicadas no Neon.

Roteiro pronto: [roteiro-aparelho-negociacoes.md](roteiro-aparelho-negociacoes.md).

---

## 6. O que fica pendente, e onde está registrado

Na spec, seções 7, 8 e 9:

- §19: os nove filtros da tela.
- §13: formas de pagamento.
- §6.2 e §7.2: peso, arrobas, valor por cabeça e por arroba.
- §5, aceite 7: a v1 é o nome digitado no formulário; sem tela de contatos.
- §17.2 na web: o formulário preenchido é considerado o resumo.
- Pasto no formulário web (existe no WhatsApp).
- Aceite 23: consultar o histórico.

Achados de baixa gravidade que o juiz levantou e que não foram corrigidos:

- `listNegotiations` faz N+1 (31 consultas por página de 30).
- Duas convenções de `check()` convivem entre `m35` e `m36` (o `tsc` protege).
- `negotiation-pending` grava a chave plana enquanto `itensDosParametros`
  prefere `itens`: se o classificador emitir a forma estruturada na primeira
  frase, a resposta à faixa de idade não casa. Herdado do `herd-pending`.

---

## 7. Antes do merge

**4 migrações pendentes no Neon**, todas aditivas, zero `DROP`, conferidas:

```
$ npx prisma migrate status
Following migrations have not yet been applied:
20260811100000_negociacoes_envelope
20260813190000_negotiation_entry_role_estorno
20260813200000_negotiation_canceled_by
20260813210000_negotiation_canceled_by_fk
```

A ordem obrigatória (invariante 3 do CLAUDE.md: migração ANTES do push, porque
a Vercel deploya no push e não roda migração):

1. `npm run db:deploy` com a URL **Direct** do Neon.
2. Merge na `main` e push.
3. Ensinar `registrar_negocio_gado` ao classificador do n8n. **Não antes**: com
   a `main` sem o handler, uma mensagem real quebraria.
4. Banco de provas contra produção.
5. Teste no aparelho, pelo roteiro.
6. Relatório para o cliente.
