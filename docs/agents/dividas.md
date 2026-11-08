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

### 2.15 a 2.27: o que o Meu Empório deixou de fora de propósito

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
| 2.23 | custo extra na produção da loja (mão de obra, embalagem) somado ao custo do produto feito aqui | Q78, F2b | mexe no "Vendeu, Pagou" e na margem (F3, F4); hoje o custo é só a soma dos componentes |
| 2.24 | crédito na loja na devolução (o cliente sai com saldo para gastar depois) | Q86, F3a | precisa de um saldo do cliente, que não existe; hoje a devolução sai em dinheiro, abate do fiado ou vira troca |
| 2.25 | taxa de cartão por número de parcelas (2x, 3x...), antecipação do recebível do cartão e cheque no recebimento de fiado | Q89, Q91, F3b | tabela de taxa por faixa de parcelas na regra; antecipação como transferência com custo; o cheque do recebimento sem venda por trás |
| 2.26 | "Vendeu, Pagou" informado (valor digitado na venda) e despesa fixa semanal e anual. O terceiro item (conta do Empório paga pelo Financeiro sem sair da gaveta ou da conta) **fechado em 07/11/2026** (entrega 1 do financeiro do Empório): o Tibé recusa a conta do Empório com `ENTRY_DO_EMPORIO` | Q97, Q100, F4a | campo opcional no balcão por regra informada; periodicidade no modelo |
| 2.27 | **não vai existir: decisão Q222 de 07/11/2026, o Empório tem financeiro próprio.** O Financeiro do Tibé é só da fazenda e o `area` das rotas é aceito e ignorado | Q106, F4b, Q222 | nada: o filtro "Fazenda / Empório / Tudo" foi retirado |
| 2.28 | conciliação por OFX do banco e por NSU com o arquivo da adquirente. O carimbo manual por linha do extrato da conta **saiu em 08/11/2026** (entrega 3 do financeiro); falta a automação | Q226 | importador de OFX e do arquivo da adquirente, com casamento por valor, data e NSU. Falta saber qual adquirente a Agromax usa |
| 2.29 | fiado descontado por expectativa de recebimento no fluxo projetado | Q228 | estimar a taxa de recebimento por cliente e aplicá-la nas projeções de 30, 60 e 90 dias |
| 2.30 | DRE formal em três blocos, por loja e consolidada | Q235 | entra quando a nota fiscal entrar (2.21); o Resultado da Loja segue como DRE simplificada |
| 2.31 | juros e multa no fiado: campo reservado, regra desligada | Q218 | ligar a regra e decidir taxa, carência e texto que não ameace (CDC) |
| 2.32 | crediário com parcelas na venda e vencimento na safra: o prazo por cliente e o acordo deixam o lugar | Q214, Q223, Q230 | parcelas na venda, limite por safra e vencimento atrelado à colheita; só vale com cliente que use |
| 2.33 | lembrete automático de cobrança pelo WhatsApp | Q225 | consentimento do cliente, texto padrão que não ameace e chip que não seja o do agente |
| 2.34 | importação do XML da nota do fornecedor | Q229 | casar item da nota com produto do estoque; vai na frente de nota fiscal |
| 2.37 | concorrência no limite de fiado: a checagem de atraso e de limite roda em `prepararVenda`, fora da transação; duas vendas em fiado simultâneas do mesmo cliente (caixas ou lojas diferentes) passam as duas (limite 500, deve 450, duas vendas de 50). Dano máximo: o valor de uma venda | entrega 2 do financeiro, revisão da task 4 | repetir a checagem dentro de `gravarVenda`, na transação serializável |
| 2.38 | **fechada em 08/11/2026** (decisão do usuário): a liberação pontual é consumida pela PRIMEIRA venda em fiado do cliente naquela loja, mesmo uma que caberia sem ela; o usuário confirmou esse comportamento, e a alternativa (consumir só quando a venda precisaria da liberação) foi descartada | entrega 2 do financeiro, revisão da task 4, Q224 | nada: decidida |
| 2.36 | "Pedir liberação" sem fila própria: o Caixa e o Vendedor que esbarram em `FIADO_BLOQUEADO` ou `LIMITE_EXCEDIDO` avisam o Gestor fora do sistema, e o Gestor libera na ficha do cliente, logado como ele | entrega 2 do financeiro, Q224 | se a Agromax pedir, a liberação vira um pedido com aviso ao Gestor (tela e WhatsApp do Tibé) |
| 2.39 | desfazer acordo de fiado: a venda cujo fiado entrou num acordo não se cancela (409 `VENDA_EM_ACORDO`) e não existe ação que desfaça o acordo; erro no acordo hoje só se corrige por fora | entrega 3 do financeiro, Q230, Q233 | ação que cancela as parcelas sem pagamento e devolve as origens ao fiado aberto, com regra para acordo já parcialmente pago |
| 2.40 | o aviso de pedido de pagamento chega só pelo WhatsApp do Tibé, a Dono e Gerente geral que têm telefone cadastrado; sem email, sem push, e quem não tem telefone só vê o pedido na fila do Hoje | entrega 3 do financeiro, Q227 | email (`email-*`) e push para o aprovador; exigir telefone do aprovador |
| 2.41 | **fechada em 08/11/2026** (rodada 1 do juiz da entrega 3): o teto da devolução em dinheiro de venda em acordo desconta o que já voltou em dinheiro ou troca em TODAS as vendas do acordo; a segunda venda só devolve em dinheiro o que sobrou do recebido, e o resto vai por "abater no fiado" | entrega 3 do financeiro, revisão da task 3 | nada: resolvida |
| 2.42 | a parcela do acordo herda a loja da origem mais antiga: acordo com origens de lojas diferentes põe todo o recebimento na loja da primeira | entrega 3 do financeiro, Q230, Q233 | parcela por loja de origem, ou rateio do recebimento |
| 2.43 | a lista de pedidos "decididos" (aprovados e recusados) lê até 200 pedidos e filtra depois: com muito histórico, o mais antigo some da tela | entrega 3 do financeiro, task 6 | filtrar e paginar no banco |
| 2.44 | decisão a confirmar: pedido de pagamento pela gaveta leva o caixa de quem pediu (resolvido no pedido), e o saldo só se confere na aprovação; se o turno já fechou até lá, a aprovação falha com caixa fechado e o pedido fica pendente com o motivo em `last_failure` | entrega 3 do financeiro, Q227 | decidir se o aprovador precisa de turno aberto ou se o pedido de gaveta expira com o turno |

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

