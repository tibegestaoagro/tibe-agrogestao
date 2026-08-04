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

- Atualizado em: 2026-08-04
- Última rodada: **Módulo 29, "Minha Fazenda"**. O usuário pediu para "dar um
  passo atrás" no meio do trabalho de app mobile e ler um documento
  funcional do cliente sobre organizar o sistema por fazenda/pasto, antes de
  continuar (web e app compartilham essas regras). Lido, resumido,
  ambiguidades resolvidas com o usuário via `AskUserQuestion`, e V1
  implementada nesta mesma rodada: schema (`Property.city/district`, model
  `Pasture` novo), API (`/api/v1/pastures/*`, `/api/v1/properties` com
  validação mais estrita), tela nova `/minha-fazenda` (web), reestruturação
  de navegação (grupo "Minha Fazenda" virou "Operação", "Minha Fazenda" é
  agora a tela nova). WhatsApp e vínculos futuros (tarefa/despesa por pasto)
  ficam para uma rodada seguinte. Detalhes completos em
  [docs/specs/module-29-minha-fazenda.md](../specs/module-29-minha-fazenda.md).
  App mobile continua pausado no ponto em que estava (ver histórico).
- Produção: nenhuma mudança nesta rodada (ainda não houve push/deploy desde
  o handoff anterior). `https://tibe-agrogestao.vercel.app/` segue em
  `de693bf` (layout completo) + `acc89a5` (mobile parte 1).
- Banco: migração nova aplicada no Docker local
  (`prisma/migrations/20260804120413_minha_fazenda_pasture/`), **ainda não
  aplicada no Neon de produção** (exige aprovação do usuário antes de rodar
  em produção, por protocolo).

### Entregue nesta rodada (Módulo 29: Minha Fazenda)

- **Schema**: `Property` ganhou `city`/`district` (município/distrito),
  nullable no banco, obrigatório só na validação de criação. Model novo
  `Pasture` (tenant-scoped, `property_id`/`name`/`area_hectares`/
  `archived_at`), sem relação com `Plot`/Talhão (domínios diferentes).
  Migração `20260804120413_minha_fazenda_pasture` aplicada no Docker local.
- **API**: `POST /api/v1/properties` agora exige `city` e `area_hectares`
  maior que zero (único ponto do código que cria `Property`, confirmado
  antes de apertar a validação: nenhum `test:mX` afetado, todos criam via
  Prisma direto). Rotas novas `/api/v1/pastures` (GET/POST),
  `/api/v1/pastures/:id` (PATCH), `/api/v1/pastures/:id/archive` (POST),
  todas devolvendo `meta.area_summary` (soma dos pastos x área total).
- **UI**: tela nova `/minha-fazenda` (fazenda selecionada por
  `?property_id=`, detalhes editáveis, resumo de área com aviso quando a
  soma dos pastos ultrapassa o total, lista de pastos com criar/editar/
  desativar). Botão "Propriedades" antigo (dentro de Rebanho) removido;
  Rebanho/Máquinas/Lavoura apontam para a tela nova no estado vazio.
- **Navegação**: grupo da sidebar antes chamado "Minha Fazenda"
  (Rebanho/Máquinas/Lavoura/Prestador/Financeiro/Alertas) renomeado para
  **"Operação"**; "Minha Fazenda" é agora um link de primeiro nível para a
  tela nova. Decisão do usuário, não dedução minha (conflito de nome entre
  o layout implementado horas antes e o documento do cliente).
- **Aviso de soma não bloqueia salvar** (decisão do usuário, confirma
  leitura literal do documento do cliente).
- **Fora desta rodada, deliberado**: cadastro por WhatsApp e vínculos
  futuros (tarefa/despesa/cerca por pasto) do documento do cliente.
  Detalhes completos e decisões registradas em
  [docs/specs/module-29-minha-fazenda.md](../specs/module-29-minha-fazenda.md).
- Validado: `tsc --noEmit` e `eslint` limpos (únicos erros de tsc são
  pré-existentes em `scripts/m23-token-auth.test.ts`, confirmado intocado
  por esta rodada). Testado ao vivo em navegador real (login, cadastro de
  fazenda, edição de município/distrito, cadastro de pasto acima da área
  total com aviso exibido sem bloquear, desativação de pasto, troca entre
  as 2 fazendas do tenant seed, regressão de Rebanho sem erro).
  Sem `test:m29` automatizado (escopo é CRUD simples, sem regra de negócio
  complexa o bastante pra justificar agora).

### Pendências e próximo passo

- **Módulo 29**: aplicar a migração no Neon de produção só quando o
  usuário aprovar; cadastro de fazenda/pasto por WhatsApp fica pra uma
  rodada seguinte (decisão do usuário); vínculos futuros (Task/
  FinancialEntry por pasto) idem.
- Usuário quer **continuar dando funcionalidade ao app mobile**: pausado
  nesta rodada por causa do Módulo 29. Retomar assim que o usuário
  confirmar, decidindo COM ele qual recurso vem a seguir (incluindo se é
  hora de reabrir Rebanho/Máquinas/Tarefas pro mobile).
- Decidir com o usuário se/quando reabrir Rebanho, Máquinas e Tarefas
  para o app mobile e `packages/contracts` (decisão deliberada de ficarem
  de fora, documentada em specs de módulo; a extração de contrato de
  rebanho especificamente só devia acontecer depois de mudança de schema
  daquele domínio, que já aconteceu no Módulo 25, então a janela pra
  reabrir isso está tecnicamente aberta).
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA (web) em Android/iPhone reais; testar iPhone
  real (só Android testado até agora).
- **Achado, não corrigido, fora do escopo** (herdado de rodada anterior): o
  aviso de instalação do PWA sobrepõe o rodapé da sidebar no mobile
  (painel WEB, não o app `apps/mobile`).

## Histórico recente

- 2026-08-04: Módulo 29, "Minha Fazenda": `Property.city/district`, model
  `Pasture` novo, tela `/minha-fazenda`, nav reestruturado ("Operação" +
  "Minha Fazenda"). Commit desta rodada pendente.
- 2026-08-04: app mobile testado ao vivo num Android físico via Expo Go;
  downgrade de SDK (Expo Go da loja não suportava a versão mais nova ainda,
  achado testando de verdade) e tema claro/escuro com a paleta oficial.
  Commit `f17aedf`.
- 2026-08-04: app mobile: telas de escrita em Financeiro (marcar como
  pago, novo lançamento), nome da fazenda, cores oficiais corrigidas,
  `expo-secure-store` com fallback web, CORS dev-only. Commit `acc89a5`,
  enviado a pedido do usuário.
- 2026-08-04: push/deploy aprovado pelo usuário: `git push origin main`
  levou as 3 rodadas de layout (`3b65490`/`07f5210`/`de693bf`) pra
  produção de uma vez (Módulo 28 já estava lá desde antes).
- 2026-08-04: seletor de propriedade no topo (filtra o app inteiro) + menu
  de conta (Perfil/Minha senha/Sair) + página Perfil. Commit `de693bf`.
