# Revisão do juiz: casos de avaliação de modelos

Lidos por inteiro: `briefing/autores.md`, `briefing/fazenda.md`, `briefing/catalogo.md`, os seis
arquivos de casos (340 casos: produtor 90, complemento 60, audio 60, cliente 40, adversarial 30
mensagens + 25 conversas, conversa 35) e os `exemplos`/`vizinhas` do registro em
`src/lib/agente/intencoes/`. `npm run avaliacao:validar` passa: nenhum nome de intenção ou campo
inválido. As disputas abaixo são de VALOR, não de formato.

## Avaliação geral

Três fatos do pontuador (`scripts/avaliacao/pontuar.ts`, conferidos rodando `compararCampo`) pesam
em quase toda disputa, e o controlador precisa deles para decidir:

- texto casa por inclusão depois de tirar acento e caixa, então plural NO MEIO não casa
  ("fêmeas de 13 a 24 meses" x "fêmea de 13 a 24 meses" = falso), número por extenso não casa com
  algarismo ("1234" x "mil duzentos e trinta e quatro" = falso), e "Combustíveis" não casa nem com
  "Combustível" nem com "combustivel";
- data que `interpretarData` não lê cai em IGUALDADE EXATA de texto. Não lê: "dia vinte", "dia dez",
  "dia 10 de setembro", "quinta", "quinta feira", "semana que vem", "essa semana", "amanhã". Lê:
  "dia 10", "dia 20", "hoje", "ontem";
- campo numérico que o gabarito omite e o modelo extrai conta como "número inventado"; número
  inventado DENTRO de `itens` não é conferido. E na conversa só `grava: "nao"` com linha nova
  reprova (`aprovar` usa só gravações indevidas); `"deve"` errado só suja o relatório.

Qualidade por autor:

- **produtor** (`produtor.json`): bom, cobre todos os domínios com fala natural; erros pontuais de valor (plural no meio, lote completado, "60 de diesel" sem unidade, data puxada para o pedido errado).
- **complemento** (`complemento.json`, autor "produtor", ids prod-101 a 160): gabaritos quase todos certos, mas cerca de 20 dos 60 repetem frase de produtor ou cliente e agregam pouco; datas por extenso que ninguém lê.
- **audio**: estilo de transcrição convincente; erro sistemático de brinco e data por extenso (5 brincos, 3 datas) e categoria financeira inferida.
- **cliente**: fiel às fontes, mas frases de spec tiradas do contexto viraram indecidíveis (cli-023, cli-038), uma contraria a vizinha do registro (cli-032), e muitas coincidem com os exemplos do registro, que nasceram das mesmas specs.
- **adversarial**: melhor desenho do conjunto; dois casos pedem `ambigua` composta que o pipeline não produz, um contraria o exemplo do registro (adv-006), um `nao` frouxo e três `deve` sem certeza.
- **conversa**: regra do `grava` bem aplicada e com notas; dois `nao` que podem ser registro legítimo (conv-015, conv-016), dois `deve` incertos, e passos que dependem de dado ausente na fazenda.

## Disputas

### Muda a nota

