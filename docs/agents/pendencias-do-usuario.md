# O que depende de você

Tudo aqui é trabalho de interface (painel da Vercel, Railway, GitHub, n8n,
Neon), não de código. O código já está em produção e funcionando; cada item
abaixo diz o que melhora quando ele for feito, e o que acontece enquanto não
for.

Ordenado por consequência, não por esforço.

---

## 1. Vercel: push de colaborador não vira deploy, e o plano precisa subir

**Por quê.** No plano gratuito da Vercel, o deploy automático só dispara para
push da conta dona do projeto. Push feito por colaborador é ignorado, sem erro
visível no git: o commit entra na `main` e nenhum deploy nasce. Como o
`dilton-pleno` é colaborador, **todo push feito por ele para de virar versão no
ar**, e o sintoma só aparece quando alguém repara que a mudança não subiu.

Isto foi relatado pelo usuário em 25/08. Os últimos commits eram só de
documentação, então nada de comportamento ficou para trás, mas o primeiro
commit de código empurrado assim ficaria.

**O que fazer.** Subir o plano da Vercel, que é a decisão já tomada. Com o
plano pago, push de colaborador volta a disparar deploy.

**Enquanto o plano não sobe**, o caminho é empurrar como a conta dona. Neste PC
isso já está meio pronto:

- **Autoria: feita em 25/08.** Este repositório tem `user.name` e `user.email`
  locais apontando para `tibegestaoagro` (`git config --local --list | grep
  user` mostra). Vale só aqui, não mexe em outros projetos da máquina.
- **Credencial de push: falta.** O push usa o Gerenciador de Credenciais do
  Windows, onde ainda está a conta `dilton-pleno`. Para trocar, abra
  `Gerenciador de Credenciais` → `Credenciais do Windows`, remova a entrada
  `git:https://github.com`, e o próximo `git push` vai pedir login. É mexer em
  configuração do sistema, então é sua, não minha.

⚠️ **Autoria e credencial são coisas diferentes.** O nome no commit pode dizer
`tibegestaoagro` enquanto o push continua saindo pela credencial antiga, e a
Vercel olha para quem **empurrou**, não para quem assinou o commit.

---

## 2. `REPORT_LINK_SECRET` na Vercel

**Por quê.** Até 2026-08-20, a mesma chave (`INTERNAL_API_SECRET`) autenticava
as rotas internas **e** assinava o link público de relatório financeiro. Esse
link existe para ser mandado por WhatsApp e aberto sem sessão: ele circula em
conversa, em grupo, em captura de tela. Quem chegasse ao segredo por esse
caminho ganhava junto a credencial que escreve em **qualquer tenant**.

