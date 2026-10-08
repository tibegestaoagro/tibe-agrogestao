# Dívidas abertas do Tibé

Levantamento de 2026-08-18, feito com evidência no repositório, não de memória.
Existe para uma sessão nova conseguir escolher o próximo trabalho sem reler o
histórico inteiro.

**Como usar:** cada item tem o que é, a evidência (arquivo e linha, ou comando),
e o que custaria fechar. Nenhum item aqui está em andamento. O que está em
andamento vive no [current-handoff.md](current-handoff.md).

**Regra de manutenção:** ao fechar um item, apague-o daqui e registre no commit.
Lista de dívida que só cresce vira lista que ninguém lê.

⚠️ **A numeração tem buracos, e isso é de propósito.** O item apagado não é
renumerado: o handoff, as specs de `docs/superpowers/` e o comentário da
conferência 8 em `scripts/check-repo.ts` citam a dívida pelo número (`§2.5`,
`§2.8`, `§2.9`), e renumerar transformaria cada citação numa referência para o
item errado. Item novo entra com o próximo número livre da seção.

---

## 1. Validação que nunca aconteceu

### 1.1 Estoque no aparelho (Módulo 31, missão 2)

Está em produção desde 2026-08-18, com o classificador do n8n já ensinado, mas
**nunca foi usado num celular de verdade**.

O roteiro está pronto em [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md),
6 blocos. Os blocos 1 e 3 já passaram contra produção pelo banco de provas
(`npm run wa`); faltam os blocos 2, 4 e 5, mais o que o banco de provas não
cobre por desenho: entrega no aparelho, áudio e foto de recibo.

**Por que importa mais do que parece:** o bloco 1 FALHOU nesse teste em
2026-08-18, gravando uma compra recusada de R$ 1.200. Cinco rodadas de juiz com
a suíte verde não tinham pego.

**Custo:** uma sessão de celular, mais o cadastro dos três produtos do bloco 0.

### 1.2 App mobile: 5 defeitos corrigidos, sem reteste

Os 3 commits da `app-mobile-fundacao` (parada desde 05/08) foram rebaseados
sobre a `main` em 08/10, na branch **`app-mobile-rebase`**, sem conflito. Eles
levam as abas Meu Dia e Tibé, Máquinas, a fila de escrita offline e a
biometria. Conferido contra o back-end atual: as 11 rotas que o app chama
existem, os corpos que ele manda passam nos schemas, e o `tsc` do app está
limpo. A única diferença era de tipo (status `cancelled` e três módulos novos
do financeiro), corrigida.

Os 5 defeitos achados com modo avião num Android real foram corrigidos **e
nunca retestados**. Falta só isso, e é do usuário: Expo Go (SDK 54), modo
avião, e conferir (1) o formulário de máquina abre sem sinal e mostra as
fazendas depois de a LISTA de máquinas ter carregado com sinal, (2) despesa
lançada sem sinal entra na fila em vez de falhar, (3) a mensagem de erro de
rede vem em português, (4) a faixa de pendências aparece no Financeiro e no
Início, (5) "Escolha a fazenda" aparece no próprio campo. A branch entra na
`main` depois disso.

### 1.3 Asaas nunca foi testado contra o sandbox real

O código de cobrança está em produção, mas a integração nunca rodou contra o
Asaas de verdade, nem em sandbox. Hoje isso significa que o caminho de
assinatura paga é o único do sistema sem nenhuma prova de integração.

**Custo:** chave de sandbox, mais uma rodada de teste do ciclo (criar
assinatura, webhook de pagamento, webhook de atraso).

---

## 2. Escopo desenhado e adiado

### 2.3 Itens do documento do cliente registrados como adiados

`docs/specs/module-31-negociacoes.md` seção 7, decididos na revisão de
2026-08-13 para não ficarem "nem feitos nem adiados":