### 5.16 Empório, entrega 3 (vendedor e relatórios): o que a revisão deixou para depois

Registrado em 05/11/2026, na revisão final da branch `emporio-vendedor-relatorios`.
Nenhum bloqueia; cada um vale na próxima vez que o arquivo for tocado.
- `relatorioDeVendasAction` carrega até 366 dias de vendas e devoluções em
  memória (`src/lib/actions/emporio-relatorios.ts`); com volume real, `groupBy`.
- Produto só devolvido no período aparece com total negativo em "Vendas por
  produto" e também em "Produtos parados", que só olha venda.
- A devolução proporcional pode diferir 1 centavo de `EmporioSaleReturn.amount`
  no granel fracionado (igual ao `produtosDoMes`, que tem o mesmo cálculo).
- O papel pode sair "Caixa N (sem nome)" se quem registrou não tiver nome.
- `papelDoEmporio` chamado duas vezes no balcão e na venda sem vendedor
  (memorizado por requisição, custo quase nulo); `vendedoresDaLoja` em laço.
- Filtro de Relatórios: `Label` sem alvo quando a loja é fixa, aviso de "mês
  atual" em recusa que não é de data, texto morto "Escolha uma loja.".
- Roteiro `scripts/navegador/emporio-vendedor.py`: a contagem "2" da linha do
  vendedor nunca falha (o nome dele tem "2"), a Loja 2 não é conferida com
  zero, e "o Caixa não está na lista" passa com qualquer opção ausente.
- Testes que faltam: troca em outra loja herdando o vendedor sem revalidar,
  apresentação arquivada com preço nos parados, `por_produto` do Gestor.
- Comentário fora do lugar em `balcao.tsx` (perto da linha 146).

### 5.17 Empório, entrega 4 (orçamento): o que a revisão deixou para depois

Registrado em 05/11/2026, na revisão final da branch `emporio-orcamento`.
Nenhum bloqueia; cada um vale na próxima vez que o arquivo for tocado.
- A busca de orçamento por telefone ou documento compara os dígitos em
  memória, sobre todos os contatos com orçamento nas lojas e na situação
  pedidas, sem limite próprio; com volume, uma coluna de dígitos com índice.
  O `limit` não numérico é ignorado em vez de recusado.
- `orcamentoAFaturar` relê `PresentationPrice` que `precificarItens` já leu.
- `max_discount_pct: unknown` em `src/lib/emporio/precificar.ts`.
- Balcão: `preco_que_vale` nulo cai na recusa genérica do cliente, não na do
  servidor; o resumo do orçamento salvo fica na tela ao trocar para Venda;
  `?orcamento=` fica na URL se o orçamento for tirado e a venda for comum.
- A conferência 15 não vê `number`, `quote_id` e `notes`, que moram em
  `balcao-orcamento.tsx` (conferidos à mão: todos têm `error=`).
