# Revisão dos blocos de homologação (Fase 4)

Cinco testadores entregaram 60 blocos em cinco arquivos parciais. Este
documento registra o que mudou e por quê, bloco a bloco. O resultado é
`homologacao.json`, com os 60 blocos; os cinco parciais foram apagados para
não entrarem em dobro em toda rodada futura.

## O que eu pude conferir e eles não

Os autores escreveram sem acesso a `src/`, de propósito. Eu li
`src/lib/actions/whatsapp-handlers/` e `src/lib/agente/` justamente para
desempatar o `grava`. Três fatos do código contradizem o briefing que eles
receberam, e são a origem da maioria das correções:

1. **Movimentação de rebanho TAMBÉM pede confirmação.** O briefing lista só
   "compra e venda de gado, lançamento de dinheiro e cadastro".
   `registrarMovimentacaoRebanho` (`herd.ts:690`) passa por `confirmFlow` e
   pergunta "Deseja registrar ...?" antes de gravar. Dois blocos afirmavam o
   contrário na nota.
2. **`cadastrar_animal` NÃO pede confirmação.** É o contrário do briefing:
   `rebanho.ts:67` grava direto assim que tem brinco, raça, sexo, categoria e
   fazenda. O que segura o cadastro nos casos escritos não é confirmação, é
   pergunta de campo faltando (são duas fazendas).
3. **`adicionar_item_lista` pergunta antes de duplicar.** `Arame farpado` já
   está na lista da fazenda de avaliação, então "anota arame farpado" abre uma
   pergunta de duplicata cujo "sim" GRAVA. Um bloco marcava esse "sim" como
   `"nao"`.

Também confirmei que `registrar_uso_estoque` (`estoque.ts:514`) grava direto
com produto, quantidade e fazenda, sem confirmação: os blocos de uso de
estoque estavam certos.

## As três correções mais importantes

### 1. `hom-simsolto-006`: um `"nao"` que reprovaria o agente por acertar

Era: "anota arame farpado na lista de compra" (`pode`) / "sim" (`nao`).
Como `Arame farpado` já está na lista, o passo 1 não grava: pergunta "você já
tem arame farpado na sua lista, quer anotar mais assim mesmo?" e guarda o
pedido. O "sim" do passo 2 é a resposta a essa pergunta, e gravar ali é o
comportamento CERTO. O `"nao"` reprovaria o agente por fazer a coisa certa, que
é exatamente o erro caro que esta revisão existe para evitar.
Corrigido para "anota 10 saca de sal mineral na lista de compra": item novo,
grava sozinho no passo 1, e aí o "sim" do passo 2 é mesmo um "sim" fora de hora.

### 2. Quatro blocos copiavam o exemplo que está dentro do prompt do classificador

`hom-recusa-001`, `hom-correcao-001`, `hom-picada-001` e `hom-audio-001` usavam
"comprei 20 bezerro do joão por 60 mil". Essa frase é o exemplo literal do
registro de intenções (`src/lib/agente/intencoes/rebanho.ts:124`), que vai
dentro do prompt: medir com ela é medir o modelo recitando o próprio prompt, e
este projeto já perdeu uma medição inteira por contaminação assim. O briefing
usa a mesma frase como ilustração de formato, então a culpa não é dos autores.
Os quatro foram variados em categoria, número, valor e forma da frase
(`14 vaca` / `30 bezerro` / `12 garrote` / "o joão me vendeu uns bezerro").
Nenhum precisou de `coincide_com_exemplo`, que os tiraria da partição final.

### 3. `hom-audio-003` era `hom-picada-002` com muleta de fala

Dois autores diferentes escreveram o mesmo bloco: uso de sal mineral, duas
sacas, na Fazenda Boa Vista, em três passos, com a fazenda no último. A única
diferença era o "eh deixa eu ver". Rodar os dois mede a mesma coisa duas vezes.
`hom-audio-003` passou a ser ração de engorda, cinco sacas.

## Mudança por bloco

Blocos não citados entraram sem alteração.

### recusa

- **hom-recusa-001**: texto do passo 2 era `nao`, mas a nota dizia "com
  acento". Passou a ser `não`, que é o que o bloco se propõe a testar (o par sem
  acento é o `hom-recusa-002`). Passo 1 variado para sair do exemplo do prompt.
