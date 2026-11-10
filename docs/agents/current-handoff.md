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

- Atualizado em: 2026-11-10 de madrugada (duas branches empilhadas prontas,
  à espera da autorização do usuário: `emporio-relatorios-e-limpeza`, sem
  migração, e por cima `emporio-acordo-aviso-rateio`, com duas migrações).
- `main` em `255a150` (igual a `origin/main`), nenhuma migração pendente no
  Neon. Em produção: cartão entregas 1 a 3 (Q250 a Q267), frete, origem e
  editar venda (Q244 a Q249), o financeiro (Q214 a Q243); evidências em
  [financeiro-emporio-relatorio.md](financeiro-emporio-relatorio.md).

### Relatórios, exportação e limpeza (Q268 a Q274): pronto na branch

Spec [../superpowers/specs/2026-11-09-emporio-relatorios-e-limpeza-design.md](../superpowers/specs/2026-11-09-emporio-relatorios-e-limpeza-design.md),
plano `docs/superpowers/plans/2026-11-09-emporio-relatorios-e-limpeza.md`.
Faturamento por origem no relatório de vendas; relatórios do dinheiro e
projeção em planilha (CSV para o Excel brasileiro) e em PDF pela página de
impressão; gráfico do saldo projetado; custo efetivo do cartão no Resultado;
contas sem vencimento à parte; limpeza da 2.63; email do seed trocado para
`owner@example.com` (Q274; o banco local também). `test:m105` 101, roteiro
`emporio-relatorios-exportacao` 44 checks nos dois sentidos (sabotado: 3).
Fechadas 2.45, 2.46, 2.50, 2.54, 2.61; abertas 2.64 e 2.65 (a m99 reprova entre 21h e meia-noite de Brasília por calcular o dia em UTC; não é regressão).

### Desfazer acordo, aviso por email, recalcular o mês (Q275 a Q277): pronto

Branch `emporio-acordo-aviso-rateio`, empilhada sobre a anterior. Spec
[../superpowers/specs/2026-11-09-emporio-acordo-aviso-rateio-design.md](../superpowers/specs/2026-11-09-emporio-acordo-aviso-rateio-design.md).
Desfazer acordo só sem movimento (origens voltam pendentes); pedido de
pagamento avisa também por email; recalcular o mês do rateio automático em
transação serializável, nunca em mês com conta paga. Migrações
`20261110120000_emporio_acordo_desfeito` e
`20261110130000_emporio_email_pedido_pagamento` **só no Docker**.
`test:m106` verde, `test:all` 105/106 (só a m99 pelo horário: 2.65), build e isolamento verdes, roteiro `emporio-acordo-rateio` 28 checks nos dois
sentidos (sabotado: 2). Fechadas 2.39, 2.40, 2.53; aberta 2.66.

### Cartão (Q250 a Q267): entregas 1 a 3 em produção

Specs [../superpowers/specs/2026-11-09-emporio-taxas-de-cartao-design.md](../superpowers/specs/2026-11-09-emporio-taxas-de-cartao-design.md)
e [../superpowers/specs/2026-11-09-emporio-cartao-entregas-2-e-3-design.md](../superpowers/specs/2026-11-09-emporio-cartao-entregas-2-e-3-design.md);
pesquisa em `reports/Taxas de cartão no Empório.md` (fora do git). Adquirente
como cadastro, taxa por loja, adquirente, bandeira, modalidade e faixa de
parcelas com vigência (Configurações); parcela em dia útil com taxa e
efetivos próprios; antecipação pontual e automática; cancelamento como a
Stone. Abertas 2.60, 2.62, 2.63 (só o item do vendedor). A confirmar: taxas
mexidas pelo gestor e pelo Financeiro; adquirente só Dono e Gerente geral.
Na Agromax: "Maquininha" vira "Stone", taxas do mês por bandeira e parcelas;
a entrega 4 (extrato da Stone) depende de um arquivo real.

### ⏭️ Próximo passo

1. O usuário autoriza NA CONVERSA: migração no Neon das duas migrações da
   `emporio-acordo-aviso-rateio` (URL Direct), merge fast-forward dessa
   branch (traz a de relatórios junto) e push na `main`; conferir o deploy
   pelo `/docs/api` (`recalculate` e `agreements/:id/undo`).
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

- 10/11: desfazer acordo, aviso por email e recalcular o mês (Q275 a Q277)
  e, por baixo, relatórios e limpeza (Q268 a Q274) prontos, esperando
  autorização.
- 09/11: frete e editar venda (Q244 a Q249) e o cartão inteiro (Q250 a
  Q267) em produção, autorizados na conversa.
- 07 e 08/11: spec e as quatro entregas do financeiro do Empório em produção
  (juiz 8 a 9/10); handoff arquivado em `historico/2026-11.md`.