| id | arquivo | problema | correção proposta |
|---|---|---|---|
| adv-040 | adversarial.json | passo 3 `"nao, deixa a venda pra depois, so anota a morte mesmo"` marcado `nao`, mas pede explicitamente o registro da morte: gravar a morte ali é certo e sai como gravação indevida (reprova) | passo 3: `"grava": "pode"` |
| conv-015 | conversa.json | passo 4 `"perai, deixa ele la mesmo, esquece o que eu disse"` desfaz a remoção do passo 3; se o item já saiu, voltar com ele à lista cria linha legítima e reprova como indevida | passo 4: `"grava": "pode"` |
| conv-016 | conversa.json | passo 4 `"beleza"` vem logo depois de compra completa ("800 reais", "a prazo"); se o assistente mostrou o resumo e pediu confirmação, "beleza" É a confirmação | passo 4: `"grava": "pode"` |
| adv-049 | adversarial.json | passo 3 `"acho que umas 4, depois confirmo direito"` responde com número a pergunta do assistente ("quantas?"); registrar 4 é defensável, e `nao` aqui reprova modelo razoável | passo 3: `"grava": "pode"` |
| adv-042, conv-005, conv-010, conv-020, conv-023, conv-025, conv-035 | adversarial.json, conversa.json | correção marcada `nao` logo depois de passo que, pelas próprias notas dos autores, grava direto (serviço contratado, movimentação, uso de estoque, lactação, adiantamento, diária, resultado de evento). A regra do briefing é "correção ANTES de confirmar"; se já gravou, a correção pode gravar estorno ou ajuste legítimo | condicional: o controlador confere no roteiro se o passo anterior grava sem "sim"; se gravar, trocar para `"pode"` em adv-042 passo 2, conv-005 passo 3, conv-010 passo 2, conv-020 passo 2, conv-023 passo 2, conv-025 passo 3, conv-035 passo 4 |
| aud-010 | audio.json | `ear_tag` por extenso: não casa com "1235" que o modelo certo devolve, e o handler precisa do número | `"ear_tag": "1235"` |
| aud-011 | audio.json | idem, brinco 1234 da fazenda | `"ear_tag": "1234"` |
| aud-012 | audio.json | idem | `"ear_tag": "1234"` |
| aud-013 | audio.json | idem, e `due_date: "dia vinte"` não é lida pelo parser, cai em igualdade exata e reprova "dia 20" | `"ear_tag": "1234"`, `"due_date": "dia 20"` |
| aud-014 | audio.json | idem | `"ear_tag": "1234"` |
| aud-004 | audio.json | `vencimento: "dia dez"` não é lida; reprova "dia 10" | `"vencimento": "dia 10"` |
| prod-150 | complemento.json | `due_date: "dia vinte"`, mesmo defeito | `"due_date": "dia 20"` |
| cli-002 | cliente.json | `vencimento: "dia 10 de setembro"` não é lida; só a cópia literal passa, "dia 10" e "10/09" reprovam | `"vencimento": "dia 10"` (mesmo dia civil com hoje = 2026-09-15) |
| aud-054 | audio.json | `due_date: "quinta feira"` não é lida; "quinta" e "quinta-feira" reprovam | `"due_date": "quinta"`, ou tirar o campo; a correção de fundo é o pontuador usar inclusão quando a data não é lida |
| aud-008 | audio.json | `categoria_destino: "oito a doze meses"` não casa com "8 a 12 meses" (forma do exemplo do catálogo e a que o handler mapeia) | `"categoria_destino": "8 a 12 meses"` |
| prod-002 | produtor.json | gabarito "fêmeas de 13 a 24 meses", texto diz "fêmea": o modelo que copia a fala reprova (plural no meio) | `"categoria": "13 a 24 meses"` (casa com as duas formas) |
| prod-046 | produtor.json | `lote: "Vacas em Lactação"` completou o nome cadastrado; o produtor disse "lote de lactação", e essa extração literal reprova | `"lote": "lactação"` |
| cli-030 | cliente.json | `category: "Combustíveis"` inferida; "Combustível" e "combustivel" reprovam | remover `category` (fica só `"amount": 300`) |
| aud-050 | audio.json | `category: "Combustíveis"` inferida, mesmo defeito | remover `category` |
| cli-032 | cliente.json | "fiz uma gradagem pra Agropecuaria Santa Fe com o New Holland" esperado como `cadastrar_servico_ordem`, mas a vizinha do registro diz que `registrar_servico_prestado` é "o mesmo gesto no perfil fazenda, com máquina", e a avaliação roda com os dois perfis | `[{"intent":"registrar_servico_prestado","campos":{"servico":"gradagem","maquina":"New Holland","quem":"Agropecuária Santa Fé","concluido":true}}]`, ou tirar "com o New Holland" do texto (aí vira duplicata de prod-106) |
| adv-006 | adversarial.json | "fiz uns hectares de gradagem pro Joao" esperado como `registrar_servico_prestado`, mas não tem máquina nem preço e é quase o exemplo de `cadastrar_servico_ordem` ("fiz 3 horas de gradagem para o Pedro") | `[{"intent":"cadastrar_servico_ordem","campos":{"client_name":"Joao","service_name":"gradagem"}}]`; a armadilha continua medida, porque `quantity` inventada é número de topo |
| cli-023 | cliente.json | "entraram mais 4 vacas" sem "no leite": a vizinha manda para movimentação quando não diz "dando leite"/"em lactação"; sem a conversa da spec é indecidível | texto: `"entraram mais 4 vacas no leite"` |
| cli-038 | cliente.json | "venderam 12 e voltaram 8" sem citar evento: tirada de contexto, nada diz que é leilão | texto: `"do leilão da cooperativa venderam 12 e voltaram 8"` e `"evento": "leilão da cooperativa"` |
| prod-047 | produtor.json | "saíram 2 vaca do leite, foram pro confinamento" tem duas ações; o modelo que emite também a entrada no confinamento leva "pedido a mais" | texto: `"saíram 2 vaca do leite"`; ou 2º pedido `{"intent":"registrar_entrada_confinamento","campos":{"categoria":"vaca","quantidade":2}}` |
| adv-026 | adversarial.json | esperado `[ambigua, consultar_estoque]`, mas `ambigua` sai da etapa de domínio para a mensagem inteira (`casos.ts`); o modelo que ignora o "sim" e devolve só a consulta tira 0 de 2 por desalinhamento de posição | `[{"intent":"consultar_estoque","campos":{"produto":"sal"}}]` |
| adv-030 | adversarial.json | esperado `[ambigua, registrar_negocio_produto]`, mesmo defeito | `[{"intent":"registrar_negocio_produto","campos":{"tipo":"compra","produto":"racao","quantidade":10,"valor":800}}]` |
| prod-054 | produtor.json | "gastei 60 de diesel": 60 pode ser reais; o modelo que lê `valor: 60` perde `quantidade` e ainda leva número inventado | texto: `"... e gastei 60 litro de diesel"` |
| prod-134 | complemento.json | "gastei 40 de diesel", mesma ambiguidade | texto: `"gastei 40 litros de diesel no serviço do João e já terminei"` |
| prod-041 | produtor.json | `data: "hoje"` no 2º pedido: o "hoje" está preso à produção ("tirei 480 litro de leite hoje"), não à entrada na lactação | remover `data` de `registrar_entrada_lactacao` |
| conv-030 | conversa.json | passo 2 `deve`, sem certeza: "tenho que pagar a conta de energia, 480, dia 20" é conta FUTURA e pode cair em `criar_tarefa` (grava sem "sim"); além disso essa conta já existe em `fazenda.md` | passo 2: `"grava": "pode"`; de preferência, trocar a conta por outra (ex.: "tenho que pagar o veterinario, 350, dia 25") |
| conv-004 | conversa.json | passo 3 `deve`, mas a fazenda não foi dita e há duas: o assistente pergunta a fazenda antes de mostrar o resumo, e o "sim" não confirma nada | passo 3: `"grava": "pode"` (ou pôr "na Boa Vista" no passo 2) |
| adv-034 | adversarial.json | passo 4 `deve` depois de fazenda não dita e correção no meio: nada garante resumo mostrado antes do "sim" | passo 4: `"grava": "pode"` |
| adv-039 | adversarial.json | passo 3 `deve`, venda de gado sem fazenda: o assistente pode estar perguntando a fazenda | passo 3: `"grava": "pode"` |
| adv-036 | adversarial.json | passo 3 `deve` depois de "nao, foi 850": nada garante que o roteiro remostrou o resumo em vez de encerrar | passo 3: `"grava": "pode"` |
| conv-031 | conversa.json | passo 3 `deve` depois de "nao espera, foi 1250", mesma incerteza | passo 3: `"grava": "pode"` |

