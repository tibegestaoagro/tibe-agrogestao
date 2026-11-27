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

- Atualizado em: 2026-11-27. **Frente em curso: UX e UI só do Empório**,
  na branch `ux-emporio`. Desenho aprovado:
  [2026-11-24-emporio-ux-design.md](../superpowers/specs/2026-11-24-emporio-ux-design.md)
  (Q387 a Q397). Ondas 1 (navegação), 2 (Início) e 3 (Vender) **em produção
  desde 25 e 26/11**, sem migração; o detalhe de cada uma, a limpeza dos
  roteiros e as escolhas para o olho do usuário estão em
  `historico/2026-11.md` (arquivado em 26/11).

  **Onda 4 (Dinheiro e listas, §5.8, §5.9, §5.11): em produção desde 27/11**,
  depois do merge autorizado pelo usuário (avanço rápido de `ux-emporio`
  sobre `e8c53116` até `3ccb2bb9`; CI e Vercel verdes). Plano `docs/superpowers/plans/2026-11-26-emporio-ux-onda4-dinheiro.md`,
  aprovado em 26/11. Commits de `96150370` (plano) a `015c4bba`. Sem migração.
  Entregue:
  - A pagar com abas na URL (`?aba=`): Contas, Despesas fixas, Vendeu, Pagou;
    comissões iguais (mesmo nome, loja e vencimento, 2 ou mais) em grupo
    recolhido; aberto a `gestor_da_loja` ou `dinheiro`;
  - A receber com abas (Fiado, Cheques, Boletos, Cartões, Vencidos) e o total
    no título; Fiado com busca (nome, CPF ou telefone, 3 dígitos ou mais),
    documento e venda mais antiga;
  - Caixa em `/emporio/caixa` com "Saldo de cada lugar" (só `dinheiro`);
  - endereços antigos redirecionam (`/emporio/despesas`, `/financeiro/cobranca`,
    `/financeiro/caixa`); a barra de abas do Financeiro saiu; Estatísticas
    ganhou "Relatórios do dinheiro" (até a onda 5);
  - Produtos e Estoque paginados (20, 40, 80, 100); Estoque abre em "Precisa
    repor"; `BarraDeFiltros` em sete listas;
  - regras puras em `src/lib/emporio/dinheiro-telas.ts`, suíte `m133`.

  Resultados:
  - juiz 6/10, os 6 achados tratados (`c143eece`);
  - roteiro `emporio-ux-onda4` (cenário prefixo "U4 "), provado nos dois
    sentidos (17, 2 e 4 falhas com os defeitos plantados);
  - passada dos 52 roteiros `emporio-*`: 17 ajustados para a tela nova
    (`015c4bba`); 1 defeito de tela achado e corrigido (`fd112cd2`: "Ver tudo
    o que receber" perdia a aba Cheques; 2 falhas sem a correção, 0 com ela);
  - Fiado no celular: "Venda mais antiga" e "Vendas" somem abaixo do `md`, e
    o botão Receber cabe a 390 px (conferência nova, falhou antes);
  - `npm run textos-defasados` limpo; `test:all` 136/136.

  Não corrigidos: nenhuma suíte confere o ramo de parcela de acordo em
  `oldest_sale_at`; o caso novo do `m131` não foi visto falhar antes da
  correção; o Caixa ainda aceita o `conta=` legado.

  **Lista da onda 7 (manual).** O manual cita os endereços antigos
  (`manual/_conteudo/figuras.ts` linhas 186, 363, 425 e 438; caem nos
  redirecionamentos), a barra de abas, Despesas, Cobrança e Posição de caixa.
  Das ondas 2 e 3: `manual-emporio.py` (linhas 148 e 149) e a figura
  `inicio-primeiros-passos` com a grade antiga do Início; a legenda de atalhos
  do Vender, "Escolher cliente" (virou "Trocar"), o vendedor em botões e
  "Abrir o Caixa 1" (`partes-funcao.tsx:267`, `partes-consulta.tsx:130`,
  `vendedor-imprimir/page.tsx:49` e `:77`).

  **Próximo:** plano da onda 5, para aprovação do usuário.
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
- Dois clones (`C:` e `D:`), sem worktrees desde 08/11. Prova viva: `npm run
  dev` no clone (`prisma generate` antes se houver migração), roteiro com
  `TIBE_BASE="http://localhost:<porta>"` (nunca `127.0.0.1`).
- Roteiro preso em recarga: cofre `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`.
- No notebook: `node -v` 24.22.1 ou mais; sem o `.claude/settings.local.json`
  (não vai ao git), a migração em produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 26/11: ondas 2 e 3 da UX do Empório em produção (merges autorizados na conversa); onda 4 em produção em 27/11 (merge autorizado na conversa).
- 24/11 (2): UX do Empório: entrevista, diagnóstico, mockups e desenho; nada em produção.
- 24/11: lint zerado e travado, passo 2 do roteiro franqueado estável; branch `lint-avisos-passo-2` sem merge.
- 23/11: decisões pendentes do Empório em produção, Neon, merge e push autorizados na conversa (18/11 e 20/11 no histórico).
