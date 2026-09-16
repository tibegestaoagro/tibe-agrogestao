# Dívidas abertas do Tibé

Levantamento de 2026-08-18, feito com evidência no repositório, não de memória.
Existe para uma sessão nova conseguir escolher o próximo trabalho sem reler o
histórico inteiro.

**Como usar:** cada item tem o que é, a evidência (arquivo e linha, ou comando),
e o que custaria fechar. Nenhum item aqui está em andamento. O que está em
andamento vive no [current-handoff.md](current-handoff.md).

**Regra de manutenção:** ao fechar um item, apague-o daqui e registre no commit.
Lista de dívida que só cresce vira lista que ninguém lê.

⚠️ **A numeração tem buracos, e isso é de propósito.** O item apagado não é
renumerado: o handoff, as specs de `docs/superpowers/` e o comentário da
conferência 8 em `scripts/check-repo.ts` citam a dívida pelo número (`§2.5`,
`§2.8`, `§2.9`), e renumerar transformaria cada citação numa referência para o
item errado. Item novo entra com o próximo número livre da seção.

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

### 2.3 Itens do documento do cliente registrados como adiados

`docs/specs/module-31-negociacoes.md` seção 7, decididos na revisão de
2026-08-13 para não ficarem "nem feitos nem adiados":

| item | situação |
|---|---|
| §19, os nove filtros da tela de Negociações | a action já aceita filtro; a tela só herda o seletor de propriedade |
| §13, formas de pagamento (dinheiro, pix, boleto) | não implementado; o parcelamento, que é o que mexe no financeiro, existe |
| §6.2 e §7.2, pasto de origem e destino | o WhatsApp lê, a tela web não oferece |
| §6.2, peso, arroba e valor por cabeça | adiado desde a revisão de 2026-08-14 |
| §12.4, os valores estimados da permuta | fora da v1; o valor da negociação é só a diferença em dinheiro |
| histórico do aceite 23 | não implementado |

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

O item que morava aqui era o `resolverPasto`, que escolhia o primeiro pasto
parecido em silêncio, fechado em 10/09/2026 (bloco 18 da `m34`).

### 3.1 Redis fora do ar pendura quem espera por ele

Achado em 2026-09-15, na Fase 2 do agente. `getRedisConnection()`
(`src/lib/redis.ts`) cria o cliente com `maxRetriesPerRequest: null`: com o
servidor inacessível, o comando fica na fila e tenta para sempre, e o `await`
nunca resolve nem rejeita. Nenhum `try/catch` pega isso. Valia antes da Fase 2
para os pendentes dos handlers (`pending-store.ts`); o cursor da conversa ganhou
um limite de 500 ms (`src/lib/agente/cursor.ts`), mas os pendentes não. Na
Vercel, o sintoma seria a rota estourar o tempo e o n8n reenviar. O BullMQ exige
`null` na conexão do worker, então a correção provável é uma segunda conexão,
com limite, para leitura e escrita curtas. Custo: pequeno, mas mexe no Redis de
produção inteiro.

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
- **`test:m17` falha entre 00h e 03h UTC.** Achado em 2026-09-15 na revisão
  final da Fase 1 do agente. `scripts/m17-agenda-custo.test.ts` (~1643) monta a
  data "daqui a 2 dias" pelo dia UTC, e `supportsThreeDayReminder`
  (`whatsapp-handlers/rebanho.ts`) conta pelo dia de São Paulo: nessas três horas
  a distância vira 3 dias e a promessa de lembrete aparece. É o teste, não o
  código. Custo: montar a data pelo dia de São Paulo (`inicioDoDiaEmSaoPaulo`).

### 5.0 O nome do vendedor sai com a preposição colada

