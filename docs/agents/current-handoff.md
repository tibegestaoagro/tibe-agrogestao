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

- Atualizado em: 2026-07-29
- Última rodada: Módulo 17, Agenda com custo
- Estado: concluído, integrado na `main` e implantado em produção
- Spec: `docs/specs/module-17-agenda-com-custo.md`
- Commit: `b3c72ccfcb2f4ab10a9a5688e144eaf4fd982da5`
- Branch de implementação: `codex/module-17-agenda-com-custo`
- Produção: <https://tibe-agrogestao.vercel.app/>
- Banco: nenhuma mudança de schema ou migração
- Workspace: protocolo de handoff compartilhado criado em `AGENTS.md`,
  `CLAUDE.md` e neste arquivo, na branch
  `codex/shared-handoff-protocol`, aguardando aprovação para merge/deploy

### Entregue

- Agenda do WhatsApp com agendamentos, vacinações e colheitas reais.
- Previsão de vacinação persistida como despesa pendente em `FinancialEntry`.
- Conciliação da previsão com o custo real sem duplicar despesa.
- Reagendamento com descarte seguro do alerta pendente antigo e rearme pelo
  cron.
- Proteção de concorrência com transações serializáveis e teste determinístico.

### Validações

- `npm run test:m17`
- `npm run test:m3`
- `npm run test:m4`
- `npm run test:m11`
- `npm run test:m12`
- `npm run build`
- Auditoria final de spec: 10/10, sem achados pendentes.
- Auditoria final de padrões: 9,7/10, sem achados pendentes.
- Deploy oficial `tibe-agrogestao`: concluído com sucesso.
- URL pública validada em navegador.

### Pendências e próximo passo

- Há uma integração Vercel antiga ou duplicada chamada `agrogestao-tibe` que
  falha e deixa o status combinado do GitHub vermelho. O projeto oficial
  `tibe-agrogestao` está saudável. Não remover a integração sem autorização.
- Não iniciar o próximo módulo sem demanda e aprovação explícitas do usuário.

## Histórico recente

- 2026-07-29: criado o protocolo de memória compartilhada entre Codex e Claude
  Code, incluindo commit automático por tarefa e aprovação obrigatória apenas
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
