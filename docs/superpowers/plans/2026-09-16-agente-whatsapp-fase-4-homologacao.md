# Agente do WhatsApp, Fase 4: homologação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** provar o turno da Fase 2 em CONVERSA, não em frase solta, e deixar o workflow fino do n8n pronto e testado apontando para `POST /api/internal/whatsapp/turno`, sem encostar no fluxo de produção.

**Architecture:** duas frentes que se cruzam no fim. A frente semântica escreve blocos de conversa de vários passos (o que a Fase 3 já sabe rodar: `tipo: "conversa"`, `grava: nao|pode|deve`, contagem de linhas de negócio antes e depois de cada passo) e mede o `gpt-5.6-luna` contra eles no aparato de `scripts/avaliacao/`, em processo, contra a fazenda de avaliação no Postgres local. A frente de transporte monta o workflow fino na CÓPIA de homologação do n8n (`ctGOlY9OXZWfjeby`, hoje desativada), com webhook próprio: guarda, normalização, áudio, recibo, buffer de mensagem picada, consolidação, uma chamada à rota de turno, e o envio pelo `/send-message` do Tibé, que é o que a caixa de saída (`src/lib/whatsapp-outbox.ts`) já deixa legível por programa. O banco de provas (`npm run wa`) ganha um alvo, para exercitar essa cópia de ponta a ponta sem ninguém com o celular na mão.

**Tech Stack:** TypeScript, tsx, Prisma 7 (Postgres local), Redis local, n8n (API pública, `N8N_API_KEY`), Evolution API, OpenAI (`gpt-5.6-luna`, esforço `low`).

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (fase 4 da tabela de fases, "Critérios de aceite do programa"). Decisões de 16/09 registradas na Task 0 abaixo.

## Global Constraints

- **O fluxo de produção (`UAAA96aJFiiFsQCL`) não é tocado nesta fase.** Nenhuma task altera, ativa, desativa ou reordena nó dele. A troca do fluxo de produção é a Fase 7. Ler o workflow de produção pela API é permitido e necessário (é de lá que sai o desenho dos nós de mídia).
- **A cópia de homologação (`ctGOlY9OXZWfjeby`) nasce e continua INATIVA.** Ativar workflow no n8n é efeito fora deste repositório: exige autorização do usuário na conversa, a cada vez. O teste de ponta a ponta usa o webhook de teste ou a ativação temporária que o usuário autorizar.
- **O segundo chip NÃO existe ainda** (decisão do usuário em 16/09). Nada neste plano pode depender de um número novo. O que só o chip resolve vira roteiro escrito, na Task 6.
- Toda mensagem de teste usa `WA_TEST_PHONE` e o tenant de PROVAS. A guarda por NOME do tenant que já existe em `scripts/whatsapp-e2e.ts` continua valendo, e nenhuma task a afrouxa.
- Modelo: `gpt-5.6-luna`, `AGENTE_ESFORCO=low`. Esta fase NÃO reabre a escolha de modelo.
- Orçamento: o teto de US$ 30 da Fase 3 continua valendo e já consumiu US$ 4,93. Esta fase gasta **no máximo US$ 5**; o medidor de `scripts/avaliacao/medidor.ts` já para sozinho.
- Nenhuma suíte automatizada (`test:m68`, `test:m69`, `test:all`) chama a OpenAI, o n8n ou a Evolution. Só os comandos de rodada real fazem chamada de rede, e só quando a task manda.
- Segredo nenhum (`INTERNAL_API_SECRET`, `N8N_API_KEY`, chave da instância da Evolution, `OPENAI_API_KEY`) é impresso, logado, escrito em arquivo do repositório ou colado na conversa. O repositório é PÚBLICO.
- O JSON do workflow do n8n não entra no repositório: ele carrega a chave da instância. Backup vai para o scratchpad da sessão, e o que entra em `docs/` é a descrição dos nós.
- Regras vinculantes das Fases 1, 2 e 3 continuam. `npm run test:m67`, `test:m68`, `test:m69` e `npm run check` verdes ao fim de cada task que toca código.
- Nunca travessão (U+2014). Nunca heredoc para escrever conteúdo com escape. Commits em português, `git add` só dos arquivos tocados.

## Task 0: as decisões de 16/09/2026

Tomadas com o usuário antes de escrever este plano, as duas na opção recomendada:

