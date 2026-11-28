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

- Atualizado em: 2026-11-28. **Frente em curso: UX e UI só do Empório**,
  na branch `ux-emporio`. Desenho aprovado:
  [2026-11-24-emporio-ux-design.md](../superpowers/specs/2026-11-24-emporio-ux-design.md)
  (Q387 a Q397). Ondas 1 a 4 **em produção** (a 4 desde 27/11, merge até
  `3ccb2bb9`), sem migração; o detalhe de cada uma está em
  `historico/2026-11.md` (a onda 4 arquivada em 27/11).

  **Onda 5 (Estatísticas): em produção desde 27/11** (merge até `99eafbba`;
  detalhe em `historico/2026-11.md`, arquivado em 28/11).

  **Onda 6 (loja no topo, §5.3, Q389): em produção desde 28/11**, depois do
  merge autorizado pelo usuário (avanço rápido de `99eafbba` a `f6d5e9fa`; CI
  e Vercel verdes). Plano
  `docs/superpowers/plans/2026-11-27-emporio-ux-onda6-loja-no-topo.md`
  (decisões do usuário: o seletor some em Vender, Caixa, Produtos, Clientes e
  fichas; Estoque e Fiado seguem o topo; formulário de criação abre com a
  loja do topo). Commits de `82dea601` (plano) a `2ff7c008`, enviados. Sem
  migração. Entregue:
  - "Loja: Todas ▾" no topo (`loja-do-topo-seletor.tsx`), cookie
    `tibe_emporio_loja` gravado pela rota `POST /api/v1/emporio/loja-do-topo`
    e lido no servidor por `lerLojaDoTopo`; os filtros de loja de cada tela
    saíram; suíte `m135`;
  - link com `?loja=` (Histórico: `establishment_id`) vira a loja do topo e
    sai da URL, para o primeiro clique de paginação não voltar a "Todas";
  - despesas fixas filtram por loja (`GET /fixed-expenses?establishment_id=`).

  Resultados: juiz 6/10, os 8 achados tratados (`79cde48a`); roteiro
  `emporio-ux-onda6`; passada dos `emporio-*` com os roteiros ajustados à
  adoção (`aa3f1bb2`, `2ff7c008`) e nenhum defeito de tela; `tsc`, `lint`,
  `check`, `test:docs-api` e `textos-defasados` limpos; `test:all` 138/138.
  Vermelhos de antes da onda (falham também em `99eafbba`): `emporio-f2a` (o
  "Depósito Central" dos cenários de UX vem antes da loja do cenário) e
  `emporio-f6b` (a navegação do Vendedor não chega ao servidor).
  Para o usuário decidir: os "Primeiros passos" do Início não seguem a loja;
  tocar num aviso do Início que leva `?loja=` troca a loja do topo inteiro.

  **Lista da onda 7 (manual):** em
  [emporio-ux-onda7-manual.md](emporio-ux-onda7-manual.md), das ondas 2 a 6.

  **Próximo:** plano da onda 7 (manual, desenho §6), para aprovação do
  usuário.
- Em produção até 24/11 (detalhe em `historico/2026-11.md`): lint zerado;
  decisões pendentes D1 a D7 (Q374 a Q386, `m129`); data da baixa (Q370 a
  Q373, `m127`); sobras sem a Agromax (`m128`); plano do GestãoClick A, B, C,
  D, H e paginação. Falta a Central do Milho editar as vendas 1, 2 e 4 e a
  taxa de crédito à vista da LOJA MOC; Laiza e Cláudia validam a data da baixa
  contra o extrato; G1 e G2 esperam a planilha do GestãoClick e o XML de nota.
  Da Mata: financeiro zerado em 19/11 (autorizado); próxima venda nº 1.

### Abertas das entregas de 09 a 13/11 (todas em produção)

Contas PIX: na Da Mata só a `CAIXA DAMATTA - PIX - 1076-6`. Franqueado: ⚠️
cancelar compra anterior a uma contagem faz a contagem tirar a mais (candidato
a dívida). Cartão: abertas 2.60, 2.62, 2.63; a entrega 4 depende do extrato
real da Stone.

### ⏭️ Próximo passo

0. Central do Milho (orientação entregue ao usuário em 16/11):
   cadastrar taxas do cartão e editar as vendas lançadas como fiado; converter
   os produtos de granel. Vídeo em `docs/financeiro-reuniao/` (fora do git).
   Contas PIX: a Agromax cadastra as contas PIX das lojas e do site (CNPJ,
   favorecido, onde vale) e define a padrão de cada loja.
   Franqueado: em produção desde 23/11, a Agromax testa (Caixa
   escolhe, devolução com crédito). A Agromax testa o custo único (contar,
   depois lançar a compra).
