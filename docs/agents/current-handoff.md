# Handoff compartilhado do Tibé

Este arquivo é a memória operacional curta e versionada do projeto. Codex,
Claude Code e qualquer outro agente devem lê-lo depois de `AGENTS.md` ou
`CLAUDE.md`.

## Protocolo de manutenção

- Atualize este arquivo ao encerrar cada módulo ou rodada significativa.
- Registre apenas fatos verificados, nunca planos tratados como concluídos.
- Informe estado, escopo entregue, validações, commit/deploy, pendências e
  próximo passo autorizado.
- Substitua a seção "Estado atual" a cada rodada. Mantenha no histórico apenas
  as cinco rodadas mais recentes, com uma linha por rodada.
- Não salve segredos, credenciais, transcrições da conversa ou detalhes que já
  estejam claros na spec, no código ou no commit.
- Toda tarefa concluída recebe commit automático na branch de trabalho, com o
  handoff incluído no mesmo commit sempre que possível.
- O push da branch de trabalho é permitido. Merge na `main`, push direto para
  a `main` e deploy exigem aprovação explícita do usuário.

## Estado atual

- Atualizado em: 2026-07-30
- Última rodada: limite de assentos por plano
- Estado: implementado e testado localmente, commitado na branch de trabalho.
  Aguardando aprovação para merge na `main` e deploy.
- Branch de implementação: `claude/limite-assentos-plano`
- Banco: nenhuma mudança de schema ou migração

### Entregue

- `PLAN_SEATS` (campo 1, fazenda 2, grupo 5) em `src/lib/asaas.ts`, ao lado de
  `PLAN_PRICES`, servindo regra de negócio e vitrine da mesma fonte.
- `src/lib/seats.ts`: `getSeatUsage`, `checkSeatAvailable`, `seatLimitMessage`.
- Limite aplicado em `inviteUserAction` e `setUserActiveAction(true)` com
  `SEAT_LIMIT_REACHED` (422). O Owner ocupa assento; usuário desativado libera
  assento; o limite nunca desativa ninguém retroativamente (só bloqueia convite
  novo e reativação).
- No convite, a duplicidade de email é checada antes do limite, para não
  mandar o cliente fazer upgrade por causa de um email já existente.
- `GET /api/v1/users` ganhou `meta.seats` (extensão aditiva).
- Tela de usuários mostra "N de M assentos em uso" e alerta quando cheio.
- `/planos` mostra os assentos de cada plano, derivados de `PLAN_SEATS`.
- `/docs/api` atualizada nos três endpoints afetados.

### Validações

- `npm run test:m18` (novo, 18 asserções): 0 falhas.
- `npm run test:m5` (regressão, assinaturas dos dois actions mudaram):
  0 falhas.
- `npm run build` (lint + tsc + compilação): sucesso.
- Não validado em navegador real ainda.

### Pendências e próximo passo

- Aguardando aprovação do usuário para merge na `main` e deploy.
- Há uma integração Vercel antiga ou duplicada chamada `agrogestao-tibe` que
  falha e deixa o status combinado do GitHub vermelho. O projeto oficial
  `tibe-agrogestao` está saudável. Não remover a integração sem autorização.
- **Próxima demanda já acordada com o usuário:** cadastro público em 4 etapas
  com verificação de WhatsApp e email antes de criar a conta. Decisões já
  fechadas: `Tenant`/`User` só nascem depois das duas verificações (dados
  ficam em uma tabela nova `PendingSignup`, com expiração e limpeza, para não
  contaminar os KPIs do painel da plataforma nem travar o CPF/CNPJ de quem
  abandona); dois campos de nome (empresa e responsável) mantidos, porque
  planos com equipe precisam de `User.name` e telefone por usuário; código de
  6 dígitos com hash, validade de 10 minutos, opção de corrigir o número aos 2
  minutos, máximo 5 tentativas, e limite de reenvio por destino e por origem
  (a rota dispara WhatsApp sem login, então sem limite vira ferramenta de
  perturbação). Ainda em aberto: o que fazer quando um canal verifica e o
  outro falha, o modelo de sessão ("manter conectado" de 1 semana) e o formato
  da troca da senha temporária.

## Histórico recente

- 2026-07-30: limite de assentos por plano implementado e testado na branch
  `claude/limite-assentos-plano`, aguardando merge e deploy.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
