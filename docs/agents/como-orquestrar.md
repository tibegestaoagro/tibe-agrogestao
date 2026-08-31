# Como orquestrar o time de agentes

Manual de operação, escrito para o Dilton. O objetivo é você deixar de ser quem
digita e passar a ser quem **distribui e aprova**.

Se você só ler uma seção, leia a 6: **quando não usar isto**.

---

## 1. Por que existe

Até aqui o Tibé foi conduzido por uma sessão só, que planejava, implementava,
testava e **julgava o próprio trabalho**. Funcionou: 31 módulos em produção. Mas
o `dividas.md` e o `current-handoff.md` registram seis defeitos graves que
passaram por `tsc`, `lint` e a suíte inteira verdes, e só apareceram em uso
real.

Nenhum era erro de cálculo. Eram erros de **julgamento de quem estava perto
demais do próprio código**.

O time resolve isso separando quem faz de quem julga. E, de quebra, deixa correr
em paralelo o trabalho que hoje corre em série sem precisar.

⚠️ **Isto não é método importado.** Em 31/07/2026 este projeto já tinha agentes
A1, A2 e A3 com "Escopo exclusivo" e "Proibido tocar", e um "juiz subagente" com
rubrica e nota mínima. Tudo foi apagado junto com o Codex em 04/08. O que muda
agora são as duas peças que faltavam: um committer único, e a formação de onda
por regra em vez de por bom senso.

---

## 2. Os três times

### Time Servidor
Dono de `src/lib/actions/`, `src/app/api/`, `prisma/`.

| agente | faz |
|---|---|
| `servidor-acao` | regra de negócio e rota |
| `servidor-dados` | schema e migração |
| `servidor-agente` | handlers do WhatsApp |

### Time Tela
Dono de `src/components/`, das páginas e de `src/app/globals.css`.

| agente | faz |
|---|---|
| `tela-pagina` | página, formulário, componente de feature |
| `tela-kit` | primitivo compartilhado e token de cor |

### Time Prova
Dono de `scripts/`, do CI e das travas. **É o time que não vê a solução.**

| agente | faz |
|---|---|
| `prova-suite` | escreve a suíte **a partir da spec**, sem ler a implementação |
| `prova-juiz` | julga um range de commits por rubrica, sem o relato de quem fez |
| `prova-viva` | valida contra o mundo: navegador, aparelho, agente de produção |

E um transversal: `explorador`, barato, só para achar onde as coisas estão.

⚠️ **Agente novo só aparece depois de reiniciar o Claude Code.** As skills
carregam a quente, os agentes não: uma sessão aberta antes de `.claude/agents/`
existir responde "Agent type not found". Se você acabou de criar ou renomear um
agente, feche e abra a sessão antes de despachar.

### Por que o time de provas é cego

Se quem escreve o teste leu a solução, o teste herda as suposições dela. **O
caso que discrimina costuma ser o da ponta que falta**, e a ponta que falta é
justamente a que o implementador não pensou.

Então: `prova-suite` recebe a spec e o contrato (nomes de campo, assinaturas,
códigos de erro), e escreve a suíte **ao mesmo tempo** em que o outro time
implementa. `prova-juiz` recebe a spec e o range de commits, e nunca o relato de
quem implementou.

⚠️ **O juiz não tem `Write` nem `Edit`, de propósito.** Um juiz que conserta
deixa de ser juiz: passa a defender a própria correção na rodada seguinte.

---

## 3. Como uma rodada acontece

```
spec (docs/superpowers/specs/)
   |
   v
tabela de tarefas: cada uma com  Arquivos:  e  Depende-de:
   |
   v
ondas: tarefas que nao dependem entre si E nao dividem arquivo
   |
   +-- onda 1: despacha TODOS juntos, numa mensagem so
   |      implementadores nao commitam, so relatam
   |      voce (sessao principal) commita, um por vez
   |
   +-- onda 2: idem
   |
   +-- ultima onda: prova-juiz sobre o range inteiro
   |
   v
validacao ao vivo (navegador / aparelho)
   |
   v
licoes para docs/conhecimento/
```

### A regra de formação de onda

Duas tarefas correm juntas **se e somente se** valem as duas coisas: nenhuma
depende da outra, **e** os arquivos que cada uma toca são totalmente disjuntos.

⚠️ **Arquivo em comum reprova a onda mesmo que sejam trechos diferentes.** A
regra é por arquivo, não por linha.

Se ficar em dúvida sobre o que uma tarefa toca, ela passa a "depender de tudo".
Perder paralelismo é o erro seguro; ganhar corrida não é.

### Como você lê uma tabela de ondas

| onda | tarefa | agente | Arquivos: |
|---|---|---|---|
| 1 | T01 site público | `tela-pagina` | `src/app/(public)/**` |
| 1 | T02 componentes públicos | `tela-pagina` | `src/components/public/**` |
| 1 | T03 suíte da spec | `prova-suite` | `scripts/m50-*.test.ts` |
| 2 | T04 auth e onboarding | `tela-pagina` | `src/app/(auth)/**` |