| item | situação |
|---|---|
| §19, os nove filtros da tela de Negociações | a action já aceita filtro; a tela só herda o seletor de propriedade |
| §13, formas de pagamento (dinheiro, pix, boleto) | não implementado; o parcelamento, que é o que mexe no financeiro, existe |
| §6.2 e §7.2, pasto de origem e destino | o WhatsApp lê, a tela web não oferece |
| §6.2, peso, arroba e valor por cabeça | adiado desde a revisão de 2026-08-14 |
| §12.4, os valores estimados da permuta | fora da v1; o valor da negociação é só a diferença em dinheiro |
| histórico do aceite 23 | não implementado |

O raciocínio registrado para os filtros continua válido: **filtro sem volume de
dado é enfeite**, e o primeiro cliente com 200 negócios é quem define quais
importam.

### 2.4 Rebanho por categoria x por brinco

O maior desalinhamento aberto com o cliente Agromax: foi pedido rebanho **por
categoria**, e o que existe é por brinco com categoria em cima. Não é dívida de
código, é de produto, e precisa de conversa antes de virar tarefa.

### 2.8 Opacidade sobre token não gera CSS nenhum

Achado em 07/10/2026, fechando a E4 (2.5, 2.6, 2.7), ao compilar só o CSS do
Tailwind para provar que a troca de nomes era neutra. **Toda classe com
opacidade sobre token hexadecimal sai sem regra**: `bg-texto-invertido/10`,
`text-texto-invertido/70`, `bg-primaria/10`, `bg-superficie/70`,
`border-texto-invertido/10`. No Tailwind 3, opacidade exige a cor com
`<alpha-value>`, e os tokens são `var(--x)` puro: a classe é descartada em
silêncio, sem aviso de build, `tsc` ou `lint`.

Consequência desde a migração para tokens (31/08): os realces de hover da
sidebar, os textos esmaecidos dela, a borda que separa o rodapé dela, o fundo
suave dos cartões de KPI e da calculadora **nunca apareceram**; o texto herda
a cor do pai. O próprio `.claude/rules/ui.md` recomenda `bg-texto-invertido/10`
(armadilha 1) e só avisa do problema para `--sobreposicao` (armadilha 3). Só
`--sobreposicao` está em canais e funciona.

**Custo e conserto, já verificado:** o Tailwind 3.4 aceita `<alpha-value>`
dentro de qualquer string, então cada cor do `tailwind.config.ts` pode virar
`color-mix(in srgb, var(--x) calc(<alpha-value> * 100%), transparent)`. Sem
opacidade o valor é 100% e a cor fica igual; com `/10`, aparece o que o código
sempre pediu. **Muda o visual** (a sidebar ganha o realce desenhado), por isso
pede validação no navegador antes do merge. Mais uma conferência no `check`
que compile o CSS e reprove classe usada que não gerou regra.

## 3. Rede de segurança com furo

O item que morava aqui era o `resolverPasto`, que escolhia o primeiro pasto
parecido em silêncio, fechado em 10/09/2026 (bloco 18 da `m34`).

## 4. Cobertura desigual

### 4.1 `packages/contracts` cobre 4 domínios de muitos

Existem contratos tipados para `alerts`, `auth`, `financial` e `users`. O
back-end tem 58 arquivos de action e 84 rotas em `/api/v1`.

Isso importa porque o app mobile consome esses contratos: o que não está lá é
consumido sem segurança de tipo, e a divergência aparece em runtime, no
aparelho, longe de quem escreveu.

**Precedente concreto:** os contratos ficaram parados em 5 tipos de alerta
enquanto o banco chegou a 8, e um alerta de manutenção de máquina quebrava a
lista inteira no app. Já corrigido, mas a mesma forma de falha continua possível
em todo domínio não coberto.

---

## 5. Higiene menor

- **`.claude/settings.local.json` tem 175 permissões**, quase todas comandos de
  uso único de sessões passadas (`curl` para localhost, `rm` de arquivo
  temporário específico). É ruído, não risco: os curingas perigosos foram
  removidos em 2026-08-18. Limpar é cosmético.
