# Teste de cliente: Meu Empório na Da Mata (Módulo 39, F0 a F5)

Roteiro para o Dilton usar o Empório **como um lojista usaria**, em produção,
com dados reais, do painel e do celular. As sete fases estão em produção desde
29/10/2026 e foram provadas por suíte e roteiro de navegador **só no banco
local**. Ninguém usou o Empório com dado real ainda: é para isso que este
roteiro existe.

O que procurar: o que confunde, o que falta para o dia a dia do balcão, conta
que não bate, tela que quebra no celular. Anote o bloco e o passo, e um print
quando for tela.

**Fora do teste, de propósito** (dívidas 2.15 a 2.27, em
[dividas.md](dividas.md)): Empório pelo WhatsApp, nota fiscal, importar por
planilha, estoque da fazenda cruzando com o da loja, crédito na loja na
devolução, taxa de cartão por parcela. Se sentir falta de algum, anote como
"faz falta", não como defeito.

---

## Bloco 0: ligar só para você (Plataforma)

1. Entre na Plataforma, abra a conta da **Da Mata** e o cartão **Recursos em
   teste**.
2. Ligue o **Meu Empório** com a lista contendo **só o seu usuário** (Owner).
3. Confira, num segundo usuário da Da Mata (se tiver um à mão), que o menu
   **não** mostra o Empório e o Meu Dia dele não muda.

Esperado: o menu ganha "Meu Empório" para você e para mais ninguém.

## Bloco 1: montar a loja (painel, computador)

1. `/emporio/estabelecimentos`: cadastre uma loja com o nome real.
2. Abra `/emporio`: o cartão **Primeiros passos** aparece com a loja. Siga os
   passos por ele, sem procurar menu.
3. `/emporio/produtos`: cadastre **de 5 a 8 produtos reais**, com
   apresentação e preço. Inclua pelo menos:
   - um vendido por saco e também a granel (quilo);
   - um que você compra em caixa e vende por unidade;
   - um com estoque mínimo.
4. `/emporio/estoque`: lance o estoque inicial, com custo.
5. `/emporio/caixa`: informe o saldo da gaveta, a conta Pix e a taxa da
   maquininha de cartão.
6. `/emporio/despesas`: uma despesa fixa (aluguel ou funcionário) e uma regra
   do "Vendeu, Pagou" (comissão ou frete por venda).

Esperado: o cartão Primeiros passos vai marcando cada item e some quando os
essenciais terminam.

## Bloco 2: um dia de balcão (celular)

Faça tudo do celular, em `/emporio/vender`, como se o cliente estivesse na
sua frente:

1. Venda em **dinheiro** com troco.
2. Venda no **Pix**.
3. Venda no **cartão** (débito e crédito).
4. Venda **fiado** para um cliente com nome.
5. Venda com **dois jeitos de pagar** na mesma conta (parte dinheiro, parte
   cartão).
6. Uma **devolução** de um item de uma venda anterior (`/emporio/vendas`).
7. Um **recebimento de fiado** (`/emporio/fiado`).
8. No fim do dia, a **conferência do caixa** (`/emporio/caixa`), contando a
   gaveta de verdade.

Esperado: o balcão não rola para o lado, o teclado numérico abre nos campos de
valor, e a conferência bate com o que entrou.

**Decisão a confirmar neste bloco:** o balcão abre como **página inteira**,
não como o painel lateral do resto do sistema. Diga se assim está bom no
celular.

## Bloco 3: o dia seguinte (painel e celular)

1. **Meu Dia**: o cartão **Seu Empório** (vendas de hoje, fiado a receber), o
   aviso de reposição e o caixa de ontem.
2. `/emporio/resultado`: o Resultado da Loja do dia e do mês, com a margem e o
   ponto de equilíbrio. A conta tem que fazer sentido para você.
3. **Financeiro** com o filtro **Empório**, depois **Fazenda**, depois
   **Tudo**: a fazenda não pode ter mudado por causa da loja.
4. Uma **compra** de fornecedor (`/emporio/compras`) com frete: o custo
   médio do produto tem que subir ou descer como você espera.

## Bloco 4 (opcional): o que vende feito na loja

1. Na **Calculadora** de receitas, calcule uma mistura e use **Criar
   composição desta receita** para um produto do Empório.
2. Registre uma produção e veja o estoque dos ingredientes cair.
3. Se tiver duas lojas: uma **transferência** (`/emporio/transferencias`).

---

## Ao terminar

Mande a lista do que estranhou, por bloco. A sessão que receber faz a
triagem: defeito vira correção numa branch nova, "faz falta" vira conversa
sobre escopo. Para desligar o teste a qualquer momento, basta tirar seu
usuário da lista no cartão Recursos em teste: os dados ficam guardados.
