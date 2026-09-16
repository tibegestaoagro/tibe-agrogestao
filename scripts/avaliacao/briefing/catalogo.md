# Catálogo de intenções do agente

## rebanho

animais da fazenda: quantos tem, nasceu, morreu, mudou de pasto ou de categoria, comprou ou vendeu gado, cadastro por brinco, peso, vacina

### consultar_rebanho

o produtor pergunta quantos animais tem, no total ou de uma categoria

- categoria (texto): a categoria como o produtor falou (bezerro, bezerra, vaca, boi, novilha, garrote, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse; vazio quando pergunta o total
- fazenda (texto): o nome da fazenda, se ele citou uma; vazio conta todas

### consultar_animal

o produtor pergunta os dados de um animal pelo número do brinco

- ear_tag (texto): o número ou código do brinco, como o produtor falou

### registrar_movimentacao_rebanho

o produtor conta que tem, que nasceu, que morreu ou que passou animais de pasto, de fazenda ou de categoria, sem compra nem venda

- movement_type (texto): sai do VERBO: "tenho" = saldo_inicial; "nasceu" = nascimento; "morreu" = morte; "passe" para outro pasto = transferencia_pasto, para outra fazenda = transferencia_fazenda, para outra idade ou categoria = mudanca_categoria; "ajuste" ou correção de contagem = ajuste
- itens (lista): um item por categoria dita ("4 machos e 3 fêmeas" são dois itens)
  - categoria (texto): a categoria como o produtor falou (bezerro, bezerra, vaca, boi, novilha, garrote, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse
  - quantidade (numero): só o número de cabeças, em algarismo, como o produtor falou (20, 4; duas vira 2)
- sentido (texto): só no ajuste: entrada quando aumenta o rebanho, saida quando diminui; vazio se ele não disse
- fazenda (texto): o nome da fazenda, se ele citou uma
- pasto_origem (texto): o pasto onde os animais estão ou estavam ("no Pasto da Baixada", "do Pasto da Sede")
- pasto_destino (texto): na transferência de pasto: o pasto para onde vão ("para o Pasto da Baixada")
- categoria_destino (texto): na mudança de categoria: a categoria ou faixa nova, como ele falou ("de 8 a 12 meses")
- fazenda_destino (texto): na transferência de fazenda: a fazenda para onde vão
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse

### registrar_negocio_gado

o produtor conta que comprou ou vendeu animais, com ou sem o valor

- tipo (texto): compra quando ele comprou, venda quando vendeu
- itens (lista): um item por categoria negociada
  - categoria (texto): a categoria como o produtor falou (bezerro, bezerra, vaca, boi, novilha, garrote, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse
  - quantidade (numero): só o número de cabeças, em algarismo, como o produtor falou (20, 4; duas vira 2)
- valor (numero): o valor total do negócio, só o número, como o produtor falou (60 mil, 48.000)
- fazenda (texto): o nome da fazenda, se ele citou uma
- pasto (texto): o pasto de onde saem (venda) ou para onde vão (compra), se ele citou
- contato (texto): quem vendeu ou comprou ("do João", "para o frigorífico")
- data (data): o dia do negócio, como o produtor falou (hoje, ontem); vazio se não disse
- vencimento (data): quando vai pagar ou receber, como ele falou ("para pagar dia 10"); vazio se não disse
- parcelas (numero): em quantas vezes, só o número (3 para "em 3x"); vazio se não parcelou
- pago (sim_nao): sim quando ele diz que já pagou ou já recebeu ("à vista", "paguei"); vazio se não disse
- custos (lista): custos extras do negócio que ele citou (frete, comissão, taxa de leilão, guia, exames, vacinas, pedágio)
  - descricao (texto): o nome do custo (Frete, Comissão)
  - valor (numero): só o número, como o produtor falou (2 mil, 350)

### cadastrar_animal

o produtor quer cadastrar um animal individual, com brinco, raça e sexo

- ear_tag (texto): o número ou código do brinco
- breed (texto): a raça (Nelore, Angus, Girolando)
- sex (texto): male para macho, female para fêmea; vazio se não disse
- category (texto): a categoria como o produtor falou (bezerro, bezerra, vaca, boi, novilha, garrote, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse
- property_name (texto): o nome da fazenda, se ele citou uma

### registrar_peso

o produtor informa o peso de um animal pelo brinco

- ear_tag (texto): o número ou código do brinco
- weight (numero): só o número em kg, como o produtor falou, sem a unidade (480; 480,5)

### registrar_vacina

o produtor conta que JÁ vacinou um animal, pelo brinco; o custo que ele disser é campo desta intenção, não um gasto à parte

- ear_tag (texto): o número ou código do brinco
- vaccine_name (texto): o nome da vacina (aftosa, brucelose, raiva)
- cost (numero): o custo, só o número, como o produtor falou (35; 35,50); vazio se não disse

### registrar_previsao_vacina

o produtor informa quanto uma vacina AINDA não aplicada vai custar num animal ("vai custar", "vai ficar uns", "deve ficar em"), com ou sem o dia marcado

- ear_tag (texto): o número ou código do brinco
- vaccine_name (texto): o nome da vacina
- cost (numero): o valor previsto, só o número, como o produtor falou (80; 80,50)
- due_date (data): a data prevista como o produtor falou (dia 20, 20/10), só quando ele disse a data; vazio usa o próximo vencimento calculado

## confinamento

animais no confinamento ou no boitel: entrada (inclusive contada pelo lugar de onde eles saíram: pasto, fazenda, lote do leite), envio ao boitel, saída, venda ou morte no confinamento, e todo trato (ração, sal, silagem) de lote que cite confinamento, boitel ou lote

### registrar_entrada_confinamento

o produtor conta que colocou animais no confinamento próprio

- categoria (texto): a categoria como o produtor falou (garrote, boi, novilha, machos de 13 a 24 meses); não complete sexo nem idade que ele não disse
- quantidade (numero): só o número de cabeças, como o produtor falou (30)
- fazenda (texto): o nome da fazenda de onde saem, se ele citou
- confinamento (texto): o nome do confinamento, se ele citou um
- pasto (texto): o pasto de onde os animais saíram, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse

### registrar_envio_boitel

o produtor conta que mandou animais para um boitel (confinamento de terceiro)

- categoria (texto): a categoria como o produtor falou (garrote, boi, novilha, machos de 13 a 24 meses); não complete sexo nem idade que ele não disse
- quantidade (numero): só o número de cabeças, como o produtor falou (40)
- fazenda (texto): o nome da fazenda de onde saem, se ele citou
- confinamento (texto): o nome do boitel ("Boitel Boa Engorda")
- pasto (texto): o pasto de onde os animais saíram, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse

### registrar_alimentacao_confinamento

o produtor conta que deu ração, sal, silagem ou outro trato ao lote do confinamento ou do boitel; é esta também quando ele só diz para quem o trato foi ("pra eles", "pro lote"), logo depois de falar dos animais

- produto (texto): o insumo, do jeito que o produtor falou (ração, sal mineral, silagem)
- quantidade (numero): só o número, como o produtor falou (5, 1.200); a unidade fica fora
- confinamento (texto): o nome do confinamento ou boitel, se ele citou um

### encerrar_confinamento

o produtor conta que tirou animais do confinamento ou do boitel: voltaram ao pasto, foram vendidos ou morreram

- confinamento (texto): o nome do confinamento ou boitel, se ele citou um
- quantidade (numero): só o número de cabeças que saíram, como o produtor falou (10)
- tipo (texto): venda quando vendeu, morte quando morreram; vazio quando voltaram ao pasto
- valor (numero): na venda: o valor total, só o número, como o produtor falou (100 mil)
- destino (texto): no retorno: o pasto para onde foram ("para o Pasto da Sede")

## eventos_e_permuta

gado mandado para leilão, feira ou evento e o resultado dele; troca de animais por outra coisa (permuta)

### registrar_remessa_evento

o produtor conta que mandou animais para um leilão, feira ou evento, antes de saber o resultado

- evento (texto): o nome do leilão, feira ou evento ("Leilão da Expoagro")
- categoria (texto): a categoria como o produtor falou (boi, novilha, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse
- quantidade (numero): só o número de cabeças, como o produtor falou, sem a palavra cabeças (20)
- fazenda (texto): o nome da fazenda de onde saem, se ele citou
- tipo_evento (texto): leilão, feira ou exposição, se ele disse
- municipio (texto): a cidade do evento, se ele disse
- organizador (texto): a leiloeira ou quem organiza, se ele disse
- observacao (texto): outro detalhe que ele pediu para anotar

### encerrar_remessa_evento

o produtor conta o resultado do leilão ou evento: quantos animais venderam, por quanto, e quantos voltaram

- evento (texto): o nome do leilão ou evento, se ele citou
- vendidos (numero): só o número de cabeças vendidas, como o produtor falou (12; 0 se nenhuma vendeu)
- retornados (numero): só o número de cabeças que voltaram, como o produtor falou; vazio se não disse
- valor (numero): o valor total das vendas, só o número, como o produtor falou (60 mil)

### registrar_permuta

o produtor conta que trocou alguma coisa com alguém (animais por outro bem), com ou sem diferença em dinheiro

- entregue (texto): o que ele deu, como falou; animais com a quantidade em algarismo na frente ("20 bois"), outra coisa como ele disse
- recebido (texto): o que ele recebeu, como falou; animais com a quantidade em algarismo na frente ("15 novilhas"), outra coisa como ele disse ("um trator")
- fazenda (texto): o nome da fazenda, se ele citou
- diferenca_paga (numero): quando ele pagou a diferença: só o número, como o produtor falou (30 mil)
- diferenca_recebida (numero): quando ele recebeu a diferença: só o número, como o produtor falou (5 mil)
- pasto (texto): o pasto de onde saem os animais entregues, se ele citou
- contato (texto): com quem ele trocou, se disse
- observacao (texto): outro detalhe que ele pediu para anotar

## estoque

insumos e produtos (sal, ração, vermífugo, adubo, diesel): compra ou venda COM quantidade (sem quantidade, o item comprado é da lista de compra), uso na fazenda fora de confinamento e de serviço, contagem, quanto tem

### registrar_negocio_produto

o produtor conta que comprou ou vendeu um insumo do estoque, com ou sem o valor

- tipo (texto): compra quando ele comprou, venda quando vendeu
- produto (texto): o insumo, do jeito que o produtor falou (sal, sal mineral 60 P, ração, vermífugo, diesel)
- quantidade (numero): só o número, como o produtor falou (10, 2.000); a unidade fica fora
- valor (numero): o valor TOTAL, só o número, como o produtor falou (1.800, 60 mil); nunca o preço por unidade
- fazenda (texto): o nome da fazenda, se ele citou
- contato (texto): de quem comprou ou para quem vendeu ("do Zé")
- data (data): o dia do negócio, como o produtor falou (hoje, ontem); vazio se não disse
- vencimento (data): quando vai pagar ou receber, como ele falou ("para pagar dia 10"); vazio se não disse
- parcelas (numero): em quantas vezes, só o número (3 para "em 3 vezes"); vazio se não parcelou
- pago (sim_nao): sim quando ele diz que já pagou ("à vista", "paguei"); vazio se não disse
- custos (lista): custos extras que ele citou (frete, carregamento, taxa)
  - descricao (texto): o nome do custo (Frete)
  - valor (numero): só o número, como o produtor falou (200)

### registrar_uso_estoque

o produtor conta que usou, gastou ou abasteceu com uma quantidade de um insumo do estoque na fazenda

- produto (texto): o insumo, do jeito que o produtor falou (sal, sal mineral 60 P, ração, vermífugo, diesel)
- quantidade (numero): só o número, como o produtor falou (2, 2,5; uma vira 1); a unidade fica fora
- fazenda (texto): o nome da fazenda, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem); vazio se não disse
- finalidade (texto): para que usou, se ele disse ("pro lote do curral")

### ajustar_estoque

o produtor contou o estoque e diz quanto existe de verdade de um insumo

- produto (texto): o insumo, do jeito que o produtor falou (sal, sal mineral 60 P, ração, vermífugo, diesel)
- saldo (numero): o TOTAL que existe agora, só o número, como o produtor falou (8, 1.500); nunca a diferença ("faltaram 2")
- fazenda (texto): o nome da fazenda, se ele citou
- motivo (texto): o motivo da correção, se ele disse

### consultar_estoque

o produtor pergunta quanto tem de um insumo, ou o que está acabando

- produto (texto): o insumo, do jeito que o produtor falou (sal, sal mineral 60 P, ração, vermífugo, diesel); vazio quando pergunta o que está acabando

## lista_de_compra

lista do que precisa comprar: anotar, ver, tirar, e contar que comprou um item que estava anotado (o item vem com artigo e sem quantidade: "comprei o arame", mesmo quando ele diz quanto pagou)

### adicionar_item_lista

o produtor pede para anotar na Lista de Compra algo que precisa comprar

- descricao (texto): com UM item só: o que comprar, sem a quantidade (sal, arame)
- quantidade (numero): com UM item só: só o número, como o produtor falou (10, 2.000); vazio se não disse
- unidade (texto): com UM item só: a unidade, só se ele disse, e só uma destas palavras: saca, quilograma, litro, unidade, frasco, caixa, pacote, rolo, tonelada, metro, outro
- urgente (sim_nao): com UM item só: sim quando ele diz que é urgente; vazio se não disse
- itens (lista): só quando ele cita DOIS ou mais itens, um por coisa; com um item só, deixe vazio e use os campos acima
  - descricao (texto): o que comprar, sem a quantidade
  - quantidade (numero): só o número, como o produtor falou (2; uma vira 1)
  - unidade (texto): a unidade, só se ele disse, e só uma destas palavras: saca, quilograma, litro, unidade, frasco, caixa, pacote, rolo, tonelada, metro, outro

### consultar_lista_compra

o produtor pergunta o que está anotado para comprar


### remover_item_lista

o produtor pede para tirar um item da Lista de Compra sem ter comprado

- descricao (texto): o item a tirar, como ele falou (arame)

### comprei_item_lista

o produtor conta que comprou um item que estava anotado na Lista de Compra: ele cita o item com artigo e SEM quantidade ("comprei o arame"), com ou sem o valor

- descricao (texto): o item da lista que ele comprou, como falou (sal)
- valor (numero): quanto pagou no total, só o número, como o produtor falou (1800); vazio se não disse
- pago (sim_nao): não quando ele comprou a prazo ou fiado; vazio se não disse

## leite

produção de leite do dia e quantas vacas estão dando leite (entrou, secou, total)

### registrar_producao_leite

o produtor conta quantos litros de leite tirou, no dia ou por ordenha

- litros (numero): o total de litros, só o número, como o produtor falou (480); vazio quando ele separou por ordenha
- manha (numero): litros da ordenha da manhã, só o número (300)
- tarde (numero): litros da ordenha da tarde, só o número (180)
- noite (numero): litros da ordenha da noite, só o número
- fazenda (texto): o nome da fazenda, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse
- lote (texto): o lote leiteiro, se ele citou um

### definir_vacas_em_lactacao

o produtor diz quantas vacas estão dando leite agora, no total

- quantidade (numero): o TOTAL de vacas dando leite, só o número (32; 0 quando não tem nenhuma)
- fazenda (texto): o nome da fazenda, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse
- lote (texto): o lote leiteiro, se ele citou um

### registrar_entrada_lactacao

o produtor conta que mais vacas começaram a dar leite

- quantidade (numero): quantas vacas ENTRARAM no leite, só o número (4)
- fazenda (texto): o nome da fazenda, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse
- lote (texto): o lote leiteiro, se ele citou um

### registrar_saida_lactacao

o produtor conta que secou vacas, que pararam de dar leite

- quantidade (numero): quantas vacas SECARAM ou saíram do leite, só o número (3)
- fazenda (texto): o nome da fazenda, se ele citou
- data (data): o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse
- lote (texto): o lote leiteiro, se ele citou um

## mao_de_obra

trabalhador FIXO da fazenda, o que tem salário: cadastro, pagamento, adiantamento; quem ele contratou para um serviço, por diária ou por valor fechado, não é daqui

### registrar_trabalhador

o produtor conta que tem um trabalhador fixo, o que ele faz e quanto ganha

- nome (texto): o nome do trabalhador, como o produtor falou (João)
- funcao (texto): o que ele faz na fazenda (vaqueiro, tratorista, caseiro)
- valor (numero): quanto ganha, só o número, como o produtor falou (2.500)
- frequencia (texto): de quanto em quanto recebe: mensal, quinzenal, semanal ou diaria

### registrar_pagamento_trabalhador

o produtor conta que pagou o salário de alguém da equipe fixa

- nome (texto): o nome do trabalhador, como o produtor falou (João)
- valor (numero): quanto pagou, só o número, como o produtor falou (2.500); vazio usa o valor previsto

### registrar_adiantamento

o produtor conta que adiantou dinheiro para alguém da equipe fixa, fora do pagamento

- nome (texto): o nome do trabalhador, como o produtor falou (João)
- valor (numero): quanto adiantou, só o número, como o produtor falou (500)

### agendar_pagamento_trabalhador

o produtor diz que VAI pagar alguém da equipe numa data futura, sem ter pago ainda

- nome (texto): o nome do trabalhador, como o produtor falou (João)
- data (data): quando vai pagar, como ele falou (dia 10, sexta, 20/10)
- valor (numero): quanto vai pagar, só o número; vazio usa o valor previsto do trabalhador

## servicos

serviço com máquina ou empreita, e o andamento dele: gente de fora paga por diária; alguém que ele contratou por um valor fechado; serviço prestado a cliente citando a máquina ou o preço; e o que acontece num serviço já registrado (começou, terminou, gastou combustível nele, ou avançou: "fiz MAIS tanto", "avancei", "já fiz tanto hoje"), mesmo sem máquina e sem preço

### registrar_diaria

o produtor conta que gente de FORA da equipe fixa trabalhou por dia num serviço, e quanto foi a diária

- servico (texto): o serviço feito (cerca, roçada, capina)
- valor (numero): o valor de UMA diária, só o número, como o produtor falou (150)
- quantidade (numero): quantos DIAS trabalharam, só o número (4)
- pessoas (numero): quantas pessoas trabalharam ao todo, só o número (3); quem ele cita pelo nome conta junto ("fulano e mais 2" são 3); vazio se não disse
- quem (texto): o nome de quem trabalhou, se ele disse
- fazenda (texto): o nome da fazenda, se ele citou

### registrar_servico_contratado

o produtor conta que contratou alguém para um serviço por um valor fechado

- servico (texto): o serviço feito (cerca, curral, limpeza de pasto)
- valor (numero): o valor total combinado, só o número, como o produtor falou (6 mil)
- quem (texto): quem fez o serviço (Pedro)
- fazenda (texto): o nome da fazenda, se ele citou

### registrar_servico_prestado

o produtor conta que fez ou vai fazer um serviço para um cliente citando a máquina ou o preço

- servico (texto): o serviço (gradagem, roçada, colheita)
- maquina (texto): a máquina usada, como ele falou (John Deere, Massey)
- unidade (texto): como cobrou, numa palavra só: hora, hectare, dia, viagem, tonelada, metro, quilometro, cabeca ou fechado
- valor (numero): o preço por unidade, ou o total quando fechado; só o número, como o produtor falou (180)
- quantidade (numero): quantas unidades (hectares, horas, dias), só o número (20); vazio quando fechado
- quem (texto): o cliente (João)
- concluido (sim_nao): sim quando ele diz que já fez; não quando ainda vai fazer ("vou gradear"); vazio se não disse
- data (data): o dia do serviço, como o produtor falou (hoje, ontem, dia 10); vazio se não disse
- fazenda (texto): o nome da fazenda, se ele citou

### iniciar_servico

o produtor conta que COMEÇOU ("comecei", "iniciei", "to começando") um serviço para cliente que já estava registrado

- quem (texto): o nome do cliente para quem o serviço é feito ("do João"); vazio se não disse

### registrar_producao_servico

o produtor conta QUANTO avançou num serviço para cliente já em andamento ("fiz mais tanto", "avancei", "já fiz tanto hoje", "rendeu tanto"), sem nomear o serviço de novo

- quem (texto): o nome do cliente para quem o serviço é feito ("do João"); vazio se não disse
- quantidade (numero): quanto foi feito, só o número, como o produtor falou (8)

### registrar_combustivel_servico

o produtor conta que gastou diesel ou outro produto num serviço para cliente em andamento

- quem (texto): o nome do cliente para quem o serviço é feito ("do João"); vazio se não disse
- produto (texto): o combustível ou produto (diesel)
- quantidade (numero): quanto gastou, só o número, como o produtor falou (60); a unidade fica fora
- valor (numero): o custo total, só o número, como o produtor falou; vazio se não disse

### encerrar_servico

o produtor conta que TERMINOU ("terminei", "acabei", "já terminei") um serviço para cliente em andamento

- quem (texto): o nome do cliente para quem o serviço é feito ("do João"); vazio se não disse

## financeiro

dinheiro solto: despesa ou receita avulsa, recibo, saldo do mês, e relatório em PDF de QUALQUER área (financeiro, rebanho, lavoura, prestador)

### registrar_lancamento_financeiro

o produtor conta um gasto ou um dinheiro recebido avulso, que não é compra de insumo, gado nem pagamento da equipe

- amount (numero): o valor, só o número, como o produtor falou (450,50, 1.500, 2 mil)
- tipo (texto): receita quando o dinheiro ENTROU (recebi); vazio quando é despesa
- category (texto): a categoria, se ele disse ou se é óbvia (Combustíveis, Energia, Aluguel)
- vendor (texto): de quem comprou ou com quem gastou (Posto XX), se ele disse
- description (texto): o que foi, em poucas palavras (conta de luz, diesel)

### consultar_saldo

o produtor pergunta quanto entrou, quanto saiu ou qual o saldo de dinheiro de um mês

- period (texto): o mês, como o produtor falou ("agosto", "mês passado", "08/2026"); vazio usa o mês atual

### gerar_relatorio

o produtor pede um relatório em PDF de uma área, que não precisa ser a financeira

- tipo (texto): financeiro, rebanho, lavoura ou prestador, conforme a área que ele pediu
- period (texto): o mês, como o produtor falou ("agosto", "mês passado", "08/2026"); vazio usa o mês atual

### registrar_recebimento

o produtor conta que um cliente PAGOU algo que devia a ele, no todo ou em parte

- contato (texto): quem pagou, o nome como o produtor falou (João, Fazenda Boa Vista)
- valor (numero): quanto recebeu, só o número; vazio quando ele não disse (aí é a conta inteira)
- data (data): quando recebeu, como ele falou (hoje, ontem, dia 10); vazio é hoje

### consultar_recebimento

o produtor PERGUNTA se um cliente já pagou, ou quanto ele ainda deve

- contato (texto): de quem ele quer saber, o nome como falou

## dia

agenda: o que tem para hoje, amanhã ou na semana, e criar lembrete ou tarefa

### criar_tarefa

o produtor pede um lembrete ou anota algo para fazer, com ou sem dia

- title (texto): o que precisa ser feito, nas palavras do produtor
- due_date (data): o dia, como o produtor falou (amanhã, quinta, dia 10); vazio se não disse

### consultar_meu_dia

o produtor pergunta o que tem para hoje, ou o que está atrasado: uma pergunta só, mesmo que cite tarefa, conta vencendo e vacina juntas


### consultar_amanha

o produtor pergunta o que tem marcado para amanhã


### consultar_semana

o produtor pergunta o que tem marcado para os próximos 7 dias


## calculadoras

contas de planejamento sem gravar nada: cerca, sementes, sal mineral, ração; perguntar COMO se pede uma dessas contas é conversa, não a conta

### calcular_cerca

o produtor quer saber quanto material precisa para fazer uma cerca

- comprimento (numero): o tamanho da cerca em metros, só o número, como o produtor falou (1.000)
- fios (numero): quantos fios de arame, só o número (5)
- espacamento (numero): a distância entre os mourões em metros, só o número (4); vazio se não disse
- metros_por_rolo (numero): quantos metros tem o rolo de arame, só o número (500); vazio se não disse

### calcular_sementes

o produtor quer saber quanta semente precisa para plantar uma área

- area (numero): a área em hectares, só o número (20)
- variedade (texto): só o nome da variedade, sem "capim" (mombaça, marandu, massai)
- taxa (numero): quilos de semente por hectare, só o número (12); vazio se não disse
- peso_saca (numero): quantos quilos tem a saca de semente, só o número (10); vazio se não disse

### calcular_sal

o produtor quer saber quanto sal mineral os animais vão comer num período

- animais (numero): quantos animais, só o número (100)
- dias (numero): o período em dias, só o número (30; um mês vira 30)
- consumo (numero): gramas de sal por animal por dia, só o número (100); vazio se não disse
- peso (numero): o peso médio dos animais em kg, só o número (450); vazio se não disse
- peso_saca (numero): quantos quilos tem a saca de sal, só o número (25); vazio se não disse

### calcular_racao

o produtor quer saber quanto de cada ingrediente vai numa mistura de ração

- ingredientes (lista): um item por ingrediente da receita
  - nome (texto): o ingrediente (milho, soja, núcleo)
  - percentual (numero): a porcentagem na receita, só o número (65)
- quantidade (numero): quantos quilos da mistura quer fazer, só o número (500)

## prestador

para quem presta serviço, duas coisas só: o serviço do catálogo que ele NOMEIA e fez para um cliente, sem citar máquina nem preço (quantos hectares, horas ou diárias, sozinho, continua aqui); e quanto um cliente deve ou já pagou. Começar, terminar ou avançar ("fiz MAIS tanto") num serviço já registrado não é daqui, nem o que ele PAGA a quem trabalhou para ele

### cadastrar_servico_ordem

o prestador NOMEIA um serviço do seu catálogo que fez para um cliente cadastrado, sem citar máquina nem preço e sem contar o avanço de um serviço em andamento; quantos hectares, horas ou diárias foram continua sendo esta

- client_name (texto): o nome do cliente, como ele falou (João)
- service_name (texto): o serviço do catálogo, como ele falou (diária de trator, gradagem)
- quantity (numero): quantas unidades, só o número, como o produtor falou (2); vazio conta 1

### consultar_cliente

o prestador pergunta quanto um cliente já pagou ou ainda deve

- client_name (texto): o nome do cliente, como ele falou (João)

## conversa

pergunta de como usar o Tibé, e pedido de visão geral de uma área (rebanho, lavoura, prestador, financeiro) ou da relação de contas a pagar ou a receber

### ajuda

o produtor pergunta como usar um recurso do Tibé, ou o que o assistente faz

- topic (texto): o recurso sobre o qual quer saber (ex.: registrar_peso, consultar_saldo); vazio mostra o menu geral

### resumo

o produtor pede uma visão geral de uma área (rebanho, lavoura, prestador, financeiro) ou a relação do que tem a pagar ou a receber

- scope (texto): a área ou o nível pedido (rebanho, lavoura, prestador, financeiro; ou clientes, agendamentos, ordens_a_faturar, contas_a_pagar, contas_a_receber); vazio pergunta qual área
