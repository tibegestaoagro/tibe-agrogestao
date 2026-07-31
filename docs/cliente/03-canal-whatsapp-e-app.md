# TIBÉ: canal WhatsApp e aplicativo próprio

**De:** Pleno Digital
**Data:** 31 de julho de 2026
**Base:** documento de orientação sobre API Oficial e Evolution API (31/07/2026),
Manifesto e Arquitetura Funcional do TIBÉ

---

## Parte 1: a mudança de outubro de 2026

### O fato

A partir de **1º de outubro de 2026**, a Meta passa a **cobrar por mensagem de
serviço enviada dentro da janela de atendimento** da API Oficial. A janela de 24
horas continua existindo como regra operacional, mas deixa de ser gratuita.

Até aqui, a conta que fechava era: se o produtor iniciasse a conversa, responder
não custava nada. **Esse modelo acaba em dois meses.**

A tarifa brasileira vigente precisa ser confirmada na tabela oficial da Meta
antes de qualquer definição de preço de plano. Nenhum documento interno deve ser
a fonte desse número.

### O que isso muda para o TIBÉ

**Cada resposta do assistente vira uma linha de custo.** O que antes era só uma
decisão de experiência ("mando uma mensagem ou duas?") passa a ser decisão
econômica.

O consumo hoje se concentra em três lugares:

1. **O cadastro guiado.** Perguntar campo a campo consome muitas mensagens.
   Cadastrar cinco animais no formato pergunta-resposta gera cerca de **16
   mensagens de saída**.
2. **Respostas fragmentadas.** Dividir uma resposta em vários balões multiplica
   o custo pelo número de balões.
3. **Alertas.** Cada aviso enviado separadamente é uma mensagem paga.

Estimativa preliminar, com tarifa a confirmar: um produtor com uso moderado deve
custar poucos reais por mês, o que é sustentável frente aos planos atuais. Um
produtor **muito engajado** pode passar de vinte reais, e aí o plano de entrada
começa a apertar.

O ponto desconfortável, e que precisa estar claro na decisão comercial:
**quanto mais útil o produto for, mais ele custa por cliente.** Isso não é
motivo para limitar o produto; é motivo para desenhar a conversa com economia e
para medir o consumo desde o primeiro dia.

### O que faremos a respeito

| Ação | Efeito |
|---|---|
| **Consolidar respostas** numa única mensagem, em vez de fragmentar | Reduz o custo proporcionalmente e melhora a leitura. É também a boa prática recomendada no documento de orientação |
| **Encurtar o cadastro guiado**: convidar ao formato compacto ("brinco, raça, macho ou fêmea") e só perguntar campo a campo quando vier incompleto | Derruba de cerca de 16 para cerca de 3 mensagens no cadastro de cinco animais |
| **Resumo diário único** no lugar de um aviso por alerta | Corta o proativo em torno de cinco vezes e respeita o princípio "o tempo do fazendeiro vale muito" |
| **Medir mensagens por cliente**, visível no painel administrativo | Sem isso, o custo por cliente só aparece na fatura |
| **Rebanho por categoria** (Fase 1 do plano) | Registrar em lote consome muito menos mensagens que registrar animal a animal |

As duas primeiras ações melhoram a experiência mesmo se o custo não existisse.
Por isso recomendamos executá-las já, sem esperar outubro.

### Sobre a API não oficial

Conforme combinado, a conexão por QR Code fica restrita a **desenvolvimento,
testes e validação**, e permanece disponível como apoio para cenários futuros
não críticos. Ela **não será o canal de produção**.

Vale registrar por que, além do custo, essa é a decisão correta:

- Hoje **um único número atende todos os clientes**. Um bloqueio não afeta um
  cliente: interrompe o produto inteiro, ao mesmo tempo.
- O TIBÉ promete lembrete de vencimento. Sustentar essa promessa sobre um canal
  que pode ser desconectado sem aviso e sem suporte é incoerente com a própria
  promessa.
- É uso fora dos termos do WhatsApp, o que enfraquece a posição da empresa em
  qualquer discussão contratual com um cliente que alegue prejuízo.

### Um esclarecimento técnico importante

A escolha **não é "Evolution ou API Oficial"**. A Evolution é uma camada de
integração que pode operar com dois transportes: conectada à **Meta Cloud API**
(oficial) ou por **QR Code/Baileys** (não oficial).

Isso tem uma consequência prática boa: **mantemos a Evolution como camada e
apenas trocamos o transporte para o oficial.** A orquestração e as integrações
já construídas continuam valendo. A migração é de configuração e credenciais,
não de reconstrução.

### O que precisa começar agora

