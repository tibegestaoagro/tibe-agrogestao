# Cofre de conhecimento do Tibé

Uma nota por lição. **Esta pasta não carrega em contexto**: o agente busca por
`tipo:` ou `tags:` e lê só a nota que interessa.

## O que mora aqui, e o que não mora

| camada | carrega quando | papel |
|---|---|---|
| `CLAUDE.md` | sempre | invariantes e comando. Prescritivo |
| `.claude/rules/*.md` | ao abrir arquivo da área | o que não quebrar **aqui**. Sempre atual |
| `docs/agents/current-handoff.md` | ao retomar | onde o projeto está **agora**. Volátil |
| `docs/agents/dividas.md` | ao planejar | o que é devido e não está em andamento |
| **`docs/conhecimento/`** | **nunca sozinho** | o que aprendemos, quando e por quê. Buscável por tag, append-only |

**Não guarde aqui** o que já está no código, no git log, no `CLAUDE.md`, numa
regra ou numa spec. Duplicata envelhece e passa a mentir.

Este cofre existe porque o `current-handoff.md` tem teto de 200 linhas
(autoimposto depois de chegar a 1.316), e toda rodada a lição aprendida era
**resumida destrutivamente** para caber, ou caía no despejo cronológico de
`historico/YYYY-MM.md`, de onde não se recupera por assunto.

## Como usar com o Obsidian

Abra a pasta **`docs/`** como vault. Os 66 arquivos que já existem viram grafo
navegável na hora, com backlink e busca, sem migrar nada. O agente não depende
do Obsidian estar aberto: ele lê e escreve os mesmos arquivos direto.

## Como buscar

```
grep -rl "tags:.*rebanho" docs/conhecimento/
grep -rl "^tipo: armadilha" docs/conhecimento/
```

## As notas

