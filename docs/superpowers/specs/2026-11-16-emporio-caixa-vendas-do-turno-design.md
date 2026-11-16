# Empório: vendas do turno no cartão do caixa (Q325)

Relato da Central do Milho em 14/11/2026 (prints e áudio fora do repositório):
"a soma dos caixas não tá somando o valor que foi vendido". Lido em produção:
as quatro vendas da LOJA MOC foram três fiados e um PIX de R$ 684,00 (que caiu
na conta PIX da loja). Nada foi em dinheiro, então a "Soma dos caixas" (dinheiro
em espécie na gaveta) mostrava R$ 0,00, corretamente. A tela do Caixa não
mostrava o total vendido em lugar nenhum: só o relatório impresso do
encerramento tinha as vendas por forma.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q325 | Cada caixa com turno aberto mostra **"Vendas do turno"**: o total que as vendas concluídas do turno receberam e a linha por forma (Dinheiro, PIX, Cartão, Cheque, Boleto, Fiado; só as que têm valor; os três cartões somam juntos). A venda cancelada sai; a troca (crédito) não entra. Sem venda: "Nenhuma venda neste turno ainda." O saldo do caixa vira "na gaveta: R$ ..." e o total da loja vira **"Dinheiro nas gavetas (só espécie)"** no lugar de "Soma dos caixas" | decisão do usuário (caminho 1): ver o vendido sem misturar com o dinheiro da conferência |

O saldo da gaveta e a conferência não mudam. A conta fica na action
(`viewsDosCaixas`, `src/lib/actions/emporio-caixa.ts`), e a API de caixa ganha
`turno_aberto.vendas` e `turno_aberto.vendas_total` (extensão aditiva,
documentada em `/docs/api`).

## Fora

Mudar o relatório do encerramento; mostrar vendas de turnos já encerrados na
tela do Caixa.

## Orientação à Central do Milho

Duas vendas foram lançadas como fiado porque as taxas da maquininha não estavam
cadastradas. Orientação enviada pelo usuário: cadastrar a adquirente e as taxas
em Configurações > Cartões e editar essas vendas trocando o pagamento para
cartão.
