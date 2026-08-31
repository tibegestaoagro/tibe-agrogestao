# Dívidas abertas do Tibé

Levantamento de 2026-08-18, feito com evidência no repositório, não de memória.
Existe para uma sessão nova conseguir escolher o próximo trabalho sem reler o
histórico inteiro.

**Como usar:** cada item tem o que é, a evidência (arquivo e linha, ou comando),
e o que custaria fechar. Nenhum item aqui está em andamento. O que está em
andamento vive no [current-handoff.md](current-handoff.md).

**Regra de manutenção:** ao fechar um item, apague-o daqui e registre no commit.
Lista de dívida que só cresce vira lista que ninguém lê.

---

## 1. Validação que nunca aconteceu

### 1.1 Estoque no aparelho (Módulo 31, missão 2)

Está em produção desde 2026-08-18, com o classificador do n8n já ensinado, mas
**nunca foi usado num celular de verdade**.

O roteiro está pronto em [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md),
6 blocos. Os blocos 1 e 3 já passaram contra produção pelo banco de provas
(`npm run wa`); faltam os blocos 2, 4 e 5, mais o que o banco de provas não
cobre por desenho: entrega no aparelho, áudio e foto de recibo.

**Por que importa mais do que parece:** o bloco 1 FALHOU nesse teste em
2026-08-18, gravando uma compra recusada de R$ 1.200. Cinco rodadas de juiz com
a suíte verde não tinham pego.

**Custo:** uma sessão de celular, mais o cadastro dos três produtos do bloco 0.

### 1.2 App mobile: 5 defeitos corrigidos, sem reteste

A branch `app-mobile-fundacao` tem **3 commits que a `main` não tem**, parada
desde 2026-08-05. Ela leva 21 arquivos `.tsx` contra os 9 que estão na `main`:
as abas Meu Dia e Tibé, Máquinas, a fila de escrita offline e a biometria.

Os 5 defeitos achados com modo avião num Android real foram corrigidos **e
nunca retestados**. Enquanto isso, a `main` recebeu Módulos 30 e 31 inteiros,
então a branch está 6 semanas atrás do back-end que ela consome.

**Custo:** rebase ou merge com resolução de conflito, mais uma passada de
aparelho. É a dívida que mais cresce sozinha.

### 1.3 Asaas nunca foi testado contra o sandbox real

O código de cobrança está em produção, mas a integração nunca rodou contra o
Asaas de verdade, nem em sandbox. Hoje isso significa que o caminho de
assinatura paga é o único do sistema sem nenhuma prova de integração.

**Custo:** chave de sandbox, mais uma rodada de teste do ciclo (criar
assinatura, webhook de pagamento, webhook de atraso).

---

## 2. Escopo desenhado e adiado

### 2.1 Módulo 31: FECHADO em 2026-08-28

As quatro missões entregues e mescladas. A missão 4 (permuta) tem um lado
entregue e um recebido, cada um
gravado por quem já sabe gravá-lo (rebanho, estoque, cadastro de Máquinas), e o
lado sem área no Tibé vira texto com aviso na tela. O valor da negociação é
**só a diferença em dinheiro**; os valores estimados do §12.4 ficaram fora da
v1, por decisão do usuário.

⚠️ **O que continua fora**, e não é esquecimento: peso, arroba e valor por
cabeça (§6.2, adiado desde a revisão de 2026-08-14), formas de pagamento do
§13, os nove filtros do §19, e o classificador do n8n, congelado por decisão do
usuário. Os handlers de WhatsApp das missões 3 e 4 existem e são testados, mas
**o agente ainda não emite** `registrar_remessa_evento`,
`encerrar_remessa_evento` nem `registrar_permuta`.

Próximo número livre de suíte: `m50`.

### 2.1.1 Missão 3, leilão e eventos: FEITA em 2026-08-28

