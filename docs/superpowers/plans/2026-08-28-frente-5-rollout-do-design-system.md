# Frente 5: plano de implementação do rollout do design system

> **Para executores:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o painel do tenant passa a falar inteiramente por tokens
semânticos, os 19 formulários restantes ganham o kit, e quatro painéis param de
engolir a recusa do servidor em silêncio.

**Arquitetura:** três ondas, da maior alavanca para o mais mecânico. A onda 1
mexe nos 8 primitivos que toda tela usa; a onda 2 converte os formulários, que
é o único lugar onde o comportamento muda; a onda 3 recolore o resto. Duas
travas novas no `npm run check` impedem que o padrão volte.

**Stack:** Next.js 14 (App Router), Tailwind com tokens em `globals.css` e
`tailwind.config.ts`, kit shadcn-style feito à mão em `src/components/ui/`.

**Spec:** [2026-08-28-frente-5-rollout-do-design-system.md](../specs/2026-08-28-frente-5-rollout-do-design-system.md)

## Restrições globais

- **Não é redesenho.** Nenhuma tela muda de layout, de texto ou de fluxo. Nos
  primitivos, **só troca de cor invisível**: nenhuma mudança de tamanho,
  espaçamento ou forma.
- **A baseline só encolhe.** `scripts/baseline-cor-crua.json` vai de **125 para
  32** arquivos. Os 32 que sobram são os 18 do site público e os 14 de auth,
  fora desta frente por decisão 1 da spec.
- **Nenhuma suíte nova.** Não há regra de negócio aqui; o que prova é o
  `check`, o `build` e o olho.
- **Travessão (U+2014) é proibido**; heredoc com escape no shell também.
- **`npx tsc --noEmit` tem ruído pré-existente** em
  `scripts/m23-token-auth.test.ts`, e só nele. `npm run lint` tem 9 warnings
  pré-existentes e 0 erros.
- **Banco e Redis locais** para rodar a suíte:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`
  e `REDIS_URL="redis://127.0.0.1:56379"`, com `docker start tibe-pg tibe-redis`
  antes.

## O mapa de tradução

Vale para as três ondas. **Não invente token:** todos existem em
`src/app/globals.css`, e o par já é conferido pelo gate de contraste do
`npm run check` (item 6).

| Cor crua | Token | Par já conferido pelo gate |
|---|---|---|
| `bg-white` | `bg-superficie` | corpo sobre cartão |
| `bg-gray-50` | `bg-superficie-afundada` | corpo sobre página |
| `bg-gray-100` | `bg-superficie-afundada` | idem |
| `text-gray-900`, `text-gray-800` | `text-texto` | corpo sobre cartão |
| `text-gray-700`, `text-gray-600` | `text-texto-secundario` | secundário sobre cartão |
| `text-gray-500`, `text-gray-400` | `text-texto-discreto` | discreto sobre cartão |
| `border-gray-200`, `border-gray-300` | `border-borda` | - |
| `bg-green-100` / `text-green-800` | `bg-sucesso-suave` / `text-sucesso-tinta` | selo de sucesso |
| `bg-red-100` / `text-red-800`, `text-red-900`, `text-red-700` | `bg-perigo-suave` / `text-perigo-tinta` | erro sobre fundo de erro |
| `border-red-300` | `border-perigo` | - |
| `bg-amber-100` / `text-amber-800` | `bg-atencao-suave` / `text-atencao-tinta` | selo de atenção |
| `bg-blue-100` / `text-blue-800` | `bg-info-suave` / `text-info-tinta` | selo informativo |
| `text-white` em botão destrutivo | `text-superficie` | botão destrutivo |
| `bg-black/40` (véu) | `bg-sobreposicao` | token novo, Task 1 |

⚠️ **`text-white` nem sempre vira a mesma coisa.** No botão destrutivo é
`text-superficie`, porque é o par que o gate confere. Em texto sobre fundo
escuro é `text-texto-invertido`. Olhe o fundo antes de trocar.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/globals.css` | o token `--sobreposicao` |
| `src/components/ui/*.tsx` (8) | os primitivos recoloridos |
| `src/components/alertas/alert-dismiss-button.tsx` e mais 3 | tratar a recusa |
| `scripts/check-repo.ts` | as duas travas novas |
| `scripts/baseline-recusa-engolida.json` | **novo.** Linha de base da trava A |
| `scripts/baseline-painel-fora-do-kit.json` | **novo.** Linha de base da trava B |
| `scripts/baseline-cor-crua.json` | encolhe de 125 para 32 |
| os 19 formulários | convertidos ao kit |

---

## ONDA 1: a alavanca e as mentiras por omissão

### Task 1: o token do véu e os 8 primitivos

