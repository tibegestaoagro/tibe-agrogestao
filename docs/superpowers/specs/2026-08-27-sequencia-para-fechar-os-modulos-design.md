# Sequência para fechar os módulos do Tibé

**Data:** 27 de agosto de 2026
**Alinhado com:** Dilton, por perguntas, nesta ordem: escopo, WhatsApp,
design system, sequência, piloto, registro.
**Natureza:** documento de sequência, não spec de implementação. Cada frente
ganha a sua própria spec quando começar.

---

## 1. A decisão de contexto

**O app mobile e o n8n ficam para depois do sistema completo.** Não é adiamento
por falta de tempo: é evitar retrabalhar o classificador e as telas do app a
cada mudança do sistema, que foi o motivo original de congelar o n8n em 18/08.

Com isso, "completo" passou a precisar de definição. A escolhida:

> **As specs abertas mais o polimento de UX.** Módulo 31 missões 3 e 4, fase 2
> do Módulo 30, e a adoção do design system nas telas.

**Fica de fora, com registro:** os cinco itens §7 adiados do Módulo 31 (nove
filtros, formas de pagamento, pasto na tela web, histórico do aceite, tela de
contatos) e as decisões de produto represadas com o cliente (rebanho por
categoria em vez de por brinco, validação das calculadoras). Não são
esquecimento: o raciocínio de cada um já está escrito em
[dividas.md](../../agents/dividas.md) e na spec do Módulo 31.

## 2. As cinco frentes, na ordem

| # | Frente | Toca schema | Suíte |
|---|---|---|---|
| 1 | Piloto de design no Rebanho | não | nenhuma nova |
| 2 | Módulo 30, fase 2 | sim | `m46` |
| 3 | Módulo 31, missão 3: leilão e eventos | sim | `m47` |
| 4 | Módulo 31, missão 4: permuta | sim | `m48` |
| 5 | Rollout do design system no que sobrar | não | nenhuma nova |

A permuta é a última por decisão da própria spec do Módulo 31 (decisão 11):
ela toca quatro módulos ao mesmo tempo, e fazer por último é fazer sobre peças
já testadas em uso real.

## 3. Por que a fase 2 vem antes do leilão

Esta é a única mudança de ordem em relação ao que os documentos anteriores
sugeriam, e ela vem de ler o complemento do Rebanho, que abre com uma regra
que não é fluxo, é modelo:

> O Tibé deverá mostrar separadamente: rebanho próprio total; animais próprios
> na fazenda; animais próprios fora da fazenda; animais de terceiros na
> fazenda.

O leilão é o **primeiro** fluxo do produto que precisa dizer "está no seu
rebanho, mas não está na sua fazenda". Se ele vier antes, essa separação nasce
por dentro de uma funcionalidade de Negociações e depois precisa ser
generalizada para pasto de terceiros, boitel, confinamento e desaparecimento.
Vindo depois, ele é só mais uma movimentação temporária somada ao envelope
comercial.

**Isso reconcilia uma contradição entre documentos.** O `dividas.md` dizia que
a missão 3 depende da fase 2 do Módulo 30; a spec do Módulo 31, na decisão 5,
diz que o leilão migrou para Negociações e a fase 2 ficou com os itens sem
dinheiro. Os dois estão certos sobre coisas diferentes: a spec sobre **onde o
fluxo mora**, o `dividas.md` sobre **de onde o modelo vem**.

## 4. O terreno já está preparado

Conferido no `prisma/schema.prisma`, e comentado lá por quem escreveu a fase 1:

- `HerdSituation` já tem `presente`, `evento`, `pasto_terceiro`, `boitel`,
  `confinamento` e `desaparecido`.
- `HerdOwner` já tem `proprio` e `terceiro`.
- `StockMovementType` já nasceu com `permuta_entrada` e `permuta_saida`.

O que falta são os **tipos de movimento** da fase 2 e, principalmente, a
separação entre "no rebanho" e "na fazenda" na tela. Acrescentar valor a enum
depois obrigaria a migrar movimentação já gravada, e foi por isso que os eixos
nasceram na fase 1 mesmo sem uso.

## 5. Escopo de cada frente

### Frente 1: piloto de design no Rebanho

O design system tem três camadas, e as três estão incompletas em graus
diferentes. Medido em 27/08:

- **Cor:** os tokens semânticos existem desde o `638d0f6`, mas o produto pinta
  com a paleta crua do Tailwind em **966 lugares, em 131 arquivos** (fora da
  `/plataforma`, excluída de propósito). O `check-contraste.ts` confere 25
  pares de token e **não enxerga** `text-gray-500`, que é o campeão com 168
  usos. A catraca protege a paleta que quase ninguém usa.
- **Escrita:** `FormSheet` está em 1 dos 27 painéis; `Field`, em 1 arquivo.
- **Leitura:** vazio, carregando, dado desatualizado, tabela em tela estreita e
  ação de linha não têm padrão nenhum.

O Rebanho foi escolhido como piloto pelo usuário: é a área que o produtor mais
usa, e a fase 2 cai em cima dela, então o padrão sai do piloto e já é
exercitado por trabalho real. São 1.501 linhas em 7 arquivos, com 71 cores
cruas.