1. **Verificação do negócio na Meta** e número dedicado. É o item de **maior
   prazo e menor esforço nosso**, e leva semanas. Se ficar para setembro, chega
   atrasado.
2. **Aprovação dos modelos de mensagem (templates)** para os avisos proativos.
3. **Confirmação da tarifa brasileira** na tabela oficial.
4. **Revisão do preço do plano de entrada** à luz do custo por mensagem.

---

## Parte 2: aplicativo próprio

O cliente levantou a ideia de um aplicativo para não ficar refém do WhatsApp.
**Concordamos com o raciocínio**, e ele ficou mais forte com a mudança de
outubro. Mas a forma de fazer importa muito, e uma parte da premissa técnica
precisa ser corrigida.

### O aplicativo resolve dois problemas de uma vez

1. **Dependência de canal.** Se o WhatsApp cair, for bloqueado ou mudar regras,
   o produtor continua tendo onde acessar.
2. **Custo.** E este é o ponto que muda a conversa: **notificação push é
   gratuita.** Cada aviso entregue por push em vez de mensagem paga do WhatsApp
   é economia direta e permanente.

Ou seja: o aplicativo deixa de ser só proteção e passa a ser **alavanca de
custo**. É o argumento mais forte a favor dele.

### Correção de uma premissa: "espelhar React para React Native"

Essa operação não existe como algo barato. React e React Native compartilham a
forma de pensar, não os componentes. Não há tela, botão, estilo ou navegação que
se aproveite: tudo é reescrito com outras primitivas.

O que de fato se reaproveita é a **regra de negócio no servidor**, as validações
e o cliente de API. E isso já está pronto e continuaria servindo qualquer
aplicativo, sem nenhuma mudança.

Na prática, React Native significa **um segundo produto para manter**, com duas
lojas, dois ciclos de aprovação e duas superfícies de bug.

### O caminho que recomendamos: aplicativo instalável (PWA) primeiro

A plataforma web já é **mobile first** por decisão de projeto, porque o cliente
vem do WhatsApp e acessa pelo celular. Isso significa que a maior parte do
caminho já foi percorrida.

Transformá-la em aplicativo instalável entrega:

- **Ícone na tela inicial**, sem passar por loja de aplicativos.
- **Notificação push gratuita**, que é o objetivo econômico principal.
- **Funcionamento offline** para consulta do que já foi carregado, o que importa
  em área rural com sinal fraco.
- **Uma base de código só**, sem duplicar manutenção.
- **Atualização imediata**, sem esperar aprovação de loja.

O esforço é de **dias a poucas semanas**, contra **meses** de um aplicativo
nativo, e não interrompe o roteiro de produto.

Limitações honestas: no iPhone, o usuário precisa adicionar à tela inicial para
receber push, e a experiência é um pouco menos fluida que a de um aplicativo de
loja. Para o público do TIBÉ, majoritariamente Android, isso tem impacto
pequeno.

### Quando o aplicativo nativo passa a valer a pena

Não por vaidade de ter app na loja, e sim quando aparecer uma destas
necessidades:

- **Trabalho offline de verdade no campo**, registrando sem sinal e sincronizando
  depois. É a razão mais provável no caso do TIBÉ.
- Uso intenso de **câmera, GPS ou leitura de brinco eletrônico**.
- **Presença em loja como exigência comercial** de um parceiro ou distribuidor.

Nossa recomendação: **PWA agora, e reavaliar o nativo depois de seis meses de
uso real**, com dado de campo em vez de suposição. Se a necessidade de offline
aparecer, ela aparece nos dados de uso, e aí o investimento se justifica com
argumento e não com opinião.

### Uma observação sobre o papel do aplicativo

O documento de vocês é explícito: o WhatsApp **é parte do produto**, não um
canal alternativo. O aplicativo não deve tentar substituí-lo, e sim garantir que
o produtor nunca fique sem acesso e que os avisos tenham um caminho gratuito.

O desenho que propomos:

- **Registrar e perguntar:** WhatsApp continua sendo o principal.
- **Consultar, organizar e editar:** aplicativo e web.
- **Receber avisos:** push primeiro, gratuito; WhatsApp como reforço quando o
  aviso for crítico e precisar de comprovação.

---

## Resumo das decisões que pedimos

1. Autorizar o início da **verificação do negócio na Meta** ainda em agosto.
2. Confirmar a **restrição da API não oficial** a desenvolvimento e testes.
3. Aprovar a execução imediata das ações de **consolidação de mensagens**, que
   independem da data de outubro.
4. Aprovar o **aplicativo instalável (PWA)** como próximo passo de canal, com o
   aplicativo nativo reavaliado depois de seis meses de uso real.
5. Revisar o **preço do plano de entrada** assim que a tarifa oficial estiver
   confirmada.