**Files:**
- Modify: `src/app/globals.css`, `tailwind.config.ts`
- Modify: `src/components/ui/badge.tsx`, `button.tsx`, `table.tsx`,
  `select.tsx`, `sheet.tsx`, `label.tsx`, `toast.tsx`, `confirm-dialog.tsx`
- Modify: `scripts/baseline-cor-crua.json`

**Interfaces:**
- Produz: a classe `bg-sobreposicao`, usada por `sheet.tsx` e
  `confirm-dialog.tsx`.

- [ ] **Passo 1: o token do véu**

`bg-black/40` é o único caso do kit sem token, e não é cor: é um PAPEL, o véu
atrás de um painel. Em `src/app/globals.css`, junto de `--superficie-invertida`
(linha 30):

```css
  /* O véu atrás de um painel aberto. Papel próprio, e não "preto com 40%":
     numa identidade diferente ele pode não ser preto, e a opacidade fica na
     classe, onde já estava. */
  --sobreposicao: #000000;
```

Em `tailwind.config.ts`, junto de `"sobre-primaria"` (linha 49):

```ts
        sobreposicao: "var(--sobreposicao)",
```

- [ ] **Passo 2: `badge.tsx`, as cinco variantes**

Linhas 11 a 15. Cada par tem gate de contraste próprio, então a troca é direta:

```tsx
        gray: "bg-superficie-afundada text-texto-secundario",
        green: "bg-sucesso-suave text-sucesso-tinta",
        red: "bg-perigo-suave text-perigo-tinta",
        amber: "bg-atencao-suave text-atencao-tinta",
        blue: "bg-info-suave text-info-tinta",
```

- [ ] **Passo 3: `button.tsx`, a variante destrutiva**

Linha 27, `bg-perigo text-white` vira:

```tsx
        destructive: "bg-perigo text-superficie hover:bg-perigo-tinta",
```

⚠️ **`text-superficie` e não `text-texto-invertido`.** O gate de contraste
confere o par `["botao destrutivo", "superficie", "perigo", 4.5]`: é esse o par
desenhado, e trocar por outro token sai da conferência.

- [ ] **Passo 4: os outros seis**

```
table.tsx:40   bg-gray-50    -> bg-superficie-afundada
table.tsx:91   text-gray-800 -> text-texto
select.tsx:40  bg-white      -> bg-superficie
select.tsx:40  text-gray-800 -> text-texto
sheet.tsx:20   bg-black/40   -> bg-sobreposicao/40
sheet.tsx:39   bg-white      -> bg-superficie
sheet.tsx:64   text-gray-900 -> text-texto
label.tsx:14   text-gray-700 -> text-texto-secundario
confirm-dialog.tsx:63  bg-black/40     -> bg-sobreposicao/40
confirm-dialog.tsx:67  border-gray-200 -> border-borda
confirm-dialog.tsx:67  bg-white        -> bg-superficie
confirm-dialog.tsx:75  text-gray-700   -> text-texto-secundario
```

E `toast.tsx`, linhas 145, 146, 153 e 170:

```tsx
        sucesso
          ? "border-tibe-primary/30 bg-superficie text-tibe-dark"
          : "border-perigo bg-superficie text-perigo-tinta",
```

```tsx
          sucesso ? "bg-tibe-primary/15 text-primaria-tinta" : "bg-perigo-suave text-perigo-tinta",
```

```tsx
          sucesso ? "text-tibe-dark/50 hover:text-tibe-dark" : "text-perigo-tinta/60 hover:text-perigo-tinta",
```

⚠️ **`text-red-700` e `text-red-900` viram o MESMO token.** Os dois tons
existiam para hierarquia dentro do aviso de erro, e o sistema tem um só
(`perigo-tinta`). A hierarquia passa a vir da opacidade (`/60`), como o próprio
arquivo já faz no lado do sucesso. Se ficar ilegível na validação, o caminho é
um token novo, não voltar para a paleta crua.

- [ ] **Passo 5: tirar os 8 da baseline**

Remova as 8 linhas de `src/components/ui/` de
`scripts/baseline-cor-crua.json`. O arquivo passa de 125 para 117 entradas.

- [ ] **Passo 6: conferir**

```bash
npm run check
npx tsc --noEmit
npm run build
```

Esperado: o `check` verde, e a conferência 8 sem reclamar. Se ela reclamar de
um arquivo do kit, sobrou cor crua nele.

- [ ] **Passo 7: commit**

```bash
git add src/app/globals.css tailwind.config.ts src/components/ui scripts/baseline-cor-crua.json
git commit -m "Os oito primitivos passam a falar por token, e o veu ganha papel proprio"
```

---

### Task 2: as quatro falhas silenciosas

