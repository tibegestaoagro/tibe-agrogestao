# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima**,
e voltou a 442 em 02/09. Se ele passar de umas 200, arquive antes de
acrescentar. O de agosto está em `historico/2026-08.md`, o de setembro em
`historico/2026-09.md`.
## Estado atual

- Atualizado em: 2026-10-27.

### Programa de dívidas (07 a 14/10): encerrado, E0 a E10 em produção

⚠️ **Regra do Codex desde 07/10 (o limite de uso dele chegou a 90%):**
`adversarial-review` sempre com `--model gpt-5.6-terra` (intermediário; o
esforço padrão dele já é `medium`, e o comando não aceita `--effort`); **no
máximo 2 rodadas por etapa** (a primeira já pedindo só o bloqueante, a
segunda só para confirmar); o que sobrar vira dívida registrada; **etapa só
visual não passa pelo Codex** (quem pega defeito ali é o navegador). Não
editar `~/.codex/config.toml`: vale para todo o Codex do usuário.

O usuário aprovou em 07/10 um programa para fechar as dívidas de
[dividas.md](dividas.md) em etapas E0 a E11, uma branch por etapa, cada uma com
revisão adversarial do Codex e validação viva antes do merge. O plano está
fora do repositório (`~/.claude/plans/ok-agora-com-esse-vivid-petal.md`, só no
desktop); as decisões ficam resumidas aqui.
Decisões: 3.2 arquivado BLOQUEIA (vence o selo interno, preservando a janela
de leitura do cancelamento); 2.6 token novo `--texto-marca`/`--borda-marca`;
2.7 contorno nos chips de `/docs`; 5.5 frase com verbo + quantidade +
categoria substitui o pedido; 5.2 `contact_id` direto, negociação como
complemento; 2.3 entram os quatro itens; entram também unaccent, rebase do app
mobile, contratos e pasto com avaliação. Fora: 1.1, 1.3, 2.4.

**E0 (mod `guarda-contexto`):** ver a seção do mod no `CLAUDE.md`. **Ainda não
provado ao vivo:** o resumo terminar e a retomada sair (em headless o resumo
não concluiu). A primeira sessão interativa que passar de 90% é a prova.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em CANÁRIO

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md)
(uma seção de decisões por fase), planos em `docs/superpowers/plans/`,
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe das fases em
[historico/2026-09.md](historico/2026-09.md). Modelo `gpt-5.6-luna`, esforço
`low`; gasto do programa US$ 5,82 de US$ 30.

**O fluxo de produção do n8n é HÍBRIDO desde 18/09.** `UAAA96aJFiiFsQCL` (42
nós) tem o desvio `Agente Novo?` logo depois de `Consolidar Mensagem`: quatro
telefones (o usuário, que é o Owner da **Da Mata**, tenant real, e Lucas, Max e
Laíza Agromax) vão para a rota de turno; todo o resto segue no `execute-action`,
intocado. As intenções novas só existem para quem está na lista.

- **A lista mora na expressão do nó `Agente Novo?`**, no próprio n8n. É ali que
  se põe a Da Mata inteira, ou se esvazia para desligar o canário.
- **Ler, guardar, aplicar e mexer na lista: `scripts/n8n-workflow.ts`**
  (29/09, recriado no repositório depois que os de 18/09 sumiram com o
  scratchpad; lição `o-scratchpad-some-e-leva-o-voltar-atras`). Toda escrita
  mostra o que muda, só grava com `--confirmar`, e salva antes uma cópia em
  `~/.tibe/n8n-copias/` (fora do repositório: o JSON tem a chave da Evolution).
  Voltar atrás = `aplicar <cópia> --confirmar`, ou `canario --ninguem`.
  Escrita e volta provadas na cópia de homologação (inativa); o passo de
  **publicar** (n8n 2.x: salvar deixa em rascunho) só roda em fluxo ativo e
  ainda não foi exercitado: o script confere e avisa se ficar rascunho. Não
  existe cópia do fluxo de produção anterior a 18/09 (sumiu): antes da
  primeira escrita, `salvar`.
