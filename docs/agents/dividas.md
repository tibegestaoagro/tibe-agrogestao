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
item errado. Item novo entra com o próximo número **nunca usado** da
seção: número de item apagado não volta. A 2.8 de 07/10/2026 (opacidade,
fechada em 14/10) reaproveitou o número da 2.8 do Confinamento, fechada em
14/09, e o código cita as duas como "dívida 2.8".

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

### 1.2 App mobile: três itens do reteste não exercitados

O app entrou na `main` em 13/10 (`c27f475`), depois de reteste num Android
real: login, barra de abas acima dos botões do sistema, cartão de Máquinas no
Mais, e máquina criada em modo avião subindo sozinha quando o sinal voltou
(conferida no banco). A mensagem de rede em português apareceu no reteste de
08/10.

Não foram exercitados no aparelho: (1) despesa lançada sem sinal entra na
fila em vez de falhar, (2) a faixa de pendências aparece no Financeiro e no
Início (vista só em Máquinas), (3) "Escolha a fazenda" aparece no próprio
campo. Exige Expo Go do **SDK 54**: o da Play Store se atualiza para o 57 e
recusa o projeto; instalar o APK de `expo.dev/go` e desligar a atualização
automática.

### 1.3 Asaas nunca foi testado contra o sandbox real

O código de cobrança está em produção, mas a integração nunca rodou contra o
Asaas de verdade, nem em sandbox. Hoje isso significa que o caminho de
assinatura paga é o único do sistema sem nenhuma prova de integração.

**Custo:** chave de sandbox, mais uma rodada de teste do ciclo (criar
assinatura, webhook de pagamento, webhook de atraso).

---

## 2. Escopo desenhado e adiado

### 2.4 Rebanho por categoria x por brinco

O maior desalinhamento aberto com o cliente Agromax: foi pedido rebanho **por
categoria**, e o que existe é por brinco com categoria em cima. Não é dívida de
código, é de produto, e precisa de conversa antes de virar tarefa.

Decisão do usuário em 14/10/2026: mostrar à Agromax o que o Módulo 30 já faz,
pelo roteiro [roteiro-agromax-rebanho-por-categoria.md](roteiro-agromax-rebanho-por-categoria.md),
e fechar ou transformar em lista conforme a resposta deles.

### 2.15 a 2.22: o que o Meu Empório deixou de fora de propósito

Decididas com o usuário em 27/10/2026, na entrevista da spec
[module-39-meu-emporio.md](../specs/module-39-meu-emporio.md) (a coluna
"decisão" aponta a pergunta, e o motivo está na seção 3 dela). Nenhuma é
furo: são cortes de escopo da primeira versão, registrados para não serem
redescobertos como defeito.

| # | o que falta | decisão | o que custaria |
|---|---|---|---|
| 2.15 | estoque da fazenda e do Empório se cruzarem (milho da fazenda vendido na loja, sal da loja no gado), e compra e venda do Empório como Negociação | Q2, Q42 | transferência entre `Property` e `Establishment` levando custo, sem mexer no resultado do rebanho |
| 2.16 | Empório pelo WhatsApp | Q10 | estudo próprio de quais intenções entram; as actions já nascem prontas para o agente |
| 2.17 | Base Rural: sinônimos e nomes regionais editáveis ("saco" e "saca") | Q11 | tabela de sinônimos mantida pela Plataforma |
| 2.18 | importar produtos e estoque inicial por planilha | Q45 | importação com conferência linha a linha antes de gravar |
| 2.19 | contas bancárias no Financeiro da fazenda | Q47 | `FinancialPayment` apontando para a conta, nas telas e no WhatsApp |
| 2.20 | cadastro público e cobrança da conta só de Empório | Q7, Q16 | opção "sou comerciante" no cadastro, plano e preço no Asaas |
| 2.21 | nota fiscal (NFC-e, NF-e), receituário agronômico, lote e validade obrigatórios | Q9 | projeto à parte (certificado, SEFAZ por estado). **Precisa existir antes de liberar o Empório para quem vende defensivo ou medicamento** |
| 2.22 | o agente do WhatsApp enxerga o produto criado no Empório ao procurar produto da fazenda ("usei ração para cachorro") | Q51, F1 | a Q51 só esconde nas telas da fazenda; resolver junto do agente do Empório (2.16) |

## 3. Rede de segurança com furo

O item que morava aqui era o `resolverPasto`, que escolhia o primeiro pasto
parecido em silêncio, fechado em 10/09/2026 (bloco 18 da `m34`).

## 4. Cobertura desigual

### 4.1 O app não lê `packages/contracts`

Desde a E9 (13/10/2026) o pacote cobre também rebanho, lavoura, serviços,
negociações e máquinas, e a `m73` (no CI) prende cada contrato ao servidor:
resposta real, chave exata, lista aninhada com item e enum igual ao do
Prisma. As rotas de escrita de máquinas importam o schema do pacote.

Desde 14/10/2026 também confinamento, leite, estoque, contatos, mão de obra,
tarefas e Meu Dia, cada um com a sua seção em `scripts/helpers/contratos/`.

Sobram dois furos. **O app não importa o pacote**: tem tipos próprios em
`apps/mobile/src/types/api.ts`, então a divergência entre app e servidor
continua aparecendo só no aparelho (importar exige configurar o Metro para
ler fora de `apps/mobile`, e reteste no Android). **Nulidade:** campo que o
cenário da `m73` nunca devolve nulo não prova o `.nullable()` do contrato.

