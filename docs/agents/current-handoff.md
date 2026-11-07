# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima**,
e voltou a 442 em 02/09. Se ele passar de umas 200, arquive antes de
acrescentar. O de agosto está em `historico/2026-08.md`, o de setembro em
`historico/2026-09.md`.
## Estado atual

- Atualizado em: 2026-11-07 (plano 3 do Empório, Task 9).

### Programa de dívidas (07 a 14/10): encerrado, E0 a E10 em produção

⚠️ **Regra do Codex desde 07/10 (o limite de uso dele chegou a 90%):**
`adversarial-review` sempre com `--model gpt-5.6-terra` (intermediário; o
esforço padrão dele já é `medium`, e o comando não aceita `--effort`); **no
máximo 2 rodadas por etapa** (a primeira já pedindo só o bloqueante, a
segunda só para confirmar); o que sobrar vira dívida registrada; **etapa só
visual não passa pelo Codex** (quem pega defeito ali é o navegador). Não
editar `~/.codex/config.toml`: vale para todo o Codex do usuário.

O usuário aprovou em 07/10 um programa para fechar as dívidas de
[dividas.md](dividas.md) em etapas E0 a E11, uma branch por etapa, cada uma com
revisão adversarial do Codex e validação viva antes do merge. O plano está
fora do repositório (`~/.claude/plans/ok-agora-com-esse-vivid-petal.md`, só no
desktop); as decisões ficam resumidas aqui.
Decisões: 3.2 arquivado BLOQUEIA (vence o selo interno, preservando a janela
de leitura do cancelamento); 2.6 token novo `--texto-marca`/`--borda-marca`;
2.7 contorno nos chips de `/docs`; 5.5 frase com verbo + quantidade +
categoria substitui o pedido; 5.2 `contact_id` direto, negociação como
complemento; 2.3 entram os quatro itens; entram também unaccent, rebase do app
mobile, contratos e pasto com avaliação. Fora: 1.1, 1.3, 2.4.

**E0 (mod `guarda-contexto`):** ver a seção do mod no `CLAUDE.md`. **Ainda não
provado ao vivo:** o resumo terminar e a retomada sair (em headless o resumo
não concluiu). A primeira sessão interativa que passar de 90% é a prova.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em CANÁRIO

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md)
(uma seção de decisões por fase), planos em `docs/superpowers/plans/`,
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe das fases em
[historico/2026-09.md](historico/2026-09.md). Modelo `gpt-5.6-luna`, esforço
`low`; gasto do programa US$ 5,82 de US$ 30.

**O fluxo de produção do n8n é HÍBRIDO desde 18/09.** `UAAA96aJFiiFsQCL` (42
nós) tem o desvio `Agente Novo?` logo depois de `Consolidar Mensagem`: quatro
telefones (o usuário, que é o Owner da **Da Mata**, tenant real, e Lucas, Max e
Laíza Agromax) vão para a rota de turno; todo o resto segue no `execute-action`,
intocado. As intenções novas só existem para quem está na lista.

- **A lista mora na expressão do nó `Agente Novo?`**, no próprio n8n. É ali que
  se põe a Da Mata inteira, ou se esvazia para desligar o canário.
- **Ler, guardar, aplicar e mexer na lista: `scripts/n8n-workflow.ts`**
  (29/09, recriado no repositório depois que os de 18/09 sumiram com o
  scratchpad; lição `o-scratchpad-some-e-leva-o-voltar-atras`). Toda escrita
  mostra o que muda, só grava com `--confirmar`, e salva antes uma cópia em
  `~/.tibe/n8n-copias/` (fora do repositório: o JSON tem a chave da Evolution).
  Voltar atrás = `aplicar <cópia> --confirmar`, ou `canario --ninguem`.
  Escrita e volta provadas na cópia de homologação (inativa); o passo de
  **publicar** (n8n 2.x: salvar deixa em rascunho) só roda em fluxo ativo e
  ainda não foi exercitado: o script confere e avisa se ficar rascunho. Não
  existe cópia do fluxo de produção anterior a 18/09 (sumiu): antes da
  primeira escrita, `salvar`.
- ⚠️ **O classificador bloqueia escrita no n8n de produção e escrita
  destrutiva no banco de produção**, mesmo com autorização: quem roda é o
  usuário, como na migração do Neon. Leitura é livre.
- ⚠️ **O JSON do fluxo nunca entra no repositório**: carrega a chave da
  instância da Evolution.
- **Ler o canário:** `npx tsx scripts/observar-canario.ts [dias]` (conversa
  inteira, entrada e saída, só leitura, contra produção). Para ver quais nós
  rodaram (áudio, buffer), a API de execuções do n8n; o script que fazia isso
  morava no scratchpad.

O detalhe de 29/09 (seis defeitos do canário, roteiro do aparelho com passos
1 a 7 aprovados, dívidas 5.3 e 5.6 fechadas) foi para
[historico/2026-09.md](historico/2026-09.md). Faltam os passos 9 e 10 do
roteiro (foto de recibo e o "não" final).

### Empório: clientes, fornecedores, escolha do cliente e romaneio (06/11), planos 1 e 2 EM PRODUÇÃO (07/11), plano 3 pronto na branch

Design aprovado pelo usuário em 06/11:
`docs/superpowers/specs/2026-11-06-emporio-clientes-fornecedores-romaneio-design.md`.
Três planos, um por frente, a executar NESTA ordem, cada um com contexto limpo
(pedido do usuário), na branch `emporio-clientes-romaneio` (saída de `0c6a509`):
1. `docs/superpowers/plans/2026-11-06-emporio-frente1-clientes-e-fornecedores.md`
   (10 tarefas; `EmporioCustomer`/`EmporioSupplier` fora de `Contact`; muda
   schema e migra dados; `test:m95`; Q191 a Q198).
2. `docs/superpowers/plans/2026-11-06-emporio-frente2-escolha-do-cliente.md`
   (8 tarefas; busca por nome, pedaço do documento e do telefone sem DDD;
   `test:m96`; Q199 a Q204).
3. `docs/superpowers/plans/2026-11-06-emporio-frente3-entrega-e-romaneio.md`
   (10 tarefas; pedido para entrega e romaneio; `test:m97`).
**Deploy dos planos 1 e 2 em 07/11, de madrugada (fora do horário das lojas),
autorizado pelo usuário na conversa:** `conferir-clientes-emporio.ts antes`
(6 contas), as três migrações no Neon pela URL Direct (`migrate status` em
dia), merge e push da `main` até `ad2a42e`, `conferir ... depois` "Tudo
confere" antes e depois do deploy da Vercel (verde); `tibe_ensaio` apagado do
Docker. O registro abaixo é do que foi entregue.

**Plano 1 (Tasks 1 a 10 e revisão final).** Roteiro `npm run navegador -- emporio-clientes` verde;
decisões Q191 a Q198 na spec do módulo 39; o que ficou para depois em
[dividas.md](dividas.md) 5.20. Ensaio numa cópia fresca da produção (06/11):
contagens iguais antes e depois em 6 contas, 10 contatos saem de Contatos (6 da
Max Dias Agromax, o Consumidor final das outras 4), telas sem erro;
`test:all -- --sem-redis` 94/95, e a m92 (asserção velha do menu do Caixa)
corrigida e verde sozinha. A migração tem
`lock_timeout` de 5 s (provado nos dois sentidos).

**Plano 2 (a escolha do cliente e do fornecedor).** Tasks 1 a 8 e revisão
final (opus, minors corrigidos em `79bf02b`); `test:all -- --sem-redis` 96/96 e
o roteiro `emporio-escolha` verde no código final.
- busca no servidor de clientes e de fornecedores (`busca-de-cadastro.ts`,
  `telefone.ts`, coluna gerada `phone_busca`), a janela `JanelaDeEscolha` sobre
  a regra pura `sequencia-da-busca.ts`, `EscolherCliente` (Venda, Orçamento e
  Troca) e `EscolherFornecedor` (Compra), e as telas Clientes e Fornecedores
  com a mesma busca. Decisões Q199 a Q204 na spec do módulo 39; o que ficou
  para depois em [dividas.md](dividas.md) 5.21.
