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
Histórico: `historico/2026-08.md`, `historico/2026-09.md`,
`historico/2026-10.md` e `historico/2026-11.md` (o detalhe de todas as entregas
do Empório, das fases F0 a F5 até os três planos de 06/11).

## Estado atual

- Atualizado em: 2026-11-07 (spec do financeiro do Empório escrita e
  revisada).
- `main` em `ed8e37e`, Vercel verde. Nenhuma migração pendente no Neon.
- Branch de trabalho `emporio-financeiro-spec`: a spec, o `.gitignore` das
  pastas de pesquisa e este handoff. Sem merge ainda.

### ⏭️ Próximo passo: o plano da entrega 1 do financeiro do Empório

Spec aprovada em conversa e escrita em
[../superpowers/specs/2026-11-07-emporio-financeiro-design.md](../superpowers/specs/2026-11-07-emporio-financeiro-design.md):
quatro entregas, decisões Q214 à Q237 (ainda não copiadas para a tabela da
spec do módulo; o plano 1 faz isso). Um revisor leu a spec como builder; as
nove perguntas dele foram fechadas na própria spec, marcadas "decisão minha".
O usuário ainda não leu a versão revisada: confirme com ele as escolhas
listadas na resposta de 07/11 antes de planejar. Depois, a skill
`superpowers:writing-plans` para a entrega 1 (casa do financeiro, papel
`financeiro`, lacuna 2.26, Empório fora do `/financeiro`). Suíte nova:
`test:m98`.

As pastas `research_notes/` e `reports/` (pesquisa de mercado que embasou a
spec) são ignoradas pelo git de propósito: o repositório é público.

### Empório (Módulo 39): em produção, usado pela Agromax

