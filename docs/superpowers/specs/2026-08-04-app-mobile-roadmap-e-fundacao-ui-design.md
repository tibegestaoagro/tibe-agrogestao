# App mobile: roadmap e fundação de UI

Data: 2026-08-04
Status: desenho aprovado pelo usuário, sem implementação ainda.

## O pedido

Textual, do usuário: *"basicamente o que eu quero do app mobile: espelho do
que temos hoje com a aplicação web, porém podendo utilizar os recursos do
celular. Microfone, camera, notificações... o que voce entender que compensa
utilizarmos. como sei que no mobile é tudo mais limitado por conta do tamanho
de telas, julgo ideal abusarmos de modais e limitar as informações exibidas,
mas nunca excluidas."*

## Ponto de partida (verificado, não estimado)

- App hoje: 3 telas (Início, Rebanho só leitura, Financeiro com escrita) mais
  login. Consome apenas `/api/v1/auth/token*`.
- Painel web: 33 páginas.
- `packages/contracts` cobre 4 domínios (auth, financial, alerts, users) e
  não cobre 6 (rebanho, máquinas, tarefas, lavoura, prestador, minha-fazenda).
- Push nativo nunca feito. Distribuição só via Expo Go em desenvolvimento:
  **o app não é instalável por nenhum cliente hoje**.
- iPhone real nunca testado, só Android.
- Zero modais no app: o padrão pedido não existe em lugar nenhum ainda.

## Decomposição: são cinco projetos, não um

Tratar isso como um projeto só foi o primeiro erro a evitar. As peças, com a
dependência real entre elas:

| # | Peça | Depende de | Por que é separada |
|---|------|-----------|--------------------|
| 1 | Distribuição (build de loja, contas Apple/Google, credencial de push) | nada | não tem código; é fila de espera externa |
| 2 | **Fundação de UI** | nada | é o que este documento especifica |
| 3 | Contratos dos 6 domínios que faltam | rebanho espera categoria | trabalho de tipo, não de tela |
| 4 | Espelhar as áreas restantes | 2 e 3 | o volume do trabalho |
| 5 | O assistente (Tibé) por dentro | 2; arquitetura ainda não decidida | precisa de spec própria |

Duas razões para a peça 2 vir antes da 4: ela é a mais barata de fazer e a
mais cara de errar (firmar o padrão depois de 10 telas prontas significa
refazer as 10), e o usuário já deu a direção dela.

A peça 1 corre em paralelo desde já: conta Apple (US$ 99/ano), Google Play
(US$ 25, uma vez) e revisão de loja são prazo de terceiro, igual à
verificação do negócio na Meta.

A peça 5 **não cabe neste documento**: falta decidir onde a chamada ao LLM
acontece, se ela substitui ou convive com o classificador que hoje vive no
N8N, e se a pipeline de mídia (transcrição por Whisper, visão para recibo)
é reusada. Enfiar isso aqui viraria chute.

## Decisões tomadas

Todas com o usuário, em 2026-08-04. Registradas com o motivo, porque o motivo
é o que permite revisitar a decisão depois sem repetir a discussão.

### D1. O Tibé é a aba principal, no centro e elevado

```
 🏠        🐄       ╭─────╮      💰        ☰
Início   Rebanho   │ TIBÉ │  Financeiro  Mais
                   ╰─────╯
```

O assistente não é "mais uma área": é a porta de entrada do app. As 4 áreas
de uso diário ficam a um toque; as outras 9 (Minha Fazenda, Máquinas,
Lavoura, Prestador, Meu Dia, Alertas, Fazenda em Números, Calculadoras,
Configurações) vivem atrás de "Mais". Nada é removido, só hierarquizado por
frequência de uso.

Descartados: menu lateral espelhando a sidebar do web (2 toques para tudo, e
o padrão é comprovadamente menos usado no celular) e tela-hub sem abas
(obriga voltar ao início a cada troca de área).

### D2. O Tibé resolve na própria conversa

Pedido entendido vira resumo, o usuário confirma por texto, o Tibé salva e
responde. A conversa não abre telas.

Consequência boa: as telas **não** precisam aceitar deep link
pré-preenchido, e o roteador de intenções que já existe no back-end
(`routeIntent`, canal-agnóstico desde o Módulo 3) é reaproveitado quase
inteiro. O que falta é só a classificação por LLM (hoje no N8N) e um
endpoint autenticado por sessão do app, já que `/api/internal/whatsapp/*`
autentica por segredo compartilhado, desenhado para o N8N.

Custo aceito conscientemente: o produtor não aprende onde as coisas ficam no
app, e corrigir um campo que o assistente errou exige reformular a frase em
vez de editar o campo.

### D3. Densidade: limitar sem excluir

Quatro regras, válidas para todas as áreas:

1. Cartão de lista mostra **no máximo 3 dados**: identificação, o número que
   importa, o estado.
2. Tocar no cartão abre modal com **tudo** que a tela web mostra. Nada é
   removido do produto, só recolhido.