| tema | decisão |
|---|---|
| chip | **ainda não existe.** A Fase 4 entrega o workflow fino e os blocos de conversa medidos contra a rota de turno; o gate no aparelho fica engatilhado, com roteiro pronto, para o dia em que o chip conectar |
| onde o workflow fino entra | **só na cópia de homologação** (`ctGOlY9OXZWfjeby`). O fluxo de produção fica intocado até a Fase 7, como a spec prevê |

---

### Task 1: os blocos de conversa, escritos por testadores sem contexto

**Files:**
- Create: `scripts/avaliacao/briefing/homologacao.md`
- Create: `scripts/avaliacao/casos/homologacao.json`
- Modify: `scripts/avaliacao/validar.ts` (só se a validação reprovar algo legítimo do formato de conversa)

**Interfaces:**
- Consumes: `scripts/avaliacao/tipos.ts` (`CasoConversa`, `PassoDeConversa`, `Gravacao`), já existente e inalterado.
- Produces: `casos/homologacao.json`, um array de `CasoConversa` com `autor: "conversa"`, consumível por `npm run avaliacao:rodar -- --arquivo homologacao.json`.

**Por que assim:** o aparato da Fase 3 já roda conversa de vários passos contra a fazenda de avaliação e conta linha de negócio por passo. Escrever um segundo aparato mediria o aparato novo, não o agente. Os blocos entram como mais um arquivo de casos.

- [ ] **Step 1: escrever o briefing dos testadores**

`scripts/avaliacao/briefing/homologacao.md`, no mesmo molde dos briefings da Fase 3, com estas instruções literais:

- Você escreve blocos de CONVERSA, não frases soltas. Um bloco tem de 2 a 6 passos.
- Você não tem acesso ao código, ao prompt do agente nem aos casos que já existem. Escreva como um produtor rural de verdade escreve no WhatsApp: sem pontuação, com abreviação, com erro de digitação, mudando de ideia no meio.
- Cada passo leva `grava`: `"nao"` (este passo não pode gravar NADA no sistema), `"pode"` (pede um registro, e o assistente pode perguntar antes de gravar) ou `"deve"` (confirmação explícita de algo que o assistente acabou de mostrar; tem que gravar).
- `nota` em todo passo cuja intenção não seja óbvia pela frase.

As sete categorias dos critérios de aceite, uma seção cada, com no mínimo 5 blocos por categoria:

1. **recusa**: o produtor pede, o assistente pergunta, e o produtor recusa ("não", "deixa pra lá", "esquece", "cancela", "era brincadeira").
2. **correção no meio**: o produtor dá um valor e corrige antes de confirmar ("foram 20... não, 25").
3. **duas coisas numa mensagem**: dois pedidos de áreas diferentes na mesma frase.
4. **mensagem picada**: um pedido quebrado em 2 ou 3 passos curtos que só fazem sentido juntos.
5. **áudio transcrito**: texto corrido, sem pontuação, com muleta de fala ("é... então... ó").
6. **resposta curta**: "sim", "s", "isso", "pode ser", "aham", "3" como resposta a uma pergunta do assistente.
7. **"sim" fora de hora**: "sim" sem nada pendente, ou "sim" depois de uma consulta que não pergunta nada. **Nenhum desses passos pode gravar.**

- [ ] **Step 2: despachar cinco testadores, um por lote de categorias**

Cinco subagentes `general-purpose`, modelo padrão, cada um com o briefing e NADA do repositório além dele. Cada um devolve um `.json` no scratchpad. Divisão: (1) recusa; (2) correção no meio; (3) duas coisas numa mensagem; (4) mensagem picada e áudio transcrito; (5) resposta curta e "sim" fora de hora.

- [ ] **Step 3: juntar, revisar com um juiz e gravar**

Um subagente juiz (modelo mais capaz), com o briefing e os cinco arquivos, revisa: `grava` coerente com o passo, id único, nenhum bloco duplicado entre autores, nenhum passo pedindo o que o Tibé não faz. Ele devolve o arquivo único. Grave em `scripts/avaliacao/casos/homologacao.json` e registre a revisão em `scripts/avaliacao/casos/revisao-homologacao.md`.

- [ ] **Step 4: validar o formato**

Run: `npm run avaliacao:validar`
Expected: PASS, e a contagem de `homologacao.json` aparece no resumo com pelo menos 35 blocos.

- [ ] **Step 5: commit**

```bash
git add scripts/avaliacao/briefing/homologacao.md scripts/avaliacao/casos/homologacao.json scripts/avaliacao/casos/revisao-homologacao.md
git commit -m "Agente: blocos de conversa da homologacao, escritos sem contexto do codigo"
```

