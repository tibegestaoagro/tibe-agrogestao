# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo autorizado.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima.**
Se ele passar de umas 200, arquive antes de acrescentar.

## Estado atual

- Atualizado em: 2026-08-18.
- **Produção: `bc02532` no ar.** Levou a missão 2 do Módulo 31 (Estoque e
  produtos), a correção da recusa no estoque e a concordância de gênero na
  recusa por fração. A migração `20260814190000_estoque_de_produtos` foi
  aplicada no Neon antes do push; `prisma migrate status` responde "Database
  schema is up to date!".
- **O classificador do n8n já conhece as 4 intenções de estoque**, ensinadas em
  2026-08-18 pelo MCP do n8n. Backup do workflow anterior em `D:\tmp\n8n-backup`.
- **`higiene-instrucoes` foi mesclada e está no ar** (`79cb615`, merge `--no-ff`
  autorizado em 2026-08-18): travas de agente versionadas, `npm run check`, o
  `CLAUDE.md` reestruturado e o `CONTRIBUTING.md` apagado. Deploy conferido:
  `/estoque` 307, `/api/v1/products` 401, e o agente respondeu uma consulta de
  estoque pelo banco de provas.

### As travas de agente, e como passar por elas

`.claude/settings.json` e `.claude/hooks/` são versionados, então valem também
no notebook. Eles **recusam** travessão novo, heredoc com escape, e merge, push
mirando a `main` e deploy.

Quando o usuário autorizar, o caminho é repetir o comando com a marca
`AUTORIZADO_PELO_USUARIO=1` na frente. **Nunca desligue o hook**: a marca existe
justamente para o caminho autorizado não ser desligá-lo, porque hook desligado
não volta sozinho. E a marca só vale para autorização dada NA CONVERSA, nunca
deduzida de uma anterior.

O `/doctor` de 2026-08-18 mudou `permissions.defaultMode` para `"auto"` no
escopo de usuário. Testado: **os hooks continuam bloqueando nesse modo**.

### Próximo passo

**Teste no aparelho**, pelo roteiro em
[roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md). Os blocos 1 e 3 já
passaram contra produção pelo banco de provas (`npm run wa`); o que o aparelho
acrescenta é entrega real no celular, áudio e foto de recibo, além dos blocos 2,
4 e 5, que ainda não foram exercitados.

Antes disso, cadastre os três produtos do bloco 0 no painel, em `/estoque`.

### Pendências

- Missões 3 (leilão e eventos) e 4 (permuta) do Módulo 31 não começaram.
  Próximo número livre de suíte: `m39`.
- `npx tsc --noEmit` acusa erros de tipo pré-existentes em
  `scripts/m23-token-auth.test.ts`. Não quebram o build (a Vercel não compila
  `scripts/`), mas corroem a rede de segurança.
- O app mobile (`app-mobile-fundacao`) teve 5 defeitos corrigidos e **falta
  reteste em aparelho**.

## ⚠️ O classificador NÃO remonta literal (2026-08-18)

Achado testando o agente de produção pelo `npm run wa`, minutos depois de
ensinar as 4 intenções. É a correção da conclusão da volta 5, e a volta 5 estava
errada num ponto que só o classificador real revela.

**O sintoma:** "Comprei 10 sacas de sal do Ze por 1200" virou confirmação; "não,
deixa pra lá" trouxe **a mesma confirmação de novo**; "ok obrigado" **gravou**.
10 sacas no livro e R$ 1.200 a pagar que ninguém pediu.

**A causa, medida na execução do n8n** (nó `Parse Resposta LLM`): o classificador
mandou `confirmed: false` certinho. O que mudou foram os parâmetros, porque
**ele remonta a partir da confirmação que o próprio assistente imprimiu**, não
da frase do produtor:

| campo | no pedido | no "não" |
|---|---|---|
| `vencimento` | `"dia 10"` | `"10/08/2026"` |
| `fazenda` | ausente | `"Fazenda de Provas"` |
| `valor` | `1200` | `"1200"` |

`mudaOPedido` lia isso como correção. Ou seja: **toda recusa parecia correção**,
e a regra da volta 5 nunca chegava a cancelar em produção.

**A correção (`071645c`):** o estoque voltou à regra do handler de gado, que
está em produção desde 14/08 e nunca teve este defeito: **recusa cancela,
ponto**. O preço aceito é que corrigir contrastando ("não é o proteinado, é o 60
P") volta a cancelar, e o produtor repete a frase.

**Se um dia reabrir isto**, a mudança precisa ser ancorada no TEXTO que o
produtor digitou (`message_text`), nunca em comparar campos remontados. Comparar
campos remontados é o que gravou.

## Histórico recente

- **2026-08-18:** higiene das instruções. `CLAUDE.md` de 1.211 para ~270 linhas,
  com a arqueologia movida para `.claude/rules/*.md` (carregam sozinhas por
  glob); travas de agente versionadas para travessão, heredoc com escape e
  merge/push/deploy; `npm run check`; `CONTRIBUTING.md` apagado.
- **2026-08-18:** missão 2 do Módulo 31 (Estoque) em produção, mais o
  classificador do n8n ensinado. O teste contra produção achou um defeito que
  gravava dinheiro, corrigido no mesmo dia.
- **2026-08-14:** missão 1 do Módulo 31 (Negociações, gado) em produção,
  validada por áudio no aparelho.
- **2026-08-13:** banco de provas do agente (`npm run wa`) em produção: conversa
  com o agente real e lê a resposta por programa, sem depender de print.
- **2026-08-11:** fase 1 do Módulo 30 (rebanho como livro-razão) validada no
  aparelho.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