- Roteiro `npm run navegador -- emporio-escolha` (cenário
  `scripts/_cenario-emporio-escolha.ts`, nomes com prefixo `Escolha `), com a
  corrida da digitação e a recusa velha de Vencimento da Compra, provados nos
  dois sentidos. `manual-emporio` verde, com a figura nova
  `balcao-escolher-cliente`.

**Plano 3 (pedido para entrega e romaneio) COMPLETO na branch
`emporio-entrega-e-romaneio`** (saída da `main` `ad2a42e`): Tasks 1 a 10 e
revisão final (opus, pronta para merge); `test:all -- --sem-redis` 97/97
(07/11). Falta só o deploy, com autorização do usuário na conversa: a migração
no Neon (URL Direct), depois merge e push.
- **Produção:** a migração `20261107120000_emporio_pedido_para_entrega` **NÃO
  está no Neon**. É só acréscimo e pode ir a qualquer hora antes do push (a das
  lojas, as do plano 1, já foram). Merge, push e Neon pedem autorização na
  conversa.
- Entregue: marca "Pedido para entrega" com endereço copiado (principal, do
  cadastro ou outro) no orçamento e na venda, faturar herda, "Mudar" na venda
  fechada (`fatura_na_loja`, Histórico), romaneio A4 e bobina sem preço
  (`/emporio/imprimir/romaneio/[id]`), manual (parte "Pedido para entrega e
  romaneio", figuras `balcao-entrega` e `romaneio-impresso`), cenário de
  demonstração com um orçamento para entrega faturado. Decisões Q205 a Q213 na
  spec do módulo 39; dívidas em [dividas.md](dividas.md) 5.22.
- **Decidido pelo usuário em 07/11 (Q210):** a linha "PEDIDO PARA ENTREGA" nos
  papéis do orçamento e da venda (D8) fica como está, e o Vendedor também muda o
  pedido para entrega de venda fechada, só nas lojas dele (`fatura_na_loja`:
  Dono e Gerente geral sempre; Gestor, Caixa e Vendedor em suas lojas). Venda de
  outra loja segue 404 na leitura.
- **Defeito de produção achado e corrigido nesta branch:** no "Completar
  cadastro" (`ClienteForm` em modo `completar`), o que se digitava antes de o
  cadastro salvo terminar de carregar era sobrescrito. Os campos agora ficam
  desabilitados durante a carga (`cliente-form.tsx`), provado nos dois sentidos
  no passo 8b do roteiro `emporio-romaneio`.
- Roteiro `emporio-romaneio` precisa de `pypdf` no python do sistema.
Roteiro preso em recarga (página e `/login` em laço no log do `next dev`) é aba
sobrando no Chrome de testes, não defeito: ver o cofre,
`a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`.
Depois dos três: entrevistar o usuário sobre o **financeiro do Empório**
(separado do Tibé, com uma pessoa só do financeiro das lojas), pedido dele.

### Da Mata limpa para a Agromax (06/11)

A Agromax usa a conta Da Mata Sementes de verdade desde 01/11, só o Empório,
com as lojas AGROMAX e AGROMAX MOC (as 4 de demonstração e o "Estabelecimento
teste" já estavam arquivadas por eles). Em 06/11, autorizado pelo usuário na
conversa, `scripts/limpar-demonstracao-conta.ts` (na `main` desde 06/11)
apagou em produção tudo o que não era deles: 3.688 registros (as lojas de
demonstração e tudo delas, os 26 produtos antigos, os 4 usuários demo, rebanho,
financeiro, serviços, conversas do agente, o contador de vendas). Ficaram
1.556, conferidos por impressão digital antes e depois na mesma transação; a
recontagem dá "sai 0". Ensaiado antes numa cópia da conta no Docker. Ficaram
de propósito: o Dono, as categorias financeiras, o "Consumidor final" e o
vínculo do WhatsApp do usuário (vai para a conta de testes quando ela existir).
O cenário de demonstração **não pode** mais rodar na Da Mata.

Pendente do usuário: email e nome da conta de testes nova (depois, rodar o
cenário de demonstração nela e mover o WhatsApp), trocar o email de acesso da
Da Mata para o da Agromax, e os logins da equipe deles.

### Empório: equipe separada dos usuários do Tibé (06/11, Q190), em produção

Em produção desde 06/11 (`55dfd81`, merge e push autorizados pelo usuário, Vercel em sucesso; sem migração). A equipe do
Empório (quem tem `emporio_role`) tem limite próprio de 50 ativos por conta e
não ocupa assento do plano; os usuários do Tibé seguem no plano. A Equipe e
Configurações > Usuários não mexem um no outro. Tirar da equipe desativa e
guarda função, chaves e lojas; Reativar devolve, se houver vaga. O Gerente
geral é sempre só do Empório. O desativado deixa de entrar também pela sessão
do navegador: `getSessionUser` relê `active` e o papel no banco, e o proxy
manda ao login e apaga o cookie. Dívidas em `dividas.md` 5.19.

### Empório: o manual das entregas 1 a 4 e o cenário de demonstração (05/11), em produção

Merge fast-forward de `emporio-manual-demonstracao` (saída de `bbf62db`) na
`main` e push em 05/11, autorizados pelo usuário. Sem migração. Revisão final
da branch sem achado Crítico nem Importante; `test:all -- --sem-redis` 94/94.
Plano `docs/superpowers/plans/2026-11-05-emporio-manual-e-demonstracao.md`,
decisões Q188 e Q189 na spec do módulo. Sem migração. Contém:
- o relógio interno (`opts.agora`) nas actions de turno e em
  `salvarOrcamentoAction`, só para código interno (Q188; `test:m92` seção 7
  prova que a rota ignora data no corpo);
- o cenário `scripts/cenario-demonstracao-emporio.ts`: um turno por dia em
  cada loja, das 8h às 18h, com malote confirmado (o de hoje fica aberto), o
  custo de referência dos produtos, cabeçalhos e configurações das lojas,
  orçamentos nas quatro situações; a Juliana (vendedora da Loja da Rodovia)
  vira Caixa, porque um Caixa novo seria o sexto assento. Para antes de
  escrever se a loja tiver turno aberto de outra montagem;
- o manual: "Sou Caixa", "Configurações e impressão", "Orçamento",
  "Relatórios", o turno e o vendedor nas partes por tarefa, glossário e
  perguntas, a coluna Caixa nas permissões e o guia para imprimir numa folha
  A4; 40 figuras, 80 PNGs (10 MB) em `public/manual/emporio/`.

Provas: `npm run navegador -- manual-emporio` com 0 falhas e as 24 páginas do
manual sem "Imagem em preparação"; o cenário rodado duas vezes no Docker (a
segunda não duplica) e o `--apagar`.

⚠️ **Rodar o cenário na conta da Da Mata em produção exige autorização do
usuário:** muda a função da Juliana para Caixa. E hoje ele PARA lá: a Da Mata
tem um turno único aberto desde 30/10 (lido em produção), e refazer a
demonstração exige antes encerrar ou limpar esse turno, decisão do usuário.

### Empório, entrega 4: orçamento (05/11), em produção

**Em produção desde 05/11** (`b18d09f`): a migração
`20261105150000_emporio_orcamento` no Neon (URL Direct, `migrate status` em
dia), depois o merge fast-forward de `emporio-orcamento` e o push, autorizados
pelo usuário, com a Vercel em sucesso no status do commit. Sem reaplicação de
dados. Branch `emporio-orcamento` (saída de `e2c2d65`). Plano `docs/superpowers/plans/2026-11-05-emporio-entrega4-orcamento.md`,
decisões Q176 a Q187 na spec do módulo. Contém:
- `EmporioQuote` e `EmporioQuoteItem`, mais `EmporioSale.quote_id`: orçamento com
  número, validade (7 dias, até o fim do dia em Brasília) e situação derivada
  (aberto, vencido, faturado), cliente completo obrigatório;
- o balcão com o seletor Venda | Orçamento: salva o orçamento, e na Venda
  carrega pelo número e fatura (`quote_id`), com o vendedor do orçamento
  travado e os avisos de vencido, preço que mudou e falta de estoque;
- preço ao faturar: dentro da validade, cobra o menor entre o orçado e o de
  hoje (`preco_que_vale`), e o desconto da venda mede contra a referência
  `min(hoje, sugerido quando se orçou)` (Q184, revista na revisão final), então
  o desconto do orçamento aparece na venda e o limite vale sobre o total; acima
  do limite passa o gestor da loja ou o orçamento já autorizado, no preço que
  ele garantiu (a venda herda quem autorizou); depois da validade, a regra
  normal; faturar uma vez só (atualização condicional), e cancelar a venda
  devolve o orçamento a aberto;
- `/emporio/orcamentos` e o detalhe (Vendedor para cima; o Caixa só fatura
  digitando o número) e o papel do orçamento em A4 e bobina.

Provas (05/11): `test:m94` verde; o roteiro
`npm run navegador -- emporio-orcamento` (cenário
`scripts/_cenario-emporio-orcamento.ts`) verde, vermelho com o balcão sem
mandar `quote_id` (11 falhas, a primeira em "a venda sai") e verde de novo
restaurado; `emporio-vendedor` e `emporio-turno` seguem verdes; lista e balcão
em modo Orçamento sem rolagem horizontal a 390 px. A primeira rodada do
roteiro achou um defeito real: `/emporio/orcamentos` dava 500, porque a página
(server) importava `SITUACOES_DO_ORCAMENTO` de um arquivo `"use client"`
(`_components/orcamentos-filtro.tsx`). Corrigido na branch: a constante foi
para `_components/situacoes.ts`, sem `"use client"`, e o roteiro passou de novo
sem remendo nenhum.

A revisão final da branch achou o desconto que se somava (o Vendedor orçava no
limite e faturava com mais desconto sobre o orçado, sem o gestor, e a venda
gravava desconto 0): corrigido pela nova Q184, provado no `test:m94` seção 3
com mutações. A mesma rodada: o papel do orçamento faturado diz "FATURADO
(venda nº X)", o balcão não fecha venda de orçamento já faturado e tira o
`?orcamento=` do endereço depois da venda, e o `--apagar` do cenário de
demonstração apaga os orçamentos. Ainda esperam decisão do usuário as pontas
da Q187.

### Empório, entrega 3: vendedor e relatórios (05/11), em produção

**Em produção desde 05/11** (`03bba19`, merge fast-forward de
`emporio-vendedor-relatorios` e push autorizados pelo usuário, assim como a
migração e a reaplicação). Feito nesta ordem:
- leitura: 178 vendas, a última de 31/10, nenhuma registrada por quem hoje é
  Caixa (o backfill não faz de Caixa vendedor);
- a migração `20261105140000_emporio_vendedor_da_venda` no Neon (URL Direct),
  e o `migrate status` em dia;
- o merge e o push, com a Vercel em sucesso no status do commit;
- a reaplicação de `prisma/sql/emporio-vendedor-reaplicar.sql`, numa
  transação: 0 vendas sem vendedor antes e depois, 0 linhas mexidas.

Branch `emporio-vendedor-relatorios` (saída da `main` em `8db0603`). Plano
`docs/superpowers/plans/2026-11-05-emporio-entrega3-vendedor-e-relatorios.md`,
decisões Q168 a Q175 na spec do módulo. Contém:
- `EmporioSale.seller_user_id`: o Caixa escolhe o vendedor a cada venda
  (`SELLER_REQUIRED`, `INVALID_SELLER`), os demais vendem em nome próprio;
- a venda, o papel A4 e a bobina mostram o vendedor (e "Caixa N (nome)");
- a troca herda o vendedor da venda original;
- `/emporio/relatorios` (Gestor para cima): vendas por vendedor, por produto,
  produtos parados e por loja, por período.

Provas (05/11): `test:m93` verde; o roteiro
`npm run navegador -- emporio-vendedor` (cenário
`scripts/_cenario-emporio-vendedor.ts`) verde, vermelho com o balcão sem
mandar `seller_user_id` (12 falhas) e verde de novo restaurado; o
`emporio-turno`, adaptado para o Caixa escolher o vendedor, verde; Relatórios
e o balcão do Caixa sem rolagem horizontal a 390 px; `test:all -- --sem-redis`
93/93; revisão final da branch inteira (opus), com uma correção no
procedimento do deploy. O que ela deixou para depois está em
[dividas.md](dividas.md), item 5.16.

### Empório, entrega 2: caixa com turno (05/11), em produção

**Em produção desde 05/11** (`8db0603`, merge fast-forward de
`emporio-caixa-turno` e push autorizados pelo usuário, assim como as
migrações e a reaplicação). Feito nesta ordem:
- leitura: a última venda e o último movimento de caixa eram de 31/10;
- as duas migrações no Neon (URL Direct), e o `migrate status` em dia;
- o merge e o push, com a Vercel em sucesso no status do commit;
- a reaplicação, numa transação. Antes dela, a leitura mostrou 0 turnos, 0
  lojas sem caixa, 0 movimentos e 0 conferências sem caixa, e nenhuma loja
  para conferir à mão. Os três comandos mexeram em 0 linhas, porque o
  backfill da migração já tinha coberto tudo.

Branch `emporio-caixa-turno` (saída da `main` em `ad21e62`).
Plano `docs/superpowers/plans/2026-11-04-emporio-entrega2-caixa-com-turno.md`,
decisões Q150 a Q167 na spec do módulo (revisam Q35, Q92, Q93, Q110 e o
desvio "a gaveta é a loja" da F3a). Contém:
- caixas numerados por loja (toda loja tem o Caixa 1);
- turno: abrir conferindo o troco, reforço vindo da gerência, sangria,
  conferência livre, encerrar com malote;
- sangria e malote esperando o gerente confirmar, e o lugar "Com a gerência";
- a transferência liga a gerência ao banco, e a gaveta não transfere mais;
- o papel Caixa na Equipe (vende, recebe fiado, vê as vendas do dia, opera o
  caixa);
- toda operação de dinheiro da gaveta cai no turno, e toda venda exige caixa
  aberto (o balcão abre ali mesmo);
- o relatório do fechamento em A4 e na bobina, e os avisos novos do Meu Dia.

Provas:
- suíte `test:m92` (nova) e `test:all -- --sem-redis` 92/92;
- roteiro `emporio-turno` verde, e vermelho com o passo de abrir o caixa
  desligado; o PDF do relatório na bobina sai numa página de 58 mm;
- os roteiros antigos do Empório adaptados: 14 de 15 verdes. O
  `manual-emporio` tem falhas que dependem de dado ou de mês, e a imagem do
  celular do preço por loja sai em branco, ainda sem causa;
- revisão final da branch inteira (opus) e uma onda de correção.

**Roteiro do deploy, quando autorizado.** São duas migrações,
`20261105120000_emporio_caixa_turno` e `20261105130000_emporio_transferencia_gerencia`,
as duas aditivas, sem NOT NULL novo. A ordem:
1. Conferir por leitura que nenhuma loja está vendendo.
2. Aplicar as duas migrações no Neon (URL Direct).
3. Fazer o merge e o push.
4. Com a Vercel em sucesso e antes de qualquer abertura de caixa, rodar a
   consulta de leitura de `prisma/sql/emporio-caixa-turno-reaplicar.sql` e
   depois a reaplicação, que só mexe em loja cujo Caixa 1 nunca abriu.

O código antigo, na janela entre a migração e o push, grava a gaveta sem
caixa, e a chave `transferir_caixa` some antes do código que a usa.

**O manual** foi corrigido só no que dizia de falso. Falta o capítulo do turno
e do papel Caixa, que entra na atualização do manual. **No primeiro dia**,
toda venda pede para abrir o caixa, e a primeira abertura confere o saldo
antigo da gaveta. Se houver diferença grande, ela vira "Diferença de caixa" no
Financeiro. O usuário avisa a Da Mata.

**O cenário de demonstração** põe 30 dias de vendas num turno aberto hoje.
Corrigir antes de refazer a demonstração da Da Mata.

**Armadilhas de ambiente:**
- A migração `20261105120000` foi editada no lugar durante a branch. Um Docker
  de outra máquina que tenha a versão antiga precisa reaplicá-la.
- Os cenários `f6b` e `turno` mudam a conta do seed de vez: plano grupo, e os
  outros usuários desligados. O `_cenario-manual-emporio.ts` religa a equipe
  da demonstração.

### Empório, entrega 1: configurações e impressão da venda (04/11), em produção

**Em produção desde 04/11** (`ad21e62`, merge fast-forward de
`emporio-orcamento-caixa` e push autorizados pelo usuário; migração
`20261104120000_emporio_configuracoes_impressao` no Neon, URL Direct, também
autorizada, antes do push e sem venda acontecendo: a última era de 31/10;
`migrate status` em dia; as 178 vendas numeradas de 1 a N em cada uma das 2
contas, sem buraco, com o contador no máximo; Vercel com sucesso no status do
commit). Design
`docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md`
(entrega 1 de 4: as seguintes são caixa com turno, vendedor e orçamento),
decisões Q145 a Q149 na spec do módulo. Contém: tela `/emporio/configuracoes`
(validade, rodapés, bobina 80/58, logo no banco, cabeçalho das lojas), número
da venda por conta (6 dígitos), papel A4 e bobina sem valor fiscal em
`/emporio/imprimir/venda/<id>`, links de impressão no balcão e na venda.
Suíte `test:m91` (nova), `test:all -- --sem-redis` 91/91 verde. Roteiro
`emporio-impressao` verde, e ele achou um defeito que a suíte não via:
`@page { size: 58mm auto }` é inválido no CSS, o Chrome descartava o tamanho
e a bobina nunca chegava ao diálogo de impressão. Agora um componente client
mede o comprovante e grava `size: <largura>mm <altura>mm`; a conferência
reprova (2 falhas) com a regra antiga e passa com a correção. Depois de
mudar o schema, reinicie o `next dev`: o client do Prisma fica velho.

Revisão final da branch (opus) e uma onda de correção, revisada e limpa
(`e9f9909`, `034389c`):
- o papel fecha a conta com desconto: o item com desconto sai pelo preço de
  tabela, e a linha é o total praticado mais o desconto do item, para o
  granel fracionado fechar no centavo;
- a página de impressão passa pelos mesmos gates do painel (sessão, troca de
  senha, cobrança bloqueada);
- o `div` do botão tinha `display` inline vencendo o `print:hidden`, e o
  cupom saía em duas folhas.

O roteiro agora gera o PDF real (`Page.printToPDF`): uma página de 58 mm, e
2 falhas com o estilo antigo. `test:all` 91/91. **Não provados ao vivo:**
conta bloqueada abrindo o papel (o código é a mesma cadeia do painel) e a
impressora térmica de verdade (só o PDF).

Lição da janela de deploy, para as próximas entregas: coluna NOT NULL nova
numa tabela de venda exige migração e push em sequência, sem loja vendendo. A
ordem inversa derruba toda leitura do Empório. Com loja vendendo de verdade,
migrar em duas etapas (coluna anulável primeiro, NOT NULL depois do deploy).
O classificador recusa a migração no Neon quando a autorização fala só em
"merge e push": ela precisa ser citada. O papel ainda não mostra o troco (a
venda não guarda o dinheiro recebido).

### Empório: cadastro do cliente, nome do produto e menu (03/11), em produção

Pedido da Laiza (Agromax). Design
`docs/superpowers/specs/2026-11-03-emporio-cliente-nome-menu-design.md`, plano
`docs/superpowers/plans/2026-11-03-emporio-cliente-nome-menu.md`, decisões
Q139 a Q142 na spec do módulo. A busca nas listas de escolha ficou **fora**,
por decisão do usuário.

**Em produção desde 03/11** (`4ce1520`, merge fast-forward de
`emporio-cliente-menu` autorizado pelo usuário; migração
`20261103120000_contato_cadastro_completo` no Neon, URL Direct, antes do push,
`migrate status` em dia; as 5 contas com o Empório ligado têm o seu
"Consumidor final"; Vercel com sucesso no status do commit). Entregue: cliente PF/PJ (obrigatórios só no
balcão; em Contatos tudo opcional), "Consumidor final" fixo por conta, venda
sempre com cliente (revisa a Q37), aviso "Cadastro incompleto" com "Completar
cadastro", nome do produto editável, Meu Empório como grupo do menu (revisa a
Q59). Suíte `test:m90` nova; `test:all` 90/90 verde; roteiro
`emporio-cliente-menu` reprovado com o cliente opcional e verde com a
correção; telas vistas no navegador de testes (dono, gestor, vendedor,
celular).

**CNPJ alfanumérico (Q143), em produção desde 03/11** (`b5d3dd8`, merge
fast-forward autorizado pelo usuário; Vercel com sucesso no status do
commit). Decisão do usuário em 03/11: aceitar o CNPJ novo da Receita (12
posições de letra ou número, 2 dígitos verificadores numéricos, cada posição
valendo ASCII menos 48). Guardado em maiúscula e sem pontuação; a máscara da
tela aceita letra e o campo abre o teclado com letras. Sem schema nem
migração. Provas: `m90` com o exemplo da Receita (`12ABC34501DE35`) vista
falhando antes; roteiro `emporio-cliente-menu` com o passo 1b reprovado (6
falhas) com a correção desfeita e verde com ela; tsc, check, m73 e docs-api
verdes.

**Metro como unidade-base (Q144), 04/11, branch `emporio-unidade-metro`**,
com merge e push na `main` autorizados pelo usuário junto com este handoff.
Corda, arame e mangueira por metro: aceita fração, sem conteúdo, rolo como
apresentação fechada (`Rolo 100 m`). Usa o `metro` que já existia em
`src/lib/stock/units.ts`; sem schema nem migração. Provas: `m86` vista
falhando antes; roteiro `emporio-f6a` com o passo 8 reprovado com a correção
desfeita e verde com ela; m78, tsc, check e docs-api verdes. O passo 6 do
mesmo roteiro supunha nenhum produto de cão na conta, e o cenário de
demonstração rodado no banco local deixa quatro: a conferência passou a
olhar só a ração de gato do roteiro.

Pendências: refazer o cenário de demonstração da Da Mata (as vendas agora
levam cliente); o manual (`src/app/(dashboard)/manual/_conteudo/`) descreve o
cliente opcional, o "cadastro rápido" de dois campos e o menu antigo, e os
prints da venda e do menu estão velhos. Armadilha de ambiente: o `next dev`
entrou em laço de recarga duas vezes, e apagar `.next/dev` resolveu.

### Meu Empório (Módulo 39): F0 a F6 em produção

**F6 (ajustes do teste com o cliente, 30/10), branch `emporio-f6-equipe`.**
Decisões Q118 a Q138 na spec, tiradas por grill em três rodadas. Duas
entregas: **F6a** (saca e fardo como unidade-base com conteúdo, granel pelo
conteúdo com recusa da fração inexata, marca, fabricante, código, espécie,
fim do tipo Central/Ponto de venda) **em produção desde 30/10** (`a30c065`,
merge fast-forward autorizado pelo usuário; migração
`20261030120000_emporio_f6a` no Neon antes do push, `migrate status` em
dia; Vercel com sucesso; `content_qty` e `DUPLICATE_CODE` conferidos em
`/docs/api` de produção). Provas: `m86` verde (vista falhando antes), m37,
m77 a m85, docs-api, isolation, tsc e check verdes; roteiro `emporio-f6a`
verde e reprovado com a conversão escondida; telas vistas no celular. A
`m83` falhava no dia 30 por borda da janela de 30 dias no teste (corrigido).
**F6b em produção desde 30/10** (`e05846d`, merge fast-forward
autorizado pelo usuário; migração `20261030180000_emporio_f6b` no Neon
antes do push, `migrate status` em dia; Vercel com sucesso; rotas
`emporio/team`, `emporio/history` e `resolve` em `/docs/api` de produção;
`/login` 200 e página protegida redirecionando, ou seja, o proxy com banco
carrega na Vercel). Contrato na spec, seção "F6b: contrato"; a migração
traz função no Empório, transferência com diferença, `EmporioAuditLog` e a
migração de dados que dá a função a quem já via.
Entregue: papel lido do banco a cada request (`src/lib/emporio/papel.ts`,
fonte única da permissão), Equipe (`/emporio/equipe`), chaves do
Vendedor, trava só da loja na API (`guard()` com `lojaOk`), no WhatsApp
(`executarIntencao` e turno) e nas páginas (**no `proxy.ts`**: o layout e
o `template.tsx` não rodam na navegação por link, e o Vendedor via a
fazenda; o proxy do Next 16 roda em Node e lê o papel), Configurações com
o papel travado, transferência aguardando o Gestor, Histórico em toda
escrita (conferência 19 do `check` cobra) e tela `/emporio/historico`.
Regra a mais, decidida na revisão: o Gerente geral não altera nenhum
ADMIN da conta. Provas: m87, m88 (WhatsApp) e m89 (Histórico) escritas da
spec e vistas falhando antes; m77 a m89 verdes; roteiros emporio-f6b,
f6a, f5 e f1 verdes (f6b reprovado com a trava de página desfeita e com
a navegação por link antes do proxy); `test:all` 92/92.

**Cenário de demonstração (Q137) RODADO na Da Mata de produção em 30/10**
(autorizado pelo usuário; a Da Mata subiu para o plano `grupo` pelo fluxo
de assinatura). `npm run cenario:emporio-demo -- --conta <id> --confirmar`:
3 lojas, Equipe de 5 (emails `*.demo.emporio@example.com`; as senhas
temporárias foram entregues ao usuário na conversa e não estão em lugar
nenhum do repositório), 25 produtos, 173 vendas. Rodar de novo não
duplica. Atrito real achado: não existe "abrir embalagem" fora da venda,
então a produção da mistura exigiu uma contagem para passar milho do
lacrado ao avulso.

**Manual (Q138) em produção desde 30/10** (`ddbc34b`, merge fast-forward
autorizado; sem migração; Vercel com sucesso; imagem do manual 200 e
`/manual` sem sessão indo ao login). Capítulo do Empório com 19 partes e
26 figuras (computador e celular, 6,7 MB em `public/manual/emporio/`),
geradas pelo roteiro `npm run navegador -- manual-emporio` sobre o cenário
local; tela mudou, roda de novo. Os outros capítulos estão como "em
breve". O manual está aberto ao só da loja (`/manual` na lista do
`paginas-do-so-da-loja.ts`).