**Files:**
- Modify: `src/components/alertas/alert-dismiss-button.tsx`
- Modify: `src/components/financeiro/postpone-button.tsx`
- Modify: `src/components/prestador/order-status-button.tsx`
- Modify: `src/components/usuarios/user-row-actions.tsx`

**Interfaces:**
- Consome: `useAviso()` de `@/components/ui/toast`, que devolve um objeto com
  `erro(texto: string)` e `sucesso(texto: string)`.

- [ ] **Passo 1: ler o modelo**

`src/components/financeiro/pay-button.tsx` teve exatamente este defeito até
2026-08-20 e é a referência. Ele importa `useAviso`, chama `const aviso =
useAviso()` no corpo do componente, e faz:

```tsx
    if (res.ok) {
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
```

- [ ] **Passo 2: aplicar nos quatro**

Em cada um, trocar `if (res.ok) router.refresh();` pela forma acima. Em
`user-row-actions.tsx` são DUAS chamadas (linhas 43 e 50: mudar role e
ativar/desativar), e as duas precisam.

⚠️ **`user-row-actions.tsx` é o mais grave dos quatro**: mudar a role de um
usuário ou desativá-lo falha e a tela não avisa. O dono clica, nada acontece, e
ele não sabe se funcionou. Não deixe uma das duas chamadas para trás.

- [ ] **Passo 3: conferir**

```bash
npx tsc --noEmit
npm run lint
```

O `lint` reprova `useAviso` chamado fora do corpo do componente, que é o erro
mais provável aqui.

- [ ] **Passo 4: commit**

```bash
git add src/components/alertas src/components/financeiro src/components/prestador src/components/usuarios
git commit -m "Quatro paineis param de engolir a recusa do servidor em silencio"
```

---

### Task 3: trava A, a recusa tem que ser tratada

**Files:**
- Modify: `scripts/check-repo.ts`
- Create: `scripts/baseline-recusa-engolida.json`

- [ ] **Passo 1: gerar a linha de base**

A trava precisa nascer com os que ainda não foram corrigidos listados, senão
reprova o repositório inteiro de uma vez. Rode isto e salve a saída:

```bash
node -e "
const {execSync}=require('child_process');const fs=require('fs');
const arquivos=execSync('git ls-files src',{encoding:'utf8'}).split('\n')
  .filter(f=>f.endsWith('.tsx'));
const fora=[];
for (const f of arquivos) {
  const s=fs.readFileSync(f,'utf8');
  if (!/apiPost|apiPut|apiPatch/.test(s)) continue;
  if (/aviso\.|doServidor|setErro|setError|toast/.test(s)) continue;
  fora.push(f);
}
fs.writeFileSync('scripts/baseline-recusa-engolida.json', JSON.stringify(fora.sort(),null,2)+'\n');
console.log('na base:',fora.length);
"
```

Esperado depois da Task 2: **zero ou perto disso**, porque os quatro foram
corrigidos. Se sair vazio, o arquivo é `[]` e a trava nasce sem dívida, que é o
melhor caso.

- [ ] **Passo 2: a trava**

Em `scripts/check-repo.ts`, uma função nova, no padrão de
`conferirRotulosDeMovimento`:

```ts
/**
 * Quem escreve tem que dizer quando falha.
 *
 * O padrao `if (res.ok) router.refresh()` sem nenhum `else` deixa a tela MUDA
 * quando o servidor recusa: o produtor clica, nada acontece, e ele nao sabe se
 * funcionou. O `pay-button.tsx` teve esse defeito ate 2026-08-20; outros
 * quatro sobreviveram com ele por mais de uma semana porque ninguem varreu o
 * resto. Esta trava e a varredura, automatica.
 *
 * Linha de base propria, que so ENCOLHE, pelo mesmo desenho da cor crua.
 */
function conferirRecusaTratada() {
  console.log("\n10. Recusa do servidor tratada na tela");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-recusa-engolida.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const s = readFileSync(full, "utf8");
    if (!/apiPost|apiPut|apiPatch/.test(s)) continue;
    const trata = /aviso\.|doServidor|setErro|setError|toast/.test(s);

    if (base.has(rel)) {
      if (trata) limpos.push(rel);
      continue;
    }
    if (!trata) ofensores.push(rel);
  }

  check(
    "todo painel que escreve avisa quando o servidor recusa",
    ofensores.length === 0,
    ofensores.length > 0
      ? "use useAviso() como em pay-button.tsx, ou o kit de erro de formulario:\n       " +
        ofensores.join("\n       ")
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja trata a recusa, remova de baseline-recusa-engolida.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}
```

E chame em `main()`, depois de `conferirRotulosDeMovimento()`.

- [ ] **Passo 3: provar que a trava REPROVA**

