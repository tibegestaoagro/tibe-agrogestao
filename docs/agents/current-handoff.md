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

- Atualizado em: 2026-09-02.
- Branch de trabalho: **`mao-de-obra-fase-1`**, 11 commits à frente da `main`.
- **Nada foi mesclado nem empurrado.** A `main` está intocada.

### Os Módulos 33 e 34 foram desenhados, e a fase 0 mais a 33.1 estão prontas

Os dois documentos do cliente (`docs/modulo-area-mao-de-obra/` e
`docs/modulo-servico-com-maquinas/`, renomeados porque o nome tinha travessão)
foram lidos por inteiro e viraram design e plano:

- `docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md`
- `docs/superpowers/plans/2026-09-02-fase-0-contatos-e-fase-33-1-mao-de-obra-fixa.md`

**Oito decisões foram tomadas com o usuário antes de qualquer código.** As que
mudam o desenho das próximas fases:

1. **Serviço contratado de terceiro é UM modelo** (`ServiceJob`), não dois. Os
   dois documentos descrevem o mesmo objeto por lados diferentes, e dois modelos
   fariam o produtor escolher a tela pela presença de máquina.
2. **A quantidade trabalhada nunca será campo**: será soma de `ServiceJobLog`,
   pelo mesmo motivo que o saldo do rebanho é soma. Por isso o log nasce na fase
   33.2, embora a tela de lançamento diário só chegue na 34.2.
3. **Não reabrir o Módulo 31.** O §37 de Máquinas ("a prestação de serviço será
   uma negociação") é atendido por consulta, sem `NegotiationType` novo.
4. **`mao_de_obra` tem matriz de permissão PRÓPRIA**: OWNER e ADMIN escrevem,
   OPERADOR e VISUALIZADOR não veem, porque guarda salário. Vale também no
   WhatsApp.

### O que foi entregue nesta rodada (12 tarefas, todas fechadas)

**Fase 0, a tela de contatos** (fecha a linha "tela de contatos" da
`dividas.md` §2.3): `updateContact`, `setContactArchived`, `getContactDetail`,
as rotas `/contacts/[id]` e `/contacts/[id]/archive`, e as telas `/contatos` e
`/contatos/[id]`.

⚠️ **Um defeito de produção foi achado e corrigido de passagem:**
`CONTACT_TYPES` listava 10 dos 13 valores de `ContactType`. `laticinio`,
`queijaria` e `mercado` entraram pelo §24 do Módulo 32 e nunca chegaram na
constante, então **`POST /api/v1/contacts` recusava um laticínio** e
`GET ?type=laticinio` ignorava o filtro em silêncio. O `satisfies readonly
ContactType[]` não pegava: ele confere que cada valor listado é válido, nunca
que a lista é completa. Virou `Record<ContactType, true>`.

**Dívida 3.2 PAGA:** as sete cópias do store de pendência viraram
`pending-store.ts`. 1.307 linhas viraram 1.048, e o mecanismo existe uma vez.
Os sete prefixos de chave foram conferidos contra o git, um a um, **idênticos**:
um prefixo trocado deixaria órfã toda conversa pendente em produção.

⚠️ **Uma diferença de comportamento foi PRESERVADA, não uniformizada:** `herd` e
`stock` recusam número como resposta, os outros cinco aceitam. Virou a opção
`aceitaNumero`. Uniformizar é decisão sobre o caminho do WhatsApp, com banco de
provas, não faxina de refatoração.

**Fase 33.1, a mão de obra fixa:** model `Worker`, quatro enums,
`RelatedModule.mao_de_obra`, `FinancialEntry.worker_entry_kind`, as actions, as
três rotas, as duas telas e os três handlers de WhatsApp.

**Trava nova:** `exigirRedisLocal()`, irmã da `exigirBancoLocal()`. Faltava, e a
falta era do mesmo tamanho: o `.env` aponta para o Redis de PRODUÇÃO, e uma
suíte que só usa Redis passaria inteira pela trava antiga.

### Três defeitos que os testes não teriam pego

1. **A previsão rolante nascia ancorada em HOJE**, não no vencimento da parcela
   quitada. Quem pagasse no dia 2 a parcela do dia 5 recebia outra para o mesmo
   dia 5. Achado porque o teste comparava o MÊS das duas datas, não só "nasceu
   uma".
2. **`db.worker` chegava `undefined` no `next dev`.** A suíte passava (roda em
   processo novo); o servidor estava com o client Prisma antigo em memória,
   porque o singleton fica em `globalThis` e os clients escopados são cacheados
   por tenant. **Vale para toda frente que acrescentar model com o dev de pé:
   reinicie o servidor.**
3. **Todas as rotas davam 404, inclusive `/login`**, por cache podre do
   `.next`. O `curl` distinguiu (`/contatos` dava 307, `/login` dava 404), e
   apagar `.next` mais restart resolveu.

### O que foi validado no navegador, não deduzido

O exemplo do §7 saiu literal: cadastrar "João, vaqueiro, R$ 2.500 por mês, dia
5" faz a listagem mostrar "R$ 2.500,00 em 05/09/2026". Confirmar quitou a de
05/09 e criou a de 05/10. O adiantamento de R$ 500 entrou separado, e a previsão
seguiu em R$ 2.500,00.

Os três lançamentos aparecem em `/financeiro` sob o módulo "Mão de Obra", com
"Marcar como pago / Adiar / Cancelar" de graça. E `bill_due` foi **conferido no
código**: lê `financialEntry` só por status pendente e `due_date`, sem filtrar
módulo, então a previsão gera alerta sozinha.

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

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Enquanto
estiver aberto, todo commit é leitura pública.

**2. A migração no Neon, também do usuário.**
`20260903100000_mao_de_obra_fase_1` está aplicada só no Docker local. O
invariante 3 vale: ela precisa ir para o Neon ANTES de qualquer push, porque a
Vercel faz deploy automático e o build não roda migração. `npm run db:deploy`
contra produção é recusado pelo classificador de permissões mesmo com a marca de
autorização, então quem aplica é você, no terminal.

⚠️ **É UMA migração, não duas.** Este arquivo chegou a afirmar que a da Fase 3
do Leite (`20260902200000_area_leite_fase_3`) também estava pendente. Conferido
contra o Neon em 02/09 com `npx prisma migrate status` (leitura, que passa):
das 42 migrações, a única não aplicada é a da mão de obra. A do Leite já subiu.

O `DATABASE_URL` do `.env` é a URL **Direct** (sem `-pooler`), que é a certa
para migração, então `npm run db:deploy` roda sem passar URL inline.

**3. Só então** merge e push da `mao-de-obra-fase-1`, com autorização explícita.

**4. Depois:** a fase 33.2 (o `ServiceJob` contratado), com a spec de design já
escrita. Ela vai precisar de uma decisão nova sobre o guard: a diária de um
serviço não tem a sensibilidade de um salário, e travar o OPERADOR fora dela
impediria quem está no curral de registrar o trabalho do dia.

**Continuam esperando, de rodadas anteriores:** os dois pedidos do cliente do
Confinamento (`dividas.md` §2.8), a correção do rebanho invisível (§2.9), e três
decisões de produto do Leite (média diária por dias corridos; cabeçalho de uma
fazenda com armazenamento de todas; fechamento sem data nascendo "Vencida").

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