- Cupom: a linha "Orçamento nº" da venda não tem classe; não há teste do cupom
  renderizado nem de item sem `preco_sugerido`.
- Lista de Orçamentos: a busca do filtro não se ressincroniza com `q` na
  navegação para trás.
- Roteiro `scripts/navegador/emporio-orcamento.py`: "cancelada" conferido por
  trecho solto; `HOJE` por `utcnow` pode oscilar perto da meia-noite.

### 5.19 Empório, equipe separada do Tibé (Q190): o que a revisão deixou para depois

Registrado em 06/11/2026, na revisão da branch `emporio-equipe-separada`.
- Contar e depois gravar: dois cadastros simultâneos podem passar de 50 na
  equipe, e o convite cria o usuário sem função antes da transação (por um
  instante ele conta no plano).
- `definirVinculosAction` aceita vincular à loja um usuário do Tibé sem função
  (não dá acesso, mas mistura os dois mundos nos dados).
- `api-guard.ts`: o bloqueio do "só da loja" na API só vale com o perfil
  Empório ligado; se a Plataforma desligar o perfil, a equipe volta a ter a API
  da fazenda (a tela segue fechada).
- O rollback do cadastro que falha depois do convite não tem teste.
- O comentário de `emporio_only` em `schema.prisma` ficou velho (o Gerente
  geral agora é sempre só do Empório).
- As figuras da Equipe no manual ainda mostram o texto antigo de assentos.

### 5.20 Empório, clientes e fornecedores (Frente 1, Q191 a Q198): o que ficou para depois

Registrado em 06/11/2026, na branch `emporio-clientes-romaneio` (plano 1 de 3).
Nenhum bloqueia; cada um vale na próxima vez que o arquivo for tocado.
- `Contact.system_key` ficou sem uso: o Consumidor final mora em
  `EmporioCustomer` desde a migração `20261106180000`. A coluna e o índice
  único `[tenant_id, system_key]` podem sair numa migração futura.
- A busca de clientes por telefone e documento era do plano 2: **fechada**
  (06/11, branch `emporio-escolha-do-cliente`, Q199 a Q204). A janela e a tela
  Clientes buscam por nome, pedaço do documento e pedaço do telefone.
- `test:m92` falha de vez em quando com `TransactionWriteConflict` em
  `cashHandover.create` (corrida entre duas transações seriais da própria
  suíte); rodar de novo passa.
- A compra que nasce da Lista de Compra do Tibé (`shopping-items`) para uma loja
  vai sem fornecedor do Empório (`supplier_id` nulo): o contato da fazenda fica
  no item da lista, e Contact não é fornecedor do Empório (decisão da execução
  do plano).
- Arquivar e desarquivar cliente e fornecedor não são idempotentes: repetir a
  mesma chamada grava outra linha no Histórico.
- Editar fornecedor de propriedade sem `notes` grava um update vazio e uma linha
  de Histórico.
- A migração não tem `lock_timeout` nos `LOCK TABLE`: aplicar em horário de
  pouco uso (já é a regra da janela do deploy, Q198).
- Telas: a busca de Clientes e Fornecedores não se ressincroniza com `q` ao
  voltar no navegador; o filtro de Clientes usa checkbox cru. (A recusa antiga de
  `payment` na compra, que não sumia ao trocar para fornecedor de propriedade,
  foi **fechada** no plano 2.)

### 5.21 Empório, a escolha do cliente e do fornecedor (Frente 2, Q199 a Q204): o que ficou para depois

Registrado em 07/11/2026, na branch `emporio-escolha-do-cliente` (plano 2 de 3).
Nenhum bloqueia; cada um vale na próxima vez que o arquivo for tocado.
- A lista de orçamentos (`listarOrcamentosAction`) ainda filtra telefone e
  documento em memória; poderia usar `phone_busca` e a mesma regra da Q199.
- O nome do fornecedor de propriedade é copiado no cadastro do fornecedor e não
  acompanha a propriedade renomeada (`emporio-fornecedores.ts`, na criação e na
  edição). Vem do plano 1.
- O piscar da lista: a cada tecla a lista some e fica só "Buscando...", porque
  a janela só mostra a lista do termo digitado (a correção da corrida). Em
  conexão lenta a lista pisca entre uma tecla e outra. Manter a lista anterior
  esmaecida durante a busca exigiria marcar de qual termo ela é, e o Enter e a
  escolha continuariam a ignorá-la.
- A busca por dígitos da janela chama a rota a cada pausa de 300 ms, sem cache
  entre termos já digitados.