- **A numeração de suíte descolou da de módulo** por volta do `m25` e não tem
  volta (renumerar colide). Já está documentado no `CLAUDE.md` e o
  `npm run check` reprova suíte órfã, então é convivência, não dívida.

### 5.13 A busca por nome não tem índice próprio

Registrado na E7 (08/10/2026), a partir da primeira rodada do Codex. A dívida
5.0 fechou: "Ze Carlos" casa "Zé Carlos" no banco, pela coluna gerada
`name_busca` de `Contact` e `ServiceClient`, sem ler a tabela para a memória.
Mas o filtro é `LIKE '%termo%'`, que nenhum índice B-tree atende: o Postgres
lê as linhas do tenant (pelo índice `tenant_id`) e filtra uma a uma. Em 08/10
o maior tenant tinha poucos contatos. Fechar: extensão `pg_trgm` e índice GIN
`gin_trgm_ops` em `name_busca`, quando um tenant passar de dezenas de milhares
de contatos. Termo com menos de 3 letras não usa o índice de qualquer jeito.

### 5.12 Arquivar pasto ocupado é permitido, e o gado fica num pasto desativado

Achado pela primeira rodada do Codex na E6 (08/10/2026).
`POST /api/v1/pastures/[id]/archive` grava `archived_at` sem conferir se há
cabeça `presente` naquele pasto, e as posições seguem apontando para ele. A
consulta de pastos do agente passou a mostrar essas cabeças numa linha "Em pasto
desativado", para não sumirem da conta, mas o estado continua torto: a rota não
pede o destino do gado antes de arquivar. A regra também mora na rota, não
numa action (invariante 6). Fechar é decisão de produto: recusar o arquivamento
de pasto com saldo, ou pedir o destino do gado junto.

### 5.11 Pelo `execute-action`, negócio com dois itens vira duas conversas

Achado na validação viva da E5 (08/10, 01h55 UTC, telefone do `npm run wa`,
que não está no canário). "comprei uns bezerro e umas novilha do Ze Teste por
50 mil" chegou do classificador do n8n como DUAS chamadas de
`registrar_negocio_gado`, um item cada, sem quantidade: o produtor leu "Quantos
animais?" duas vezes, e a resposta seguinte ("13 a 24 meses") foi classificada
como `registrar_movimentacao_rebanho`, longe do negócio. Não gravou nada (a
conversa terminou em "não"), mas a correção da 5.0b só vale quando os itens
chegam juntos, o que a rota de turno faz.

Não é do Tibé: o classificador do n8n está congelado por decisão do usuário, e
a Fase 7 troca o `execute-action` pela rota de turno. Custo de fechar aqui:
nenhum, se a Fase 7 fechar; senão, ensinar o nó do n8n a mandar os itens numa
chamada só. Ainda falta ver a 5.0b ao vivo pela rota de turno: a cópia
`--homologacao` está desligada no n8n (404), e ligá-la, ou pôr o telefone de
teste no canário, é escrita no n8n de produção.

### 5.10 O buffer de mensagens picadas não é idempotente por mensagem

Achado pela quarta rodada do Codex na E3 (07/10/2026). Desde a 3.1 a conexão
compartilhada do Redis tem limite de 2 s, e um comando que estoura o limite
ainda executa depois. O append do buffer virou um script atômico (contador e
pedaço juntos), mas não sabe qual mensagem é: se o script atrasar e o n8n
reenviar, o atrasado executa depois do retry, avança o contador, e o flush do
retry sai `ready: false`. A mensagem fica no buffer sem ninguém para consumir.

A classe é anterior à 3.1 (antes o comando pendurava, a Vercel devolvia 504 e
o n8n reenviava do mesmo jeito); o limite curto só a torna menos rara. Exige
Redis lento por mais de 2 s E reenvio do n8n. **Custo:** a rota do buffer
receber o id da mensagem (o `provider_message_id`, que é a pendência nº 4 do
usuário no n8n) e o script devolver o mesmo token para o mesmo id.