1. Na Agromax: criar a regra por apresentação (FRANQUIA) e editar e cancelar um orçamento real; conferir o boleto e o "Em nome de" numa venda real.
2. Na Agromax (usuário, pelas telas): Stone, taxas do mês, regra de dia útil
   e, se usar, a antecipação automática; confirmar as decisões do agente do
   cartão e do frete; responder o setor; decidir se o vendedor vê o líquido
   efetivo (2.63). Depois: Q239 a Q243; cenário de demonstração.

As pastas `research_notes/` e `reports/` (pesquisa de mercado que embasou a
spec) são ignoradas pelo git de propósito: o repositório é público.

### Empório (Módulo 39): em produção, usado pela Agromax

Spec do módulo: [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(decisões até a Q213). Dívidas do módulo em [dividas.md](dividas.md), de 2.15 a
2.27 e de 5.19 a 5.22. Manual em `/manual`, roteiro `manual-emporio`.

Os planos de 06/11 (Q191 a Q213, `test:m95` a `m97`) estão em produção;
detalhe em `historico/2026-11.md`. Pendências do usuário em
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
  `owner@example.com` / `tibe123`, citado na documentação pública (o email
  não existe em produção). Falta o usuário mandar a parte do email que diz o
  arquivo e o commit; proposta: trocar o email do seed por um domínio de
  exemplo. Não repita a comparação de senha contra os hashes de produção.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em canário

[Spec](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
[relatórios](agente-whatsapp/), detalhe em [historico/2026-09.md](historico/2026-09.md).
O n8n (`UAAA96aJFiiFsQCL`) manda quatro telefones (o usuário, Lucas, Max e
Laíza) para a rota de turno desde 18/09. Mudar a lista:
`scripts/n8n-workflow.ts` (escrita só com `--confirmar`; quem roda é o
usuário). ⚠️ O JSON do fluxo nunca entra no repositório (chave da Evolution).
Canário: `npx tsx scripts/observar-canario.ts [dias]`. Faltam os passos 9 e 10
do [roteiro](agente-whatsapp/roteiro-do-chip.md) e três correções de 29/09 no
celular. Missões 3 e 4 congeladas no classificador.

### Outras pendências do usuário

- Trocar o nome do cadastro "Owner Da Mata" em Ajustes (saudação sem nome).
- O roteiro do estoque no aparelho, a partir do bloco 0:
  [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md).
- A lista geral: [pendencias-do-usuario.md](pendencias-do-usuario.md).

### Ambiente

- Os containers `tibe-pg` e `tibe-redis` caem sozinhos. Se uma suíte travar sem
  mensagem, rode `docker ps` antes de culpar o código.
- `test:all` repetido no dia reprova a `m19` (lock do Redis): `FLUSHALL` local.
- `npx prisma migrate deploy` contra o Neon pode ser recusado pelo
  classificador mesmo com autorização. Tente uma vez; se bloquear, dê ao
  usuário o comando e confira com `migrate status` antes do push.
- Desktop: um clone só, em `D:\Projetos\tibe-agrogestao` desde 27/11 (saiu
  do `C:`), sem worktrees; Docker em `D:\Docker` (SSD), RAM de 32 GB. Porta 3000 ocupada por outro
  processo: roteiro com `TIBE_BASE="http://localhost:<porta>"` (nunca `127.0.0.1`).
- Roteiro preso em recarga: cofre `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`.
  Se o log do `next dev` mostra "Compiled in 1ms" a cada GET, o cache corrompeu
  (acontece quando o servidor morre à força): pare, apague `.next/dev` e religue.
- No notebook: `node -v` 24.22.1 ou mais; sem o `.claude/settings.local.json`
  (não vai ao git), a migração em produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 28/11: onda 6 da UX do Empório (loja no topo) em produção (merge e push autorizados na conversa).
- 27/11: onda 5 da UX do Empório (Estatísticas) em produção (merge e push autorizados na conversa).
- 26/11: ondas 2 e 3 da UX do Empório em produção (merges autorizados na conversa); onda 4 em produção em 27/11 (merge autorizado na conversa).
- 24/11 (2): UX do Empório: entrevista, diagnóstico, mockups e desenho; nada em produção.
- 24/11: lint zerado e travado, passo 2 do roteiro franqueado estável; branch `lint-avisos-passo-2` sem merge.