Uma trava que não falha não é trava. Quebre de propósito e veja reprovar:

```bash
cp src/components/usuarios/user-row-actions.tsx /tmp/user-row-actions-backup.tsx
node -e "const fs=require('fs');const p='src/components/usuarios/user-row-actions.tsx';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/aviso\./g,'noop.'))"
npm run check 2>&1 | grep -A 2 "10. Recusa"
cp /tmp/user-row-actions-backup.tsx src/components/usuarios/user-row-actions.tsx
npm run check 2>&1 | grep -A 2 "10. Recusa"
```

Esperado: primeiro ❌ nomeando o arquivo, depois ✅.

- [ ] **Passo 4: commit**

```bash
git add scripts/check-repo.ts scripts/baseline-recusa-engolida.json
git commit -m "Trava: painel que escreve tem que avisar quando o servidor recusa"
```

---

### Task 4: trava B, painel de escrita nasce no kit

**Files:**
- Modify: `scripts/check-repo.ts`
- Create: `scripts/baseline-painel-fora-do-kit.json`

- [ ] **Passo 1: a linha de base, escrita à mão**

⚠️ **A lista é escrita, não deduzida.** Um botão de ação sem campo nenhum não
tem o que converter para `FormSheet`, e adivinhar isso pelo código produziria
falso positivo em todo botão de confirmar. Crie
`scripts/baseline-painel-fora-do-kit.json` com os 19 formulários e os 13 botões,
todos, porque na Task 4 nenhum foi convertido ainda:

```json
[
  "src/app/(dashboard)/configuracoes/alertas/alert-preference-toggles.tsx",
  "src/app/(dashboard)/configuracoes/categorias-financeiras/category-manager.tsx",
  "src/app/(dashboard)/configuracoes/categorias-rebanho/category-manager.tsx",
  "src/app/(dashboard)/configuracoes/perfil/edit-name-form.tsx",
  "src/components/alertas/alert-dismiss-button.tsx",
  "src/components/billing/cancel-subscription.tsx",
  "src/components/billing/subscribe-form.tsx",
  "src/components/configuracoes/tenant-form.tsx",
  "src/components/estoque/product-form.tsx",
  "src/components/estoque/stock-movement-form.tsx",
  "src/components/financeiro/cancel-button.tsx",
  "src/components/financeiro/pay-button.tsx",
  "src/components/financeiro/postpone-button.tsx",
  "src/components/lavoura/cycle-actions.tsx",
  "src/components/lavoura/plot-form.tsx",
  "src/components/layout/property-selector.tsx",
  "src/components/maquinas/machine-form.tsx",
  "src/components/maquinas/maintenance-form.tsx",
  "src/components/meu-dia/task-actions.tsx",
  "src/components/meu-dia/task-form.tsx",
  "src/components/minha-fazenda/archive-fazenda-button.tsx",
  "src/components/minha-fazenda/fazenda-form.tsx",
  "src/components/minha-fazenda/pasture-form.tsx",
  "src/components/minha-fazenda/pasture-list.tsx",
  "src/components/negociacoes/negotiation-cancel.tsx",
  "src/components/negociacoes/negotiation-form.tsx",
  "src/components/prestador/client-form.tsx",
  "src/components/prestador/order-form.tsx",
  "src/components/prestador/order-status-button.tsx",
  "src/components/prestador/service-form.tsx",
  "src/components/usuarios/invite-form.tsx",
  "src/components/usuarios/user-row-actions.tsx"
]
```

- [ ] **Passo 2: a trava**

Em `scripts/check-repo.ts`:

