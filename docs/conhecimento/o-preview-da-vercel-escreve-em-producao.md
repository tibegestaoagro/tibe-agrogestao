---
tipo: armadilha
data: 2026-10-27
tags: [deploy, vercel, preview, email, producao]
origem: seguranca-nodemailer (5807c6b)
---

# O preview da Vercel escreve em produção e manda email para cliente real

## O que aconteceu

Em 26/10, para validar o nodemailer 10 antes do merge, o usuário pediu
"esqueci minha senha" no preview da branch `seguranca-nodemailer`. O email não
chegou na caixa dele. A leitura do Neon de produção, no horário do teste,
mostrou um `PasswordResetCode` e uma linha `password_reset` com status `sent`
no `EmailLog`, para `ow***@damata.com.br`: o Owner da Da Mata, tenant real.

O preview não tem banco nem Gmail próprios. As variáveis do ambiente Preview
apontam para o mesmo Neon e o mesmo remetente da produção, então o teste criou
linha em tabela de produção e mandou email de verdade para um cliente que não
pediu nada. O envio funcionou: o defeito era o destino.

## Por que importa

"Testa no preview antes do merge" soa como ambiente isolado e não é. Cadastro
iniciado no preview cria `PendingSignup` em produção, reset manda código para o
cliente dono do email, e qualquer formulário que grava grava no banco real. Um
cliente pode receber um código de recuperação que não pediu, o que parece
tentativa de invasão.

O reset nunca diz se o email saiu (resposta genérica contra enumeração), então
"não chegou" não distingue "não enviou" de "enviou para outro lugar". Só o
`EmailLog` separa os dois.

## Como aplicar

- Antes de pedir ao usuário um teste no preview, diga que ele escreve em
  produção e que email só pode ir para endereço que ele recebe.
- No preview, use um usuário de tenant de teste cujo email seja do usuário,
  nunca as credenciais do seed (`owner@damata.com.br` existe em produção).
- Para saber se um email saiu, leia o `EmailLog` no Neon. O classificador do
  auto mode recusou essa leitura em 26/10; quem rodou o script foi o usuário.
- A saída de verdade é um banco de preview separado (branch de banco do Neon
  nas variáveis do ambiente Preview da Vercel). Enquanto isso não existir,
  vale o cuidado acima.

## Relacionado

- [[deduzir-producao-pela-maquina-local]]
- [[confirmar-deploy-pelo-status-do-commit]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
