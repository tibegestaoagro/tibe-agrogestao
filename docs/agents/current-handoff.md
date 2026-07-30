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
- Última rodada: Módulo 19, cadastro público verificado em 4 etapas
- Estado: concluído, integrado na `main` e implantado em produção
- Commit principal: `db491bd`
- Branch de implementação: `claude/cadastro-verificado` (fast-forward na `main`)
- Produção: <https://tibe-agrogestao.vercel.app/>
- Banco: migração `20260730120000_pending_signup` aplicada no Docker local e
  **também no Neon** (`prisma migrate status` confirma "up to date").
- Spec: `docs/specs/module-19-cadastro-verificado.md`

### Entregue

- `PendingSignup` (modelo novo, fora de `TENANT_SCOPED_MODELS` por necessidade
  estrutural) e a migração correspondente.
- `src/lib/actions/signup-flow.ts`: start, verify, resend, state e purga.
- Rotas `POST /api/v1/signup/{start,verify,resend}` e `GET .../state`. A rota
  antiga `POST /api/v1/signup` (um passo) foi **removida**.
- Páginas `/criar-conta` (sem senha), `/criar-conta/whatsapp` e
  `/criar-conta/email`, com contador de 2 minutos e correção de destino.
- Id do cadastro em cookie httpOnly (`src/lib/signup-cookie.ts`).
- `dispatchEmail()` (envio sem `EmailLog`, só para o código pré-tenant) e dois
  templates novos.
- Troca voluntária de senha com senha atual: action, rota
  `/api/v1/auth/change-password-self`, página `/configuracoes/senha` (aberta a
  qualquer papel) e item de menu.
- Sessão de 7 dias nas duas instâncias NextAuth.
- Purga de cadastros vencidos no cron diário existente.
- `/docs/api` atualizada (rotas novas, remoção da antiga, e as duas rotas de
  troca de senha que não estavam documentadas).

### Validações

- `npm run test:m19` (novo, 37 asserções): 0 falhas.
- Regressão: `test:m5` (ajustado, usava a rota removida), `test:m16`,
  `test:m18`, `test:m10`, `test:m13`: 0 falhas.
- `npm run build` (lint + tsc + compilação): sucesso.
- `test:m4` teve **1 falha transitória** numa execução, não reproduzida em 5
  execuções seguintes nem em 2 execuções com as mudanças removidas (`git
  stash`). Causa provável: o lock diário do cron no Redis é compartilhado entre
  execuções e o teste afirma "1ª chamada do dia executa". Não atribuível a esta
  rodada, mas fica registrado.
- Validado ponta a ponta em navegador real (local, `browser-harness`): campo de
  senha ausente na etapa 1; máscara de telefone e email; contador de 2 minutos;
  código errado recusado sem vazar informação; **com apenas um canal verificado
  o `Tenant` ainda não existe no banco**; conclusão criando a conta, apagando o
  pendente, logando automaticamente e caindo no gate de troca de senha; senha
  fraca recusada pela regra forte; `/configuracoes/senha` exigindo a senha atual
  (errada recusada, correta aceita).
- O rate limit de envio disparou de verdade durante o teste (o telefone já
  tinha sido gasto pelos testes automatizados): a proteção funciona entre
  processos, via Redis.
- Produção verificada após o deploy: `POST /api/v1/signup/start` responde 422 a
  corpo vazio, `POST /api/v1/signup` (antiga) responde 404, e a página serve o
  formulário novo sem campos de senha.
- **Entrega real dos códigos VERIFICADA em produção pelo usuário** (2026-07-30):
  cadastro completo com WhatsApp e email pessoais, todas as telas corretas e os
  dois códigos chegando. O `PendingSignup` foi apagado corretamente ao concluir
  (0 registros em aberto na base de produção depois do teste). O tenant gerado
  nesse teste foi removido a pedido do usuário, para não contaminar os KPIs do
  painel nem travar o CPF/CNPJ e o email dele.
- Nota do teste local anterior: O banco local não tem provider
  WhatsApp, então os códigos foram injetados para exercitar a máquina de
  estados. O envio de verdade só se confirma com um cadastro real em produção.

### Pendências e próximo passo

- A rodada não possui pendências funcionais: o fluxo foi validado ponta a ponta
  em produção, com entrega real dos códigos.
- Lembrete de risco operacional: a rota antiga de um passo foi removida, então o
  cadastro público depende inteiramente da Evolution e do canal de email. Se
  algum dos dois cair, não existe caminho alternativo de criação de conta.
- A Evolution é provisória (ambiente de desenvolvimento) e o Gmail SMTP tem
  reputação frágil: o usuário informou que o Resend com domínio próprio entra
  antes de o projeto ir ao ar de fato.
- A fragilidade do Gmail SMTP na etapa 3 continua: o usuário informou que o
  Resend com domínio próprio entra antes de o projeto ir ao ar.
- Há uma integração Vercel antiga ou duplicada chamada `agrogestao-tibe` que
  falha e deixa o status combinado do GitHub vermelho. O projeto oficial
  `tibe-agrogestao` está saudável. Não remover a integração sem autorização.

## Histórico recente

- 2026-07-30: Módulo 19 (cadastro verificado em 4 etapas) concluído, migrado no
  Neon, integrado na `main` e implantado em produção no commit `db491bd`.
- 2026-07-30: limite de assentos por plano concluído, integrado na `main` e
  implantado em produção no commit `7e52563`.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