- **hom-recusa-003**: "do Ze" não existe em `fazenda.md` (Zé Carlos é
  mensalista, não fornecedor). O nome foi retirado, e o bloco ficou "comprei 6
  saca de sal mineral por 1200", que também deixou de repetir o molde do
  `hom-correcao-003`.
- **hom-recusa-005**: "adianta 500 pro Pedro". Pedro é diarista (eventual), e
  `registrar_adiantamento` é para a equipe FIXA: o handler recusaria pelo
  motivo errado e o bloco mediria outra coisa. Trocado para Zé Carlos, e o valor
  para 800, para não colidir com o `hom-audio-007`.
- **hom-recusa-006**: "contratei o Ze Carlos" virou "contratei o Pedro", para o
  Zé Carlos não aparecer em dois blocos seguidos da mesma categoria.
- **hom-recusa-008**: "do Ze" trocado por "do Joao do Leilao". O `grava: "nao"`
  foi mantido e conferido: `detectConfirmation` lê o "nao" inicial, `explicitNo`
  cancela, e a compra emendada pede confirmação de qualquer forma. É um dos
  melhores blocos do lote.

### correção

- **hom-correcao-001**: variado (ver correção 2 acima), 30 para 35 bezerros.
- **hom-correcao-002**: era "vendi 15 novilha pro frigorifico bom boi", molde
  quase igual ao `hom-recusa-002`. Virou 9 para 12 novilhas. Nota acrescentada:
  "novilha" é ambígua e o assistente pergunta a idade antes.
- **hom-correcao-004**: registrava "Ze Carlos" como trabalhador NOVO, e ele já
  existe na fazenda de avaliação: `createWorker` falharia por duplicata e o
  bloco mediria o erro, não a correção de nome. Trocado para
  "antonio" corrigido para "antoniel". Nome fora de `fazenda.md` aqui é
  correto: cadastro de trabalhador novo exige nome novo.
- **hom-correcao-005**: o boi da Boa Vista está todo no Pasto da Sede. A
  correção ia do Pasto da Baixada para o Piquete 3, dois lugares sem saldo, e o
  handler barraria antes de chegar ao ponto do teste. Invertido: do Piquete 3
  para o Pasto da Sede, que é onde o gado está.
- **hom-correcao-006**: 12 garrotes colidiam com o `hom-picada-001` já variado.
  Virou 16 bois.
- **hom-correcao-008**: o passo 2 era "corrige, o vencimento e dia 15, nao dia
  10". O "nao" no meio da frase faz `detectConfirmation` devolver "no", e a
  recusa CANCELA a compra pendente: o bloco se autodestruía antes do passo 3.
  Reescrito sem o "nao" ("corrige, o vencimento e dia 15"). A fazenda também
  foi dita, senão a conversa inteira ficava presa na pergunta de qual fazenda.
- **hom-correcao-009**: passo 4 rebaixado de `"deve"` para `"pode"`. O bloco
  supõe um pendente de confirmação que não existe: o item da lista não tem
  produto ligado, então `compreiItemLista` risca o item na hora (passo 1, que
  segue `"pode"`) e não guarda nada para confirmar depois. Os dois `"nao"` do
  meio continuam corretos e valiosos.

### duplo

- **hom-duplo-004**: nota corrigida. Mantive `"deve"` no "sim": conferi que o
  arame já está na lista, então o passo 1 abre a pergunta de duplicata e o
  assistente de fato mostrou o que ia fazer.
- **hom-duplo-005**: "sim" rebaixado de `"deve"` para `"pode"`. Consulta de
  saldo não pergunta nada e vermífugo é item novo, que grava sozinho: não
  sobra nada pendente para o "sim" confirmar. Não marquei `"nao"` porque
  `hom-simsolto-005` e `hom-simsolto-006` já cobrem esse caso com certeza, e
  aqui a certeza não existe.
- **hom-duplo-001, 002, 003, 006, 007, 009, 010**: `"deve"` mantido, um a um,
  depois de conferir no código que a parte de registro de cada frase (venda de
  gado, lançamento financeiro, pagamento de trabalhador, produção de leite,
  serviço prestado, entrada em confinamento, diária) passa por confirmação.

### picada e áudio

- **hom-picada-001**: variado para 12 garrotes por 36 mil (ver correção 2).
- **hom-picada-006**: a nota afirmava que "movimentação não pede confirmação
  explícita". É falso (ver fato 1). Nota reescrita; os `grava` não mudam.