Spec do módulo: [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(decisões até a Q213). Dívidas do módulo em [dividas.md](dividas.md), de 2.15 a
2.27 e de 5.19 a 5.22. Manual em `/manual`, roteiro `manual-emporio`.

Os três planos de 06/11 estão em produção desde 07/11, com deploy autorizado
pelo usuário na conversa:
1. Clientes e fornecedores fora de `Contact` (`test:m95`, Q191 a Q198). A
   migração moveu dados; `conferir-clientes-emporio.ts` deu "Tudo confere"
   antes e depois do deploy.
2. A escolha do cliente e do fornecedor com busca no servidor (`test:m96`, Q199
   a Q204).
3. Pedido para entrega e romaneio (`test:m97`, Q205 a Q213). Decisões do
   usuário em 07/11: a linha "PEDIDO PARA ENTREGA" fica nos papéis do orçamento
   e da venda, e o Vendedor também muda o pedido para entrega de venda fechada,
   só nas lojas dele.

Junto com o plano 3 subiu a correção do "Completar cadastro": o que se
digitava antes de o cadastro carregar era sobrescrito.

Provas no código final: `test:all -- --sem-redis` 97/97; roteiros
`emporio-clientes`, `emporio-escolha`, `emporio-romaneio` e `manual-emporio`
verdes. O roteiro `emporio-romaneio` precisa de `pypdf` no python do sistema.

Pendências de produto do Empório que esperam o usuário (registradas em 05/11,
antes da limpeza da Da Mata; confirme com ele se ainda valem):
- o reforço vindo da gerência deve esperar o gestor confirmar, como a sangria?
- as pontas da Q187: amarrar o cliente da venda ao do orçamento, o preço orçado
  valer para qualquer quantidade, e o `sold_at` retroativo pela API;
- imprimir um cupom de 58 e de 80 mm na bobina da loja e um A4;
- o teste de cliente de
  [roteiro-teste-emporio-cliente.md](roteiro-teste-emporio-cliente.md): receber
  o que ele estranhou e separar defeito (branch nova, com roteiro que reprove
  antes) de "faz falta" (conversa de escopo).

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

- O `.env.enc` vazou (commit de 24/08, AES-256-CBC). A reescrita de 02/09 com
  `git filter-repo` não removeu a exposição: o GitHub ainda serve os objetos por
  SHA, verificado depois do force-push.
- Falta, e é do usuário: rotacionar as 22 variáveis (decidido em 02/09, adiado
  em 27/10 pelo Empório), fechar o repositório e pedir ao Suporte do GitHub a
  coleta dos objetos órfãos. Na rotação, o agente guia variável por variável e
  nunca lê nem imprime o valor.
- ⚠️ O espelho `D:\tmp\tibe-backup-pre-rewrite.git` contém o `.env.enc`. Apague
  quando a rotação terminar.
- Alerta do GitGuardian de 06/11 ("Company Email Password exposed", push de
  22:27 UTC): o segredo exato não está confirmado. O candidato provável é o par
  do seed `owner@damata.com.br` / `tibe123`, citado na documentação pública;
  esse email não existe em produção. Falta o usuário mandar a parte do email que
  diz o arquivo e o commit. Proposta feita: trocar o email do seed por um
  domínio de exemplo. Não repita a comparação de senha contra os hashes de
  produção: o classificador bloqueou.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em canário

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe em
[historico/2026-09.md](historico/2026-09.md).

- O fluxo de produção do n8n (`UAAA96aJFiiFsQCL`) é híbrido desde 18/09: o nó
  `Agente Novo?` manda quatro telefones (o usuário e Lucas, Max e Laíza
  Agromax) para a rota de turno; o resto segue no `execute-action`. Decidido em
  29/09: o canário fica com esses quatro até o usuário reabrir o assunto.
- Ler, guardar e mudar a lista: `scripts/n8n-workflow.ts` (escrita só com
  `--confirmar`, cópia antes em `~/.tibe/n8n-copias/`). Escrita no n8n de
  produção quem roda é o usuário. Antes da primeira escrita, `salvar`.
- ⚠️ O JSON do fluxo nunca entra no repositório: carrega a chave da Evolution.
- Ler o canário: `npx tsx scripts/observar-canario.ts [dias]` (só leitura,
  contra produção).
- Faltam os passos 9 e 10 do [roteiro](agente-whatsapp/roteiro-do-chip.md)
  (foto de recibo e o "não" final) e validar no celular três correções de
  29/09 (compra a prazo pergunta se já pagou; "próximos 100 dias" diz a data;
  "30 machos de 0 a 8 meses" vai direto à confirmação).
- As intenções das missões 3 e 4 seguem congeladas no classificador (ver o
  `CLAUDE.md`).

### Outras pendências do usuário

- Trocar o nome do cadastro "Owner Da Mata" em Ajustes (a saudação sai sem
  nome).
- O roteiro do estoque no aparelho:
  [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md), a partir do
  bloco 0.
- A lista geral: [pendencias-do-usuario.md](pendencias-do-usuario.md).

### Ambiente

- Os containers `tibe-pg` e `tibe-redis` caem sozinhos. Se uma suíte travar sem
  mensagem, rode `docker ps` antes de culpar o código.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis.
  Rode `docker exec tibe-redis redis-cli FLUSHALL` (Redis local) e ela passa.
- `npx prisma migrate deploy` contra o Neon pode ser recusado pelo
  classificador mesmo com autorização. Tente uma vez; se bloquear, dê ao
  usuário o comando e confira com `migrate status` antes do push.
- O desktop tem dois clones (`C:\Projetos\tibe-agrogestão` e
  `D:\Projetos\tibe-agrogestão`). Se a 3000 estiver ocupada pelo outro, suba
  este na 3001 e rode `TIBE_BASE="http://localhost:3001" npm run navegador --
  <roteiro>`.
- Roteiro preso em recarga é aba sobrando no Chrome de testes, não defeito.
  Ver o cofre: `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`.
- O roteiro `manual-emporio` regrava todos os PNGs do manual. Antes do commit,
  restaure com `git checkout` os que não mudaram de conteúdo.
- No notebook: `node -v` precisa ser 24.22.1 ou mais; o
  `.claude/settings.local.json` não vai para o git, então lá a migração em
  produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 07/11: pesquisa de mercado, entrevista em 24 decisões e spec do financeiro
  do Empório, revisada por builder (branch `emporio-financeiro-spec`).
- 07/11: plano 3 do Empório (entrega e romaneio) em produção, `c3b2606`; handoff
  arquivado em `historico/2026-11.md`.
- 07/11: planos 1 e 2 do Empório (clientes, fornecedores e a escolha) em
  produção, `ad2a42e`.
- 06/11: Da Mata limpa para a Agromax; equipe do Empório separada dos usuários
  do Tibé (`55dfd81`).
- 05/11: Empório, entregas 2 a 4 (caixa com turno, vendedor e relatórios,
  orçamento), o manual e o cenário de demonstração.
