import type { Endpoint } from "@/components/public/endpoint-card";

/**
 * Catálogo dos endpoints exibidos em /docs/api.
 *
 * Vive separado da página (auditoria de 2026-08-04) porque é DADO, não UI:
 * ocupava 1007 das 1057 linhas do componente, que era o maior arquivo
 * autoral do projeto. Separado, a página fica com o que ela de fato faz
 * (renderizar) e este arquivo vira o lugar óbvio de editar quando uma rota
 * muda.
 *
 * `scripts/docs-api-completeness.test.ts` compara esta lista com os
 * `route.ts` reais e falha se uma rota nova ficar sem documentação.
 */
export type Group = { title: string; note?: string; endpoints: Endpoint[] };

export const GROUPS: Group[] = [
  {
    title: "Autenticação e conta",
    note: "Login não é uma rota /api/v1 própria: usa o fluxo padrão do NextAuth (signIn(\"credentials\", {...}) no client, contra /api/auth/callback/credentials). A sessão resultante carrega tenant_id e role.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/signup/start",
        auth: "Público",
        description: "Etapa 1 do cadastro verificado. NÃO cria conta: valida, checa duplicidade de documento/email contra os dados reais, abre um cadastro pendente e dispara o código de WhatsApp. O identificador do cadastro volta em cookie httpOnly (`tibe-signup`), nunca no corpo. Sem senha: ela é gerada no fim e enviada pelos canais verificados. `utm_source`/`utm_medium`/`utm_campaign` são opcionais (first-touch, ver `src/lib/utm.ts`): persistidos no `Tenant` quando o cadastro conclui.",
        request: `{
  "company_name": "Fazenda Boa Vista",
  "owner_name": "Maria Silva",
  "owner_email": "maria@fazendaboavista.com.br",
  "document": "12345678000199",
  "phone": "22999990000",
  "plan": "fazenda",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "lancamento"
}`,
        response: `201
{ "data": { "state": { "whatsapp_verified": false, "email_verified": false, "phone_masked": "5522*****0000", "email_masked": "ma****@fazendaboavista.com.br", "current_step": "whatsapp", "allow_edit_after_seconds": 120 } }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/signup/verify",
        auth: "Público (cookie do cadastro pendente)",
        description: "Confirma o código de 6 dígitos de um canal (WhatsApp primeiro, email depois). Quando o SEGUNDO canal é confirmado, o Tenant (trial de 14 dias) e o User owner são criados, a senha temporária é enviada pelos dois canais e devolvida aqui para o login automático. Código errado, expirado ou ausente devolvem o mesmo `INVALID_CODE`; o código expira em 10 minutos e aceita no máximo 5 tentativas. Duas formas de resposta: confirmar o PRIMEIRO canal devolve `completed: false` com o estado atualizado (mesmo formato de `GET /signup/state`); confirmar o SEGUNDO devolve `completed: true` com a credencial.",
        request: `{ "channel": "whatsapp", "code": "123456" }`,
        response: `200 (1º canal)
{ "data": { "completed": false, "state": { "whatsapp_verified": true, "email_verified": false, "current_step": "email", "...": "..." } }, "meta": {} }

200 (2º canal, conta criada)
{ "data": { "completed": true, "email": "maria@fazendaboavista.com.br", "temp_password": "Xy9k2Qmz" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/signup/resend",
        auth: "Público (cookie do cadastro pendente)",
        description: "Reenvia o código e, com `destination`, corrige o número ou o email antes de reenviar. Só vale para canal ainda não confirmado. Limitado por destino e por origem: a rota dispara mensagem sem login, então sem limite viraria ferramenta de perturbação.",
        request: `{ "channel": "whatsapp", "destination": "22988887777" }`,
        response: `200
{ "data": { "whatsapp_verified": false, "current_step": "whatsapp", "...": "..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/signup/state",
        auth: "Público (cookie do cadastro pendente)",
        description: "Estado das etapas do cadastro em andamento, usado pelas páginas para renderizar o passo certo na retomada. Devolve `SIGNUP_EXPIRED` (410) quando o cadastro venceu.",
        response: `200
{ "data": { "whatsapp_verified": true, "email_verified": false, "current_step": "email", "...": "..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/change-password",
        auth: "Sessão (sem guard de módulo/cobrança)",
        description: "Troca OBRIGATÓRIA da senha temporária, no primeiro acesso. Não pede a senha atual de propósito: quem chega aqui acabou de provar posse dos canais (cadastro verificado) ou digitou a temporária no login. Zera `must_change_password` e exige senha forte (8+ caracteres, maiúscula, número e símbolo).",
        request: `{ "new_password": "MinhaSenha1!" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/change-password-self",
        auth: "Sessão (sem guard de módulo/cobrança)",
        description: "Troca VOLUNTÁRIA da própria senha, a qualquer momento. Aqui a senha atual É exigida: o cenário é uma sessão aberta num computador destravado. Disponível para qualquer papel, não só Owner/Admin.",
        request: `{ "current_password": "SenhaAtual1!", "new_password": "MinhaSenha1!" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/tenant/profiles",
        auth: "Sessão · OWNER/ADMIN",
        description: "Ativa (ou reativa) um perfil de negócio do tenant. Idempotente. Ativar 'fazenda' provisiona o catálogo padrão de vacinas.",
        request: `{ "profile_type": "fazenda" }`,
        response: `201
{ "data": { "id": "cl...", "profile_type": "fazenda", "active": true, "created_at": "2026-07-10T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/tenant",
        auth: "Sessão · qualquer papel",
        description: "Dados cadastrais do tenant (nome, documento, telefone, email). Leitura liberada pra qualquer papel, inclusive VISUALIZADOR: usado pelo aplicativo mobile pra mostrar o nome da fazenda na tela Início.",
        response: `200
{ "data": { "id": "cl...", "name": "...", "document": "...", "phone": "...", "email": "..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/tenant",
        auth: "Sessão · usuarios:write",
        description: "Edita dados cadastrais do tenant (nome, documento, telefone, email).",
        request: `{ "name": "Fazenda Boa Vista LTDA", "document": "12345678000199", "phone": "22999990000", "email": "contato@fazendaboavista.com.br" }`,
        response: `200
{ "data": { "id": "cl...", "name": "...", "document": "...", "phone": "...", "email": "..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Recuperação de senha",
    note: "3 etapas, todas SEM sessão (usuário esqueceu a senha, por natureza). Só para User de tenant, não para PlatformUser.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/password-reset/request",
        auth: "Público",
        description: "Pede um código de recuperação por email ou WhatsApp. Resposta sempre `{ requested: true }`, exista ou não a conta (proteção contra enumeração). Limitado por email (3/hora).",
        request: `{ "email": "maria@fazendaboavista.com.br", "channel": "whatsapp" }`,
        response: `200
{ "data": { "requested": true }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/password-reset/verify",
        auth: "Público",
        description: "Valida o código de 6 dígitos (expira em 10 minutos, máximo 5 tentativas). Código errado e conta inexistente devolvem o mesmo `INVALID_CODE`. Sucesso devolve `reset_id`, exigido pela etapa seguinte.",
        request: `{ "email": "maria@fazendaboavista.com.br", "code": "123456" }`,
        response: `200
{ "data": { "reset_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/password-reset/confirm",
        auth: "Público (posse do `reset_id` verificado)",
        description: "Define a nova senha. Exige `reset_id` com `verified_at` preenchido e `consumed_at` nulo (uso único). Zera `must_change_password` e exige senha forte (8+ caracteres, maiúscula, número e símbolo).",
        request: `{ "reset_id": "cl...", "new_password": "MinhaSenha1!" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/token",
        auth: "Público (é o passo que cria a identidade)",
        description:
          "Login do aplicativo por email e senha, devolvendo o par access + refresh. Roda sem sessão por natureza, como as rotas de recuperação de senha. Não aplica o gate de sessão de propósito: quem tem senha temporária precisa autenticar para conseguir trocá-la, e as rotas de negócio seguem barradas pelo guard(). O rate limit é aplicado ANTES da busca pelo usuário, para não diferenciar conta inexistente de senha errada nem pelo erro nem pelo tempo de resposta.",
        request: `{ "email": "maria@fazenda.com.br", "password": "..." }`,
        response: `200
{ "data": { "access_token": "...", "refresh_token": "...", "expires_in": 900, "user": { "id": "cl...", "name": "Maria", "email": "maria@fazenda.com.br", "role": "OWNER" } }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/token/refresh",
        auth: "Público (posse do refresh token)",
        description:
          "Troca o refresh por um par novo. Uso único: o token apresentado é invalidado na troca (rotação), então um refresh capturado e reusado depois falha. Só o hash do refresh é persistido, nunca o token em claro.",
        request: `{ "refresh_token": "..." }`,
        response: `200
{ "data": { "access_token": "...", "refresh_token": "...", "expires_in": 900 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/auth/token/revoke",
        auth: "Público (posse do refresh token)",
        description: "Invalida o refresh token informado. Usado no logout do aplicativo, em melhor esforço: o app limpa a sessão local mesmo se esta chamada falhar.",
        request: `{ "refresh_token": "..." }`,
        response: `200
{ "data": { "revoked": true }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/auth/profile",
        auth: "Sessão (qualquer papel)",
        description:
          "O próprio usuário renomeia a si mesmo. Sem guard() de módulo nem checagem de cobrança de propósito: editar o próprio nome não é privilégio de papel nem deve ser bloqueado por inadimplência.",
        request: `{ "name": "Maria Silva" }`,
        response: `200
{ "data": { "id": "cl...", "name": "Maria Silva" }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Usuários",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/users",
        auth: "Sessão · usuarios:read",
        description: "Lista os usuários do tenant. `meta.seats` traz o uso de assentos do plano (usuários ativos contra o limite).",
        response: `200
{ "data": [{ "id": "cl...", "name": "...", "email": "...", "phone": "...", "role": "OPERADOR", "active": true, "created_at": "..." }], "meta": { "total": 1, "seats": { "used": 1, "limit": 2, "has_room": true } } }`,
      },
      {
        method: "POST",
        path: "/api/v1/users",
        auth: "Sessão · usuarios:write",
        description: "Convida um novo usuário: cria o User com senha temporária (exibida uma única vez na resposta: não há envio de email neste ambiente). Só Owner pode convidar outro Owner. Respeita o limite de assentos do plano (campo 1, fazenda 2, grupo 5): devolve `SEAT_LIMIT_REACHED` (422) quando o limite de usuários ativos já foi atingido.",
        request: `{ "name": "João Souza", "email": "joao@fazendaboavista.com.br", "phone": "22988887777", "role": "OPERADOR" }`,
        response: `201
{ "data": { "id": "cl...", "temp_password": "Xy9k2Qmz" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/users/:id/role",
        auth: "Sessão · usuarios:write",
        description: "Altera o papel de um usuário. Não é possível alterar o próprio papel, nem promover a Owner sem ser Owner.",
        request: `{ "role": "ADMIN" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/users/:id/active",
        auth: "Sessão · usuarios:write",
        description: "Ativa ou desativa um usuário (nunca deleta: preserva histórico de ações). Não é possível desativar a própria conta. Desativar sempre é permitido e libera um assento; reativar consome um assento e devolve `SEAT_LIMIT_REACHED` (422) se o plano já estiver no limite.",
        request: `{ "active": false }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Minha Fazenda: Propriedades e Pastos",
    note: "Módulo 29. \"Pasto\" (model Pasture) é a divisão da fazenda em áreas de pastagem; não confundir com Plot (\"Talhão\", domínio de Lavoura).",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/properties",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista propriedades. ?include_archived=true inclui as arquivadas (excluídas por padrão).",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sede", "address": "...", "city": "Montes Claros", "district": null, "area_hectares": 120.5, "archived_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/properties",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra propriedade. city e area_hectares (> 0) são obrigatórios; address e district são opcionais.",
        request: `{ "name": "Sede", "city": "Montes Claros", "district": "São João da Vereda", "address": "Rodovia BR-101, km 42", "area_hectares": 120.5 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Sede", "city": "Montes Claros", "district": "São João da Vereda", "area_hectares": 120.5, "archived_at": null } }`,
      },
      {
        method: "GET",
        path: "/api/v1/properties/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Detalhe da propriedade.",
        response: `200
{ "data": { "id": "cl...", "name": "Sede", "address": "...", "city": "Montes Claros", "district": null, "area_hectares": 120.5 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/properties/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Edita propriedade. Todos os campos opcionais.",
        request: `{ "name": "Sede Nova", "city": "Montes Claros" }`,
        response: `200
{ "data": { "id": "cl...", "name": "Sede Nova" } }`,
      },
      {
        method: "POST",
        path: "/api/v1/properties/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Arquiva a propriedade (não deleta, preserva histórico de animais/talhões/pastos). Idempotente.",
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-07-10T12:00:00.000Z" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/pastures",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista pastos ativos de uma fazenda. property_id é obrigatório. meta.area_summary traz a soma das áreas x tamanho total da fazenda.",
        response: `200
{ "data": [{ "id": "cl...", "property_id": "cl...", "name": "Pasto da Sede", "area_hectares": 25, "archived_at": null }], "meta": { "total": 1, "area_summary": { "total_area": 120.5, "distributed_area": 25, "remaining_area": 95.5, "over_allocated": false } } }`,
      },
      {
        method: "POST",
        path: "/api/v1/pastures",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra pasto. area_hectares (> 0) e property_id são obrigatórios. Não bloqueia se a soma dos pastos ultrapassar o tamanho da fazenda: meta.area_summary.over_allocated só avisa.",
        request: `{ "name": "Pasto da Sede", "area_hectares": 25, "property_id": "cl..." }`,
        response: `201
{ "data": { "id": "cl...", "property_id": "cl...", "name": "Pasto da Sede", "area_hectares": 25 }, "meta": { "area_summary": { "total_area": 120.5, "distributed_area": 25, "remaining_area": 95.5, "over_allocated": false } } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/pastures/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Edita nome/tamanho do pasto.",
        request: `{ "area_hectares": 30 }`,
        response: `200
{ "data": { "id": "cl...", "area_hectares": 30 }, "meta": { "area_summary": { "total_area": 120.5, "distributed_area": 30, "remaining_area": 90.5, "over_allocated": false } } }`,
      },
      {
        method: "POST",
        path: "/api/v1/pastures/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Desativa o pasto (não deleta). Idempotente.",
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-08-04T12:00:00.000Z" }, "meta": { "area_summary": { "total_area": 120.5, "distributed_area": 0, "remaining_area": 120.5, "over_allocated": false } } }`,
      },
    ],
  },
  {
    title: "Rebanho: Categorias e Lotes",
    note: "Desde 2026-08-04 existe UM modelo de rebanho (AnimalBatch): sempre categoria + quantidade, com brinco opcional para quem trabalha com brinco (lote de 1 cabeça). O modelo `Animal` e o campo `status` deixaram de existir. Cadastrar um lote não cria um registro por cabeça: guarda categoria, quantidade e peso médio.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/animal-categories",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista as categorias de rebanho do tenant. Cada tenant nasce com um conjunto padrão no seed e pode criar as próprias.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Bezerro", "active": true }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animal-categories",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cria uma categoria de rebanho.",
        request: `{ "name": "Novilha" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Novilha", "active": true }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/animal-categories/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Renomeia ou desativa uma categoria. Desativar não apaga: categoria usada por lotes existentes continua referenciada, só deixa de ser oferecida em cadastros novos.",
        request: `{ "name": "Novilha 12-24m", "active": false }`,
        response: `200
{ "data": { "id": "cl...", "name": "Novilha 12-24m", "active": false }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Negociações (Módulo 31)",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/contacts",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Lista os contatos de negociação (vendedor, comprador, frigorífico, leiloeira). Filtros opcionais: `q` (parte do nome) e `type`. Cadastro deliberadamente simples: o §5 do documento proíbe exigir CPF, CNPJ, endereço ou dados bancários nesta versão.",
        response: `200
{ "data": [{ "id": "cl...", "name": "João da Ponte", "type": "fazendeiro", "phone": null, "city": "Unaí" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/contacts",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Cadastra um contato. Só `name` é obrigatório: até o tipo é opcional, porque o §4 diz que o usuário não deve ser obrigado a classificar quem não souber classificar.",
        request: `{ "name": "Frigorífico Boa Carne", "type": "frigorifico", "city": "Paracatu" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Frigorífico Boa Carne", "type": "frigorifico" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/negotiations",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Lista as negociações, da mais recente para a mais antiga. Canceladas aparecem por padrão (o §17.10 exige histórico completo); use `include_canceled=false` para ocultar. Filtros: type, contact_id, property_id, since, until, limit (máx. 200), offset. Cada item já traz a SITUAÇÃO derivada e os totais do §15.",
        response: `200
{ "data": [{ "id": "cl...", "type": "venda_gado", "amount": 80000, "situacao": "paga", "totais": { "principal": 80000, "custos": 5500, "total": 85500, "liquido": 74500 } }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra um negócio. UMA rota para `compra_gado`, `venda_gado`, `compra_produto` e `venda_produto`, com o tipo no corpo: são a mesma operação com o sinal invertido, e só muda o filho que o negócio cria (`HerdMovement` ou `StockMovement`). Nos tipos de produto, `itens` traz `product_id` em vez de `category_id`, e a quantidade aceita casa decimal quando a unidade permite (saca sim, ferramenta não). Tudo numa transação só: se a venda não tiver saldo, NADA é gravado, nem o envelope. `pago: true` gera lançamento já quitado; `pago: false` com `parcelas` gera uma conta a pagar/receber por parcela, e a soma delas precisa bater exatamente com `amount` (§14), senão devolve 422 `PARCELAS_NAO_FECHAM`. `custos` (frete, comissão, taxa) viram lançamentos de DESPESA próprios, para aparecerem no DRE.",
        request: `{ "type": "compra_gado", "property_id": "cl...", "itens": [{ "category_id": "bezerro_0_7", "quantity": 20 }], "amount": 60000, "contact_id": "cl...", "pago": false, "parcelas": [{ "due_date": "2026-03-10T00:00:00.000Z", "amount": 60000 }] }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/negotiations/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Detalhe do negócio, com os movimentos de rebanho e os lançamentos financeiros que ele gerou. Não existe PATCH: o §17.9 pede recálculo ao editar, e a decisão do módulo é que editar é CANCELAR e refazer, porque uma edição de valor teria que desfazer filhos que já podem ter virado dinheiro pago.",
        response: `200
{ "data": { "id": "cl...", "situacao": "parcialmente_paga", "movimentos": [{ "movement_type": "compra", "quantity": 20 }], "lancamentos": [{ "amount": 30000, "status": "paid", "negotiation_role": "principal" }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Cancela a negociação: os movimentos de rebanho voltam e as contas EM ABERTO são canceladas. Não apaga nada, a linha continua no histórico. Devolve 422 `INSUFFICIENT_BALANCE` quando parte dos animais que entraram por esta negociação já saiu, dizendo quantos restam (§17.9). O que já foi PAGO segue o `dinheiro_pago`: `mantem` (padrão) deixa lançado, porque o dinheiro saiu de verdade; `devolvido` cria um lançamento de estorno com a data de hoje, sem apagar o original, para os dois meses fecharem certo; `engano` cancela o lançamento, porque aquele pagamento nunca existiu. `meta` traz `valor_recebido_mantido`, `valor_pago_mantido` e `valor_estornado`, separados porque numa venda o principal entrou e os custos sairam.",
        request: `{ "reason": "comprei errado", "dinheiro_pago": "devolvido" }`,
        response: `200
{ "data": { "id": "cl...", "situacao": "cancelada", "canceled_reason": "comprei errado" }, "meta": { "valor_recebido_mantido": 0, "valor_pago_mantido": 0, "valor_estornado": 60000 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations/events",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Abre a REMESSA para leilão, feira ou evento (§8). NÃO gera lançamento financeiro nenhum, e o corpo nem aceita valor: o §17.8 diz que o envio de animais para um evento não pode virar venda antes da confirmação. As cabeças saem da quantidade física da fazenda e continuam no rebanho do produtor, na situação `evento`. Cria três coisas numa transação só: a negociação (tipo `evento`, sem valor), a estadia filha com os campos do §8.1, e a movimentação `envio_evento` apontando para as duas. Sem saldo, NADA é gravado: devolve 422 `INSUFFICIENT_BALANCE` no campo `quantity`, e nem a negociação nem o contato do organizador ficam para trás.",
        request: `{ "property_id": "cl...", "category_id": "femea_36_mais", "quantity": 20, "event_name": "Leilão de Outubro", "event_type": "leilão", "organizer_name": "Leiloeira Central", "expected_end_at": "2026-10-20T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "stay_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations/:id/close-event",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Encerra a remessa: quantos venderam, quantos voltaram e quantos seguiram para outro destino. A SOMA DOS TRÊS precisa ser igual ao que está na remessa, senão devolve 422 `DESTINOS_NAO_BATEM` no campo `quantity` e nada se move. O dinheiro só nasce AGORA: `amount` vira o valor da mesma negociação e o lançamento `principal` (com parcelas, quando houver, somando exatamente `amount`), e `custos` (comissão da leiloeira, taxa do evento, frete) viram lançamentos de DESPESA próprios. Venda sem valor é 422 `VENDA_SEM_VALOR` e valor sem venda é 422 `VALOR_SEM_VENDA`, os dois no campo `amount`. `outro_destino` fecha esta remessa e abre uma estadia NOVA do tipo escolhido, cujo id volta em `meta.nova_estadia_id`: nenhuma cabeça some, e nenhuma volta para a fazenda por engano.",
        request: `{ "vendidos": 12, "retornados": 8, "amount": 60000, "pago": true, "custos": [{ "descricao": "Comissão da leiloeira", "amount": 3000 }] }`,
        response: `200
{ "data": { "id": "cl...", "type": "evento", "amount": 60000, "situacao": "paga" }, "meta": { "nova_estadia_id": null, "encerrada": true } }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations/barters",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra uma PERMUTA (§12): o produtor entrega uma coisa e recebe outra, com ou sem diferença em dinheiro. UMA chamada atualiza rebanho, estoque, máquinas e financeiro, que é o §12.6 (\"o produtor não deverá precisar criar manualmente uma venda e depois uma compra\"). Cada lado tem um `kind`: `animais` (vira `permuta_saida`/`permuta_entrada` no livro-razão, nunca `venda`/`compra`), `produtos` (idem no estoque), `maquina` (no lado entregue é o `machine_id` de uma máquina que já existe, que passa a `negociada`; no recebido são os campos de cadastro, e a máquina nasce ligada à permuta e SEM custo de aquisição, porque o que ela custou foi o gado) e `descricao` (serviço ou outro, que não tem área no Tibé e fica como texto). O VALOR da negociação é a `diferenca`, e só ela: `paguei` gera despesa, `recebi` gera receita, com parcelas quando houver (a soma tem que dar o valor, §14). Recusas: 422 `PERMUTA_INCOMPLETA` quando falta um dos lados (§12.3 os torna obrigatórios), 422 `PERMUTA_VAZIA` quando nada se move e não há dinheiro, 422 `MAQUINA_INDISPONIVEL` quando a máquina entregue já saiu, e 422 `INSUFFICIENT_BALANCE` ou `INSUFFICIENT_STOCK` sem saldo. Em qualquer recusa NADA é gravado, nem o envelope nem o contato.",
        request: `{ "property_id": "cl...", "entregue": { "kind": "animais", "category_id": "macho_36_mais", "quantity": 20 }, "recebido": { "kind": "maquina", "name": "Trator John Deere 6110", "type": "Trator" }, "diferenca": { "direcao": "paguei", "amount": 30000 }, "pago": true }`,
        response: `201
{ "data": { "id": "cl...", "machine_id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Estoque de insumos (Módulo 31)",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/product-categories",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "As categorias de produto do §9.1. Semeia as 15 do documento no primeiro acesso do tenant e devolve a lista; `meta.seeded` diz quantas nasceram agora. Semear na leitura, e não na migração, trata tenant novo e antigo igual sem tocar em dado de produção. Só cria quando NÃO existe nenhuma: não ressuscita a que o produtor arquivou de propósito.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sal mineral" }], "meta": { "seeded": 15 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/products",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "O catálogo com o SALDO de cada produto. O saldo nunca é coluna: é a soma das movimentações não canceladas, por produto e fazenda. `?property_id=` filtra o saldo, não o catálogo, então um produto sem movimentação naquela fazenda aparece com zero (e é isso que deixa lançar a primeira compra dele lá). `meta.units` traz as 11 unidades do §10.5, cada uma dizendo se aceita quantidade quebrada.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sal mineral 60 P", "unit": "saca", "saldo_total": 12.5, "minimum_stock": 10, "abaixo_do_minimo": false }], "meta": { "abaixo_do_minimo": 0 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/products",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Cadastra um produto (§9.1). `minimum_stock` nulo significa sem alerta para este produto. Nome duplicado devolve 409 `DUPLICATE_PRODUCT`: dois produtos com o mesmo nome dariam dois saldos para a mesma coisa, que é o que o estoque existe para evitar.",
        request: `{ "name": "Sal mineral 60 P", "category_id": "cl...", "unit": "saca", "minimum_stock": 10, "storage_location": "Galpão 1" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Sal mineral 60 P", "unit_label": "saca" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/stock/movements",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Histórico de movimentações (§10.2). Canceladas aparecem, com `canceled_at` preenchido: o histórico mostra o que aconteceu, inclusive o que foi desfeito, e quem ignora as canceladas é a soma do saldo. Cada item traz `delta`, o quanto aquele movimento mexeu no saldo COM sinal. Filtros: product_id, property_id, movement_type, since, until, limit (máx. 200), offset.",
        response: `200
{ "data": [{ "id": "cl...", "movement_type": "utilizacao", "quantity": 2, "delta": -2, "product_name": "Sal mineral 60 P" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/stock/movements",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra `utilizacao` (§10.3, saída sem dinheiro: aplicar vacina, dar sal ao gado), ou compra/venda avulsa quando o saldo entrou por fora. Compra e venda COM dinheiro entram por `/api/v1/negotiations`, que cria o lançamento financeiro junto. Saída acima do disponível devolve 422 `INSUFFICIENT_STOCK` com a mensagem literal do §10.7; a conferência e a escrita acontecem na mesma transação serializável, senão duas saídas simultâneas leriam o mesmo saldo e as duas passariam. Quantidade quebrada em unidade que não fraciona também é 422. `ajuste` NÃO entra aqui: tem rota própria.",
        request: `{ "product_id": "cl...", "property_id": "cl...", "movement_type": "utilizacao", "quantity": 2, "purpose": "sal para o lote do curral" }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/stock/adjust",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Ajuste de estoque (§10.6). O corpo traz `corrected_balance`, o que EXISTE de verdade, contado pelo produtor: quem calcula a diferença é o sistema, porque pedir a diferença a quem está com o produto na mão é onde nasce o erro de sinal. Guarda saldo anterior, saldo corrigido e motivo, para depois dar para saber o que o produtor via na tela quando decidiu corrigir. Saldo igual ao atual devolve 422 `NO_CHANGE` em vez de gravar um movimento de zero.",
        request: `{ "product_id": "cl...", "property_id": "cl...", "corrected_balance": 8, "reason": "contagem do galpão" }`,
        response: `201
{ "data": { "id": "cl...", "diferenca": -1 }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Rebanho: livro-razão (Módulo 30)",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/herd/positions",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Saldo do rebanho por posição, onde posição é `categoria x fazenda x pasto x situação x dono`. A quantidade é sempre a SOMA das movimentações não canceladas, nunca um campo gravado. Posição zerada não é devolvida. Filtros opcionais: category_id, property_id, pasture_id, situation, owner. O total do rebanho PRÓPRIO é a consulta com `?owner=proprio`, senão animais de terceiro entram na conta.",
        response: `200
{ "data": [{ "category_id": "femea_36_mais", "property_id": "cl...", "pasture_id": null, "situation": "presente", "owner": "proprio", "quantity": 45 }], "meta": { "total": 1, "total_quantity": 45 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/herd/movements",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Histórico obrigatório do rebanho, da movimentação mais recente para a mais antiga. Movimentações canceladas APARECEM por padrão, marcadas com `canceled_at`: o registro cancelado precisa continuar identificado no histórico. Use `include_canceled=false` para ver só o que conta no saldo. Filtros: category_id, property_id, pasture_id, movement_type, since, until, limit (máx. 200), offset.",
        response: `200
{ "data": [{ "id": "cl...", "movement_type": "venda", "quantity": 8, "from": { "category_id": "femea_25_36", "property_id": "cl...", "pasture_id": null, "situation": "presente", "owner": "proprio" }, "to": null, "value": 28000, "occurred_at": "2026-08-05T00:00:00.000Z", "canceled_at": null, "recorded_by": { "id": "cl...", "name": "Zé" } }], "meta": { "total": 12 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/herd/movements",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra uma movimentação. UMA rota para os 9 tipos (`saldo_inicial`, `nascimento`, `compra`, `venda`, `morte`, `transferencia_pasto`, `transferencia_fazenda`, `mudanca_categoria`, `ajuste`), porque mudança de categoria não é caso especial: é um movimento com categorias diferentes nas duas pontas. Entrada exige só `to`, saída só `from`, transferência os dois, ajuste exatamente um. Devolve 422 `INSUFFICIENT_BALANCE` quando a origem não tem saldo. `compra` e `venda` com `value` geram lançamento financeiro; `nascimento` e `morte` nunca.",
        request: `{ "movement_type": "compra", "quantity": 10, "to": { "category_id": "femea_25_36", "property_id": "cl...", "pasture_id": null, "situation": "presente", "owner": "proprio" }, "value": 30000 }`,
        response: `201
{ "data": { "id": "cl...", "movement_type": "compra", "quantity": 10, "financial_entry_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/herd/movements/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Cancela uma movimentação. Não apaga: marca a linha, que continua no histórico, e o saldo se recalcula sozinho. É POST em sub-rota (não DELETE) porque o recurso não é removido e a operação exige o motivo. Editar é cancelar e lançar de novo, por isso não existe PATCH. Devolve 422 `INSUFFICIENT_BALANCE` quando o cancelamento deixaria o destino negativo (comprou 10, vendeu 8, tentou cancelar a compra) e 422 `ALREADY_CANCELED` na segunda vez. O lançamento financeiro pendente é apagado; o pago ganha um estorno.",
        request: `{ "reason": "lançado errado" }`,
        response: `200
{ "data": { "id": "cl...", "canceled_at": "2026-08-05T12:00:00.000Z", "canceled_reason": "lançado errado" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/herd/stays",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Estadias temporárias do rebanho (fase 2): pasto de terceiros, boitel, evento, animais de terceiros na fazenda e desaparecimento. `saldo_aberto` e `aberta` são DERIVADOS das movimentações que apontam para a estadia, nunca gravados: a estadia está aberta enquanto sobrar cabeça nela. Filtros: property_id, type, abertas=true.",
        response: `200
{ "data": [{ "id": "cl...", "type": "pasto_terceiro", "counterparty_name": "Sítio do João", "started_at": "2026-08-27T00:00:00.000Z", "charge_type": "por_mes", "charge_value": 1200, "saldo_aberto": 20, "aberta": true, "canceled_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/herd/stays",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Abre uma estadia e grava a movimentação de envio no mesmo passo. UMA rota para os 5 tipos, porque os cinco fluxos são o mesmo ciclo com validação diferente. O animal continua no rebanho próprio e sai da quantidade física da fazenda, salvo `terceiro_na_fazenda`, que é entrada de animal alheio e nunca soma ao rebanho. Com `charge_value` informado nasce UM lançamento: despesa em `pasto_terceiro` e `boitel`, receita em `terceiro_na_fazenda`, com o valor exato que o produtor informou (`charge_type` é informação do acordo, não entra em cálculo). Devolve 422 `INSUFFICIENT_BALANCE` com `field: quantity` quando não há saldo, e nada fica gravado pela metade.",
        request: `{ "type": "pasto_terceiro", "property_id": "cl...", "category_id": "femea_36_mais", "quantity": 20, "counterparty_name": "Sítio do João", "charge_type": "por_mes", "charge_value": 1200 }`,
        response: `201
{ "data": { "id": "cl...", "type": "pasto_terceiro", "quantity": 20, "financial_entry_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/herd/stays/:id/close",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Encerra a estadia. A soma dos destinos precisa ser IGUAL ao que está na estadia, e o servidor devolve 422 `DESTINOS_NAO_BATEM` com `field: quantity` quando não bate. Os destinos vêm como lista por tipo de movimento (`retorno_estadia`, `venda`, `morte`, `perda_confirmada`, `saida_terceiro`), e cada tipo de estadia aceita só alguns: desaparecimento não aceita `venda`, e devolve 422 `ENCERRAMENTO_NAO_PERMITIDO`. `value` numa venda gera a receita dos vendidos.",
        request: `{ "destinos": [{ "movement_type": "venda", "quantity": 12, "value": 60000 }, { "movement_type": "retorno_estadia", "quantity": 8 }] }`,
        response: `200
{ "data": { "id": "cl...", "encerrada": true, "saldo_aberto": 0 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/herd/stays/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Cancela a estadia inteira: as cabeças voltam para onde estavam e o lançamento pendente é apagado (o pago ganha estorno). Não apaga nada: a estadia e as movimentações continuam no histórico, marcadas. Devolve 422 `ESTADIA_JA_ENCERRADA` quando já houve encerramento, porque desfazer o que já foi vendido é decisão do produtor, e 422 `ESTADIA_JA_CANCELADA` na segunda vez.",
        request: `{ "reason": "lançado errado" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Confinamento (Módulo 30, fase 3)",
    note: "Confinamento próprio e Boitel reusam a mesma estadia do rebanho (HerdStay), fase 2 do Módulo 30: não é um segundo modelo de \"onde o animal está\". ConfinementSite é só o cadastro do local; abrir uma estadia deriva o tipo (confinamento ou boitel) do tipo do site, então um site próprio nunca vira estadia boitel.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/confinement/sites",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista os confinamentos cadastrados (§5). Exclui arquivados por padrão; `?include_archived=true` inclui, `?type=proprio|boitel` filtra.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Confinamento Sede", "type": "proprio", "property_id": "cl...", "counterparty_name": null, "city": null, "capacity": 500, "notes": null, "archived": false, "archived_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/confinement/sites",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra um confinamento (§5). `type: proprio` exige `property_id` de uma fazenda não arquivada; `type: boitel` exige `counterparty_name` (empresa ou proprietário). `capacity`, `city` e `notes` são opcionais.",
        request: `{ "name": "Confinamento Sede", "type": "proprio", "property_id": "cl...", "capacity": 500 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Confinamento Sede", "type": "proprio", "property_id": "cl...", "archived": false }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/confinement/sites/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Arquiva o confinamento (não deleta, mesmo padrão de Property/Pasture). Idempotente: re-arquivar mantém o archived_at original.",
        response: `200
{ "data": { "id": "cl...", "archived": true, "archived_at": "2026-08-31T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/confinement/stays",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lotes de confinamento e Boitel (§9, §25 \"lotes ativos\"), com dias confinados e saldo aberto derivados, nunca gravados. Filtros: confinement_site_id, type (confinamento|boitel), abertas=true.",
        response: `200
{ "data": [{ "id": "cl...", "type": "confinamento", "confinement_site_id": "cl...", "property_id": "cl...", "started_at": "2026-08-21T00:00:00.000Z", "days_confined": 10, "quantity": 37, "aberta": true, "canceled_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/confinement/stays",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Abre uma estadia de confinamento (§6, §7), reusando `openStay` (fase 2). O `type` da estadia (confinamento ou boitel) é DERIVADO de `confinement_site_id`, não escolhido no corpo. Entrada não altera o total do rebanho (§27.1); os animais só saem da localização anterior. `charge_type`/`charge_value` gravam a cobrança informada, sem multiplicar por cabeça ou por dia.",
        request: `{ "confinement_site_id": "cl...", "category_id": "macho_25_36", "quantity": 37, "pasture_id": "cl...", "charge_type": "fechado", "charge_value": 4500 }`,
        response: `201
{ "data": { "id": "cl...", "type": "confinamento", "quantity": 37 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/confinement/stays/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Resumo do lote (§8, §13, §14, §24): dias confinados, saldo atual, alimentação por produto (StockMovement com este stay_id) e custo financeiro acumulado (soma simples de FinancialEntry ligados, nunca estimativa).",
        response: `200
{ "data": { "id": "cl...", "type": "confinamento", "days_confined": 10, "quantity": 37, "aberta": true, "charge_type": "fechado", "charge_value": 4500, "feeding": [{ "product_id": "cl...", "product_name": "Ração", "unit": "kg", "quantity": 180 }], "financial_cost": 4500 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/confinement/stays/:id/feeding",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra alimentação (§10, §11, §12): cria um StockMovement de `utilizacao` vinculado à estadia, e o saldo do produto cai. `product_id` é OBRIGATÓRIO: sem ele a rota devolve 422 `PRODUCT_REQUIRED` no campo `product_id`, em vez de aceitar em silêncio sem gravar nada.",
        request: `{ "product_id": "cl...", "quantity": 180, "notes": "trato da manhã" }`,
        response: `201
{ "data": { "stay_id": "cl...", "registered_in_stock": true, "stock_movement_id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Leite (Módulo 32, fase 1)",
    note: "Dois contadores, e nenhum dos dois é gravado: as vacas em lactação são o dobramento dos registros de lactação (a partir do último `definir`), e os litros de um período são a soma dos registros de produção. A área NÃO escreve no livro-razão do rebanho: \"em lactação\" é uma condição, não uma categoria, e entrar ou sair da lactação não altera o total do rebanho. Fases 2 (tanque, ponto de coleta, leite de terceiros) e 3 (venda, comprador, fechamento) ainda não existem.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/milk/groups",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista os lotes leiteiros (§6): agrupamento organizacional (\"vacas em maior produção\", \"recém-paridas\"), que NÃO conta cabeça e não aparece em soma nenhuma do Rebanho. Exclui arquivados por padrão; `?include_archived=true` inclui, `?property_id=` filtra.",
        response: `200
{ "data": [{ "id": "cl...", "property_id": "cl...", "name": "Recém-paridas", "notes": null, "archived": false, "archived_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/groups",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra um lote leiteiro (§6). Devolve 422 `DUPLICATE_GROUP` quando já existe lote ativo com o mesmo nome na fazenda: dois \"Recém-paridas\" na lista tornariam a escolha um chute.",
        request: `{ "property_id": "cl...", "name": "Recém-paridas" }`,
        response: `201
{ "data": { "id": "cl...", "property_id": "cl...", "name": "Recém-paridas", "archived": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/milk/groups/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Arquiva ou desarquiva o lote. Aceita `{ \"archived\": false }` para desarquivar, diferente do confinamento: o lote leiteiro muda de estação, e cadastrar de novo perderia o histórico que aponta para o antigo.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived": true, "archived_at": "2026-09-02T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/lactation",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico dos registros de lactação (§4, §7), do mais novo para o mais velho. Filtros: `property_id`, `group_id`, `de`, `ate` (AAAA-MM-DD), `limit`. A contagem vigente vem em `meta.vacas_em_lactacao`, e não como recurso próprio, porque ela é o dobramento das linhas listadas, não uma linha guardada. Sem `property_id` ela vem `null`: a contagem só existe por fazenda.",
        response: `200
{ "data": [{ "id": "cl...", "property_id": "cl...", "type": "entrada", "quantity": 4, "recorded_at": "2026-09-02T12:00:00.000Z", "pasture_id": null, "group_id": null, "notes": null, "cancelled": false, "cancelled_at": null }], "meta": { "total": 1, "vacas_em_lactacao": 36 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/lactation",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra lactação: `definir` fixa o valor absoluto (\"estou com 32 vacas dando leite\"), `entrada` soma (\"entraram mais 4\"), `saida` subtrai (\"sequei 3\"). Uma `saida` maior que a contagem devolve 422 `SALDO_INSUFICIENTE` no campo `quantity`, e a conferência vale para a data do registro E para todas as seguintes: saída retroativa que deixa o presente negativo é o mesmo erro, só mais difícil de ver. `quantity: 0` só é aceito em `definir`, que é a afirmação legítima \"não tenho mais nenhuma\".",
        request: `{ "property_id": "cl...", "type": "entrada", "quantity": 4, "recorded_at": "2026-09-02" }`,
        response: `201
{ "data": { "id": "cl...", "type": "entrada", "quantity": 4 }, "meta": { "vacas_em_lactacao": 36 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/lactation/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cancela um registro de lactação: ele sai do dobramento e FICA na lista, marcado (§37.11). Devolve 422 `JA_CANCELADO` na segunda vez.",
        response: `200
{ "data": { "id": "cl...", "cancelled": true }, "meta": { "vacas_em_lactacao": 32 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/production",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista registros de produção (§8, §11). Filtros: `property_id`, `group_id`, `de`, `ate` (AAAA-MM-DD), `limit`. `meta.total_litros` soma só os não cancelados.",
        response: `200
{ "data": [{ "id": "cl...", "property_id": "cl...", "liters": 300, "shift": "manha", "recorded_at": "2026-09-02T12:00:00.000Z", "group_id": null, "notes": null, "cancelled": false, "cancelled_at": null }], "meta": { "total": 1, "total_litros": 300 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/production",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra produção (§8, §9). Duas formas alternativas: `dia` (o dia inteiro num número só) OU `manha`/`tarde`/`noite`. Mandar as duas devolve 422 `FORMAS_MISTURADAS`, porque o §9 as apresenta como alternativas e somá-las faria 500 mais 300 virar 800 em silêncio. Devolve SEMPRE uma lista: cada turno é uma linha, e o total do dia é a soma delas, nunca um campo. `vacas_em_lactacao` é o atalho do §8: não vira campo do registro, e sim um `definir` de lactação na mesma data, na mesma transação.",
        request: `{ "property_id": "cl...", "manha": 300, "tarde": 180, "recorded_at": "2026-09-02", "vacas_em_lactacao": 32 }`,
        response: `201
{ "data": [{ "id": "cl...", "liters": 300, "shift": "manha" }, { "id": "cl...", "liters": 180, "shift": "tarde" }], "meta": { "total_litros": 480 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/production/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cancela um registro de produção: sai das somas e continua na lista, marcado (§37.11). Devolve 422 `JA_CANCELADO` na segunda vez.",
        response: `200
{ "data": { "id": "cl...", "cancelled": true }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/summary",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "O painel do §34 e as seis janelas do §11 (hoje, ontem, últimos 7 dias, este mês, mês anterior, ano). `property_id` é obrigatório: a contagem de vacas e a média por vaca só existem por fazenda, e sem ele devolve 422 `FAZENDA_OBRIGATORIA`. `media_por_vaca` é litros por vaca/dia, com os dias sem contagem conhecida fora dos DOIS lados da divisão, e vem `null` quando nenhum dia da janela tem contagem: zero afirmaria uma produtividade que ninguém mediu. \"Semana\" são sete dias corridos, e as janelas em curso terminam hoje, não no fim do mês.",
        response: `200
{ "data": { "property_id": "cl...", "hoje": { "dia": "2026-09-02", "vacas_em_lactacao": 32, "litros": 480, "media_por_vaca": 15 }, "periodos": [{ "chave": "hoje", "rotulo": "Hoje", "de": "2026-09-02", "ate": "2026-09-02", "litros": 480, "dias": 1, "media_diaria": 480, "media_por_vaca": 15, "dias_com_contagem": 1 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/sites",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Tanques próprios e pontos de coleta de terceiros (§13 e §16). `liters` é o volume FÍSICO de cada local, ou seja, a soma de TODOS os donos (§20): é o número que responde \"cabe mais leite?\", e por isso ignora de quem é o leite. `acima_da_capacidade` avisa quando o físico passou da capacidade informada, que NÃO é limite: o §13 a chama de informação, e recusar por causa dela inventaria uma regra. Filtros: `type=proprio|terceiro`, `include_archived=true`.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Tanque Principal", "type": "proprio", "property_id": "cl...", "counterparty_name": null, "capacity": 2000, "liters": 950, "acima_da_capacidade": false, "archived": false }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/sites",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra tanque ou ponto de coleta (§13, §16). `type: proprio` exige `property_id` de fazenda não arquivada; `type: terceiro` exige `counterparty_name` (de quem é o ponto). `capacity`, `city` e `notes` são opcionais.",
        request: `{ "name": "Tanque Principal", "type": "proprio", "property_id": "cl...", "capacity": 2000 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Tanque Principal", "type": "proprio", "liters": 0, "archived": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/milk/sites/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Arquiva ou desarquiva o local. NÃO exige saldo zero: tanque desativado com leite dentro é situação real, e recusar obrigaria a inventar uma retirada. O arquivamento tira o local dos destinos novos; o saldo continua aparecendo até a baixa de verdade.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived": true, "archived_at": "2026-09-02T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/storage",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "O painel de armazenamento do §34: `posicoes` é o saldo por `local x dono` (o §20 na íntegra: dono `null` é o leite próprio), `resumo` traz próprio em tanque, próprio em ponto de coleta, de terceiros e o físico total, e `movimentos` são as últimas linhas do livro-razão. Filtros: `site_id`, `limit`. Posição com saldo zero NÃO aparece: oferecer um dono sem leite seria convidar a um lançamento que a rota recusa.",
        response: `200
{ "data": { "posicoes": [{ "site_id": "cl...", "owner_id": null, "liters": 400 }, { "site_id": "cl...", "owner_id": "cl...", "liters": 300 }], "resumo": { "proprio_em_tanque": 400, "proprio_em_ponto_de_coleta": 600, "de_terceiros": 550, "fisico_total": 1550 }, "movimentos": [] }, "meta": { "total_posicoes": 2 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/storage",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "As quatro conversas do §14 ao §21, escolhidas pelo campo `gesto`, com união discriminada (cada gesto tem seus obrigatórios). `armazenar` (§14): a produção entra num tanque PRÓPRIO, e não é venda (§37.5). `transferir` (§16): leite nosso sai do tanque para um ponto de coleta de TERCEIROS e continua nosso; **não gera receita** (§17 literal). `receber` (§19): leite de um `owner_id` entra no nosso tanque, aumenta o volume físico e NÃO aumenta a produção própria. `retirar` (§15 e §21): a composição por dono é INFORMADA, nunca rateada, e grava uma linha por dono, tudo ou nada. Origem sem saldo devolve 422 `SALDO_INSUFICIENTE` no campo `liters`; dono repetido na retirada devolve 422 `DONO_REPETIDO`. ⚠️ `destination: \"venda\"` NÃO gera dinheiro nesta fase: o §37.8 é cumprido na fase 3, quando a venda existir como negócio.",
        request: `{ "gesto": "armazenar", "site_id": "cl...", "liters": 480 }

// entrega em ponto de coleta (§16)
{ "gesto": "transferir", "from_site_id": "cl...", "to_site_id": "cl...", "liters": 600 }

// leite de terceiro (§19)
{ "gesto": "receber", "site_id": "cl...", "owner_id": "cl...", "liters": 300 }

// retirada com composição (§21)
{ "gesto": "retirar", "site_id": "cl...", "destination": "laticinio", "itens": [{ "owner_id": null, "liters": 400 }, { "owner_id": "cl...", "liters": 300 }] }`,
        response: `201
{ "data": { "id": "cl...", "movement_type": "entrada_producao", "liters": 480 }, "meta": {} }

// a retirada devolve uma LISTA, uma linha por dono
{ "data": [{ "id": "cl...", "liters": 400 }, { "id": "cl...", "liters": 300 }], "meta": { "total_litros": 700 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/storage/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cancela uma movimentação: sai dos saldos e fica no histórico, marcada (§37.11). Cancelar uma ENTRADA pode deixar saldo negativo quando o leite já saiu, e isso é aceito: recusar prenderia o produtor a um registro errado. ⚠️ A retirada do §21 grava uma linha POR DONO, então cancelar uma desfaz a baixa daquele dono, não a retirada inteira.",
        response: `200
{ "data": { "id": "cl...", "canceled": true }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/charges",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "As cobranças por funcionar como ponto de coleta (§22). Filtros: `owner_id`, `limit`. `meta.total_valor` soma só as não canceladas.",
        response: `200
{ "data": [{ "id": "cl...", "owner_id": "cl...", "type": "por_litro", "amount": 250, "period_label": "agosto/2026", "financial_entry_id": "cl...", "canceled": false }], "meta": { "total": 1, "total_valor": 250 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/charges",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra a receita do §22, com uma das seis formas de cobrança. O valor é o que o produtor DIGITOU, nunca calculado, mesmo em `por_litro`: o §22 dá o exemplo de R$ 0,05 sobre 5.000 litros mas não diz sobre qual PERÍODO somar, e isso só aparece no §28 (fase 3). Alimenta o Financeiro por `createLinkedEntry` com `related_module: \"leite\"`, e nasce PAGA: o §22 fala de cobrar pelo serviço prestado, não de faturar a prazo.",
        request: `{ "owner_id": "cl...", "type": "por_litro", "amount": 250, "period_label": "agosto/2026" }`,
        response: `201
{ "data": { "id": "cl...", "amount": 250, "financial_entry_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/charges/:id/cancel",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cancela a cobrança E o lançamento financeiro que ela gerou, os dois juntos. Foi exatamente aqui que o confinamento errou em 31/08, deixando a conta viva depois do cancelamento. O lançamento vira `cancelled` em vez de ser apagado, porque o DRE do mês em que ele existiu precisa continuar contando a história como ela aconteceu.",
        response: `200
{ "data": { "id": "cl...", "canceled": true, "financial_entry_id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Rebanho: Animais",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/animals",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista o rebanho. Filtros: property_id, category_id, breed, q (busca por brinco). O filtro `status` deixou de existir com o modelo único (2026-08-04): `quantity` diz o que resta, e a pergunta real passou a ser por categoria.",
        response: `200
{ "data": [{ "id": "cl...", "category_id": "cl...", "category_name": "Bezerro", "quantity": 20, "ear_tag": null, "breed": "Nelore", "sex": null, "average_weight": 180.5, "property_name": "Sede", "last_vaccination_at": "2026-05-01T00:00:00.000Z" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra rebanho. `category_id`, `property_id` e `quantity` são obrigatórios; `ear_tag` é OPCIONAL, só para quem trabalha com brinco. Brinco identifica UMA cabeça: enviar `ear_tag` com `quantity` diferente de 1 devolve 422 (EAR_TAG_REQUIRES_SINGLE). O brinco é único por tenant apenas quando preenchido (índice parcial): duplicar devolve 409.",
        request: `{ "category_id": "cl...", "property_id": "cl...", "quantity": 20, "breed": "Nelore", "initial_weight": 180.5 }

// com brinco (uma cabeça identificada)
{ "category_id": "cl...", "property_id": "cl...", "quantity": 1, "ear_tag": "1234", "breed": "Nelore", "sex": "male" }`,
        response: `201
{ "data": { "id": "cl...", "category_id": "cl...", "quantity": 20, "ear_tag": null, "average_weight": 180.5 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Detalhe do animal.",
        response: `200
{ "data": { "id": "cl...", "ear_tag": "1234", "quantity": 1, "breed": "Nelore", "property_name": "Sede", "average_weight": 380.5 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/animals/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Edita dados cadastrais. Valida nova propriedade e unicidade de brinco, se alterados.",
        request: `{ "breed": "Nelore PO" }`,
        response: `200
{ "data": { "id": "cl...", "breed": "Nelore PO" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/weight-logs",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de pesagens, ordenado por data, com GMD (ganho médio diário) calculado.",
        response: `200
{ "data": [{ "id": "cl...", "weight": 380.5, "measured_at": "..." }], "meta": { "gmd": 0.62, "current_weight": 380.5 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/weight-logs",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra pesagem. Atualiza current_weight do animal e recalcula o GMD.",
        request: `{ "weight": 380.5, "measured_at": "2026-07-01T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "weight": 380.5 }, "meta": { "current_weight": 380.5, "gmd": 0.62 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/vaccinations",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de vacinação do animal.",
        response: `200
{ "data": [{ "id": "cl...", "vaccine_name": "Aftosa", "applied_at": "...", "next_due_at": "..." }], "meta": { "count": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/vaccinations",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra aplicação. next_due_at = applied_at + intervalo (da vacina ou customizado). cost, se informado, gera FinancialEntry de despesa.",
        request: `{ "vaccine_id": "cl...", "applied_at": "2026-07-01T00:00:00.000Z", "cost": 12.5 }`,
        response: `201
{ "data": { "id": "cl...", "applied_at": "...", "next_due_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/movements",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de movimentações do animal.",
        response: `200
{ "data": [{ "id": "cl...", "movement_type": "sale", "value": 4500, "occurred_at": "..." }], "meta": { "count": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/movements",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra compra, venda, transferência ou morte. Venda/morte atualizam status; transferência atualiza property_id; value gera FinancialEntry (receita na venda, despesa na compra).",
        request: `{ "movement_type": "sale", "value": 4500, "occurred_at": "2026-07-05T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "movement_type": "sale", "value": 4500 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/cost-summary",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Soma as despesas (FinancialEntry) vinculadas ao animal e calcula o custo médio mensal desde a entrada na propriedade (data de compra, ou cadastro se não houver).",
        response: `200
{ "data": { "animal_id": "cl...", "total_cost": 245.0, "monthly_avg_cost": 40.83, "since": "...", "months": 6.0 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/vaccines",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Catálogo de vacinas do tenant.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Aftosa", "default_interval_days": 180 }], "meta": { "total": 4 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/vaccines",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cria vacina personalizada no catálogo do tenant.",
        request: `{ "name": "Raiva bovina", "default_interval_days": 365 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Raiva bovina", "default_interval_days": 365 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/vaccinations/upcoming",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Vacinações vencendo nos próximos 15 dias. Alimenta o card do dashboard e o job de alertas.",
        response: `200
{ "data": [{ "animal_id": "cl...", "ear_tag": "1234", "vaccine_name": "Aftosa", "next_due_at": "...", "days_remaining": 6 }] }`,
      },
    ],
  },
  {
    title: "Máquinas e equipamentos",
    note: "Módulo 26. Sem exclusão: mudar status é o único jeito de \"remover\" uma máquina da operação ativa.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/machines",
        auth: "Sessão · maquinas:read · perfil fazenda",
        description: "Lista as máquinas do tenant.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Trator 1", "type": "trator", "status": "active", "next_maintenance_at": null, "...": "..." }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/machines",
        auth: "Sessão · maquinas:write · perfil fazenda",
        description: "Cadastra uma máquina. Com `acquisition_cost`, gera despesa automática vinculada.",
        request: `{ "property_id": "cl...", "name": "Trator 1", "type": "trator", "brand": "Massey Ferguson", "acquisition_cost": 180000 }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/machines/:id",
        auth: "Sessão · maquinas:read · perfil fazenda",
        description: "Detalhe da máquina, incluindo o histórico de manutenções.",
        response: `200
{ "data": { "id": "cl...", "name": "Trator 1", "maintenances": [{ "id": "cl...", "description": "Troca de óleo", "...": "..." }], "...": "..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/machines/:id",
        auth: "Sessão · maquinas:write · perfil fazenda",
        description: "Edita dados cadastrais ou muda o status (active, maintenance, sold, inactive).",
        request: `{ "status": "maintenance" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/machines/:id/maintenances",
        auth: "Sessão · maquinas:write · perfil fazenda",
        description: "Registra uma manutenção. Com `cost`, gera despesa automática vinculada à manutenção (não à máquina). Com `next_due_at`, substitui a previsão anterior de `next_maintenance_at` e alimenta o alerta `maintenance_due` (janela de 15 dias).",
        request: `{ "description": "Troca de óleo e filtros", "cost": 450, "next_due_at": "2026-11-01T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Meu Dia (tarefas)",
    note: "Módulo 27. Tarefas são compartilhadas dentro do tenant (visíveis a todo mundo, não privadas por usuário). Concluir/cancelar só pelo painel: o agente WhatsApp só cria.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/tasks",
        auth: "Sessão · tarefas:read",
        description: "Lista as tarefas do tenant. `effective_status` inclui \"overdue\" (calculado: pending + due_date no passado), nunca gravado.",
        response: `200
{ "data": [{ "id": "cl...", "title": "Comprar sal mineral", "due_date": "...", "remind": true, "status": "pending", "effective_status": "pending", "...": "..." }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/tasks",
        auth: "Sessão · tarefas:write",
        description: "Cria uma tarefa.",
        request: `{ "title": "Comprar sal mineral", "due_date": "2026-09-11T00:00:00.000Z", "remind": true }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/tasks/:id",
        auth: "Sessão · tarefas:write",
        description: "Conclui ou cancela uma tarefa.",
        request: `{ "status": "completed" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Lavoura: Talhões e ciclos",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/plots",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista talhões, com o ciclo ativo (se houver) embutido.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Talhão 1", "area_hectares": 40, "property_name": "Sede", "active_cycle": { "id": "cl...", "crop_name": "Soja", "status": "growing" } }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/plots",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Cadastra talhão. Rejeita propriedade arquivada.",
        request: `{ "name": "Talhão 1", "area_hectares": 40, "property_id": "cl..." }`,
        response: `201
{ "data": { "id": "cl...", "name": "Talhão 1", "area_hectares": 40 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/plots/:id",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Detalhe do talhão: ciclo ativo e histórico completo de ciclos.",
        response: `200
{ "data": { "id": "cl...", "name": "Talhão 1", "active_cycle": { "id": "cl...", "status": "growing" }, "cycles": [ { "id": "cl...", "status": "growing" } ] } }`,
      },
      {
        method: "GET",
        path: "/api/v1/plots/:id/cycles",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista os ciclos do talhão.",
        response: `200
{ "data": [{ "id": "cl...", "crop_name": "Soja", "status": "growing" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/plots/:id/cycles",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Inicia novo ciclo. Rejeita se o talhão já tem um ciclo planted/growing ativo.",
        request: `{ "crop_name": "Soja", "planted_at": "2026-09-01T00:00:00.000Z", "expected_harvest_at": "2027-01-15T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "crop_name": "Soja", "status": "planted" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/cycles/:id/harvest",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Registra colheita. Muda status para harvested.",
        request: `{ "harvested_at": "2027-01-20T00:00:00.000Z", "yield_amount": 2400, "yield_unit": "saca" }`,
        response: `200
{ "data": { "id": "cl...", "status": "harvested", "yield_amount": 2400, "yield_unit": "saca" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/cycles/:id/summary",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Custo total de insumos, custo por hectare, e produtividade por hectare (se já colhido).",
        response: `200
{ "data": { "total_input_cost": 3200, "area_hectares": 40, "cost_per_hectare": 80, "yield_amount": 2400, "productivity_per_hectare": 60 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/cycles/:id/inputs",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista insumos aplicados no ciclo.",
        response: `200
{ "data": [{ "id": "cl...", "input_type": "fertilizer", "name": "NPK 04-14-08", "cost": 1800 }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/cycles/:id/inputs",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Registra insumo aplicado. cost, se informado, gera FinancialEntry de despesa.",
        request: `{ "input_type": "fertilizer", "name": "NPK 04-14-08", "quantity": 800, "unit": "kg", "cost": 1800 }`,
        response: `201
{ "data": { "id": "cl...", "name": "NPK 04-14-08", "cost": 1800 } }`,
      },
    ],
  },
  {
    title: "Prestador de Serviço",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/service-clients",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Lista clientes. ?q= busca por nome ou telefone.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sítio Esperança", "phone": "22988884444" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-clients",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Cadastra cliente do prestador.",
        request: `{ "name": "Sítio Esperança", "document": "12345678900", "phone": "22988884444", "email": null, "notes": null }`,
        response: `201
{ "data": { "id": "cl...", "name": "Sítio Esperança" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-clients/:id/summary",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Total faturado (ordens invoiced), total pendente (completed não faturadas) e histórico. Usado também pelo agente WhatsApp (\"quanto o cliente X me deve\").",
        response: `200
{ "data": { "client_id": "cl...", "client_name": "Sítio Esperança", "total_invoiced": 1200, "total_pending": 300, "orders_count": 4, "last_order_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/services",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Catálogo de serviços do tenant.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Diária de trator", "pricing_type": "day", "unit_price": 450 }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/services",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Cadastra tipo de serviço.",
        request: `{ "name": "Diária de trator", "pricing_type": "day", "unit_price": 450 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Diária de trator", "unit_price": 450 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/services/:id",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Edita valor/nome/tipo. Não afeta ordens já registradas (o valor é gravado na ordem no momento da criação).",
        request: `{ "unit_price": 480 }`,
        response: `200
{ "data": { "id": "cl...", "unit_price": 480 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-orders",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Lista ordens. Filtros: status, service_client_id.",
        response: `200
{ "data": [{ "id": "cl...", "client_name": "Sítio Esperança", "service_name": "Diária de trator", "total_value": 450, "status": "completed" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-orders",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Registra ordem. total_value = quantity × unit_price do serviço. Status inicial: scheduled (data futura) ou completed (hoje/passado).",
        request: `{ "service_client_id": "cl...", "service_id": "cl...", "quantity": 1, "performed_at": "2026-07-08T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "total_value": 450, "status": "completed" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/service-orders/:id/status",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Transição sequencial estrita scheduled → completed → invoiced. Ao chegar em invoiced, gera FinancialEntry de receita (pending, due_date = performed_at).",
        request: `{ "status": "invoiced" }`,
        response: `200
{ "data": { "id": "cl...", "status": "invoiced" } }`,
      },
    ],
  },
  {
    title: "Financeiro",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/financial-entries",
        auth: "Sessão · financeiro:read",
        description: "Lista lançamentos. Filtros: start, end (sobre due_date), entry_type, category, related_module, status.",
        response: `200
{ "data": [{ "id": "cl...", "entry_type": "expense", "category": "Insumo (fertilizer) - NPK", "amount": 1800, "status": "pending" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/financial-entries",
        auth: "Sessão · financeiro:write",
        description: "Lançamento manual (related_module sempre \"geral\": lançamentos de outros módulos são criados automaticamente pelas próprias ações daquele módulo).",
        request: `{ "entry_type": "expense", "category": "Combustível", "amount": 350, "due_date": "2026-07-15T00:00:00.000Z", "notes": null }`,
        response: `201
{ "data": { "id": "cl...", "entry_type": "expense", "amount": 350, "status": "pending" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id",
        auth: "Sessão · financeiro:write",
        description: "Edita lançamento manual.",
        request: `{ "amount": 380 }`,
        response: `200
{ "data": { "id": "cl...", "amount": 380 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id/pay",
        auth: "Sessão · financeiro:write",
        description: "Marca como pago, registrando paid_at (default: agora).",
        request: `{ "paid_at": "2026-07-10T00:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl...", "status": "paid", "paid_at": "..." } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id/postpone",
        auth: "Sessão · financeiro:write",
        description: "Adia o vencimento (Módulo 28). Só para lançamento pending; sem restrição de origem (related_module).",
        request: `{ "due_date": "2026-08-20T00:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl...", "due_date": "..." } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id/cancel",
        auth: "Sessão · financeiro:write",
        description: "Cancela um lançamento (Módulo 28). Sem restrição de origem nem de status atual; só muda status para \"cancelled\", não apaga.",
        response: `200
{ "data": { "id": "cl...", "status": "cancelled" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial-categories",
        auth: "Sessão · financeiro:read",
        description: "Lista categorias de receita/despesa do tenant (Módulo 28). Filtro opcional: entry_type.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Ração", "entry_type": "expense", "active": true }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/financial-categories",
        auth: "Sessão · financeiro:write",
        description: "Cria uma categoria.",
        request: `{ "name": "Frete", "entry_type": "expense" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Frete", "entry_type": "expense", "active": true }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-categories/:id",
        auth: "Sessão · financeiro:write",
        description: "Renomeia ou ativa/desativa uma categoria.",
        request: `{ "active": false }`,
        response: `200
{ "data": { "id": "cl...", "name": "Frete", "active": false }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/alert-preferences",
        auth: "Sessão · alertas:read",
        description: "Lista os 7 tipos de alerta com seu estado atual (Módulo 28). Ausência de preferência gravada = habilitado.",
        response: `200
{ "data": [{ "alert_type": "harvest_near", "enabled": true }], "meta": { "total": 7 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/alert-preferences",
        auth: "Sessão · alertas:write",
        description: "Liga/desliga um tipo de alerta pro tenant inteiro. Nunca mexe em canal (push/WhatsApp/email): isso continua sendo decisão do notify() (Onda 2).",
        request: `{ "alert_type": "harvest_near", "enabled": false }`,
        response: `200
{ "data": { "alert_type": "harvest_near", "enabled": false }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/cash-flow",
        auth: "Sessão · financeiro:read",
        description: "Saldo por período (regime de caixa), agrupado por dia ou mês. Query: start, end, group_by=day|month, related_module.",
        response: `200
{ "data": [{ "period": "2026-06", "income": 8000, "expense": 5200, "balance": 2800 }], "meta": { "group_by": "month" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/dre",
        auth: "Sessão · financeiro:read",
        description: "Receita e despesa agrupadas por módulo, com resultado por módulo e total geral. Query: start, end.",
        response: `200
{ "data": { "period": { "start": "2026-06-01", "end": "2026-06-30" }, "by_module": [{ "module": "rebanho", "total_income": 4500, "total_expense": 245, "result": 4255 }], "total_result": 4255 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/upcoming",
        auth: "Sessão · financeiro:read",
        description: "Lançamentos pending com due_date nos próximos 7 dias.",
        response: `200
{ "data": [{ "id": "cl...", "entry_type": "expense", "category": "Combustível", "amount": 350, "due_date": "...", "related_module": "geral" }] }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report/link",
        auth: "Sessão · financeiro:read",
        description: "Gera um link assinado (HMAC, válido por 1h) para o PDF do relatório financeiro do período. Usado pelo botão \"Exportar relatório\".",
        response: `200
{ "data": { "report_url": "https://.../api/v1/financial/report?token=...", "expires_in_seconds": 3600 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report",
        auth: "Público: autorização pelo token assinado, não por sessão (o link pode ser aberto fora do navegador logado, ex: WhatsApp)",
        description: "Gera o PDF sob demanda a partir do token e transmite direto na resposta (Content-Type: application/pdf). Não há armazenamento: o arquivo não fica salvo em nenhum lugar.",
        response: `200: corpo binário (application/pdf), Content-Disposition: attachment
401 se o token for inválido ou tiver expirado`,
      },
    ],
  },
  {
    title: "Alertas",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/alerts",
        auth: "Sessão · alertas:read",
        description: "Lista alertas. Filtros: type, status.",
        response: `200
{ "data": [{ "id": "cl...", "alert_type": "vaccine_due", "message": "🐄 Atenção: a vacina de aftosa do animal 1234 vence em 3 dias", "status": "pending" }], "meta": { "total": 1 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/alerts/:id/dismiss",
        auth: "Sessão · alertas:write",
        description: "Marca um alerta como resolvido manualmente.",
        response: `200
{ "data": { "id": "cl...", "status": "dismissed" } }`,
      },
    ],
  },
  {
    title: "Notificações (push web)",
    note: "Push é por INSCRIÇÃO, não por usuário: todo aparelho inscrito no tenant recebe. Por isso a inscrição guarda o endpoint do navegador, e não só o id de quem clicou.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/notifications/public-key",
        auth: "Sessão",
        description: "Devolve a chave pública VAPID que o navegador precisa para criar a inscrição. Responde 503 quando o push não está configurado no ambiente (VAPID ausente).",
        response: `200
{ "data": { "vapid_public_key": "BEl62i..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/notifications/subscribe",
        auth: "Sessão",
        description: "Registra o aparelho para receber push. Idempotente por endpoint: reinscrever o mesmo navegador atualiza a inscrição existente em vez de duplicar.",
        request: `{ "endpoint": "https://fcm.googleapis.com/fcm/send/...", "keys": { "p256dh": "...", "auth": "..." } }`,
        response: `201
{ "data": { "subscribed": true }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/notifications/subscribe",
        auth: "Sessão",
        description: "Cancela a inscrição daquele endpoint (o usuário desliga a notificação no aparelho).",
        request: `{ "endpoint": "https://fcm.googleapis.com/fcm/send/..." }`,
        response: `200
{ "data": { "unsubscribed": true }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Preferências do tenant",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/tenant/active-property",
        auth: "Sessão · rebanho:read",
        description:
          "Define a propriedade ativa do seletor do topo, que filtra o painel inteiro. Guardada em cookie, não no banco: qual propriedade estou olhando agora é preferência de sessão, não dado de negócio. `property_id: null` limpa o filtro (volta para \"todas\").",
        request: `{ "property_id": "cl..." }`,
        response: `200
{ "data": { "property_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/tenant/plan",
        auth: "Sessão (sem guard de propósito)",
        description:
          "Confirma o plano escolhido em /escolher-plano, marcando `plan_confirmed`. Não passa por guard() de propósito: o guard exige plano confirmado, então quem ainda não confirmou nunca conseguiria confirmar (deadlock).",
        request: `{ "plan": "fazenda" }`,
        response: `200
{ "data": { "plan": "fazenda" }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Cobrança (Asaas)",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/billing/subscription",
        auth: "Sessão · assinatura:read (acessível mesmo com a conta bloqueada)",
        description: "Plano e status atuais: de Subscription se existir, senão inferido do Tenant (trial).",
        response: `200
{ "data": { "plan": "fazenda", "status": "active", "next_due_date": "2026-08-10T00:00:00.000Z", "trial_ends_at": null } }`,
      },
      {
        method: "POST",
        path: "/api/v1/billing/subscribe",
        auth: "Sessão · assinatura:write, só OWNER (acessível mesmo com a conta bloqueada: é como o tenant regulariza)",
        description: "Cria ou troca a assinatura no Asaas. PIX e boleto retornam os dados para pagamento direto no painel; cartão de crédito retorna uma URL de redirecionamento para o checkout hospedado do Asaas (dados de cartão nunca tocam o backend do Tibé).",
        request: `{ "plan": "fazenda", "billing_type": "PIX" }`,
        response: `201 (PIX)
{ "data": { "method": "pix", "subscriptionId": "sub_...", "payload": "00020126...", "encodedImage": "data:image/png;base64,...", "expirationDate": "..." } }

201 (cartão)
{ "data": { "method": "redirect", "subscriptionId": "sub_...", "redirectUrl": "https://sandbox.asaas.com/checkoutSession/..." } }`,
      },
      {
        method: "POST",
        path: "/api/v1/billing/cancel",
        auth: "Sessão · assinatura:write, só OWNER (acessível mesmo com a conta bloqueada, pelo mesmo motivo de /subscribe)",
        description:
          "Cancela a assinatura no Asaas, marca `canceled` e grava `canceled_at`, registrando a transição em SubscriptionStatusLog. O acesso NÃO é bloqueado na hora: segue total até o fim do período pago (next_due_date), depois vira leitura por 60 dias, e só então bloqueia (getCancellationWindow em billing-access.ts). Quem cancela já vencido não tem período pago a honrar, e a janela de 60 dias começa no próprio cancelamento. Devolve 404 quando não há assinatura no Asaas para cancelar.",
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/webhooks/asaas",
        auth: "Header asaas-access-token (comparado contra ASAAS_WEBHOOK_TOKEN, cadastrado no painel do Asaas)",
        description: "Recebe eventos de pagamento. PAYMENT_CONFIRMED → Subscription ativa + next_due_date atualizado. PAYMENT_OVERDUE → status overdue. PAYMENT_DELETED → status canceled. Outros eventos são reconhecidos (200) sem processamento.",
        request: `{ "event": "PAYMENT_CONFIRMED", "payment": { "subscription": "sub_...", "customer": "cus_...", "value": 197.00, "status": "CONFIRMED" } }`,
        response: `200
{ "data": { "received": true, "processed": true } }`,
      },
    ],
  },
  {
    title: "Agente WhatsApp (rotas internas)",
    note: "Chamadas pelo N8N, não pelo navegador: autenticadas por header x-internal-secret (INTERNAL_API_SECRET), não por sessão de usuário.",
    endpoints: [
      {
        method: "POST",
        path: "/api/internal/whatsapp/resolve-contact",
        auth: "Header x-internal-secret",
        description: "Identifica tenant e usuário a partir do telefone de origem. Único endpoint que legitimamente faz lookup cross-tenant (ainda não se sabe o tenant). Cria o WhatsAppContact no primeiro contato.",
        request: `{ "phone": "5522999990000" }`,
        response: `200 (identificado)
{ "data": { "identified": true, "tenant_id": "cl...", "user_id": "cl...", "user_name": "Maria", "role": "OWNER", "active_profiles": ["fazenda"] }, "meta": { "first_contact": false, "suggested_reply": null, "recent_history": [] } }

200 (não identificado)
{ "data": { "identified": false } }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/execute-action",
        auth: "Header x-internal-secret",
        description: "Executa a intenção já classificada pelo LLM, roteando para as mesmas lib/actions/* usadas pelo painel web. Loga a interação em AgentConversationLog.",
        request: `{ "tenant_id": "cl...", "user_id": "cl...", "intent": "registrar_peso", "parameters": { "ear_tag": "1234", "weight": 382 }, "message_text": "o boi 1234 pesou 382" }`,
        response: `200
{ "data": { "reply_text": "Peso de 382 kg registrado para o animal 1234. GMD: 0.65 kg/dia.", "requires_confirmation": false, "auxiliary_data": {}, "report_url": null } }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/send-message",
        auth: "Header x-internal-secret",
        description:
          "Envia uma mensagem WhatsApp pelo provider ativo (Evolution ou Meta Cloud API, configurado no painel da plataforma). O N8N usa esta rota em vez de falar com o provider diretamente.",
        request: `{ "to": "+5511999990000", "text": "Peso registrado com sucesso." }`,
        response: `200
{ "data": { "provider": "evolution", "message_id": "BAE5..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/buffer",
        auth: "Header x-internal-secret",
        description:
          "Junta mensagens picotadas numa só. Duas operações no mesmo endpoint, chamadas pelo n8n em volta de uma espera: `append` guarda o fragmento e devolve o token daquela execução; `flush` devolve o texto concatenado apenas se o token ainda for o último. Quando não for, responde `ready: false` e aquela execução do n8n deve encerrar sem responder nada, evitando que duas respostas saiam para a mesma pessoa.",
        request: `{ "op": "append", "phone": "5522999990000", "message_text": "cadastra 20" }

{ "op": "flush", "phone": "5522999990000", "token": 3 }`,
        response: `200 (append)
{ "data": { "token": 3 }, "meta": {} }

200 (flush, este é o último)
{ "data": { "ready": true, "message_text": "cadastra 20 bezerros" }, "meta": {} }

200 (flush, chegou mensagem mais nova)
{ "data": { "ready": false }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/fetch-media",
        auth: "Header x-internal-secret",
        description:
          "Busca áudio, imagem ou documento decriptado sob demanda, pelo id da mensagem. Existe porque `webhookBase64: true` da Evolution não é confiável em produção (o campo simplesmente não vem no webhook, mesmo configurado), descoberto testando com áudio real. O n8n chama isto antes de transcrever ou extrair. Só suporta Evolution: a Meta Cloud API teria outro mecanismo de download, não implementado.",
        request: `{ "message_id": "BAE5F1..." }`,
        response: `200
{ "data": { "base64": "SUQzBAAAA...", "mimetype": "audio/ogg" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/pending-flows",
        auth: "Header x-internal-secret",
        description:
          "Lembra quem abandonou um cadastro assistido no meio e limpa os fluxos vencidos. Chamado por um agendador do n8n a cada 15 minutos, e não pela Vercel Cron, que roda 1x/dia: lembrar no dia seguinte de um cadastro largado às 14h não ajuda ninguém. O n8n não decide nada, só acorda o Tibé; quem escolhe o destinatário, monta o texto e envia é esta rota. Varre todos os tenants ativos, por natureza.",
        response: `200
{ "data": { "sent": 2, "failed": 0, "expired_flows_purged": 1 }, "meta": { "tenants": 4 } }`,
      },
    ],
  },
  {
    title: "Jobs internos",
    endpoints: [
      {
        method: "GET",
        path: "/api/internal/jobs/generate-alerts",
        auth: "Header Authorization: Bearer (CRON_SECRET, injetado automaticamente pela Vercel Cron: ver vercel.json)",
        description: "Roda 1x/dia (09:00 UTC = 06:00 América/São Paulo). Gera alertas de vacina, colheita, conta a vencer, saldo negativo e trial acabando; dispara envio via WhatsApp. Varre também cadastros públicos expirados e a janela de arquivamento de quem cancelou (marca Tenant.archived_at, sem apagar nada). Idempotente por dia (lock no Redis) e por evento (não duplica Alert).",
        response: `200
{ "data": { "vaccine_due": 2, "harvest_near": 0, "bill_due": 1, "low_balance": 0, "trial_ending": 1, "sent": 3 }, "meta": { "date": "2026-07-10" } }`,
      },
      {
        method: "GET",
        path: "/api/internal/jobs/daily-digest",
        auth: "Header x-internal-secret",
        description:
          "Resumo diário do que importa no dia (contas a vencer, vacinas, tarefas), entregue por push quando o tenant tem aparelho inscrito e por WhatsApp quando não tem. Disparado 1x/dia pelo n8n, e não pela Vercel Cron, para não depender de um segundo slot de cron no plano da Vercel. Idempotente por dia com lock no Redis, em chave própria (separada da chave do job de alertas): responde `skipped: true` na segunda chamada do mesmo dia. Nunca sai por email, por decisão de produto: resumo diário por email todo dia é ruído.",
        response: `200
{ "data": { "sent": 3, "skipped": 1 }, "meta": { "date": "2026-08-04" } }

200 (2ª chamada no mesmo dia)
{ "data": { "skipped": true, "reason": "já executado hoje" }, "meta": { "date": "2026-08-04" } }`,
      },
    ],
  },
  {
    title: "Painel da Plataforma (Módulo 6)",
    note: "Namespace /api/platform/*, fora de /api/v1: autenticado por uma sessão de PlatformUser (cookie tibe-platform-session), nunca por sessão de tenant. \"equipe\" lê tenants; só master_admin vê KPIs financeiros e executa ações administrativas.",
    endpoints: [
      {
        method: "GET",
        path: "/api/platform/tenants",
        auth: "Sessão de PlatformUser (equipe ou master_admin)",
        description: "Lista todos os tenants do sistema, com status calculado (trial se não há Subscription, senão o status da Subscription), plano, perfis ativos. Filtros: status, plan, q (nome/documento), page, limit.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Fazenda Boa Vista", "plan": "fazenda", "status": "active", "active_profiles": ["fazenda"], "created_at": "...", "subscription_status": "active", "next_due_date": "..." }], "meta": { "total": 1, "page": 1, "limit": 20 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/tenants/:id",
        auth: "Sessão de PlatformUser",
        description: "Detalhe completo: dados cadastrais, origem (UTM), histórico de transições de assinatura (SubscriptionStatusLog) e resumo de uso (animais/talhões/ordens conforme perfis ativos). Lookup cross-tenant explícito: a exceção que dá nome ao módulo.",
        response: `200
{ "data": { "id": "cl...", "name": "...", "status": "active", "subscription": { "status": "active", "history": [{ "from_status": "overdue", "to_status": "active", "changed_by_platform_user_id": null, "created_at": "..." }] }, "usage": { "animals": 40, "plots": 3, "service_orders": 0 } } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/tenants/:id/status",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Força manualmente o status da assinatura (ex: reativar um tenant suspenso por erro). Exige uma Subscription existente (404 se o tenant nunca assinou). Grava em SubscriptionStatusLog com o PlatformUser responsável e o motivo: é o próprio log de auditoria.",
        request: `{ "status": "active", "reason": "reativado manualmente, erro no processamento do Asaas" }`,
        response: `200
{ "data": { "id": "cl...", "status": "active" } }`,
      },
      {
        method: "POST",
        path: "/api/platform/tenants",
        auth: "Sessão de PlatformUser · só master_admin",
        description:
          "Cria um tenant manualmente, para dar acesso de teste a uma equipe de cliente sem passar pelo cadastro público. Reusa a mesma lógica do cadastro (trial de 14 dias, checagem de documento e email duplicados), mas GERA uma senha temporária em vez de receber uma, e marca `must_change_password`: o usuário é obrigado a trocá-la antes de acessar qualquer outra coisa. Dispara a mensagem de boas-vindas por WhatsApp e email, em melhor esforço (falha no envio não impede a criação).",
        request: `{ "company_name": "Fazenda Santa Helena", "document": "12345678000199", "phone": "22999990000", "owner_name": "João", "owner_email": "joao@santahelena.com.br" }`,
        response: `201
{ "data": { "tenant_id": "cl...", "email": "joao@santahelena.com.br", "temp_password": "Xy9k2Qmz" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/tenants/:id",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Corrige os dados cadastrais do tenant (razão social, documento, telefone, email de contato e plano). Todos os campos são opcionais: só o que vier é alterado.",
        request: `{ "name": "Fazenda Santa Helena LTDA", "plan": "grupo" }`,
        response: `200
{ "data": { "id": "cl...", "status": "active" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/tenants/:id/owner-email",
        auth: "Sessão de PlatformUser · só master_admin",
        description:
          "Troca o email de login do OWNER do tenant, para quando o cliente errou o endereço no cadastro e não consegue nem entrar nem recuperar a senha. Recusa se o email novo já pertencer a outro usuário (`User.email` é único globalmente).",
        request: `{ "email": "joao.novo@santahelena.com.br" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/tenants/:id/archive",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Arquiva ou desarquiva o tenant. Arquivar não apaga nada: tira o tenant das listas e dos KPIs sem perder histórico. `archived: false` reverte.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-08-04T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/tenants/:id/welcome-message",
        auth: "Sessão de PlatformUser · só master_admin",
        description:
          "Reenvia as boas-vindas com uma credencial que funciona. GERA uma senha temporária nova e remarca `must_change_password`, em vez de repetir a antiga: a senha original em claro não é recuperável (só o hash é salvo), então reenviar a mesma mensagem mandaria uma senha que o usuário talvez já tenha trocado. Exige `Tenant.phone`: falha inteira sem telefone, sem tentar só o email, porque o propósito da ação é reenviar pelo WhatsApp.",
        response: `200
{ "data": { "sent": true }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/mrr",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "MRR atual (soma de PLAN_PRICES das assinaturas active) e breakdown por plano.",
        response: `200
{ "data": { "total_mrr": 691, "by_plan": { "campo": 97, "fazenda": 197, "grupo": 397 }, "active_subscriptions_count": 3 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/mrr-trend",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Evolução de MRR nos últimos N meses (?months=6, padrão), reconstruída a partir de SubscriptionStatusLog: não é aproximação, é o status real de cada assinatura em cada checkpoint mensal.",
        response: `200
{ "data": [{ "period": "2026-02", "mrr": 394 }, { "period": "2026-03", "mrr": 591 }] }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/churn",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Churn de clientes e de MRR no período (?period=30d|90d|12m). customer_churn = cancelados no período / ativos no início do período; mrr_churn = MRR perdido / MRR no início do período.",
        response: `200
{ "data": { "period": "30d", "customer_churn_pct": 5.5, "mrr_churn_pct": 4.2, "canceled_count": 1 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/ltv",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "LTV simplificado: ticket médio mensal / churn mensal (30d). Devolve ltv: null (não Infinity) quando não há churn observado ainda: divisão por zero evitada.",
        response: `200
{ "data": { "ltv": 1763.6, "avg_ticket_mensal": 230.3, "churn_mensal_pct": 13.06 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/funnel",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Funil de conversão trial → pago no período (?period=30d|90d|12m), com breakdown por lead_source_utm_source (null agrupa em \"sem origem\"/acesso direto) e tempo médio de conversão em dias.",
        response: `200
{ "data": { "period": "30d", "trials_created": 12, "converted_to_paid": 4, "conversion_rate_pct": 33.33, "avg_days_to_convert": 3.5, "by_source": [{ "utm_source": "instagram", "trials_created": 5, "converted": 2, "conversion_rate_pct": 40 }, { "utm_source": null, "trials_created": 7, "converted": 2, "conversion_rate_pct": 28.57 }] } }`,
      },
      {
        method: "GET",
        path: "/api/platform/team",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Lista a equipe da plataforma (PlatformUser).",
        response: `200
{ "data": [{ "id": "cl...", "name": "...", "email": "...", "role": "EQUIPE", "active": true }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/platform/team",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Convida novo membro: senha temporária exibida uma única vez na resposta (sem infra de email no projeto, mesmo padrão do convite de usuário de tenant).",
        request: `{ "name": "Novo Membro", "email": "membro@pleno.dev.br", "role": "EQUIPE" }`,
        response: `201
{ "data": { "id": "cl...", "temp_password": "Xy9k2Qmz" } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/team/:id/role",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Altera o papel de um membro. Não é possível alterar o próprio papel.",
        request: `{ "role": "MASTER_ADMIN" }`,
        response: `200
{ "data": { "id": "cl...", "role": "MASTER_ADMIN" } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/team/:id/active",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Ativa ou desativa um membro. Não é possível desativar a própria conta.",
        request: `{ "active": false }`,
        response: `200
{ "data": { "id": "cl...", "active": false } }`,
      },
      {
        method: "GET",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Lista as configs de provider (credenciais sempre mascaradas: últimos 4 caracteres).",
        response: `200
{ "data": [ { "provider": "evolution", "active": true, "credentials_masked": { "api_key": "•••• 9876" }, "updated_at": "2026-07-11T12:00:00.000Z" } ], "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Cria/atualiza as credenciais de um provider (criptografadas em repouso). Não altera qual está ativo.",
        request: `{ "provider": "evolution", "credentials": { "base_url": "https://evo.up.railway.app", "api_key": "...", "instance": "tibe" } }`,
        response: `200
{ "data": { "provider": "evolution" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/whatsapp-config/:provider/activate",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Ativa o provider (e desativa o outro, transacional). 404 se ainda não configurado.",
        response: `200
{ "data": { "provider": "meta_cloud_api" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/whatsapp-config/evolution/connect",
        auth: "Sessão de PlatformUser · só master_admin",
        description:
          "Cria (ou reusa) a instância na Evolution API e devolve o QR Code para parear o número lendo pelo celular. Configura o webhook de entrada no mesmo passo; `webhook_configured: false` indica que o pareamento pode funcionar mas as mensagens recebidas não chegarão ao n8n. Host inalcançável não derruba a rota: devolve `qrcode: null` em vez de erro, porque a Evolution é infraestrutura externa e instável por natureza.",
        response: `200
{ "data": { "instance": "tibe", "qrcode": "data:image/png;base64,...", "webhook_configured": true }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/platform/whatsapp-config/evolution/status",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Estado do pareamento da instância Evolution, usado pela tela para saber se o número já está conectado ou se ainda espera a leitura do QR.",
        response: `200
{ "data": { "instance": "tibe", "state": "open", "connected": true }, "meta": {} }`,
      },
    ],
  },
];