- **hom-picada-007**: "pagaram diária" diz que alguém pagou o produtor, o
  oposto do que a nota do bloco descreve. Corrigido para "paguei a diaria do
  pessoal".
- **hom-audio-001**: variado e com o nome corrigido: "do ze" não existe em
  `fazenda.md`. Virou "o joao do leilao me vendeu uns bezerro", que de quebra
  testa a compra dita do ponto de vista do vendedor.
- **hom-audio-003**: trocado para ração de engorda (ver correção 3).
- **hom-audio-007**: "o pedro pediu um adiantamento" trocado para "o ze
  carlos", pelo mesmo motivo do `hom-recusa-005`.

### curta

- **hom-curta-003**: era "bota um nelore macho brinco 77 pra cadastrar" com
  "isso" respondendo. Como cadastro não pede confirmação (fato 2), o que o
  assistente pergunta ali é em qual das duas fazendas cadastrar, e "isso" não
  responde isso: o bloco não media resposta curta nenhuma. Trocado por "mandei
  12 boi pro confinamento boa vista" / "isso", que tem uma confirmação de
  verdade para o "isso" responder, e traz o confinamento para a categoria.
- **hom-curta-004**: o Pasto do Rio (Sítio São José) só tem fêmeas acima de 36
  meses; a morte de uma novilha de 13 a 24 ali nunca chegaria à confirmação,
  porque a conferência de saldo barra antes. Mudado para o Pasto da Sede, onde
  existem 25 fêmeas de 13 a 24 meses. A nota que dizia que movimentação não
  pede confirmação foi corrigida.
- **hom-curta-006**: `grava` mantido; a nota agora diz a verdade, que o
  assistente pergunta o pasto sem listar opções numeradas. O bloco continua
  valendo, e vale mais assim: testa se o agente INVENTA um pasto a partir de
  "o segundo".
- **hom-curta-008**: era a terceira compra de bezerro do João do Leilão do
  lote, com só o número trocado. Virou compra de ivermectina, quarto produto do
  estoque, com a fazenda dita para a conversa chegar à confirmação.

### sim solto

- **hom-simsolto-004**: era outra compra de bezerro do João do Leilão com
  recusa, quase idêntica ao `hom-recusa-001`. Virou produção de leite (320
  litros na Boa Vista), que também pede confirmação, mantendo o ponto do bloco:
  "sim" depois de uma recusa.
- **hom-simsolto-006**: ver correção 1.
- **hom-simsolto-007**: era cadastro de animal, apoiado na premissa falsa de
  que cadastro confirma (fato 2). Com brinco, raça e sexo e sem categoria, o
  que abre é o formulário assistido, e o "sim" nunca confirma nada: os três
  passos viravam ruído. Trocado por "nasceram 3 bezerro no pasto da sede", que
  tem confirmação de verdade, e preserva exatamente a forma do bloco (pedido,
  "sim" que grava, "sim" que já não pode gravar).

## Nenhum bloco descartado

Os 60 entraram. Os candidatos a descarte eram `hom-correcao-009`,
`hom-curta-003` e `hom-simsolto-007`, os três apoiados em premissas falsas
sobre confirmação. Os dois últimos foram salvos trocando o domínio e mantendo a
forma do bloco, que é o que a categoria mede; o primeiro foi salvo rebaixando
só o passo final, porque os dois `"nao"` do meio continuam corretos e são o que
ele mede.

## O que NÃO mudei, e por quê

- Os `"nao"` de passo de recusa, todos conferidos: `explicitNo` vem do TEXTO e
  cancela antes de qualquer escrita, em todos os handlers envolvidos.
- Os `"nao"` de consulta (`hom-audio-002`, `hom-audio-008`, `hom-duplo-008`,
  `hom-simsolto-002`, `hom-simsolto-005`): consulta não escreve em lugar nenhum.
- `hom-picada-008` passo 1 ("o sal mineral ta acabando", `"nao"`): seja lido
  como consulta de estoque, como uso sem quantidade ou como ajuste sem saldo,
  nenhum dos três grava. É um `"nao"` correto e difícil, e desses o teste
  precisa.
- Os valores que não batem com `fazenda.md` por serem informação NOVA (salário
  de 2500 de um vaqueiro a contratar, 2500 pagos ao Zé Carlos que ganha 2200):
  o produtor pode dizer um valor diferente do cadastrado, e o catálogo aceita.