- Roteiros antigos frágeis, anteriores ao plano 2 (nada do plano 2 os
  tocou): `emporio-f1` morre com `IndexError` no passo 7 porque procura
  `operador-emporio@teste.local` em `GET /api/v1/users`, que desde a Q190
  (06/11, `emporio_role: null` na rota) não lista quem tem função no Empório;
  `emporio-f2a` só passou depois de o cenário da F1 ter rodado na mesma conta
  (os seletores dele leem o texto "F1 Loja" de outro cenário; sem ele a ordem
  dos cartões muda). Conserto: o `f1` achar o operador pela equipe do Empório,
  e o `f2a` não depender do cenário vizinho.
- Cada busca lê o papel do ator duas vezes (`exigir` e `lojasDoAtor`).
- O aviso "Cadastro incompleto" ao carregar um orçamento no balcão, o foco da
  recusa nos campos Cliente e Fornecedor (`role="group"`) e o telefone mascarado
  no cadastro aberto pela busca foram corrigidos na revisão final sem roteiro de
  navegador próprio: conferir na próxima vez que o balcão for tocado.

### 5.22 Empório, pedido para entrega e romaneio (Frente 3, Q205 a Q213): o que ficou para depois

Registrado em 07/11/2026, na branch `emporio-entrega-e-romaneio` (plano 3 de 3).
- **Acompanhar a entrega no sistema** (pedido do usuário, futuro): status,
  saiu, entregue, quem recebeu, frete e data agendada. Hoje a entrega fica com a
  logística da loja e o sistema só marca o pedido e imprime o romaneio.
- O orçamento não muda a entrega depois de salvo (não há edição de orçamento):
  quem corrige é o caixa ao faturar, ou qualquer função da loja (o Vendedor
  inclusive, decisão de 07/11), na venda fechada.
- A venda da troca nasce como retirada (Q211): quem atende na loja precisa marcá-la
  para entrega depois, em "Mudar".
- O romaneio não conta volumes (caixas, sacos): o que for preciso dizer vai na
  Observação da venda.
- O "Mudar" lê o estado de antes fora da transação: com duas mudanças
  simultâneas, o Histórico pode guardar um "antes" velho. Trocar só a escolha
  mantendo a mesma linha de endereço grava um Histórico com `changes` vazio.
- A recusa do cliente aparece duas vezes no painel "Mudar" (no campo e no
  rodapé).
- Cobertura de roteiro que falta: a leitura dos endereços que falha e o botão
  "Tentar de novo" (o radio `cadastro_entrega` some enquanto carrega ou se a
  leitura falha); as páginas da bobina são contadas por regex nos bytes do PDF.
- `DATA_HORA` repetido nos dois papéis do romaneio e o cabeçalho da loja no A4
  sem `overflow-wrap`.
- A suíte `m97` não cobre PJ sem documento nem `person_kind` nulo no resolver, e
  a seção 3 confere o `field` mas não a mensagem exata do principal incompleto e
  do "outro" sem bairro.

### 5.18 Empório, manual e cenário de demonstração: o que a revisão deixou para depois

Registrado em 05/11/2026, nas revisões da branch `emporio-manual-demonstracao`.
Nenhum bloqueia; cada um vale na próxima vez que o arquivo for tocado.
- Roteiro `scripts/navegador/manual-emporio.py`: a marca da figura
  `resultado-loja` depende do mês; a figura `orcamento-salvo` envelhece (o
  orçamento do cenário vence com os dias).
- Marcas numeradas de posição ruim no celular: o 3 de `fiado-lista-celular`
  cobre metade do valor da coluna Vendas, o 2 de `caixa-sangria-celular` fica
  entre o campo e o botão, o 3 de `venda-impressa-celular` encosta na borda do
  quadro Pagamento.
- Cenário de demonstração: os horários de hoje (sangria, conferência) não
  respeitam a hora em que o cenário roda; o CNPJ de demonstração não tem dígito
  verificador válido; rodar em outro dia exige `--apagar` antes. A trava
  manda encerrar o turno pela tela e rodar de novo, mas isso não refaz o
  estado: a chave `turno-dia-<loja>-00` repete o turno já encerrado, hoje fica
  sem turno aberto e os 30 dias mantêm as datas da primeira montagem (nada
  duplica). O "de hoje fica aberto" da Q189 vale na primeira rodada.
- `manual-emporio.py`: o vencimento `"2026-11-15"` da compra pendente é fixo
  (depois dele a figura mostra a compra vencida, sem reprovar); a figura
  `relatorios-periodo` mostra 30 dias, e não o mês atual que a tela abre.
- O roteiro desativa um usuário demo por um instante para a figura
  `equipe-caixa` (só local, desfeito no `finally`).

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