```ts
/**
 * Painel de escrita nasce no kit.
 *
 * Um componente client que escreve E tem campo de formulario (`<Input`,
 * `<Select`, `MoneyInput`) precisa do `FormSheet`: e ele que poe a recusa do
 * servidor embaixo do campo certo, move o foco para o primeiro invalido e
 * conta a tentativa. Sem esta trava, o vigesimo painel nasce como os dezenove
 * nasceram.
 *
 * A linha de base e ESCRITA A MAO, e nao deduzida: botao de acao sem campo
 * nenhum nao tem o que converter, e adivinhar isso pelo codigo daria falso
 * positivo em todo botao de confirmar.
 */
function conferirPainelNoKit() {
  console.log("\n11. Painel de escrita usa o kit");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-painel-fora-do-kit.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    if (rel.includes("platform") || rel.includes("plataforma")) continue;
    if (rel.startsWith("src/components/ui/")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const s = readFileSync(full, "utf8");
    if (!/apiPost|apiPatch/.test(s)) continue;
    if (!/<Input|<Select|MoneyInput/.test(s)) continue;
    const noKit = s.includes("FormSheet");

    if (base.has(rel)) {
      if (noKit) limpos.push(rel);
      continue;
    }
    if (!noKit) ofensores.push(rel);
  }

  check(
    "todo painel de escrita com campo usa FormSheet",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use FormSheet + Field + useErrosDeFormulario, como em stay-form.tsx:\n       ${ofensores.join("\n       ")}`
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja no kit, remova de baseline-painel-fora-do-kit.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}
```

E chame em `main()`, depois de `conferirRecusaTratada()`.

- [ ] **Passo 3: provar que a trava REPROVA**

```bash
node -e "const fs=require('fs');const p='scripts/baseline-painel-fora-do-kit.json';const a=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync(p,JSON.stringify(a.filter(x=>!x.includes('machine-form')),null,2)+'\n')"
npm run check 2>&1 | grep -A 2 "11. Painel"
git checkout scripts/baseline-painel-fora-do-kit.json
npm run check 2>&1 | grep -A 2 "11. Painel"
```

Esperado: primeiro ❌ nomeando `machine-form.tsx`, depois ✅.

- [ ] **Passo 4: commit**

```bash
git add scripts/check-repo.ts scripts/baseline-painel-fora-do-kit.json
git commit -m "Trava: painel de escrita com campo nasce no kit"
```

---

### Task 5: validação ao vivo da onda 1

- [ ] **Passo 1: subir**

```bash
docker start tibe-pg tibe-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run dev
```

Abra `http://127.0.0.1:3000` (nunca `localhost`: não resolve nesta máquina).

- [ ] **Passo 2: a varredura visual**

Nas quatro telas mais densas em selo e tabela, procurando **contraste
quebrado**, texto ilegível, ou fundo que sumiu:

1. **Rebanho**: os cinco números, "Fora da fazenda agora", a tabela de
   movimentações (badges de tipo).
2. **Financeiro**: a tabela inteira, com os selos de status (Pendente, Pago,
   Cancelado) que usam as cinco variantes de `badge`.
3. **Negociações**: os selos de situação (Recebida, Quitada, Cancelada, Troca
   sem dinheiro) e a linha cancelada, que fica esmaecida.
4. **Máquinas**: os quatro status, incluindo "Negociada" e "Em manutenção".

⚠️ **O painel lateral e o diálogo de confirmação** também mudaram (véu, fundo,
título): abra um de cada e confira que o véu escurece e o painel é legível.

- [ ] **Passo 3: os quatro botões que agora avisam**

Force uma recusa em pelo menos um e confirme que a mensagem aparece. O mais
fácil: em **Usuários**, tentar desativar o próprio usuário logado, que a rota
recusa (`não pode editar a si mesmo`). Antes desta onda a tela não dizia nada.

- [ ] **Passo 4: a rede inteira**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

Esperado: 52/52.

- [ ] **Passo 5: PARAR e reportar**

Esta é a onda mais arriscada e a que o usuário pediu para olhar. Reporte o que
mudou, o que você conferiu, e **espere a autorização** antes da onda 2.

---

## ONDA 2: os 19 formulários

O padrão é o mesmo em todos, e está escrito uma vez aqui. Cada tarefa seguinte
diz só quais arquivos e o que cada um tem de particular.

**A receita, com `src/components/rebanho/stay-form.tsx` como modelo:**

1. `const err = useErrosDeFormulario(ORDEM);`, com `ORDEM` sendo os nomes dos
   campos **na API**, na ordem visual;
2. o `<Sheet>` vira `<FormSheet>`, passando `error={err.global}`,
   `focarCampoId={err.focarCampoId}` e `tentativa={err.tentativa}`;
3. cada campo vira `<Field label id error>` com o filho recebendo `{ id,
   ...aria }`;
4. campo numérico vira `<MoneyInput>` (`kind="quantidade"` quando for
   contagem), nunca `<input type="number">`, que o `check` reprova;
5. a validação local chama `err.reprovar(novos)`; a recusa do servidor chama
   `err.doServidor(res)`;
6. todo `onChange` chama `err.limparCampo(campo)`, senão o aviso vermelho fica
   embaixo de um campo já corrigido;
7. o arquivo sai de `scripts/baseline-painel-fora-do-kit.json` e de
   `scripts/baseline-cor-crua.json`.

⚠️ **A armadilha da frente 4:** um painel com DOIS blocos de campos do mesmo
tipo (duas linhas de uma lista, dois lados) não pode usar a mesma chave nos
dois. O `id` repetido no DOM faz o rótulo apontar para o campo errado e o foco
do erro cair no bloco de cima. Qualifique a chave
(`entregue_quantity`/`recebido_quantity`) e passe o `id` por `err.idDe(chave)`.
Nesta onda isso atinge `category-manager.tsx` (os dois) e `pasture-list.tsx`.

