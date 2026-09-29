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

- Atualizado em: 2026-09-29.

### Agente do WhatsApp: o programa (Fases 1 a 6 em produção)

Programa decidido com o usuário em 14/09. Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
planos por fase em `docs/superpowers/plans/`, material de apoio em
[agente-whatsapp/](agente-whatsapp/). O Tibé aceita 55 intenções e o
classificador do n8n descrevia 23; a arquitetura mudou para estado no Tibé e
classificação em duas etapas dentro do Tibé, com o n8n só transportando.

Fase 1 (fundação, `df74e40`), Fase 2 (turno, `f3da082`), Fase 3 (avaliação,
`23b8f57`) e Fase 4 (homologação, `d785e6b`), todas com deploy confirmado. O
detalhe de cada uma foi para [historico/2026-09.md](historico/2026-09.md) e
para os relatórios em [agente-whatsapp/](agente-whatsapp/).

⚠️ **O fluxo de produção é HÍBRIDO desde 18/09:** quem está na lista do canário
fala com a rota de turno, e todo o resto continua no `execute-action`. As
intenções novas só existem para quem está na lista.

**Modelo em uso: `gpt-5.6-luna`, esforço `low`**, escolhido pela medição fora
da amostra da Fase 3 (97,7% de intenção, zero gravação indevida, US$ 0,29 por
mil mensagens). O aparato de avaliação vive em `scripts/avaliacao/` e é
reutilizado a cada fase. Gasto do programa: US$ 5,56 de US$ 30.

⚠️ **Achado da Fase 1 ainda aberto:** "gastei 500 de diesel no trator" vira uso
de estoque no classificador do n8n. Quem está no canário já usa o registro de
intenções novo, que desempata; falta a frase aparecer em conversa real.

### Fase 7: o CANÁRIO ESTÁ NO AR desde 18/09

O fluxo de produção do n8n (`UAAA96aJFiiFsQCL`, 42 nós) tem um desvio
`Agente Novo?` logo depois de `Consolidar Mensagem`: quatro telefones (o
usuário e as três contas Agromax) vão para a rota de turno, e todo o resto
segue pelo caminho antigo, intocado. Decisões na spec, seção "Fase 7".

- **Aplicar e voltar atrás** é o script `aplicar-canario.mjs`, no scratchpad da
  sessão, que salva o fluxo publicado antes de escrever. **O classificador
  bloqueia essa escrita mesmo com autorização**: quem roda é o usuário, como na
  migração do Neon. Voltar atrás foi testado de verdade em 18/09.
- **A semana observada se lê com `npx tsx scripts/observar-canario.ts`** (só
  leitura, contra produção).
- ⚠️ **O JSON do fluxo nunca entra no repositório**: carrega a chave da
  instância da Evolution, e o repositório é público. A fonte da verdade é o
  próprio n8n.
- O telefone do usuário é o do Owner da **Da Mata**, que é tenant real: teste
  feito por ele grava dado de verdade lá.

**Nove dias de uso real (19 a 29/09) acharam o que nenhuma suíte tinha pego**, e
os quatro foram corrigidos e estão em produção (`ffcd053`, `51a8634`, `e1102b4`):

1. "quanto temos a pagar nos próximos 100 dias" respondia "Nenhuma conta a
   pagar no período" com R$ 90 mil vencendo dentro da janela: a consulta parava
   sempre no fim do mês e a intenção nem tinha campo de período.
2. A resposta ecoava a categoria da mensagem ANTERIOR. A causa estava escrita na
   dívida 5.1 desde 16/09, sem nunca ter sido vista acontecer.
3. O vocabulário de categoria recusava "bezerros de 8 a 12 meses": o produtor
   levou oito tentativas para lançar um saldo inicial. Agora a idade dita manda,
   e faixa que cruza duas categorias continua perguntando.
4. "bom dia" caía em "Não entendi". A regra da saudação foi escrita pelo
   usuário e virou resposta pela hora de Brasília com o primeiro nome.

⚠️ **A correção da saudação falhou na primeira mensagem real** ("Oi, bom dia"),
porque a primeira versão comparava a frase inteira contra uma lista fechada.
Lição: lista de frase não cobre combinação.

Dívidas abertas no caminho: **5.3** (uma mensagem, duas respostas) e **5.4**
(pasto respondido com lavoura), as duas sem gravação errada e sem correção
porque mexem no prompt, o que pede rodada de avaliação.

⚠️ **Achado à parte, dívida 3.2:** arquivar um tenant pela Plataforma NÃO tira o
acesso dele. `Tenant.archived_at` não é lido em ponto nenhum do caminho de
acesso.

### Agente do WhatsApp: Fases 4, 5 e 6 EM PRODUÇÃO

Fase 4 (homologação, `d785e6b`), Fase 5 (intenções novas do dinheiro que entra,
`f3148f5`) e Fase 6 (alertas e push, `f370242`), todas com deploy confirmado. O
detalhe foi para [historico/2026-09.md](historico/2026-09.md); os relatórios
estão em [agente-whatsapp/](agente-whatsapp/) e as lições no cofre.

⚠️ **Três achados que valem para quem vier depois:** a revisão independente
reprovou merge nas três fases, sempre com defeito que a suíte e a medição não
alcançavam (gravação indevida de estoque, o "sim" quitando a conta errada, o
controle de notificação inalcançável para OPERADOR). O push nunca tinha
entregado nada até 17/09, e o motivo era a TELA, não o servidor. E produção
TEM a `VAPID_SUBJECT` desde agosto: a afirmação contrária, escrita em 17/09,
era falsa e foi corrigida em todo lugar.

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

**2. O roteiro do aparelho, que o usuário começou em 29/09 e não terminou:**
[agente-whatsapp/roteiro-do-chip.md](agente-whatsapp/roteiro-do-chip.md), feito
com o celular DELE pelo canário, sem chip novo. Os passos que reprovam a rodada
são gravação nos passos 1, 2, 4, 7 e 10; o passo 6 grava de verdade na Da Mata.
Ler o resultado com `observar-canario.ts` e conferir no banco.

**3. Fechar a Fase 7:** com a rodada aprovada e a semana observada limpa, a
lista do desvio vira "todos" e o caminho antigo é desligado. Antes disso,
decidir com o usuário quando a Da Mata inteira entra.

**Do usuário, quando quiser:** o nome do cadastro dele é "Owner Da Mata", e por
isso a saudação sai sem nome. Trocar em Ajustes faz o agente chamá-lo pelo nome.

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
