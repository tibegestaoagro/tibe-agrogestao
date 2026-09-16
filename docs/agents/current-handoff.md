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

- Atualizado em: 2026-09-16.

### Agente do WhatsApp: Fase 1 (fundação) EM PRODUÇÃO

Programa novo, decidido com o usuário em 14/09 (todas as opções recomendadas):
spec [../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
plano da Fase 1 [../superpowers/plans/2026-09-14-agente-whatsapp-fase-1-fundacao.md](../superpowers/plans/2026-09-14-agente-whatsapp-fase-1-fundacao.md),
pesquisa, catálogos por intenção e auditoria do n8n em
[agente-whatsapp/](agente-whatsapp/). O Tibé aceita 55 intenções e o
classificador descrevia 23; a arquitetura muda para estado no Tibé e
classificação em duas etapas dentro do Tibé, com o n8n só transportando.

**Em produção (15/09, com aprovação):** nó `Guarda da Entrada` no workflow
`UAAA96aJFiiFsQCL`, que descarta corpo sem a instância e a chave da Evolution e
todo grupo ou `status@broadcast`. Provado: chamada sem chave parou na guarda
(execução 4923); `npm run wa` respondeu (4924). O `npm run wa` lê instância e
chave na hora, do próprio nó, pela `N8N_API_KEY`. A cópia de homologação
`ctGOlY9OXZWfjeby` foi DESATIVADA. Backup do workflow anterior no scratchpad da
sessão (fora do repositório).

⚠️ **Nenhuma mensagem real tinha passado pela guarda até o fim da sessão.** A
evidência de que o tráfego real passa é que as 15 execuções reais de 14/09
traziam a mesma instância e chave. Conferir as primeiras execuções reais de 15/09
pela API do n8n; se pararem na guarda, restaurar o workflow do backup.

**Fase 1 (fundação) e Fase 2 (turno no Tibé) EM PRODUÇÃO desde 15/09**
(`df74e40` e `f3da082`, com a migração `20260915120000_log_versao_do_prompt`
aplicada no Neon). Confirmação estrita, idempotência por `wamid#intenção`,
handler que nunca grava sem pendente guardado, cursor da conversa, rota
`POST /api/internal/whatsapp/turno` (ainda sem chamador: o n8n passa a usá-la
na Fase 4) e o núcleo `executarIntencao` compartilhado com o `execute-action`.
Suítes `m67` e `m68`. O detalhe das duas fases foi para
[historico/2026-09.md](historico/2026-09.md), e os planos seguem em
`docs/superpowers/plans/`.

⚠️ **Achado da Fase 1 ainda aberto:** "gastei 500 de diesel no trator" vira uso
de estoque no classificador do n8n. O registro de intenções novo desempata, e a
Fase 4 mede isso em conversa real.

### Agente do WhatsApp: Fase 3 (avaliação) EM PRODUÇÃO desde 16/09

Merge `23b8f57`, sem migração, deploy confirmado pelo status da Vercel. Plano
[../superpowers/plans/2026-09-15-agente-whatsapp-fase-3-avaliacao.md](../superpowers/plans/2026-09-15-agente-whatsapp-fase-3-avaliacao.md).
Entregue: executor de avaliação em `scripts/avaliacao/` (medidor de custo com
teto de US$ 30, espera no 429 da conta, fazenda de avaliação no Postgres local,
pontuação por intenção e campo, partição 70/30, relatório em markdown), suíte
`m69`, e **337 casos escritos por cinco autores sem contexto do código** com o
gabarito revisado por um juiz (`scripts/avaliacao/casos/`).

**Modelo escolhido pelo usuário em 16/09: `gpt-5.6-luna`, esforço `low`**, pela
medição fora da amostra: 97,7% de intenção, 95,7% de campos, zero gravação
indevida, p95 5,0 s, US$ 0,29 por mil mensagens. O `gpt-5.6-terra` também
passou (95,5% e 96,4%) e custa dez vezes mais. **Nenhuma linha de negócio nova
indevida em nenhum modelo e em nenhuma rodada** (desde a onda final a contagem
também pega alteração e remoção). Gasto total: US$ 4,93.

⚠️ **A primeira nota não valia, e o erro foi de condução.** A rodada 1 rodou e
foi relatada sem separar a partição guardada, e os três ajustes de prompt foram
escritos com esses casos à vista: nos mesmos casos, o `gpt-5.6-terra` saiu de
84,8% antes do ajuste para 96,8% depois. Corrigido com 50 casos inéditos
(`scripts/avaliacao/casos/forademostra.json`), escritos por autor sem acesso ao
prompt ajustado; é dessa rodada que saem os números acima. O relatório agora
carimba resultado que contenha a partição guardada.

⚠️ **O ajuste de prompt achou três defeitos que valem para qualquer modelo**, e
os três estão corrigidos: a etapa de domínio decide quais intenções a extração
sequer vê (domínio errado vira `ambigua`, e era a causa da maioria dos erros);
campo de mesmo nome em duas intenções do mesmo domínio herdava a descrição da
primeira (o tipo do relatório voltava vazio em 6 de 6 medições); e a trava
anti-alucinação só lia número por extenso até vinte, apagando "sessenta mil"
(`src/lib/agente/trecho-literal.ts`, agora lê composto).

**Pendência do usuário:** `AGENTE_MODELO=gpt-5.6-luna` e `AGENTE_ESFORCO=low`
na Vercel, com redeploy (item 11.5 das pendências). O código já usa esse par
como padrão, então a falta da variável não derruba nada.

**Fica para a Fase 4:** o workflow fino no n8n chamando `POST /api/internal/whatsapp/turno`,
o segundo chip de homologação, e a medição em conversa real. Casos conhecidos e
não resolvidos, todos na partição de ajuste: "duas diária de trator pro João" é
indecidível sem o catálogo do cliente; pergunta sobre período passado
("vendi quantos bois esse mês?") ainda vira consulta em alguns modelos.

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação visual com navegador FUNCIONA nesta máquina** (`browser-harness`),
e foi assim que os Módulos 36 e 37 foram validados. Seis atritos conhecidos:

1. a primeira conexão exige `new_tab(url)` explícito;
2. clique por coordenada não dispara o botão no rodapé do `FormSheet` (use
   `b.click()` por `js`, e no `FormSheet` ache por `button[type=submit]`, porque
   o texto com acento não casa);
3. os ids da árvore de acessibilidade mudam a cada render;
4. ⚠️ **aba em segundo plano PAUSA a animação e imita defeito**: o painel fica
   com `data-state="closed"` sem desmontar e a sobreposição engole todo clique.
   `activate_tab(current_tab())` resolve. Custou duas investigações em 11/09;
5. ⚠️ **o texto passado ao `js(...)` chega com acento corrompido**: case por
   prefixo sem acento, ou monte o caractere com `String.fromCharCode`;
6. a primeira visita a uma rota ainda não compilada estoura o tempo do controle.
   Não é queda: espere e leia de novo, sem renavegar.

⚠️ **Monte cenário de tela com script `tsx`, nunca com `curl`.** O Git Bash
daqui manda acento em Windows-1252, o dado entra torto no banco, e o sintoma
parece defeito de renderização. Modelos prontos: `scripts/_cenario-lista.ts` e
`scripts/_cenario-financeiro-35.ts`.

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
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou, e cada commit que sobe é leitura pública.

**2. Agente do WhatsApp, Fase 4:** escrever o plano (workflow fino no n8n
chamando `POST /api/internal/whatsapp/turno`, segundo chip, blocos de conversa
em homologação pelo tenant de provas) e decidir com o usuário o que a
homologação precisa provar antes de promover. A Fase 4 **depende do segundo
chip**, que continua pendente. Ela herda três defeitos de conversa que a
avaliação achou e que nenhuma mensagem solta mostra: permuta com diferença em
dinheiro não é entendida; a resposta de parcelamento ("35 mil, em 2 vezes")
esgota as tentativas; e a correção de valor antes do "sim" é ignorada, gravando
o valor antigo (esta última é decisão antiga do projeto, e a Fase 4 pode
reabrir). Ainda vale conferir as primeiras execuções reais do workflow depois da
guarda (execução de 2 nós sem "Normalizar e Filtrar" é mensagem barrada).

**3. Do usuário, quando quiser:** `AGENTE_MODELO=gpt-5.6-luna` e
`AGENTE_ESFORCO=low` na Vercel, com redeploy (pendências, item 11.5). O código
já usa esse par como padrão.

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- ⚠️ **A linha que dizia que o Redis local desta máquina era `tibe-redis-local`
  na porta `6390` estava ERRADA**, conferido em 11/09: o container é
  `tibe-redis` na `56379`, como o `CLAUDE.md` documenta. Confira com `docker ps`
  antes de copiar comando de qualquer um dos dois.
