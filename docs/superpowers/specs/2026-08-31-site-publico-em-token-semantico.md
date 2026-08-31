# Site público em token semântico

**Data:** 31 de agosto de 2026
**Frente:** piloto do time de agentes, fase 2 do plano
**Origem:** [dividas.md](../../agents/dividas.md) §2.5
**Suíte:** `m50`

---

## 1. O problema

A frente 5 (2026-08-31) colocou o **painel do tenant** inteiro em token
semântico, e parou ali por decisão do usuário. A linha de base
`scripts/baseline-cor-crua.json` ficou com **52 arquivos**, que continuam
pintando com a paleta crua do Tailwind.

Cor crua trava o modo escuro: não há como redefinir `bg-gray-100` por tema.
Token semântico é o pré-requisito, porque depois que tudo fala token, o tema
escuro é um bloco que redefine os 37 de uma vez.

Esta missão cobre **22 dos 52**: o site público e seus componentes.

## 2. O terreno que já existe

| peça | estado |
|---|---|
| 37 tokens em `src/app/globals.css` | maduros, todos de tema **claro** |
| gramática do token | o nome diz o **papel**, nunca a cor |
| `scripts/check-contraste.ts` | parseia o `globals.css`, confere 25 pares (WCAG 2.1 AA) |
| conferência 8 do `npm run check` | catraca de cor crua, só encolhe |
| exposição no Tailwind | `tailwind.config.ts`, objetos aninhados por papel |

**Não existe modo escuro nenhum ainda**: nenhum `prefers-color-scheme`, nenhuma
classe `.dark`, nenhum `data-theme`.

## 3. As decisões, e por quê