### Menor

| id | arquivo | problema | correção proposta |
|---|---|---|---|
| prod-084, prod-106 | produtor.json, complemento.json | "fiz UMA diária/gradagem": o modelo que extrai `quantity: 1` leva número inventado, e o catálogo diz que vazio conta 1 | aceitar os dois no pontuador (1 = vazio), ou texto sem o artigo numérico |
| cli-026 | cliente.json | `due_date: "quinta"` não é lida; "quinta-feira" reprova | mesma correção de fundo de aud-054 (inclusão quando a data não é lida) |
| prod-070, aud-007, aud-040 | produtor.json, audio.json | datas "semana que vem" e "essa semana" em igualdade exata; "esta semana" reprova | remover a data desses pedidos ou corrigir o pontuador |
| prod-015, prod-144 | produtor.json, complemento.json | `confinamento` do 2º pedido (alimentação) inferido por "pra eles" | remover `confinamento` do `registrar_alimentacao_confinamento` |
| prod-054, prod-134, prod-137, prod-141 | produtor.json, complemento.json | `quem`/`nome` do 2º pedido vem por correferência; defensável, mas campo que falta reprova | manter; se o controlador quiser só o dito, remover do 2º pedido |
| prod-053, aud-045 | produtor.json, audio.json | `pessoas: 3` calculado de "o pedro e mais 2" | manter (conta inequívoca), registrar como inferência |
| prod-055 | produtor.json | "trabalhei eu e mais 1": `registrar_diaria` é "gente contratada", e o produtor trabalhando para si não é; `pessoas: 2` calculado | texto: `"o pedro e mais 1 trabalharam na roçada, 3 dia, 120 a diária"` com `"pessoas": 2, "quem": "Pedro"` |
| prod-023, aud-021 | produtor.json, audio.json | `tipo_evento` deduzido do nome do evento ("feira de barretos", "leilao da expoagro"); prod-022 e cli-037 omitem no mesmo molde | remover `tipo_evento` dos dois |
| prod-028 | produtor.json | `data: "hoje"` tirado de "pro lote de hoje", que qualifica o lote | remover `data` do uso de estoque |
| prod-040 | produtor.json | "paguei 800, foi a prazo" é contraditório e convida `pago: true` | texto: `"comprei o arame farpado, deu 800, foi a prazo"` |
| adv-013 | adversarial.json | categoria "novilha de 13 a 24 meses" com plural no meio, mesmo risco de prod-002 | `"categoria": "13 a 24 meses"` |
| adv-004 | adversarial.json | "nao, deixa isso pra depois": "isso" pode cancelar a frase inteira | texto: `"... e vende os bezerros, nao, a venda deixa pra depois"` |
| adv-020, adv-021, adv-022 | adversarial.json | a nota diz que o caso pega quantidade inventada, mas o pontuador não confere número dentro de `itens` | ajustar o pontuador, ou registrar que o caso não mede o que promete |
| aud-032 | audio.json | "gastei sessenta litro de diesel ontem": a vizinha de `registrar_uso_estoque` diz que "gastei diesel" é combustível de serviço ou lançamento | texto com "usei" |
| cli-011 | cliente.json | `sentido: "saida"` deduzido de "faltando" (o catálogo diz vazio se não disse) | manter (inequívoco) ou remover |
| aud-003 | audio.json | "piquete tres": gabarito "Piquete 3" está certo, mas "piquete tres" reprova | manter; só registrar |
| prod-057 | produtor.json | "gradeei" com gabarito "gradagem": "gradear" reprova | manter, ou texto "fiz a gradagem de 20 hectare ..." |
| prod-030, aud-027 | produtor.json, audio.json | `contato: "vizinho"` dito e omitido (texto, sem penalidade) | opcional: `"contato": "vizinho"` |
| prod-045, prod-148 | produtor.json, complemento.json | data dita ("essa semana", "hoje") e omitida | opcional: incluir `"data": "hoje"` em prod-148 |
| conv-027 | conversa.json | João não tem serviço registrado na fazenda: iniciar, produção e combustível não gravam nada, e o caminho feliz não é testado | trocar "Joao" por "Agropecuaria Santa Fe" |
| conv-009 | conversa.json | passo 4 "o resto voltou pro Pasto da Sede", mas o lote tem exatamente os 10 machos vendidos no passo 1 | passo 1: `"tirei 6 machos do Confinamento Boa Vista"` |
| adv-045 | adversarial.json | "sairam do Pasto da Baixada": não há animal nenhum na Baixada | `"sairam do Pasto da Sede"` |
| adv-053 | adversarial.json | novilha morta no Pasto da Baixada, onde não há novilhas | `"Pasto da Sede"` |
| conv-022 | conversa.json | "salario do Pedro", mas Pedro é diarista; Zé Carlos é o mensalista | `"paguei o salario do Ze Carlos"` e adiantamento para o Pedro |
| conv-026 | conversa.json | combustível lançado em serviço CONTRATADO (Pedro faz para o produtor); `registrar_combustivel_servico` é de serviço prestado para cliente | trocar o passo 2 por outro assunto ou por serviço prestado |
| conv-015 | conversa.json | passo 1 põe na lista "arame farpado", que já está nela | trocar o item por "grampo" |
| complemento.json | complemento.json | arquivo fora da encomenda, com autor "produtor" e ids prod-101 a 160 | só registrar a origem no relatório |
| prod-125 / prod-036 | complemento.json, produtor.json | duplicata idêntica ("o que tá anotado pra comprar mesmo?") | apagar prod-125 |
| prod-136 / prod-068 / cli-040 | complemento.json, produtor.json, cliente.json | duplicata idêntica (relatório financeiro do mês passado) | apagar prod-136 e cli-040 |
| prod-155 / cli-017 | complemento.json, cliente.json | duplicata idêntica ("vacinei o brinco 1234 de aftosa, custou 35") | apagar prod-155 |
| prod-032 / cli-036 | produtor.json, cliente.json | duplicata idêntica ("quanto de ivermectina eu tenho?") | apagar cli-036 |
| prod-149 / cli-016 | complemento.json, cliente.json | duplicata (só acento) | apagar prod-149 |
| prod-110 / prod-082 | complemento.json, produtor.json | duplicata (quilo/quilos) | apagar prod-110 |
| prod-128 / prod-071; prod-121 / prod-073; prod-127 / prod-037; prod-131 / prod-067; prod-132 / prod-076; prod-142 / prod-051; prod-138 / prod-060; prod-104 / prod-031; prod-123 / prod-003 / cli-014 | complemento.json, produtor.json, cliente.json | quase duplicatas (troca de uma palavra) | apagar as de complemento |
| prod-124 / prod-087 / aud-059 / cli-031 | vários | mesma consulta de cliente quatro vezes | manter uma |
| prod-153 / prod-057 / aud-047 | vários | mesma gradagem (20 ha, João, New Holland, 180) três vezes | manter uma |
| prod-108 / prod-078 / aud-057; prod-113 / aud-058; prod-133 / aud-022 / prod-024; prod-151 / aud-046; prod-157 / aud-035 / prod-038; prod-106 / cli-032; cli-021 / prod-042 / aud-038; cli-022 / prod-043 | vários | quase duplicatas entre autores | manter uma de cada grupo |