**Precedente concreto:** os contratos ficaram parados em 5 tipos de alerta
enquanto o banco chegou a 8, e um alerta de manutenção de máquina quebrava a
lista inteira no app. A E9 achou o mesmo em `RelatedModule` (4 de 8) e
`FinancialEntryStatus` (sem `cancelled`).

---

## 5. Higiene menor

- **A numeração de suíte descolou da de módulo** por volta do `m25` e não tem
  volta (renumerar colide). Já está documentado no `CLAUDE.md` e o
  `npm run check` reprova suíte órfã, então é convivência, não dívida.

### 5.15 O filtro de situação das Negociações lê o período inteiro

Registrado na E10.1 (13/10/2026), rodada 2 do Codex; o usuário escolheu
"calcular e filtrar" sabendo do limite. A situação não é gravada, então
`listNegotiations` com `situacao` traz todos os negócios do período com os
lançamentos (uma consulta), filtra em memória e só então pagina; o detalhe da
página continua montado um por um, como na lista sem filtro. Com dezenas de
milhares de negócios no período, a chamada pesa. O caminho é derivar a
situação em SQL ou guardá-la com índice, e hidratar a página em lote.

### 5.13 A busca por nome não tem índice próprio

Registrado na E7 (08/10/2026), a partir da primeira rodada do Codex. A dívida
5.0 fechou: "Ze Carlos" casa "Zé Carlos" no banco, pela coluna gerada
`name_busca` de `Contact` e `ServiceClient`, sem ler a tabela para a memória.
Mas o filtro é `LIKE '%termo%'`, que nenhum índice B-tree atende: o Postgres
lê as linhas do tenant (pelo índice `tenant_id`) e filtra uma a uma. Em 08/10
o maior tenant tinha poucos contatos. Fechar: extensão `pg_trgm` e índice GIN
`gin_trgm_ops` em `name_busca`, quando um tenant passar de dezenas de milhares
de contatos. Termo com menos de 3 letras não usa o índice de qualquer jeito.

### 5.11 Pelo `execute-action`, negócio com dois itens vira duas conversas

Achado na validação viva da E5 (08/10, 01h55 UTC, telefone do `npm run wa`,
que não está no canário). "comprei uns bezerro e umas novilha do Ze Teste por
50 mil" chegou do classificador do n8n como DUAS chamadas de
`registrar_negocio_gado`, um item cada, sem quantidade: o produtor leu "Quantos
animais?" duas vezes, e a resposta seguinte ("13 a 24 meses") foi classificada
como `registrar_movimentacao_rebanho`, longe do negócio. Não gravou nada (a
conversa terminou em "não"), mas a correção da 5.0b só vale quando os itens
chegam juntos, o que a rota de turno faz.

Não é do Tibé: o classificador do n8n está congelado por decisão do usuário, e
a Fase 7 troca o `execute-action` pela rota de turno. Custo de fechar aqui:
nenhum, se a Fase 7 fechar; senão, ensinar o nó do n8n a mandar os itens numa
chamada só. Ainda falta ver a 5.0b ao vivo pela rota de turno: a cópia
`--homologacao` está desligada no n8n (404), e ligá-la, ou pôr o telefone de
teste no canário, é escrita no n8n de produção.

### 5.10 O buffer de mensagens picadas não é idempotente por mensagem

Achado pela quarta rodada do Codex na E3 (07/10/2026). Desde a 3.1 a conexão
compartilhada do Redis tem limite de 2 s, e um comando que estoura o limite
ainda executa depois. O append do buffer virou um script atômico (contador e
pedaço juntos), mas não sabe qual mensagem é: se o script atrasar e o n8n
reenviar, o atrasado executa depois do retry, avança o contador, e o flush do
retry sai `ready: false`. A mensagem fica no buffer sem ninguém para consumir.

A classe é anterior à 3.1 (antes o comando pendurava, a Vercel devolvia 504 e
o n8n reenviava do mesmo jeito); o limite curto só a torna menos rara. Exige
Redis lento por mais de 2 s E reenvio do n8n. **Custo:** a rota do buffer
receber o id da mensagem (o `message_id`, que o fluxo já tem nesse ponto) e o
script devolver o mesmo token para o mesmo id.

**Conferido em 14/10/2026, lendo o fluxo de produção:** nenhum nó HTTP tem
`retryOnFail`, então o n8n não reenvia sozinho; o cenário só nasce de quem
reexecutar à mão pelo painel. E "mesmo token para o mesmo id" tem um custo
que este texto não via: o webhook DUPLICADO da Evolution (duas execuções com o
mesmo id) passaria a ter as duas vencendo o flush e responderia duas vezes,
onde hoje só a última responde. Fica parada até alguém ligar retry no fluxo.

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
- **Os valores estimados da permuta (§12.4 de Negociações)**: fora da v1,
  decisão de 13/08 reconfirmada pelo usuário em 14/10/2026. O valor da permuta é
  só a diferença em dinheiro; reabrir quando um cliente pedir.
- **O histórico das Negociações (aceite 23 do §21)**: o usuário confirmou em
  14/10/2026 que está atendido pela lista com os nove filtros (E10) e pela ficha
  do contato, que lista os negócios dele.