Mesclada e em produção desde 2026-08-28. A remessa é uma
`Negotiation(evento)` sem valor com uma `HerdStay(evento)` filha, e **o envio
não gera lançamento financeiro nenhum** (§17.8). O encerramento exige a soma
dos três destinos bater com o enviado, e só aí nasce a receita, com comissão e
taxa como lançamentos filhos.

⚠️ **`HerdStay(evento)` deixou de ser criável direto**: quem abre remessa é
Negociações, e o Rebanho manda o produtor encerrar lá. Encerrar pelo Rebanho
moveria as cabeças sem registrar a venda.

O handler de WhatsApp existe e é testado, mas **o classificador do n8n ainda
não emite as duas intenções novas** (`registrar_remessa_evento`,
`encerrar_remessa_evento`): congelado por decisão do usuário.

Suíte `m48`. Spec e plano em `docs/superpowers/`.

### 2.2 Módulo 30, fase 2: FEITA em 2026-08-28

Mesclada e em produção desde 2026-08-28. Entregou pasto de
terceiros, boitel, animais de terceiros na fazenda e desaparecimento, com
identidade por `HerdStay`, encerramento que exige a soma bater, e os cinco
números separando propriedade de localização.

⚠️ **Duas correções ao que este arquivo dizia.** Ela não era "sem dinheiro":
o documento do cliente manda gerar despesa em pasto de terceiro e boitel, e
receita em animais de terceiros, e isso foi implementado. E o **confinamento
próprio não virou fluxo**: o documento pede que ele seja um local interno,
parecido com um pasto, então é `transferencia_pasto` para um pasto que
represente o confinamento, sem estadia nenhuma.

Spec e plano em `docs/superpowers/`.

### 2.3 Itens do documento do cliente registrados como adiados

`docs/specs/module-31-negociacoes.md` seção 7, decididos na revisão de
2026-08-13 para não ficarem "nem feitos nem adiados":

| item | situação |
|---|---|
| §19, os nove filtros da tela de Negociações | a action já aceita filtro; a tela só herda o seletor de propriedade |
| §13, formas de pagamento (dinheiro, pix, boleto) | não implementado; o parcelamento, que é o que mexe no financeiro, existe |
| §6.2 e §7.2, pasto de origem e destino | o WhatsApp lê, a tela web não oferece |
| histórico do aceite 23 | não implementado |
| tela de contatos | a v1 é o nome digitado no formulário |

O raciocínio registrado para os filtros continua válido: **filtro sem volume de
dado é enfeite**, e o primeiro cliente com 200 negócios é quem define quais
importam.

### 2.4 Rebanho por categoria x por brinco

O maior desalinhamento aberto com o cliente Agromax: foi pedido rebanho **por
categoria**, e o que existe é por brinco com categoria em cima. Não é dívida de
código, é de produto, e precisa de conversa antes de virar tarefa.

### 2.5 Site público, auth e plataforma sem token semântico

A frente 5 cobriu o **painel do tenant**, e ele está quase inteiro. Ficaram
fora, por decisão do usuário em 2026-08-28, os arquivos que restam na linha de
base (`scripts/baseline-cor-crua.json`):

⚠️ **Corrigido em 2026-08-31: este item afirmava que o painel estava INTEIRO, e
era falso.** A frase dizia "nenhum arquivo de `src/app/(dashboard)/` usa mais a
paleta crua". O piloto do time de agentes descobriu por quê: a regex da
conferência 8 cobria só `(text|bg|border)-`, e **quatro arquivos do painel
pintam `divide-gray` cru**, invisíveis ao portão. A regex foi estendida e os
quatro entraram na catraca. São dívida nova, pequena:
`alert-preference-toggles.tsx`, `configuracoes/assinatura/page.tsx`,
`dashboard/page.tsx` e `relatorios/page.tsx`.

A conta abaixo é a de **2026-08-28**, quando a base tinha 52. Hoje ela tem
**34**: saíram os 22 do site público, convertidos em 31/08, e entraram os 4 do
painel.