**Próximo:** nada em andamento. Candidatos: remover `Establishment.kind`
e o enum (Q121), "abrir embalagem" fora da venda (atrito do cenário), as
três pendências pequenas da F6b acima, e os outros capítulos do manual.

⚠️ **Em produção o Empório está ligado em QUATRO contas, não só na Da
Mata** (lido no Neon em 30/10): Da Mata, Max Dias, Laíza e Lucas
(Agromax), todas com a lista de usuários vazia e **só o Owner ativo**. Por
isso a migração de dados da F6b não muda ninguém em produção. Ela
transformaria Operador em Vendedor (só da loja, sem a fazenda): numa conta
com Operadores de fazenda e o Empório ligado para todos, isso seria
estrago. Conferir antes de reaproveitar aquele SQL.

Pendências pequenas da F6b: o lembrete de cadastro abandonado
(`pending-flows`) ainda pode sair para quem virou só da loja (a retomada é
bloqueada); a idempotência do resolver da transferência é pelo estado
(sem coluna da chave); a perda no caminho sem motivo por item grava
`outro`. Depois da F6: cenário de demonstração na Da Mata de produção
(Q137) e manual em `/manual` (Q138). A coluna `Establishment.kind` e o
enum saem numa entrega seguinte (Q121).

⚠️ O `next dev` entra em laço ou responde 500 depois do `prisma generate`
de uma migração. Parar o `next dev` ANTES do generate evita. Se for de
outra sessão, o classificador não deixa o agente matar: quem para é o
usuário (`taskkill //PID <pid> //T //F` no `!`, barras duplas por causa do
Git Bash), depois `rm -rf .next/dev`. `TaskStop` da tarefa do `npm run dev`
mata o npm mas deixa o node na porta.