Você confere uma coisa antes de aprovar: **os `Arquivos:` da mesma onda não se
repetem**. É a única verificação manual que o protocolo pede, e é rápida.

---

## 4. O que é seu, e o que é automático

| acontece sozinho | precisa de você |
|---|---|
| despacho dos agentes da onda | aprovar a tabela de ondas |
| commit na branch de trabalho | **merge na `main`** |
| commit de tarefa concluída | **push para a `main`** |
| rodar `check`, `tsc`, `lint`, suítes | **deploy** |
| escrever no cofre | validar no navegador ou no aparelho |

⚠️ **Merge, push na `main` e deploy continuam exigindo sua palavra, a cada
vez** (invariante 7). Nenhum subagente recebe essa autorização, e nenhum
despacho a delega. A trava do `guarda-bash.mjs` vale igual dentro de subagente.

⚠️ **Subagente não commita nunca.** Ele deixa a mudança no working tree e relata
os arquivos. Quem commita é a sessão principal, uma tarefa por vez, capturando o
`HEAD` fresco antes de cada commit. Dois agentes disputando o índice do git é
exatamente como um commit sai contra um `HEAD` velho.

Isso **não** afrouxa a regra 6 do `CLAUDE.md`: o commit continua automático e
sem nova autorização, só muda quem o faz.

---

## 5. O que custa

Rodar vários agentes gasta **de 3 a 10 vezes mais token** que fazer direto. O
gasto se paga em duas situações, e só nelas:

1. **Trabalho realmente independente**, que hoje corre em série por falta de
   quem tocar em paralelo.
2. **Julgamento que precisa vir de fora**, porque quem fez não enxerga o próprio
   ponto cego.

O modelo é escolhido por despacho, nunca herdado: `haiku` para busca mecânica,
`sonnet` para implementar, `opus` só para o juiz e para decisão de arquitetura
difícil.

---

## 6. Quando NÃO usar isto

- **Tarefa de um arquivo só.** Peça direto. Briefing custa mais que a tarefa.
- **Investigação exploratória**, onde o próximo passo depende do que o anterior
  achou. Isso é serial por natureza, e ondas só atrapalham.
- **Plano com cadeia linear de dependências.** O protocolo degrada para serial
  corretamente, mas você pagou o custo do cerimonial sem ganhar nada.
- **Qualquer coisa que caiba numa cabeça só** sem perder o fio.
- **Correção urgente em produção.** Aqui o caminho curto vence.

⚠️ **Ondas não substituem a validação ao vivo.** Nove agentes com a suíte verde
continuam sendo a suíte verde, e foi ela que deixou passar os seis defeitos.
Abrir a tela continua sendo parte da estimativa, não sobra.

---

## 7. O cofre, em uma página

`docs/conhecimento/` guarda o que foi **aprendido**. Uma nota por lição, com
`tipo`, `data`, `tags` e links `[[assim]]`.

**Ele nunca carrega em contexto.** O agente busca por tag e lê só a nota que
interessa, então crescer não custa nada.

Ele existe porque o `current-handoff.md` tem teto de 200 linhas, autoimposto
depois de o arquivo chegar a 1.316. Toda rodada, a lição aprendida era **resumida
destrutivamente** para caber, ou caía no despejo cronológico do `historico/`, de
onde não se recupera por assunto.

| camada | papel |
|---|---|
| `CLAUDE.md` | invariante e comando. Carrega sempre |
| `.claude/rules/` | o que não quebrar naquela área. Carrega ao abrir o arquivo |
| `current-handoff.md` | onde o projeto está **agora**. Volátil |
| `dividas.md` | o que é devido e não está em andamento |
| `docs/conhecimento/` | **o que aprendemos, e por quê.** Nunca carrega sozinho |

Para guardar algo: `/lembrar`. A **conferência 13** do `npm run check` reprova
link quebrado e frontmatter inválido, que é o que impede a pasta de apodrecer.

### Obsidian

Abra a pasta **`docs/`** como vault. Os arquivos que já existem viram grafo
navegável na hora, com backlink e busca, sem migrar nada e sem renomear pasta.

⚠️ **O agente não depende do Obsidian estar aberto.** Ele lê e escreve os mesmos
`.md` direto. O Obsidian é o **seu** visor, e é por isso que ele nunca vira um
ponto de falha silencioso.

---

## 8. O que este processo NÃO resolve

- **Não substitui a spec.** Onda sem spec é nove agentes adivinhando junto.
- **Não decide produto.** Ambiguidade continua vindo para você, com
  `AskUserQuestion`.
- **Não dispensa a validação no navegador.**
- **Não protege de arquivo mal marcado.** Se o `Arquivos:` de uma tarefa mentir,
  a onda colide. Por isso a marcação vaga vira "depende de tudo".
- **Não paraleliza cadeia de dependência.** Action, depois rota, só então tela
  continua sendo uma cadeia, e cadeia é serial.