**O que fazer.**
1. Gerar um valor aleatório e longo (por exemplo, num terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
2. No painel da Vercel, projeto do Tibé, `Settings` → `Environment Variables`:
   criar `REPORT_LINK_SECRET` com esse valor, em Production (e nos outros
   ambientes que você usar).
3. Redeploy.

**Enquanto não for feito.** O sistema funciona: ele cai no
`INTERNAL_API_SECRET` como reserva e registra um aviso no log
(`REPORT_LINK_SECRET_AUSENTE`). Ou seja, o buraco continua aberto, só que agora
ele avisa.

**Efeito colateral esperado.** Links de relatório gerados antes da troca deixam
de valer, porque a assinatura muda. Como eles expiram em uma hora, na prática
isso só afeta quem estiver com um link aberto no momento da troca.

---

## 3. Provisionar o worker da rotina diária (Railway)

**Por quê.** `generateAllAlerts` percorre **todos os tenants ativos**, e isso
roda dentro da requisição da Vercel Cron, com o teto do timeout da função
serverless. O teto não incomoda com a base de hoje e passa a incomodar
exatamente quando o produto der certo.

**O que fazer.** O passo a passo completo está em
[worker-de-rotina.md](worker-de-rotina.md). Em resumo:
1. Criar um serviço novo no Railway (mesmo projeto do n8n), apontando para
   `tibegestaoagro/tibe-agrogestao`, branch `main`.
2. Comando de start: `npm run worker`.
3. Variáveis: `DATABASE_URL` (a **Pooled**, com `-pooler`, porque aqui é
   runtime), `REDIS_URL`, `EMAIL_PROVIDER` e as credenciais de email,
   `INTERNAL_API_SECRET` e `CONFIG_ENCRYPTION_KEY`.
4. Conferir no log que apareceu `worker: ouvindo a fila`.
5. **Só então** criar `ROTINA_COM_WORKER=1` na Vercel e fazer redeploy.

⚠️ **A ordem importa e inverter quebra em silêncio.** Se a variável for ligada
antes de o processo estar de pé, a rota passa a só enfileirar, ninguém consome,
e o sistema **para de gerar alerta sem nenhum erro**. O sintoma apareceria dias
depois, quando alguém reparasse que o aviso de vacina não chegou.

**Enquanto não for feito.** Nada muda: a rota executa a rotina dentro da
requisição, como sempre fez.

---

## 4. O n8n passar `provider_message_id`

**Por quê.** `execute-action` ganhou idempotência: a mesma mensagem não escreve
duas vezes. Um retry do n8n, ou uma reexecução manual no painel dele, regravava
a mesma venda de gado, o mesmo lançamento e a mesma saída de estoque. A chave é
o `wamid`, o id da mensagem no provider, que o n8n **já recebe** no payload do
webhook.

**O que fazer.** No workflow `Tibe - Atendimento WhatsApp (Evolution)`, no nó
que chama `execute-action`, acrescentar o campo `provider_message_id` ao corpo,
com o id da mensagem que já está disponível no fluxo.

**Enquanto não for feito.** O campo é opcional de propósito, para não quebrar o
agente. Sem ele, o comportamento é o antigo (sem proteção contra
reprocessamento), e cada chamada registra no log
`SEM_CHAVE_DE_IDEMPOTENCIA`.

**Observação de escopo.** Isto **não** é mexer no classificador, que segue
congelado por sua decisão. É passar adiante um campo que já existe.

---

## 5. Conferir o CI e ligar a proteção de branch (GitHub)

**Por quê.** O CI existe e roda, mas nada impede um push que o reprove.

**O que fazer.**
1. Abrir `https://github.com/tibegestaoagro/tibe-agrogestao/actions` e conferir
   que a execução mais recente está verde.
2. `Settings` → `Rules` → `New ruleset` → `New branch ruleset`, nome
   `main protegida`, enforcement **Active**, target **Include default branch**.
3. Marcar **apenas** "Require status checks to pass" e adicionar **só**
   `Conferencia estatica`.

⚠️ **Não marque `Suites com banco`, `Schema e migracoes contam a mesma
historia` nem `Worker da rotina diaria` agora.** Esses três só rodam em pull
request; se virarem obrigatórios e você fizer push direto, o check nunca roda e
a branch trava permanentemente.

Quando o fluxo de PR virar rotina, volte e marque também "Require a pull
request before merging", e aí sim adicione os outros checks.

**O passo 1 já está conferido:** em 2026-08-25 o CI estava verde até o
`17cd95d` (execução CI #26), e nenhuma das 26 execuções falhou. O que falta é a
regra.

⚠️ **A regra exige a conta `tibegestaoagro`.** Por `dilton-pleno`,
`/settings/rules` e `/settings/branches` devolvem 404, porque ela é
colaboradora sem acesso a opções do repositório. É a mesma diferença de conta
do item 1.

**Não consigo fazer daqui.** O `gh` CLI não está instalado nesta máquina, e
configurar regra é interface, não comando.

---

## 6. Staging: uma branch do Neon

**Por quê.** Hoje merge na `main` é produção, sem nenhum degrau entre as duas.
O CI cobre o estático e o isolamento, mas não substitui um ambiente onde clicar.

**O que fazer.**
1. No painel do Neon, criar uma **branch** do banco de produção (é quase de
   graça e leva segundos).
2. Na Vercel, em `Settings` → `Environment Variables`, definir `DATABASE_URL`
   para o ambiente **Preview** apontando para essa branch (a Pooled).
3. A partir daí, todo PR ganha um preview com banco próprio, e dá para clicar
   sem medo.

**Enquanto não for feito.** O preview da Vercel usa o banco de produção, então
**não abra PR com mudança de escrita e clique nele** sem saber disso.

---

## 7. As três decisões represadas com a Agromax

O documento está pronto em
[../cliente/04-decisoes-pendentes.md](../cliente/04-decisoes-pendentes.md) e
**ainda não foi enviado**. Revise antes de mandar.

A mais grave continua sendo a validação técnica das 12 calculadoras: elas estão
no ar com doses e consumos, e o próprio plano de ação diz que "nenhuma
calculadora vai ao ar sem validação assinada pela equipe TIBÉ". O risco escrito
é "recomendação errada em campo, com prejuízo real ao produtor".

---

## 8. Verificação de negócio na Meta

**É o maior risco de calendário aberto, e não depende de nenhuma fase deste
plano.** Foi recomendada em 31/07 com o aviso de que "se ficar para setembro,
chega atrasado", nunca começou, e leva semanas. A cobrança da Meta muda em
**01/10/2026**.

Junto: baixar o rate card oficial em BRL no Business Manager (quinze minutos),
que fecha a única incerteza grande do relatório de custos.

---

---

## 9. Duas cabeças invisíveis em produção (decisão de produto, pequena)

Medido em 2026-08-20, com `npx tsx scripts/diagnostico-integridade.ts`:

```
     2  cabecas em AnimalBatch (todas as fazendas)
    61  cabecas pelo livro-razao
     2  LOTES com saldo que o razao nao conhece (rebanho invisivel)
```

São os dois lotes antigos com brinco (`081` e `082`), criados **antes** da
correção de hoje, quando cadastrar rebanho não emitia movimentação. Eles
existem como ficha e não entram no saldo.

**Daqui para frente isso não acontece mais**: todo cadastro novo emite
movimentação quando a categoria traduz, e quando não traduz o resíduo aparece
neste mesmo diagnóstico em vez de sumir.

**O que fazer com os dois:** ou emitir a movimentação de saldo inicial para
eles (e aí o saldo sobe de 61 para 63), ou aceitar que são ficha de
identidade sem contagem. É decisão sua, e a diferença é de duas cabeças num
tenant de teste, então não é urgente. Só não deve ser esquecida, porque o
número vira pergunta quando alguém conferir.

---

## 10. Decidir se vale um coletor de erro externo (opcional)

**O plano previa Sentry, e eu não instalei.** A razão é específica deste
produto, e você pode discordar.

O que já existe sem nenhuma dependência nova: log estruturado em JSON (uma
linha por evento, com rota, método, tenant e um identificador que aparece na
mensagem de erro do cliente), captura de exceção em rota (`withApi`) e em
página (`onRequestError`). A Vercel indexa isso e permite filtrar por campo.

O que um SDK como o do Sentry acrescentaria: agrupamento de erros iguais,
alerta por email quando algo novo aparece, e captura de erro **no navegador**
do usuário.

O custo que me fez parar: o SDK client-side acrescenta peso ao pacote que o
navegador baixa, e este produto é usado em 3G no interior, onde o primeiro
carregamento já é o ponto mais frágil. Gastar bundle no lugar onde o produto
mais sofre, para ganhar agrupamento de erro, não me pareceu uma troca óbvia
com o volume atual.

**Se você quiser mesmo assim**, o meio-termo que eu recomendaria é instalar só
o lado servidor e deixar o cliente de fora. O ponto de plugue está em
`src/instrumentation.ts`, num lugar só.

**Enquanto isso**, quando algo quebrar em produção, o caminho é: pegar o código
de oito caracteres que apareceu na mensagem do usuário e procurar por ele no
log da Vercel.

---

## O que NÃO depende de você

Para não procurar o que já está resolvido: CI, envelope de erro, log
estruturado, captura de exceção em página, cabeçalhos de segurança, Next 16,
advisories de auth, integridade e auditoria no banco, idempotência de alerta,
conferência de tenant no `execute-action`, normalização de número e data no
agente, e o código do worker. Tudo isso está em produção e validado.