**F0 (liberação e fundação) em produção desde 27/10** (`192e402`, merge
fast-forward da `emporio-f0`, que trouxe a spec junto; autorizado pelo
usuário). Migração `20261027120000_emporio_f0` aplicada no Neon antes do
push (`migrate status`: em dia), deploy da Vercel com sucesso, e as rotas
novas conferidas em `/docs/api` de produção. `TenantFeature`/`TenantFeatureUser`,
`Establishment`, perfil `emporio`, `StockMovement.property_id` anulável com
CHECK de exatamente um local, e os funis do estoque da fazenda filtrando
`property_id` não nulo. Cartão "Recursos em teste" no detalhe da conta da
Plataforma. Provas: `tsc` 0, `check` 0 falhas, `test:m77` verde (seção 12
vermelha antes da correção dos funis), `test:all` 79/80 com a `m73`
corrigida depois. Validação viva, seis passos aprovados no navegador
(desligado: sem menu e 404; ligar só o Owner, com a recusa da lista vazia;
página e API 200; estoque da fazenda igual; desligar e religar preservando a
lista; conta só de Empório). Ela achou dois defeitos, corrigidos: a sidebar
ignorava o `show` dos links de topo (anterior à F0) e o Painel rotulava
`emporio` como "Prestador". Observado e não mexido: na conta só de Empório,
o Meu Dia diz "SUA FAZENDA" e o menu mostra Calculadora Pecuária e Fazenda
em Números (igual às contas só de prestador hoje).

