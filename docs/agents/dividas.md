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

### 2.1 Módulo 31, missões 3 e 4

Não começaram. Estão desenhadas na spec:

- **Missão 3, leilão e eventos:** remessa temporária, situação "Em evento",
  encerramento com venda parcial. Depende do que a fase 2 do Módulo 30 abriu.
- **Missão 4, permuta:** qualquer item por qualquer item, com diferença em
  dinheiro, tocando 4 módulos num registro só. É o pedaço mais arriscado do
  documento do cliente.

Próximo número livre de suíte: `m39`.

### 2.2 Módulo 30, fase 2

`docs/specs/module-30-rebanho-livro-razao.md`, seção "Fase 2: complemento":
pasto de terceiros, boitel, confinamento próprio, desaparecimento e animais de
terceiros na fazenda. Cada um com seu encerramento, e a soma entre vendidos,
retornados e outras destinações precisa bater com a quantidade enviada.

A própria spec diz onde moram os piores bugs: nos encerramentos parciais.

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