---

### Task 2: medir os blocos contra o modelo escolhido

**Files:**
- Create: `docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md`
- Modify: `docs/agents/current-handoff.md` (só a linha de estado)

**Interfaces:**
- Consumes: `casos/homologacao.json` da Task 1.
- Produces: o relatório, e a lista numerada de defeitos que a Task 3 corrige.

- [ ] **Step 1: subir banco e Redis locais**

Run: `docker start tibe-pg tibe-redis`
Expected: os dois nomes impressos. Se `docker ps` não os mostrar, suba o Docker Desktop antes.

- [ ] **Step 2: rodar os blocos**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run avaliacao:rodar -- --rodada homologacao-1 --modelos gpt-5.6-luna --arquivo homologacao.json --particao todas
```

Expected: código de saída 0, nenhum modelo interrompido, gasto da rodada abaixo de US$ 2.

- [ ] **Step 3: gerar o relatório**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run avaliacao:relatorio -- --rodada homologacao-1
```

Salve em `docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md`.

- [ ] **Step 4: ler passo a passo toda gravação indevida e toda confirmação que não gravou**

Isto é leitura humana do relatório, não um número agregado: cada `indevida: true` e cada `faltou: true` vira um item numerado com a frase do passo, o que gravou (ou não) e a causa provável. **Gravação indevida é eliminatória**: qualquer ocorrência vira item obrigatório da Task 3.

⚠️ A Fase 3 já provou que o agregado engana: o gate de "confirmação que não gravou" reprovou dois modelos aprovados por gabarito ruim, e virou sinal, não critério. Leia o caso antes de chamar de defeito.

- [ ] **Step 5: commit**

```bash
git add docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md docs/agents/current-handoff.md
git commit -m "Agente: medicao dos blocos de conversa da homologacao"
```

---

### Task 3: corrigir o que os blocos acharem

**Files:**
- Modify: conforme o defeito, entre `src/lib/agente/*` e `src/lib/actions/whatsapp-handlers/*`
- Modify: `scripts/m68-agente-turno.test.ts` (um caso por defeito corrigido)

**Interfaces:**
- Consumes: a lista numerada da Task 2, Step 4.

**Regra de corte:** entram nesta task os defeitos de gravação indevida (todos, sem exceção) e os de conversa que reaparecem em mais de um bloco. Defeito de intenção isolado, sem gravação errada, vira linha em `docs/agents/dividas.md` e não segura a fase. Três casos JÁ CONHECIDOS e deliberadamente fora de escopo, herdados da Fase 3: permuta com diferença em dinheiro, resposta em parcelas ("35 mil, em 2 vezes"), e correção de valor antes do "sim".

- [ ] **Step 1: por defeito, escrever o caso que falha ANTES da correção**

Em `scripts/m68-agente-turno.test.ts`, um caso por defeito, com a frase literal do bloco.

- [ ] **Step 2: rodar e ver falhar**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m68
```
Expected: FAIL, nomeando o caso novo. **Caso que passa antes da correção não prova nada: troque o caso, não a correção.**

- [ ] **Step 3: corrigir na raiz**

Antes de editar, `grep` por todos os chamadores da função que você vai tocar. Guarda na função compartilhada, nunca uma por chamador.

- [ ] **Step 4: rodar a suíte inteira do agente**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m67 && ... npm run test:m68 && ... npm run test:m69
```
Expected: PASS nas três.

- [ ] **Step 5: remedir os blocos**

Repita a Task 2, Steps 2 e 3, com `--rodada homologacao-2`. Expected: zero gravação indevida.

- [ ] **Step 6: commit**

```bash
git add src/lib/... scripts/m68-agente-turno.test.ts docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md
git commit -m "Agente: correcoes achadas pelos blocos de conversa"
```

---

### Task 4: o workflow fino na cópia de homologação

**Files:**
- Create: `docs/agents/agente-whatsapp/workflow-fino-fase-4.md` (descrição dos nós, sem segredo e sem JSON)
- Backup do JSON: scratchpad da sessão, FORA do repositório

**Interfaces:**
- Consumes: `POST /api/internal/whatsapp/turno`, corpo `{ telefone, texto, provider_message_id?, recibo? }`, header `x-internal-secret`, resposta `{ ok: true, data: { mensagens, replay } }`.
- Produces: o workflow `ctGOlY9OXZWfjeby` reescrito, INATIVO, com webhook em caminho próprio (`/webhook/homologacao`, nunca `/webhook/atendimento`).