Cenário local: `scripts/_cenario-emporio-f0.ts` (conta
`so-emporio@teste.local`) e `scripts/_sessao-local.ts --plataforma`.

**F1 (estabelecimentos e catálogo) em produção desde 27/10** (`150b04a`,
merge fast-forward autorizado pelo usuário; migração
`20261027180000_emporio_f1` no Neon antes do push; Vercel com sucesso;
rotas conferidas em `/docs/api`). Loja nova vem como "Ponto de venda"
(decisão do usuário). Decisões Q50 a Q59 e o contrato na spec, dívida 2.22
nova. Quatro tabelas: `UserEstablishment`, `EmporioProduct`,
`ProductPresentation`, `PresentationPrice`. 16 actions em `emporio-catalogo.ts`, 12 rotas,
telas em `/emporio`, `/emporio/estabelecimentos`, `/emporio/produtos` e
`/emporio/produtos/[id]`. Provas: `tsc` 0, `check` 0 falhas, `test:all`
81/81, `test:m78` com 118 checagens (4 vermelhas com a precedência invertida
e o filtro Q51 tirado), roteiro `npm run navegador -- emporio-f1` com 33
itens (2 vermelhos com a fórmula trocada por soma) e o `emporio-f0` ainda
verde. O cenário `_cenario-emporio-f1.ts` liga o recurso na conta do seed
inteira e cria o `operador-emporio@teste.local`.

