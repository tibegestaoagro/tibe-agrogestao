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

- Atualizado em: 2026-11-23. **Decisões pendentes do Empório: pronto na
  branch `emporio-decisoes-pendentes`, NÃO mergeado** (spec e plano
  `2026-11-23-emporio-decisoes-pendentes`, Q374 a Q385, suíte `m129`).
  ⚠️ Tem migração: `20261123120000_emporio_devolucao_credito_franqueado`
  (coluna `franchisee_credit` em `EmporioSaleReturn`), aplicada só no Docker.
  **Antes do push na main, aplicar no Neon (URL Direct), com autorização.**
  Entregue: D1 a D7 confirmadas; ficha conta agendado no Em aberto e não no
  Vencido (Q375, Q385); antecipação esconde o Desfazer da parcela (Q377); Caixa
  escolhe o franqueado (Q378); devolução com crédito devolve o valor do papel e
  tira o crédito em proporção, centavo acumulado (Q379); loja arca a taxa do
  cartão (Q380); orçamento trava o cliente, validade por hoje, recusa linha
  repetida (Q382 a Q384). `test:all` 132/132; juiz 8/10, os 6 menores
  corrigidos; roteiros franqueado, orçamento, antecipação e data da baixa
  provados nos dois sentidos. Sobras em 5.32 do `dividas.md`.
- Em produção: 20/11 sobras sem a Agromax (`m128`); 19/11 transação de 30 s e
  gru1 (`m126`), taxas encerradas com aviso e sobras B, C, D e H (5.29). Falta a Central do Milho editar de
  novo as vendas nº 1, 2 e 4 e estender a taxa de crédito à vista da LOJA MOC.
- 19/11, escritas em produção autorizadas, na Da Mata: apagado o saldo inicial
  de R$ 15.020,83 da CAIXA DAMATTA; financeiro zerado com
  `scripts/zerar-financeiro-conta.ts` (494 registros; md5 do que fica conferido).
  Ficaram orçamentos (268), clientes, produtos e estoque. Próxima venda: nº 1.
- **Data da baixa em produção desde 19/11** (merge `2123c197`, migração
  `20261119120000_emporio_boleto_valor_pago`; spec e plano
  `2026-11-19-emporio-data-da-baixa`, Q370 a Q373, suíte `m127`): baixa de hoje
  menos 31 a mais 31 dias, saldo só até hoje e futuro em "Agendados",
  "Corrigir a data" do PIX, boleto com valor pago. Vídeo da reunião com a
  Cláudia fora do git (`docs/financeiro-19112026/`). A Laiza e a Cláudia
  validam contra o extrato do banco.
- Plano do GestãoClick (Q341 a Q344):
  [../superpowers/specs/2026-11-17-emporio-plano-gestaoclick.md](../superpowers/specs/2026-11-17-emporio-plano-gestaoclick.md).
  Em produção: A, B, C, D (sem leitor nem impressora reais; 5.25), H e a
  paginação (`58e077fc`; 5.28). G1 (2.18) e G2 (2.34) esperam a planilha do
  GestãoClick e o XML de nota. **Próximo passo:** a Laiza e a Cláudia validam a
  data da baixa; G1 e G2 quando os arquivos chegarem.
- Em produção desde 16/11: Q325 a Q340 (orçamento com total, cadastro leve,
  CEP, preço do cadastro, PIN, brinde, frete no orçamento; os gestores precisam
  cadastrar o PIN) e o manual (GIFs: roteiro `manual-gifs` e
  `python scripts/manual-gifs-montar.py`). Antes disso, Q214 a Q324 (detalhe em
  `historico/2026-11.md` e
  [financeiro-emporio-relatorio.md](financeiro-emporio-relatorio.md); abertas
  2.66 e 2.69). Neon em dia.

### Abertas das entregas de 09 a 13/11 (todas em produção)

- Contas PIX (Q310 a Q318): na Da Mata só a `CAIXA DAMATTA - PIX - 1076-6`.
- Franqueado (Q300 a Q309): as três decisões respondidas em 23/11 (Q378 a
  Q380, na branch acima). ⚠️ Cancelar compra anterior a uma contagem faz a
  contagem tirar a mais (candidato a dívida).
- Cartão (Q250 a Q267): abertas 2.60, 2.62, 2.63; a entrega 4 depende do
  extrato real da Stone.

### ⏭️ Próximo passo

0. Central do Milho (orientação entregue ao usuário em 16/11):
   cadastrar taxas do cartão e editar as vendas lançadas como fiado; converter
   os produtos de granel. Vídeo em `docs/financeiro-reuniao/` (fora do git).
   Contas PIX: a Agromax cadastra as contas PIX das lojas e do site (CNPJ,
   favorecido, onde vale) e define a padrão de cada loja.
   Franqueado: depois do merge da branch de 23/11, a Agromax testa (Caixa
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
- Dois clones (`C:` e `D:`), sem worktrees desde 08/11. Prova viva: `npm run
  dev` no clone (`prisma generate` antes se houver migração), roteiro com
  `TIBE_BASE="http://localhost:<porta>"` (nunca `127.0.0.1`).
- Roteiro preso em recarga (`fiber=false`, "escolhe a loja" falhando) é aba
  sobrando no Chrome de testes ou o laço de logo depois de subir: fechar as
  abas pela porta 9333, derrubar o `next dev`, apagar `.next`, aquecer
  `/login` (cofre: `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`).
- Em 09/11 o `Agent` não listou `servidor-dados` nem `prova-viva`;
  `servidor-acao` e `general-purpose` em Sonnet fizeram o papel. O usuário
  pede economia de cota: Sonnet implementa e revisa, Haiku explora, Opus só
  se ele pedir juiz.
- No notebook: `node -v` 24.22.1 ou mais; sem o `.claude/settings.local.json`
  (não vai ao git), a migração em produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 23/11: decisões pendentes do Empório na branch (18/11 e 20/11 no histórico).