| nota | tipo | sobre |
|---|---|---|
| [validação ao vivo acha o que a suíte verde não acha](validacao-viva-acha-o-que-a-suite-verde-nao-acha.md) | licao | os defeitos que passaram por tsc, lint e suíte |
| [a pílula invisível](pilula-invisivel-o-portao-compara-token-nao-uso.md) | armadilha | o portão compara par de token, nunca o uso |
| [o Decimal do Prisma no Client Component](decimal-do-prisma-so-quebra-no-console-do-navegador.md) | armadilha | tsc aprova, a tela renderiza, e só o console acusa |
| [o Zod em inglês nas 71 rotas](zod-em-ingles-nas-71-rotas.md) | licao | infraestrutura pronta e não ligada |
| [o valor certo escrito em outro idioma](o-valor-certo-escrito-em-outro-idioma.md) | licao | "R$ 500.00" com a suíte inteira verde |
| [trava só vale depois de vista falhar](trava-so-vale-depois-de-voce-a-ver-falhar.md) | licao | prove nos dois sentidos |
| [cópia repetida não quer dizer cópia idêntica](copia-repetida-nao-quer-dizer-copia-identica.md) | licao | cinco dos sete stores aceitavam número, dois não |
| [teste que passa antes E depois](teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada.md) | licao | o caso que discrimina é o da ponta que falta |
| [a asserção pode passar com o defeito plantado](assercao-pode-passar-com-o-defeito-plantado.md) | armadilha | quinze dias de atraso davam a mesma data nas duas âncoras |
| [tabela feita por grep mede o nome da variável](tabela-feita-por-grep-mede-o-nome-da-variavel.md) | armadilha | zero no grep quer dizer outro nome, não ausência |
| [somar em vez de gravar tem preço no dia um](somar-em-vez-de-gravar-tem-um-preco-no-dia-um.md) | licao | o backfill arruma o passado, o helper arruma o futuro |
| [fixture de rebanho precisa de situação e dono](fixture-de-rebanho-precisa-de-situacao-e-dono.md) | armadilha | `getPositions` agrupa por quatro campos |
| [o portão mede a relação que lhe deram](portao-mede-a-relacao-que-lhe-deram.md) | licao | três incidentes, o mesmo defeito de categoria |
| [a suíte cega cobra o que o briefing esqueceu](suite-cega-cobra-mais-do-que-o-briefing-mandou.md) | licao | divergência entre duas leituras do contrato |
| [contrato incompleto diverge entre agentes paralelos](contrato-incompleto-diverge-entre-agentes-paralelos.md) | licao | o que uma cabeça só resolve sozinha, duas não |
| [agente só de leitura pode sumir do registro](agente-com-modelo-nao-padrao-pode-nao-registrar.md) | armadilha | e não se substitui o juiz pela sessão que orquestrou |
| [agentes da mesma onda veem o plantio um do outro](agentes-da-mesma-onda-veem-o-plantio-um-do-outro.md) | armadilha | a onda protege arquivo e commit, não o estado de verificação |
| [ler os .docx do cliente com unzip](ler-docx-do-cliente-sem-ferramenta-extra.md) | referencia | sem Python e sem instalar nada |
| [git checkout descarta o trabalho do agente](git-checkout-descarta-o-trabalho-do-agente.md) | armadilha | na onda, o trabalho de todos vive só no working tree |
| [escrever a lição não impede repeti-la](escrever-a-licao-nao-impede-repeti-la.md) | licao | o mesmo defeito voltou com a nota já escrita |
| [briefing de suíte cega precisa carregar o contrato](briefing-de-suite-cega-precisa-carregar-o-contrato.md) | licao | sem ele, a cegueira vira adivinhação |
| [migrate diff lê o .env, e o .env é produção](migrate-diff-le-o-env-e-o-env-e-producao.md) | armadilha | o fluxo documentado engana quando o local está à frente |
| [campo do ORDEM sem error engole a recusa](campo-no-ordem-sem-error-engole-a-recusa.md) | armadilha | a mensagem nao vai para o rodape: ela morre |
| [Record<string> e onde o enum cresce sem avisar](record-string-e-onde-o-enum-cresce-sem-avisar.md) | armadilha | cinco mapas ficaram para tras sem o tsc reclamar |
| [filtro na busca esconde o defeito que o teste procura](filtro-na-busca-esconde-o-defeito-que-o-teste-procura.md) | licao | busque largo, afirme estreito |
| [next dev + cookie valida o servidor sem navegador](next-dev-mais-cookie-valida-o-servidor-sem-navegador.md) | referencia | o que da para provar por curl, e o que nao da |
| [Turbopack nao cria processo com a maquina cheia](turbopack-nao-cria-processo-quando-a-maquina-esta-cheia.md) | armadilha | 0xc0000142 aponta o CSS e o problema e memoria |
| [a guarda da action atrás do schema não é a recusa que sai](guarda-da-action-atras-do-schema-nao-e-a-recusa-que-sai.md) | armadilha | o `code` que o cliente lê é o do Zod, não o do `fail` |
| [quem pergunta precisa guardar o pedido](quem-pergunta-precisa-guardar-o-pedido.md) | licao | o defeito mora ENTRE duas voltas da conversa |
| [dado herdado inválido trava o caminho novo](dado-herdado-invalido-trava-o-caminho-novo.md) | armadilha | a suíte não vê porque ela cria dado bom |
| [spread condicional no where escapa do tsc](spread-condicional-no-where-escapa-do-tsc.md) | armadilha | relação renomeada deu 500 só com o filtro ligado |
| [a dívida descreve o sintoma, a auditoria acha o irmão](a-divida-descreve-o-sintoma-e-a-auditoria-acha-o-irmao.md) | licao | adiar deslocava a série; a venda do lote não virava negociação |
| [vencimento padrão na data do fato nasce vencido](vencimento-padrao-na-data-do-fato-nasce-vencido.md) | licao | o terceiro módulo a repetir `due_date ?? occurred_at` |
| [confirmar deploy pelo status do commit](confirmar-deploy-pelo-status-do-commit.md) | referencia | esperar a Vercel sem sondar produção |
| [ajustar prompt olhando o relatório inteiro contamina a nota](ajustar-prompt-olhando-o-relatorio-inteiro-contamina-a-nota.md) | licao | a partição guardada vazou, e o modelo saiu de 84,8% para 96,8% nos mesmos casos |
| [prompt antes de modelo](prompt-antes-de-modelo-o-barato-passa-o-caro-erra-igual.md) | licao | os seis modelos erravam igual; ajustar a instrução comprou mais que trocar de modelo |
| [a etapa de domínio decide o que a extração pode responder](a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder.md) | armadilha | domínio errado vira "não entendi", e a culpa parece da intenção |
| [campo homônimo herda a descrição da primeira intenção](campo-homonimo-no-dominio-herda-a-descricao-da-primeira-intencao.md) | armadilha | o relatório voltava sem área em 6 de 6 medições |
| [a trava de número por extenso precisa da regra de composição](trava-de-numero-por-extenso-precisa-da-regra-de-composicao.md) | armadilha | "cento e vinte, cinquenta de frete" virava 170 |
| [o limite da conta reprova o modelo se você não esperar](limite-da-conta-reprova-o-modelo-se-voce-nao-esperar.md) | armadilha | 99 mensagens em erro de 1 segundo eram 429, não o modelo |
| [zero defeito em cinco rodadas pode ser cegueira do conjunto](zero-defeito-na-suite-pode-ser-cegueira-da-suite.md) | licao | 60 blocos nunca montavam o estado que expunha a gravação indevida |
| [a porta fraca não pode alcançar quem grava sem confirmar](a-porta-fraca-nao-pode-alcancar-quem-grava-sem-confirmar.md) | armadilha | "nem precisei do sal afinal" gravou 2 sacas de sal |
| [a catraca acha no dia em que nasce](catraca-acha-no-dia-em-que-nasce.md) | licao | escrita para o futuro, achou quatro defeitos na primeira execução |
| [índice de lista não sobrevive a dois turnos](indice-de-lista-nao-sobrevive-a-dois-turnos.md) | armadilha | o "1" apontou para outra conta, e o sim quitou R$ 9.000 |
| [declarar a intenção não a torna alcançável](declarar-a-intencao-nao-a-torna-alcancavel.md) | licao | três intenções novas com 44,4%, porque o domínio não as reivindicava |

⚠️ **`[[wikilink]]` para nota que não existe reprova o `npm run check`**
(conferência 13). É o que impede esta pasta de virar um cemitério de links
quebrados.