⚠️ **A catraca cresceu, contra o princípio de que ela só encolhe, e a exceção
foi autorizada pelo usuário em 2026-08-31.** Fica registrado aqui porque
autorização que não se acha depois não vale: os 4 arquivos são dívida
pré-existente que a regex antiga não enxergava, não regressão nova, e a
alternativa (consertá-los na mesma rodada) foi recusada para não misturar
frentes.

| o que | quantos |
|---|---|
| site público (`src/app/(public)/`) | 18 |
| auth, onboarding, escolher plano e afins | 14 |
| componentes do painel da plataforma (`src/components/platform/`) | 15 |
| componentes do site público (`src/components/public/`) | 4 |
| `src/components/signup/verify-code-form.tsx` | 1 |

⚠️ O plano previa que a linha de base fecharia em **32**, contando os
componentes de plataforma e de site público junto com o painel. Não é trabalho
esquecido: eles pertencem a estas duas frentes, não à do painel. As páginas de
`src/app/plataforma/` nem aparecem na conta, porque a catraca as exclui por
desenho (casca escura, onde o cinza claro é a escolha certa).

São outro contexto visual, com outro público, e validar marketing e curral no
mesmo dia dilui a atenção. A tela de login soma-se a isso por não ser validável
por este agente sem digitar senha.

**Custo:** uma rodada própria. O ganho é o modo escuro passar a ser possível no
app inteiro, e não só no painel.

⚠️ **Armadilha herdada, achada na varredura de 2026-08-31:** o alias depreciado
`tibe.light` aponta para `--superficie-afundada`, que é **exatamente o fundo do
painel**. Toda pílula ou cartão que ainda usa `bg-tibe-light` sobre a página
fica invisível: sobra o texto solto. Um caso foi corrigido (as pílulas de
"Perfis ativos" em Configurações); os que restam estão em hover de tabela, foco
de select e menus, onde o efeito é só um realce fraco, e no site público e
auth, que esta frente não cobriu.

### 2.6 `text-tibe-dark`: um token de SUPERFÍCIE pintando TEXTO, 41 vezes

**O que é:** `tibe.dark` é `var(--superficie-invertida)`
(`tailwind.config.ts`), cujo papel é "superfície inversa da página": é o verde
escuro da sidebar. Ele é usado como **cor de texto** (`text-tibe-dark`) em **41
lugares** do site público, nos títulos de `/`, `/planos`, `/faq`, `/docs` e das
três etapas de `/criar-conta`.

**Evidência:** achado pelo segundo julgamento independente da frente do token
semântico, em 2026-08-31.

**Por que importa, e é a dívida mais séria desta lista:** no dia do tema
escuro, o valor de `--superficie-invertida` será decidido pelo que a **sidebar
precisa ser**. Se ele continuar `#022e20` (verde escuro de marca, a escolha
natural para manter a sidebar), **todos os títulos do site público ficam verde
escuro sobre página escura**.

⚠️ **Isto mina a justificativa da frente que a descobriu.** A spec do site
público em token semântico se justifica dizendo que "depois que tudo fala
token, o tema escuro é um bloco que redefine os 37 de uma vez". Com 41 títulos
presos ao token da sidebar, não é.

**Custo de fechar:** decidir qual token os títulos devem usar (`--texto`? um
`--texto-marca` novo?) e trocar 41 ocorrências. É decisão de design, e deve
ser a **primeira tarefa da frente de tokens escuros**, não um remendo.

Sobram também `border-tibe-primary` (5) e `ring-tibe-primary` (1), do mesmo
bloco de alias.

### 2.7 Selos de método e chips de código no limiar do invisível

**O que é:** em `/docs/api`, os cinco selos de método HTTP e os cerca de 107
chips `<code>` de `/docs` têm fundo entre **1,037:1 e 1,100:1** contra o branco
da página. Medições do segundo julgamento independente, por WCAG 2.1:

