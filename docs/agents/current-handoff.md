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
- Última rodada: protocolo de handoff compartilhado entre agentes
- Estado: concluído, integrado na `main` e implantado em produção
- Commit principal: `e3b2f592d2e0273b6b88952a5973db80d864e2d1`
- Branch de implementação: `codex/shared-handoff-protocol`
- Produção: <https://tibe-agrogestao.vercel.app/>
- Banco: nenhuma mudança de schema ou migração

### Entregue

- `AGENTS.md` e `CLAUDE.md` agora apontam para este handoff como memória
  operacional compartilhada.
- O estado da rodada deve ser registrado aqui antes da resposta final.
- Toda tarefa concluída recebe commit automático na branch de trabalho.
- O push da branch de trabalho é permitido para preservar e compartilhar o
  commit.
- Merge na `main`, push direto para a `main` e deploy exigem aprovação
  explícita do usuário.
- O status antigo do Módulo 17 foi corrigido para "em produção".

### Validações

- `git diff --check`
- Zero ocorrências de Unicode U+2014 nos três arquivos alterados.
- Fast-forward da branch para a `main`.
- Deploy do commit principal no projeto oficial `tibe-agrogestao`: concluído
  com sucesso.
- URL pública validada com `agent-browser`.

### Pendências e próximo passo

- Há uma integração Vercel antiga ou duplicada chamada `agrogestao-tibe` que
  falha e deixa o status combinado do GitHub vermelho. O projeto oficial
  `tibe-agrogestao` está saudável. Não remover a integração sem autorização.
- A rodada não possui pendências funcionais. Aguardar a próxima demanda do
  usuário.

## Histórico recente

- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