⚠️ **`useErrosDeFormulario` tem `prefixoDeId`** para o caso diferente: dois
painéis IRMÃOS na mesma página, cada um com o seu `value`. Use quando o arquivo
renderiza mais de um `FormSheet`.

### Task 6: Negociações (2 formulários)

**Files:**
- Modify: `src/components/negociacoes/negotiation-form.tsx` (469 linhas)
- Modify: `src/components/negociacoes/negotiation-cancel.tsx` (174)

O maior dos 19 e o mais arriscado: grava rebanho, estoque e dinheiro. O
`negotiation-form` tem parcelas e custos em lista, com `aria-label` no lugar de
`id` (linha 433): esses viram `Field` com chave qualificada por índice
(`parcela_0_amount`).

- [ ] **Passo 1: converter os dois, seguindo a receita acima**
- [ ] **Passo 2: tirar os dois das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add src/components/negociacoes scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Negociacoes: os dois paineis passam para o kit"
```

### Task 7: Estoque (2 formulários)

**Files:**
- Modify: `src/components/estoque/stock-movement-form.tsx` (266)
- Modify: `src/components/estoque/product-form.tsx` (205)

⚠️ **A quantidade de produto aceita casa decimal** quando a unidade permite
(saca sim, ferramenta não). Use `<MoneyInput kind="quantidade">` **sem**
`unit`, e NÃO force inteiro: a regra de fração vive em `recusaPorFracao` no
servidor, e duplicá-la na tela criaria duas verdades.

- [ ] **Passo 1: converter os dois, seguindo a receita acima**
- [ ] **Passo 2: tirar os dois das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add src/components/estoque scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Estoque: produto e movimentacao passam para o kit"
```

### Task 8: Máquinas e Meu Dia (3 formulários)

**Files:**
- Modify: `src/components/maquinas/machine-form.tsx` (163)
- Modify: `src/components/maquinas/maintenance-form.tsx` (118)
- Modify: `src/components/meu-dia/task-form.tsx` (102)

⚠️ **`machine-form.tsx` foi o painel que não abria sem sinal** (achado com modo
avião num Android, registrado no `CLAUDE.md`). Ao converter, confira que ele
continua abrindo com a rede caída: o `FormSheet` não deve depender de nenhuma
busca no servidor para renderizar.

- [ ] **Passo 1: converter os três, seguindo a receita acima**
- [ ] **Passo 2: tirar os três das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add src/components/maquinas src/components/meu-dia scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Maquinas e Meu Dia passam para o kit"
```

### Task 9: Minha Fazenda e Lavoura (4 formulários)

**Files:**
- Modify: `src/components/lavoura/cycle-actions.tsx` (229)
- Modify: `src/components/minha-fazenda/fazenda-form.tsx` (132)
- Modify: `src/components/minha-fazenda/pasture-form.tsx` (98)
- Modify: `src/components/lavoura/plot-form.tsx` (90)

⚠️ **`cycle-actions.tsx` renderiza mais de um painel** (as ações do ciclo). É o
caso de `prefixoDeId`: `useErrosDeFormulario(ORDEM, "colheita")` e
`useErrosDeFormulario(ORDEM, "insumo")`, senão o foco do erro cai no painel
errado.

⚠️ **O aviso de soma dos pastos maior que a fazenda é SÓ AVISO, nunca bloqueia
salvar** (decisão do usuário, registrada em `.claude/rules/rebanho-e-fazenda.md`).
Ele não pode virar `err.reprovar`.

- [ ] **Passo 1: converter os quatro, seguindo a receita acima**
- [ ] **Passo 2: tirar os quatro das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add src/components/lavoura src/components/minha-fazenda scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Minha Fazenda e Lavoura passam para o kit"
```

### Task 10: Prestador (3 formulários)

**Files:**
- Modify: `src/components/prestador/order-form.tsx` (136)
- Modify: `src/components/prestador/service-form.tsx` (95)
- Modify: `src/components/prestador/client-form.tsx` (66)

⚠️ **Estes três só aparecem no perfil `prestador`.** Para validar no navegador
é preciso um tenant com esse perfil ativo; o seed cria `fazenda`. Não é motivo
para pular a conversão, é motivo para dizer na validação que eles não foram
vistos ao vivo.

