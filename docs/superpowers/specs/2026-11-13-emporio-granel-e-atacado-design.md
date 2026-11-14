# Empório: granel em qualquer peso e atacado na mesma saca (Q319 a Q324)

Pedido do usuário em 13/11/2026, a partir de uma mensagem da Agromax e de uma
leitura da Central do Milho: "compramos saca e vendemos kg"; "quando os kg da
saca é ímpar o sistema não permite"; a Central quer frações de 200, 300 e 800
gramas, "com valores diferentes, afinal a saca aberta o kilo tem valor
diferente da saca fechada".

## Por que trava

O produto cadastrado com a **saca** como unidade-base (Q123) conta o estoque em
sacas, com 3 casas. Uma fração precisa caber em 3 casas de saca:
`baseQtyPeloConteudo` (`src/lib/actions/emporio-catalogo.ts`) recusa "1 kg não
divide a saca de 15 kg em partes exatas". Na de 10 kg, 1 kg é 0,1 saca e passa;
na de 15, 30 e 45 kg não. 300 g de uma saca de 40 kg (0,0075) também não.

Em produção, 13/11 (leitura):
- Agromax (conta Da Mata): 55 produtos ativos em saca (10, 20, 25 e 30 kg), 31
  com movimento, 49 em composição; nenhuma fração cadastrada, nenhuma venda
  fracionada. Ela só vende saca fechada.
- Central do Milho (teste, 3 lojas, 69 produtos, nenhuma venda, só
  implantação): quase tudo em saca (5 a 50 kg, inclusive 15 e 45), com
  "GRANEL" como fração da saca e preço próprio (farelo 40 kg: saca R$ 124,80,
  ATACADO R$ 118,00, kg a granel R$ 3,40). Na "Magnus Todo Dia 15 kg" o GRANEL
  foi digitado como 0,068 saca para contornar a recusa: cada "kg" tiraria 1,02
  kg do estoque.

## Segundo problema: duas embalagens fechadas iguais dividem o estoque

O estoque fechado é contado **por apresentação** (`chaveDoEstado`, chave
`lacrado|<presentation_id>`). A Central tem "Saca 40 kg" e "ATACADO", as duas
fechadas de 1 saca, com preços diferentes. Implantado em uma, vender na outra é
recusado ("não há fechado suficiente em ATACADO") com a saca na prateleira.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q319 | **Produto que fraciona é estocado na unidade do conteúdo** (quilo, litro). A saca vira apresentação fechada ("Saca 40 kg" = 40 kg) e as frações são apresentações avulsas ("Quilo" = 1, "300 g" = 0,3), cada uma com o seu preço por loja (já existe). A abertura automática da saca (Q84) passa a valer em qualquer peso. Produto que só vende saca fechada pode seguir em saca | decisão do usuário: cobre a Central (gramas, preço por fração) sem mudar a Agromax |
| Q320 | **"Converter para quilo"** (ou litro, conforme o `content_unit`) no produto em saca ou fardo, **produto por produto, com prévia**. Multiplica pelo conteúdo da saca tudo o que está na unidade-base e divide o que é custo por unidade-base, numa transação só: o histórico continua inteiro e o saldo, que é calculado (invariante 2), sai certo. Revoga o "fixo depois de criado" da Q123 só por esse caminho | decisão do usuário: produto por produto, com prévia |
| Q321 | **A prévia** mostra, por loja, o saldo antes e depois ("12 sacas → 480 kg"), o custo ("R$ 90,00 a saca → R$ 2,25 o kg"), e cada apresentação antes e depois ("GRANEL: 0,025 saca → 1 kg"). Marca "confira" na apresentação avulsa cujo novo valor não é múltiplo de 50 g (ou 50 ml; inteiro em unidade), como os 1,02 kg da Magnus. Confirmar exige ter visto a prévia (a confirmação manda o mesmo conteúdo da saca que a prévia leu; se mudou no meio, recusa) | evita converter às cegas e expõe o erro já gravado |
| Q322 | **A recusa da fração que não fecha** passa a apontar a conversão: "Esse produto conta o estoque em sacas, e 1 kg não divide a saca de 15 kg em partes exatas. Para vender a granel, converta o produto para quilo." | o caminho certo na hora do erro |
| Q323 | **Embalagens fechadas do mesmo tamanho são a mesma embalagem física:** o saldo fechado é somado por **tamanho** (`base_qty`) dentro do produto, não por apresentação. O nome só muda o preço. Vale em compra, implantação, contagem, perda, transferência, produção, venda e abertura automática. Nenhum dado muda: é a leitura do saldo | decisão do usuário (caminho 1): resolve ATACADO e SACA sem recadastro |
| Q324 | **Na tela, um tamanho, uma linha:** o estoque mostra "10 sacas de 40 kg (Saca 40 kg / ATACADO)"; contagem, implantação e perda pedem uma quantidade por tamanho. Mandar duas apresentações do mesmo tamanho na mesma operação é recusado ("a mesma embalagem aparece duas vezes") | consequência da Q323 |

## Conversão: o que muda (Q320)

Fator `f` = `content_qty` do produto. Tudo do produto, em todas as lojas:

- `EmporioProduct`: `base_unit` = `content_unit`; `content_qty` e
  `content_unit` = nulos; `reference_cost` ÷ f.
- `ProductPresentation.base_qty` × f (as arquivadas também).
- `StockMovement`: `quantity`, `previous_balance`, `corrected_balance` × f;
  `unit_cost` ÷ f.
- E cada coluna que o schema documenta como "na unidade-base" ou "por
  unidade-base" ligada a esse produto: itens de compra, venda, orçamento e
  transferência, limites de estoque, composição (como produto e como
  componente), produção, regra de despesa variável por embalagem, e o que mais o
  builder achar no schema. **O builder lista no plano cada coluna convertida, e a
  suíte confere cada uma.**
- Histórico (`registrarNoHistorico`) com o fator e o antes e depois.
- Recusa: produto que não está em saca nem fardo, ou sem `content_qty`
  (`VALIDATION_ERROR`); quem não pode cadastrar produto (o mesmo papel de
  `chave:cadastrar_produto`).
- Valores conferidos depois da conversão, por loja: o saldo novo é o antigo × f
  (com a tolerância do arredondamento de 3 casas), e o custo médio novo é o
  antigo ÷ f.

## API (extensão aditiva)

- `GET /api/v1/emporio/products/[id]/convert-unit`: a prévia (Q321).
- `POST /api/v1/emporio/products/[id]/convert-unit` `{ content_qty }`: converte;
  `content_qty` é o fator que a prévia mostrou (Q321). Documentado em `/docs/api`.
- `SealedLine` do estoque passa a ser por tamanho: `presentation_id` da
  apresentação fechada ativa mais antiga daquele tamanho, `name` com os nomes
  juntos ("Saca 40 kg / ATACADO"), e `presentation_ids` com todas.

## Telas

- Produto em saca ou fardo: botão "Converter para quilo" (ou litro), que abre a
  prévia e confirma.
- Cadastro de produto novo em saca: dica curta "Vai vender fracionado (kg ou
  gramas)? Cadastre em quilo e crie a saca como embalagem fechada."
- Estoque, contagem, implantação e perda: uma linha por tamanho (Q324).

## Fora

Tabela de preço por cliente; desfazer a conversão; converter vários produtos de
uma vez; mudar a Agromax (ela decide se converte algum).

## O que fica com o builder

O lugar do botão na tela do produto; o texto exato da prévia; a ordem das
colunas; o nome do arquivo da action de conversão.
