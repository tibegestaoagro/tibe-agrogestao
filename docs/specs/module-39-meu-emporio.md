# Módulo 39: Meu Empório

**Origem:** o documento do cliente em `docs/area-meu-emporio/` ("Área Funcional:
Meu Empório", versão 0.1, 28 seções e 18 critérios de aceitação). É um `.doc`
binário antigo (não `.docx`), então o `unzip` das outras specs não serve. Leia
com o LibreOffice, gravando fora do repositório:

```
"C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to "txt:Text (encoded):UTF8" --outdir <scratchpad> "<caminho do .doc>"
```

O Word por COM não está registrado nesta máquina.

**Decisões tomadas com o usuário em 2026-10-27**, por entrevista em cinco
rodadas (Q1 a Q49), antes de qualquer código. A seção 3 registra cada uma com o
motivo: é o motivo que permite revisitar a decisão sem repetir a discussão.

> O documento do cliente se declara "em construção, sujeito a análise e
> alterações". Se a Equipe TIBÉ alterá-lo, confira esta spec contra a versão
> nova antes de continuar. O `.doc` não é editado por nós (Q49).

---

## 1. O que a área é, e o que ela não é

Área **opcional** para o pequeno comerciante agropecuário: de uma loja só até
uma Central de Distribuição com vários Pontos de Venda. O princípio do §1 do
documento: **o comerciante informa o que aconteceu, e o Tibé faz as
consequências** (baixa de estoque, conta a receber, caixa, resultado).

O §1 é explícito: **não é um ERP**. O §24 lista o que fica de fora (ordem de
produção, etapas de fabricação, folha completa, DRE formal, fidelidade). Esta
spec acrescenta as exclusões da seção 9.

O que o comerciante precisa responder (§2): o que tem e onde está, quanto cada
loja comprou e vendeu, quanto custa e por quanto vende, quanto tem a receber e
a pagar, quanto há em cada caixa, e se cada loja se paga.

## 2. Como a área é liberada

O Empório entra **só em contas escolhidas**. Na fase de teste, só na **Da
Mata**, e só para o Owner (o usuário). São duas camadas, com papéis diferentes
(Q4, Q12):

| camada | pergunta que responde | quem liga |
|---|---|---|
| `TenantFeature` (tabela nova) | "este recurso está liberado para esta conta?" | só a Plataforma |
| `TenantProfile` com `emporio` | "esta conta opera como comércio?" | criado junto com a liberação |

A tabela de recursos é **genérica**: serve para qualquer módulo futuro em
liberação controlada. Ela aceita uma **lista opcional de usuários** (Q14):
com a lista, só eles veem; sem a lista, a conta inteira vê. É o mesmo
princípio do canário do WhatsApp.

**Recurso desligado (Q13):** o menu não mostra, a página devolve 404 e a rota
da API devolve 404, como se não existisse. Os dados ficam: religar traz tudo de
volta. É o critério "Usar TIBÉ sem Meu Empório" do §25.

**Conta só de Empório (Q6, Q16, Q17):** existe, e é a que tem o perfil
`emporio` sem o perfil `fazenda`. Na primeira versão ela só nasce pela
Plataforma; o cadastro público continua oferecendo fazenda e prestador. Ela vê:
Meu Empório, Financeiro, Meu Dia, Contatos, Lista de Compra, Calculadoras e
Configurações.

⚠️ **Contatos e Lista de Compra hoje redirecionam quem não tem o perfil
`fazenda`** (`src/app/(dashboard)/contatos/page.tsx`, linha 43, e
`src/app/(dashboard)/lista-de-compra/page.tsx`, linha 44). As duas passam a
abrir também para `emporio`. Na Lista de Compra, marcar como comprado exige
fazenda (`src/lib/actions/shopping-items.ts`, `FAZENDA_NECESSARIA`): para o
Empório, esse passo aceita um estabelecimento. O menu decide pelos perfis em
`src/lib/nav.ts`.

**Cobrança (Q7):** nenhuma por enquanto. O preço do Empório é decidido quando
ele sair do teste.

**A Da Mata como conta de teste (Q5, Q15):** decisão do usuário. Os dados da
Da Mata são de teste, então o que o Empório lançar lá não precisa de limpeza.
Mesmo assim, o Financeiro separa Fazenda de Empório (Q28), porque o primeiro
cliente real com as duas coisas vai precisar.

---

## 3. Decisões

| # | decisão | motivo |
|---|---|---|
| Q1 | **Estabelecimento é entidade nova.** O estoque aceita fazenda OU estabelecimento, exatamente um dos dois, com uma regra de saldo só | reaproveitar `Property` poria a "Loja 1" nos seletores de rebanho, pasto, máquinas e leite; um livro-razão separado seriam duas regras de saldo |
| Q2 | Estoque da fazenda e do Empório **não se cruzam** na primeira versão. O cadastro de produto é compartilhado | o documento não pede o cruzamento, e ele mexe no custo do rebanho e no resultado da fazenda (§21.1). Dívida 2.15 |
| Q3 | **Unidade-base por produto** (kg, L ou unidade). Cada apresentação diz quanto vale nela ("saca = 10 kg"). O banco guarda na unidade-base | é o único caminho sem erro acumulado (§7.2, §23.3), e permite saca de 10 kg num produto e de 40 kg em outro |
| Q4 | **Tabela genérica de recursos** (`TenantFeature`), ligada só pela Plataforma | o usuário quer o mecanismo pronto para os próximos módulos em teste |
| Q5 | Conta de teste: **Da Mata** | decisão do usuário |
| Q6 | **Pode existir Empório sem fazenda**, e com fazenda | decisão do usuário |
| Q7 | **Sem cobrança** na fase de teste | a liberação já é controlada pela Plataforma |
| Q8 | Papéis: de-para (OWNER e ADMIN = Proprietário; OPERADOR = Atendente), mais **vínculo opcional usuário-estabelecimento**. Quem tem vínculo só vê e opera os seus | atende "consultar resultados de outras lojas" (§20) sem um segundo sistema de papéis |
| Q9 | **Sem nota fiscal, receituário ou lote obrigatório.** Lote e validade existem como campo opcional por produto | nota fiscal é projeto à parte (certificado, SEFAZ por estado). Dívida 2.21: precisa existir antes de liberar para quem vende defensivo |
| Q10 | **Sem WhatsApp** na primeira versão. As actions ficam prontas para o agente | o classificador do n8n está congelado; a solução para o Empório será estudada numa versão própria. Dívida 2.16 |
| Q11 | Sinônimos numa **lista fixa no código**, mais a busca sem acento que já existe | a "Base Rural" do §5.1 não existe; sinônimo pesa mais na linguagem natural, que vem com o WhatsApp. Dívida 2.17 |
| Q12 | **Duas camadas**: o recurso libera, o perfil diz que a conta opera como comércio | a tabela de recursos serve a qualquer módulo; o perfil já decide o menu |
| Q13 | Desligado = **404 na página e na API**, dados guardados | §3.1 e o critério "Usar TIBÉ sem Meu Empório" |
| Q14 | Liberação com **lista opcional de usuários**; no teste, só o Owner | a Da Mata tem outros usuários que não sabem do teste |
| Q15 | Dados de teste na Da Mata **sem limpeza** | decisão do usuário: a conta é de teste |
| Q16 | Conta só de Empório **só pela Plataforma** | uma conta pública só de Empório precisaria de plano e preço (Q7). Dívida 2.20 |
| Q17 | A conta só de Empório vê Empório, Financeiro, Meu Dia, Contatos, Lista de Compra, Calculadoras e Configurações | o §21 integra com essas áreas |
| Q18 | **Estoque negativo bloqueado**, com liberação pelo OWNER por estabelecimento | é o "não autorizado" do §6.4; travar o balcão quando a compra ainda não foi lançada faz o comerciante abandonar o sistema |
| Q19 | **Transferência em duas etapas**: a saída deixa "em trânsito", o destino confirma. Diferença na chegada vira perda na origem. Cancelar antes do recebimento devolve à origem | §4.3 e o alerta "transferência aguardando recebimento" do §21.3. Quem cuida dos dois lados confirma na hora |
| Q20 | **Saca lacrada e avulsa separadas** já na primeira versão | pedido do cliente (§7.3); decisão do usuário de aplicar, embora seja o item mais caro do documento |
| Q21 | **Custo médio ponderado por estabelecimento**, recalculado a cada entrada com custo. A transferência leva o custo médio da origem. Entrada sem custo marca o resultado como estimado | critério inicial do §18.1; "não apresentar resultado aparentemente preciso" (§19) |
| Q22 | **Rendimento opcional** na composição. Vazio = 100% | §6.4; é um número: consumido = quantidade ÷ rendimento |
| Q23 | **Cartão:** regra por estabelecimento e forma (débito, crédito à vista, crédito parcelado) com taxa % e prazo. O valor fica "a receber do cartão" e baixa sozinho na data prevista, uma data por parcela | separa venda de dinheiro disponível (§12.5) sem virar conciliação bancária |
| Q24 | **Cheque:** recebido, depositado, compensado ou devolvido. O devolvido **reabre a dívida** do cliente | cheque devolvido é o caso real que mais dói |
| Q25 | **Despesa fixa é um modelo** no Empório que gera os lançamentos reais no Financeiro a cada período, um por estabelecimento quando é dividida | o Financeiro não tem recorrência nem rateio (conferido no código em 27/10); o lançamento continua sendo a única verdade do dinheiro |
| Q26 | **Ponto de equilíbrio** pela margem do mês corrente; com menos de 10 vendas, os últimos 30 dias; sem venda, "sem dados ainda"; margem zero ou negativa diz que a loja não se paga com os preços atuais | não dá número absurdo no dia 2 e não finge precisão |
| Q27 | **Desconto** reduz a venda líquida e não entra no "Vendeu, Pagou". Limite % por estabelecimento; acima dele só OWNER ou ADMIN. Grava quem deu | §8 e §20 sem travar o balcão |
| Q28 | No Financeiro: `RelatedModule` **`emporio`**, campo de **estabelecimento** e filtro **"Fazenda / Empório / Tudo"** | §21.1; o Resultado da Loja já lê por estabelecimento |
| Q29 | A separação lacrado/avulso **liga por produto**, e vem ligada quando há apresentação fechada vendida também a granel | "mínimo possível de intervenção" (§7.3) |
| Q30 | A saca **abre sozinha** na venda a granel, como movimentação vinculada à venda | §7.3 literal |
| Q31 | Compra e produto feito na loja **entram lacrados**. A transferência leva lacrado e avulso separados (padrão: lacrado). A contagem pergunta **as duas quantidades**. Venda de saca fechada sem saca lacrada é **recusada** | a recusa da venda impossível é o motivo do §7.3 existir; a contagem é quando se descobre a verdade física |
| Q32 | Só o **OWNER** libera o negativo. A venda nesse caso usa o último custo médio e fica marcada como **custo provisório**; quando a compra entra, a venda antiga **não muda** | §23.4 proíbe mudar operação concluída; a marca atende o "estimado" do §17.2 |
| Q33 | Confirma o recebimento **quem tem acesso ao destino**. Parada há mais de **2 dias**, a transferência aparece no Meu Dia de quem tem acesso aos dois lados | quem recebe a mercadoria é quem está na loja |
| Q34 | **Três lugares para o dinheiro:** a **gaveta** de cada estabelecimento, as **contas bancárias** da conta do cliente (compartilháveis entre lojas, recebem PIX e débito) e o **a receber do cartão** | é a distinção do §14.1; duas lojas com um CNPJ é o caso comum |
| Q35 | **Conferência de caixa livre**, a qualquer momento, com justificativa da diferença. Um dia com movimento sem conferência gera aviso no Meu Dia | abertura e fechamento obrigatórios por turno travam o balcão (§14.2, "simples") |
| Q36 | **Cancelamento total** estorna tudo, só OWNER ou ADMIN. **Devolução parcial** é operação nova ligada à venda (a mercadoria volta, ou vira perda se avariada). **Troca** é devolução mais venda nova, ligadas. Nada é apagado | o critério "Cancelar ou devolver uma venda" pede as duas |
| Q37 | **Fiado exige cliente** cadastrado em Contatos, com cadastro rápido na venda. Vencimento opcional, sem juros nem multa | sem cliente não existe "José pagou R$ 100 do que devia" (§12.4) |
| Q38 | A compra pode ser **registrada antes de chegar**: a conta a pagar nasce na hora, o estoque entra no recebimento. Padrão: "já recebi". A pendente conta na sugestão de reposição | sem isso o item 4 do §11.4 (não duplicar a sugestão) não funciona |
| Q39 | **Parcelas informadas na compra** (entrada + N), uma conta a pagar por parcela | padrão que as Negociações já usam; cada vencimento aparece no Meu Dia |
| Q40 | O preço cadastrado **nunca muda sozinho**. Quando o custo sobe, a tela avisa e mostra o novo sugerido; o comerciante aplica um a um ou em lote | liberdade comercial (§10.3) |
| Q41 | **"Vendeu, Pagou":** a despesa é reconhecida na venda (entra na margem) e só sai do caixa quando paga. Taxa de cartão abate do a receber; comissão e entrega viram conta a pagar; embalagem cadastrada sai do estoque. O valor real corrige o lançamento | distinção literal do §16.4, sem saída de dinheiro fictícia |
| Q42 | Empório e **Negociações não se cruzam** | a Negociação foi desenhada para gado e insumo de fazenda; o balcão precisa de uma venda de dez segundos. Entra na dívida 2.15 |
| Q43 | Cada entrada de produto feito na loja **guarda uma cópia** da composição usada. Faltando componente, a entrada é recusada (salvo negativo liberado) | resolve o §6.4 com menos estrutura que versionar |
| Q44 | Receita da Calculadora como composição: **F5** | o §21.5 diz "poderão auxiliar" |
| Q45 | **Lista de primeiros passos** abrindo os formulários normais. Estoque e fiado iniciais entram como movimentação de **implantação** | importação por planilha é onde mais aparece dado sujo. Dívida 2.18 |
| Q46 | **Mínimo e máximo por produto e estabelecimento**, em tabela própria. O `minimum_stock` da fazenda continua | não mexe num alerta em produção; coerente com a Q2 |
| Q47 | A conta bancária é cadastro da **conta do cliente**, mas só o Empório a usa | mexer no pagamento da fazenda abre telas e o WhatsApp. Dívida 2.19 |
| Q48 | **Sete fases** (seção 6), com aprovação do usuário ao fim de cada uma | a venda precisa de estoque e custo para nascer com margem |
| Q49 | As decisões ficam **nesta spec**; as dívidas também no `dividas.md`; o `.doc` não muda | a v0.2 do documento do cliente pode ser gerada depois, sem retrabalho |
| Q50 | A **unidade-base do Empório mora no `EmporioProduct`**, separada do `Product.unit` da fazenda. O mesmo produto pode contar em sacas na fazenda e em kg na loja | os estoques não se cruzam (Q2); exigir kg na fazenda barraria sal e ração em sacas |
| Q51 | **Cada área lista o que é dela.** O Estoque da fazenda esconde o produto criado no Empório enquanto ele não tiver movimentação na fazenda; o Empório lista só o produto com configuração comercial; produto da fazenda entra no Empório por "usar no Empório" | critério "Usar TIBÉ sem Meu Empório" |
| Q52 | Na F1 o custo da formação de preço é o **custo de referência** do produto, na unidade-base, digitado. Com custo médio na loja (F2a), vale o custo médio | permite testar a formação antes das compras |
| Q53 | **Precedência dos percentuais:** a exceção da apresentação naquela loja, depois a do produto (vale em todas as lojas), depois o padrão da loja. Sem nenhum, zero | o §10.3 tem três níveis; exceção por produto por loja não tem caso concreto |
| Q54 | Apresentação **sem preço numa loja fica sem preço**: a tela mostra o sugerido e "aplicar". Na F3, vender sem preço pede o valor | §8: uma loja não mexe na outra |
| Q55 | Estabelecimento, preço e percentuais: **OWNER e ADMIN**. Produto, apresentação e custo de referência: também **OPERADOR**. VISUALIZADOR só lê | quem recebe a mercadoria cadastra; quem decide preço é o dono |
| Q56 | O vínculo usuário-estabelecimento se marca **na tela do estabelecimento** | não mexe na tela de Usuários, que a fazenda usa |
| Q57 | Na F1, **só as chaves** no produto. Lacrado/avulso é automático (ligado quando há apresentação fechada e a granel) até alguém escolher; lote e validade começam desligados. O dado de cada entrada vem na F2a | lote e validade são da entrada, não do produto |
| Q58 | "Central" e "Ponto de venda" são **só rótulo**, sem limite. Arquivar é livre na F1; **a partir da F2a exige saldo zero e nada em trânsito** | a spec não dá papel especial à Central |
| Q59 | `/emporio` vira **início com dois cartões** (Estabelecimentos, Produtos); a tela do produto reúne dados comerciais, apresentações e a tabela de preço por loja com o sugerido | o menu da conta mista já é longo; a tabela do §8 é por produto |
| Q60 | `quantity` **segue `Decimal(14,3)`** na F2a; a F2b decide se alarga quando a abertura de embalagem e o rendimento chegarem | três casas na unidade-base são 1 g, o que basta para compra e contagem |
| Q61 | Item da compra: **apresentação e quantidade** (ou quantidade na unidade-base) **e valor total do item**. O frete é rateado **pelo valor** dos itens. Grava o custo por unidade-base, frete incluído | ratear por quantidade jogaria frete demais no item barato e pesado |
| Q62 | No Financeiro, `related_module` `emporio`, a loja e a categoria de despesa **"Mercadorias para revenda"** (criada sob demanda). À vista: um lançamento pago; a prazo: um a pagar com vencimento; parcelada: um por parcela; com entrada: a entrada paga mais as parcelas | Q39 literal |
| Q63 | Recebimento **só total** na F2a. Cancelar só **sem parcela paga**: estorna as contas a pagar e, se já entrou, o estoque. Nada é apagado | recebimento parcial multiplica os casos de cancelamento |
| Q64 | **Custo médio ponderado móvel**, recalculado das movimentações em ordem; a saída sai pelo custo médio do momento e grava o `unit_cost` | a média simples erra quando o estoque baixa e volta com outro preço |
| Q65 | **Lacrado conta por apresentação fechada, em embalagens; avulso na unidade-base.** A movimentação lacrada guarda a apresentação. O total é a soma das duas | distingue saca de 10 kg de saca de 40 kg do mesmo produto |
| Q66 | Contagem informa o físico (anterior e corrigido, com motivo). **Perda com motivo de lista fixa** (vencido, avaria, furto, consumo próprio, outro) e observação, pelo custo médio. Perda acima do saldo é recusada, salvo negativo liberado | soma de perdas por motivo no resultado (F4) |
| Q67 | Mínimo e máximo por produto e loja; **"Precisa repor" no Empório**, contagem no Meu Dia; sugestão = máximo − (saldo + compras não recebidas). Sem alerta por WhatsApp ou email | o `low_stock` da fazenda fica intocado (Q46) |
| Q68 | O item da Lista ganha **estabelecimento opcional**. "Encaminhar à Lista" cria o item com loja e quantidade sugerida; "comprei" num item com loja cria uma compra simples na loja (à vista, recebida) | o que a F2a promete |
| Q69 | **Estoque inicial uma vez por produto e loja**, com custo opcional (sem custo, resultado estimado). Depois, só contagem | mais de uma implantação esconderia o que era contagem |
| Q70 | Fornecedor de Contatos, **sempre opcional**. A compra é a **primeira escrita com chave de operação**: repetir a chave devolve a compra gravada | não travar o balcão |
| Q71 | O início ganha **Estoque e Compras**; `/emporio/estoque` (por loja, por produto, consolidado, "Precisa repor"), `/emporio/compras` (lista e nova compra) e o bloco "Estoque por loja" na tela do produto | a compra junta vários produtos |
| Q72 | `quantity` **segue com 3 casas**: cada baixa da composição é **arredondada ao grama** e o saldo é a soma dos valores gravados, então não deriva (§23.3) | um grama numa baixa de ração não pesa |
| Q73 | Enviar transferência: **OPERADOR para cima com acesso à origem**; receber: quem tem acesso ao destino (Q33); cancelar: **só em trânsito**, por quem enviou ou por OWNER e ADMIN, e tudo volta à origem | quem errou o envio desfaz o próprio envio |
| Q74 | Chegou **menos**: a diferença é perda da origem, com motivo no recebimento. Chegou **mais**: recusado | aceitar sobra esconderia erro de envio |
| Q75 | Transferência com **vários itens**, cada um com lacrado por apresentação e avulso | a Central manda várias coisas no mesmo caminhão |
| Q76 | Enviar mais do que a origem tem é **recusado, salvo negativo liberado** (Q18) | a mesma regra da perda |
| Q77 | **Uma composição ativa por produto**, editável; componentes só do Empório, cada um na própria unidade-base; **ciclo recusado**; cadastrar ou editar não movimenta estoque | o documento; a cópia da Q43 cobre a mudança de receita |
| Q78 | Produzir: quantidade na unidade-base e, quando separa, as embalagens em que entra (lacrado, Q31). **Custo = soma dos componentes pelo custo médio da loja**, sem custo extra (dívida 2.23); componente sem custo marca estimado. Tudo numa operação | o custo extra mexe no "Vendeu, Pagou" da F3 |
| Q79 | **Cancelar produção:** OWNER e ADMIN, estorna o produto e devolve os componentes numa operação; recusado se o produto feito já saiu, salvo negativo liberado | errar a quantidade produzida é comum |
| Q80 | **`/emporio/transferencias`** e o cartão Transferências no início; na tela do produto, o bloco **Composição** e o **"Produzir aqui"** no Estoque por loja | a transferência junta vários produtos |
| Q81 | A F3 se divide em **F3a** (venda em dinheiro, PIX e fiado; recebimento de fiado; gaveta e contas; cancelamento, devolução e troca) e **F3b** (cartão, cheque, transferência entre caixas e conferência) | cada metade cabe numa rodada com validação viva; cartão e cheque não travam vender em dinheiro |
| Q82 | A venda gera **um** lançamento de receita no Financeiro, pelo valor líquido. Cada parte paga na hora é um `FinancialPayment` nele mais um `CashMovement` no destino; o fiado é o saldo em aberto do mesmo lançamento; receber fiado é outro pagamento mais movimento, sem venda nova | o aceite literal: "uma venda, R$ 120 recebidos e R$ 80 a receber" |
| Q83 | **Contas bancárias** cadastradas na conta do cliente, com nome e banco opcional; cada loja escolhe a conta padrão do PIX. **PIX sem conta é recusado**, com o aviso para cadastrar | misturar dinheiro físico e banco é o que o §14.1 separa |
| Q84 | **A saca abre sozinha:** a venda a granel baixa primeiro do avulso; se não cobre, abre embalagens fechadas, começando pela menor, até cobrir. A abertura é movimentação ligada à venda, e a sobra fica avulsa | abrir a menor preserva as fechadas maiores |
| Q85 | **Preço praticado abaixo do cadastrado é desconto**, com o mesmo limite % da loja; acima do limite, só OWNER e ADMIN, gravando quem deu. Acima do cadastrado é livre. Sem preço cadastrado, a venda pede o valor. Nada muda o preço cadastrado | uma regra só não deixa contornar o limite |
| Q86 | **Cancelamento total** (OWNER e ADMIN) devolve o estoque e cancela o lançamento, e o dinheiro recebido sai de onde entrou. **Devolução parcial**: a mercadoria volta (ou vira perda, se avariada), e o valor sai da gaveta ou abate do fiado. **Troca** = devolução mais venda nova, ligadas. Sem crédito na loja (dívida 2.24) | crédito na loja precisa de um saldo do cliente que ainda não existe |
| Q87 | Telas: **`/emporio/vender`** (o balcão, abre direto na venda), **`/emporio/vendas`** (lista, detalhe, cancelar, devolver, trocar), **`/emporio/fiado`** e **`/emporio/caixa`**; o início ganha os cartões | a "venda de dez segundos" não pode ter lista na frente |

---

## 4. Modelo de dados proposto

**É proposta, não contrato.** O `servidor-dados` confirma no início de cada
fase, e a mudança de nome ou de forma é registrada aqui. O que **não** muda
são os invariantes:

- **Nenhum saldo é gravado** (invariante 2): nem de estoque, nem de caixa, nem
  de lacrado ou avulso, nem de mercadoria em trânsito. Tudo é soma de
  movimentações não canceladas.
- **Todo model com `tenant_id` entra em `TENANT_SCOPED_MODELS`**
  (`src/lib/prisma.ts`), e `npm run test:isolation` reprova se esquecer.
- **Toda operação guarda os critérios do momento** (§23.4): preço, custo
  médio, taxa de cartão, regra do "Vendeu, Pagou", composição. Mudar a regra
  depois não mexe no passado.
- **Operação composta é atômica** (§23.1): a entrada de produto feito na loja,
  a venda que abre uma saca, a venda com pagamento misto. Uma transação, ou
  nada.
- **Idempotência** (§23.2): toda escrita do Empório aceita uma chave de
  operação, para que o reenvio (rede caída, botão clicado duas vezes, e depois
  o WhatsApp) não duplique.
- **Toda escrita grava quem e quando** (§13, §20).

### 4.1 Liberação

| model | campos principais |
|---|---|
| `TenantFeature` | `tenant_id`, `feature_key` (`emporio`), `enabled_at`, `disabled_at`, quem ligou |
| `TenantFeatureUser` | `tenant_feature_id`, `user_id` (lista vazia = conta inteira) |
| `ProfileType` | ganha `emporio` |

A checagem fica num ponto só (um `requireFeature("emporio")` usado pela
página, pela rota e pelo menu), para que o 404 da Q13 não dependa de cada tela
lembrar.

### 4.2 Estabelecimento e catálogo

| model | campos principais |
|---|---|
| `Establishment` | `name`, `kind` (`central`, `ponto_venda`), endereço, responsável, `archived_at`, `allow_negative_stock`, `max_discount_pct`, `default_expense_pct`, `default_profit_pct` |
| `UserEstablishment` | `user_id`, `establishment_id` (sem vínculo = vê todos) |
| `EmporioProduct` | `product_id` (1:1 com `Product`), `base_unit` (kg, L, unidade), `track_sealed`, `track_lot`, `track_expiry` |
| `ProductPresentation` | `product_id`, nome ("Saca 10 kg", "Quilo"), `base_qty` (quanto vale na unidade-base), `is_sealed_package`, ativo |
| `PresentationPrice` | `establishment_id`, `presentation_id`, `price`, exceções opcionais de % de despesas e de lucro |
| `Composition` | `product_id`, `reference_qty`, `yield_pct` opcional |
| `CompositionItem` | `composition_id`, componente, quantidade |
| `StockLimit` | `establishment_id`, `product_id`, `min_qty`, `max_qty` |

O cadastro básico continua em `Product` (§5.1); a configuração comercial é
toda opcional, e o produto simples não pede nada além do básico (§25, primeiro
critério).

### 4.3 Estoque

`StockMovement` ganha:
- `establishment_id`, e `property_id` passa a ser anulável, com `CHECK` de
  exatamente um dos dois;
- `package_state` (`lacrado`, `avulso` ou nulo para quem não separa);
- `unit_cost` (custo na unidade-base no momento) e um vínculo de operação, que
  amarra as movimentações de uma mesma operação;
- tipos novos em `StockMovementType`: transferência (saída e entrada),
  produção (entrada do produto e consumo do componente), abertura de
  embalagem, devolução, perda e implantação.

⚠️ **Precisão:** hoje `quantity` é `Decimal(14,3)` na unidade do produto. Na
unidade-base, 3 casas são 1 g, o que basta para venda, mas a abertura de
embalagem e o rendimento geram dízimas. A F0 decide entre ampliar a coluna
(alargar é seguro) e arredondar na borda. A regra do §23.3 é que a soma nunca
derive.

⚠️ **Risco que a F0 precisa fechar antes de mexer:** todo leitor atual de
`StockMovement` que soma sem filtrar por `property_id` passaria a contar o
estoque das lojas. Os leitores precisam ser auditados um a um (estoque da
fazenda, Negociações, confinamento, máquinas, alertas, WhatsApp), e uma suíte
prova que a fazenda não enxerga a loja.

O custo médio por estabelecimento é derivado das entradas com custo; o que fica
gravado é o `unit_cost` de cada saída, como registro do momento (§23.4), não um
saldo.

| model | para quê |
|---|---|
| `StockTransfer` | origem, destino, situação (`em_transito`, `recebida`, `cancelada`), quem enviou e quem recebeu. As quantidades vivem nas movimentações |
| `ProductionEntry` | a entrada de produto feito na loja, com a **cópia** da composição usada (Q43) |

### 4.4 Compra, venda e dinheiro

| model | para quê |
|---|---|
| `EmporioPurchase` + itens | estabelecimento, fornecedor (`Contact`), recebida ou não (Q38), frete somado ao custo (§9.3), parcelas |
| `EmporioSale` + itens | estabelecimento, cliente opcional (obrigatório no fiado, Q37), por item: apresentação, quantidade, preço sugerido, preço praticado, desconto, custo do momento, marca de custo provisório (Q32) |
| `EmporioSalePayment` | forma, valor, destino do dinheiro, regra de cartão do momento |
| `EmporioSaleReturn` | devolução parcial e troca, ligadas à venda (Q36) |
| `CashDrawer` | a gaveta de cada estabelecimento |
| `BankAccount` | conta bancária da conta do cliente (Q47) |
| `CashMovement` | onde o dinheiro está: entrada e saída da gaveta, da conta e do a receber do cartão, inclusive transferência entre caixas (§14.3). O saldo é a soma |
| `CashCount` | conferência: esperado, contado, diferença, justificativa (Q35) |
| `CardFeeRule` | estabelecimento, forma, taxa %, prazo em dias (Q23) |
| `EmporioCheck` | situação do cheque (Q24) |

**As formas de pagamento do Empório têm enum próprio:** dinheiro, PIX, débito,
crédito à vista, crédito parcelado, cheque e fiado. O `PaymentMethod` atual
(`dinheiro`, `pix`, `transferencia`, `boleto`, `cheque`, `cartao`, `outro`) não
separa débito de crédito nem tem fiado, e mudá-lo mexeria no Financeiro inteiro.

⚠️ **Quem é a verdade de quê** (definir no detalhe na F3, sem exceção):
- o **Financeiro** (`FinancialEntry` + `FinancialPayment`) é a verdade de
  receita, despesa, a receber e a pagar. O fiado é um lançamento a receber com
  o cliente; "José pagou R$ 100" é um `FinancialPayment` nele (§12.4);
- o **`CashMovement`** é a verdade de **onde** o dinheiro está. Ele aponta para
  o pagamento que o originou e nunca cria receita nem despesa. A transferência
  entre caixas só existe aqui, por isso não altera o resultado (§14.3).

### 4.5 Resultado

| model | para quê |
|---|---|
| `VariableExpenseRule` | "Vendeu, Pagou": tipo de cálculo (% , fixo por venda, por unidade, informado), condições (estabelecimento, forma, produto, apresentação) |
| `SaleVariableExpense` | a despesa reconhecida em cada venda, com a regra do momento |
| `FixedExpenseTemplate` + rateio | o modelo da despesa fixa (Q25): valor previsto, periodicidade, vencimento, divisão por estabelecimento em % ou valor |

`FinancialEntry` ganha `establishment_id` (anulável, ao lado de `property_id`),
e `RelatedModule` ganha `emporio` (Q28).

---

## 5. Regras que a spec fixa além do documento

1. **A baixa da composição só acontece com origem "feito aqui"** (§6.3). Quando
   a entrada vem de compra ou transferência, a origem já está dada e não se
   pergunta.
2. **A abertura de saca usa o menor número de sacas** que cobre a venda a
   granel, e a sobra vira avulso.
3. **A transferência de produto com separação** leva lacrado por padrão; o
   avulso só vai se a pessoa escolher.
4. **O ajuste de contagem nunca é venda nem compra** (§11.3): é movimentação de
   ajuste, guardando o saldo anterior e o corrigido, como já faz o estoque da
   fazenda.
5. **Sugestão de reposição** (§11.4) = máximo menos (saldo + compras não
   recebidas + transferências em trânsito para o mesmo estabelecimento). Sem
   máximo cadastrado, só alerta, sem quantidade sugerida. Com saldo em outro
   estabelecimento, oferece a transferência como alternativa. Nada é executado
   sem confirmação.
6. **Taxa de cartão em pagamento misto** incide só sobre a parte paga no
   cartão (§16.3).
7. **O % de despesas da formação de preço nunca entra na margem** (§17.6). Na
   margem entram só o custo real e o "Vendeu, Pagou" reconhecido.
8. **Resultado estimado** (§17.2): qualquer venda com custo desconhecido ou
   provisório, ou despesa fixa só prevista, marca o número como estimado, e a
   tela diz por quê (§26, "explicação dos números").
9. **Visão somada** (§14.3, §17.5): soma os estabelecimentos tirando as
   transferências internas, e conta a despesa dividida uma vez só.
10. **Usuário com vínculo** a estabelecimentos não vê a visão somada nem o
    resultado dos outros (§20).

---

## 6. Fases

Cada fase segue a ordem de sempre: **action, depois rota, só então tela**, com
suíte escrita da spec (`prova-suite`, sem ler a implementação) e validação no
navegador, na Da Mata, antes de pedir aprovação. Cada fase é uma branch. A
migração vai ao Neon antes do push (invariante 3), e merge e deploy esperam
autorização (invariante 7). A primeira suíte livre é a `test:m77`.

### F0: liberação e fundação

- `TenantFeature`, `TenantFeatureUser`, perfil `emporio`, `requireFeature`.
- Na Plataforma: ligar e desligar o recurso por conta, com a lista de usuários;
  criar conta só de Empório.
- Menu, Contatos e Lista de Compra abrindo para o perfil `emporio`. A rota
  da API passa a aceitar qualquer um de uma lista de perfis
  (`guard(..., { profile: ["fazenda", "emporio"] })`). Marcar item da Lista
  como comprado continua exigindo fazenda até a F2a, que é quando o
  estabelecimento passa a ter estoque para receber a compra.
- `FinancialEntry.establishment_id`, `RelatedModule.emporio`.
- `StockMovement` com `establishment_id`, `property_id` anulável e o `CHECK`;
  a **auditoria dos leitores** da seção 4.3.
- Na Da Mata, ligado só para o Owner.

**Aceite:** recurso desligado devolve 404 na página e na API e some do menu;
ligado com lista, só quem está na lista vê; conta só de Empório abre sem erro
em todas as telas da Q17; a fazenda não enxerga movimentação de loja (suíte).

### F1: estabelecimentos e catálogo

- Estabelecimento (cadastro, arquivar, configurações comerciais) e vínculo
  usuário-estabelecimento.
- Produto do Empório: unidade-base, apresentações, separação lacrado/avulso,
  lote e validade opcionais.
- Preço por estabelecimento e apresentação; formação de preço (custo, % de
  despesas, % de lucro, exceções por produto e apresentação, ajuste manual).

**Aceite (§25):** "cadastrar produto simples" não pede composição nem
configuração comercial; "vender o mesmo produto em lojas diferentes" aplica o
preço de cada uma (provado na F3, com o preço cadastrado aqui).

#### F1: contrato (Q50 a Q59)

**Modelo**, além do `Establishment` da F0. Todos com `tenant_id`, em
`TENANT_SCOPED_MODELS`, e com quem gravou (`created_by_user_id` ou
`updated_by_user_id`):

| model | campos |
|---|---|
| `UserEstablishment` | `user_id`, `establishment_id`; único pelo par |
| `EmporioProduct` | `product_id` (único), `base_unit` (`quilograma`, `litro` ou `unidade`, os ids de `src/lib/stock/units.ts`), `created_in_emporio`, `reference_cost` (por unidade-base, opcional), `track_sealed` (**anulável: nulo = automático**, Q57), `track_lot`, `track_expiry`, `expense_pct` e `profit_pct` (exceção do produto, opcionais), `archived_at` |
| `ProductPresentation` | `emporio_product_id`, `name`, `base_qty` (> 0; inteiro quando a unidade-base é `unidade`), `is_sealed_package`, `archived_at`; nome único no produto |
| `PresentationPrice` | `establishment_id`, `presentation_id`, `price` (opcional), `expense_pct` e `profit_pct` (exceção, opcionais); único pelo par |

**Cálculos, sem nada gravado:**

- lacrado/avulso efetivo = `track_sealed` quando escolhido; senão, ligado se
  houver apresentação ativa fechada E apresentação ativa não fechada;
- custo da apresentação = `reference_cost × base_qty` (na F2a, o custo médio
  da loja no lugar do `reference_cost`, quando houver);
- percentual = exceção da apresentação na loja, senão a do produto, senão o
  padrão da loja, senão 0 (Q53), para despesas e para lucro separadamente;
- **preço sugerido = custo × (1 + despesas/100) × (1 + lucro/100)**, em
  centavos arredondados (§10.1 e §10.2: 100, 115, 138); sem custo, nulo.

**Rotas** (`/api/v1/emporio/...`, todas com `guard("emporio", ...)` e o
recurso visível; desligado = 404):

| rota | o quê | quem escreve |
|---|---|---|
| `GET, POST establishments` | listar e criar | OWNER, ADMIN |
| `GET, PATCH establishments/[id]` | ler e editar | OWNER, ADMIN |
| `POST establishments/[id]/archive` | arquivar (`{ archived: boolean }`) | OWNER, ADMIN |
| `PUT establishments/[id]/users` | vínculos (`{ user_ids }`, substitui; vazio = ninguém vinculado) | OWNER, ADMIN |
| `GET, POST products` | listar e criar; o POST aceita `{ product_id }` (usar produto da fazenda) ou `{ name, category_id, base_unit, brand? }` | OWNER, ADMIN, OPERADOR |
| `GET products/candidates` | produtos da conta ainda fora do Empório | leitura |
| `GET, PATCH products/[id]` | o GET devolve apresentações e a tabela de preço por loja, com custo, percentuais efetivos e sugerido | OPERADOR, exceto `expense_pct`/`profit_pct` |
| `POST products/[id]/archive` | arquivar (`{ archived }`) | OWNER, ADMIN, OPERADOR |
| `POST products/[id]/presentations` | criar apresentação | OWNER, ADMIN, OPERADOR |
| `PATCH presentations/[id]`, `POST presentations/[id]/archive` | editar, arquivar | OWNER, ADMIN, OPERADOR |
| `PUT prices` | `{ establishment_id, presentation_id, price, expense_pct, profit_pct }`, upsert | OWNER, ADMIN |

O `[id]` de `products` é o do `EmporioProduct`.

**Recusas** (o `field` é o nome da API):

- nome repetido de loja, produto ou apresentação: 409 `DUPLICATE_NAME`, `name`.
  No produto, a mensagem manda usar o existente pelo "usar no Empório";
- percentual fora de 0 a 1000, preço ou custo negativo, `base_qty` zero ou
  fracionado em `unidade`: 422 `VALIDATION_ERROR` no campo;
- papel sem permissão para o que pediu: 403 `FORBIDDEN`;
- usuário vinculado a lojas que pede outra loja: 404.

**Visibilidade (Q8, Q56):** o usuário com vínculo só vê as lojas vinculadas,
na lista, no detalhe e na tabela de preço; sem vínculo, vê todas.

**Idempotência:** as escritas da F1 já são idempotentes pela forma: nome único
na criação, upsert no preço, substituição nos vínculos. A chave de operação
entra com a primeira escrita que não tem essa propriedade (a compra, F2a).

**Fora do Empório (Q51):** a tela de Estoque da fazenda e os seletores de
produto da fazenda escondem o produto com `created_in_emporio` sem
movimentação em propriedade. O agente do WhatsApp segue enxergando todos
(dívida 2.22).

### F2a: compra e estoque

- Compra à vista, a prazo, parcelada e com entrada; recebida ou não; frete no
  custo; conta a pagar no Financeiro.
- Saldo por estabelecimento, por produto em todas as lojas, consolidado, e
  lacrado contra avulso.
- Custo médio por estabelecimento.
- Ajuste de contagem (as duas quantidades, com motivo), perda e avaria.
- Mínimo e máximo, alerta e sugestão de reposição; encaminhar à Lista de
  Compra, e marcar item da Lista como comprado num estabelecimento.
- Estoque inicial como implantação.

**Aceite (§25):** "comprar a prazo" registra o estoque recebido e a obrigação;
"conferir estoque físico" ajusta com motivo e histórico; mais os critérios
adicionais do §11.4 (limites diferentes por loja, venda fracionada atualiza a
comparação, sem sugestão duplicada, produto sem limite funciona).

#### F2a: contrato (Q60 a Q71)

**Modelo.** `StockMovementType` ganha `implantacao` e `perda` (a compra usa o
`compra` que já existe; a contagem, o `ajuste`). `StockMovement` ganha
`package_state` (`lacrado`, `avulso`, nulo quando o produto não separa),
`presentation_id` (só no lacrado), `unit_cost` (por unidade-base),
`purchase_id` e `loss_reason`. Novos, todos escopados e com quem gravou:

| model | campos |
|---|---|
| `EmporioPurchase` | `establishment_id`, `contact_id?`, `operation_key` (único na conta), `purchased_at`, `received_at?` (nulo = ainda não chegou), `freight`, `payment_kind` (`a_vista`, `a_prazo`, `parcelada`), `notes?`, `canceled_at?`, `canceled_reason?` |
| `EmporioPurchaseItem` | `purchase_id`, `emporio_product_id`, `presentation_id?`, `quantity` (na apresentação, ou na unidade-base sem apresentação), `base_quantity`, `item_total`, `freight_share`, `unit_cost` (por unidade-base, frete incluído) |
| `StockLimit` | `establishment_id`, `emporio_product_id`, `min_qty?`, `max_qty?` (unidade-base); único pelo par |
| `ShoppingItem` | ganha `establishment_id?` |

A conta a pagar é `FinancialEntry` com `related_module` `emporio`,
`related_id` = id da compra e `establishment_id` (Q62).

**Regras:**
- **Quantidade:** sempre gravada na unidade-base. Lacrado = apresentação
  fechada × embalagens; avulso, direto.
- **Lacrado/avulso:** o produto com lacrado/avulso efetivo desligado grava
  `package_state` nulo e recusa quantidade lacrada. A compra de apresentação
  fechada entra lacrada; de apresentação aberta, ou na unidade-base, entra
  avulsa (Q31).
- **Custo médio (Q64):** por loja e produto, as movimentações não canceladas em
  ordem de `occurred_at` (desempate por `created_at`):
  - a entrada com custo refaz a média;
  - a entrada sem custo soma quantidade pela média vigente e marca
    `estimado`;
  - a saída mantém a média e grava `unit_cost`.
- **Rateio do frete (Q61):** pelo valor dos itens, em centavos. A sobra do
  arredondamento vai para o último item.
- **Saldo (invariante 2):** sempre soma. A loja com vínculo de usuário segue a
  Q56: fora do vínculo, 404.
- **Precisa repor (Q67):**
  - entra quando o saldo total é menor ou igual ao mínimo;
  - sugestão = `max_qty − (saldo + base_quantity das compras não recebidas e
    não canceladas)`, nunca negativa;
  - sem máximo, a sugestão é nula;
  - sem mínimo, o produto não entra.
- **Papéis:**
  - compra, recebimento, contagem, perda, estoque inicial e encaminhar à
    Lista: OWNER, ADMIN e OPERADOR;
  - cancelar compra e limites: OWNER e ADMIN.

**Actions** (`(db, ator, ...)` → `ActionResult`):

- **`src/lib/actions/emporio-estoque.ts`:**
  - `saldoDaLojaAction(db, ator, establishment_id)`;
  - `saldoDoProdutoAction(db, ator, emporio_product_id)`, por loja visível
    mais o consolidado;
  - `estoqueConsolidadoAction(db, ator)`;
  - `implantarEstoqueAction(db, ator, { establishment_id, emporio_product_id, sealed: [{ presentation_id, packages }], loose_qty, unit_cost? })`;
  - `registrarContagemAction(db, ator, { establishment_id, emporio_product_id, sealed, loose_qty, reason })`;
  - `registrarPerdaAction(db, ator, { establishment_id, emporio_product_id, package_state?, presentation_id?, quantity, reason, notes? })`;
  - `definirLimitesAction(db, ator, { establishment_id, emporio_product_id, min_qty, max_qty })`;
  - `precisaReporAction(db, ator, opts?: { establishment_id? })`;
  - `encaminharParaListaAction(db, ator, { establishment_id, emporio_product_id, quantity })`.
- **`src/lib/actions/emporio-compras.ts`:**
  - `criarCompraAction(db, ator, { operation_key, establishment_id, contact_id?, purchased_at, received, freight, items: [{ emporio_product_id, presentation_id?, quantity, item_total }], payment: { kind, due_date?, down_payment?, installments?: [{ amount, due_date }] }, notes? })`;
  - `receberCompraAction(db, ator, id, { received_at? })`;
  - `cancelarCompraAction(db, ator, id, { reason })`;
  - `listarComprasAction(db, ator, opts?)`;
  - `lerCompraAction(db, ator, id)`.
- **`src/lib/emporio/custo-medio.ts`:** a função pura
  `custoMedio(movimentos)` → `{ saldo, custo_medio, estimado }`.

Linha de saldo (por loja e produto): `establishment_id, establishment_name,
emporio_product_id, product_name, base_unit, total_qty, loose_qty,
sealed: [{ presentation_id, name, packages, base_qty }], average_cost,
estimated, min_qty, max_qty, needs_restock, suggested_qty`.

**Recusas:**
- **422 `VALIDATION_ERROR` no campo:**
  - quantidade zero ou negativa;
  - lacrado em produto sem separação (`sealed`);
  - parcelas que não fecham o total da compra mais o frete, menos a entrada
    (`installments`);
  - `min_qty` maior que `max_qty` (`max_qty`);
  - quantidade fracionada em produto de unidade-base `unidade`.
- **409 `ALREADY_IMPLANTED`:** segunda implantação.
- **409 `INSUFFICIENT_STOCK`, field `quantity`:** perda acima do saldo, sem
  negativo liberado.
- **409 `PURCHASE_HAS_PAYMENT`:** cancelar compra com parcela paga.
- **409 `ALREADY_RECEIVED`:** receber de novo.
- **Mesma `operation_key`:** devolve 200 com a compra gravada, sem duplicar.

**Rotas** (`/api/v1/emporio/...`):
- `stock` (GET, `?establishment_id=`) e `stock/consolidated` (GET);
- `products/[id]/stock` (GET);
- `stock/implantation`, `stock/count`, `stock/loss` (POST);
- `stock/limits` (PUT);
- `stock/restock` (GET) e `stock/restock/to-list` (POST);
- `purchases` (GET e POST), `purchases/[id]` (GET),
  `purchases/[id]/receive` (POST) e `purchases/[id]/cancel` (POST).

O "comprei" da Lista com loja continua em
`POST /api/v1/shopping-items/[id]/purchase`, com `establishment_id`.

### F2b: transferência e composição

- Transferência em duas etapas, em trânsito, confirmação, diferença como
  perda, cancelamento.
- Composição com rendimento; entrada de produto feito na loja com baixa dos
  componentes, recusa por falta, cópia da composição.

**Aceite (§25):** "cadastrar produto com composição" não movimenta estoque;
"entrar 400 kg de produto elaborado" acrescenta o produto e baixa 260, 116 e
24 kg; "comprar produto pronto que possui composição" não baixa ingrediente;
"transferir da Central para uma loja" não gera venda nem receita.

#### F2b: contrato (Q72 a Q80)

**Modelo.** `StockMovementType` ganha `transferencia_saida`,
`transferencia_entrada`, `producao_entrada` e `producao_consumo` (as duas
saídas entram no conjunto de saídas da loja). `StockMovement` ganha
`transfer_id` e `production_id`. Novos, todos escopados e com quem gravou:

| model | campos |
|---|---|
| `StockTransfer` | `origin_establishment_id`, `destination_establishment_id` (diferentes), `status` (`em_transito`, `recebida`, `cancelada`), `operation_key` (único na conta), `sent_at`, `sent_by_user_id`, `received_at?`, `received_by_user_id?`, `canceled_at?`, `canceled_by_user_id?`, `canceled_reason?`, `notes?` |
| `StockTransferItem` | `transfer_id`, `emporio_product_id`, `package_state?`, `presentation_id?` (só no lacrado), `sent_qty` (unidade-base), `received_qty?`, `loss_reason?` (quando chegou menos), `unit_cost` (custo médio da origem no envio) |
| `Composition` | `emporio_product_id` (único), `reference_qty` (na unidade-base do produto final), `yield_pct?` (vazio = 100) |
| `CompositionItem` | `composition_id`, `component_emporio_product_id`, `quantity` (na unidade-base do componente); componente único na composição |
| `ProductionEntry` | `establishment_id`, `emporio_product_id`, `operation_key` (único na conta), `produced_qty`, `composition_snapshot` (JSON: `reference_qty`, `yield_pct`, itens com nome, quantidade e unidade), `unit_cost`, `estimated`, `canceled_at?`, `canceled_by_user_id?` |

**Transferência:**
- **Envio:** grava uma `transferencia_saida` por item na origem, com o
  `unit_cost` = custo médio da origem. A mercadoria sai do saldo da origem no
  envio e só entra no destino no recebimento. **Em trânsito** = itens das
  transferências `em_transito`, e entra na sugestão de reposição do destino
  (regra 5 da seção 5).
- **Recebimento:** grava uma `transferencia_entrada` por item no destino, com
  o `received_qty` e o mesmo `unit_cost`, de modo que a média do destino
  absorve o custo da origem (Q21). `received_qty` maior que `sent_qty` é
  recusado (422 `items`). Menor exige `loss_reason` (422 `items`).
- **Diferença (Q74):** não gera movimentação nova, porque a mercadoria já saiu
  da origem no envio. Fica no item (`sent_qty − received_qty`, com o motivo) e
  conta como perda da origem no resultado (F4).
- **Cancelamento:** marca `canceled_at` nas saídas, e a origem recupera o
  saldo. Nada é apagado. Receber ou cancelar fora de `em_transito` dá 409
  `TRANSFER_NOT_IN_TRANSIT`.
- **Outros pontos:**
  - nunca gera lançamento financeiro (aceite §25);
  - origem igual ao destino dá 422 `destination_establishment_id`;
  - saldo insuficiente na origem dá 409 `INSUFFICIENT_STOCK` em `items`,
    salvo negativo liberado (Q76);
  - mesma `operation_key` devolve a transferência gravada.
- **Meu Dia (Q33):** a transferência em trânsito há mais de 2 dias aparece,
  como contagem, para quem tem acesso às duas lojas.

**Composição e produção:**
- **Composição (Q77):**
  - `PUT` substitui a composição inteira;
  - componente igual ao produto, ou que leve de volta a ele por qualquer
    caminho, dá 422 `items` (ciclo);
  - não movimenta estoque.
- **Baixa de cada componente:**
  `quantity × produced_qty / reference_qty / (yield_pct / 100)`, arredondada a
  3 casas (Q72). Exemplo do aceite: 65, 29 e 6 para 100 kg; produzir 400 kg
  baixa 260, 116 e 24 kg.
- **Produção (Q43, Q78):** numa transação só,
  - grava um `producao_consumo` por componente, pelo custo médio do
    componente na loja;
  - grava um `producao_entrada` do produto, com `unit_cost` = soma dos custos
    consumidos ÷ `produced_qty`, `estimated` se algum componente estava
    estimado ou sem custo;
  - quando o produto separa, a entrada é lacrada nas embalagens informadas
    (`sealed`) e o resto é avulso.
- **Recusas na produção:**
  - componente sem saldo dá 409 `INSUFFICIENT_STOCK`, field `components`,
    dizendo qual falta, salvo negativo liberado;
  - produto sem composição dá 422 `COMPOSITION_REQUIRED`.
- **Compra de produto que tem composição:** não baixa ingrediente (aceite
  §25), porque só a produção baixa (regra 1 da seção 5).
- **Cancelar produção (Q79):** OWNER e ADMIN. Marca `canceled_at` nas
  movimentações da produção. Recusa com 409 `INSUFFICIENT_STOCK` se o saldo do
  produto ficaria negativo, salvo negativo liberado.

**Papéis:** enviar e receber são de OPERADOR para cima, com a loja no vínculo
(origem para enviar, destino para receber). Cancelar a transferência é de quem
enviou, ou de OWNER e ADMIN. Composição: OWNER e ADMIN. Produzir: OPERADOR para
cima. Cancelar produção: OWNER e ADMIN.

**Actions:**
- `src/lib/actions/emporio-transferencias.ts`:
  - `enviarTransferenciaAction(db, ator, { operation_key, origin_establishment_id, destination_establishment_id, items: [{ emporio_product_id, presentation_id?, packages?, quantity? }], notes? })`;
  - `receberTransferenciaAction(db, ator, id, { items: [{ item_id, received_qty, loss_reason? }] })`;
  - `cancelarTransferenciaAction(db, ator, id, { reason })`;
  - `listarTransferenciasAction(db, ator, opts?)`;
  - `lerTransferenciaAction(db, ator, id)`;
  - `transferenciasParadasAction(db, ator)`, para o Meu Dia.
- `src/lib/actions/emporio-producao.ts`:
  - `lerComposicaoAction(db, ator, emporio_product_id)`;
  - `definirComposicaoAction(db, ator, emporio_product_id, { reference_qty, yield_pct?, items: [{ component_emporio_product_id, quantity }] })`;
  - `produzirAction(db, ator, { operation_key, establishment_id, emporio_product_id, produced_qty, sealed?: [{ presentation_id, packages }] })`;
  - `cancelarProducaoAction(db, ator, id, { reason })`;
  - `listarProducoesAction(db, ator, opts?)`.

No item enviado, lacrado leva `presentation_id` e `packages`, e avulso leva
`quantity` na unidade-base.

**Rotas** (`/api/v1/emporio/...`):
- `transfers` (GET e POST) e `transfers/[id]` (GET);
- `transfers/[id]/receive` e `transfers/[id]/cancel` (POST);
- `products/[id]/composition` (GET e PUT);
- `production` (GET e POST) e `production/[id]/cancel` (POST).

### F3: venda e caixa

- Venda com preço sugerido, desconto com limite, pagamento misto.
- Abertura automática de saca, recusa da venda impossível.
- Fiado com cliente, recebimento parcial.
- Cartão (taxa, prazo, parcelas, baixa automática) e cheque (quatro situações,
  devolvido reabre a dívida).
- Gaveta, contas bancárias, a receber do cartão, transferência entre caixas,
  conferência.
- Cancelamento, devolução parcial e troca.

**Aceite (§25):** "vender 1 kg de saca de 10 kg" reduz 0,10 saca; "vender com
pagamento misto" registra uma venda, R$ 120 recebidos e R$ 80 a receber;
"receber pagamento de fiado" reduz a dívida sem nova venda; "transferir
dinheiro entre caixas" não altera o resultado; "cancelar ou devolver uma
venda" ajusta estoque, Financeiro e resultado, preservando o histórico.

Dividida em duas (Q81). **F3a:** a venda em dinheiro, PIX e fiado, o
recebimento de fiado, a gaveta e as contas, o cancelamento, a devolução e a
troca; aceites da venda de 1 kg, do pagamento misto (com fiado no lugar do
cartão), do fiado e do cancelamento e devolução. **F3b:** cartão, cheque,
transferência entre caixas e conferência; aceite da transferência entre
caixas.

#### F3a: contrato (Q81 a Q87)

**Modelo.** `StockMovementType` ganha `abertura_lacrado` (saída do lacrado,
entra no conjunto de saídas da loja), `abertura_avulso` (entrada no avulso) e
`devolucao` (entrada). `StockMovement` ganha `sale_id` e `sale_return_id`.
Enums novos: `EmporioPaymentKind` (`dinheiro`, `pix`, `debito`,
`credito_vista`, `credito_parcelado`, `cheque`, `fiado`, mais o interno
`troca`; a F3a aceita só `dinheiro`, `pix` e `fiado`, e os outros dão 422
`payments` até a F3b), `EmporioSaleStatus` (`concluida`, `cancelada`),
`CashDirection` (`entrada`, `saida`), `CashMovementOrigin` (`venda`,
`recebimento_fiado`, `cancelamento_venda`, `devolucao`, `implantacao`) e
`EmporioRefundKind` (`dinheiro`, `abater_fiado`, `troca`).

⚠️ **Desvio da seção 4.4:** não existe `CashDrawer`. A gaveta **é a loja**: o
`CashMovement` aponta para o `establishment_id` ou para a `bank_account_id`,
exatamente um dos dois (CHECK, como o local do estoque). Uma tabela com uma
linha por loja não guardaria nada que a loja já não guarde; a conferência da
F3b aponta para a loja também.

Novos, todos escopados e com quem gravou:

| model | campos |
|---|---|
| `BankAccount` | `name` (único na conta), `bank?`, `archived_at?` |
| `Establishment` (muda) | ganha `pix_bank_account_id?` |
| `EmporioSale` | `establishment_id`, `operation_key` (único na conta), `contact_id?` (obrigatório com fiado), `sold_at`, `sold_by_user_id`, `net_amount`, `discount_amount` (soma dos descontos dos itens), `discount_authorized_by_user_id?` (quando acima do limite), `status`, `canceled_at?`, `canceled_by_user_id?`, `canceled_reason?`, `exchange_return_id?` (a devolução que esta venda troca), `notes?` |
| `EmporioSaleItem` | `sale_id`, `emporio_product_id`, `presentation_id`, `quantity` (na apresentação, 3 casas), `base_qty` (na unidade-base), `suggested_price?` (por apresentação, do momento), `unit_price` (praticado), `total`, `unit_cost` (unidade-base, do momento), `cost_estimated`, `cost_provisional` (Q32) |
| `EmporioSalePayment` | `sale_id`, `kind`, `amount`, `bank_account_id?` (PIX), `financial_payment_id?` (nulo no fiado), `due_date?` (fiado) |
| `EmporioSaleReturn` | `sale_id`, `operation_key` (único na conta), `refund_kind`, `amount`, `returned_at`, `returned_by_user_id`, `reason?` |
| `EmporioSaleReturnItem` | `return_id`, `sale_item_id`, `quantity` (na apresentação), `base_qty`, `loss_reason?` (avariado: vira perda) |
| `CashMovement` | `establishment_id?` ou `bank_account_id?` (exatamente um), `direction`, `amount` (> 0), `origin`, `occurred_at`, `sale_id?`, `sale_return_id?`, `financial_payment_id?`, `operation_key?` (único na conta, para o recebimento de fiado), `notes?` |

**Saldo de caixa** (invariante 2): entradas menos saídas, por loja ou por
conta. Nada é apagado nem cancelado: o estorno é um movimento de saída.

**Venda (Q82, Q84, Q85).** Numa transação só:
- **Itens:** apresentação ativa do produto, `quantity` > 0; `base_qty` =
  `quantity × base_qty da apresentação`, arredondada a 3 casas. Sem preço
  cadastrado na loja, `unit_price` é obrigatório (422 `items`, Q54). Venda sem
  item dá 422 `items`.
- **Baixa do estoque:**
  - produto que **não separa**: uma `venda` pelo total;
  - apresentação **fechada** de produto que separa: uma `venda` lacrada com o
    `presentation_id`. Sem embalagem lacrada suficiente daquela apresentação,
    409 `INSUFFICIENT_STOCK` em `items`, **sempre** (Q31: a venda impossível
    é recusada mesmo com negativo liberado);
  - **a granel** de produto que separa: baixa do avulso. Se o avulso não
    cobre, abre embalagens lacradas da menor apresentação com saldo, uma a
    uma, até cobrir, passando para a próxima maior quando ela acaba. Cada
    abertura grava um `abertura_lacrado` (1 embalagem, com o
    `presentation_id`) e um `abertura_avulso` (o mesmo `base_qty`), os dois
    com o `sale_id` e o custo médio do momento, de modo que o total e a média
    não mudam. Depois, uma `venda` avulsa;
  - acabou tudo e ainda falta: 409 `INSUFFICIENT_STOCK` em `items`, salvo
    negativo liberado, e aí o avulso fica negativo.
- **Exemplo do aceite:** 3 sacas de 10 kg lacradas e nada avulso; vender 1 kg
  abre 1 saca e deixa 2 lacradas, 9 kg avulsos, total 29 kg (−0,10 saca).
- **Custo:** cada `venda` grava `unit_cost` = custo médio da loja antes da
  baixa (Q64). `cost_estimated` vem do `estimado` do custo médio;
  `cost_provisional` marca a venda que deixou o saldo negativo (Q32). Nada
  disso muda depois.
- **Desconto (Q85):** por item, `max(0, suggested_price − unit_price) ×
  quantity`; `discount_amount` é a soma. A % da venda é `discount_amount ÷ Σ
  (suggested_price × quantity)` dos itens com preço cadastrado. Acima do
  `max_discount_pct` da loja (vazio = 0%), só OWNER e ADMIN, e o ator vai para
  `discount_authorized_by_user_id`; OPERADOR recebe 403
  `DISCOUNT_ABOVE_LIMIT` em `items`. Item acima do cadastrado não compensa
  item abaixo.
- **`net_amount`** = Σ `total` dos itens, com `total = quantity × unit_price`
  arredondado ao centavo.
- **Pagamentos:** a soma dos `amount` é exatamente o `net_amount` (422
  `payments`). Fiado exige `contact_id` de um contato não arquivado (422
  `contact_id`) e aparece no máximo uma vez. PIX vai para `bank_account_id`
  informado ou para a conta PIX da loja; sem nenhuma, 422 `payments` com o
  aviso para cadastrar (Q83). O troco do dinheiro é conta da tela: o servidor
  grava só o valor da venda.
- **Financeiro:** um lançamento de receita por `createLinkedEntry`, categoria
  **"Vendas do Empório"**, `related_module` `emporio`, `related_id` da venda,
  a loja, o cliente, `amount` = `net_amount`, nascido **pendente**, com
  `due_date` = vencimento do fiado (ou `sold_at`), e `payment_method` quando há
  uma forma só. Cada pagamento na hora vira um `FinancialPayment` (`dinheiro`
  e `pix` no `PaymentMethod`) mais um `CashMovement` de entrada, origem
  `venda`: dinheiro na gaveta da loja, PIX na conta. Sem fiado, o lançamento
  fecha `paid` na mesma transação. **Não existe receita fora deste
  lançamento.**
- Mesma `operation_key` devolve a venda gravada (200).

**Recebimento de fiado (Q82).** `contact_id`, `establishment_id` (onde o
dinheiro entra), `amount`, `kind` (`dinheiro` ou `pix`), `entry_id?`. Com o
`entry_id`, paga aquele lançamento; sem ele, distribui pelos lançamentos de
venda em aberto do cliente, **do mais antigo para o mais novo**. Cada parte é
um `FinancialPayment` mais um `CashMovement` de entrada, origem
`recebimento_fiado`. Valor acima do que o cliente deve dá 422 `amount`. Não
cria venda. Mesma `operation_key` devolve o recebimento gravado.

**Cancelamento total (Q86).** OWNER e ADMIN, `reason` obrigatório. Marca a
venda `cancelada` e `canceled_at` nas `venda` dela; **as aberturas ficam**
(a saca foi aberta de verdade), então a mercadoria vendida a granel volta
avulsa, e a lacrada volta lacrada. O lançamento vira `cancelled`. Para cada
`FinancialPayment` dele (na hora ou de fiado), um `CashMovement` de saída,
origem `cancelamento_venda`, no mesmo lugar em que entrou. Venda já cancelada
dá 409 `SALE_CANCELED`; venda com devolução dá 409 `SALE_HAS_RETURNS`.

**Devolução parcial (Q86).** OPERADOR para cima, com a loja no vínculo. Por
item, `quantity` até o vendido menos o já devolvido (422 `items`). O valor é
`quantity × unit_price` do item, ao centavo.
- **Estoque:** um `devolucao` pelo `unit_cost` da venda, lacrado se a venda foi
  lacrada, avulso nos outros casos. Com `loss_reason`, também uma `perda`
  pelo mesmo custo, no mesmo estado: a mercadoria volta e sai como avariada.
- **`refund_kind` `dinheiro`:** um lançamento de **despesa** "Devoluções de
  vendas do Empório", pago, ligado à devolução, mais um `CashMovement` de
  saída da gaveta da loja, origem `devolucao`.
- **`refund_kind` `abater_fiado`:** o valor tem que caber no saldo em aberto
  do lançamento da venda (422 `amount`); o `amount` do lançamento diminui
  nesse valor, e não há movimento de caixa. O histórico fica na devolução.
- **Teto do dinheiro e da troca:** o valor devolvido por `dinheiro` ou `troca`
  não passa do que o cliente pagou na venda, menos o que já voltou por
  dinheiro ou troca (422 `amount`, mandando abater do fiado). Sem isso, o
  fiado não pago devolvido "em dinheiro" tirava da gaveta o que nunca entrou
  (achado na revisão da implementação, 28/10).
- Mesma `operation_key` devolve a devolução gravada.

**Troca (Q86).** Na troca, `venda.payments` cobre só o que falta depois do
valor devolvido (vazio quando ele cobre tudo); o servidor acrescenta o
pagamento `troca`. A venda nova de uma troca **não se cancela** (409
`SALE_IS_EXCHANGE`): ela foi paga com o valor devolvido, que não tem gaveta
para onde voltar, então desfazê-la é devolver os itens dela. Uma devolução com `refund_kind` `troca` e uma venda nova com
`exchange_return_id`, numa transação. O valor devolvido (V) vira o lançamento
de despesa "Devoluções de vendas do Empório", pago, **sem** movimento de
caixa, e entra na venda nova como pagamento `troca` (um `FinancialPayment`
`outro`, também sem movimento de caixa). O resto da venda nova se paga
normalmente. Se V passa da venda nova, a diferença sai em dinheiro da gaveta
(`CashMovement` de saída, origem `devolucao`). Assim o resultado soma as duas
vendas menos V, e o caixa só vê o dinheiro que mudou de mão.

**Caixa.** Saldo da gaveta de cada loja e de cada conta, e os movimentos.
**Saldo inicial** uma vez por loja e por conta (origem `implantacao`, entrada),
como o estoque inicial (Q69).

**Papéis:** vender, receber fiado e devolver são de OPERADOR para cima, com a
loja no vínculo. Cancelar, desconto acima do limite, contas bancárias e conta
PIX da loja: OWNER e ADMIN. A gaveta é vista por quem tem acesso à loja; as
contas, por OWNER e ADMIN. VISUALIZADOR só lê.

**Actions:**
- `src/lib/actions/emporio-vendas.ts`:
  - `venderAction(db, ator, { operation_key, establishment_id, contact_id?, sold_at?, items: [{ emporio_product_id, presentation_id, quantity, unit_price? }], payments: [{ kind, amount, bank_account_id?, due_date? }], notes? })`;
  - `listarVendasAction(db, ator, opts?)` e `lerVendaAction(db, ator, id)`;
  - `cancelarVendaAction(db, ator, id, { reason })`;
  - `devolverAction(db, ator, sale_id, { operation_key, refund_kind, items: [{ sale_item_id, quantity, loss_reason? }], reason? })`;
  - `trocarAction(db, ator, sale_id, { operation_key, items_devolvidos, venda })`, com a venda no formato do `venderAction`.
- `src/lib/actions/emporio-caixa.ts`:
  - `listarFiadoAction(db, ator, opts?)`, por cliente: devido, mais antigo, vencido;
  - `receberFiadoAction(db, ator, { operation_key, contact_id, establishment_id, amount, kind, entry_id? })`;
  - `listarContasAction`, `criarContaAction`, `editarContaAction` (arquivar incluso);
  - `definirContaPixAction(db, ator, establishment_id, { bank_account_id })`;
  - `lerCaixaAction(db, ator, opts?)`, saldos e movimentos;
  - `saldoInicialCaixaAction(db, ator, { establishment_id? , bank_account_id?, amount })`.

**Rotas** (`/api/v1/emporio/...`):
- `sales` (GET e POST) e `sales/[id]` (GET);
- `sales/[id]/cancel`, `sales/[id]/return` e `sales/[id]/exchange` (POST);
- `receivables` (GET) e `receivables/receive` (POST);
- `bank-accounts` (GET e POST) e `bank-accounts/[id]` (PATCH);
- `establishments/[id]/pix-account` (PUT);
- `cash` (GET) e `cash/opening` (POST).

**Telas (Q87):** `/emporio/vender`, `/emporio/vendas` (e o detalhe),
`/emporio/fiado`, `/emporio/caixa`; o início ganha Vender, Vendas, Fiado e
Caixa. No balcão: loja (lembrada), busca do produto, apresentação, quantidade,
preço sugerido editável, total, pagamento misto com troco, e cliente com
cadastro rápido no fiado. Tem que funcionar no celular (seção 7).

Observado e deixado como está: o fiado com vencimento entra no aviso de conta
a receber que o Financeiro já manda (até 3 dias antes), como qualquer
recebível.

### F4: resultado

- Despesa fixa (modelo, geração por período, rateio).
- Regras do "Vendeu, Pagou", reconhecidas na venda e pagas depois.
- Resultado da Loja: vendas, custo, "Vendeu, Pagou", margem, fixas,
  resultado, ponto de equilíbrio, quanto falta, acompanhamento do mês.
- Visão somada; produtos que mais vendem e que mais dão margem; vendas com
  margem negativa.
- Filtro "Fazenda / Empório / Tudo" no Financeiro.

**Aceite (§25):** "registrar taxa de cartão" aplica a regra só à parte no
cartão; "cadastrar despesas fixas" entra no acompanhamento do mês; "calcular
ponto de equilíbrio" usa as fixas e a margem, sem dupla contagem (o exemplo do
§17.3: R$ 5.500 ÷ 30% = R$ 18.333); "consultar resultado global" não duplica
transferências nem despesas divididas.

