# Agente WhatsApp: intenções "ajuda" e "resumo" (funil de dados)

Data: 2026-07-28
Status: aprovado, pronto para implementação

## Contexto

Testando o agente com um fazendeiro real, uma mensagem aberta ("me ajuda,
me diz tudo que eu já tenho cadastrado e me ajuda como que eu posso começar
a cadastrar") caiu no fallback genérico `ambigua` ("Desculpe, não entendi
sua mensagem..."). O público-alvo (produtores rurais, resistência a
tecnologia) precisa de duas coisas que o sistema hoje não oferece:

1. Perguntar **como fazer algo** ("como cadastro um animal?", "quais campos
   tem?") e receber uma resposta que realmente guia.
2. Perguntar **o que já está cadastrado** ("me mostra o que eu tenho") e
   receber dado real, sem precisar saber o comando exato.

Ao mesmo tempo, o usuário foi explícito: o assistente **não pode virar um
chatbot de conversa aberta** — precisa de limites claros e, quando a
intenção da pessoa não fica clara depois de tentar entender, encerrar
educadamente explicando o que faz, em vez de insistir indefinidamente.

## Decisão de arquitetura

Duas intenções novas, no mesmo padrão das 11 que já existem hoje
(`src/lib/whatsapp-intents.ts` + `src/lib/actions/whatsapp-router.ts`,
classificadas pelo LLM no N8N). Nenhuma infraestrutura de conversa nova: o
mecanismo de pergunta-de-esclarecimento → LLM reconstrói intenção e
parâmetros a partir do `recent_history` na próxima mensagem já existe hoje
(é como `cadastrar_animal` pergunta "qual das suas propriedades?" quando o
tenant tem mais de uma, e como a confirmação de venda de animal funciona) —
`ajuda` e `resumo` reusam exatamente esse mecanismo, só com prompts novos.

## 1. `ajuda` — resposta fixa por tópico, nunca texto gerado na hora

**Por quê fixa, não gerada pelo LLM:** previsibilidade. O LLM só classifica
*qual* tópico a pessoa quer (ou nenhum) — o texto de resposta em si vem de
uma tabela fixa no Tibé, igual toda outra resposta de sucesso/erro do
sistema hoje.

`INTENT_ACCESS`: `{ module: null, action: "read" }` (sem perfil obrigatório
— a checagem de perfil acontece por tópico, dentro do handler).
Parâmetro: `{ topic: string | null }`, onde `topic` é um dos nomes de
intenção existentes (`cadastrar_animal`, `registrar_peso`,
`registrar_vacina`, `registrar_movimento`, `cadastrar_servico_ordem`,
`consultar_saldo`, `consultar_animal`, `consultar_cliente`,
`gerar_relatorio`, `registrar_lancamento_financeiro`) ou `null`.

Textos (tabela `HELP_TEXT` em `src/lib/actions/whatsapp-router.ts`, tom
direto e com exemplo de frase pronta):

| topic | texto |
|---|---|
| `cadastrar_animal` | "Pra cadastrar um animal, me manda o brinco, a raça e o sexo (macho ou fêmea). Se tiver mais de uma propriedade, diz também em qual delas. Exemplo: 'cadastra o boi 1234, nelore, macho'." |
| `registrar_peso` | "Pra registrar o peso, me manda o brinco do animal e o peso em kg. Exemplo: 'pesei o boi 1234, deu 280 quilos'." |
| `registrar_vacina` | "Pra registrar uma vacina, me manda o brinco do animal e o nome da vacina (o custo é opcional). Exemplo: 'vacinei o boi 1234 contra aftosa'." |
| `registrar_movimento` | "Pra compra, venda, transferência ou morte de um animal, me manda o brinco e o tipo. Se for venda ou compra, pode dizer o valor também. Se for transferência, me diz pra qual propriedade. Exemplo: 'vendi o boi 1234 por 8000 reais'." |
| `cadastrar_servico_ordem` | "Pra registrar uma ordem de serviço, me manda o nome do cliente e o serviço prestado. Exemplo: 'fiz uma diária de trator pro cliente João'." |
| `consultar_saldo` | "É só perguntar! Pode pedir o saldo do mês atual ou de um mês específico. Exemplo: 'qual meu saldo de junho'." |
| `consultar_animal` | "Me manda o brinco do animal que você quer consultar. Exemplo: 'como está o boi 1234'." |
| `consultar_cliente` | "Me manda o nome do cliente que você quer consultar. Exemplo: 'quanto o João me deve'." |
| `gerar_relatorio` | "Posso te mandar o relatório financeiro em PDF, é só pedir. (Relatórios de rebanho, lavoura e prestador ainda não estão disponíveis por aqui.)" |
| `registrar_lancamento_financeiro` | "Pra lançar uma despesa, me conta o valor e do que se trata — ou, mais fácil, me manda uma foto ou PDF da nota que eu leio pra você." |
| `null` (geral) | Lista curta do que o assistente faz, montada a partir dos tópicos disponíveis pro perfil ativo do tenant (mesmo texto-base dos itens acima, resumido numa linha cada), terminando com um convite a perguntar sobre um item específico. |

Tópicos que exigem perfil `fazenda` (`cadastrar_animal`, `registrar_peso`,
`registrar_vacina`, `registrar_movimento`, `consultar_animal`) ou
`prestador` (`cadastrar_servico_ordem`, `consultar_cliente`) só aparecem na
lista geral e só respondem normalmente se o perfil correspondente está
ativo — se a pessoa pedir ajuda sobre um tópico do perfil que ela não tem,
a resposta é a mesma mensagem de "recurso não disponível pro seu perfil"
que as intenções de escrita/consulta já usam hoje.

## 2. `resumo` — funil de dados reais, não resposta fixa

Reusa as mesmas consultas que já alimentam `/dashboard`
(`src/app/(dashboard)/dashboard/page.tsx`): `db.animal.count`,
`db.plot.count`, `listUpcomingVaccinations`, `db.serviceClient.count`,
`getBalanceAction`, `db.alert.count` — mais uma consulta nova pra ordens
agendadas/a faturar. Zero lógica de negócio nova, só formatar como
mensagem de WhatsApp.

**`INTENT_ACCESS`**: `{ module: null, action: "read" }`.
**Parâmetro**: `{ scope: string | null }`, onde `scope` é um valor da
árvore abaixo.

### Árvore de categorias

```
nível 1 (top-level, filtrado por perfil ativo; financeiro sempre presente):
  rebanho     (perfil fazenda)   → FOLHA
  lavoura     (perfil fazenda)   → FOLHA
  prestador   (perfil prestador) → nível 2
  financeiro  (sempre)           → FOLHA

nível 2 (só sob "prestador"):
  clientes         → FOLHA
  agendamentos     → FOLHA
  contas_a_receber → FOLHA
```

**Folhas (dado real, formatado):**
- `rebanho`: "🐄 Rebanho: {N} animais ativos. Próxima vacina: {brinco} em {dias} dia(s)." (ou "nenhuma vacina prevista" se não houver).
- `lavoura`: "🌱 Lavoura: {N} talhões com ciclo ativo."
- `financeiro`: "💰 Financeiro: saldo do mês R$ {valor}. {N} alerta(s) pendente(s)."
- `clientes`: "🧾 Você tem {N} clientes cadastrados."
- `agendamentos`: "📅 Você tem {N} ordens de serviço agendadas (ainda não realizadas)." (`ServiceOrder.status: scheduled`)
- `contas_a_receber`: "💵 Você tem {N} ordens concluídas aguardando fatura, totalizando R$ {valor}." (`status: completed`, soma de `total_value`)

**Lógica do handler:**
1. Monta `availableTopLevel` a partir do perfil ativo (sempre inclui
   `financeiro`).
2. Se `scope` é uma folha de nível 1 disponível → responde com o dado.
3. Se `scope === "prestador"` e perfil prestador ativo → pergunta nível 2:
   "Quer saber sobre Clientes, Agendamentos ou Contas a receber?"
   (`requires_confirmation: false`, é uma pergunta comum, não uma
   confirmação sim/não — usa o mesmo `ask()` helper já existente).
4. Se `scope` é uma folha de nível 2 (`clientes`/`agendamentos`/
   `contas_a_receber`) e perfil prestador ativo → responde com o dado.
5. Se `scope` é `null`/não reconhecido/indisponível pro perfil:
   - Se é a **primeira** vez nesta conversa que `resumo` aparece sem
     escopo (ver "critério de 1 tentativa" abaixo) → pergunta nível 1:
     "Sobre o que você quer saber: {lista dos `availableTopLevel`}?"
   - Se **já foi perguntado** (nível 1 ou nível 2) e a resposta ainda não
     resolveu pra nenhuma categoria → encerra com a mensagem de
     capacidades (abaixo), **sem perguntar de novo**.

**Critério de "já foi perguntado" — sem estado novo, via prompt:** o
prompt de classificação (`Classificar Intenção (OpenAI)`) já recebe
`recent_history` com `intent_detected` de cada troca. Instrução adicional
no prompt: *"Se o histórico mostra que o assistente já perguntou sobre
escopo de `resumo` (nível 1 ou 2) e a resposta atual do usuário não indica
claramente uma das opções oferecidas, classifique como `ambigua` em vez de
`resumo` novamente — evita ficar perguntando à toa."* Isso empurra a
decisão "desistir de perguntar" pro mesmo lugar que já decide `confirmed`/
`explicitNo` hoje — consistente com o mecanismo existente, sem inventar
estado novo no Tibé.

**Mensagem de capacidades (usada tanto no give-up do `resumo` quanto,
opcionalmente, reaproveitada como o novo texto de `ambigua`):**
> "Eu posso cadastrar novas informações ou te contar o que já está
> cadastrado — só trabalho com dados que você me informa. Se quiser, me
> diga especificamente o que procura."

(Texto do próprio usuário, adotado quase literal.)

## 3. `ambigua` — só reescreve o texto, lógica intacta

Com `ajuda` cobrindo "como faço" e `resumo` cobrindo "o que eu tenho",
sobra pro fallback genérico o que realmente foge do escopo (papo social,
pedido sem relação com o sistema). Novo texto, mais direto e sem soar como
erro de sistema:

> "Não entendi. Posso cadastrar novas informações ou te contar o que já
> está cadastrado — me diga o que você quer fazer, ou pergunte 'o que você
> faz?' que eu te mostro as opções."

Isso convida a pessoa a cair em `ajuda`(`topic: null`) na próxima
mensagem, fechando o ciclo, sem prometer mais do que o sistema faz.

## Testes

Novo `scripts/m12-ajuda-resumo.test.ts` (`npm run test:m12`), chamando
`execute-action` diretamente (mesmo padrão de M3/M11):
- `ajuda` com `topic` de cada intenção retorna o texto certo.
- `ajuda` com `topic` de um perfil não-ativo retorna a mensagem de perfil
  indisponível.
- `ajuda` com `topic: null` lista só os tópicos do perfil ativo.
- `resumo` com `scope: null`, tenant com os dois perfis → pergunta nível 1
  listando as 4 categorias.
- `resumo` com `scope: null`, tenant só fazenda → pergunta nível 1 listando
  só rebanho/lavoura/financeiro.
- `resumo scope: "rebanho"` → retorna contagem real de animais/vacina
  (criar dado de teste antes).
- `resumo scope: "prestador"` → pergunta nível 2.
- `resumo scope: "clientes"` (perfil prestador ativo) → retorna contagem
  real.
- `resumo scope: "contas_a_receber"` → soma `total_value` de ordens
  `completed` corretamente.
- `resumo scope: "clientes"` sem perfil prestador ativo → mensagem de
  perfil indisponível, não quebra.

O critério de "não perguntar duas vezes" (via prompt do LLM) não é testável
pelos testes automatizados do Tibé (a lógica vive no prompt do N8N, não no
router) — validação é manual, no checklist de
`docs/n8n-whatsapp-workflow.md`.

## Fora de escopo

- Qualquer estado de conversa persistente além do que já existe
  (`recent_history` + reconstrução pelo LLM).
- Rebanho/Lavoura com segundo nível de detalhamento (ficam como folha por
  enquanto).
- Alterar o mecanismo de confirmação sim/não já existente.