### 5.9 Leilão e permuta pelo agente gravam sempre como já pagos

Resíduo registrado ao fechar a 5.8 (07/10/2026). Não é defeito de data: pelo
AGENTE, `encerrar_remessa_evento` e `registrar_permuta` gravam sempre com
`pago: true`, então nunca nascem vencendo hoje, mas também nunca perguntam.
A venda do confinamento passou a perguntar "Você já recebeu?" na 5.8; se
leilão e permuta devem perguntar também é decisão de produto, para quando o
classificador do n8n for destravado (as duas intenções nem são emitidas hoje).

### 3.3 O agente do WhatsApp ignora a régua de cobrança

Achado em 07/10/2026, fechando a 3.2. Nenhuma rota interna do agente
(`turno`, `resolve-contact`, `execute-action`) lê `getBillingAccess`: um tenant
inadimplente em `read_only` ou `blocked` no painel continua **gravando pelo
WhatsApp** sem restrição. O ARQUIVADO já é recusado (3.2, em
`identificarContato`); a inadimplência não.

Não é conserto mecânico, é decisão de produto: cortar o agente de quem atrasou
o pagamento tira a ferramenta do curral justo de quem precisa regularizar, e
`read_only` no WhatsApp pede definir o que é leitura (consultas) e o que o
agente responde ao recusar uma escrita. **Custo:** depois da decisão, uma
checagem em `executarIntencao` (o núcleo comum aos dois caminhos), com a
classificação de leitura/escrita que `whatsapp-intents.ts` já tem.

### 5.0a "Acertei com o Zé Carlos" ainda sai ambígua

O grosso fechou na Fase 8 (08/10): o pagamento ao trabalhador sem valor foi de
80-84% para 93,5% nas duas medições, corrigindo a descrição do DOMÍNIO
(`docs/agents/agente-whatsapp/avaliacao-fase-8.md`). Sobraram duas frases que
saem `ambigua` nas duas rodadas: "acertei com o Zé Carlos" e "fechei a conta
com o Zé hoje". "Acertar com" serve também para cliente e para pergunta sobre
o passado, que o prompt de domínio manda para "nenhum".

Custo: perseguir as duas frases é ajuste fino em cima de dois casos, o
caminho que já piorou o conjunto na Fase 5. Não grava nada errado: o agente
responde que não entendeu.

### 5.0d A lista de quem grava sem confirmar precisa de catraca

`INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR` (`whatsapp-handlers/shared.ts`) hoje tem
uma intenção só, e duas pontas distantes dependem dela: o handler do estoque e
a porta de mensagem ambígua do turno. A lista é lida pelas duas, então editar
uma ponta mostra a outra; **mas nada obriga quem escrever um handler NOVO que
grave sem confirmar a se declarar nela**, e esse esquecimento reabre o caminho
de gravação indevida que a Fase 4 fechou.

Fechado em 2026-09-16 pela catraca da seção 1c de `scripts/m68-agente-turno.test.ts`,
no mesmo molde da seção 8 de `m67`: toda intenção de escrita ou está na lista,
ou o arquivo do handler dela contém `"confirmacao"`. Fica aqui o registro do
porquê, que a suíte não tem como contar.

---

## O que NÃO é dívida, e por quê

Registrado para uma sessão futura não "consertar" o que é decisão:

- **Saldo derivado, nunca gravado** (rebanho e estoque): é o invariante 2.
- **Recusa cancela sempre no estoque**, mesmo quando a mensagem traz correção
  contrastiva: decidido em 2026-08-18 depois de a alternativa gravar dinheiro.
  Reabrir exige ancorar no texto digitado, nunca em comparar campos remontados.
- **O produto nunca é criado pela conversa**: cadastro exige categoria e
  unidade, e adivinhar as duas cria três saldos para a mesma coisa.
- **Duas instâncias NextAuth** (tenant e plataforma): é o que impede uma sessão
  de tenant alcançar o painel interno.
