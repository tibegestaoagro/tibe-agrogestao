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

- Atualizado em: 2026-11-13. Granel e atacado em produção (merge `8727de8`,
  sem migração, autorizados na conversa); contas PIX também (merge `bd7fd3f`).
  Nenhuma branch aberta. Os agentes `explorador`,
  `prova-juiz`, `prova-viva` e `servidor-dados` carregam (descrição entre
  aspas). Outros agentes: leia `AGENTS.md`.
- `main` igual a `origin/main`, Neon em dia. Em produção também: conta avulsa e
  2.64/2.65, Apresentação sempre visível, observação no impresso, cliente no
  extrato, relatórios e exportação (Q268 a Q274), cartão (Q250 a Q267), frete
  e editar venda (Q244 a Q249), o financeiro (Q214 a Q243); evidências em
  [financeiro-emporio-relatorio.md](financeiro-emporio-relatorio.md). De 09
  e 10/11 (specs dessas datas): peso total e regra por apresentação (Q291,
  Q292), orçamento (Q285 a Q290), boleto e cheque (Q278 a Q284; aberta 2.69),
  acordo, aviso e recálculo (Q275 a Q277; aberta 2.66).

### Granel em qualquer peso e atacado na mesma saca (Q319 a Q324): em produção

Branch `emporio-granel-e-atacado`, `ef7f356` a `31ad5ed`. Spec
[../superpowers/specs/2026-11-13-emporio-granel-e-atacado-design.md](../superpowers/specs/2026-11-13-emporio-granel-e-atacado-design.md).
"Converter para quilo" por produto, com prévia; fechadas do mesmo tamanho
dividem o estoque (ATACADO e Saca 40 kg); `UNIT_CHANGED` se a conversão cai no
meio. Sem migração. m115, roteiro `emporio-granel` (125 ok), juiz 5/10 com os
achados corrigidos, `test:all` 118/118. Central do Milho: GRANEL da Magnus 15
kg está em 0,068 saca (1,02 kg); a prévia marca "confira".

### Contas PIX (Q310 a Q318): em produção desde 13/11 (merge `bd7fd3f`)

Spec `docs/superpowers/specs/2026-11-13-emporio-contas-pix-design.md`. Na Da
Mata só a `CAIXA DAMATTA - PIX - 1076-6` ficou no PIX; as outras 10, não.

### Em produção desde 11/11: franqueado (Q300 a Q309) e custo único (Q298, Q299)

Specs de 11/11 em `docs/superpowers/specs/`. Franqueado: merge `9eac1fe`.
Decisões abertas do usuário: o Caixa escolhe franqueado? Devolução de venda
com crédito (hoje o crédito fica). A taxa do cartão incide sobre o crédito?
Custo único: merges `4245e48` e `2910302`, com os dados da Da Mata corrigidos
(detalhe em `historico/2026-11.md`). ⚠️ Cancelar compra anterior a uma
contagem faz a contagem tirar a mais: o app não trata; candidato a dívida.

### Cartão (Q250 a Q267): entregas 1 a 3 em produção

Specs em `docs/superpowers/specs/` de 09/11. Adquirentes e taxas por loja,
bandeira, modalidade e parcelas; recebíveis em dia útil, antecipação pontual
e automática, cancelamento como a Stone. Abertas 2.60, 2.62 e 2.63. Na
Agromax, a entrega 4 (extrato da Stone) depende de um arquivo real.

### ⏭️ Próximo passo

0. Manual com GIFs das atualizações de 11/11 a 13/11 (pedido do usuário).
   Central do Milho: converter os produtos que vendem a granel.
   Contas PIX: a Agromax cadastra as contas PIX das lojas e do site (CNPJ,
   favorecido, onde vale) e define a padrão de cada loja.
   Franqueado: o usuário responde as três decisões abertas (Caixa, devolução,
   taxa do cartão) e a Agromax testa. A Agromax testa o custo único (contar,
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

- 11/11: crédito do franqueado (Q300 a Q309) em produção, autorizado na conversa.
- 11/11: reunião com a Agromax; custo único (Q298, Q299) em produção, compras
  com a ordem corrigida e as de teste canceladas; tudo autorizado na conversa.
- 10/11: dívidas 2.64 e 2.65 e conta avulsa na branch do Codex; banco local,
  sem integração à `main` nem deploy.
- 10/11: desfazer acordo, aviso por email e recalcular o mês (Q275 a Q277)
  e, por baixo, relatórios e limpeza (Q268 a Q274) em produção, autorizados
  na conversa.
