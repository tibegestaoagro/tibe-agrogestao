---
name: orquestrar-ondas
description: Use ao executar um plano com várias tarefas no Tibé, quando houver trabalho independente que possa correr em paralelo. Define os campos Arquivos e Depende-de, a formação de ondas, quem commita, e as três costuras entre os times. Use também antes de despachar mais de um subagente de uma vez.
---

# Orquestrar ondas no Tibé

Rodar vários agentes ao mesmo tempo é rápido e é inseguro por dois motivos
específicos: dois agentes editando o mesmo arquivo, e dois agentes correndo para
o `git commit`. Este protocolo remove os dois **estruturalmente**, não por
disciplina.

Ele não é importado de fora. É o que
[`docs/arquitetura/onda-1-briefings.md`](../../../docs/arquitetura/onda-1-briefings.md)
já chamava de "Escopo exclusivo" e "Proibido tocar" em 31/07/2026, agora com as
duas peças que faltavam: um committer único e a formação de onda por regra.

## 1. Toda tarefa nasce com dois campos

- **`Arquivos:`** os caminhos exatos que a tarefa cria ou altera.
- **`Depende-de:`** IDs de tarefas cujo resultado esta consome, ou `nenhuma`.

Na dúvida sobre qualquer um dos dois, escreva
`Depende-de: tudo que já foi listado`. O erro seguro é perder paralelismo; o
erro proibido é ganhar corrida.

⚠️ **`Arquivos:` vago equivale a `Arquivos:` em branco.** "alguns arquivos de
tela" não é marcação: é uma tarefa que corretamente vira serial. Liste caminhos
de verdade.

## 2. Formação de onda

Duas tarefas entram na mesma onda **se e somente se as duas condições valem**:

1. Nenhuma depende da outra, nem transitivamente.
2. Os conjuntos de `Arquivos:` são **totalmente disjuntos**.

⚠️ **Arquivo em comum reprova a onda mesmo que sejam trechos diferentes do
arquivo.** A regra é por arquivo, não por linha: dois agentes em partes
diferentes do mesmo arquivo ainda produzem sobrescrita silenciosa.

Uma tarefa sem par válido é uma onda de uma tarefa só. Isso é o resultado
correto da regra, não uma falha dela. Uma cadeia totalmente linear vira uma
tarefa por onda, que é exatamente a execução serial: não há regressão em usar
este protocolo, só ganho onde o plano realmente tem paralelismo.

**Alternativa melhor que a onda:** se duas tarefas colidem em arquivo e são
pequenas, **funda as duas numa tarefa só** antes de planejar a onda. Um
implementador toca aquele arquivo de qualquer jeito, e você economiza um commit.

## 3. O laço de cada onda

1. **Escreva um briefing por tarefa.** Ver a seção 5.
2. **Despache todos os implementadores da onda numa ÚNICA mensagem.** É o único
   ponto onde existe paralelismo de verdade. Despachar em mensagens seguidas é
   execução serial com passos extras.
3. **Espere todos terminarem.**
4. **Subagente não commita.** Cada um deixa a mudança no working tree e relata
   quais arquivos tocou.
5. **A sessão principal commita**, uma tarefa por vez, na ordem da onda,
   **capturando o `HEAD` fresco imediatamente antes de cada commit**.
6. **Só então** despache os revisores da onda, juntos. Revisão é leitura, então
   é seguro em paralelo.
7. **Um único registro de progresso por onda**, escrito pela sessão principal.
   Um por tarefa faz dois agentes disputarem o mesmo arquivo de log, que é a
   mesma classe de bug do commit.

⚠️ **Capturar o `HEAD` uma vez no começo da onda é o erro clássico.** Depois do
primeiro commit da onda, aquele `HEAD` já está velho. Capture de novo, na hora,
antes de cada commit.

⚠️ **Nunca abra exceção "só desta vez o implementador commita".** É exatamente
assim que a corrida volta. A regra só funciona se for absoluta.