**Entra:** zerar as 71 cores; converter os quatro painéis de escrita para
`FormSheet` e `Field`; fechar as duas lacunas que o kit ainda não cobre (foco
automático no primeiro campo inválido, e erro de campo vindo do servidor, que
hoje cai no erro global do rodapé); definir vazio, carregando e o
comportamento da tabela em tela estreita; e **estender o `npm run check` para
reprovar cor crua nova**, do mesmo jeito que ele já reprova `type="number"` e
travessão.

**Não entra:** o painel de totais do Rebanho. A fase 2 vai reescrevê-lo, e
construí-lo duas vezes é o retrabalho que esta ordem existe para evitar.

A skill de UI/UX entra aqui, na implementação.

### Frente 2: Módulo 30, fase 2

Cinco fluxos, do complemento do Rebanho: pasto de terceiros, animais de
terceiros na fazenda, desaparecimento, confinamento próprio e boitel. Mais a
regra de modelo da seção 3 acima, com os quatro totais separados.

Duas regras do documento que costumam escapar:

- **Desaparecimento não é morte.** Enquanto a ocorrência estiver aberta, o
  animal aparece separado no resumo e **não pode ser vendido, transferido nem
  movimentado**. Os encerramentos possíveis são encontrado, morte confirmada e
  perda confirmada.
- **Confinamento próprio é transferência interna**, não saída: o total não
  muda, e o confinamento precisa existir como local interno, parecido com um
  pasto.

### Frente 3: Módulo 31, missão 3, leilão e eventos

Remessa temporária com nome e tipo do evento, data de saída, fazenda de
origem, categoria e quantidade. Ao enviar: mantém no rebanho próprio, retira
da quantidade disponível na fazenda, classifica como em evento, não gera
receita nem venda.

No encerramento, o produtor informa quantos foram vendidos, quantos
retornaram e quantos seguiram para outro destino, e **a soma tem que bater com
a quantidade enviada**. A venda parcial gera receita só para os vendidos, com
comissão, taxa ou frete quando houver.

### Frente 4: Módulo 31, missão 4, permuta

O que saiu e o que entrou, com diferença em dinheiro opcional (nenhuma, paga
ou recebida), como **um registro único**. Atualiza rebanho, estoque, máquinas
(cria registro quando entra máquina, muda a situação quando sai) e financeiro.

A v1 aceita só os quatro tipos que movimentam algo (animais, produtos, máquina
e dinheiro), por decisão 7 da spec: serviço e outro não têm módulo que
atualizar e virariam texto, quebrando em silêncio a promessa de registrar uma
vez e o resto se atualizar.

### Frente 5: rollout do design system

O que sobrar depois do piloto, com o padrão já fechado e a catraca de cor já
no `npm run check`. Medido em 27/08, a conta é: dos 27 painéis de escrita, 1
já está convertido (`financeiro/entry-form.tsx`) e 4 saem no piloto (os do
Rebanho), então **restam 22**. Dos 131 arquivos com cor crua, 8 são do
Rebanho, então **restam 123**.

É o único bloco realmente mecânico, e é onde a skill `loop-goal` faz sentido:
trabalho longo, validado no fim.

## 6. WhatsApp: até onde vamos

A spec do Módulo 31, decisão 12, manda fazer o WhatsApp dentro de cada missão,
porque os defeitos de WhatsApp do Módulo 30 só apareceram em aparelho e foram
muitos, e concentrá-los no fim é descobrir todos de uma vez, no pior momento.

Com o n8n congelado, a decisão é dividir onde a fronteira já existe:

- **Handler, sim.** Actions, rota interna e handler nascem junto com a missão,
  com suíte cobrindo. É o que respeita a decisão 12.
- **Classificador do n8n, não.** Ele aprende tudo de uma vez na fase dele.

**Consequência aceita:** o caminho fica pronto e não usado por um tempo.

## 7. Validação

O invariante 8 do projeto diz que suíte verde não é validação, e a lista de
defeitos que só apareceram em uso real está no `CLAUDE.md`. Por frente:

- **Tela:** `next dev` mais navegador real. `next start` com cookie não serve:
  o Edge Middleware não reconhece a sessão nesse arranjo.
- **Handler de WhatsApp:** chamada direta à rota interna com o segredo, mais
  suíte. O `npm run wa` **não serve** para as missões novas, porque conversa
  com o agente de produção, que passa pelo classificador congelado.
- **Banco:** migração antes do push, aplicada primeiro no Docker local. É o
  invariante 3.

## 8. Correções que este documento faz

1. **Numeração de suíte.** A spec do Módulo 31 promete `m38` para o leilão e
   `m39` para a permuta. Os dois já foram usados: `m38` é
   `estoque-whatsapp` e `m39` é `sessao-rotas`. O próximo livre é `m46`, e a
   distribuição passa a ser `m46` fase 2, `m47` leilão, `m48` permuta.
2. **A contradição sobre o leilão** entre `dividas.md` e a spec do Módulo 31,
   explicada na seção 3.

As duas correções entram nos documentos de origem quando a frente
correspondente começar, para não editar spec de coisa que ainda não vai ser
feita.

## 9. O que este documento não decide

- Como a lista de Rebanho agrupa e conta (depende de categoria x brinco, que
  está fora do escopo).
- Qualquer coisa do app mobile e do interior do assistente.
- Notificações in-app, busca global e avatar com foto: continuam sem prazo,
  como o briefing de layout já registrava.