| elemento | antes da frente | depois |
|---|---|---|
| selo PATCH | 1,114:1 | **1,037:1** |
| selo DELETE | 1,222:1 | 1,094:1 |
| selo GET | 1,220:1 | 1,088:1 |
| selo PUT | 1,180:1 | 1,100:1 |
| chip `<code>` | 1,101:1 | 1,056:1 |

**Por que importa:** a frente do token semântico deixou esses elementos mais
marginais do que já eram. E há inconsistência do nosso próprio critério: dois
chips que estavam em **1,000:1** (contraste zero, invisíveis) ganharam borda
para voltar a aparecer, e os cinco selos ficaram nesta faixa **sem borda**.

⚠️ **Nenhum portão mede isto**, e o `check-contraste.ts` nunca vai medir: ele
compara par (texto, fundo), e aqui o que está em jogo é fundo contra fundo. A
conferência 14 pega o caso extremo (fundo idêntico ao do pai), não o limiar.

**Custo de fechar:** decidir se pílula e chip precisam de contorno próprio por
padrão no sistema de design. É decisão de design, e **só o navegador resolve**:
1,056:1 é cálculo, não observação, e o quanto some depende de monitor e
ambiente.

✅ **Metade resolvida por observação, em 2026-08-31.** O usuário abriu
`/docs/api` em produção e confirmou que **os cinco selos se distinguem** entre
si, com o `PUT` verde de pé. A medição dizia 1,037:1 no PATCH e sugeria risco;
o olho disse que não há. **A medição estava certa e a conclusão que se tirava
dela, errada**, que é exatamente por que este projeto não fecha frente sem
abrir a tela.

**Continua aberto:** os cerca de 107 chips `<code>` inline de
`/docs/arquitetura`, `/docs/schema` e `/docs/api`, a 1,056:1. Não foram objeto
de pergunta específica na validação, e a resposta dos selos não se transfere
automaticamente: selo tem texto colorido e forma de pílula larga, chip é
estreito e monoespaçado.

---

## 3. Rede de segurança com furo

### 3.1 `scripts/m23-token-auth.test.ts` não compila: RESOLVIDO

⚠️ **Fechado em algum momento antes de 2026-08-31, e este registro não
acompanhou.** Conferido nessa data: `npx tsc --noEmit` sai com **0** e não
acusa nada em `m23`. O texto abaixo fica pelo histórico, e a lição é que
dívida fechada precisa ser apagada daqui, como o protocolo deste arquivo já
manda. Uma dívida que mente para mais é tão cara quanto uma que mente para
menos: ela faz alguém reservar rodada para trabalho que não existe.



`npx tsc --noEmit` acusa erros de tipo neste arquivo, e só nele. São
pré-existentes e não quebram o build (a Vercel não compila `scripts/`), mas
significam que **o comando de type-check nunca fica limpo**, e um erro novo se
esconde no meio do ruído.

O erro é de retorno: o teste atribui a resposta de uma rota de rebanho a uma
variável tipada como resposta de token.

**Custo:** pequeno, uma sessão curta. O ganho é `tsc` voltar a ser um sinal.

### 3.2 SEIS cópias do store de pendência do WhatsApp

⚠️ **Eram cinco em 2026-08-18. São seis desde 31/08**, quando o Confinamento
acrescentou `confinamento-pending.ts`, modelado linha a linha em
`event-pending.ts`. A dívida foi paga com juros justamente na frente que a
citava, e isso é o que acontece quando a extração fica para "a próxima".

`herd-pending.ts`, `negotiation-pending.ts`, `stock-pending.ts`,
`event-pending.ts`, `barter-pending.ts` e `confinamento-pending.ts` são o mesmo
mecanismo com prefixo de chave diferente: cerca de 90 linhas de Redis repetidas
seis vezes. O comentário de `negotiation-pending.ts` previa extrair um store
genérico "quando o terceiro domínio precisar disto"; chegamos ao sexto.

