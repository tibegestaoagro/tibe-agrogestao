# Aplicação da revisão do juiz

Registro do que foi feito em cada disputa de `revisao-do-juiz.md`, por decisão do
controlador. "Aplicado" segue a correção proposta ao pé da letra; "mantido"
preserva o gabarito; "apagado" remove o caso do arquivo.

## Muda a nota

Todas aplicadas como proposto.

- adv-040: aplicado (passo 3 `grava: pode`).
- conv-015: aplicado (passo 4 `grava: pode`; ver também Menor, item de troca do
  passo 1).
- conv-016: aplicado (passo 4 `grava: pode`).
- adv-049: aplicado (passo 3 `grava: pode`).
- Grupo condicional (adv-042 passo 2, conv-005 passo 3, conv-010 passo 2,
  conv-020 passo 2, conv-023 passo 2, conv-025 passo 3, conv-035 passo 4):
  aplicado, todos viraram `pode`.
- aud-010, aud-011, aud-012, aud-013, aud-014: aplicado (`ear_tag` numérico;
  aud-013 também `due_date: "dia 20"`).
- aud-004: aplicado (`vencimento: "dia 10"`).
- prod-150 (complemento.json): aplicado (`due_date: "dia 20"`).
- cli-002: aplicado (`vencimento: "dia 10"`).
- aud-054: aplicado (`due_date: "quinta"`, opção escolhida pelo controlador).
- aud-008: aplicado (`categoria_destino: "8 a 12 meses"`).
- prod-002: aplicado (`categoria: "13 a 24 meses"`).
- prod-046: aplicado (`lote: "lactação"`).
- cli-030, aud-050: aplicado (campo `category` removido).
- cli-032: aplicado, gabarito trocado para `registrar_servico_prestado`
  (opção escolhida pelo controlador).
- adv-006: aplicado, gabarito trocado para `cadastrar_servico_ordem` (opção
  escolhida pelo controlador).
- cli-023: aplicado (texto reescrito para "entraram mais 4 vacas no leite").
- cli-038: aplicado (texto reescrito com "do leilão da cooperativa..." e campo
  `evento` acrescentado).
- prod-047: aplicado, ganhou o segundo pedido
  `registrar_entrada_confinamento` (categoria vaca, quantidade 2).
- adv-026, adv-030: aplicado, `esperado` reduzido ao pedido de negócio/consulta
  proposto (removido o `ambigua` que só existia por desalinhamento de posição).
- prod-054: aplicado (texto com "... e gastei 60 litro de diesel"; gabarito não
  mudou porque `registrar_combustivel_servico.quantidade` não carrega unidade).
- prod-134 (complemento.json): aplicado (texto reescrito, gabarito sem
  mudança pelo mesmo motivo).
- prod-041: aplicado, campo `data` removido do segundo pedido
  (`registrar_entrada_lactacao`).
- conv-030: aplicado, conta trocada para "tenho que pagar o veterinario, 350,
  dia 25" e passo 2 `grava: pode`.
- conv-004: aplicado (passo 3 `grava: pode`).
- adv-034, adv-039, adv-036, conv-031: aplicado (`grava: pode` no passo
  apontado).

## Menor

- prod-084, prod-106: mantido (opção do juiz; pontuador já trata "uma" = 1).
- cli-026: mantido, mas com a marcação de coincidência ("literal") que faltava
  independente da disputa de valor.
- prod-070, aud-007, aud-040: aplicado, campo `data` removido desses pedidos.
- prod-015, prod-144 (complemento.json): aplicado, `confinamento` removido do
  segundo pedido (`registrar_alimentacao_confinamento`).
- prod-054/134/137/141: mantido (correferência aceita, por instrução do
  controlador).
- prod-053, aud-045: mantido (inferência inequívoca, por instrução do
  controlador).
- prod-055: aplicado (texto trocado para "o pedro e mais 1 trabalharam...",
  campo `quem: "Pedro"` acrescentado).