## Coincide com exemplo do registro

Literal ou quase literal (diferença só de acento, pontuação, abreviação, "kg" ou número por extenso):
prod-002, prod-008, prod-022, prod-033, prod-038, prod-041, prod-063, prod-071, prod-075, prod-078,
prod-084, prod-089, prod-115, prod-128, prod-133, aud-023, aud-031, aud-049, aud-056, aud-057,
cli-020, cli-021, cli-022, cli-024, cli-026, adv-005, conv-027 (passo 2)

Mesma frase com troca de nome ou número:
prod-011, prod-017, prod-021, prod-024, prod-026, prod-031, prod-037, prod-042, prod-043, prod-044,
prod-047, prod-049, prod-051, prod-054, prod-059, prod-061, prod-068, prod-073, prod-077, prod-080,
prod-082, prod-086, prod-090, prod-102, prod-104, prod-107, prod-108, prod-110, prod-113, prod-116,
prod-118, prod-121, prod-127, prod-134, prod-136, prod-137, prod-140, prod-142, prod-144, prod-147,
prod-151, prod-153, prod-155, aud-001, aud-004, aud-006, aud-008, aud-013, aud-016, aud-017, aud-018,
aud-019, aud-021, aud-022, aud-024, aud-036, aud-038, aud-041, aud-043, aud-046, aud-047, aud-048,
aud-051, aud-053, aud-054, aud-058, cli-001, cli-002, cli-007, cli-008, cli-012, cli-015, cli-017,
cli-031, cli-034, cli-039, cli-040, adv-004, adv-028, adv-042 (passo 1), conv-001 (passo 1),
conv-023 (passo 1), conv-025 (passos 1 e 2)