⚠️ **Prisma Client regenerado com o `next dev` no ar deixa o servidor com o
client velho** (`db.userEstablishment` indefinido), e depois disso o cache
`.next/dev` entrou em ciclo de recompilação (página recarregando a cada
poucos segundos, `js()` estourando o tempo). Saída: parar o `next dev`,
apagar `.next/dev` e subir de novo; a primeira compilação leva minutos.

Documento do cliente em `docs/area-meu-emporio/` (`.doc` binário; como ler
está no topo da spec). Entrevista com o usuário em cinco rodadas, Q1 a Q49,
registrada em [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(`1b2e871`, branch `spec-modulo-37-emporio`, empurrada, não mergeada).
Cortes de escopo viraram as dívidas 2.15 a 2.21. Teste na **Da Mata**, só
para o Owner, liberado por uma `TenantFeature` nova (genérica, com lista de
usuários). Sete fases (F0, F1, F2a, F2b, F3, F4, F5), aprovação entre elas.

### Dependências com falha de segurança (26/10): `npm audit` de 19 para 0

Em produção desde 26/10 (`74c9119`), três branches validadas (suíte 79/79,
CI, preview pelo usuário): next 16.4.3, react 19.2.9, zod 4.6.7; prisma 7.10.1
mais `audit fix` sem force; nodemailer 10.2.1 com `overrides`. O porquê de
cada uma está na mensagem do commit. Relatório da pesquisa, só no desktop e
fora do repo: `D:\Projetos\reports\Falhas de segurança do app Tibe.md`.

⚠️ Duas lições novas no cofre: `npm-audit-fix-force-troca-o-next-auth-por-outro-pacote`
e `o-preview-da-vercel-escreve-em-producao` (o teste de reset no preview mandou
código ao Owner da Da Mata). **No notebook, `node -v`: precisa ser 24.22.1
ou mais** (`winget upgrade --id OpenJS.NodeJS.LTS`).

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação com navegador (`browser-harness`) funciona, e desde 27/10
roda num Chrome só de testes:** `npm run navegador -- <roteiro>` (seção no
`CLAUDE.md`); o primeiro roteiro é o `emporio-f0`, 31 itens. Os seis atritos
que imitam defeito (aba oculta, leitura cedo, acento no `js()`) estão no cofre:
`a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`. Cenário de tela se
monta com script `tsx` (`scripts/_cenario-lista.ts`), nunca com `curl`.

### 🔴 SEGURANÇA: o repositório está PÚBLICO e o `.env.enc` vazou

Descoberto em 2026-09-02, ao instalar o `gh`. `CLAUDE.md` dizia (e foi
corrigido) que o repositório era privado. Ele é **público**, e nada registrava
essa mudança como deliberada.

**O que vazou:** o `.env.enc` commitado em 24/08 e removido da árvore em 27/08,
2.048 bytes, AES-256-CBC com PBKDF2 e 600 mil iterações. A mensagem daquele
commit descreve o conteúdo (as 22 variáveis, a `DATABASE_URL` de produção, a
`CONFIG_ENCRYPTION_KEY`), o que é um mapa para quem atacar.

**O que foi feito:** reescrita de histórico com `git filter-repo` e force-push
em 02/09. Clone novo do GitHub não tem mais o arquivo, e os 471 commits foram
preservados. **Os SHAs de TODA a história mudaram.**

⚠️ **A reescrita NÃO removeu a exposição, e isso foi VERIFICADO, não assumido.**
Depois do force-push, `GET /repos/.../commits/cbe4afba1cc...` e
`GET /repos/.../git/blobs/9eb485a5d359...` continuam respondendo, o segundo com
`size: 2048`. O GitHub guarda objetos inalcançáveis e serve por SHA. Com o
repositório público, esses dois `GET` funcionam sem autenticação.

**O que falta, e é do usuário:**

1. **Rotacionar as 22 variáveis.** É o único caminho que funciona
   independentemente de quem já copiou. Decidido pelo usuário em 02/09.
2. **Fechar o repositório.** Exige a conta `tibegestaoagro`: o `dilton-pleno`
   tem `push` mas não `admin`, e o `gh` devolve 404 na troca de visibilidade.
3. **Pedir ao Suporte do GitHub** a coleta dos objetos órfãos. É o único jeito
   de apagar do servidor deles.

⚠️ **O espelho do histórico antigo está em
`D:\tmp\tibe-backup-pre-rewrite.git`, e ele CONTÉM o `.env.enc`.** Apague
quando a rotação terminar.

⚠️ **O clone da outra máquina quebrou** com a reescrita. Lá, antes de tudo:
`git fetch --all --prune`, depois `git checkout main && git reset --hard
origin/main`. Trabalho não empurrado precisa virar patch antes.

### ⏭️ PRÓXIMO PASSO

**Empório, entrega 2 (caixa com turno) em produção desde 05/11.** O usuário
avisa a Da Mata: no primeiro dia toda venda pede para abrir o caixa, e a
primeira abertura confere o saldo antigo da gaveta. Fica em aberto a pergunta
de produto: o reforço vindo da gerência deve esperar o gestor confirmar, como
a sangria? A entrega 3 (vendedor na venda e relatórios) também está em
produção desde 05/11: o usuário avisa a Da Mata que o Caixa passa a escolher
o vendedor em toda venda, e que os Relatórios ficam no menu do Gestor para
cima. A entrega 4 (orçamento) também está em produção desde 05/11. Esperam
decisão do usuário as pontas da Q187: amarrar o cliente da venda ao do
orçamento, o preço orçado valer para qualquer quantidade, e o `sold_at`
retroativo pela API. O manual das entregas 1 a 4 e o cenário de demonstração
estão na `main` desde 05/11 (seção acima). Para refazer a demonstração na Da
Mata, o usuário decide o turno aberto desde 30/10 e autoriza rodar o cenário
lá (muda a função da Juliana para Caixa). Da entrega 1, segue
pendente o usuário imprimir um cupom
de 58 e de 80 mm na bobina da loja e um A4.

**Empório, 04/11:** o usuário pediu dois ajustes antes do manual e do cenário.
O primeiro (metro) é a branch `emporio-unidade-metro`; o segundo ele ainda vai
descrever. Depois dos dois, o manual e o cenário de demonstração do Empório
(ver a seção "cadastro do cliente" acima; o manual também precisa citar o
metro e o CNPJ alfanumérico).

**Meu Empório: TESTE DE CLIENTE pelo usuário, em produção.** As sete fases
(F0 a F5) estão no ar desde 29/10, mas foram provadas só no banco local;
ninguém usou o Empório com dado real. O usuário vai seguir
[roteiro-teste-emporio-cliente.md](roteiro-teste-emporio-cliente.md) (blocos
0 a 4: ligar só para o Owner da Da Mata, montar a loja, um dia de balcão no
celular, o dia seguinte, a produção). **Quem retomar:** receba a lista do que
ele estranhou, separe defeito (correção numa branch nova, com roteiro que
reprove antes) de "faz falta" (conversa de escopo, cruzando com as dívidas
2.15 a 2.27), e confirme com ele a decisão do balcão como página inteira.
Não ligue o recurso nem escreva dado da Da Mata pelo agente: é o usuário quem
faz, pela Plataforma e pelas telas.

Histórico das fases do Empório, abaixo.

**Meu Empório:** F0, F1, F2a e F2b em produção (recurso desligado até o
usuário ligar na Da Mata pela Plataforma). **F2b em produção desde 28/10**
(`31d02f8`, merge fast-forward autorizado; migração
`20261028120000_emporio_f2b` no Neon antes do push, autorizada; Vercel com
sucesso; transfers e production conferidas em `/docs/api`).

**F3a (venda, fiado e caixa) em andamento na `emporio-f3`** (a partir da
`main` em `31d02f8`). A F3 foi dividida em F3a e F3b (Q81). Decisões Q81 a
Q87 e o contrato da F3a na spec (`e1ab1ef`), dívida 2.24 nova (crédito na
loja). Schema e migração `20261028180000_emporio_f3a` **só no Docker**
(`5facad4`): `BankAccount`, `EmporioSale` e itens, pagamentos, devoluções e
itens, `CashMovement` (CHECK de gaveta OU conta), tipos `abertura_lacrado`,
`abertura_avulso` e `devolucao`; sem `CashDrawer` (a gaveta é a loja).
Feito em 28/10: suíte `m81` da spec (`8a0c078`), actions e 15 rotas
(`b507bcf`), devolução em dinheiro só até o que o cliente pagou e venda de
troca que não se cancela (`cfd9de8`, achados na revisão; 3 checagens
vermelhas sem a correção), `m81` pelas rotas (`4ce37ce`: 401, 404 desligado,
422 em português), cenário `_cenario-emporio-f3a.ts` (`1c6338d`), telas
`/emporio/vender`, `vendas`, `vendas/[id]`, `fiado`, `caixa` e os cartões do
início (`4220a7d`), recusa da troca em `items_devolvidos` (`e5d191a`). Provas:
`tsc` 0, `check` 0 falhas, `m81` verde com 224 checagens, `test:all` 84/84.
Roteiro `emporio-f3a` (`477e84d`, 40 itens, 0 falhas; vermelho com o
cancelamento desfazendo a abertura da saca), com o balcão em 390 px (sem
rolagem lateral, botão de fechar visível, teclado decimal). Roteiros
`f0`, `f1`, `f2a` e `f2b` verdes de novo (o `f2b` reprovou uma vez por tempo
na rodada em sequência e passou sozinho). **Em produção em 28/10, autorizado
pelo usuário:** migração `20261028180000_emporio_f3a` no Neon (URL Direct,
`migrate status` em dia) antes do push, e merge fast-forward da
`emporio-f3`. O balcão é página e não `FormSheet` (decisão de desenho a
validar com o usuário). **F3a aprovada pelo usuário em 28/10**; o teste do
balcão no celular dele fica junto com o da F3b.

**F3b (cartão, cheque, transferência entre caixas, conferência) em andamento
na `emporio-f3b`** (a partir da `emporio-f3`, que é a `main` mais a nota do
cofre `8c15bdd`). Decisões Q88 a Q95 e o contrato na spec (`f9f6656`), dívida
2.25 nova. Schema e migração `20261028220000_emporio_f3b` **só no Docker**
(`63615a9`): `CardFeeRule`, `CardReceivable` (a parcela é o a receber, e o
saldo da conta soma as parcelas de hoje para trás, por cálculo na leitura),
`EmporioCheck`, `CashTransfer`, `CashCount`. Suíte `m82` da spec
(`79679ba`, 231 checagens), actions e 11 rotas (`dee9294`), cenário
`_cenario-emporio-f3b.ts` (`87db9a3`), telas do balcão e do caixa
(`eef1dfb`), roteiro `emporio-f3b` (`e8b7492`, 0 falhas; 4 vermelhas com a
parcela caída fora do saldo da conta). Provas: `tsc` 0, `check` 0 falhas,
`m81` e `m82` verdes, `test:all` 85/85, roteiro `emporio-f3a` verde de novo.
**Em produção em 28/10, autorizado pelo usuário na conversa:** migração
`20261028220000_emporio_f3b` no Neon (URL Direct, `migrate status` em dia)
antes do push, merge fast-forward `c58c5f1..33b878b`, deploy de Production
do `33b878b` conferido pela API de deployments e as rotas novas no
`/docs/api`. **Falta:** o usuário ligar o Empório só para o Owner da Da Mata
na Plataforma e validar o balcão (F3a e F3b) no celular. **F3b aprovada pelo
usuário em 28/10.**

**F4a ("Vendeu, Pagou", despesa fixa, Resultado da Loja) em andamento na
`emporio-f4`** (a partir da `emporio-f3b`). A F4 foi dividida em F4a e F4b
(Q96). Decisões Q96 a Q102 e o contrato da F4a na spec (`7519076`), dívida
2.26 nova. Schema e migração `20261029120000_emporio_f4a` **só no Docker**
(`27fe8ee`): `VariableExpenseRule`, `SaleVariableExpense`,
`FixedExpenseTemplate`, `FixedExpenseSplit`, `FixedExpenseOccurrence`. Suíte
`m83` da spec (`1ecc63d`, 246 checagens), actions e 12 rotas (`92f0f96`),
cenário `_cenario-emporio-f4a.ts` (`263b819`, resultado previsto -750 e ponto
de R$ 2.222,22, conferido pela action), telas `/emporio/resultado` e
`/emporio/despesas` (`cc25280`), roteiro `emporio-f4a` (`94da23d`, 0 falhas;
3 vermelhas com as perdas fora do resultado). Provas: `tsc` 0, `check` 0
falhas, `m81`, `m82` e `m83` verdes, `test:all` 86/86, roteiros `f3a` e
`f3b` verdes de novo. **Em produção em 29/10, autorizado pelo usuário na
conversa:** migração `20261029120000_emporio_f4a` no Neon (URL Direct,
`migrate status` em dia) antes do push, merge fast-forward
`33b878b..3db1e63`, deploy de Production do `3db1e63` conferido pela API de
deployments e as rotas novas no `/docs/api`.

**F4b (visão somada, produtos, margem negativa, filtro de área do
Financeiro) em andamento na `emporio-f4b`** (a partir da `emporio-f4`;
começo aprovado pelo usuário em 29/10). Decisões Q103 a Q107 e o contrato na
spec (`060c556`), dívida 2.27 nova. **Sem schema novo** (sem migração no
Neon). Suíte `m84` da spec (`67ad3b1`, 155 checagens; 4 vermelhas com a
diferença da transferência contada também no destino), actions e rotas,
inclusive `area` no Financeiro e no PDF (`2771727`), cenário
`_cenario-emporio-f4b.ts` (`f6428a9`), telas (`9aa6eeb`), roteiro
`emporio-f4b` (`f52d51f`, 0 falhas; vermelho com a área Empório sem filtro).
Provas: `tsc` 0, `check` 0 falhas, `m83` e `m84` verdes, as suítes do
Financeiro verdes, `test:all` 87/87, roteiro `f4a` verde de novo. **Em
produção em 29/10, autorizado pelo usuário na conversa:** merge fast-forward
`3db1e63..9d95bc9` (sem migração), deploy de Production do `9d95bc9`
conferido pela API de deployments e as rotas novas no `/docs/api`.

**F5 (Meu Dia, Lista, Calculadora, primeiros passos) em andamento na
`emporio-f5`** (a partir da `main`; começo aprovado pelo usuário em 29/10).
Decisões Q108 a Q117 (todas A) e o contrato na spec (`fafbe6f`). **Sem schema
novo.** Achado que pautou a fase: os lançamentos do Empório caíam no Meu Dia
(tela, Painel, WhatsApp) e nos alertas de qualquer usuário, e no "Tudo" do
Financeiro de quem está fora da lista. Suíte `m85` da spec (`791d058`),
actions e rotas (`658aab4`), cenário `_cenario-emporio-f5.ts` (`fcb4374`),
telas (`96f032c`), roteiro `emporio-f5` (`8b26b17`, 33 itens, 0 falhas; 2
vermelhos com `veEmporio` sempre verdadeiro). Provas: `tsc` 0, `check` 0
falhas, `test:all` 88/88. **Em produção em 29/10, autorizado pelo usuário
na conversa:** merge fast-forward `9d95bc9..047065e` (sem migração), deploy
de Production do `047065e` conferido pela API de deployments e as rotas
`first-steps` e `composition/from-recipe` no `/docs/api`. **Com a F5, as
sete fases do Módulo 39 estão em produção.** Falta o usuário ligar o Empório
para o Owner da Da Mata na Plataforma e validar no celular.

⚠️ **O desktop tem DOIS clones** (`C:\Projetos\tibe-agrogestão` e
`D:\Projetos\tibe-agrogestão`). Em 29/10 o `next dev` do `D:` ocupava a 3000
e devolvia 500, e o classificador recusou derrubá-lo. Saída sem matar nada:
o Next deste clone sobe na 3001 e o roteiro segue com
`TIBE_BASE="http://localhost:3001" npm run navegador -- <roteiro>`. Também:
o `innerText` devolve texto com o `uppercase` do CSS aplicado, e a
calculadora só mostra resultado depois de clicar em Calcular.

Histórico da F2a: decisões Q60 a Q71 e o contrato na spec (`f1b5d17`). Estoque
(`1ecaf19`), compras e Lista com loja (`576c842`), telas (`3d61ef7`),
produtos do Empório no comprei da Lista com loja (`85f1977`). Provas: `tsc`
0, `check` 0 falhas, `test:all` 81/82 com a `m73` corrigida depois
(`75ba8e2`, contrato), `test:m79` com 162 checagens (6 vermelhas com o
cancelado contado e o frete por igual), roteiro `emporio-f2a` com 32 itens
(vermelho com a média trocada pelo último custo), `emporio-f0` e
`emporio-f1` verdes. Papéis da F2a decididos pelo padrão da Q55 (compra,
contagem, perda e estoque inicial com OPERADOR; cancelar e limites com OWNER
e ADMIN), registrados na spec. Histórico da F2b (transferência e
composição): decisões Q72 a Q80 e o contrato na spec (`2e80991`),
dívida 2.23 nova, schema e migração `20261028120000_emporio_f2b` só no
Docker (`bec3487`). Transferências com Meu Dia e em trânsito na reposição
(`df37456`), composição e produção (`be15a19`), suíte `m80` com 149
checagens (5 vermelhas sem a exigência do motivo, 2 sem o rendimento;
`b890a82`), telas (`3c719d6`), cenário `_cenario-emporio-f2b.ts`
(`9e4eed3`), roteiro `emporio-f2b` com 29 itens (`4b37012`, vermelho com o
custo da entrada trocado). Validação: `test:all` 83/83, os quatro roteiros
do Empório verdes, `check` 0 falhas. ⚠️ O Claude Code corta o `next dev` em
segundo plano quando a memória aperta com a sessão parada (27 e 28/10):
liberar memória antes da validação viva, ou iniciar o Claude Code com
`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`. Acompanhar o `test:all` em
primeiro plano evita o corte. A rotação de segurança
(item 1) foi adiada pelo usuário em 27/10 para tratar do Empório.

**0. Programa de dívidas ENCERRADO: E0 a E11 em produção** (E11, `ccf1474`).
E10 (2.3): filtros do §19, pasto, forma de pagamento e peso/arroba (`31027e1`,
migração no Neon pelo usuário antes do push). **14/10: `.env` é o Neon e
`.env.local` o Docker**; suítes e seeds leem `scripts/_env-local.ts`, o Prisma
CLI só o `.env` (tabela no `CLAUDE.md`). O que sobrou para o usuário está no
item 12 de [pendencias-do-usuario.md](pendencias-do-usuario.md). Depois, em
produção: 2.8 (`229b957`), 5.12 (`dcbbd73`, `m75`), 3.3 (`78829e1`:
o agente segue a régua do painel; `m76`). 4.1 servidor em produção
(`cdd6473`: sete domínios no pacote, seção por domínio na `m73`). **n8n, 14/10:
`Execute Action` manda `provider_message_id`** (1ª chave vista em produção).
`npm run wa` lê só o `.env`, mas o `REDIS_URL` dele é local: não vê resposta. 5.13/5.15/5.10 paradas. 5.0a em produção (`2ff9a3b`). **5.9 em produção
(`divida-5-9-ja-recebeu`, só no canário)**: leilão e permuta perguntam se o dinheiro entrou
(`m48`, `m49`; avaliação em `avaliacao-fase-8.md`), Codex aprovou. 16/10, canário: "3 novilhas" na permuta dizia "é máquina ou produto"; agora pergunta a faixa, e a faixa sobrevive à pergunta do vencimento (`m49` bloco 18; validado no aparelho em 19/10, com a 5.9). 2.3 fechada
por decisão; 2.4 espera a conversa com a Agromax ([roteiro](roteiro-agromax-rebanho-por-categoria.md)). E3-E9: [historico/2026-10.md](historico/2026-10.md). **Próximo no aparelho (26/10): o [roteiro do estoque](roteiro-aparelho-estoque.md), blocos 0 a 5; a Da Mata não tem produto (lido em produção), então começa pelo bloco 0 no painel.**

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou, e cada commit que sobe é leitura pública. **27/10: o usuário decidiu
começar agora**, logo depois das dependências. É o próximo trabalho da
sessão: guiar a rotação variável por variável (o agente nunca lê nem imprime
o valor; quem troca no painel de cada serviço e na Vercel é o usuário), e só
então apagar `D:\tmp\tibe-backup-pre-rewrite.git`.

**2. Do usuário, pequeno:** trocar o nome do cadastro "Owner Da Mata" em
Ajustes, que é por isso que a saudação sai sem nome.

**3. Fechar a Fase 7, quando o usuário quiser:** passos 9 e 10 do
[roteiro](agente-whatsapp/roteiro-do-chip.md). **Decidido em 29/09: o canário
fica com os 4 telefones de hoje**; ampliar a lista não está no plano até o
usuário reabrir o assunto. Quando reabrir: Da Mata inteira, depois "todos" e
desligar o `execute-action`. As duas trocas de lista são
`npx tsx scripts/n8n-workflow.ts canario <telefones...> --confirmar` e
`... canario --todos --confirmar`, rodadas pelo USUÁRIO (escrita no n8n de
produção). Antes da primeira, `... salvar`.

**4. Validar no celular as correções de 29/09** que ainda não foram exercitadas
em conversa real: "comprei 10 sacas de sal do Zé por 200" tem que perguntar se
já pagou; "quanto tenho a pagar nos próximos 100 dias" tem que dizer até que
data olhou; "comprei 30 machos de 0 a 8 meses" tem que ir direto à confirmação.

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- O Redis local é `tibe-redis` na `56379` (conferido em 11/09); `docker ps` antes.
  No desktop (clone novo em `D:\Projetos\tibe-agrogestão`, 26/10) existia um
  `tibe-redis-local` na `6390` que o `.env.local` não usa: foi parado e o
  `tibe-redis` criado. O `.env` e o `.env.local` desse clone vieram da pasta
  do usuário no OneDrive (`tibe-docs`), e o banco local recebeu as 12
  migrações que faltavam.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis;
  `docker exec tibe-redis redis-cli FLUSHALL` (Redis LOCAL) e ela passa.
