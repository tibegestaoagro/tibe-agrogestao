# Frente 5: rollout do sistema de design

**Data:** 28 de agosto de 2026
**Frente:** 5 de 5, e última, da
[sequência para fechar os módulos](2026-08-27-sequencia-para-fechar-os-modulos-design.md)
**Padrão a aplicar:** o do
[piloto no Rebanho](2026-08-27-piloto-design-rebanho.md), frente 1
**Suíte:** nenhuma nova. Ver a seção 7.

---

## 1. O que esta frente é, e o que ela não é

**Não é redesenho.** Nenhuma tela muda de layout, de texto ou de fluxo. Muda de
onde a cor vem (token semântico em vez de paleta crua do Tailwind), como o
painel de escrita mostra a recusa do servidor, e o fato de que quatro deles
hoje não mostram nada.

O critério de parada é mecânico e já existe: `scripts/baseline-cor-crua.json`
só pode encolher, e `npm run check` reprova regressão. Nesta frente ele encolhe
de **125 para 32** arquivos: sobram os 18 do site público e os 14 de auth.

## 2. Os números, medidos em 2026-08-28

A spec de sequência falava em "123 arquivos" e nunca mediu o volume. A conta
real é **1.042 ocorrências de cor crua em 125 arquivos**:

| Onde | Ocorrências | Arquivos | Nesta frente? |
|---|---|---|---|
| Componentes do painel | 409 | 55 | sim |
| Páginas do painel | 282 | 30 | sim |
| Site público | 265 | 18 | **não** |
| Auth e onboarding | 55 | 14 | **não** |
| Kit de UI | 31 | 8 | sim, e primeiro |

Os 125 **não incluem o painel da plataforma**: a catraca o exclui por desenho.

E **32 painéis de escrita** ainda fora do kit, que se dividem em dois grupos
diferentes: **19 formulários** (têm campos e painel lateral) e **13 botões de
ação** (nenhum campo, nada a converter para `FormSheet`; para eles o trabalho é
só cor e tratamento de recusa).

⚠️ **Os dois 32 são coincidência**, e a spec repete o número em dois sentidos:
32 painéis de escrita fora do kit, e 32 arquivos que sobram na baseline no fim.
São conjuntos diferentes.

**A alavanca:** o kit de UI são 8 arquivos e 31 ocorrências, 3% do total, mas é
o que toda tela usa. `button.tsx` tem UMA cor crua (`text-white`);
`badge.tsx` tem seis. Mexer neles muda o app inteiro.

## 3. As decisões, e por quê

Tomadas com o usuário em 2026-08-28.

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Kit e painel do tenant entram; site público e auth ficam fora** | São outro contexto visual, com outro público. Validar marketing e curral no mesmo dia dilui a atenção, e a validação ao vivo é o que achou os defeitos das três frentes anteriores. Some-se que a tela de login não é validável sem digitar senha |
| 2 | **As 4 falhas silenciosas entram, e viram trava** | Ver a seção 5. Não é cosmético: é a tela mentindo por omissão |
| 3 | **Três ondas, com checkpoint em cada** | A spec de sequência previa "trabalho longo, validado no fim". Nas frentes 2, 3 e 4 foi justamente a validação que achou o que a suíte verde não pegava, e um erro de contraste na onda 1 se propagaria por tudo antes de alguém ver |
| 4 | **Nenhuma suíte nova** | Não há regra de negócio aqui. O que prova é o `check`, o `build` e o olho. Inventar teste para cor seria testar o `tailwind.config.ts` |

## 4. As três ondas

### Onda 1: a alavanca e as mentiras por omissão

Os 8 arquivos do kit (`button`, `badge`, `table`, `select`, `sheet`, `label`,
`toast`, `confirm-dialog`), 31 ocorrências. Junto vão as 4 falhas silenciosas
da seção 5 e as duas travas da seção 6.

É a onda mais arriscada apesar de ser a menor, e por isso vem primeiro e
sozinha: um erro de contraste em `badge.tsx` aparece em todas as telas de uma
vez.

⚠️ **Nos primitivos, só troca de cor invisível.** A decisão vem da frente 1 e
continua valendo: nenhuma mudança de tamanho, espaçamento ou forma. O produtor
não pode notar diferença nenhuma na onda 1, exceto os quatro botões que passam
a avisar quando falham.

### Onda 2: os 19 formulários

Cada um ganha `FormSheet`, `Field`, `useErrosDeFormulario` e `MoneyInput`, como
os 12 já convertidos. É a **única onda que muda comportamento**: a recusa do
servidor aparece embaixo do campo em vez do rodapé, o foco vai para o primeiro
inválido, e o número é lido em português.

Os 19, por ordem de risco (dinheiro e rebanho primeiro):

```
components/negociacoes/negotiation-form.tsx      469 linhas
components/estoque/stock-movement-form.tsx       266
components/lavoura/cycle-actions.tsx             229
components/estoque/product-form.tsx              205
components/negociacoes/negotiation-cancel.tsx    174
components/maquinas/machine-form.tsx             163
app/(dashboard)/configuracoes/categorias-financeiras/category-manager.tsx  150
app/(dashboard)/configuracoes/categorias-rebanho/category-manager.tsx      148
components/prestador/order-form.tsx              136
components/minha-fazenda/fazenda-form.tsx        132
components/usuarios/invite-form.tsx              122
components/maquinas/maintenance-form.tsx         118
components/meu-dia/task-form.tsx                 102
components/minha-fazenda/pasture-form.tsx         98
components/prestador/service-form.tsx             95
components/lavoura/plot-form.tsx                  90
components/prestador/client-form.tsx              66
components/configuracoes/tenant-form.tsx          62
app/(dashboard)/configuracoes/perfil/edit-name-form.tsx  55
```