- [ ] **Passo 1: converter os três, seguindo a receita acima**
- [ ] **Passo 2: tirar os três das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add src/components/prestador scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Prestador: os tres paineis passam para o kit"
```

### Task 11: Configurações e usuários (5 formulários)

**Files:**
- Modify: `src/app/(dashboard)/configuracoes/categorias-financeiras/category-manager.tsx` (150)
- Modify: `src/app/(dashboard)/configuracoes/categorias-rebanho/category-manager.tsx` (148)
- Modify: `src/components/usuarios/invite-form.tsx` (122)
- Modify: `src/components/configuracoes/tenant-form.tsx` (62)
- Modify: `src/app/(dashboard)/configuracoes/perfil/edit-name-form.tsx` (55)

⚠️ **Os dois `category-manager.tsx` têm lista com campo por linha**: é a
armadilha do `id` repetido descrita no topo da onda. Qualifique por id da
categoria (`nome_${categoria.id}`).

⚠️ **`invite-form.tsx` mostra a senha temporária UMA vez** na resposta. Não
mexa nessa parte: ela não é campo de formulário, é resultado.

- [ ] **Passo 1: converter os cinco, seguindo a receita acima**
- [ ] **Passo 2: tirar os cinco das duas baselines**
- [ ] **Passo 3:** `npx tsc --noEmit && npm run lint && npm run check && npm run build`
- [ ] **Passo 4: commit**

```bash
git add "src/app/(dashboard)/configuracoes" src/components/usuarios src/components/configuracoes scripts/baseline-painel-fora-do-kit.json scripts/baseline-cor-crua.json
git commit -m "Configuracoes e usuarios passam para o kit"
```

### Task 12: validação ao vivo da onda 2

- [ ] **Passo 1: em cada formulário de dinheiro ou de rebanho, um envio real e uma recusa real**

Os cinco que mais importam, porque erram caro:

| Formulário | Recusa a forçar |
|---|---|
| `negotiation-form` | venda sem saldo: `INSUFFICIENT_BALANCE` no campo de quantidade |
| `stock-movement-form` | saída acima do disponível: `INSUFFICIENT_STOCK` |
| `machine-form` | custo de aquisição negativo |
| `fazenda-form` | área menor ou igual a zero |
| `invite-form` | email que já existe: `409` |

Em cada um, a mensagem tem que aparecer **embaixo do campo**, e o foco tem que
ir para ele. Se cair no rodapé, o `field` não está atravessando, ou a chave
local não bate com o nome na API.

- [ ] **Passo 2: a rede inteira**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

- [ ] **Passo 3: PARAR e reportar**, e esperar autorização para a onda 3.

---

## ONDA 3: recolorir o resto

### Task 13: os 55 componentes do painel

**Files:**
- Modify: os arquivos de `src/components/` que restarem em
  `scripts/baseline-cor-crua.json` (os convertidos na onda 2 já saíram)
- Modify: `scripts/baseline-cor-crua.json`

- [ ] **Passo 1: listar o que sobrou**

```bash
node -e "
const b=JSON.parse(require('fs').readFileSync('scripts/baseline-cor-crua.json','utf8'));
const alvo=b.filter(f=>f.startsWith('src/components/')&&!f.includes('platform'));
console.log(alvo.length); alvo.forEach(f=>console.log(' ',f));
"
```

- [ ] **Passo 2: traduzir, arquivo por arquivo**

Use o mapa de tradução do topo deste plano. **Não use `sed` em lote:** o mesmo
`text-white` vira `text-superficie` num botão destrutivo e `text-texto-invertido`
sobre fundo escuro, e o mapa avisa disso. Abra o arquivo, olhe o fundo, troque.

- [ ] **Passo 3: tirar da baseline os que ficaram limpos**

O `npm run check` imprime `ℹ️ ja sem cor crua, remova de baseline-cor-crua.json`
com a lista. Remova exatamente os que ele nomear.

- [ ] **Passo 4:** `npm run check && npx tsc --noEmit && npm run build`
- [ ] **Passo 5: commit**

```bash
git add src/components scripts/baseline-cor-crua.json
git commit -m "Os componentes do painel passam a falar por token"
```

### Task 14: as 30 páginas do painel

**Files:**
- Modify: os arquivos de `src/app/(dashboard)/` em `scripts/baseline-cor-crua.json`
- Modify: `scripts/baseline-cor-crua.json`

- [ ] **Passo 1: listar o que sobrou**

```bash
node -e "
const b=JSON.parse(require('fs').readFileSync('scripts/baseline-cor-crua.json','utf8'));
const alvo=b.filter(f=>f.includes('(dashboard)'));
console.log(alvo.length); alvo.forEach(f=>console.log(' ',f));
"
```

- [ ] **Passo 2: traduzir, arquivo por arquivo**, com o mesmo cuidado do passo 2 da Task 13.
- [ ] **Passo 3: tirar da baseline os que ficaram limpos**
- [ ] **Passo 4: conferir que a baseline chegou a 32**

```bash
node -e "
const b=JSON.parse(require('fs').readFileSync('scripts/baseline-cor-crua.json','utf8'));
const fora=b.filter(f=>f.startsWith('src/app/(public)')||(f.startsWith('src/app')&&!f.includes('(dashboard)')));
console.log('total:',b.length,'  esperado: 32');
console.log('todos os que sobraram sao publico/auth?', b.length===fora.length);
"
```

Esperado: `total: 32` e `true`. Se sobrou algo do painel, ele foi esquecido.

- [ ] **Passo 5:** `npm run check && npx tsc --noEmit && npm run lint && npm run build`
- [ ] **Passo 6: commit**

```bash
git add "src/app/(dashboard)" scripts/baseline-cor-crua.json
git commit -m "As paginas do painel passam a falar por token, e a baseline fecha em 32"
```

### Task 15: validação ao vivo e fechamento

- [ ] **Passo 1: a passada de olho**

Uma tela de cada área, procurando **texto ilegível**: Início, Rebanho,
Negociações, Estoque, Máquinas, Lavoura, Prestador, Financeiro, Alertas, Meu
Dia, Minha Fazenda, Configurações, Fazenda em Números, Calculadora.

O erro típico desta onda é `text-texto-invertido` sobre fundo claro (texto
branco no branco), que o gate de contraste **não** pega, porque ele confere
pares de tokens, não o uso deles.

- [ ] **Passo 2: a rede inteira**

```bash
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all
```

- [ ] **Passo 3: documentos**

Atualize `docs/agents/current-handoff.md`: as cinco frentes fechadas, e o que
sobrou. Em `docs/agents/dividas.md`, acrescente à seção 2 o que ficou fora
desta frente:

```markdown
### 2.4 Site público, auth e plataforma sem token semântico

