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

- Atualizado em: 2026-07-31
- Última rodada: análise dos documentos do cliente e plano de arquitetura
- Estado: documentação entregue; **Onda 1 de agentes em execução**
- Banco: nenhuma mudança nesta rodada (o agente A1 vai criar `RefreshToken`)

### Entregue nesta rodada

- `docs/cliente/`: entendimento do produto, plano de ação e estratégia de canal,
  escritos para serem lidos pela Agromax. Documentos de origem versionados em
  `docs/`.
- `docs/arquitetura/plano-separacao-e-mobile.md` e `onda-1-briefings.md`.
- Configuração de exportação em PDF dos documentos de cliente.

### Achados que continuam abertos

1. **Rebanho:** o cliente pediu por CATEGORIA e listou controle por brinco como
   fora da v1. Construimos o inverso. Recomendação aceita pelo usuário
   (categoria padrão, individual opcional) mas **ainda sem confirmação da
   Agromax**. Bloqueia a Onda 3.
2. **Meta cobra mensagem de serviço dentro da janela a partir de 01/10/2026.**
   Verificação do negócio na Meta precisa começar em agosto: é o item de maior
   prazo e menor esforço nosso.
3. **Fragmentação de resposta** (uma mensagem por assunto) foi implementada
   antes de sabermos da cobrança e agora trabalha contra o custo. Reverter.

### Onda 1 em execução (3 agentes, branches próprias, nada na `main`)

| Agente | Branch | Entrega |
|---|---|---|
| A1 | `agente/a1-token-auth` | Token de acesso para mobile (caminho crítico) |
| A2 | `agente/a2-contratos` | `packages/contracts` com schemas Zod |
| A3 | `agente/a3-pwa` | PWA instalável, sem push |

Briefings completos em `docs/arquitetura/onda-1-briefings.md`. O A4 (sistema de
design com a identidade de `docs/idVisual/`) foi movido para a Onda 3.

### Pendências e próximo passo

- Integrar a Onda 1 só depois do checkpoint: aplicativo autentica com token e
  lê uma rota protegida real.
- `MOBILE_JWT_SECRET` existe no `.env` local; **falta na Vercel** antes do deploy.
- Confirmações pendentes da Agromax: modelo de rebanho, destino da Lavoura,
  prioridade entre Calculadora/Máquinas/Meu Dia, e validação técnica dos
  conteúdos das calculadoras.

## Histórico recente

- 2026-07-31: análise dos documentos do cliente, plano de arquitetura por
  contrato e disparo da Onda 1 de agentes.
- 2026-07-30: N8N auditado (já estava provisionado e ativo), prompt do
  classificador alinhado ao M17 e alerta por WhatsApp passando a sair direto
  pelo Tibé. Commits `8204e9b` e `31f54c0`.
- 2026-07-30: Módulo 19 (cadastro verificado em 4 etapas) concluído, migrado no
  Neon, integrado na `main` e implantado em produção no commit `db491bd`.
- 2026-07-30: limite de assentos por plano concluído, integrado na `main` e
  implantado em produção no commit `7e52563`.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
