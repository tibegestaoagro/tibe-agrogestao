---
paths:
  - "src/components/**"
  - "src/app/(dashboard)/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     O kit feito a mao, o painel mobile-first, e a importacao que quebra o build em client component. -->

## UI

Não existe um design system de terceiros instalado via CLI: **o `npx
shadcn@latest init` trava neste ambiente** (fica esperando prompt
interativo). Os componentes em `src/components/ui/` (`button`, `input`,
`label`, `table`, `sheet`, `select`, `badge`) foram escritos à mão no estilo
shadcn (Radix primitives + `class-variance-authority` + `tailwind-merge`,
`cn()` em `src/lib/utils.ts`), com `components.json` já configurado: se um
dia rodar o CLI interativamente, ele deve reconhecer a estrutura existente.
Gráficos: Recharts v3. Cores da marca em `tailwind.config.ts`
(`tibe.primary/dark/light`), fonte Inter via `next/font/google`.

Páginas server (list/detail) buscam dados direto via `getTenantDb()`; ações de
escrita são componentes client dentro de `<Sheet>` (painel lateral), chamando
`apiPost`/`apiPatch` de `src/lib/client-api.ts` e dando `router.refresh()` no
sucesso.

**Painel do tenant é responsivo (mobile-first, deliberado: spec 2026-07-28):**
o fluxo nasce no WhatsApp, então o cliente acessa o painel majoritariamente
pelo celular, não desktop. `(dashboard)/layout.tsx` (server) calcula
`navLinks` já filtrados por perfil ativo + `canAccess(role, ...)` e passa pra
`DashboardShell` (`src/components/layout/dashboard-shell.tsx`, client):
**nunca** importe `@/lib/permissions` dentro de um client component do
dashboard: esse módulo importa `getSessionUser` de `tenant-context.ts`, que
arrasta `auth.ts` → `rate-limit.ts` → `ioredis` (módulos Node como `dns`
inexistentes no browser) e quebra o build. `DashboardShell` guarda o estado
de abrir/fechar do menu (hambúrguer no header, `md:hidden`) e repassa pra
`Sidebar` (`src/components/layout/sidebar.tsx`, client, drawer off-canvas
abaixo do breakpoint `md`, estático acima). `Table`/`Sheet`
(`src/components/ui/*`) já são responsivos por padrão (scroll horizontal e
largura total, respectivamente): não precisam de tratamento especial nas
páginas de conteúdo.

---

## O sistema de design, depois do rollout de 2026-08-31

O painel do tenant está **inteiro** no kit e em token semântico. Três travas do
`npm run check` guardam isso, e as três foram provadas falhando antes de
passar. Código novo do painel não escolhe: nasce assim.

### Painel de escrita: a receita, sem variação

```tsx
const ORDEM = ["campo_api_1", "campo_api_2"] as const;   // ordem VISUAL
type Campo = (typeof ORDEM)[number];
const err = useErrosDeFormulario(ORDEM);                  // + prefixoDeId quando há irmãos

// no submit: monte `novos: Partial<Record<Campo, string>>`, e então
//   err.setGlobal(null); err.reprovar(novos); return;
// quando o servidor recusa: err.doServidor(res)
// em TODO onChange: err.limparCampo(campo)

<FormSheet trigger title open onOpenChange onSubmit submitLabel pending
           error={err.global} focarCampoId={err.focarCampoId} tentativa={err.tentativa}>
  <Field label required id="campo_api_1" error={err.erros.campo_api_1}>
    {({ id, ...aria }) => <Input id={id} {...aria} ... />}
  </Field>
</FormSheet>
```

O `id` do `Field` é o **nome do campo NA API**, porque é ele que casa com o
`error.field` que o servidor devolve. Sem tradutor no meio.

⚠️ **`prefixoDeId` é obrigatório sempre que dois painéis irmãos vivem na mesma
página**, e a necessidade aparece onde ninguém prevê: `cycle-actions` renderiza
insumo e colheita JUNTOS na tela do talhão, e os dois têm um campo `unit`. Sem
prefixo, os dois viram `id="unit"` no mesmo DOM, o rótulo aponta para o de
cima, e o foco do erro cai no painel errado. O mesmo vale para lista com um
painel por linha (pasto, serviço, categoria financeira, que renderiza dois:
receita e despesa).

⚠️ **Campo que some da tela não pode ser cobrado.** No `order-form`, a
quantidade desaparece quando o serviço é de valor fixo: cobrá-la mandaria o
foco para um `id` que não está no DOM, a recusa apareceria e nada aconteceria.
Condicione a cobrança à visibilidade.

### Cor: o que o gate NÃO pega

O gate de contraste (item 6 do `check`) confere **pares de token**, não o uso
deles. Ele passa em três situações que já quebraram tela de verdade:

1. **`text-white` não tem tradução única.** Botão destrutivo é
   `text-superficie`, o par que o gate confere. Sobre fundo escuro é
   `text-texto-invertido`. E `bg-white/10` na casca escura do menu é
   `bg-texto-invertido/10`, **nunca** `bg-superficie/10`: `superficie` é cor de
   cartão claro e inverte no modo escuro, apagando o realce do hover.
2. **O alias depreciado `tibe.light` aponta para `--superficie-afundada`, que é
   o fundo do painel.** Toda pílula ou cartão com `bg-tibe-light` sobre a
   página fica **invisível**: sobra o texto solto. O contraste do texto
   continua ótimo, então o gate aprova para sempre. Foi assim com as pílulas de
   "Perfis ativos", corrigidas em 31/08. Código novo não usa o alias.
3. **Opacidade exige a cor em CANAIS.** `bg-sobreposicao/40` é ignorado em
   silêncio se o token for hex: o `<alpha-value>` do Tailwind precisa de
   `rgb(var(--x) / <alpha-value>)` e do valor em `0 0 0`. `tsc`, `lint` e
   `build` passam limpos, e só o olho pega.

Quando faltar um tom intermediário (borda sobre fundo suave, por exemplo),
**derive por opacidade** (`border-perigo-tinta/30`) em vez de inventar token: o
vocabulário só cresce quando o papel é novo.

### Aviso e recusa

- Recusa que pertence a um campo vai **embaixo do campo**, com o foco nele.
  Cair no rodapé significa que o `field` não atravessou.
- Ação sem formulário (botão de linha de tabela, alternar status) avisa por
  `useAviso()`, do `toast`. ⚠️ **A trava 10 lê o ARQUIVO, não a função**: um
  arquivo que trata a recusa do painel passa mesmo tendo um botão que a engole.
  Foi assim nos dois `category-manager`. Olhe função por função.

---