Achado em 2026-09-16, na rodada de ponta a ponta da Fase 4: "comprei 15
bezerros do Ze Carlos" vira "Vendedor: **do** Ze Carlos" no resumo da
confirmação. O campo `contato` guarda o trecho literal, e o briefing dos
autores já pede o nome sem preposição ("Pasto da Baixada", não "no Pasto da
Baixada"), então é a extração que não está aparando. Não afeta o que é gravado,
só o texto que o produtor lê. Custo: aparar preposição inicial ao normalizar o
contato, com cuidado para não comer nome que comece com "Do" de verdade.

### 5.0a "Acabei de pagar o Zé" sai ambígua em parte das rodadas

Achado na avaliação da Fase 5 (16/09). Pagamento de trabalhador **sem valor** e
com o verbo fora do passado simples ("acabei de pagar", "acertei com o Zé") cai
em `ambigua` em algumas rodadas e acerta em outras. Tentei corrigir
acrescentando um exemplo ao registro, e o conjunto inteiro **piorou** de 97,2%
para 91,7%: revertido.

Custo: uma rodada de ajuste com conjunto maior que 40 casos, porque neste
tamanho um caso vale 2,8 pontos e o ajuste persegue ruído. Não grava nada
errado: o agente responde que não entendeu.

### 5.0b Duas perdas silenciosas no negócio de gado

As duas achadas pela revisão final da Fase 4, as duas de gravidade baixa porque
aparecem no resumo que o produtor confirma antes de qualquer escrita:

- **`negociacao.ts`, `primeiroItemBruto` lê só `itens[0]`.** "vendi uns bezerro
  e umas novilha" (duas categorias, nenhuma quantidade) descarta a novilha em
  silêncio. Antes da Fase 4 a conversa travava na pergunta composta até
  desistir, então não é regressão, mas é perda silenciosa num arquivo cujo
  cabeçalho diz combater exatamente isso.
- **`_categoria_candidatos` nunca é limpo do pendente.** Se uma SEGUNDA
  ambiguidade de categoria surgir na mesma negociação, a interseção usa a lista
  velha e pode fechar sozinha numa categoria que o produtor não escolheu.
  Caminho estreito, e o rótulo escolhido aparece na confirmação.

### 5.0c O formulário do cadastro assistido engole mensagem ambígua

Anterior à Fase 4, reproduzido em banco pela revisão final dela: com um cadastro
assistido aberto, "kkkkk" vira o brinco do animal. `handleActiveFlow`
(`whatsapp-router.ts`) consome a mensagem antes de qualquer outra decisão, e
`interrompe()` (`whatsapp-flow-bridge.ts`) trata `ambigua` e `cadastrar_animal`
do mesmo lado, então nenhuma etiqueta de intenção muda o resultado. **Não
grava**: o animal só nasce no resumo confirmado, e o produtor vê o lixo antes de
dizer "sim". Custo: `interrompe()` recusar `ambigua` quando o campo esperado
tem forma conhecida (brinco, data, número).

### 5.0d A lista de quem grava sem confirmar precisa de catraca

`INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR` (`whatsapp-handlers/shared.ts`) hoje tem
uma intenção só, e duas pontas distantes dependem dela: o handler do estoque e
a porta de mensagem ambígua do turno. A lista é lida pelas duas, então editar
uma ponta mostra a outra; **mas nada obriga quem escrever um handler NOVO que
grave sem confirmar a se declarar nela**, e esse esquecimento reabre o caminho
de gravação indevida que a Fase 4 fechou.

Fechado em 2026-09-16 pela catraca da seção 1c de `scripts/m68-agente-turno.test.ts`,
no mesmo molde da seção 8 de `m67`: toda intenção de escrita ou está na lista,
ou o arquivo do handler dela contém `"confirmacao"`. Fica aqui o registro do
porquê, que a suíte não tem como contar.

### 5.1 Categoria ambígua sem memória de candidata, em dois outros pontos

Achado em 2026-09-16, na Fase 4 do agente, enquanto a memória de candidata era
ligada no negócio de gado (commit `b6bbfe7`). A correção de lá cruza a resposta
do produtor com as opções que o agente acabou de mostrar, para "novilha" mais
"13 a 24" fechar em fêmea de 13 a 24 meses. **Dois caminhos irmãos continuam
sem essa memória**, e nenhum roteiro os exercitou ainda:

1. `whatsapp-handlers/negociacao.ts` (~295), a segunda resolução, que roda
   quando os itens já vêm completos numa mensagem só ("comprei 20 novilhas do
   João"). Ali existe um problema DIFERENTE e pior: se a rodada seguinte trouxer
   só a categoria (`{categoria: "13 a 24"}`), ela é descartada em silêncio,
   porque `itensDosParametros` dá preferência ao array `itens` com o termo
   antigo.
2. `whatsapp-handlers/herd.ts` (~555), `registrarMovimentacaoRebanho`, o fluxo
   de rebanho puro, com a mesma pergunta de faixa e o mesmo esquecimento.

Custo: passar `candidatosAnteriores` nos dois, como já se faz no negócio, e
decidir o que fazer quando o array `itens` e o campo achatado discordam. Não
grava nada errado: trava a conversa numa pergunta repetida, que é o modo caro
mas seguro de falhar.

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
