# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional curta e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo.
- Substitua a seção "Estado atual" a cada rodada. Em "Últimas rodadas", mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez (trava em `.claude/hooks/guarda-bash.mjs`).

⚠️ Teto de 200 linhas. Este arquivo já chegou a 1.316 (arquivado em 02/09) e a
904 (arquivado em 07/11). Se passar do teto, arquive antes de acrescentar.
Histórico em `historico/2026-08.md` a `historico/2026-11.md` (o detalhe do
Empório, das fases F0 a F5 até os três planos de 06/11, está no de 11).

## Estado atual

- Atualizado em: 2026-11-09 (ajuste do frete, origem e editar venda em
  produção: migração no Neon, merge fast-forward e push autorizados na
  conversa).
- `main` em `b775487` (igual a `origin/main`), nenhuma migração pendente no
  Neon ("Database schema is up to date!"). Deploy da Vercel conferido: o
  `/docs/api` em produção lista a rota `POST /sales/:id/replace` (09/11). As
  quatro entregas do financeiro estão em produção desde 08/11 (Q214 a Q243; evidências em
  [financeiro-emporio-relatorio.md](financeiro-emporio-relatorio.md)). As
  branches `emporio-financeiro-spec`, `-1` a `-4` e `emporio-frete-ecommerce`
  estão todas na `main` e podem ser apagadas.

### Ajuste de 09/11: frete na venda, origem e-commerce e editar venda

Pedido do usuário com urgência: a Agromax lança à mão os pedidos do
e-commerce, o cliente paga produto mais frete e o frete é repasse à
transportadora. Spec
[../superpowers/specs/2026-11-09-emporio-frete-ecommerce-design.md](../superpowers/specs/2026-11-09-emporio-frete-ecommerce-design.md)
(Q244 a Q249, na tabela do módulo), plano
`docs/superpowers/plans/2026-11-09-emporio-frete-ecommerce.md`, ledger em
`.superpowers/sdd/2026-11-09-emporio-frete-ecommerce/progress.md`.

**Em produção (15 commits sobre `38d4ac5`, mesclados em 09/11):**
- Venda com `freight_amount` e `origin` (`balcao`, `ecommerce`); `net_amount`
  segue sendo os itens (o faturamento); o recibo vale itens mais frete; nasce a
  conta a pagar "Frete de entrega" (vence no dia, cancelar a venda cancela a
  não paga); o Resultado ganha a linha "Frete de entrega (repasse)" fora das
  vendas e da margem (só a diferença entra no resultado).
- Editar venda: `POST /sales/:id/replace` cancela a antiga e registra a nova
  na mesma transação (`replaces_sale_id`), com as travas do cancelamento; na
  tela, "Editar" no detalhe abre o balcão preenchido (`/emporio/vender?editar=`).
- Migração `20261109120000_emporio_frete_origem_substituicao` aplicada no
  Docker e no Neon (URL Direct). `test:m102` 76, roteiro `emporio-frete-ecommerce` 47 checks nos
  dois sentidos (sabotado: 8 falhas), roteiro `emporio-f3a` verde, manual,
  `/docs/api`, dívidas 2.54 e 2.55. Revisão Sonnet por onda (sem juiz, por
  decisão do usuário); o achado importante (editar venda faturada de
  orçamento) foi corrigido e provado nos dois sentidos.

**Decisões do agente a confirmar com o usuário:** a conta do frete é criada
mesmo se a plataforma já reter o frete (marcar paga, ou tirar a criação);
"Editar" exige gestor da loja, como cancelar (quem lança o e-commerce pode
ser vendedor); a venda nova herda `sold_at`, vendedor, cliente, entrega e
orçamento da antiga quando o corpo cala.

### ⏭️ Próximo passo

