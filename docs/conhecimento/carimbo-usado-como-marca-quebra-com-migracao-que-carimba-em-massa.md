---
tipo: armadilha
data: 2026-11-17
tags: [emporio, migracao, cartao, antecipacao]
origem: 3683fcb, prisma/migrations/20261117200000_emporio_conferir_cartao/migration.sql
---

# O carimbo usado como marca de identidade quebra quando uma migração carimba em massa

## O que aconteceu

Na frente B do Empório (17/11/2026), a antecipação pontual passou a carimbar as
parcelas dela com `reconciled_at = created_at` da operação. É essa igualdade
exata que `conferidaPelaAntecipacao` usa para saber que a conferência é da
antecipação, e que o desfazer da antecipação pode levá-la junto.

A migração da mesma frente (Q353) carimbava com `now()` toda parcela sem
carimbo com mais de 7 dias. Uma antecipação pontual antiga ganharia o carimbo
da migração, a igualdade deixaria de valer, e o desfazer passaria a recusar com
`ANTECIPACAO_CONCILIADA`. A suíte, o roteiro e o primeiro juiz não pegaram. O
segundo juiz achou lendo a migração junto com a regra.

## Por que importa

Um campo de data que serve de marca ("foi a operação X que gravou isto") é uma
regra escondida. Qualquer escrita em massa no campo apaga a marca em silêncio,
e o defeito só aparece meses depois, quando alguém tenta desfazer.

## Como aplicar

- Antes de uma migração escrever num campo, procure no código quem compara esse
  campo por igualdade (`getTime() ===`, `.equals`).
- Se houver marca, a migração grava o valor que a regra espera (aqui:
  `a."created_at"` da antecipação, com um UPDATE próprio antes do geral).
- Migração que ainda não foi para o Neon pode ser corrigida no próprio arquivo.
  Se ela já rodou no Docker, acerte o `checksum` em `_prisma_migrations` com o
  sha256 do arquivo novo, ou o `migrate status` local acusa a mudança.
- Teste de migração: rode os UPDATE do arquivo real numa transação desfeita no
  fim (seção 14c da `scripts/m121-emporio-conferir-cartao.test.ts`).

## Relacionado

- [[dado-herdado-invalido-trava-o-caminho-novo]]
- [[migrate-diff-le-o-env-e-o-env-e-producao]]