A frente 5 cobriu o painel do tenant. Ficaram fora, por decisão do usuário em
2026-08-28: o site público (265 ocorrências de cor crua em 18 arquivos), as
telas de auth e onboarding (55 em 14), e o painel da plataforma (24 arquivos,
que a catraca já exclui por desenho: casca escura, onde o cinza claro é a
escolha certa).

São outro contexto visual, com outro público, e validar marketing e curral no
mesmo dia dilui a atenção. A tela de login some-se a isso por não ser validável
sem digitar senha.

**Custo:** uma rodada própria. O ganho é o modo escuro passar a ser possível no
app inteiro, e não só no painel.
```

- [ ] **Passo 4: parar**

Merge na `main`, push e deploy exigem autorização explícita do usuário, a cada
vez. Esta frente **não tem migração**: nenhuma mudança de schema.

---

## Auto-revisão

**Cobertura da spec.** Seção 4 (as três ondas) está nas Tasks 1 a 15; a seção 5
(as quatro falhas silenciosas) na Task 2; a seção 6 (as duas travas) nas Tasks
3 e 4; a seção 7 (as provas) nos passos de conferência de cada tarefa e nas
Tasks 5, 12 e 15; a seção 8 (o que fica de fora) na Task 15, passo 3. As quatro
decisões da seção 3 estão nas restrições globais e nas fronteiras das ondas.

**Placeholders.** Nenhum "TBD" ou "trate os casos de borda": cada passo tem o
comando exato, e os que mexem em código têm a linha e o valor.

**Consistência.** `bg-sobreposicao` nasce na Task 1 e é usada por `sheet.tsx` e
`confirm-dialog.tsx` na mesma tarefa. As duas baselines novas nascem nas Tasks
3 e 4 e encolhem nas Tasks 6 a 11. O mapa de tradução é um só, no topo, e as
Tasks 13 e 14 apontam para ele em vez de repetir.

**Três armadilhas escritas de propósito**, porque quem executa não tem o
contexto da conversa que as descobriu:

1. **`text-white` não tem tradução única.** No botão destrutivo é
   `text-superficie`, porque é o par que o gate confere; sobre fundo escuro é
   `text-texto-invertido`. Por isso a Task 13 proíbe `sed` em lote.
2. **`id` repetido no DOM** (armadilha da frente 4): dois blocos de campos do
   mesmo tipo no MESMO painel precisam de chave qualificada. Atinge os dois
   `category-manager` e o `pasture-list`.
3. **Uma trava que não falha não é trava.** As Tasks 3 e 4 têm um passo que
   quebra a regra de propósito e confere que o `check` reprova, antes de
   confiar nela.

**Uma decisão de produto que o plano toma, e que vale conferir na onda 1:**
`text-red-700` e `text-red-900` do `toast.tsx` viram o MESMO token
(`perigo-tinta`), porque o sistema tem um tom de erro só. A hierarquia passa a
vir da opacidade, como o próprio arquivo já faz no lado do sucesso. Se ficar
ilegível na validação, o caminho é um token novo, nunca voltar à paleta crua.