**Agente:** `n8n-fluxo`. Ele lê `docs/agents/agente-whatsapp/auditoria-n8n-2026-09-14.md` (seção 1.1, o diagrama) antes de desenhar.

**O que o fluxo fino tem, em ordem:**

1. `Webhook` em `/webhook/homologacao`, sem `pinData`.
2. `Guarda da Entrada`: o mesmo nó da produção, que descarta corpo sem a instância e a chave da Evolution, e todo grupo ou `status@broadcast`. Copiado como está, com a chave lida do nó de produção na hora da montagem.
3. `Normalizar e Filtrar`: idêntico ao da produção, e é aqui que o `message_id` do texto passa a ser preservado (a produção perde: ver auditoria 1.1), porque a rota de turno usa `provider_message_id` para idempotência.
4. Ramo de áudio: `Buscar Mídia` + `Transcrever Áudio` + `Interpretar Transcrição`, como na produção. A transcrição vira o `texto` do turno.
5. Ramo de recibo: `Buscar Mídia` + `Extrair Recibo` + `Parse`, como na produção. O resultado vira o campo `recibo` do turno, e `texto` vai vazio.
6. `Buffer Append` / `Aguardar Fragmentos` (12 s) / `Buffer Flush` / `Deve Responder?` / `Consolidar Mensagem`: como na produção, sem mudança.
7. **`Chamar Turno`**: UMA chamada `POST {TIBE}/api/internal/whatsapp/turno` com `x-internal-secret`, corpo `{ telefone, texto, provider_message_id, recibo }`.
8. `Enviar Respostas`: itera `data.mensagens` e manda cada uma por `POST {TIBE}/api/internal/whatsapp/send-message`, o mesmo nó de envio da produção, que é o que alimenta a caixa de saída.

**O que SAI do n8n nesta cópia, porque agora vive no Tibé:** `Resolve Contact`, `Identificado?`, `Primeiro Contato?`, `Classificar Intenção`, `Parse Resposta LLM`, `Execute Action`, `Separar Respostas`, `Deve Humanizar?`, `Humanizar`, `Validar Números`. Dez nós a menos.

- [ ] **Step 1: baixar o JSON dos dois workflows pela API e guardar o backup**

`GET /api/v1/workflows/UAAA96aJFiiFsQCL` e `GET /api/v1/workflows/ctGOlY9OXZWfjeby`, salvos no scratchpad. **Confira que nenhum dos dois caminhos está dentro do repositório antes de escrever.**

- [ ] **Step 2: montar o JSON da cópia**

Com os nós acima, `active: false`, e o caminho de webhook próprio.

- [ ] **Step 3: subir pela API**

`PUT /api/v1/workflows/ctGOlY9OXZWfjeby`. Expected: 200, e um `GET` de volta mostrando a contagem de nós esperada e `active: false`.

- [ ] **Step 4: escrever a descrição dos nós**

`docs/agents/agente-whatsapp/workflow-fino-fase-4.md`: a lista em ordem, o que cada nó consome e produz, e o que foi removido em relação à produção. Sem JSON, sem URL com chave, sem segredo.

- [ ] **Step 5: commit**

```bash
git add docs/agents/agente-whatsapp/workflow-fino-fase-4.md
git commit -m "Agente: workflow fino da homologacao chamando a rota de turno"
```

---

### Task 5: o banco de provas apontando para a homologação

**Files:**
- Modify: `scripts/whatsapp-e2e.ts`
- Modify: `docs/agents/banco-de-provas-whatsapp.md`

**Interfaces:**
- Produces: `npm run wa -- --homologacao diga "..."`, que manda para `/webhook/homologacao` e lê a resposta na mesma caixa de saída.

**Por que parametrizar em vez de duplicar:** um segundo script seria uma cópia do banco de provas, e cópia de fluxo é exatamente o falso positivo que o cabeçalho do arquivo já alerta. O alvo vira um parâmetro; o resto do script é o mesmo.

- [ ] **Step 1: trocar as duas constantes por um alvo**

```ts
const ALVOS = {
  producao: { workflow: "UAAA96aJFiiFsQCL", caminho: "atendimento" },
  homologacao: { workflow: "ctGOlY9OXZWfjeby", caminho: "homologacao" },
} as const;

function alvo(): (typeof ALVOS)[keyof typeof ALVOS] {
  return process.argv.includes("--homologacao") ? ALVOS.homologacao : ALVOS.producao;
}
```