⚠️ **A armadilha da frente 4, escrita aqui para não ser redescoberta:** um
painel com DOIS blocos de campos do mesmo tipo (dois lados, duas linhas) não
pode usar a mesma chave de campo nos dois. O `id` repetido no DOM faz o rótulo
apontar para o campo errado e o foco do erro cair no bloco de cima. O
`useErrosDeFormulario` tem `prefixoDeId` para painéis IRMÃOS; para dois blocos
no MESMO painel, a saída é qualificar a chave (`entregue_quantity`).

### Onda 3: recolorir o resto

85 arquivos: 55 componentes e 30 páginas do painel. Invisível por definição, e
o único bloco realmente mecânico. É aqui que a `loop-goal` cabe, porque o
critério de parada é um número: a baseline encolhe de 125 para 32.

## 5. As quatro falhas silenciosas

Uma varredura por `apiPost`/`apiPatch`/`apiDelete` sem nenhum tratamento de
recusa achou quatro:

```
components/alertas/alert-dismiss-button.tsx
components/financeiro/postpone-button.tsx
components/prestador/order-status-button.tsx
components/usuarios/user-row-actions.tsx
```

Todos com a mesma forma:

```ts
const res = await apiPatch(...);
if (res.ok) router.refresh();
// o servidor recusou? a tela não diz nada
```

O pior é `user-row-actions.tsx`: mudar a role de um usuário ou desativá-lo
falha e a tela não avisa. O dono clica, nada acontece, e ele não sabe se
funcionou.

**Não é defeito novo.** O `pay-button.tsx` teve exatamente isso até 2026-08-20,
quando foi corrigido com `useAviso`, e o comentário dele registra o caso. Os
outros quatro sobreviveram porque ninguém varreu o resto.

A correção é a do `pay-button`: `else aviso.erro(res.message)`.

## 6. As duas travas

Sem catraca, o padrão volta. Foi assim que a cor crua e o rótulo de
movimentação pararam de voltar, e é a única coisa que fez as regras deste
projeto pararem de depender de memória.

**Trava A, recusa tratada.** O `npm run check` reprova componente client que
chame `apiPost`, `apiPatch` ou `apiDelete` sem nenhum de `aviso.`, `doServidor`,
`setErro`, `setError` ou `toast`. Linha de base própria, que só encolhe, para
os que ainda não foram corrigidos não travarem o CI antes da hora.

**Trava B, painel de escrita nasce no kit.** Os 19 formulários entram numa
linha de base igual à da cor, e o `check` reprova painel de escrita NOVO que
nasça fora do `FormSheet`. Sem ela, o vigésimo nasce como os 19 nasceram.

⚠️ **A trava B distingue formulário de botão de ação**, e a distinção não é
heurística: é a lista. Um botão sem campo nenhum não tem o que converter, e
tentar adivinhar isso pelo código produziria falso positivo em todo botão de
confirmar.

## 7. As provas

**Nenhuma suíte nova**, e isso é decisão, não omissão: não há regra de negócio
nesta frente, e um teste de cor testaria o `tailwind.config.ts`.

O que prova cada onda:

- `npm run check`: contraste (item 6), cor crua (item 8), rótulo de movimentação
  (item 9), e as duas travas novas;
- `npx tsc --noEmit`, `npm run lint`, `npm run build`;
- `npm run test:all` contra regressão, porque a onda 2 mexe em componentes que
  as suítes de rota tocam.

**A validação ao vivo é o teste de verdade**, e é diferente por onda:

| Onda | O que olhar |
|---|---|
| 1 | Varredura visual das telas mais densas (Rebanho, Financeiro, Negociações), procurando contraste quebrado. E os 4 botões: forçar uma recusa e ver a mensagem aparecer |
| 2 | Em cada formulário de dinheiro ou de rebanho: um envio real e uma recusa real, conferindo que a mensagem aparece embaixo do campo certo |
| 3 | Uma passada de olho por tela, procurando texto ilegível |

## 8. Fora desta frente

| Fora | Volume | Vira dívida escrita |
|---|---|---|
| Site público | 265 ocorrências, 18 arquivos | sim |
| Auth e onboarding | 55 em 14 | sim |
| Painel da plataforma | 24 arquivos, **fora da baseline** | a catraca já o exclui por desenho (`rel.includes("plataforma")` em `check-repo.ts`): aquele painel tem casca escura, e lá o cinza claro é a escolha certa. Não conta nos 125 |
| Modo escuro | - | esta frente o torna POSSÍVEL (tudo passa a falar por token), e não o entrega |

## 9. Quando esta frente acabar

As cinco frentes fecham, e com elas o plano de sequência de 27/08. O que sobra
no projeto está no `dividas.md`: o site público sem token, as cinco cópias do
store de pendência do WhatsApp, o `m23-token-auth.test.ts` que não compila, e o
classificador do n8n, congelado por decisão do usuário até o sistema estar
completo.
