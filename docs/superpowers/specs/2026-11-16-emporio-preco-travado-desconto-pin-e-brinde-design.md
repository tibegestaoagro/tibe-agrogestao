# Empório: preço do cadastro, desconto liberado por PIN do gestor e brinde (Q327 a Q334)

Pedido do usuário em 16/11/2026, a partir do relato da Agromax ("cadastrei uma
apresentação da tranca com valor zerado, pq ela é brinde em alguns casos, porém
não está deixando passar"): "não concordo com vendedor poder digitar o preço
assim, os preços precisam vir predefinidos do cadastro e ter uma opção de
desconto que libera somente com a senha de um gestor".

Substitui o primeiro plano do brinde (com preço digitado), que não foi
executado.

## Como está hoje (16/11/2026)

- No balcão, o vendedor digita o preço de cada linha. O que fica abaixo do
  preço cadastrado na loja vira desconto (Q85); acima, passa sem nada.
- Apresentação sem preço na loja: o vendedor digita o preço (sem ele, 422).
- Limite de desconto por loja (`Establishment.max_discount_pct`): acima dele a
  venda só passa se quem está logado é gestor da loja (fica como quem
  autorizou). Não existe jeito de um gestor liberar na tela do vendedor.
- O cadastro de preço aceita R$ 0,00, mas a venda recusa preço zero na tela e
  no servidor (`precificarItens`, `src/lib/emporio/precificar.ts`). Por isso a
  tranca "BONUS" não passa.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q327 | **O preço vem do cadastro e não se digita.** O preço de cada linha é o da apresentação na loja (no orçamento faturado dentro da validade, o preço que vale do orçamento, regra de hoje). A tela mostra o preço sem campo editável. A API deixa de aceitar preço acima do cadastrado (422 `items`, "O preço vem do cadastro") | decisão do usuário |
| Q328 | **Sem preço cadastrado na loja, não vende:** 422 `items`, "Cadastre o preço de {produto} ({apresentação}) nesta loja antes de vender." Vale para venda, orçamento e troca | decisão do usuário |
| Q329 | **Desconto em dois lugares: na linha (em %) e no total da venda (em R$).** O desconto do total é rateado nas linhas pelo valor (como o crédito do franqueado, Q308), para o total de cada item continuar somando o faturamento e o relatório por produto continuar certo. A venda guarda o desconto do total à parte, para a tela e o impresso mostrarem "Desconto no total" | decisão do usuário (item e total); a unidade de cada um (% na linha, R$ no total) é escolha do agente, para confirmar |
| Q330 | **O limite da loja continua:** o desconto somado (linhas mais total, sobre o preço cadastrado, como na Q85) até o `max_discount_pct` da loja passa sem autorização; acima, só com a autorização de um gestor. Loja que quer autorização para todo desconto configura 0% | decisão do usuário |
| Q331 | **A autorização é um PIN de autorização do gestor** (4 a 6 números), separado da senha de login. Quem pode autorizar é quem é gestor da loja da venda pelo papel do Empório (`gestor_da_loja` naquela loja: o Gestor dela, o Gerente geral e o Dono) e tem PIN cadastrado. Se quem está logado já é gestor da loja, não precisa de PIN (como hoje) | decisão do usuário |
| Q332 | **Cada gestor cadastra o próprio PIN** em Configurações > Minha senha, confirmando com a senha de login. O PIN é guardado com hash (bcrypt), nunca em texto. O Dono pode apagar o PIN de alguém da equipe (o gestor cadastra outro) | escolha do agente, para confirmar |
| Q333 | **Como a tela pede a autorização:** quando o desconto passa do limite, o balcão mostra "Pedir autorização do gestor": escolhe o gestor (lista dos que podem autorizar na loja) e ele digita o PIN. O servidor confere e devolve uma autorização assinada, curta (15 minutos), que vale para aquela loja e até aquele % de desconto. A venda (ou o orçamento) manda essa autorização; o servidor confere de novo a assinatura, a loja, a validade e o %. Aumentar o desconto acima do autorizado pede de novo. Cinco PINs errados do mesmo gestor em 15 minutos travam as tentativas dele por 15 minutos. Quem autorizou fica na venda (`discount_authorized_by_user_id`, que já existe) e no Histórico | o PIN não fica guardado na tela, e a autorização não serve para outra loja nem para um desconto maior |
| Q334 | **Brinde:** a apresentação com preço cadastrado R$ 0,00 (a "BONUS" da tranca) passa direto, sem desconto. Dar de graça um item com preço cheio é desconto de 100% naquela linha, sujeito ao limite e ao PIN. **Brinde acompanha venda:** venda e orçamento precisam de valor a pagar nos itens (`net_amount` maior que zero), senão 422 `items`, "Um brinde acompanha uma venda: inclua ao menos um produto pago." O estoque baixa normal e o custo do brinde entra no custo da venda (a margem cai pelo custo dele). O "Vendeu, Pagou" por unidade e por apresentação não conta as unidades com preço zero. No papel do cliente, a linha de preço zero mostra "Brinde" no lugar de R$ 0,00 | quantidade e "acompanha venda": decisão do usuário; o resto, escolha do agente, para confirmar |

## Escolhas do agente depois da revisão de builder (16/11, para o usuário vetar)

1. Orçamento faturado dentro da validade: a venda herda o `order_discount_amount`
   quando o corpo não o manda (como o frete, Q326); vencido, não herda; o valor
   em R$ fica fixo, limitado ao total dos itens; a autorização herdada vale se o
   desconto não passar do orçado.
2. Editar venda: a linha com o mesmo `presentation_id` e o mesmo `unit_price`
   da original é a mesma linha (quantidade livre); fica como quem autorizou o
   da venda original se o desconto não cresceu.
3. A troca aceita `discount_authorization` (sem desconto no total).
4. A autorização vale para várias vendas nos 15 minutos, presa a quem pediu, à
   loja e ao % máximo.
5. Apagar o PIN de alguém: o Dono e o Gerente geral (quem cuida da Equipe).
6. "Vendeu, Pagou": linha de `total` zero (brinde de cadastro ou 100% de
   desconto) não entra nas regras por unidade, de embalagem nem nas com
   condição de produto ou apresentação.
7. Consequências que o builder corrige: devolução proporcional ao `total` do
   item (com desconto no total, `quantidade x unit_price` reembolsaria a
   mais); impresso sem desconto em dobro (`desconto_no_total` à parte); preço
   nulo é "sem preço", nunca R$ 0 (`emporio-vendas.ts`, preço que vale do
   orçamento); a causa "preço abaixo do custo" do Resultado ignora linha de
   total zero; a assinatura usa chave derivada do `NEXTAUTH_SECRET` (sem
   variável nova na Vercel); a frase do `DISCOUNT_ABOVE_LIMIT` não muda.

## O que não muda

- O orçamento faturado dentro da validade mantém o preço e o desconto orçados,
  com a autorização herdada (regra de hoje, Q85 e entrega 4).
- Editar venda (Q249): a linha que vem com o mesmo preço da venda original é
  aceita com o desconto e a autorização da venda original; linha nova ou
  mudada segue as regras desta spec.
- O preço por loja, o custo, o Resultado e os relatórios.

## Dados

- `User.emporio_auth_pin_hash String?` (hash do PIN).
- `EmporioSale.order_discount_amount` e `EmporioQuote.order_discount_amount`
  (`Decimal(14,2)`, padrão 0): o desconto dado no total, já incluído em
  `discount_amount` e rateado nas linhas.
- Migração aditiva. Nada existente muda de valor.

## API (o essencial; o builder documenta em `/docs/api`)

- Itens da venda, do orçamento e da troca: `discount_pct` opcional por item
  (0 a 100). `unit_price` continua aceito só para baixo do cadastrado (é a
  forma antiga de dizer desconto na linha) e nunca acima.
- Venda e orçamento: `order_discount_amount` opcional (R$) e
  `discount_authorization` opcional (a autorização assinada).
- `POST /api/v1/emporio/discount-authorizations` `{ establishment_id,
  authorizer_user_id, pin, discount_pct }`: confere e devolve a autorização
  assinada. Erros: PIN errado (`INVALID_PIN`, campo `pin`), travado
  (`PIN_LOCKED`), quem não pode autorizar (`authorizer_user_id`).
- `GET /api/v1/emporio/establishments/[id]/authorizers`: quem pode autorizar
  na loja (id e nome), para quem vende nela.
- `PUT /api/v1/me/emporio-pin` `{ pin, password }` (cadastrar ou trocar o
  próprio PIN) e a forma de o Dono apagar o PIN de alguém (pela Equipe).

## Fora

Preço por cliente ou tabela de preço; desconto por forma de pagamento;
autorização à distância (o gestor aprovando pelo celular dele).

## O que fica com o builder

O lugar exato dos campos no balcão; o texto das mensagens além dos fixados
aqui; o nome dos arquivos novos; a forma da assinatura da autorização (HMAC
com o segredo do servidor, por exemplo).