- prod-023, aud-021: aplicado, `tipo_evento` removido.
- prod-028: aplicado, `data` removida do uso de estoque.
- prod-040: aplicado (texto "comprei o arame farpado, deu 800, foi a prazo").
- adv-013: aplicado (`categoria: "13 a 24 meses"`).
- adv-004: aplicado (texto "... e vende os bezerros, nao, a venda deixa pra
  depois").
- adv-020, adv-021, adv-022: mantido (correção é no pontuador, fora do
  escopo destes arquivos).
- aud-032: aplicado (texto com "usei" no lugar de "gastei").
- cli-011: mantido (inequívoco, por instrução do controlador).
- aud-003: mantido (só registrar, por instrução do controlador).
- prod-057: mantido. O juiz ofereceu duas opções ("manter, ou texto novo") e o
  controlador não resolveu qual delas valia (só resolveu as demais opções da
  seção, uma por uma, e esta ficou de fora da lista). Tratado como as demais
  disputas "manter (opção)" do mesmo bloco, para não inventar um texto novo
  sem autorização explícita. Não recebeu marca de coincidência (não está em
  nenhuma das duas listas).
- prod-030, aud-027: aplicado, `contato: "vizinho"` acrescentado.
- prod-045: aplicado, `data: "essa semana"` acrescentada (data efetivamente
  dita no texto).
- prod-148 (complemento.json): aplicado, `data: "hoje"` acrescentada.
- conv-027: aplicado, "Joao" trocado por "Agropecuaria Santa Fe" no passo 1.
- conv-009: aplicado, passo 1 trocado para "tirei 6 machos do Confinamento
  Boa Vista".
- adv-045, adv-053: aplicado, "Pasto da Baixada" trocado por "Pasto da Sede".
- conv-022: aplicado, nomes trocados (passo 1 Zé Carlos, passo 2 Pedro).
- conv-026: aplicado, passo 2 trocado para "quanto tenho de diesel?" com
  `grava: nao`.
- conv-015 (item da lista): aplicado, passo 1 "arame farpado" trocado por
  "grampo".
- complemento.json (origem fora da encomenda): só registrado aqui, sem mudança
  de conteúdo.

## Duplicatas

Apagados exatamente como instruído:

- prod-125 (complemento.json), mantido prod-036 (produtor.json).
- prod-136, cli-040, mantido prod-068 (produtor.json).
- prod-155, mantido cli-017 (cliente.json).
- cli-036, mantido prod-032 (produtor.json).
- prod-149, mantido cli-016 (cliente.json).
- prod-110, mantido prod-082 (produtor.json).
- Quase duplicatas, apagadas as de complemento.json: prod-128, prod-121,
  prod-127, prod-131, prod-132, prod-142, prod-138, prod-104, prod-123
  (mantidos prod-071, prod-073, prod-037, prod-067, prod-076, prod-051,
  prod-060, prod-031, prod-003 e cli-014).
- "Manter uma" (prioridade produtor > audio > cliente, complemento sempre
  primeiro a sair):
  - prod-124/prod-087/aud-059/cli-031: mantido prod-087, apagados os outros
    três.
  - prod-153/prod-057/aud-047: mantido prod-057, apagados prod-153 e aud-047.
- Quase duplicatas entre autores, mantida uma de cada grupo:
  - prod-108/prod-078/aud-057 → mantido prod-078.
  - prod-113/aud-058 → mantido aud-058 (sem produtor.json no grupo).
  - prod-133/aud-022/prod-024 → mantido prod-024.
  - prod-151/aud-046 → mantido aud-046.
  - prod-157/aud-035/prod-038 → mantido prod-038.
  - prod-106/cli-032 → mantido cli-032 (sem produtor nem audio no grupo;
    complemento sai primeiro).
  - cli-021/prod-042/aud-038 → mantido prod-042.
  - cli-022/prod-043 → mantido prod-043.

Total apagado: 22 em complemento.json, 6 em audio.json, 5 em cliente.json (33
casos no total).

## Coincidência com exemplo

Aplicado `"coincide_com_exemplo": "literal"` ou `"molde"` em todo id das duas
listas que não foi apagado como duplicata (regra 4 do controlador). Ids
ignorados por terem sido apagados: prod-128, prod-133, aud-057, cli-021,
cli-022 (da lista "literal"); prod-104, prod-108, prod-110, prod-113,
prod-121, prod-127, prod-136, prod-142, prod-151, prod-153, prod-155,
aud-022, aud-038, aud-047, cli-031, cli-040 (da lista "molde").

Para conversa, a marca foi posta no caso inteiro (nível do objeto, não por
passo): conv-027 (literal); adv-042, conv-001, conv-023, conv-025 (molde).

Contagem final: 22 casos `literal`, 67 casos `molde`.

## Cobertura (casos novos)

`npm run avaliacao:validar` apontou 22 intenções com `POUCO` (total < 5).
Foram criados 30 casos novos em `complemento.json`, `prod-161` a `prod-190`,
autor `produtor`, tipo `mensagem`, sem marca de coincidência, cada um com
fazenda, pessoa ou frase que não repete nenhum caso existente nem os exemplos
citados na revisão:

| intenção | ids novos |
|---|---|
| ajustar_estoque | prod-161 |
| cadastrar_servico_ordem | prod-162 |
| calcular_cerca | prod-163, prod-164 |
| calcular_racao | prod-165 |
| calcular_sal | prod-166 |
| consultar_amanha | prod-167 |
| consultar_animal | prod-168 |
| consultar_cliente | prod-169, prod-170, prod-171 |
| consultar_lista_compra | prod-172, prod-173 |
| consultar_meu_dia | prod-174 |
| consultar_saldo | prod-175 |
| consultar_semana | prod-176 |
| definir_vacas_em_lactacao | prod-177 |
| encerrar_remessa_evento | prod-178, prod-179 |
| gerar_relatorio | prod-180, prod-181 |
| iniciar_servico | prod-182 |
| registrar_pagamento_trabalhador | prod-183 |
| registrar_peso | prod-184 |
| registrar_servico_contratado | prod-185 |
| registrar_servico_prestado | prod-186, prod-187 |
| registrar_vacina | prod-188 |
| remover_item_lista | prod-189, prod-190 |

Depois da criação, `npm run avaliacao:validar` fechou em zero `POUCO` (toda
intenção com `total >= 5`) e sem erro de intenção ou campo inválido.

## Contagem final por arquivo

| arquivo | casos | mensagens | conversas |
|---|---|---|---|
| produtor.json | 90 | 90 | 0 |
| complemento.json | 68 | 68 | 0 |
| audio.json | 54 | 54 | 0 |
| cliente.json | 35 | 35 | 0 |
| adversarial.json | 55 | 30 | 25 |
| conversa.json | 35 | 0 | 35 |
| **total** | **337** | **277** | **60** |