1. O usuário confirma as três decisões do agente acima (conta do frete
   sempre criada; "Editar" só do gestor; herança da venda antiga) e usa o
   ajuste nos pedidos do e-commerce já lançados (Editar, informar o frete,
   marcar E-commerce). Discordância vira ajuste pequeno em branch nova.
2. Depois: Q239 a Q243 do financeiro a confirmar; a Agromax passa a usar a
   casa do financeiro; cenário de demonstração na conta de testes nova
   (pendência do usuário); dívidas 2.36 a 2.55 esperam pedido.

As pastas `research_notes/` e `reports/` (pesquisa de mercado que embasou a
spec) são ignoradas pelo git de propósito: o repositório é público.

### Empório (Módulo 39): em produção, usado pela Agromax

Spec do módulo: [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(decisões até a Q213). Dívidas do módulo em [dividas.md](dividas.md), de 2.15 a
2.27 e de 5.19 a 5.22. Manual em `/manual`, roteiro `manual-emporio`.

Os três planos de 06/11 (clientes e fornecedores, a escolha, entrega e
romaneio; `test:m95` a `m97`, Q191 a Q213) estão em produção desde 07/11
(detalhe em `historico/2026-11.md`; `emporio-romaneio` precisa de `pypdf`).
As pendências de produto do Empório que esperam o usuário estão em
[pendencias-do-usuario.md](pendencias-do-usuario.md), seção do Empório.

Não ligue recurso nem escreva dado da Da Mata pelo agente: quem faz é o
usuário, pela Plataforma e pelas telas.

### Da Mata é a conta real da Agromax (desde 01/11)

A Agromax usa a conta Da Mata Sementes só para o Empório, com as lojas AGROMAX e
AGROMAX MOC. Em 06/11, autorizado pelo usuário,
`scripts/limpar-demonstracao-conta.ts` apagou em produção 3.688 registros de
demonstração; ficaram 1.556, conferidos antes e depois na mesma transação.
Ficaram de propósito: o Dono, as categorias financeiras, o "Consumidor final" e
o vínculo do WhatsApp do usuário.

⚠️ O cenário de demonstração (`scripts/cenario-demonstracao-emporio.ts`) não
pode mais rodar na Da Mata.

Pendente do usuário:
- email e nome da conta de testes nova (depois, rodar o cenário de
  demonstração nela e mover o vínculo do WhatsApp);
- trocar o email de acesso da Da Mata para o da Agromax;
- os logins da equipe da Agromax.

### 🔴 Segurança: o repositório é público

Todo commit é leitura pública. Fechar exige a conta `tibegestaoagro` (o
`dilton-pleno` tem `push`, não `admin`).

- O `.env.enc` vazou (commit de 24/08, AES-256-CBC); a reescrita de 02/09 com
  `git filter-repo` não removeu a exposição (o GitHub ainda serve os objetos
  por SHA). Falta, e é do usuário: rotacionar as 22 variáveis (adiado em
  27/10), fechar o repositório e pedir ao Suporte do GitHub a coleta dos
  órfãos. Na rotação, o agente guia variável por variável e nunca lê nem
  imprime o valor. ⚠️ O espelho `D:\tmp\tibe-backup-pre-rewrite.git` contém o
  `.env.enc`: apague quando a rotação terminar.
- Alerta do GitGuardian de 06/11 ("Company Email Password exposed", push de
  22:27 UTC): segredo não confirmado; o candidato provável é o par do seed
  `owner@damata.com.br` / `tibe123`, citado na documentação pública (o email
  não existe em produção). Falta o usuário mandar a parte do email que diz o
  arquivo e o commit; proposta: trocar o email do seed por um domínio de
  exemplo. Não repita a comparação de senha contra os hashes de produção.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em canário

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe em
[historico/2026-09.md](historico/2026-09.md).

- O fluxo de produção do n8n (`UAAA96aJFiiFsQCL`) é híbrido desde 18/09: o nó
  `Agente Novo?` manda quatro telefones (o usuário e Lucas, Max e Laíza
  Agromax) para a rota de turno; o resto segue no `execute-action`. O canário
  fica com esses quatro até o usuário reabrir o assunto (29/09).
- Ler, guardar e mudar a lista: `scripts/n8n-workflow.ts` (escrita só com
  `--confirmar`, cópia antes em `~/.tibe/n8n-copias/`; quem roda é o usuário).
  ⚠️ O JSON do fluxo nunca entra no repositório: carrega a chave da Evolution.
- Ler o canário: `npx tsx scripts/observar-canario.ts [dias]` (só leitura).
- Faltam os passos 9 e 10 do [roteiro](agente-whatsapp/roteiro-do-chip.md) e
  validar no celular três correções de 29/09 (compra a prazo pergunta se já
  pagou; "próximos 100 dias" diz a data; "30 machos" vai à confirmação).
- As intenções das missões 3 e 4 seguem congeladas no classificador.

### Outras pendências do usuário

- Trocar o nome do cadastro "Owner Da Mata" em Ajustes (saudação sem nome).
- O roteiro do estoque no aparelho, a partir do bloco 0:
  [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md).
- A lista geral: [pendencias-do-usuario.md](pendencias-do-usuario.md).

### Ambiente

- Os containers `tibe-pg` e `tibe-redis` caem sozinhos. Se uma suíte travar sem
  mensagem, rode `docker ps` antes de culpar o código.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis.
  Rode `docker exec tibe-redis redis-cli FLUSHALL` (Redis local) e ela passa.
- `npx prisma migrate deploy` contra o Neon pode ser recusado pelo
  classificador mesmo com autorização. Tente uma vez; se bloquear, dê ao
  usuário o comando e confira com `migrate status` antes do push.
- Dois clones (`C:` e `D:`); os worktrees `tibe-wt2` e `tibe-wt3` foram
  removidos em 08/11 à noite (nenhum dev server de pé). Para a próxima prova
  viva: `npm run dev` no clone, `npx prisma generate` antes se houver migração
  nova; roteiro com `TIBE_BASE="http://localhost:<porta>"` (nunca
  `127.0.0.1`: o cookie é de `localhost`); não suponha a conta vazia.
- Roteiro preso em recarga é aba sobrando no Chrome de testes ou o laço de
  logo depois de subir (cofre: `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`;
  em 09/11 o sintoma foi "escolhe a loja" falhando e `fiber=false`: fechar as
  abas pela porta 9333, derrubar o `next dev`, apagar `.next`, aquecer `/login`).
  O `manual-emporio` regrava todos os PNGs: restaure os que não mudaram.
- Nesta sessão de 09/11 o `Agent` não listou `servidor-dados` nem
  `prova-viva` (frontmatter igual aos outros); `servidor-acao` e
  `general-purpose` em Sonnet fizeram o papel. O usuário pede economia de
  cota: Sonnet para implementar e revisar, Haiku para explorar, Opus só se
  ele pedir juiz.
- No notebook: `node -v` 24.22.1 ou mais; sem o `.claude/settings.local.json`
  (não vai ao git), a migração em produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 09/11: frete na venda, origem e-commerce e editar venda (Q244 a Q249,
  m102 76, roteiro 47/0) em produção: migração no Neon, merge e push
  autorizados na conversa.
- 08/11 (noite): entrega 4 pronta (juiz 9/10 na rodada 4) e as quatro
  entregas do financeiro em produção, na ordem 1 a 4, autorizadas na conversa.
- 08/11: entrega 3 pronta em `emporio-financeiro-3` (juiz 8/10 na rodada 2).
- 08/11: entregas 1 e 2 prontas em `emporio-financeiro-1` e `-2` (juiz 8/10).
- 07/11: spec do financeiro do Empório (24 decisões) e os planos 1 a 3 do
  Empório em produção, `c3b2606`; handoff arquivado em `historico/2026-11.md`.