- ⚠️ **O classificador bloqueia escrita no n8n de produção e escrita
  destrutiva no banco de produção**, mesmo com autorização: quem roda é o
  usuário, como na migração do Neon. Leitura é livre.
- ⚠️ **O JSON do fluxo nunca entra no repositório**: carrega a chave da
  instância da Evolution.
- **Ler o canário:** `npx tsx scripts/observar-canario.ts [dias]` (conversa
  inteira, entrada e saída, só leitura, contra produção). Para ver quais nós
  rodaram (áudio, buffer), a API de execuções do n8n; o script que fazia isso
  morava no scratchpad.

O detalhe de 29/09 (seis defeitos do canário, roteiro do aparelho com passos
1 a 7 aprovados, dívidas 5.3 e 5.6 fechadas) foi para
[historico/2026-09.md](historico/2026-09.md). Faltam os passos 9 e 10 do
roteiro (foto de recibo e o "não" final).

### Meu Empório (Módulo 39, 27/10): F0 pronta na branch, validada ao vivo

**F0 (liberação e fundação)** na branch `emporio-f0` (a partir de
`spec-modulo-37-emporio`), empurrada, **não mergeada**. Migração
`20261027120000_emporio_f0` aplicada **só no Docker: falta o Neon**, antes
de qualquer push na `main`. `TenantFeature`/`TenantFeatureUser`,
`Establishment`, perfil `emporio`, `StockMovement.property_id` anulável com
CHECK de exatamente um local, e os funis do estoque da fazenda filtrando
`property_id` não nulo. Cartão "Recursos em teste" no detalhe da conta da
Plataforma. Provas: `tsc` 0, `check` 0 falhas, `test:m77` verde (seção 12
vermelha antes da correção dos funis), `test:all` 79/80 com a `m73`
corrigida depois. Validação viva, seis passos aprovados no navegador
(desligado: sem menu e 404; ligar só o Owner, com a recusa da lista vazia;
página e API 200; estoque da fazenda igual; desligar e religar preservando a
lista; conta só de Empório). Ela achou dois defeitos, corrigidos: a sidebar
ignorava o `show` dos links de topo (anterior à F0) e o Painel rotulava
`emporio` como "Prestador". Observado e não mexido: na conta só de Empório,
o Meu Dia diz "SUA FAZENDA" e o menu mostra Calculadora Pecuária e Fazenda
em Números (igual às contas só de prestador hoje).

Cenário local: `scripts/_cenario-emporio-f0.ts` (conta
`so-emporio@teste.local`) e `scripts/_sessao-local.ts --plataforma`.