## 4. As três costuras entre os times

São as fronteiras onde dois times se encostam. Sem regra explícita viram
colisão.

| # | costura | regra |
|---|---|---|
| 1 | `fail(code, msg, status, field)` ↔ `<Field id="nome_da_api">` | **O nome do campo é decidido na spec, não na implementação.** O briefing carrega a tabela de nomes, e nenhum dos dois times inventa nome durante a execução |
| 2 | `scripts/check-repo.ts` confere `src/**/*.tsx`, mas é do time de provas | **Tela nunca edita baseline.** Só `prova-suite` encolhe catraca, e só depois do commit da tela. Ondas diferentes, sempre |
| 3 | `scripts/check-contraste.ts` parseia `globals.css` | Tarefa de `tela-kit` que mexa em token **exige** tarefa de `prova-suite` na onda seguinte |

**A regra que sai das três:** prova que **julga** é sempre onda posterior à
implementação. Prova que **escreve suíte a partir da spec** é onda 1, em
paralelo. São atividades diferentes do mesmo time, e a segunda é o que dá o
julgamento limpo.

## 5. O briefing de uma tarefa

```markdown
## T0N: <título curto>

**Agente:** <nome do agente>
**Arquivos:** <caminhos exatos>
**Depende-de:** <IDs ou nenhuma>
**Spec:** <link para a seção que manda>

### Objetivo
<uma ou duas linhas>

### Decisões já tomadas (execute, não redecida)
<o que foi decidido na conversa e o executor não tem contexto para redecidir>

### Contrato
<nomes de campo da API, códigos de erro, assinaturas: o que a costura 1 exige>

### Proibido tocar
<caminhos fora do escopo, explicitamente>
```

⚠️ **"Decisões já tomadas" existe porque quem executa não tem o contexto da
conversa que as descobriu.** Sem essa seção, o executor redecide em silêncio, e
a decisão volta pior.

## 6. A ordem de entrega continua valendo

O `CLAUDE.md` manda: **action, depois ROTA, só então TELA.** Isso é uma cadeia
de dependência, então na prática vira ondas sucessivas, e não uma onda larga.
Tela sem rota atrás não conta como entregue.

O que **pode** correr junto com a action, porque não depende dela: a **suíte
escrita da spec**, e qualquer tarefa de outra área do produto.

## 7. Modelo por despacho, nunca herdado

Decida o modelo **a cada despacho**, e não deixe herdar da sessão.

| trabalho | modelo |
|---|---|
| busca mecânica, localizar símbolo | haiku (`explorador`) |
| implementação, suíte, integração | sonnet |
| julgamento independente, decisão de arquitetura difícil | opus (`prova-juiz`) |

Use o modelo mais barato que ainda resolve.

## 8. O que continua sendo do usuário

⚠️ **Merge na `main`, push para a `main` e deploy exigem autorização explícita
do usuário, a cada vez** (invariante 7), com a marca `AUTORIZADO_PELO_USUARIO=1`
e autorização dada **na conversa**, nunca deduzida de uma anterior. **Nenhum
subagente recebe essa autorização**, e nenhum despacho a delega.

Commit e push de branch de trabalho são livres, e saem da sessão principal.

## 9. Quando NÃO usar ondas

Multi-agente custa de 3 a 10 vezes mais token. Não vale sempre.

- **Tarefa de um arquivo só.** Faça direto.
- **Investigação exploratória**, onde o próximo passo depende do que o anterior
  achou. Isso é serial por natureza.
- **Plano com cadeia linear de dependências.** O protocolo degrada para serial
  corretamente, mas o overhead de briefing não se paga.
- **Trabalho que cabe numa cabeça só.** Se você consegue segurar o problema
  inteiro sem perder o fio, ondas só adicionam cerimônia.

O ganho aparece quando há trabalho **realmente independente**, ou quando o
julgamento precisa vir de fora.

⚠️ **Nunca use travessão** (U+2014) em nenhum artefato deste processo.
