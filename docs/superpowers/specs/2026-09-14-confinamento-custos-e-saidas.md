# Confinamento: custo avulso e os destinos de saída (dívida 2.8)

Data: 2026-09-14. Origem: `docs/agents/dividas.md` §2.8 e o documento do cliente
`docs/area-funcional-confinamento/Área Funcional Confinamento.docx` (§13, §14,
§17 a §21).

## Estado antes desta frente (auditado em 14/09)

- `getConfinementLotSummary` (`src/lib/actions/confinement.ts`) já soma toda
  despesa com `related_id` igual ao lote. **Nenhuma tela grava essa ligação**:
  o formulário do Financeiro não oferece o campo, então a ração lançada lá não
  chega ao lote.
- `closeStay` (`src/lib/actions/herd-stays.ts`) aceita três saídas para
  confinamento e boitel: `retorno_estadia` (sempre para a fazenda de ABERTURA),
  `venda` e `morte`.
- **Achado da auditoria:** a venda de uma estadia grava só a receita, pelo
  livro-razão. Não cria `Negotiation` nem guarda comprador, e o §19 pede que a
  venda "seja registrada em Negociações".

## Decisões do usuário (14/09/2026)

1. **Custo avulso:** botão "Registrar custo" na tela do lote. O formulário
   rápido do Financeiro não muda.
2. **Venda vira negociação, com comprador opcional.** "Frigorífico" não é
   destino próprio: é essa venda, com o frigorífico como comprador.
3. **Destinos que entram:** outra fazenda, outro confinamento, leilão ou feira,
   e outro destino.
4. **Outro destino:** as cabeças saem do rebanho como `ajuste`, com o motivo
   digitado pelo produtor obrigatório. Sem receita.

## Desenho

Tudo passa por `closeStay`, numa transação só. O destino ganha campos
aditivos; `movement_type` continua sendo o que as regras de
`src/lib/herd/stay-rules.ts` conferem.

| destino na tela | `movement_type` | campos novos | efeito |
|---|---|---|---|
| Voltaram ao pasto | `retorno_estadia` | `property_id` opcional | volta para a fazenda escolhida (antes: só a de abertura) |
| Vendidos | `venda` | `contact_id`/`contact_name`, `pago`, `due_date` | cria `Negotiation` `venda_gado`; receita pela negociação, não pelo livro-razão |
| Morreram | `morte` | | igual |
| Outro confinamento | `retorno_estadia` + abertura | `confinement_site_id` | volta à fazenda do confinamento de destino e abre lote novo lá, no mesmo instante; a contagem de dias recomeça |
| Leilão ou feira | `retorno_estadia` + remessa | `evento` (nome, tipo, organizador) | volta à fazenda e abre a remessa de evento do Módulo 31, missão 3 |
| Outro destino | `ajuste` | `reason` obrigatório | sai do rebanho, com o motivo no histórico |

- `ajuste` entra em `encerramentos` de `confinamento` e `boitel`.
- A abertura do lote novo e a da remessa precisam rodar DENTRO da transação do
  encerramento: as duas actions ganham uma versão que recebe o `tx`.
- A venda com negociação vale para toda estadia que passa por `closeStay`
  (pasto de terceiro e boitel inclusive): é um caminho de código só.
- O WhatsApp continua funcionando sem mudança: a venda dele não informa
  comprador, e o comprador é opcional.

## Tarefas

1. Custo avulso: action, rota e botão no lote.
2. Outra fazenda no retorno.
3. Outro destino (`ajuste` com motivo).
4. Venda como negociação, com comprador.
5. Outro confinamento.
6. Leilão ou feira.
7. Suíte, trava provada falhando, e tela.