### F5: integrações e implantação

- Meu Dia: fornecedor a pagar, fiado vencido, estoque baixo, transferência
  parada, caixa não conferido (§21.3), respeitando perfil e vínculo.
- Lista de Compra: incluir não gera compra (§21.4).
- Calculadora de Receitas: "criar composição desta receita" (Q44).
- Lista de primeiros passos (Q45), mostrando o que falta para o resultado ser
  confiável.

**Aceite (§25):** "usar TIBÉ sem Meu Empório" não mostra nada do Empório (já
provado na F0, repetido aqui com o módulo inteiro no ar).

---

## 7. Validação viva

Teste verde não é validação (invariante 8). Em cada fase, no navegador, na Da
Mata:

1. o fluxo da fase, do jeito que o comerciante faria;
2. a mesma tela por um usuário da Da Mata **fora** da lista: não pode ver nada;
3. as telas da fazenda que leem estoque e Financeiro: não podem ter mudado;
4. no celular, ao menos a venda (F3) e a contagem (F2a), que são as operações
   de balcão.

## 8. Perguntas que ficam para o desenho técnico de cada fase

O documento lista no §27 oito pontos a detalhar na implementação. Os itens 1
(embalagem), 2 (custo médio), 3 (variáveis previstas e realizadas), 4 (rateio),
5 (cartão e cheque), 6 (transferência) e 8 (limites de autorização) estão
decididos na seção 3. O item 7 (exigências fiscais e sanitárias) está fora da
primeira versão (Q9). Fica aberto, para decidir na fase em que aparecer:

- **F0:** a precisão de `quantity` (seção 4.3).
- **F3:** o desenho exato entre `FinancialEntry`, `FinancialPayment` e
  `CashMovement`, sem receita duplicada (seção 4.4). Decidido na Q82; o
  detalhe está no contrato da F3a.
- **F4:** a periodicidade suportada pela despesa fixa (mensal só, ou também
  semanal e anual) e até quantos períodos à frente ela gera.

## 9. Fora da primeira versão, e as dívidas

O §24 do documento, mais:

| item | dívida |
|---|---|
| Cruzar estoque entre fazenda e loja, e Empório com Negociações (Q2, Q42) | 2.15 |
| Empório no WhatsApp (Q10) | 2.16 |
| Base Rural de sinônimos (Q11) | 2.17 |
| Importação de produtos e estoque por planilha (Q45) | 2.18 |
| Contas bancárias no Financeiro da fazenda (Q47) | 2.19 |
| Cadastro público e cobrança da conta só de Empório (Q7, Q16) | 2.20 |
| Nota fiscal, receituário agronômico, lote e validade obrigatórios (Q9) | 2.21 |
| Produto do Empório visível ao agente do WhatsApp (Q51) | 2.22 |
| Custo extra na produção da loja (Q78) | 2.23 |
| Crédito na loja na devolução (Q86) | 2.24 |

O detalhe de cada uma está em [../agents/dividas.md](../agents/dividas.md).
