---
tipo: design
data: 2026-11-09
modulo: 39 (Meu Empório)
origem: decisão do usuário em 09/11 ("faça o que você pode sem esperar ninguém"); dívidas 2.45, 2.46, 2.50, 2.54, 2.61, 2.63 e o alerta do GitGuardian; decisões Q268 a Q274
---

# Meu Empório: relatórios do dinheiro, exportação e limpeza

Rodada sem dependência de ninguém: o que a Agromax usa todo dia nos
relatórios, o que ficou aberto das entregas do cartão e a troca do email do
seed num repositório público. As decisões entram na tabela de
`docs/specs/module-39-meu-emporio.md` como **Q268 a Q274**.

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| Q268 | **Faturamento por origem (2.54):** o relatório de vendas (`relatorioDeVendasAction`, `GET /reports/sales`, tela `/emporio/relatorios`) ganha `by_origin`: uma linha por origem (`balcao`, `ecommerce`) com quantidade de vendas, valor líquido (`net_amount`, o faturamento), frete (`freight_amount`) e participação % no valor; a mesma quebra por loja quando o relatório é de todas as lojas. Venda de troca conta zero na quantidade e soma no valor, como já é o relatório. | A marca de origem existe desde 09/11 e o e-commerce é lançado à mão: o dono quer saber quanto o e-commerce fatura sem misturar o frete. |
| Q269 | **Exportar os relatórios do dinheiro (2.46) em planilha:** as três rotas de relatório (`receivables-aging`, `payables-by-due`, `cash-by-place`) e a da projeção (`projection`) aceitam `format=csv` e devolvem `text/csv; charset=utf-8` com BOM, separador `;`, decimal com vírgula e datas DD/MM/AAAA (o Excel em português abre sem ajuste), com os mesmos filtros e a mesma permissão do JSON; nome do arquivo no `Content-Disposition` (`a-receber-por-idade-AAAA-MM-DD.csv`). | O Excel brasileiro abre `;` com vírgula decimal direto; a planilha é o que o contador e o dono pedem. |
| Q270 | **Exportar em PDF (2.46) pela página de impressão:** `/emporio/imprimir/relatorio/<tipo>` (no grupo `(impressao)`, como recibo, romaneio e turno), com os filtros na URL, cabeçalho da loja e data de emissão, e o botão "Imprimir ou salvar em PDF" do navegador. Sem gerador de PDF no servidor. | É o caminho que o Empório já usa para recibo, romaneio e turno; não traz dependência nova. |
| Q271 | **Gráfico do fluxo projetado (2.45):** linha do saldo projetado por semana acima da tabela (que segue como leitura acessível), com Recharts, nos tokens de cor do kit; semanas com saldo negativo em destaque. | A tabela mostra os números; o gráfico mostra quando o dinheiro aperta. |
| Q272 | **Custo efetivo do cartão (2.61):** o Resultado ganha `card_cost: { card_sales, mdr, anticipation, pct }`: vendas pagas no cartão no mês (soma dos pagamentos `debito`, `credito_vista`, `credito_parcelado` das vendas concluídas), a taxa da transação e o custo de antecipação do mês, e `pct` = (taxa + antecipação) / vendas no cartão × 100 (nulo sem vendas no cartão). A tela mostra "Custo do cartão: X% das vendas no cartão". | É o número que diz se a maquininha está cara; os dois custos já existem, falta o indicador. |
| Q273 | **Contas sem vencimento (2.50):** a projeção e o a pagar por vencimento listam à parte as contas pendentes sem `due_date` ("Sem vencimento", com quantidade e total), em vez de deixá-las de fora sem aviso. | Conta esquecida é pior que conta atrasada. |
| Q274 | **Email do seed (alerta do GitGuardian):** o owner do seed passa de `owner@damata.com.br` para `owner@example.com` (domínio reservado, não pode ser de empresa real) em `prisma/seed.ts`, nos scripts, roteiros, cenários e docs vivos (o histórico em `docs/agents/historico/` e os planos antigos ficam como foram escritos); o banco local é atualizado por script (`UPDATE` do email no Docker). A senha de dev segue a mesma. O email antigo não existe em produção (conferido em 06/11). | O par email de empresa mais senha na documentação pública é o provável alvo do alerta; um domínio reservado deixa claro que é dado de exemplo. |

**Limpeza da dívida 2.63 (sem decisão de produto):** um tipo só para a regra
de dia útil e para a configuração da adquirente; a fórmula do % efetivo ao
mês da antecipação numa função pura usada pela action e pela tela; o cursor
`before` dos pedidos decididos com desempate por `id`; a lista de
antecipações com cursor e, filtrada por loja, com os totais só das parcelas
daquela loja; a checagem de taxa vigente antes de arquivar a adquirente
dentro da transação. O item "vendedor vê o líquido efetivo" fica: é decisão do
usuário.

## Fora deste documento

- 2.60 (feriado estadual e municipal): a liquidação segue o calendário
  bancário nacional; sem caso real, fica.
- 2.62 (despesa de taxa por adquirente): muda o modelo da despesa; fica para
  quando houver venda com duas adquirentes.
- 2.52, 2.53, 2.39, 2.40: próxima rodada.

## Entrega

Branch `emporio-relatorios-e-limpeza`: suíte nova (`test:m105`) mais
`test:all`, isolamento, roteiro de navegador nos dois sentidos, manual,
`/docs/api`, dívidas e handoff. Sem migração (nenhum campo novo no banco).
Sonnet implementa e revisa. Merge, push na `main` e deploy só com
autorização na conversa.
