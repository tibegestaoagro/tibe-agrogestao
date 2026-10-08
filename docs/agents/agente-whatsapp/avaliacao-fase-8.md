# Fase 8: pergunta de pasto e pagamento sem valor, medidos

Data: 2026-10-08. Modelo: `gpt-5.6-luna`, esforço `low`. Etapa E6 do programa
de dívidas (5.4 e 5.0a).

## O que foi medido

53 casos novos, escritos por um autor sem acesso ao código, em dois arquivos:

- `fase-8.json` (31): doze pagamentos ao trabalhador fixo **sem valor** e com o
  verbo fora do passado simples ("acabei de pagar o Zé", "acertei com o Zé
  Carlos", "o Zé tá pago"), oito vizinhos de dinheiro (agendar, adiantamento,
  pagamento com valor, cliente que pagou, despesa avulsa) e onze vizinhos de
  rebanho e lavoura (consulta do rebanho, resumo, transferência de pasto,
  cerca).
- `fase-8-pastos.json` (22): a intenção nova `consultar_pastos`, com o caso
  real que a originou ("Quantos pasto temos cadastrados", que o agente
  respondia com a lavoura), e cinco contrastes com consulta do rebanho,
  transferência e mensagem solta.

A linha de base foi medida **antes** de mexer no prompt, duas vezes, só com o
primeiro arquivo (o segundo não valida sem a intenção existir). As rodadas
finais são da configuração que foi para o commit.

| rodada | configuração | `fase-8.json` | `fase-8-pastos.json` | gravação indevida |
|---|---|---|---|---|
| `fase-8-base1` | antes | 83,9% | não existe | 0 |
| `fase-8-base2` | antes, de novo | 80,6% | não existe | 0 |
| `fase-8-e` | final | **93,5%** | **100%** | 0 |
| `fase-8-f` | final, de novo | **93,5%** | **100%** | 0 |

Campos: 100% em todas. Custo das rodadas: US$ 0,26 (acumulado do programa:
US$ 5,82). As sondas diretas (abaixo) chamaram o modelo sem passar pelo
medidor e ficaram fora dessa conta.

## O que errava, e por quê

Na linha de base, **todos** os erros eram os pagamentos sem valor (cinco e seis
dos doze), saindo `ambigua`; os dezenove vizinhos acertaram nas duas rodadas.
A causa era a etapa de domínio, não a extração: `mao_de_obra` falava só em
"pagamento já feito", e o prompt de domínio manda para "nenhum" a pergunta
"será que já acertei com o veterinário". Sem valor e com "acertar", a frase
caía ali.

A tentativa da Fase 5 (exemplo novo na INTENÇÃO) piorou o conjunto porque
mexia no lugar errado: a extração nunca via a mensagem.

## As mudanças

1. Domínio `mao_de_obra`: o pagamento já feito vale "mesmo sem o valor e com
   qualquer verbo", com dois exemplos que não repetem nenhum caso ("acertei o
   mês do Tião", "o Tião já tá pago").
2. Domínio `rebanho`: passa a reivindicar os pastos cadastrados ("pasto é do
   rebanho, nunca da lavoura").
3. Intenção `consultar_pastos`, no FIM da lista do rebanho, com os campos
   `fazenda` e `qual_pasto`. Os exemplos foram escolhidos para não coincidir
   com casos; `f8-004` ficou marcado como `molde` por se parecer com um
   exemplo de domínio.

## Os dois defeitos que a primeira versão tinha, e a nota não mostrava

A primeira versão punha a intenção em segundo lugar e usava o campo `pasto`.
Ela passou nos dois conjuntos novos e na regressão em intenção, mas os campos
da regressão caíram, e a sonda direta (a mesma mensagem 8 a 12 vezes, contra o
registro sem a mudança) achou duas causas, uma de cada decisão:

- **Ordem.** O schema da extração junta os campos das intenções na ordem da
  lista. Em segundo lugar, `pasto` subia para o começo do schema, e "morreu uma
  novilha no pasto da baixada ontem eh pera nao foram duas" saía com **todos
  os campos nulos** em 6 de 8 chamadas (0 de 8 sem a mudança).
- **Nome dividido.** `pasto` já existia no negócio de gado; dois sentidos para
  o mesmo nome mesclam as descrições num campo só. Com isso, "comprei quinze
  garrote... pago dia quinze" passou a sair **`pago: true` em 11 de 12**
  chamadas (1 de 12 sem a mudança): uma compra a prazo registrada como paga.

⚠️ **A segunda não aparecia em nota nenhuma.** O pontuador só confere os
campos que o caso espera, e nenhum caso esperava `pago`; campo a mais e errado
passa. Só a sonda, comparando com o controle, mostrou. Medida pela nota, a
primeira versão teria ido para produção.

Com a intenção no fim e o campo `qual_pasto`, que não mescla com nada: 0 de 10
vazios e 0 de 12 `pago: true`.

## O que sobrou

"acertei com o Zé Carlos" e "fechei a conta com o Zé hoje" continuam
`ambigua` nas duas medições. Não foi perseguido: as duas frases servem também
para acerto com cliente e para pergunta sobre o passado, e o agente responde
que não entendeu sem gravar nada. É o resto da dívida 5.0a.

## A regressão, e o defeito de bancada que ela achou

`forademostra.json` (50 casos guardados da Fase 3):

| rodada | configuração | intenção | campos | confirmações que não gravaram |
|---|---|---|---|---|
| `fase-5-regressao2` (16/09) | antiga | 97,7% | 98,3% | 4 |
| `fase-8-regressao-e` | final | **100%** | **96,6%** | 4 |
| `fase-8-regressao-f` | final, de novo | **100%** | **96,6%** | 4 |

A diferença de campos para 16/09 está em casos que também oscilam com o
registro antigo (`fam-022` acerta a fazenda de origem em 1 de 6 chamadas sem
a mudança) e em "dia quinze" voltando "dia 15", que o registro antigo também
faz. Zero gravação indevida em todas as rodadas.

⚠️ **As conversas não eram medidas desde 18/09.** Todo passo de conversa
respondia "Este número não está cadastrado no Tibé": a correção do nono dígito
fez `identificarContato` procurar o telefone na forma canônica (`55` + DDD + 9
dígitos), e a fazenda de avaliação gravava o contato com os dígitos crus.
Corrigido em `scripts/avaliacao/fazenda.ts`; as rodadas da tabela são todas
depois da correção.

## Onde isso vale em produção

Só na rota de turno (o canário). Pelo `execute-action`, quem classifica é o
n8n, congelado: lá a pergunta de pasto continua sem intenção própria.