Extrair é seguro (nenhum tem lógica própria além do mapa de atalhos de campo),
mas toca quatro módulos que estão em produção, e por isso **não** foi feito no
meio da missão 4: é exatamente o risco que a nota original alertava.

**Custo:** uma rodada própria, com `m24`, `m36`, `m37`, `m48`, `m49` e `m51`
rodando antes e depois. O ganho é uma correção de bug de pendência valer para os
seis domínios de uma vez, em vez de precisar ser aplicada seis vezes.

### 3.3 `resolverPasto` não distingue ambiguidade: pega o primeiro

**O que é:** a função que traduz o pasto citado no WhatsApp (`resolverPasto`,
usada por `herd.ts` e por todos os handlers que aceitam pasto) faz `contains`
sem acento e **devolve o primeiro achado**. Não há tratamento de ambiguidade.

**Evidência:** achado em 2026-08-31 pelo `servidor-agente`, ao implementar o
pasto de retorno do Confinamento. O briefing pedia que o handler perguntasse
quando o pasto fosse ambíguo; ele foi implementar, descobriu que a função
compartilhada não distingue, **não mexeu no comportamento de outros módulos** e
relatou.

**Por que importa:** uma fazenda com "Pasto da Sede" e "Pasto da Sede Nova" faz
"sede" cair no primeiro, em silêncio. É a classe de defeito que este produto
menos pode ter: **dado errado gravado sem aviso**, no caminho em que o produtor
menos confere (uma conversa de WhatsApp no curral).

⚠️ Vale para **todo** o caminho de pasto do WhatsApp, não só o Confinamento, e
é anterior a esta frente.

**Custo de fechar:** a função é uma só, então a correção é local: contar os
achados e, com mais de um, devolver a mesma pergunta que já existe para "não
achei". O caro é conferir os handlers que a chamam, porque cada um precisa saber
guardar o pedido e reperguntar. Uma rodada, com `m34`, `m36`, `m38` e `m51`
antes e depois.

---

## 4. Cobertura desigual

### 4.1 `packages/contracts` cobre 4 domínios de muitos

Existem contratos tipados para `alerts`, `auth`, `financial` e `users`. O
back-end tem 58 arquivos de action e 84 rotas em `/api/v1`.

Isso importa porque o app mobile consome esses contratos: o que não está lá é
consumido sem segurança de tipo, e a divergência aparece em runtime, no
aparelho, longe de quem escreveu.

**Precedente concreto:** os contratos ficaram parados em 5 tipos de alerta
enquanto o banco chegou a 8, e um alerta de manutenção de máquina quebrava a
lista inteira no app. Já corrigido, mas a mesma forma de falha continua possível
em todo domínio não coberto.

---

## 5. Higiene menor

- **`.claude/settings.local.json` tem 175 permissões**, quase todas comandos de
  uso único de sessões passadas (`curl` para localhost, `rm` de arquivo
  temporário específico). É ruído, não risco: os curingas perigosos foram
  removidos em 2026-08-18. Limpar é cosmético.
- **A numeração de suíte descolou da de módulo** por volta do `m25` e não tem
  volta (renumerar colide). Já está documentado no `CLAUDE.md` e o
  `npm run check` reprova suíte órfã, então é convivência, não dívida.

---

## O que NÃO é dívida, e por quê

Registrado para uma sessão futura não "consertar" o que é decisão:

- **Saldo derivado, nunca gravado** (rebanho e estoque): é o invariante 2.
- **Recusa cancela sempre no estoque**, mesmo quando a mensagem traz correção
  contrastiva: decidido em 2026-08-18 depois de a alternativa gravar dinheiro.
  Reabrir exige ancorar no texto digitado, nunca em comparar campos remontados.
- **O produto nunca é criado pela conversa**: cadastro exige categoria e
  unidade, e adivinhar as duas cria três saldos para a mesma coisa.
- **Duas instâncias NextAuth** (tenant e plataforma): é o que impede uma sessão
  de tenant alcançar o painel interno.
