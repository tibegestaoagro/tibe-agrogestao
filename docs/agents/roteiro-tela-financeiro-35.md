# Roteiro de tela: Financeiro, fase 35.1

O que **só** o navegador prova. O servidor já foi validado por requisição
autenticada em 10/09/2026 (rótulos, colunas, situações derivadas, filtro por
fazenda, o aviso dos lançamentos sem fazenda, e o ciclo de pagamento pela API).
Falta o comportamento que vive no JavaScript do painel.

## Preparo, uma vez

```
docker start tibe-pg tibe-redis
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx tsx scripts/_cenario-financeiro-35.ts
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run dev
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx tsx scripts/_sessao-local.ts
```

O último comando imprime o cookie. Cole o valor inteiro em `document.cookie` no
console de `http://127.0.0.1:3000` e recarregue. Nenhuma senha é digitada, que
é a regra deste agente.

O cenário monta quatro contas: uma venda de 20.000 com 8.000 recebidos, uma
compra de 10.000 vencida há doze dias, uma diária de 900 já paga, e um insumo
de 1.500 **sem fazenda**, que é o que dispara o aviso do filtro.

## O que olhar

| # | passo | o que precisa acontecer |
|---|---|---|
| 1 | Abrir `/financeiro` e clicar em "Receber" na venda de 20.000 | O painel abre com "Valor da conta 20.000", "Recebido 8.000", "A receber 12.000", e o campo de valor **já preenchido com 12.000** |
| 2 | No mesmo painel, olhar a lista de baixo | O recebimento de 8.000 aparece com a data e a forma (PIX) |
| 3 | Digitar 13.000 e registrar | A recusa aparece **embaixo do campo do valor**, dizendo "Falta receber apenas R$ 12.000,00", e o foco vai para o campo. Se ela aparecer no rodapé do painel, o `field` não atravessou |
| 4 | Corrigir para 5.000 e registrar | O painel continua aberto, o saldo vira 7.000, e a lista ganha a linha nova |
| 5 | Clicar em "Desfazer" nessa linha | O saldo volta para 12.000 e a linha some |
| 6 | Fechar e olhar a linha na tabela | Situação "Parcialmente recebida", e embaixo do valor o texto "recebido R$ 8.000,00, falta R$ 12.000,00" |
| 7 | Trocar a fazenda no seletor do topo | A tabela, os cards e o gráfico mudam juntos, e aparece o aviso de que 1 lançamento sem fazenda ficou de fora |
| 8 | Abrir "Novo lançamento" e escolher Despesa | O seletor de categoria só habilita depois do tipo, e lista as **de despesa**. Escolher Receita troca a lista e limpa a categoria |
| 9 | Escrever "combustível do trator" nas observações | A categoria se preenche sozinha com "Combustíveis" (a sugestão só vale se o tenant tiver a categoria) |
| 10 | Abrir no celular, ou estreitar a janela para ~400px | A tabela rola na horizontal sem estourar a página, e o painel de pagamento continua usável |

## O que este roteiro NÃO cobre

O agente do WhatsApp. `npm run wa` conversa com **produção**, e nada desta fase
está lá. A categoria vinda do banco e o pasto ambíguo só podem ser provados
contra o agente depois do deploy.
