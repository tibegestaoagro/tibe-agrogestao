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

A frente 5 cobriu o **painel do tenant**, e ele está inteiro: nenhum arquivo
de `src/app/(dashboard)/` nem de `src/components/` do painel usa mais a paleta
crua do Tailwind. Ficaram fora, por decisão do usuário em 2026-08-28, os
**52 arquivos** que restam na linha de base (`scripts/baseline-cor-crua.json`):

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

---

## 3. Rede de segurança com furo

### 3.1 `scripts/m23-token-auth.test.ts` não compila

`npx tsc --noEmit` acusa erros de tipo neste arquivo, e só nele. São
pré-existentes e não quebram o build (a Vercel não compila `scripts/`), mas
significam que **o comando de type-check nunca fica limpo**, e um erro novo se
esconde no meio do ruído.

O erro é de retorno: o teste atribui a resposta de uma rota de rebanho a uma
variável tipada como resposta de token.

**Custo:** pequeno, uma sessão curta. O ganho é `tsc` voltar a ser um sinal.

### 3.2 Cinco cópias do store de pendência do WhatsApp

`herd-pending.ts`, `negotiation-pending.ts`, `stock-pending.ts`,
`event-pending.ts` e `barter-pending.ts` são o mesmo mecanismo com prefixo de
chave diferente: cerca de 90 linhas de Redis repetidas cinco vezes. O
comentário de `negotiation-pending.ts` previa extrair um store genérico "quando
o terceiro domínio precisar disto"; chegamos ao quinto.

Extrair é seguro (nenhum tem lógica própria além do mapa de atalhos de campo),
mas toca quatro módulos que estão em produção, e por isso **não** foi feito no
meio da missão 4: é exatamente o risco que a nota original alertava.

**Custo:** uma rodada própria, com `m24`, `m36`, `m37`, `m48` e `m49` rodando
antes e depois. O ganho é uma correção de bug de pendência valer para os cinco
domínios de uma vez, em vez de precisar ser aplicada cinco vezes.

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