`webhookUrl()` passa a usar `alvo().caminho`, e a leitura da guarda passa a usar `alvo().workflow`. **O padrão continua sendo produção**, para não mudar o comportamento de quem já usa o comando.

- [ ] **Step 2: imprimir o alvo na primeira linha da saída**

Uma linha só, `alvo: homologacao (/webhook/homologacao)`. Sem isso, uma rodada lida depois não diz contra o que rodou, e isso já custou uma nota inteira nesta fase 3.

- [ ] **Step 3: provar que o alvo muda**

Rode `npm run wa -- --homologacao estado` e confira a linha de alvo. Expected: `homologacao`. Rode `npm run wa estado`. Expected: `producao`.

- [ ] **Step 4: rodada de ponta a ponta pela cópia**

Precisa do workflow ATIVO, e ativar é efeito fora do repositório: **peça a autorização do usuário nesta hora**, ative, rode o roteiro, desative de novo. O roteiro tem, no mínimo: uma mensagem simples que grava, uma mensagem picada em três pedaços, um "não" que recusa, um "sim" fora de hora, e a mesma mensagem repetida duas vezes com o mesmo `message_id` (idempotência).

Expected: cada resposta lida na caixa de saída; nenhuma linha de negócio nova nos dois passos de recusa e de "sim" fora de hora; a mensagem repetida não grava duas vezes.

- [ ] **Step 5: registrar o resultado**

Em `docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md`, uma seção "Ponta a ponta pelo n8n" com o que passou e o que faltou.

- [ ] **Step 6: commit**

```bash
git add scripts/whatsapp-e2e.ts docs/agents/banco-de-provas-whatsapp.md docs/agents/agente-whatsapp/homologacao-fase-4-blocos.md
git commit -m "Agente: banco de provas escolhe o alvo, e a rodada pela copia de homologacao"
```

---

### Task 6: o que só o chip resolve, escrito para o dia em que ele chegar

**Files:**
- Create: `docs/agents/agente-whatsapp/roteiro-do-chip.md`
- Modify: `docs/agents/pendencias-do-usuario.md` (item 11.2 ganha o roteiro; item 11.5 vira feito)
- Modify: `docs/agents/current-handoff.md`
- Modify: `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (seção "Fase 4: decisões de 16/09/2026")

- [ ] **Step 1: escrever o roteiro**

Escrito PARA O USUÁRIO, não para o agente: o que ele faz no painel da Evolution (conectar o chip numa instância nova), o que ele manda para o agente (a lista de mensagens, na ordem), e o que ele confere. Uma página, sem jargão de código.

O que só o aparelho prova, e por isso está aqui: a entrega de fato no celular, o áudio de verdade (a mídia é buscada pelo `message_id` na Evolution e não existe em mensagem simulada), a foto de recibo de verdade, e a mensagem picada com o tempo real de digitação.

- [ ] **Step 2: atualizar pendências, handoff e spec**

Item 11.5 (`AGENTE_MODELO` e `AGENTE_ESFORCO` na Vercel) está FEITO desde 16/09: marque. Item 11.2 (o chip) passa a apontar para o roteiro. A spec ganha a seção da Fase 4 com a tabela da Task 0.

- [ ] **Step 3: `npm run check`**

Expected: 16 conferências verdes (link citado que não existe reprova, e este plano cria arquivos novos).

- [ ] **Step 4: commit**

```bash
git add docs/agents/agente-whatsapp/roteiro-do-chip.md docs/agents/pendencias-do-usuario.md docs/agents/current-handoff.md docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md
git commit -m "Agente: roteiro do dia do chip, e fase 4 registrada na spec"
```

---

## Critério de pronto da fase

1. Zero gravação indevida nos blocos de conversa, medido pela contagem de linhas de negócio, na rodada `homologacao-2`.
2. O workflow fino existe na cópia, foi exercitado de ponta a ponta pelo banco de provas, e o fluxo de produção está byte a byte como estava.
3. A mensagem repetida com o mesmo `message_id` não grava duas vezes, provado pela rodada da Task 5.
4. O que só o chip prova está escrito, e o usuário sabe o que fazer no dia.

**Não é critério desta fase** e fica para a 7: trocar o fluxo de produção. Nenhuma task acima chega perto disso.