| # | Decisão | Motivo |
|---|---|---|
| 1 | Os **15 componentes de plataforma ficam fora** desta missão | A casca da plataforma é escura (`bg-gray-950 text-gray-100`), e os 37 tokens são todos claros. Converter agora pintaria de claro sobre fundo escuro, e o portão de contraste aprovaria, porque ele compara par de token e nunca o uso. Seria a pílula invisível em escala |
| 2 | **Auth, onboarding e signup ficam para a rodada seguinte** (15 arquivos) | O site público é validável no navegador sem login nenhum. Misturar com fluxo de senha faria a validação ao vivo depender de estado de sessão no mesmo dia, e validar marketing e senha juntos dilui a atenção |
| 3 | **Modo escuro NÃO entra** | Trocar cor crua por token é o pré-requisito dele, não a entrega dele. Definir a paleta escura é decisão de design, e no meio da execução ela viraria decisão tomada às pressas |
| 4 | Bloco de código ganha **par de token próprio** (`--codigo-fundo`, `--codigo-texto`) | Os 15 `bg-gray-900` são todos `<pre>` de `/docs`. `--superficie-invertida` é o verde da marca (#022e20), que hoje é o fundo da sidebar: bloco de código com a cor da sidebar é escolha de marca, não tradução. Bloco de código tem convenção própria |
| 5 | **Nenhum agente inventa token** durante a execução | Token é de `tela-kit`, e mexer em token muda o que o `check-contraste.ts` lê. Se faltar token, o agente relata e para |

## 4. O mapa de tradução (o contrato)

**21 cores cruas distintas, 286 ocorrências, 22 arquivos.** Este mapa é o
contrato: nenhum agente decide tradução por conta própria.

| cor crua | ocorr | classe nova | token |
|---|---|---|---|
| `bg-gray-100` | 106 | `bg-superficie-afundada` | `--superficie-afundada` |
| `text-gray-900` | 61 | `text-texto` | `--texto` |
| `text-gray-600` | 28 | `text-texto-secundario` | `--texto-secundario` |
| `text-gray-500` | 16 | `text-texto-discreto` | `--texto-discreto` |
| `bg-gray-900` | 15 | `bg-codigo-fundo` | `--codigo-fundo` (novo) |
| `text-gray-100` | 15 | `text-codigo-texto` | `--codigo-texto` (novo) |
| `bg-white` | 10 | `bg-superficie` | `--superficie` |
| `text-gray-700` | 9 | `text-texto-secundario` | `--texto-secundario` |
| `border-gray-200` | 7 | `border-borda` | `--borda` |
| `border-gray-100` | 3 | `border-borda` | `--borda` |
| `bg-amber-100` | 3 | `bg-atencao-suave` | `--atencao-suave` |
| `bg-amber-50` | 2 | `bg-atencao-suave` | `--atencao-suave` |
| `text-amber-800` | 2 | `text-atencao-tinta` | `--atencao-tinta` |
| `text-red-700` | 2 | `text-perigo-tinta` | `--perigo-tinta` |
| `bg-red-50` | 1 | `bg-perigo-suave` | `--perigo-suave` |
| `bg-red-100` | 1 | `bg-perigo-suave` | `--perigo-suave` |
| `text-amber-700` | 1 | `text-atencao-tinta` | `--atencao-tinta` |
| `bg-blue-100` | 1 | `bg-info-suave` | `--info-suave` |
| `text-blue-700` | 1 | `text-info-tinta` | `--info-tinta` |
| `bg-gray-50` | 1 | `bg-superficie-afundada` | `--superficie-afundada` |
| `text-gray-300` | 1 | `text-texto-discreto` | `--texto-discreto` |

Vários tokens batem em hexadecimal com o cinza que substituem
(`--texto` é `#111827`, igual a `gray-900`; `--texto-secundario` é `#4b5563`,
igual a `gray-600`; `--borda` é `#e5e7eb`, igual a `gray-200`), o que confirma
que a paleta foi derivada deles. **Onde bate, a troca é invisível ao olho**, e
isso é o esperado: esta missão não muda o desenho, muda o vocabulário.

⚠️ **`text-gray-700` e `border-gray-100` não batem em hexadecimal** e vão para
o token de papel mais próximo. São 12 ocorrências, e a diferença é sutil.

⚠️ **O único ponto onde o pixel muda de propósito** são os 15 `<pre>`, e só
porque ganham token próprio com o mesmo valor de hoje (`#111827`).

## 5. Os dois tokens novos

```css
--codigo-fundo: #111827;
--codigo-texto: #f3f4f6;
```

Mesmos valores de hoje (`gray-900` e `gray-100`), então **nenhum pixel muda**.
O que muda é o vocabulário, e o fato de o modo escuro passar a poder
redefini-los.

Expostos no `tailwind.config.ts` como `codigo: { fundo, texto }`, gerando
`bg-codigo-fundo` e `text-codigo-texto`.

**Par de contraste novo** em `scripts/check-contraste.ts`:
`--codigo-texto` sobre `--codigo-fundo`, mínimo 4.5:1.

## 6. Entrega e provas

- `scripts/baseline-cor-crua.json` cai de **52 para 30** (saem os 22).
- `npm run check` verde nas 13 conferências, com o par de contraste novo.
- `npx tsc --noEmit` e `npm run lint` limpos.
- Suíte `m50`: prova que nenhum dos 22 arquivos casa com a regex de cor crua, e
  que os dois tokens novos existem no `globals.css` e no `tailwind.config.ts`.
- **Validação ao vivo:** abrir `/`, `/planos`, `/faq`, `/docs`, `/docs/api`,
  `/politicas/termos` e `/criar-conta` no navegador, sem login, e conferir que
  nada ficou invisível.

⚠️ **A prova que mais importa é a última.** A pílula invisível passou por
suíte verde e pelo portão de contraste. Bloco de código, aviso em âmbar e
tabela de schema são exatamente os lugares onde um fundo errado some.

## 7. Fora desta missão

Adiado, não descartado:

- **Os 15 componentes de plataforma** (decisão 1). Frente própria, que começa
  definindo o conjunto de tokens escuros.
- **Auth, onboarding, escolher plano, trocar senha e signup**, 15 arquivos
  (decisão 2). Rodada seguinte.
- **O modo escuro em si** (decisão 3).
- **As páginas de `src/app/plataforma/`**, que a catraca exclui por desenho:
  casca escura, onde o cinza claro é a escolha certa.