3. Toda escrita acontece em **modal de baixo** (bottom sheet), nunca em tela
   nova. Menos navegação, e o contexto de onde a ação partiu não se perde.
4. Filtro é modal, não barra fixa: a altura da tela é o recurso escasso.

### D4. Offline: fila de envio para escrita

Escrita funciona sem sinal e entra numa fila local, que sobe sozinha quando a
conexão volta, com indicador de "N registros aguardando envio". Leitura exige
conexão e marca o dado como desatualizado.

Cobre o caso real (anotar no curral, no pasto) sem pagar o preço do offline
completo. Banco local espelhado com sincronização nos dois sentidos foi
descartado por ser o item mais caro e arriscado do roadmap inteiro:
sincronização bidirecional num sistema multi-tenant é onde nascem os piores
bugs, e facilmente dobraria o tamanho do projeto.

### D5. Recursos nativos que valem a pena

Esta é a lista do APP como produto, não do que entra nesta peça. A coluna
"quando" diz em qual peça cada um aparece, porque nem todos dependem só de
código: push exige credencial de Apple e Google, que é a peça 1.

| Recurso | Para quê | Por que vale | Quando |
|---|---|---|---|
| Biometria | login | app de uso diário; digitar senha no celular é atrito | peça 2 (esta) |
| Microfone | entrada de voz no Tibé | é o coração do assistente | peça 5 |
| Câmera | foto de nota e recibo | a intenção já existe no back-end | peça 5 |
| Push | alertas | substitui o custo por conversa da Meta | depois da peça 1 |
| Compartilhar | enviar o PDF financeiro | poucas linhas, resolve "manda pro contador" | com a área Financeiro |

Ficam fora, de propósito: GPS marcando em qual pasto o registro foi feito, e
leitura de brinco por código de barras. Os dois são plausíveis, nenhum foi
pedido, e ambos custam mais do que parecem.

### D6. Assinatura é somente leitura no app

O app mostra plano, status e vencimento. Assinar e trocar de plano continua
no navegador.

Motivo: Apple e Google cobram 15% a 30% de comissão sobre compra digital
feita dentro do app. Exibir status é permitido; vender não. É o mesmo
caminho que Netflix e Spotify tomaram. Preserva a receita inteira e mantém o
Asaas como única fonte de cobrança, em vez de dois sistemas paralelos onde a
assinatura pode divergir.

### D7. Máquinas é a área-piloto

A fundação é construída junto com **uma área inteira, ponta a ponta**, e só
depois replicada. Máquinas foi escolhida porque exercita todos os padrões
(lista, detalhe, cadastro, histórico) e é a única área grande sem dependência
da mudança de rebanho para categoria.

Descartados: sistema de design completo antes das telas (projeta para
necessidade imaginada) e tela a tela extraindo padrão depois (termina em 10
telas inconsistentes).

## Escopo desta peça (fundação de UI)

Entra:

- Navegação de 5 abas com o Tibé central, e a tela "Mais" listando as 9 áreas.
- Os primitivos de UI: cartão de lista, modal de detalhe, modal de baixo para
  escrita, modal de filtro, estado vazio, estado de carregamento, indicador de
  dado desatualizado.
- A fila de escrita offline, com o indicador de pendências.
- Área de Máquinas completa, usando só esses primitivos.
- Login por biometria.

Não entra (cada uma com peça própria depois): as outras 9 áreas, o interior
do Tibé, os contratos dos 6 domínios, push nativo (depende da peça 1), e
qualquer coisa de rebanho (espera a mudança para categoria).

## Perguntas em aberto

Nenhuma bloqueia começar a fundação, mas as três precisam de resposta antes
das peças que dependem delas:

1. **Onde roda o LLM do Tibé** e o que acontece com o classificador do N8N.
   Bloqueia a peça 5.
2. **O que acontece depois dos 60 dias** de tenant arquivado por cancelamento
   (apagar, bloquear para sempre, outra coisa). Tem implicação de LGPD.
   Bloqueia o módulo de cancelamento, não o app.
3. **Se o rebanho por categoria muda o que o app mostra** de rebanho, além do
   cadastro. Bloqueia a área de Rebanho no app.

## Critérios de aceite da fundação

- As 5 abas navegam, e "Mais" alcança as 9 áreas (mesmo que a tela de destino
  ainda seja um esqueleto).
- Máquinas funciona ponta a ponta: listar, ver detalhe, cadastrar, registrar
  manutenção, filtrar. Toda escrita em modal de baixo.
- Nenhum cartão de lista mostra mais de 3 dados, e nenhum dado que o web
  mostra some do modal de detalhe.
- Com o avião ligado: cadastrar uma máquina entra na fila, o indicador mostra
  a pendência, e ao reconectar o registro sobe sem ação do usuário.
- Login por biometria funciona depois do primeiro login por senha.
- `tsc --noEmit`, `expo lint` e `expo-doctor` limpos.
- Validado num Android físico e, desta vez, também num iPhone real.