Documento do cliente em `docs/area-meu-emporio/` (`.doc` binário; como ler
está no topo da spec). Entrevista com o usuário em cinco rodadas, Q1 a Q49,
registrada em [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(`1b2e871`, branch `spec-modulo-37-emporio`, empurrada, não mergeada).
Cortes de escopo viraram as dívidas 2.15 a 2.21. Teste na **Da Mata**, só
para o Owner, liberado por uma `TenantFeature` nova (genérica, com lista de
usuários). Sete fases (F0, F1, F2a, F2b, F3, F4, F5), aprovação entre elas.

### Dependências com falha de segurança (26/10): `npm audit` de 19 para 0

Em produção desde 26/10 (`74c9119`), três branches validadas (suíte 79/79,
CI, preview pelo usuário): next 16.4.3, react 19.2.9, zod 4.6.7; prisma 7.10.1
mais `audit fix` sem force; nodemailer 10.2.1 com `overrides`. O porquê de
cada uma está na mensagem do commit. Relatório da pesquisa, só no desktop e
fora do repo: `D:\Projetos\reports\Falhas de segurança do app Tibe.md`.

⚠️ Duas lições novas no cofre: `npm-audit-fix-force-troca-o-next-auth-por-outro-pacote`
e `o-preview-da-vercel-escreve-em-producao` (o teste de reset no preview mandou
código ao Owner da Da Mata). **No notebook, `node -v`: precisa ser 24.22.1
ou mais** (`winget upgrade --id OpenJS.NodeJS.LTS`).

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação com navegador (`browser-harness`) funciona, e desde 27/10
roda num Chrome só de testes:** `npm run navegador -- <roteiro>` (seção no
`CLAUDE.md`); o primeiro roteiro é o `emporio-f0`, 31 itens. Os seis atritos
que imitam defeito (aba oculta, leitura cedo, acento no `js()`) estão no cofre:
`a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`. Cenário de tela se
monta com script `tsx` (`scripts/_cenario-lista.ts`), nunca com `curl`.

### 🔴 SEGURANÇA: o repositório está PÚBLICO e o `.env.enc` vazou

Descoberto em 2026-09-02, ao instalar o `gh`. `CLAUDE.md` dizia (e foi
corrigido) que o repositório era privado. Ele é **público**, e nada registrava
essa mudança como deliberada.

**O que vazou:** o `.env.enc` commitado em 24/08 e removido da árvore em 27/08,
2.048 bytes, AES-256-CBC com PBKDF2 e 600 mil iterações. A mensagem daquele
commit descreve o conteúdo (as 22 variáveis, a `DATABASE_URL` de produção, a
`CONFIG_ENCRYPTION_KEY`), o que é um mapa para quem atacar.

**O que foi feito:** reescrita de histórico com `git filter-repo` e force-push
em 02/09. Clone novo do GitHub não tem mais o arquivo, e os 471 commits foram
preservados. **Os SHAs de TODA a história mudaram.**

⚠️ **A reescrita NÃO removeu a exposição, e isso foi VERIFICADO, não assumido.**
Depois do force-push, `GET /repos/.../commits/cbe4afba1cc...` e
`GET /repos/.../git/blobs/9eb485a5d359...` continuam respondendo, o segundo com
`size: 2048`. O GitHub guarda objetos inalcançáveis e serve por SHA. Com o
repositório público, esses dois `GET` funcionam sem autenticação.

**O que falta, e é do usuário:**

1. **Rotacionar as 22 variáveis.** É o único caminho que funciona
   independentemente de quem já copiou. Decidido pelo usuário em 02/09.
2. **Fechar o repositório.** Exige a conta `tibegestaoagro`: o `dilton-pleno`
   tem `push` mas não `admin`, e o `gh` devolve 404 na troca de visibilidade.
3. **Pedir ao Suporte do GitHub** a coleta dos objetos órfãos. É o único jeito
   de apagar do servidor deles.

⚠️ **O espelho do histórico antigo está em
`D:\tmp\tibe-backup-pre-rewrite.git`, e ele CONTÉM o `.env.enc`.** Apague
quando a rotação terminar.

⚠️ **O clone da outra máquina quebrou** com a reescrita. Lá, antes de tudo:
`git fetch --all --prune`, depois `git checkout main && git reset --hard
origin/main`. Trabalho não empurrado precisa virar patch antes.

### ⏭️ PRÓXIMO PASSO

**Meu Empório:** o usuário aprova o aceite da F0. Para ir a produção, com
autorização a cada passo: migração `20261027120000_emporio_f0` no Neon (URL
Direct), merge da `emporio-f0` (que leva junto a spec), e o usuário liga o
recurso na Da Mata pela Plataforma. A F1 só começa com aprovação. A rotação de segurança
(item 1) foi adiada pelo usuário em 27/10 para tratar do Empório.

**0. Programa de dívidas ENCERRADO: E0 a E11 em produção** (E11, `ccf1474`).
E10 (2.3): filtros do §19, pasto, forma de pagamento e peso/arroba (`31027e1`,
migração no Neon pelo usuário antes do push). **14/10: `.env` é o Neon e
`.env.local` o Docker**; suítes e seeds leem `scripts/_env-local.ts`, o Prisma
CLI só o `.env` (tabela no `CLAUDE.md`). O que sobrou para o usuário está no
item 12 de [pendencias-do-usuario.md](pendencias-do-usuario.md). Depois, em
produção: 2.8 (`229b957`), 5.12 (`dcbbd73`, `m75`), 3.3 (`78829e1`:
o agente segue a régua do painel; `m76`). 4.1 servidor em produção
(`cdd6473`: sete domínios no pacote, seção por domínio na `m73`). **n8n, 14/10:
`Execute Action` manda `provider_message_id`** (1ª chave vista em produção).
`npm run wa` lê só o `.env`, mas o `REDIS_URL` dele é local: não vê resposta. 5.13/5.15/5.10 paradas. 5.0a em produção (`2ff9a3b`). **5.9 em produção
(`divida-5-9-ja-recebeu`, só no canário)**: leilão e permuta perguntam se o dinheiro entrou
(`m48`, `m49`; avaliação em `avaliacao-fase-8.md`), Codex aprovou. 16/10, canário: "3 novilhas" na permuta dizia "é máquina ou produto"; agora pergunta a faixa, e a faixa sobrevive à pergunta do vencimento (`m49` bloco 18; validado no aparelho em 19/10, com a 5.9). 2.3 fechada
por decisão; 2.4 espera a conversa com a Agromax ([roteiro](roteiro-agromax-rebanho-por-categoria.md)). E3-E9: [historico/2026-10.md](historico/2026-10.md). **Próximo no aparelho (26/10): o [roteiro do estoque](roteiro-aparelho-estoque.md), blocos 0 a 5; a Da Mata não tem produto (lido em produção), então começa pelo bloco 0 no painel.**

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou, e cada commit que sobe é leitura pública. **27/10: o usuário decidiu
começar agora**, logo depois das dependências. É o próximo trabalho da
sessão: guiar a rotação variável por variável (o agente nunca lê nem imprime
o valor; quem troca no painel de cada serviço e na Vercel é o usuário), e só
então apagar `D:\tmp\tibe-backup-pre-rewrite.git`.

**2. Do usuário, pequeno:** trocar o nome do cadastro "Owner Da Mata" em
Ajustes, que é por isso que a saudação sai sem nome.

**3. Fechar a Fase 7, quando o usuário quiser:** passos 9 e 10 do
[roteiro](agente-whatsapp/roteiro-do-chip.md). **Decidido em 29/09: o canário
fica com os 4 telefones de hoje**; ampliar a lista não está no plano até o
usuário reabrir o assunto. Quando reabrir: Da Mata inteira, depois "todos" e
desligar o `execute-action`. As duas trocas de lista são
`npx tsx scripts/n8n-workflow.ts canario <telefones...> --confirmar` e
`... canario --todos --confirmar`, rodadas pelo USUÁRIO (escrita no n8n de
produção). Antes da primeira, `... salvar`.

**4. Validar no celular as correções de 29/09** que ainda não foram exercitadas
em conversa real: "comprei 10 sacas de sal do Zé por 200" tem que perguntar se
já pagou; "quanto tenho a pagar nos próximos 100 dias" tem que dizer até que
data olhou; "comprei 30 machos de 0 a 8 meses" tem que ir direto à confirmação.

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- O Redis local é `tibe-redis` na `56379` (conferido em 11/09); `docker ps` antes.
  No desktop (clone novo em `D:\Projetos\tibe-agrogestão`, 26/10) existia um
  `tibe-redis-local` na `6390` que o `.env.local` não usa: foi parado e o
  `tibe-redis` criado. O `.env` e o `.env.local` desse clone vieram da pasta
  do usuário no OneDrive (`tibe-docs`), e o banco local recebeu as 12
  migrações que faltavam.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis;
  `docker exec tibe-redis redis-cli FLUSHALL` (Redis LOCAL) e ela passa.
