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
        description: "Lista os usuários do Tibé da conta: quem não tem função no Empório, mais o Dono (Q190; a equipe do Empório fica em `/api/v1/emporio/team`). `meta.seats` traz o uso de assentos do plano (usuários do Tibé ativos contra o limite).",
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
        description: "Altera o papel de um usuário. Não é possível alterar o próprio papel, nem promover a Owner sem ser Owner. Quem tem função no Empório: 409 `EMPORIO_ROLE` no campo `role` (\"Troque a função pela Equipe do Empório.\").",
        request: `{ "role": "ADMIN" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/users/:id/active",
        auth: "Sessão · usuarios:write",
        description: "Só para usuário do Tibé: membro da equipe do Empório (quem tem `emporio_role`) é recusado com 409 `EMPORIO_ROLE` (\"Ative ou desative pela Equipe do Empório.\"), porque ocupa o limite do Empório, não o do plano (Q190). Ativa ou desativa um usuário (nunca deleta: preserva histórico de ações). Não é possível desativar a própria conta. Desativar sempre é permitido e libera um assento; reativar consome um assento e devolve `SEAT_LIMIT_REACHED` (422) se o plano já estiver no limite. O desativado perde a sessão no request seguinte (401 na API, login no painel).",
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
        path: "/api/v1/emporio",
        auth: "Sessão · emporio:read · recurso `emporio` liberado pela Plataforma",
        description: "Porta do Meu Empório (Módulo 39, F0): devolve a contagem de estabelecimentos não arquivados. 404 `NOT_FOUND` quando o recurso não está liberado para o usuário, como se a rota não existisse.",
        response: `200
{ "data": { "establishments_count": 0 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/establishments",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista os estabelecimentos do Empório. Esconde os arquivados; `?incluir_arquivados=1` os inclui. Quem tem vínculo (`user_ids`) vê só as lojas vinculadas; sem vínculo, vê todas.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Central", "address": null, "city": null, "responsible_user_id": null, "allow_negative_stock": false, "max_discount_pct": null, "default_expense_pct": 15, "default_profit_pct": 20, "archived_at": null, "user_ids": [] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/establishments",
        auth: "Sessão · emporio:write · só OWNER e ADMIN (403 `FORBIDDEN`)",
        description: "Cria um estabelecimento. O tipo (`kind`) não existe mais: se vier no corpo, é ignorado, sem erro. Nome repetido: 409 `DUPLICATE_NAME` no campo `name`. Percentual fora de 0 a 1000: 422 no campo.",
        request: `{ "name": "Loja Centro", "default_expense_pct": 15, "default_profit_pct": 20 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Loja Centro", "user_ids": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/establishments/:id",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Um estabelecimento. Quem tem vínculo e pede outra loja recebe 404 `NOT_FOUND`.",
        response: `200
{ "data": { "id": "cl...", "name": "Loja Centro", "user_ids": [] }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/establishments/:id",
        auth: "Sessão · emporio:write · OWNER, ADMIN e gestor da loja",
        description: "Edita os campos enviados (os ausentes ficam como estão; `null` limpa os opcionais). Cabeçalho do papel: `document` (CNPJ, numérico ou alfanumérico, guardado sem pontuação e em maiúscula), `phone` e `whatsapp` (até 40 caracteres), `state` (UF da lista, em maiúscula) e `zip` (CEP, 8 números guardados sem traço); recusa 422 no campo. O POST aceita os mesmos cinco. Desde 08/11/2026 (entrega 4, Q236): `area_m2` (número, até 999999,99) e `employees_count` (inteiro), a base dos rateios por área e por funcionários; `null` limpa; recusa 422 no campo. O Financeiro (`dinheiro`) edita só esses dois: com qualquer outro campo, 403 `FORBIDDEN`. A resposta traz os dois (nulos enquanto não informados).",
        request: `{ "max_discount_pct": 10, "document": "12.ABC.345/01DE-35", "state": "MG", "zip": "39400-000", "area_m2": 120, "employees_count": 4 }`,
        response: `200
{ "data": { "id": "cl...", "name": "Loja Centro", "max_discount_pct": 10, "area_m2": 120, "employees_count": 4 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/establishments/:id/archive",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Arquiva (`archived: true`) ou desarquiva (`false`). Nunca apaga.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-10-27T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/establishments/:id/users",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Substitui os vínculos usuário-loja. Lista vazia = ninguém vinculado. Usuário de outra conta ou inativo: 422 `VALIDATION_ERROR` no campo `user_ids`.",
        request: `{ "user_ids": ["cl..."] }`,
        response: `200
{ "data": { "id": "cl...", "user_ids": ["cl..."] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/establishments/:id/sellers",
        auth: "Sessão · emporio:read · qualquer papel com a loja no alcance (inclui o Caixa)",
        description: "Quem pode ser o vendedor de uma venda nesta loja: o Dono, o Gerente geral e o Gestor e o Vendedor vinculados à loja. Não traz o Caixa nem usuário desativado. Loja fora do alcance ou inexistente: 404 em `establishment_id`.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Maria" }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/settings",
        auth: "Sessão · emporio:read · qualquer papel no Empório",
        description: "Configurações da conta: validade e rodapé do orçamento, rodapé da venda, largura da bobina e se há logo, mais as do fiado: `fiado_due_days` (prazo padrão), `fiado_block_after_days` (dias de atraso que bloqueiam o fiado), `fiado_default_limit` (limite padrão em reais, `null` = sem limite), `fiado_collection_message` (o modelo gravado, `null` = o padrão) e `fiado_collection_message_effective` (o texto que vale, com os marcadores `{nome}`, `{loja}`, `{valor}` e `{dias}`, este por extenso, como `20 dias`). `payment_approval_limit` (desde 08/11/2026): o teto de pagamento sem aprovação, em reais; `null` = sem teto. Sem nada gravado, devolve os padrões (7 dias, bobina de 80 mm, fiado de 30 dias, bloqueio após 15, sem teto) sem criar a linha.",
        response: `200
{ "data": { "quote_validity_days": 7, "quote_footer": null, "sale_footer": null, "receipt_width": 80, "has_logo": false, "logo_updated_at": null, "fiado_due_days": 30, "fiado_block_after_days": 15, "fiado_default_limit": null, "fiado_collection_message": null, "fiado_collection_message_effective": "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias}. Pode nos ajudar a acertar? Obrigado!", "payment_approval_limit": null }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/settings/approval",
        auth: "Sessão · emporio:write · só o Gerente geral e o Dono (o Financeiro e os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Define o teto de pagamento sem aprovação (Q227). `payment_approval_limit`: de 0.01 a 99999999.99, ou `null` para não ter teto (422 em `payment_approval_limit`). Pagar contas acima do teto, para quem não é da conta (Financeiro e Gestor da loja), vira um pedido de aprovação em vez de pagamento. Devolve as configurações inteiras, como o GET. Entra no Histórico como `configuracoes.editar`, com o campo, o antes e o depois.",
        request: `{ "payment_approval_limit": 2000 }`,
        response: `200
{ "data": { "quote_validity_days": 7, "quote_footer": null, "sale_footer": null, "receipt_width": 80, "has_logo": false, "logo_updated_at": null, "fiado_due_days": 30, "fiado_block_after_days": 15, "fiado_default_limit": null, "fiado_collection_message": null, "fiado_collection_message_effective": "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias}. Pode nos ajudar a acertar? Obrigado!", "payment_approval_limit": 2000 }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/settings/fiado",
        auth: "Sessão · emporio:write · só o Financeiro, o Gerente geral e o Dono (os outros papéis: 403 `FORBIDDEN`)",
        description: "Grava as regras do fiado da conta. Chave ausente mantém. `fiado_due_days`: prazo padrão, 1 a 365. `fiado_block_after_days`: dias de atraso que bloqueiam o fiado do cliente, 1 a 365. `fiado_default_limit`: de 0 a 99999999.99, `null` tira o limite (zero é \"ninguém compra fiado\" sem um limite próprio). `fiado_collection_message`: até 500 caracteres, vazio volta ao texto padrão. Recusa 422 no campo. Devolve as configurações inteiras, como o GET. Entra no Histórico como `configuracoes.editar`, com o campo, o antes e o depois.",
        request: `{ "fiado_due_days": 45, "fiado_block_after_days": 20, "fiado_default_limit": 2000 }`,
        response: `200
{ "data": { "quote_validity_days": 7, "quote_footer": null, "sale_footer": null, "receipt_width": 80, "has_logo": false, "logo_updated_at": null, "fiado_due_days": 45, "fiado_block_after_days": 20, "fiado_default_limit": 2000, "fiado_collection_message": null, "fiado_collection_message_effective": "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias}. Pode nos ajudar a acertar? Obrigado!" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/settings",
        auth: "Sessão · emporio:write · só o dono e o gerente geral (403 `FORBIDDEN`)",
        description: "Grava os campos enviados. `quote_validity_days`: inteiro de 1 a 365. Rodapés: até 500 caracteres, vazio vira `null`. `receipt_width`: 80 ou 58. Recusa 422 no campo. Entra no Histórico como `configuracoes.editar`.",
        request: `{ "quote_validity_days": 10, "quote_footer": "Pague no Pix", "receipt_width": 58 }`,
        response: `200
{ "data": { "quote_validity_days": 10, "quote_footer": "Pague no Pix", "sale_footer": null, "receipt_width": 58, "has_logo": false, "logo_updated_at": null, "fiado_due_days": 30, "fiado_block_after_days": 15, "fiado_default_limit": null, "fiado_collection_message": null, "fiado_collection_message_effective": "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias}. Pode nos ajudar a acertar? Obrigado!" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/settings/logo",
        auth: "Sessão · emporio:read · qualquer papel no Empório",
        description: "Devolve a imagem do logo (PNG ou JPEG) com o `Content-Type` gravado e `Cache-Control: private, max-age=300`. Sem logo: 404 `NOT_FOUND`.",
        response: `200
(bytes da imagem)`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/settings/logo",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Troca o logo. O tipo é conferido pelos bytes (PNG ou JPEG), não pelo `mime` informado, e o limite é 200 KB depois de decodificado. Recusa 422 no campo `logo`. Entra no Histórico como `configuracoes.logo`.",
        request: `{ "data_base64": "iVBORw0KGgo...", "mime": "image/png" }`,
        response: `200
{ "data": { "has_logo": true, "logo_updated_at": "2026-11-04T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/emporio/settings/logo",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Remove o logo. Sem logo gravado, responde 200 sem mudar nada.",
        response: `200
{ "data": { "has_logo": false, "logo_updated_at": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/products",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista os produtos do Empório (configuração comercial sobre o `Product`). Esconde os arquivados; `?incluir_arquivados=1` os inclui. `track_sealed` nulo é automático e `track_sealed_efetivo` traz o valor resolvido. `?q=` procura sem acento no nome, na marca, no fabricante e no código interno; `?species=` filtra por uma espécie (`cao`, `gato`, `bovino`, `equino`, `ovino_caprino`, `suino`, `aves`, `peixes`, `outros`; outra: 422 no campo `species`).",
        response: `200
{ "data": [{ "id": "cl...", "product_id": "cl...", "name": "Sal grosso", "category_id": "cl...", "category_name": "Outros", "brand": null, "base_unit": "quilograma", "content_qty": null, "content_unit": null, "manufacturer": null, "internal_code": null, "species": [], "created_in_emporio": true, "reference_cost": 10, "track_sealed": null, "track_sealed_efetivo": false, "track_lot": false, "track_expiry": false, "expense_pct": null, "profit_pct": null, "archived_at": null }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/products",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Põe um produto no Empório. Com `product_id`, usa um produto que já existe na conta; com `name` e `category_id`, cria o produto (e o marca como criado no Empório). `base_unit` (`quilograma`, `litro`, `metro`, `unidade`, `saca` ou `fardo`) é obrigatória nos dois casos. Conteúdo (`content_qty` e `content_unit`): obrigatório em `saca` (em `quilograma` ou `litro`) e em `fardo` (em `quilograma`, `litro` ou `unidade`), opcional em `unidade` (`quilograma` ou `litro`), proibido em `quilograma`, `litro` e `metro`; maior que zero, inteiro quando a unidade do conteúdo é `unidade`; recusa é 422 no campo `content_qty` ou `content_unit`. O conteúdo é fixo depois de criado. Saca e fardo nascem com a apresentação fechada que vale 1 (\"Saca 10 kg\", \"Fardo 12 un\"). Dados opcionais: `brand` e `manufacturer` (até 80), `internal_code` (até 30, único na conta: 409 `DUPLICATE_CODE` no campo `internal_code`) e `species` (lista de ids; fora da lista: 422 no campo `species`). Produto já no Empório: 409 `ALREADY_IN_EMPORIO`. Nome repetido: 409 `DUPLICATE_NAME` no campo `name`.",
        request: `{ "name": "Ração 10 kg", "category_id": "cl...", "base_unit": "saca", "content_qty": 10, "content_unit": "quilograma", "reference_cost": 80, "brand": "Marca", "internal_code": "RC-10", "species": ["cao"] }`,
        response: `201
{ "data": { "id": "cl...", "name": "Ração 10 kg", "base_unit": "saca", "content_qty": 10, "content_unit": "quilograma", "species": ["cao"], "presentations": [{ "id": "cl...", "name": "Saca 10 kg", "base_qty": 1, "content_equivalent": 10, "is_sealed_package": true, "archived_at": null }], "prices": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/products/candidates",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Produtos da conta ainda fora do Empório (não arquivados), para o \"usar no Empório\".",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sal mineral", "category_id": "cl...", "category_name": "Nutrição", "brand": null, "unit": "saca" }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/products/:id",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "O produto (`:id` é o do produto do Empório) com as apresentações e a tabela de preço: uma linha por loja visível ao usuário e apresentação ativa, mesmo sem preço cadastrado, com custo (`reference_cost × base_qty`), percentuais efetivos e preço sugerido (`custo × (1 + despesas/100) × (1 + lucro/100)`, nulo sem custo).",
        response: `200
{ "data": { "id": "cl...", "name": "Sal grosso", "presentations": [{ "id": "cl...", "name": "Saca 10 kg", "base_qty": 10, "content_equivalent": null, "is_sealed_package": true, "archived_at": null }], "prices": [{ "establishment_id": "cl...", "establishment_name": "Loja Centro", "presentation_id": "cl...", "price": null, "cost": 100, "expense_pct": null, "profit_pct": null, "expense_pct_efetivo": 15, "profit_pct_efetivo": 20, "suggested_price": 138 }] }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/products/:id",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR (`expense_pct` e `profit_pct` só OWNER e ADMIN)",
        description: "Edita o nome (`name`: em branco é 422 no campo, repetido em outro produto, sem diferenciar maiúsculas, é 409 `DUPLICATE_NAME`; as vendas antigas passam a mostrar o nome novo), custo de referência, `brand`, `manufacturer`, `internal_code` (repetido: 409 `DUPLICATE_CODE`), `species`, lacrado/avulso (`track_sealed`: `true`, `false` ou `null` para voltar ao automático), lote, validade e a exceção de percentuais do produto. Mandar `content_qty` ou `content_unit` é 422 no campo: o conteúdo não muda depois de criado.",
        request: `{ "reference_cost": 12.5, "track_sealed": null, "expense_pct": 10 }`,
        response: `200
{ "data": { "id": "cl...", "reference_cost": 12.5, "track_sealed": null, "expense_pct": 10 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/products/:id/archive",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Arquiva (`archived: true`) ou desarquiva (`false`) o produto do Empório.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-10-27T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/products/:id/presentations",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Cria uma apresentação (forma de venda). `base_qty` é quanto ela vale na unidade-base: maior que zero, e inteira quando a unidade-base é `unidade`. Em produto com conteúdo, pode-se mandar `content_qty` (quanto cabe, na unidade do conteúdo) no lugar de `base_qty`: `base_qty = content_qty / conteúdo`. Os dois juntos, ou `content_qty` em produto sem conteúdo, é 422 no campo `content_qty`; também é 422 quando a divisão não fecha em 3 casas (\"1 kg não divide a saca de 30 kg em partes exatas\"). `content_equivalent` é `base_qty` vezes o conteúdo, nulo sem conteúdo. Nome repetido no produto: 409 `DUPLICATE_NAME`.",
        request: `{ "name": "Meio saco", "content_qty": 5, "is_sealed_package": false }`,
        response: `201
{ "data": { "id": "cl...", "name": "Meio saco", "base_qty": 0.5, "content_equivalent": 5, "is_sealed_package": false, "archived_at": null }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/presentations/:id",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Edita nome, `base_qty` (ou `content_qty`, com as mesmas regras da criação) e `is_sealed_package` da apresentação.",
        request: `{ "base_qty": 25 }`,
        response: `200
{ "data": { "id": "cl...", "name": "Saca 10 kg", "base_qty": 25, "content_equivalent": null, "is_sealed_package": true, "archived_at": null }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/presentations/:id/archive",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Arquiva (`archived: true`) ou desarquiva (`false`) a apresentação.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-10-27T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/prices",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Upsert do preço de uma apresentação numa loja, com a exceção de percentuais dela. Campo `null` ou ausente limpa. Loja fora do vínculo do usuário: 404. Preço negativo ou percentual fora de 0 a 1000: 422 no campo.",
        request: `{ "establishment_id": "cl...", "presentation_id": "cl...", "price": 138, "expense_pct": null, "profit_pct": null }`,
        response: `200
{ "data": { "establishment_id": "cl...", "presentation_id": "cl...", "price": 138, "expense_pct": null, "profit_pct": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/stock",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Saldo da loja por produto (`?establishment_id=` obrigatório; sem ele, 422 no campo). Cada linha: total, avulso, lacrado por apresentação em embalagens, custo médio ponderado móvel, `estimated` quando alguma entrada não teve custo, limites, `needs_restock` e `suggested_qty`. Saldo é sempre a soma das movimentações. Loja fora do vínculo do usuário: 404.",
        response: `200
{ "data": [{ "establishment_id": "cl...", "emporio_product_id": "cl...", "product_name": "Ração Pet", "base_unit": "quilograma", "total_qty": 25, "loose_qty": 5, "sealed": [{ "presentation_id": "cl...", "name": "Saca 10 kg", "packages": 2, "base_qty": 10 }], "average_cost": 19.36, "estimated": false, "min_qty": 10, "max_qty": 50, "needs_restock": false, "suggested_qty": 25 }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/stock/consolidated",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Um saldo por produto somando as lojas visíveis ao usuário, com o custo médio ponderado pelo saldo de cada loja.",
        response: `200
{ "data": [{ "emporio_product_id": "cl...", "product_name": "Ração Pet", "total_qty": 40, "average_cost": 19.1 }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/products/:id/stock",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Saldo de um produto do Empório em cada loja visível ao usuário, mais o consolidado.",
        response: `200
{ "data": { "emporio_product_id": "cl...", "product_name": "Ração Pet", "base_unit": "quilograma", "stores": [], "consolidated": { "total_qty": 40 } }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/stock/implantation",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Estoque inicial, uma vez por produto e loja (segunda vez: 409 `ALREADY_IMPLANTED`; depois, só contagem). `sealed` em embalagens por apresentação fechada (produto sem separação lacrado/avulso: 422 `sealed`), `loose_qty` na unidade-base, `unit_cost` opcional (sem ele, o saldo fica `estimated`).",
        request: `{ "establishment_id": "cl...", "emporio_product_id": "cl...", "sealed": [{ "presentation_id": "cl...", "packages": 3 }], "loose_qty": 2.5, "unit_cost": 9.5 }`,
        response: `201
{ "data": { "total_qty": 32.5, "loose_qty": 2.5, "estimated": false }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/stock/count",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Contagem física: informa o que existe (lacrado por apresentação e avulso) e o motivo (obrigatório, 422 `reason`). Grava um ajuste por estado que mudou, com o saldo anterior e o corrigido. Nunca é compra nem venda.",
        request: `{ "establishment_id": "cl...", "emporio_product_id": "cl...", "sealed": [{ "presentation_id": "cl...", "packages": 2 }], "loose_qty": 1, "reason": "Contagem de sexta" }`,
        response: `201
{ "data": { "total_qty": 21, "loose_qty": 1 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/stock/loss",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Perda ou avaria. `reason`: `vencido`, `avaria`, `furto`, `consumo_proprio` ou `outro`. Lacrado: `presentation_id` e `quantity` em embalagens; avulso: `quantity` na unidade-base. Sai pelo custo médio do momento. Acima do saldo: 409 `INSUFFICIENT_STOCK` em `quantity`, salvo loja com estoque negativo liberado.",
        request: `{ "establishment_id": "cl...", "emporio_product_id": "cl...", "package_state": "avulso", "quantity": 2, "reason": "avaria", "notes": "Saco rasgado" }`,
        response: `201
{ "data": { "total_qty": 19 }, "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/stock/limits",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Mínimo e máximo do produto na loja, na unidade-base (`null` limpa). Mínimo maior que o máximo: 422 `max_qty`.",
        request: `{ "establishment_id": "cl...", "emporio_product_id": "cl...", "min_qty": 10, "max_qty": 50 }`,
        response: `200
{ "data": { "min_qty": 10, "max_qty": 50, "needs_restock": false, "suggested_qty": 31 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/stock/restock",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Precisa repor: linhas de saldo com saldo menor ou igual ao mínimo, nas lojas visíveis (`?establishment_id=` opcional). Sugestão = máximo menos (saldo mais compras ainda não recebidas); sem máximo, nula.",
        response: `200
{ "data": [{ "establishment_id": "cl...", "product_name": "Ração Pet", "total_qty": 4, "min_qty": 10, "max_qty": 50, "needs_restock": true, "suggested_qty": 46 }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/stock/restock/to-list",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Encaminha à Lista de Compra: cria o item com a loja e a quantidade. Já há item pendente desse produto na mesma loja: 409 `ITEM_JA_NA_LISTA`.",
        request: `{ "establishment_id": "cl...", "emporio_product_id": "cl...", "quantity": 46 }`,
        response: `201
{ "data": { "id": "cl...", "establishment_id": "cl...", "quantity": 46, "status": "pendente" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/purchases",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista as compras das lojas visíveis ao usuário, da mais recente. Filtros: `establishment_id` (loja fora do vínculo: 404), `status` (`pendente`, `recebida`, `cancelada`), `supplier_id` (era `contact_id`). Cada compra traz `supplier_id`, `supplier_name`, `supplier_kind` (`propriedade` ou `externo`), itens, total e os lançamentos financeiros.",
        response: `200
{ "data": [{ "id": "cl...", "establishment_id": "cl...", "establishment_name": "Loja Centro", "supplier_id": "cl...", "supplier_name": "Distribuidora Boa Safra", "supplier_kind": "externo", "status": "recebida", "freight": 20, "items_total": 200, "total": 220, "payment_kind": "a_vista", "items": [], "entries": [] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/purchases",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Cria a compra. `supplier_id` (fornecedor do Empório; antes era `contact_id`, de Contatos) é opcional: de outra conta 404, arquivado 422, ambos no campo `supplier_id`. Com fornecedor do tipo `propriedade` (uma propriedade do Dono), `payment` é opcional e IGNORADO: a compra entra só com o custo no estoque, `payment_kind` fica nulo e nenhum lançamento nasce. Nos demais casos `payment` é obrigatório (422 `payment`), e a conta a pagar aponta o fornecedor (`emporio_supplier_id`). `operation_key` é obrigatória e única na conta: repetir a chave devolve a compra gravada com 200, sem escrever nada (primeira vez: 201). Cada item traz `presentation_id` (a quantidade é de apresentações) ou só a quantidade na unidade-base, e `item_total`. O frete é rateado pelo valor dos itens e o `unit_cost` sai por unidade-base, frete incluído. Com `received: true` o estoque entra na hora (lacrado ou avulso conforme o produto); senão, só no recebimento. `payment.kind`: `a_vista` (um lançamento pago), `a_prazo` (um a pagar, exige `due_date`) ou `parcelada` (`down_payment` opcional pago mais um a pagar por item de `installments`). Parcelas que não fecham total + frete menos a entrada: 422 `installments`. Item inválido (quantidade zero, valor negativo, fracionado em `unidade`, apresentação de outro produto): 422 `items`. Despesa na categoria \"Mercadorias para revenda\", `related_module` `emporio`. `payment.paid_from` (desde 07/11/2026) diz de onde saiu o dinheiro da parte paga na hora (à vista, ou a entrada da parcelada): `{ establishment_id, cash_register_id? }` (a gaveta do turno aberto da loja da compra) OU `{ bank_account_id }` (a conta; só Gestor da loja, Financeiro, Gerente geral e Dono). Obrigatório quando há parte paga: sem lugar ou com dois, 422 `paid_from`; gaveta de outra loja, 422 `paid_from`; conta arquivada, 422 `paid_from`; turno fechado, `CASH_CLOSED`; saldo menor que o valor, 409 `INSUFFICIENT_CASH`. Gera um movimento `pagamento_compra` na gaveta ou na conta. A prazo não leva `paid_from`.",
        request: `{ "operation_key": "k-123", "establishment_id": "cl...", "supplier_id": null, "purchased_at": "2026-10-27T12:00:00.000Z", "received": true, "freight": 20, "items": [{ "emporio_product_id": "cl...", "presentation_id": "cl...", "quantity": 4, "item_total": 200 }], "payment": { "kind": "a_vista", "paid_from": { "bank_account_id": "cl..." } } }`,
        response: `201
{ "data": { "id": "cl...", "status": "recebida", "total": 220, "items": [{ "base_quantity": 40, "unit_cost": 5.5 }], "entries": [{ "amount": 220, "status": "paid" }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/purchases/:id",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Uma compra com itens e lançamentos. Compra de loja fora do vínculo do usuário: 404.",
        response: `200
{ "data": { "id": "cl...", "status": "pendente", "received_at": null, "items": [], "entries": [] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/purchases/:id/receive",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Recebe a compra inteira (`received_at` opcional, padrão agora) e dá entrada no estoque. Já recebida: 409 `ALREADY_RECEIVED`. Cancelada: 409 `PURCHASE_CANCELED`.",
        request: `{ "received_at": "2026-10-28T09:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl...", "status": "recebida", "received_at": "2026-10-28T09:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/purchases/:id/cancel",
        auth: "Sessão · emporio:write · só OWNER e ADMIN (403 `FORBIDDEN`)",
        description: "Cancela a compra com `reason`: cancela as contas a pagar pendentes e marca como canceladas as movimentações de estoque. Nada é apagado. Algum lançamento pago (inclusive entrada ou compra à vista): 409 `PURCHASE_HAS_PAYMENT`. Já cancelada: 409 `ALREADY_CANCELED`.",
        request: `{ "reason": "Fornecedor não entregou" }`,
        response: `200
{ "data": { "id": "cl...", "status": "cancelada", "canceled_reason": "Fornecedor não entregou" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/products/:id/composition",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "A composição do produto (uma por produto), ou `null` se não tiver. Cada item traz o nome e a unidade-base do componente.",
        response: `200
{ "data": { "emporio_product_id": "cl...", "reference_qty": 100, "yield_pct": null, "items": [{ "component_emporio_product_id": "cl...", "name": "Milho", "base_unit": "quilograma", "quantity": 65 }] }, "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/products/:id/composition",
        auth: "Sessão · emporio:write · OWNER e ADMIN",
        description: "Define a composição, substituindo a anterior inteira. `reference_qty` é a quantidade do produto final (na unidade-base) que os itens rendem; `yield_pct` é opcional (acima de 0 até 100, vazio = 100). Componente repetido, igual ao produto, que leve de volta a ele por qualquer caminho (ciclo), arquivado, com quantidade zero ou fracionado em unidade-base `unidade`: 422 `items`. Não movimenta estoque. OPERADOR: 403.",
        request: `{ "reference_qty": 100, "yield_pct": 95, "items": [{ "component_emporio_product_id": "cl...", "quantity": 65 }, { "component_emporio_product_id": "cl...", "quantity": 35 }] }`,
        response: `200
{ "data": { "emporio_product_id": "cl...", "reference_qty": 100, "yield_pct": 95, "items": [{ "component_emporio_product_id": "cl...", "name": "Milho", "base_unit": "quilograma", "quantity": 65 }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/products/:id/composition/from-recipe",
        auth: "Sessão · emporio:write · OWNER e ADMIN",
        description: "Cria a composição a partir da Calculadora de receita (Q114). Quantidades em quilo: produto final que não é medido em quilo dá 422 `emporio_product_id`, e componente que não é medido em quilo dá 422 `items` (\"{nome} é medido em {unidade}; a receita só casa com produto medido em quilo.\"). Se o produto já tem composição e `replace` não for `true`: 409 `COMPOSITION_EXISTS` no campo `replace`. O resto (ciclo, componente repetido, arquivado) é o do PUT da composição. O rendimento fica vazio e nada mexe no estoque. OPERADOR: 403.",
        request: `{ "reference_qty": 10, "items": [{ "component_emporio_product_id": "cl...", "quantity": 6.5 }], "replace": false }`,
        response: `200
{ "data": { "emporio_product_id": "cl...", "reference_qty": 10, "yield_pct": null, "items": [{ "component_emporio_product_id": "cl...", "name": "Milho", "base_unit": "quilograma", "quantity": 6.5 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/first-steps",
        auth: "Sessão · emporio:read · OWNER e ADMIN · perfil emporio · recurso `emporio` liberado",
        description: "Primeiros passos por loja do usuário (Q116). Cada passo traz `key`, `essential`, `done`, `detail` (quando houver) e o `href` do formulário. Essenciais: `preco`, `estoque_inicial` (sem implantação ou com produto sem custo), `saldo_caixa`, `taxa_cartao` (só aparece se a loja já vendeu no cartão) e `despesa_fixa`; recomendados: `minimo_maximo` e `conta_pix`. `complete` é verdadeiro quando todos os essenciais de todas as lojas estão feitos. Cada loja traz também `sem_gestor` (Q132): `{ essential: false, message: \"Defina um Gestor para a <loja>\", href: \"/emporio/equipe\" }` quando a loja não tem Gestor ativo e quem pergunta é o dono ou o gerente geral; senão `null`. Nunca entra em `complete`. Abaixo de ADMIN: 403 `FORBIDDEN`.",
        response: `200
{ "data": { "complete": false, "establishments": [{ "establishment_id": "cl...", "name": "Loja Centro", "steps": [{ "key": "preco", "essential": true, "done": true, "href": "/emporio/produtos" }, { "key": "estoque_inicial", "essential": true, "done": false, "detail": "3 produtos sem custo", "href": "/emporio/produtos" }] }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/team",
        auth: "Sessão · emporio:read · só o dono e o gerente geral (403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "A Equipe do Empório (Q118, Q190): em `users`, os ativos da equipe (quem tem `emporio_role`: `gerente_geral`, `gestor`, `vendedor` ou `caixa`) mais o Dono (`emporio_role` nulo), com `role`, `emporio_only`, `emporio_keys` e `establishment_ids`; em `inactive_users`, os desativados da equipe, no mesmo formato, para o Reativar. Os usuários do Tibé (sem função) não aparecem. `seats` é o limite da equipe do Empório (50 por conta), não o do plano. Vêm também as lojas não arquivadas para a tela.",
        response: `200
{ "data": { "users": [{ "id": "cl...", "name": "Ana", "email": "ana@loja.com", "phone": null, "role": "OPERADOR", "emporio_role": "vendedor", "emporio_only": false, "emporio_keys": ["perda"], "establishment_ids": ["cl..."] }], "inactive_users": [], "seats": { "used": 3, "limit": 50, "has_room": true }, "establishments": [{ "id": "cl...", "name": "Loja Centro" }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/team",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Cadastra alguém na equipe: cria o usuário (convite, com senha temporária mostrada uma única vez) e grava função, lojas e chaves. O papel da conta acompanha: gerente geral é ADMIN, gestor e vendedor são OPERADOR. Email já usado: 409 `DUPLICATE_EMAIL` em `email`. Equipe do Empório cheia (50 ativos; o limite do plano não conta aqui, Q190): 422 `SEAT_LIMIT_REACHED`. Recusas 422 `VALIDATION_ERROR` no campo: `emporio_role` fora da lista, `establishment_ids` vazio ou com loja inexistente ou arquivada (gestor e vendedor), `emporio_keys` em quem não é vendedor ou com chave desconhecida. As lojas do gerente geral são ignoradas. `emporio_only` é aceito e ignorado (Q190): toda a equipe é só do Empório, e o gerente geral grava sempre `true`.",
        request: `{ "name": "Ana", "email": "ana@loja.com", "emporio_role": "vendedor", "establishment_ids": ["cl..."], "emporio_keys": ["perda", "contagem"] }`,
        response: `201
{ "data": { "id": "cl...", "temp_password": "Xy9k2Qmz" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/team/:userId",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Altera função, lojas ou chaves (os ausentes ficam como estão, salvo a regra da troca): virar vendedor zera as chaves, virar gerente geral limpa as lojas e as chaves; o que vier no mesmo pedido vale. O papel da conta acompanha. `emporio_only` é aceito e ignorado (Q190): gerente geral grava `true`, as outras funções `false`, e toda a equipe é só do Empório. O dono como alvo: 403. O gerente geral não altera nenhum ADMIN da conta (outro gerente geral inclusive): 403. Usuário de outra conta ou inexistente: 404. Usuário do Tibé (sem função no Empório): 409 `NOT_EMPORIO_TEAM`, porque a Equipe não dá função a ele (Q190). Desativado: 409 `INACTIVE` (reative antes). As mesmas recusas 422 do cadastro.",
        request: `{ "emporio_role": "gestor", "establishment_ids": ["cl..."] }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/emporio/team/:userId",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Tira a pessoa da equipe (Q190): DESATIVA o usuário e guarda função, chaves, `emporio_only` e lojas, para o Reativar devolver como estava. Ela não vira usuária do Tibé, e a sessão dela deixa de valer no request seguinte (401 na API, login no painel). Recusas: dono 403, gerente geral sobre qualquer ADMIN da conta 403, 404, usuário do Tibé 409 `NOT_EMPORIO_TEAM`, já desativado 409 `ALREADY_INACTIVE`.",
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/team/:userId/reactivate",
        auth: "Sessão · emporio:write · só o dono e o gerente geral",
        description: "Reativa quem foi tirado da equipe (Q190), com a função, as chaves e as lojas que tinha. Ocupa vaga no limite da equipe do Empório (50 ativos): cheia, 422 `SEAT_LIMIT_REACHED`. Recusas: dono 403, gerente geral sobre qualquer ADMIN da conta 403, 404, usuário do Tibé 409 `NOT_EMPORIO_TEAM`, já ativo 409 `ALREADY_ACTIVE`.",
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/customers",
        auth: "Sessão · emporio:write · dono, gerente geral, gestor, vendedor e caixa da loja · perfil emporio · recurso `emporio` liberado",
        description: "Cadastra o cliente do Empório, na tabela própria do Empório (o cliente não aparece em Contatos, e o contato da fazenda não aparece no Empório). Exige tipo (`person_kind`: `pf` ou `pj`), nome e telefone; na PJ, também o CNPJ e o endereço principal completo (CEP, rua, número, bairro, `city` e UF). Faltando, 422 no campo, com a frase do campo (\"Informe o telefone.\", \"Informe o CEP do endereço principal.\"). CPF e CNPJ, quando vêm, precisam ser válidos (o CNPJ alfanumérico entra em maiúscula). Documento repetido entre os clientes da conta: 409 `DUPLICATE_DOCUMENT` em `document`, com o nome de quem já tem (e \"desarquive em Clientes\" quando arquivado). O resto (inscrição estadual, nascimento da PF, responsável da PJ, endereço de entrega, `notes`) é opcional.",
        request: `{ "name": "Maria Souza", "person_kind": "pf", "phone": "34 99999-0000" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Maria Souza", "person_kind": "pf", "document": null, "phone": "34 99999-0000", "archived": false, "incomplete": false, "fixed": false }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor, vendedor e caixa da loja · perfil emporio · recurso `emporio` liberado",
        description: "A lista de clientes do Empório: o Consumidor final primeiro, depois por nome. Query: `q` (nome sem acento, CPF/CNPJ ou telefone, por pedaço; com só números, a busca começa em 3), `archived=1` (inclui os arquivados; sem ele, só os ativos), `page` e `per_page` (padrão 50, máximo 100). `meta` traz `total`, `page`, `per_page` e `poucos_digitos` (verdadeiro quando `q` tem só 1 ou 2 números: `data` vem vazio).",
        response: `200
{ "data": [{ "id": "cl...", "name": "Maria Souza", "person_kind": "pf", "document": null, "phone": "34 99999-0000", "incomplete": false, "fixed": false, "archived": false }], "meta": { "total": 1, "page": 1, "per_page": 50, "poucos_digitos": false } }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers/search",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor, vendedor e caixa da loja · perfil emporio · recurso `emporio` liberado",
        description: "A busca de cliente do balcão (a janela \"Escolher cliente\"). Query: `q` (nome sem acento, ou pedaço do CPF/CNPJ ou do telefone sem DDD e sem DDI; só números começam a buscar com 3, e com 1 ou 2 `data` vem vazio e `meta.poucos_digitos` é verdadeiro), `id` (ignora `q` e devolve 0 ou 1 cliente ativo, o Consumidor final inclusive, com `fixed` verdadeiro), `page` e `per_page` (padrão 20, máximo 50; valor inválido vira o padrão). Só clientes ativos; o Consumidor final fica fora da busca por texto. Ordem por nome. Cada item traz o cadastro inteiro (documento, telefone, endereço principal e de entrega, `system_key`, `incomplete`, `fixed`) e `ultima_compra`: a venda concluída mais recente do cliente nas lojas que o usuário enxerga (`em` e `valor`), ou `null` sem venda. `meta`: `total`, `page`, `per_page`, `poucos_digitos`.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Maria Souza", "person_kind": "pf", "document": "52998224725", "phone": "34 99876-1234", "address_zip": null, "address_street": null, "address_number": null, "address_complement": null, "address_district": null, "city": null, "address_state": null, "delivery_zip": null, "delivery_street": null, "delivery_number": null, "delivery_complement": null, "delivery_district": null, "delivery_city": null, "delivery_state": null, "system_key": null, "incomplete": false, "fixed": false, "ultima_compra": { "em": "2026-11-06T14:00:00.000Z", "valor": 80 } }], "meta": { "total": 1, "page": 1, "per_page": 20, "poucos_digitos": false } }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers/:id",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor, vendedor e caixa da loja · perfil emporio · recurso `emporio` liberado",
        description: "A ficha do cliente do Empório: o cadastro (os mesmos campos do POST, mais `archived`, `incomplete` e `fixed`, este verdadeiro no Consumidor final) e o histórico de compras das lojas que o usuário enxerga. `incomplete` é verdadeiro quando falta algo do que o tipo exige (o cliente antigo, só com nome, por exemplo). `resumo`: `total_comprado` (vendas concluídas, menos o devolvido), `ultima_compra_em` e `vendas_ativas`. `vendas` (até 100, a mais nova primeiro): número, data, loja, `situacao` (`ativa`, `cancelada`, `trocada` ou `devolvida`), total, formas de pagamento, vendedor e itens. `orcamentos` (até 50): número, data, loja, valor e `situacao` (`aberto`, `vencido` ou `faturado`). O arquivado mantém a ficha inteira. Inexistente ou de outra conta: 404 \"Cliente não encontrado.\".",
        response: `200
{ "data": { "id": "cl...", "name": "Maria Souza", "person_kind": "pf", "document": null, "phone": "34 99999-0000", "archived": false, "incomplete": false, "fixed": false, "resumo": { "total_comprado": 40, "ultima_compra_em": "2026-11-06T14:00:00.000Z", "vendas_ativas": 2 }, "vendas": [{ "id": "cl...", "numero": "000012", "sold_at": "2026-11-06T14:00:00.000Z", "loja": "Loja Centro", "situacao": "ativa", "total": 10, "formas": ["dinheiro"], "vendedor": "Ana", "itens": [{ "produto": "Sal", "apresentacao": "Quilo", "quantity": 1, "total": 10 }] }], "orcamentos": [{ "id": "cl...", "numero": "000003", "created_at": "2026-11-06T14:00:00.000Z", "loja": "Loja Centro", "valor": 20, "situacao": "aberto" }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers/:id/delivery-options",
        auth: "Sessão · emporio:read · quem vende na loja (Dono, Gerente geral, Gestor, Vendedor e Caixa) · perfil emporio · recurso `emporio` liberado",
        description: "Os endereços que o pedido para entrega pode usar com este cliente. `principal` (o endereço do cadastro) e `cadastro_entrega` (o endereço de entrega do cadastro; nulo quando não há nenhum dos sete campos) trazem `endereco`, `linha` (uma frase pronta) e `completo` (CEP, rua, número, bairro, cidade e UF preenchidos). `fixed` é verdadeiro no Consumidor final. `falta_no_cliente` é nulo quando o cliente serve para entrega; senão traz `code` e `message` (\"Para entrega, informe o CPF do cliente.\", a do Consumidor final, ou o cadastro incompleto). O arquivado é lido normalmente. Inexistente ou de outra conta: 404 \"Cliente não encontrado.\".",
        response: `200
{ "data": { "customer_id": "cl...", "fixed": false, "falta_no_cliente": null, "principal": { "endereco": { "zip": "38400000", "street": "Rua A", "number": "10", "complement": null, "district": "Centro", "city": "Uberlândia", "state": "MG" }, "linha": "Rua A, 10, Centro, Uberlândia/MG, CEP 38400-000", "completo": true }, "cadastro_entrega": null }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/customers/:id/archive",
        auth: "Sessão · emporio:write · dono, gerente geral e gestor da loja (vendedor e caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Arquiva (`{ \"archived\": true }`, o padrão) ou desarquiva o cliente do Empório. O arquivado sai das listas e das escolhas (venda para ele: 422 \"Escolha um cliente ativo.\"), mas a ficha e as vendas continuam. Recusas: Consumidor final 422 (\"O Consumidor final é fixo e não pode ser editado nem arquivado.\"), inexistente ou de outra conta 404. Grava `cliente.arquivar` ou `cliente.desarquivar` no Histórico.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "name": "Maria Souza", "archived": true, "incomplete": false, "fixed": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/customers/:id",
        auth: "Sessão · emporio:write · dono, gerente geral, gestor, vendedor e caixa da loja · perfil emporio · recurso `emporio` liberado",
        description: "Edita (e completa) o cadastro do cliente do Empório. Chave ausente mantém o que o cliente tem; `null` limpa. O resultado inteiro é conferido como no POST, então só se grava o cadastro completo para o tipo (422 no primeiro campo que falta, sem gravar nada). Trocar para PJ exige CNPJ e endereço; trocar para PF limpa o responsável. Recusa o Consumidor final (\"O Consumidor final é fixo e não pode ser editado nem arquivado.\") e o cliente arquivado (422); inexistente ou de outra conta: 404.",
        request: `{ "person_kind": "pf", "phone": "34 99999-0000" }`,
        response: `200
{ "data": { "id": "cl...", "name": "Cliente Antigo", "person_kind": "pf", "document": null, "phone": "34 99999-0000", "incomplete": false }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers/:id/credit",
        auth: "Sessão · emporio:read · quem vende na loja (Caixa incluído, que precisa ver o bloqueio no balcão), Gestor, Financeiro, Gerente geral e Dono; quem não passa em dinheiro só vê as lojas dele em owed_by_store e releases · perfil emporio · recurso `emporio` liberado",
        description: "A ficha de crédito do fiado do cliente. `status`: `em_dia`, `no_limite` ou `bloqueado_por_atraso`. `fiado_limit`, `fiado_due_days` e `fiado_due_day` são o que está gravado no cliente (`null` = vale o padrão da conta). `limit` é o limite que vale e `limit_source` de onde veio (`cliente`, `conta` ou `nenhum`). `due_rule` é a regra do prazo (`kind` `dias` com `source` `cliente` ou `conta`, ou `dia_do_mes` do cliente) e `suggested_due_date` o vencimento que uma venda em fiado teria hoje (AAAA-MM-DD). `owed_total` é o fiado em aberto, `overdue_total` o vencido, `available` o que ainda cabe no limite (`null` sem limite) e `oldest_overdue` o vencimento mais antigo e os dias de atraso (`null` sem atraso); \"vencido\" é o dia de São Paulo. `block_after_days` é o da conta. `last_charged_at` é a última cobrança registrada. Os totais e o bloqueio somam todas as lojas; Vendedor e Gestor veem `owed_by_store` e `releases` só das lojas deles. `releases`: as liberações pontuais, a mais nova primeiro. Inexistente ou de outra conta: 404.",
        response: `200
{ "data": { "customer_id": "cl...", "customer_name": "Zé da Silva", "phone": "34 99876-1234", "phone_whatsapp": "5534998761234", "fiado_limit": 1500, "fiado_due_days": 45, "fiado_due_day": null, "status": "bloqueado_por_atraso", "limit": 1500, "limit_source": "cliente", "due_rule": { "kind": "dias", "value": 45, "source": "cliente" }, "suggested_due_date": "2026-12-23", "block_after_days": 15, "owed_total": 320, "overdue_total": 320, "available": 1180, "oldest_overdue": { "due_date": "2026-10-19", "days": 20 }, "owed_by_store": [{ "establishment_id": "cl...", "establishment_name": "Loja Centro", "owed": 320, "overdue": 320 }], "releases": [{ "id": "cl...", "establishment_id": "cl...", "establishment_name": "Loja Centro", "released_by_name": "Ana", "reason": "Pagou metade hoje", "valid_until": "2026-11-09T02:59:59.999Z", "consumed_sale_id": null, "consumed_at": null, "created_at": "2026-11-08T14:00:00.000Z" }], "last_charged_at": null }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/customers/:id/credit",
        auth: "Sessão · emporio:write · só o Financeiro, o Gerente geral e o Dono (os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Define o limite e o prazo do fiado de um cliente. Chave ausente mantém; `null` limpa (volta ao padrão da conta). `fiado_limit`: de 0 a 99999999.99 (zero: o cliente não compra fiado). `fiado_due_days`: 1 a 365. `fiado_due_day`: dia fixo do mês, 1 a 31. Dias e dia fixo não valem juntos: mandar os dois, ou um quando o cliente já tem o outro, é 422 em `fiado_due_day`; para trocar, limpe um com `null` no mesmo corpo. Recusa 422 no campo; inexistente ou de outra conta: 404. Devolve a ficha de crédito, como o GET. Entra no Histórico como `fiado.limite` e `fiado.prazo`.",
        request: `{ "fiado_limit": 1500, "fiado_due_days": 45 }`,
        response: `200
{ "data": { "customer_id": "cl...", "customer_name": "Zé da Silva", "phone": "34 99876-1234", "phone_whatsapp": "5534998761234", "fiado_limit": 1500, "fiado_due_days": 45, "fiado_due_day": null, "status": "em_dia", "limit": 1500, "limit_source": "cliente", "due_rule": { "kind": "dias", "value": 45, "source": "cliente" }, "suggested_due_date": "2026-12-23", "block_after_days": 15, "owed_total": 0, "overdue_total": 0, "available": 1500, "oldest_overdue": null, "owed_by_store": [], "releases": [], "last_charged_at": null }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/customers/:id/credit/releases",
        auth: "Sessão · emporio:write · Gestor da loja, Gerente geral e Dono (os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "O Gestor libera UMA venda em fiado para o cliente bloqueado ou no limite, só na loja informada e só até o fim do dia de São Paulo. `establishment_id` (422 se faltar) e `reason` (3 a 300 caracteres, 422 em `reason`). Já existe liberação válida do cliente nessa loja: 409 `LIBERACAO_JA_EXISTE` em `establishment_id`. A liberação é consumida pela primeira venda em fiado que a usar (`POST /api/v1/emporio/sales`); a venda não é aberta por este endpoint. `operation_key` é aceita e ignorada. Entra no Histórico como `fiado.liberar`.",
        request: `{ "establishment_id": "cl...", "reason": "Pagou metade hoje" }`,
        response: `201
{ "data": { "id": "cl...", "customer_id": "cl...", "establishment_id": "cl...", "establishment_name": "Loja Centro", "released_by_name": "Ana", "reason": "Pagou metade hoje", "valid_until": "2026-11-09T02:59:59.999Z", "consumed_sale_id": null, "created_at": "2026-11-08T14:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/customers/:id/collections",
        auth: "Sessão · emporio:write · só o Financeiro, o Gerente geral e o Dono (os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Registra que o cliente foi cobrado pelo WhatsApp do aparelho. Não envia nada: só grava a cobrança no Histórico (`fiado.cobrar`), de onde sai o `last_charged_at`. `establishment_id` (opcional) restringe o vencido e os dias àquela loja (inexistente: 404); `message` (opcional, até 1000 caracteres) guarda o texto enviado. Cliente sem fiado vencido: 422 `SEM_FIADO_VENCIDO` em `customer_id`.",
        request: `{ "establishment_id": "cl...", "message": "Olá, Zé! Consta um fiado vencido." }`,
        response: `201
{ "data": { "charged_at": "2026-11-08T14:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/customers/:id/agreements",
        auth: "Sessão · emporio:read · quem vende na loja (Caixa incluído), Financeiro, Gerente geral e Dono · perfil emporio · recurso `emporio` liberado",
        description: "Os acordos de fiado do cliente, do mais novo ao mais antigo, com tudo calculado na leitura. `total` é o combinado e nunca muda; `open_total` é o que falta (a soma do aberto das parcelas, inclusive parcela extra de cheque devolvido); `status` é `ativo` ou `quitado`. `installments`: `number`, `due_date`, `amount`, `paid`, `open` e `status` (`paga`, `em_dia`, `vencida` ou `abatida`, a parcela zerada por devolução com abatimento no fiado). `origins`: as contas de fiado que entraram no acordo, com a venda de cada uma. Cliente inexistente ou de outra conta: 404.",
        response: `200
{ "data": [{ "id": "cl...", "customer_id": "cl...", "created_at": "2026-11-08T14:00:00.000Z", "created_by": "Marcos", "total": 600, "notes": "Acordo em duas parcelas", "installments": [{ "entry_id": "cl...", "number": 1, "due_date": "2026-11-08", "amount": 300, "paid": 300, "open": 0, "status": "paga" }, { "entry_id": "cl...", "number": 2, "due_date": "2026-12-08", "amount": 300, "paid": 0, "open": 300, "status": "em_dia" }], "origins": [{ "entry_id": "cl...", "sale_id": "cl...", "sold_at": "2026-10-27T15:00:00.000Z", "amount": 600 }], "open_total": 300, "status": "ativo" }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/customers/:id/agreements",
        auth: "Sessão · emporio:write · só o Financeiro e o Dono (ação `acordo`; o Gerente geral e os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Faz o acordo de fiado (Q230, Q233): as contas escolhidas em `entry_ids` viram um acordo, pago em parcelas sem juros. A soma das parcelas tem de ser igual ao aberto das contas escolhidas e nenhuma parcela vence antes de hoje (422 `installments`, código `PARCELAS_NAO_BATEM` ou `VALIDATION_ERROR`). Conta que não está mais em aberto, que é de outro cliente ou que já está em outro acordo: 422 `entry_ids`, código `ACORDO_SEM_ORIGEM`. `notes` opcional (até 500 caracteres). As contas de origem saem do fiado em aberto (a venda continua ligada ao acordo e não se cancela: 409 `VENDA_EM_ACORDO`) e cada parcela é cobrada, recebida e bloqueia o cliente por atraso como o fiado. Não há como desfazer o acordo. Entra no Histórico como `fiado.acordo`.",
        request: `{ "entry_ids": ["cl..."], "installments": [{ "due_date": "2026-11-08", "amount": 300 }, { "due_date": "2026-12-08", "amount": 300 }], "notes": "Acordo em duas parcelas" }`,
        response: `201
{ "data": { "id": "cl...", "customer_id": "cl...", "created_at": "2026-11-08T14:00:00.000Z", "created_by": "Marcos", "total": 600, "notes": "Acordo em duas parcelas", "installments": [{ "entry_id": "cl...", "number": 1, "due_date": "2026-11-08", "amount": 300, "paid": 0, "open": 300, "status": "em_dia" }, { "entry_id": "cl...", "number": 2, "due_date": "2026-12-08", "amount": 300, "paid": 0, "open": 300, "status": "em_dia" }], "origins": [{ "entry_id": "cl...", "sale_id": "cl...", "sold_at": "2026-10-27T15:00:00.000Z", "amount": 600 }], "open_total": 600, "status": "ativo" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/suppliers",
        auth: "Sessão · emporio:write · dono, gerente geral, gestor e vendedor com a chave `lancar_compra` (os outros: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Cadastra o fornecedor do Empório, na tabela própria (fora de Contatos). De fora (`kind` `externo`, o padrão): só `name` é obrigatório (422 `name` \"Informe o nome do fornecedor.\"); CPF e CNPJ, quando vêm, precisam ser válidos, e repetido entre os fornecedores da conta dá 409 `DUPLICATE_DOCUMENT`. De propriedade (`kind` `propriedade`): exige `property_id` (422 \"Escolha a propriedade.\"), o nome é o da propriedade (o do corpo é ignorado) e o resto do cadastro não vale. Propriedade de outra conta: 404 `property_id`; arquivada no Tibé: 422 `property_id`; que já é fornecedor: 409 `DUPLICATE_PROPERTY_SUPPLIER`. Grava `fornecedor.cadastrar` no Histórico.",
        request: `{ "name": "Casa Rural", "phone": "34 3333-0000" }`,
        response: `201
{ "data": { "id": "cl...", "kind": "externo", "property_id": null, "name": "Casa Rural", "document": null, "phone": "34 3333-0000", "archived": false }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/suppliers",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor e vendedor (o caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "A lista de fornecedores do Empório, por nome. Query: `q` (nome sem acento, CPF/CNPJ ou telefone, por pedaço; com só números, a busca começa em 3), `archived=1` (inclui os arquivados), `page` e `per_page` (padrão 50, máximo 100). `meta` traz `total`, `page`, `per_page` e `poucos_digitos` (verdadeiro quando `q` tem só 1 ou 2 números: `data` vem vazio).",
        response: `200
{ "data": [{ "id": "cl...", "kind": "externo", "name": "Casa Rural", "document": null, "phone": null, "archived": false }], "meta": { "total": 1, "page": 1, "per_page": 50, "poucos_digitos": false } }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/suppliers/search",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor e vendedor (o caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "A busca de fornecedor da Compra. Query: `q` (nome sem acento, ou pedaço do CPF/CNPJ ou do telefone sem DDD e sem DDI; só números começam a buscar com 3, e com 1 ou 2 `data` vem vazio e `meta.poucos_digitos` é verdadeiro), `id` (ignora `q` e devolve 0 ou 1 fornecedor ativo), `page` e `per_page` (padrão 20, máximo 50; valor inválido vira o padrão; `page` vai de 1 a 10000, fora disso vira 1). Só fornecedores ativos, por nome. Cada item traz `id`, `kind`, `property_id`, `name`, `person_kind`, `document`, `phone` e `ultima_compra`: a compra não cancelada mais recente do fornecedor nas lojas que o usuário enxerga (`em` é a data da compra; `valor` é a soma dos itens mais o frete), ou `null` sem compra. `meta`: `total`, `page`, `per_page`, `poucos_digitos`.",
        response: `200
{ "data": [{ "id": "cl...", "kind": "externo", "property_id": null, "name": "Agropecuária Central", "person_kind": "pj", "document": "11222333000181", "phone": "(34) 3222-0000", "ultima_compra": { "em": "2026-11-06T14:00:00.000Z", "valor": 220 } }], "meta": { "total": 1, "page": 1, "per_page": 20, "poucos_digitos": false } }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/suppliers/property-options",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor e vendedor (o caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "As propriedades ativas que ainda não são fornecedor (o seletor do cadastro de fornecedor de propriedade). A arquivada no Tibé e a que já é fornecedor não entram.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Fazenda Boa Vista" }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/suppliers/:id",
        auth: "Sessão · emporio:read · dono, gerente geral, gestor e vendedor (o caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "O cadastro do fornecedor do Empório. Inexistente ou de outra conta: 404 \"Fornecedor não encontrado.\".",
        response: `200
{ "data": { "id": "cl...", "kind": "externo", "property_id": null, "name": "Casa Rural", "person_kind": null, "document": null, "phone": null, "notes": null, "archived": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/suppliers/:id",
        auth: "Sessão · emporio:write · dono, gerente geral, gestor e vendedor com a chave `lancar_compra` · perfil emporio · recurso `emporio` liberado",
        description: "Edita o fornecedor. Chave ausente mantém; `null` limpa; o resultado é conferido como no POST. O de propriedade só muda `notes` (o resto é ignorado). Arquivado: 422 \"Esse fornecedor está arquivado: desarquive em Fornecedores antes de editar.\"; inexistente ou de outra conta: 404. Grava `fornecedor.editar` no Histórico.",
        request: `{ "phone": "34 3333-0000" }`,
        response: `200
{ "data": { "id": "cl...", "kind": "externo", "name": "Casa Rural", "phone": "34 3333-0000", "archived": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/suppliers/:id/archive",
        auth: "Sessão · emporio:write · dono, gerente geral e gestor da loja (vendedor e caixa: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Arquiva (`{ \"archived\": true }`, o padrão) ou desarquiva o fornecedor. O arquivado sai das listas e das escolhas (compra com ele: 422 `supplier_id`), mas as compras antigas continuam com o nome. Grava `fornecedor.arquivar` ou `fornecedor.desarquivar` no Histórico.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "name": "Casa Rural", "archived": true }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/history",
        auth: "Sessão · emporio:read · dono, gerente geral e gestor (vendedor e quem não tem função: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "O Histórico do Empório (Q134): toda escrita do Empório e da Equipe, do mais novo para o mais antigo, só de acréscimo. Dono e gerente geral veem tudo; o gestor, só as linhas das lojas dele (as sem loja ficam de fora). Filtros em query: `user_id`, `establishment_id`, `de` e `ate` (data e hora ISO, ou AAAA-MM-DD para o dia inteiro em Brasília), `action` (chave do catálogo, como `venda.criar`; desconhecida: 422 no campo), `cursor` e `limite` (padrão 50, máximo 200; mais que isso vira 200). Filtro inválido: 422 `VALIDATION_ERROR` no campo. Cada linha traz `action_label` (rótulo em português), `summary` (a frase), `changes` (`[{ campo, antes, depois }]` nas edições, senão nulo) e `link` (caminho do painel quando há tela para o alvo). `next_cursor` vem nulo na última página.",
        response: `200
{ "data": { "items": [{ "id": "cl...", "created_at": "2026-10-30T12:00:00.000Z", "user_id": "cl...", "user_name": "Ana", "establishment_id": "cl...", "establishment_name": "Loja Centro", "action": "preco.definir", "action_label": "Mudou um preço", "target_type": "produto", "target_id": "cl...", "summary": "Mudou o preço da Saca 10 kg na Loja Centro para R$ 12,00", "changes": [{ "campo": "Preço", "antes": "R$ 10,00", "depois": "R$ 12,00" }], "link": "/emporio/produtos/cl..." }], "next_cursor": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/production",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista as produções das lojas visíveis ao usuário, da mais recente. Filtros: `establishment_id` (loja fora do vínculo: 404), `emporio_product_id`, `status` (`ativa`, `cancelada`). Cada produção traz a cópia da composição usada, com a quantidade baixada de cada componente.",
        response: `200
{ "data": [{ "id": "cl...", "establishment_id": "cl...", "establishment_name": "Loja Centro", "product_name": "Ração", "produced_qty": 400, "unit_cost": 1.29, "estimated": false, "composition_snapshot": { "reference_qty": 100, "yield_pct": null, "items": [{ "name": "Milho", "quantity": 65, "consumed_qty": 260 }] }, "sealed": [], "status": "ativa" }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/production",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR",
        description: "Registra o produto feito na loja. `operation_key` é obrigatória e única na conta: repetir a chave devolve a produção gravada com 200 (primeira vez: 201). Baixa cada componente: `quantity × produced_qty ÷ reference_qty ÷ (yield_pct/100)`, em 3 casas (composição 65/29/6 para 100 kg, produzir 400 kg: baixa 260, 116 e 24). Numa transação grava um `producao_consumo` por componente, pelo custo médio dele na loja, e um `producao_entrada` do produto, com `unit_cost` = custo consumido ÷ `produced_qty`. `sealed` (só em produto que separa lacrado de avulso) entra lacrado e o resto avulso; lacrado acima do produzido: 422 `sealed`. Sem composição: 422 `COMPOSITION_REQUIRED`. Fracionado em `unidade`: 422 `produced_qty`. Componente sem saldo na loja (o avulso, se ele separa lacrado): 409 `INSUFFICIENT_STOCK` em `components`, dizendo qual falta, salvo estoque negativo liberado. Loja fora do vínculo: 404.",
        request: `{ "operation_key": "k-123", "establishment_id": "cl...", "emporio_product_id": "cl...", "produced_qty": 400, "sealed": [{ "presentation_id": "cl...", "packages": 10 }] }`,
        response: `201
{ "data": { "id": "cl...", "produced_qty": 400, "unit_cost": 1.29, "estimated": false, "sealed": [{ "presentation_id": "cl...", "name": "Saco 25 kg", "packages": 10 }], "status": "ativa" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/production/:id/cancel",
        auth: "Sessão · emporio:write · OWNER e ADMIN",
        description: "Cancela a produção: marca `canceled_at` em todas as movimentações dela (os componentes voltam e o produto sai), sem apagar nada. `reason` obrigatório (422 `reason`). Já cancelada: 409 `ALREADY_CANCELED`. Saldo do produto ficaria negativo: 409 `INSUFFICIENT_STOCK`, salvo estoque negativo liberado. OPERADOR: 403. Loja fora do vínculo: 404.",
        request: `{ "reason": "Lançada em duplicidade" }`,
        response: `200
{ "data": { "id": "cl...", "status": "cancelada", "canceled_reason": "Lançada em duplicidade" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/transfers",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista as transferências em que a origem OU o destino é visível ao usuário, da mais recente. Filtros: `establishment_id` (origem ou destino; loja fora do vínculo: 404) e `status` (`em_transito`, `aguardando_gestor`, `recebida`, `cancelada`). Cada transferência traz `resolution`, `resolution_reason`, `resolved_at`, `resolved_by_user_id` e os itens com `sent_qty`, `received_qty`, `loss_reason` e `unit_cost`.",
        response: `200
{ "data": [{ "id": "cl...", "origin_name": "Central", "destination_name": "Loja Centro", "status": "em_transito", "items": [{ "id": "cl...", "package_state": "lacrado", "sent_qty": 50, "received_qty": null, "unit_cost": 5.5 }] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/transfers",
        auth: "Sessão · emporio:write · Gestor da origem, Gerente geral ou Dono (senão 403 `FORBIDDEN`; origem fora do alcance: 404)",
        description: "Envia a transferência. `operation_key` é obrigatória e única na conta: repetir a chave devolve a gravada com 200 (primeira vez: 201). Item lacrado leva `presentation_id` e `packages`; avulso leva `quantity` na unidade-base; produto sem separação leva só `quantity`. Grava uma saída por item na origem pelo custo médio dela, e o saldo da origem cai na hora. Origem igual ao destino: 422 `destination_establishment_id`. Saldo insuficiente na origem (por estado), salvo estoque negativo liberado: 409 `INSUFFICIENT_STOCK` em `items`. Nunca gera lançamento financeiro.",
        request: `{ "operation_key": "k-123", "origin_establishment_id": "cl...", "destination_establishment_id": "cl...", "items": [{ "emporio_product_id": "cl...", "presentation_id": "cl...", "packages": 5 }, { "emporio_product_id": "cl...", "quantity": 3 }] }`,
        response: `201
{ "data": { "id": "cl...", "status": "em_transito", "items": [{ "sent_qty": 50, "unit_cost": 5.5 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/transfers/:id",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Uma transferência com os itens. Origem e destino fora do vínculo do usuário: 404.",
        response: `200
{ "data": { "id": "cl...", "status": "em_transito", "sent_at": "2026-10-28T09:00:00.000Z", "items": [] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/transfers/:id/receive",
        auth: "Sessão · emporio:write · qualquer pessoa com o destino no alcance (senão 404)",
        description: "Recebe a transferência: `items` cobre todos os itens, cada um com `item_id` e `received_qty` (`loss_reason` é opcional). Igual ao enviado: `recebida`, com uma entrada por item no destino e o custo da origem. Mais do que o enviado: 422 `items`. Menos: quem resolve (Gestor do destino, Gerente geral, Dono) manda `resolution` (`perda_no_caminho` ou `nao_enviada`) e `reason`, e resolve na hora (sem eles: 422 em `resolution` ou `reason`); quem não resolve deixa a transferência em `aguardando_gestor`, guarda o `received_qty` e NÃO entra nada no destino (200 com o status novo). Fora de trânsito: 409 `TRANSFER_NOT_IN_TRANSIT`.",
        request: `{ "items": [{ "item_id": "cl...", "received_qty": 48 }], "resolution": "perda_no_caminho", "reason": "Caixa amassada no caminho" }`,
        response: `200
{ "data": { "id": "cl...", "status": "recebida", "resolution": "perda_no_caminho", "items": [{ "sent_qty": 50, "received_qty": 48, "loss_reason": "outro" }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/transfers/:id/resolve",
        auth: "Sessão · emporio:write · Gestor do destino, Gerente geral ou Dono (senão 403 `FORBIDDEN`)",
        description: "Resolve a diferença de uma transferência `aguardando_gestor`. `operation_key`, `resolution` (`perda_no_caminho`: o que chegou entra no destino e a diferença é perda da origem; `nao_enviada`: o que chegou entra no destino e a diferença volta ao saldo da origem, como estorno ligado à transferência) e `reason` são obrigatórios (422 no campo). Grava `resolution`, `resolution_reason`, `resolved_at` e `resolved_by_user_id`, e o status vira `recebida`. Repetir a mesma resolução pela mesma pessoa devolve a gravada. Fora de `aguardando_gestor`: 409 `TRANSFER_NOT_AWAITING`.",
        request: `{ "operation_key": "k-456", "resolution": "nao_enviada", "reason": "Contei errado na saída" }`,
        response: `200
{ "data": { "id": "cl...", "status": "recebida", "resolution": "nao_enviada", "resolution_reason": "Contei errado na saída", "replayed": false }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/transfers/:id/cancel",
        auth: "Sessão · emporio:write · quem enviou, Gestor da origem, Gerente geral ou Dono (senão 403 `FORBIDDEN`)",
        description: "Cancela a transferência em trânsito com `reason` obrigatório (422 `reason`): marca as saídas como canceladas e a origem recupera o saldo. Nada é apagado. Fora de trânsito: 409 `TRANSFER_NOT_IN_TRANSIT`.",
        request: `{ "reason": "Enviado para a loja errada" }`,
        response: `200
{ "data": { "id": "cl...", "status": "cancelada", "canceled_reason": "Enviado para a loja errada" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/sales",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Lista as vendas das lojas visíveis ao usuário, da mais recente. Filtros: `establishment_id` (fora do vínculo: 404), `customer_id` (antes `contact_id`), `status` (`concluida`, `cancelada`), `origin` (`balcao`, `ecommerce`; outro valor: 422 `origin`), `de`, `ate`, `limit`. Cada venda traz `customer_id` e `customer_name` (o cliente do Empório, antes `contact_id` e `contact_name`), itens (com `returnable_qty`), pagamentos, devoluções, `paid_amount` e `open_amount` do lançamento, e `freight_amount`, `total_amount` (`net_amount` mais o frete), `origin`, `replaces` e `replaced_by` (`{ id, number }` ou nulo).",
        response: `200
{ "data": [{ "id": "cl...", "establishment_name": "Loja Centro", "net_amount": 200, "freight_amount": 0, "total_amount": 200, "origin": "balcao", "replaces": null, "replaced_by": null, "discount_amount": 0, "status": "concluida", "paid_amount": 120, "open_amount": 80, "items": [], "payments": [], "returns": [] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/sales",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo (desconto acima do limite: só OWNER e ADMIN)",
        description: "Registra a venda numa transação. `seller_user_id` (opcional) é quem vendeu: sem ele vale quem registra, exceto o Caixa, que recebe 422 `SELLER_REQUIRED` em `seller_user_id`; vendedor que não atende a loja (Caixa, de outra loja, desativado, de outra conta): 422 `INVALID_SELLER`. A venda devolve `seller_user_id`, `seller_name`, `sold_by_user_id` e `sold_by_name`. `operation_key` obrigatória e única na conta: repetir devolve a venda gravada com 200 (primeira vez: 201). Preço = o cadastrado na loja; sem ele `unit_price` é obrigatório (422 `items`). Abaixo do cadastrado é desconto, com o `max_discount_pct` da loja (vazio = 0%): acima do limite, OPERADOR recebe 403 `DISCOUNT_ABOVE_LIMIT` em `items` e OWNER/ADMIN passam, gravando quem autorizou. Venda a granel baixa do avulso e, se faltar, abre embalagens lacradas da menor para a maior (`abertura_lacrado` mais `abertura_avulso`). Apresentação fechada sem embalagem lacrada suficiente: 409 `INSUFFICIENT_STOCK` em `items`, sempre; a granel, salvo estoque negativo liberado. `payments`: dinheiro, PIX, fiado, `debito`, `credito_vista`, `credito_parcelado` e `cheque` (soma igual ao total, senão 422 `payments`). Cartão: exige a regra de taxa da loja para a forma (422 `payments` se não houver); o parcelado leva `installments` de 2 a 12; grava um pagamento do valor cheio sem movimento de caixa, a despesa \"Taxas de cartão\" e uma parcela a receber por vez (a 1ª em `sold_at` mais `days`, as outras a cada 30 dias), que entra no saldo da conta na data. Cheque: `check: { number, bank, good_for }` obrigatórios (422 `payments`); fica na carteira até depositar e compensar. `customer_id` (o cliente do Empório; antes `contact_id`) é obrigatório em toda venda (422 `customer_id`): quem não quer se identificar entra como o cliente fixo Consumidor final, que não toma fiado nem cheque (422 `customer_id`). O id de um contato da fazenda não serve (422 \"Escolha um cliente ativo.\"). Fiado exige cliente ativo e aparece uma vez; o cliente antigo só com nome toma fiado. O fiado sempre grava vencimento: o `due_date` informado, ou o sugerido pela regra do cliente (dias ou dia do mês) e, sem ela, pelo prazo padrão da conta. Cliente com fiado vencido há mais dias que o bloqueio da conta: 409 `FIADO_BLOQUEADO` em `payments`; fiado que passa do limite do cliente (ou da conta): 409 `LIMITE_EXCEDIDO` em `payments`, nomeando o que cabe. Os dois valem na conta inteira, em todas as lojas, e não gravam nada. Uma liberação do Gestor válida para o cliente nesta loja (`POST /api/v1/emporio/customers/:id/credit/releases`) dispensa as duas conferências e é consumida por esta venda; se outra venda a consumiu primeiro, 409 `FIADO_BLOQUEADO`. PIX vai para `bank_account_id` ou a conta PIX da loja; sem nenhuma, 422 `payments`. Gera um lançamento de receita Vendas do Empório: pago na hora se não houver fiado, senão pendente com o saldo do fiado. Toda venda cai num turno de caixa aberto, qualquer que seja o pagamento: `cash_register_id` (opcional) escolhe o caixa; sem ele vale o único aberto da loja, ou o que quem vende abriu. Nenhum aberto (ou o caixa pedido fechado): 409 `CASH_CLOSED` em `cash_register_id`; vários abertos e nenhum de quem vende: 422 `CASH_REGISTER_REQUIRED` em `cash_register_id`. O dinheiro entra no caixa do turno; o PIX vai à conta levando o turno. `quote_id` (opcional) fatura um orçamento: só na loja dele (outra loja: 422 `QUOTE_OTHER_STORE`; inexistente ou de outra conta: 404 `QUOTE_NOT_FOUND`; já faturado, inclusive por outro balcão ao mesmo tempo: 409 `QUOTE_ALREADY_INVOICED`, com o número da venda, tudo em `quote_id` e sem gravar nada). O vendedor da venda é o do orçamento (o Caixa não manda `seller_user_id`, e o que vier é ignorado). Nos itens cuja apresentação está no orçamento, dentro da validade no dia da venda em Brasília: a referência do desconto (o `suggested_price` da venda) é o menor entre o preço de hoje e o sugerido quando se orçou (sem preço hoje, o sugerido do orçamento; sem ele, o orçado), e o preço que vale (o cobrado sem `unit_price`) é o menor entre o orçado e o de hoje. O desconto da venda (`discount_amount`) mede contra a referência, então o do orçamento aparece na venda, e o limite da loja vale sobre o desconto total. Acima do limite passa quem é gestor da loja, ou o orçamento que já tinha autorização (`discount_authorized_by_user_id` herda quem autorizou), desde que nenhuma linha do orçamento fique abaixo do preço que vale e nenhuma de fora abaixo do preço da loja; senão, 403 `DISCOUNT_ABOVE_LIMIT`. Vencido, e no item fora do orçamento, a regra normal. A venda devolve `quote: { id, numero }` (nulo sem orçamento). Cancelar a venda devolve o orçamento a aberto, e a venda cancelada continua com o `quote`. Pedido para entrega (opcional): os mesmos campos e as mesmas recusas do POST de orçamento (`for_delivery`, `delivery_address_kind` e, só no `outro`, `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_district`, `delivery_city` e `delivery_state`; o Consumidor final marcado: 422 `customer_id`; PF sem CPF ou cadastro incompleto: 422 `DELIVERY_CUSTOMER_INCOMPLETE` em `customer_id`), checados antes dos itens e sem gravar nada na recusa. Ao faturar (`quote_id`), `for_delivery` ausente ou nulo herda do orçamento a marca e a escolha: no `outro`, também o endereço do orçamento; no `principal` e no `cadastro_entrega`, o endereço é copiado de novo do cadastro do cliente DA VENDA, naquele momento (se o cadastro deixou de servir para entrega, a recusa sai e o orçamento continua aberto). `for_delivery` presente, inclusive `false`, vale o corpo. A venda (e a lista de vendas, e o GET de uma venda) traz `for_delivery`, `delivery_address_kind` e `delivery_address` (`zip`, `street`, `number`, `complement`, `district`, `city`, `state`; nulo na retirada). O resumo no Histórico termina com \", para entrega\". `freight_amount` (opcional, de 0 para cima; negativo: 422 `freight_amount`) é o frete cobrado do cliente: o faturamento segue sendo os itens (`net_amount`), mas o cliente paga `total_amount` (itens mais frete), a soma dos `payments` tem de fechar com ele (senão 422 `payments`) e a receita Vendas do Empório vale esse total. Com frete, nasce a conta a pagar \"Frete de entrega\" (pendente, vencendo em `sold_at`); cancelar a venda cancela a conta se ainda não foi paga (em aprovação: 409 `CONTA_EM_APROVACAO`), e a paga fica. `origin` (opcional, `balcao` por padrão, ou `ecommerce`; outro valor: 422 `origin`) diz de onde veio o pedido.",
        request: `{ "operation_key": "k-123", "establishment_id": "cl...", "cash_register_id": "cl...", "seller_user_id": "cl...", "quote_id": null, "freight_amount": 0, "origin": "balcao", "customer_id": "cl...", "items": [{ "emporio_product_id": "cl...", "presentation_id": "cl...", "quantity": 1, "unit_price": 12.5 }], "payments": [{ "kind": "dinheiro", "amount": 5 }, { "kind": "fiado", "amount": 7.5, "due_date": "2026-11-30" }] }`,
        response: `201
{ "data": { "id": "cl...", "net_amount": 12.5, "status": "concluida", "entry_id": "cl...", "paid_amount": 5, "open_amount": 7.5 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/sales/:id",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Uma venda com itens, pagamentos e devoluções. Loja fora do vínculo: 404.",
        response: `200
{ "data": { "id": "cl...", "status": "concluida", "items": [], "payments": [], "returns": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/sales/:id/receipt",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Os dados do papel da venda (A4 e bobina), já formatados: `numero` com 6 dígitos, loja com CNPJ e endereço numa linha (`null` no que não foi preenchido), cliente (`null` para Consumidor final), itens com a quantidade em pt-BR, pagamentos, rodapé e largura da bobina; `frete` (0 sem frete), `total` (itens mais frete) e `origem` (`balcao` ou `ecommerce`). Loja fora do vínculo: 404.",
        response: `200
{ "data": { "numero": "000001", "cancelada": false, "loja": { "nome": "Loja Centro", "documento": null, "endereco": null, "telefone": null, "whatsapp": null }, "cliente": null, "itens": [{ "produto": "Sal grosso (Quilo)", "quantidade": "2", "preco": 10, "total": 20 }], "frete": 0, "total": 20, "origem": "balcao", "largura_bobina": 80 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/sales/:id/packing-list",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "Os dados do romaneio da venda (A4 e bobina), sem nenhum valor em dinheiro: `situacao` (`ativa`, `cancelada`, `trocada` ou `devolvida`), cliente (`Consumidor final` quando não há), `pedido_para_entrega` e `endereco_de_entrega` (uma linha, só na entrega), itens com `produto`, `apresentacao` e `quantidade` em pt-BR, `linhas`, `observacoes`, vendedor e caixa. Loja fora do vínculo: 404.",
        response: `200
{ "data": { "numero": "000001", "situacao": "ativa", "pedido_para_entrega": true, "endereco_de_entrega": "Rua B, 20, Bairro Novo, Uberlândia/MG, CEP 38400-200", "cliente": { "nome": "Maria", "telefone": "34 99999-0000", "documento": "529.982.247-25" }, "itens": [{ "produto": "Sal grosso", "apresentacao": "Quilo", "quantidade": "2" }], "linhas": 1, "largura_bobina": 80 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/sales/:id/cancel",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Cancela a venda inteira: `reason` obrigatório (422 `reason`). Marca as `venda` do estoque como canceladas (as aberturas de saca ficam), cancela o lançamento e, para cada pagamento recebido, grava uma saída de caixa no mesmo lugar em que entrou (cartão e cheque não geram saída de gaveta). Cartão: as parcelas futuras são canceladas, cada parcela que já caiu vira uma saída `estorno_cartao` da conta e a despesa \"Taxas de cartão\" é cancelada. Cheque `recebido` vira `devolvido_ao_cliente`; `depositado` ou `compensado`: 409 `SALE_HAS_DEPOSITED_CHECK`. Já cancelada: 409 `SALE_CANCELED`. Com devolução: 409 `SALE_HAS_RETURNS`. A saída do dinheiro que entrou na gaveta cai no turno aberto agora (não necessariamente no caixa de origem): `cash_register_id` opcional, com as recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED` da venda; venda sem dinheiro na gaveta não precisa de turno. Venda que faturou um orçamento: o orçamento volta a aberto e pode ser faturado de novo. Venda cujo fiado entrou num acordo: 409 `VENDA_EM_ACORDO` (desde 08/11/2026; não há como desfazer o acordo).",
        request: `{ "reason": "Venda lançada em duplicidade" }`,
        response: `200
{ "data": { "id": "cl...", "status": "cancelada", "canceled_reason": "Venda lançada em duplicidade" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/sales/:id/return",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo",
        description: "Devolução parcial. `operation_key` obrigatória (repetir devolve a gravada com 200). `refund_kind`: `dinheiro` (despesa paga mais saída da gaveta) ou `abater_fiado` (reduz o lançamento da venda, que precisa ter saldo em aberto: 422 `amount`). Cada item traz `sale_item_id` e `quantity` até o vendido menos o devolvido (422 `items`); `loss_reason` marca avariado e grava também a perda. A mercadoria volta pelo custo da venda. Venda cancelada: 409 `SALE_CANCELED`. Em dinheiro, a saída cai num turno aberto da loja: `cash_register_id` opcional, com as recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED` da venda.",
        request: `{ "operation_key": "k-9", "refund_kind": "dinheiro", "items": [{ "sale_item_id": "cl...", "quantity": 1, "loss_reason": "avaria" }], "reason": "Saco furado" }`,
        response: `201
{ "data": { "id": "cl...", "sale_id": "cl...", "refund_kind": "dinheiro", "amount": 12.5, "items": [] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/sales/:id/exchange",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo",
        description: "Troca: uma devolução (`items_devolvidos`) mais uma venda nova (`venda`, no formato do POST de venda, inclusive `customer_id` obrigatório: 422 `customer_id` sem ele, e o Consumidor final não toma fiado nem cheque; `establishment_id` e `operation_key` são opcionais e assumem a loja da venda e `<operation_key>:venda`), numa transação. O valor devolvido paga a venda nova como pagamento `troca`, sem caixa; `venda.payments` cobre só o que sobra (422 `payments`). Se o devolvido passa da venda nova, a diferença sai da gaveta em dinheiro. A venda nova e a diferença caem num turno aberto: `cash_register_id` opcional (no topo ou em `venda`), com as recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED` da venda. A venda nova nasce sempre como retirada (`for_delivery: false`): os campos de pedido para entrega de `venda` são ignorados.",
        request: `{ "operation_key": "k-10", "items_devolvidos": [{ "sale_item_id": "cl...", "quantity": 1 }], "venda": { "items": [{ "emporio_product_id": "cl...", "presentation_id": "cl...", "quantity": 1 }], "payments": [{ "kind": "dinheiro", "amount": 3 }] } }`,
        response: `201
{ "data": { "devolucao": { "id": "cl...", "refund_kind": "troca", "amount": 12.5 }, "venda": { "id": "cl...", "exchange_return_id": "cl..." } }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/sales/:id/delivery",
        auth: "Sessão · emporio:write · quem fatura (Dono, Gerente geral, Gestor e Caixa nas lojas dele; o Vendedor não)",
        description: "Muda o pedido para entrega de uma venda fechada: só as nove colunas (`for_delivery`, `delivery_address_kind` e a cópia `delivery_*`) e uma linha `venda.pedido_para_entrega` no Histórico; estoque, caixa e financeiro não mudam, e o cliente da venda também não. `for_delivery` obrigatório (422 `for_delivery`); `true` pede `delivery_address_kind` (`principal`, `cadastro_entrega` ou `outro`, este com os campos `delivery_*`), com as recusas da venda (422 em `customer_id`, `delivery_address_kind` ou no campo `delivery_*`). O mesmo valor de hoje devolve a venda sem gravar nem registrar. A leitura é a de `GET /sales/:id`: venda de outra loja, de outra conta ou, para o Caixa, que não é de hoje: 404. Vendedor: 403. Venda cancelada ou trocada: 422 sem campo (a da troca muda na venda nova).",
        request: `{ "for_delivery": true, "delivery_address_kind": "outro", "delivery_zip": "38400-200", "delivery_street": "Rua B", "delivery_number": "20", "delivery_district": "Bairro Novo", "delivery_city": "Uberlândia", "delivery_state": "MG" }`,
        response: `200
{ "data": { "id": "cl...", "for_delivery": true, "delivery_address_kind": "outro", "delivery_address": { "zip": "38400200", "street": "Rua B", "number": "20", "complement": null, "district": "Bairro Novo", "city": "Uberlândia", "state": "MG" } }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/quotes",
        auth: "Sessão · emporio:write · quem vende na loja (Dono, Gerente geral, Gestor, Vendedor e Caixa nas lojas dele)",
        description: "Salva um orçamento (entrega 4). Não mexe em estoque, caixa nem financeiro. `operation_key` obrigatória e única na conta: repetir devolve o orçamento gravado com 200 (primeira vez: 201). `customer_id` (o cliente do Empório; antes `contact_id`) obrigatório: sem ele, 422 `QUOTE_CUSTOMER_REQUIRED` em `customer_id` (\"Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.\"). O Consumidor final serve. Os outros clientes precisam do cadastro completo para o tipo (PF: tipo, nome e telefone, sem exigir documento; PJ: mais CNPJ e endereço principal), senão 422 `QUOTE_CUSTOMER_INCOMPLETE` em `customer_id`, com a falta na frase (\"Complete o cadastro do cliente antes de salvar o orçamento. Informe o telefone.\"). Vendedor, preço e desconto seguem a regra da venda: o Caixa precisa de `seller_user_id` (422 `SELLER_REQUIRED`; vendedor que não atende a loja, 422 `INVALID_SELLER`); preço = o cadastrado na loja, sem ele `unit_price` é obrigatório (422 `items`); desconto acima do `max_discount_pct` da loja só pelo gestor da loja (senão 403 `DISCOUNT_ABOVE_LIMIT` em `items`). Número próprio por conta (`numero` com 6 dígitos, separado do da venda). `valid_until` (AAAA-MM-DD) = hoje em Brasília mais `quote_validity_days` das configurações (7 sem configuração); vale até o fim desse dia. A resposta é a mesma do GET. Pedido para entrega (opcional): `for_delivery` (booleano; ausente ou `false` é retirada, e os outros campos são ignorados), `delivery_address_kind` (`principal`, `cadastro_entrega` ou `outro`) e, só no `outro`, `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_district`, `delivery_city` e `delivery_state`. Marcado, o cliente precisa ser de verdade (o Consumidor final: 422 `customer_id`), PF com CPF e cadastro completo (422 `DELIVERY_CUSTOMER_INCOMPLETE` em `customer_id`), e o endereço escolhido completo (CEP, rua, número, bairro, cidade e UF): sem escolha ou escolha inválida, 422 `delivery_address_kind` (\"Escolha o endereço de entrega.\"); `principal` ou `cadastro_entrega` ausente ou incompleto, 422 `delivery_address_kind`; `outro` incompleto, 422 no campo `delivery_*` que falta. O endereço é COPIADO para o orçamento (o cadastro do cliente nunca muda, e editá-lo depois não altera a cópia). A resposta e o GET trazem `for_delivery`, `delivery_address_kind` e `delivery_address` (`zip`, `street`, `number`, `complement`, `district`, `city`, `state`; nulo na retirada). O resumo no Histórico termina com \", para entrega\".",
        request: `{ "operation_key": "k-q1", "establishment_id": "cl...", "customer_id": "cl...", "seller_user_id": "cl...", "items": [{ "emporio_product_id": "cl...", "presentation_id": "cl...", "quantity": 2, "unit_price": 19 }], "notes": "Entregar na sexta", "for_delivery": true, "delivery_address_kind": "principal" }`,
        response: `201
{ "data": { "id": "cl...", "number": 1, "numero": "000001", "situacao": "aberto", "valid_until": "2026-11-12", "net_amount": 38, "discount_amount": 2, "sale": null, "vendas": [], "for_delivery": true, "delivery_address_kind": "principal", "delivery_address": { "zip": "38400000", "street": "Rua A", "number": "10", "complement": null, "district": "Centro", "city": "Uberlândia", "state": "MG" }, "items": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/quotes",
        auth: "Sessão · emporio:read · Vendedor para cima (Dono, Gerente geral, Gestor, Vendedor); o Caixa recebe 403",
        description: "A lista de orçamentos das lojas que o usuário vê, do mais novo para o mais antigo. Filtros: `establishment_id` (loja fora do vínculo: 404), `situacao` (`acompanhamento`, o padrão, traz aberto e vencido; `aberto`, `vencido`, `faturado`, `todos`; outro valor: 422 em `situacao`), `limit` (padrão 200, máximo 500) e `q`. A busca `q`: só dígitos (1 a 6) também casa o número do orçamento (`12` acha `000012`); 3 ou mais dígitos casam o telefone e o documento do cliente só pelos dígitos, com ou sem máscara; texto casa o nome do cliente sem acento nem caixa. Cada linha: `id`, `number`, `numero`, `loja`, `cliente`, `telefone`, `valor`, `criado_em`, `valid_until`, `situacao`, `venda_numero` (a venda ativa que faturou) e `vendedor`.",
        response: `200
{ "data": [{ "id": "cl...", "number": 12, "numero": "000012", "loja": "Loja 1", "cliente": "João Mendes", "telefone": "(34) 99999-0000", "valor": 40, "criado_em": "2026-11-05T14:00:00.000Z", "valid_until": "2026-11-12", "situacao": "aberto", "venda_numero": null, "vendedor": "Ana" }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/quotes/lookup",
        auth: "Sessão · emporio:read · quem vende na loja (Caixa incluído, nas lojas dele) e o Financeiro (todas as lojas, só leitura)",
        description: "Acha o orçamento pelo número impresso, na loja informada: `establishment_id` e `number` (aceita `12` ou `000012`) são obrigatórios (422 no campo que faltar ou vier fora do formato). Devolve a mesma visão de `GET /api/v1/emporio/quotes/:id`. Número que não existe, ou que é de outra loja ou conta: 404 `QUOTE_NOT_FOUND` em `number`. Loja fora do vínculo: 404 em `establishment_id`.",
        response: `200
{ "data": { "id": "cl...", "numero": "000012", "situacao": "aberto", "items": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/quotes/:id",
        auth: "Sessão · emporio:read · quem vende na loja do orçamento (Caixa incluído), e o Financeiro, que lê o de qualquer loja (só leitura)",
        description: "Um orçamento: loja, cliente (`id`, `name`, `phone`, `document`), vendedor e quem salvou, `valid_until`, `situacao` derivada (`faturado` com venda ativa; senão `vencido` depois de `valid_until` em Brasília; senão `aberto`), `sale` (a venda ativa que o faturou) e `vendas` (todas as que saíram dele). Cada item traz `preco_orcado`, `preco_hoje` (nulo sem preço na loja), `preco_que_vale` (dentro da validade, o menor entre o orçado e o de hoje; vencido, o de hoje), `preco_de_referencia` (a referência do desconto ao faturar hoje: dentro da validade, o menor entre o de hoje e o `preco_sugerido`; vencido, o de hoje), `mudou`, `saldo_base` (o saldo da loja na unidade-base) e `falta`. De outra conta ou de loja fora do vínculo: 404.",
        response: `200
{ "data": { "id": "cl...", "numero": "000001", "situacao": "aberto", "customer": { "id": "cl...", "name": "Seu Zé", "phone": "11999990000", "document": "39053344705" }, "items": [{ "produto": "Sal grosso", "apresentacao": "Quilo", "quantity": 2, "preco_orcado": 19, "preco_sugerido": 20, "preco_hoje": 20, "preco_que_vale": 19, "preco_de_referencia": 20, "mudou": false, "saldo_base": 100, "falta": false, "total": 38 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/receivables",
        auth: "Sessão · emporio:read · perfil emporio · recurso `emporio` liberado",
        description: "O fiado em aberto, por cliente: `owed`, `oldest_due_date`, `overdue_amount` e os lançamentos com o saldo de cada um. O saldo é o valor menos a soma dos pagamentos. Filtros: `establishment_id`, `customer_id` (antes `contact_id`). Cada cliente vem com `customer_id` e `customer_name` (antes `contact_id` e `contact_name`).",
        response: `200
{ "data": [{ "customer_id": "cl...", "customer_name": "Seu Zé", "owed": 80, "oldest_due_date": "2026-11-30T03:00:00.000Z", "overdue_amount": 0, "entries": [{ "entry_id": "cl...", "open": 80 }] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/receivables/receive",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo",
        description: "Recebe fiado sem criar venda. `operation_key` obrigatória (repetir devolve o recebimento gravado com 200). `kind`: `dinheiro` (entra na gaveta da loja) ou `pix` (conta PIX da loja, ou `bank_account_id`). Com `entry_id` paga aquele lançamento; sem ele distribui da VENDA mais antiga para a mais nova. Valor acima do devido: 422 `amount`. Em dinheiro, exige um turno aberto (`cash_register_id` opcional, recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED` como na venda); em PIX, leva o turno quando houver um.",
        request: `{ "operation_key": "k-11", "customer_id": "cl...", "establishment_id": "cl...", "amount": 50, "kind": "dinheiro" }`,
        response: `201
{ "data": { "amount": 50, "kind": "dinheiro", "parts": [{ "entry_id": "cl...", "amount": 50 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/variable-expense-rules",
        auth: "Sessão · emporio:read · só OWNER e ADMIN (403 `FORBIDDEN`); com vínculo, só as lojas dele",
        description: "Regras do \"Vendeu, Pagou\" (F4a, Q97). Filtros: `establishment_id`, `incluir_arquivados=1`. Cada venda copia a regra que casou: mudar a regra não mexe nas vendas passadas.",
        response: `200
{ "data": [{ "id": "cl...", "establishment_id": "cl...", "name": "Comissão", "kind": "percentual", "value": 5, "payment_kind": null, "emporio_product_id": null, "presentation_id": null, "packaging_emporio_product_id": null, "archived_at": null }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/variable-expense-rules",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Cria a regra da loja. `kind`: `percentual` (value de 0 a 100, sobre o total dos itens que casam; com `payment_kind`, só a parte paga naquela forma), `fixo_por_venda` (R$ uma vez por venda), `por_unidade` (R$ por unidade vendida) ou `embalagem` (quantidade na unidade-base do produto de `packaging_emporio_product_id`, obrigatório e só aqui, baixada do estoque pelo custo médio; nunca bloqueia a venda). `emporio_product_id` e `presentation_id` filtram os itens. Percentual, fixo e por unidade geram uma conta a pagar por venda (categoria = nome da regra) com vencimento no último dia do mês da venda. Recusas: 422 `name` (vazio ou nome de lançamento reservado), `kind`, `value`, `payment_kind`, `emporio_product_id`, `presentation_id`, `packaging_emporio_product_id`.",
        request: `{ "establishment_id": "cl...", "name": "Comissão", "kind": "percentual", "value": 5, "payment_kind": "pix" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Comissão", "kind": "percentual", "value": 5, "payment_kind": "pix" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/variable-expense-rules/:id",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Edita a regra ou a arquiva (`archived: true`; `false` reativa). Mesmas recusas do cadastro.",
        request: `{ "value": 6 }`,
        response: `200
{ "data": { "id": "cl...", "value": 6, "archived_at": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/fixed-expenses",
        auth: "Sessão · emporio:read · Gestor da loja, Financeiro, Gerente geral e Dono (os outros papéis: 403); com vínculo, só as despesas que têm loja dele",
        description: "Despesas fixas mensais (F4a, Q100) com o rateio, `generated_until` (último mês com conta gerada), `months_ahead` e `needs_renewal` (verdadeiro quando faltam menos de 3 meses gerados). `incluir_encerradas=1` traz as encerradas.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Aluguel", "category": "Aluguel", "amount": 3000, "due_day": 10, "split_kind": "percentual", "starts_on": "2026-11-01", "ended_at": null, "splits": [{ "establishment_id": "cl...", "establishment_name": "Loja Centro", "value": 60 }, { "establishment_id": "cl...", "establishment_name": "Loja Norte", "value": 40 }], "generated_until": "2027-10", "months_ahead": 12, "needs_renewal": false }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/fixed-expenses",
        auth: "Sessão · emporio:write · Gestor da loja, Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Cria o modelo e gera 12 meses a partir de `starts_on` (padrão: o mês atual): uma conta a pagar pendente por loja e mês, no `due_day` (no mês curto, o último dia). `split_kind` `percentual` fecha 100 e `valor` fecha o `amount` (422 `splits`); no percentual o centavo que sobra vai na primeira loja. Outras recusas: 422 `name`, `amount`, `due_day`, `split_kind`. `category` omitida usa o nome. Desde 08/11/2026 (entrega 4, Q236, Q240): `split_kind` tem cinco valores, `percentual`, `valor` e os automáticos `faturamento` (faturamento líquido do mês anterior de cada loja), `area` (`area_m2`) e `funcionarios` (`employees_count`). Nos automáticos `splits` é opcional (dispensado), a divisão é entre TODAS as lojas ativas e é calculada quando a ocorrência do mês nasce: só a do mês corrente nasce no ato (`months_ahead` 1), e a do mês seguinte nasce no primeiro acesso do Empório naquele mês. Loja sem base recebe zero, e se nenhuma tem base a divisão é em partes iguais; os dois casos vêm em `avisos`, e `base_label` diz a base usada. Quem não vê todas as lojas (vínculo a uma loja) e pede um automático: 403 `CRITERIO_SEM_LOJAS` em `split_kind`.",
        request: `{ "name": "Energia elétrica", "amount": 1380, "due_day": 15, "split_kind": "faturamento", "starts_on": "2026-11-01" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Energia elétrica", "amount": 1380, "split_kind": "faturamento", "base_label": "Faturamento de outubro/2026", "avisos": [], "months_ahead": 1, "needs_renewal": false }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/fixed-expenses/:id",
        auth: "Sessão · emporio:write · Gestor da loja, Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Edita o modelo. As contas dos meses do atual em diante que não têm pagamento são refeitas (valor e vencimento; a loja que saiu do rateio é cancelada; a loja nova ganha as contas); as pagas e as de meses passados ficam. Despesa encerrada: 409 `EXPENSE_ENDED`. Mudar `amount` ou `split_kind` exige mandar `splits` coerentes (422 `splits`), salvo para um critério automático (`faturamento`, `area`, `funcionarios`), que não leva `splits`: editar recalcula só as contas futuras sem pagamento, com a base de agora, e trocar de critério vale também para as que já existem. Critério automático por quem não vê todas as lojas: 403 `CRITERIO_SEM_LOJAS`. Em modelo automático `renew` não faz nada (`created` 0): a ocorrência seguinte nasce no acesso.",
        request: `{ "amount": 3200, "splits": [{ "establishment_id": "cl...", "value": 50 }, { "establishment_id": "cl...", "value": 50 }] }`,
        response: `200
{ "data": { "id": "cl...", "amount": 3200 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/fixed-expenses/:id/end",
        auth: "Sessão · emporio:write · Gestor da loja, Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Encerra a despesa (`ended_at`) e cancela as contas de meses depois do atual que não têm pagamento. Já encerrada: 409 `EXPENSE_ENDED`.",
        response: `200
{ "data": { "id": "cl...", "ended_at": "2026-11-05T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/fixed-expenses/:id/renew",
        auth: "Sessão · emporio:write · Gestor da loja, Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Estende as contas até 12 meses a partir do mês atual, sem duplicar (único por modelo, loja e mês). Nada é gerado sozinho: a tela oferece o botão quando faltam menos de 3 meses. `created` diz quantas contas nasceram. Encerrada: 409 `EXPENSE_ENDED`.",
        response: `200
{ "data": { "id": "cl...", "months_ahead": 12, "created": 4 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/payables",
        auth: "Sessão · emporio:read · só OWNER e ADMIN; com vínculo, só as lojas dele",
        description: "Contas a pagar do \"Vendeu, Pagou\" (`origin` `vendeu_pagou`), das despesas fixas (`despesa_fixa`) e das compras a prazo ou parceladas (`compra`, desde 07/11/2026: traz `purchase_id` e `supplier_name`, e `can_correct` é sempre falso), por vencimento. Filtros: `establishment_id`, `status` (`pending` por padrão, `paid`, `cancelled`, `all`), `de` e `ate` (vencimento), `limit`. `can_correct` diz se ainda dá para corrigir o valor.",
        response: `200
{ "data": [{ "entry_id": "cl...", "origin": "vendeu_pagou", "name": "Comissão", "establishment_id": "cl...", "amount": 5, "paid_amount": 0, "open_amount": 5, "due_date": "2026-11-30", "status": "pending", "sale_id": "cl...", "can_correct": true }], "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/payables/:id",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Corrige o valor real de uma conta pendente sem pagamento (o `amount` da despesa da venda acompanha). Conta já paga: 409 `ENTRY_PAID` em `amount`; valor inválido: 422 `amount`; conta que não é do Empório: 404.",
        request: `{ "amount": 4.5 }`,
        response: `200
{ "data": { "entry_id": "cl...", "amount": 4.5, "can_correct": true }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/payables/:id/due-date",
        auth: "Sessão · emporio:write · Financeiro, Gerente geral e Dono (o Gestor da loja recebe 403)",
        description: "Adia o vencimento de uma conta pendente (`due_date`, AAAA-MM-DD). Conta que não está pendente: 422 `NOT_PENDING` em `due_date`; data inválida: 422 `due_date`; conta que não é do Empório: 404.",
        request: `{ "due_date": "2026-12-10" }`,
        response: `200
{ "data": { "entry_id": "cl...", "origin": "compra", "due_date": "2026-12-10", "status": "pending" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/payables/:id/cancel",
        auth: "Sessão · emporio:write · Financeiro, Gerente geral e Dono (o Gestor da loja recebe 403)",
        description: "Cancela uma conta sem pagamento, com `reason` (422 `reason` se vazio). Conta com pagamento registrado: 422 `ENTRY_HAS_PAYMENTS`; já cancelada: 409 `ENTRY_CANCELED`; conta que não é do Empório: 404. Nada é apagado.",
        request: `{ "reason": "Compra lançada em duplicidade" }`,
        response: `200
{ "data": { "entry_id": "cl...", "origin": "compra", "status": "cancelled" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/today",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "A tela \"Hoje\" do dinheiro, de todas as lojas (filtro `establishment_id` opcional). `positions`: saldo por gaveta, gerência e conta, com `total_balance`; `payables_due`: contas a pagar vencidas ou que vencem hoje (`count`, `total`, `items`); `receivables_due`: fiado, cheques e cartões que vencem hoje (`count` e `total` de cada); `overdue_fiado`: clientes com fiado vencido e o total; `pending_approvals` (desde 08/11/2026): pedidos de pagamento esperando aprovação (`count`, `total`); `unreconciled`: linhas de conta (movimentos e parcelas de cartão já devidas) sem carimbo nos últimos 30 dias (`count`, `total`). Tudo calculado na leitura.",
        response: `200
{ "data": { "positions": [{ "kind": "conta", "id": "cl...", "name": "Conta principal", "establishment_id": null, "balance": 5000 }], "total_balance": 5000, "payables_due": { "count": 1, "total": 220, "items": [] }, "receivables_due": { "fiado": { "count": 1, "total": 80 }, "checks": { "count": 0, "total": 0 }, "cards": { "count": 1, "total": 95.5 } }, "overdue_fiado": { "customers": 1, "total": 80 }, "pending_approvals": { "count": 1, "total": 4911.55 }, "unreconciled": { "count": 3, "total": 740.5 } }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/receivables",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Tudo o que está a receber, de todas as lojas (filtro `establishment_id` opcional): `fiado` por cliente, `checks` em carteira e `cards` (parcelas de cartão não canceladas com `expected_on` de hoje em diante; `received` só é verdadeiro para as de hoje).",
        response: `200
{ "data": { "fiado": [], "checks": [], "cards": [{ "id": "cl...", "sale_id": "cl...", "establishment_id": "cl...", "establishment_name": "Loja Centro", "bank_account_id": "cl...", "bank_account_name": "Conta principal", "installment": 1, "installments": 2, "gross_amount": 100, "net_amount": 97.5, "expected_on": "2026-11-08", "received": false }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/collections",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "A lista de cobrança do fiado vencido, do cliente mais atrasado ao menos. Query: `establishment_id` (opcional; fora do alcance: 404) e `faixa` (`1-15`, `16-30`, `31-60` ou `60+`, pelos dias do vencido mais antigo do cliente; outra: 422 em `faixa`). `message_template` é o modelo que vale (o da conta ou o padrão). Cada cliente traz o `overdue_total`, os `oldest_days`, o vencido por loja em `stores`, o `message` já preenchido e `whatsapp_url` (`https://wa.me/...` com o texto; `null` quando o cadastro não tem um telefone que sirva, e `phone_whatsapp` também). `last_charged_at` vem do `POST /api/v1/emporio/customers/:id/collections`. O Tibé não envia a mensagem: o link abre o WhatsApp do aparelho de quem cobra.",
        response: `200
{ "data": { "message_template": "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias}. Pode nos ajudar a acertar? Obrigado!", "customers": [{ "customer_id": "cl...", "customer_name": "Zé da Silva", "phone": "34 99876-1234", "phone_whatsapp": "5534998761234", "whatsapp_url": "https://wa.me/5534998761234?text=Ol%C3%A1...", "message": "Olá, Zé da Silva! Aqui é da Loja Centro. Consta um fiado de R$ 320,00 vencido há 20 dias. Pode nos ajudar a acertar? Obrigado!", "overdue_total": 320, "oldest_days": 20, "stores": [{ "establishment_id": "cl...", "establishment_name": "Loja Centro", "overdue": 320 }], "last_charged_at": null }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/statement",
        auth: "Sessão · emporio:read · conta: Gestor da loja, Financeiro, Gerente geral e Dono; gaveta: quem vende na loja (Caixa incluído) e o Financeiro; gerência: Gestor da loja e o Financeiro (os outros papéis: 403; Gerente geral e Dono passam em todos)",
        description: "Extrato de um lugar no período. Query: `kind` (`conta`, `gaveta` ou `gerencia`; padrão `conta`), `id` (a conta, ou a loja para gaveta e gerência; `bank_account_id` segue valendo como sinônimo de `kind=conta&id=`), `de` e `ate` (AAAA-MM-DD, inclusivos, até 92 dias; 422 no campo que falhar, inclusive data que não existe, como 2026-02-31). Devolve `place` (`kind`, `id`, `name`), `account` (só na conta; nulo nos outros), o saldo de abertura, as linhas (movimentos do lugar e, na conta, as parcelas de cartão do período, com `kind` `movimento` ou `cartao`) e o saldo de fechamento, pela mesma soma da posição do `finance/today`. Desde 08/11/2026 (Q226): `apenas_sem_carimbo=1` deixa só as linhas de conta sem carimbo; cada linha traz `reconciled_at` e `reconciled_by` (nulos sem carimbo, e sempre nulos em gaveta e gerência, que não se carimbam); `unreconciled_count` e `unreconciled_total` (soma dos valores absolutos) contam as linhas de conta sem carimbo no período, antes do filtro. Conta ou loja de outra conta de cliente: 404.",
        response: `200
{ "data": { "place": { "kind": "conta", "id": "cl...", "name": "Conta principal" }, "account": { "id": "cl...", "name": "Conta principal", "bank": null }, "opening_balance": 5000, "lines": [{ "kind": "movimento", "id": "cl...", "occurred_on": "2026-11-05", "direction": "saida", "amount": 220, "origin": "pagamento_compra", "establishment_id": null, "establishment_name": null, "description": "Pagamento de compra", "reconciled_at": null, "reconciled_by": null }], "closing_balance": 4780, "unreconciled_count": 1, "unreconciled_total": 220 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/finance/statement/reconcile",
        auth: "Sessão · emporio:write · Financeiro, Gerente geral e Dono (os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Carimba uma linha do extrato da conta: o selo de que ela foi conferida com o extrato do banco (Q226). `kind` (`movimento` ou `cartao`) e `id` da linha (422 no campo que faltar). Só a linha de conta tem carimbo: movimento de gaveta ou de gerência é 422 `LINHA_NAO_E_DE_CONTA`; já carimbada: 409 `JA_CARIMBADO`; linha inexistente ou de outra conta de cliente: 404. Entra no Histórico como `conciliacao.carimbar`.",
        request: `{ "kind": "movimento", "id": "cl..." }`,
        response: `200
{ "data": { "kind": "movimento", "id": "cl...", "reconciled_at": "2026-11-08T14:00:00.000Z", "reconciled_by": "Patrícia" }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/emporio/finance/statement/reconcile",
        auth: "Sessão · emporio:write · Financeiro, Gerente geral e Dono (os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Tira o carimbo de uma linha da conta, com o mesmo corpo do POST (`kind` e `id`). Linha sem carimbo: 409 `SEM_CARIMBO`; inexistente ou de outra conta de cliente: 404. Entra no Histórico como `conciliacao.descarimbar`.",
        request: `{ "kind": "movimento", "id": "cl..." }`,
        response: `200
{ "data": { "kind": "movimento", "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/payment-requests",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "Os pedidos de pagamento acima do teto (Q227), Query: `status` (`pendente`, `aprovado` ou `recusado`; outro valor: 422 em `status`; sem ela, todos). Os pendentes saem do mais antigo ao mais novo (a fila de quem espera há mais tempo primeiro); os demais, do mais novo ao mais antigo. `from` diz de onde sairia o dinheiro (`kind` `gaveta` ou `conta`), `entries` traz as contas do pedido, `reason` o motivo da recusa e `last_failure` a última falha de uma aprovação que não passou (o pedido continua pendente). `decided_by` e `decided_at` ficam nulos enquanto pendente.",
        response: `200
{ "data": [{ "id": "cl...", "status": "pendente", "total": 4911.55, "created_at": "2026-11-08T14:00:00.000Z", "requested_by": { "id": "cl...", "name": "Fernanda" }, "from": { "kind": "conta", "id": "cl...", "name": "Conta PIX" }, "entries": [{ "entry_id": "cl...", "description": "Mercadorias para revenda", "supplier_or_category": "Mercadorias para revenda", "due_date": "2026-11-20", "amount": 4911.55 }], "reason": null, "last_failure": null, "decided_by": null, "decided_at": null }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/finance/payment-requests/:id/approve",
        auth: "Sessão · emporio:write · só o Gerente geral e o Dono (ação `conta`; o Financeiro e os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Aprova o pedido e paga as contas, como o aprovador, pelo mesmo caminho do pagamento comum (um pagamento e um movimento por conta). O Histórico diz quem pediu e quem aprovou (`pagamento.aprovar`). Saldo menor que o total: 409 `INSUFFICIENT_CASH` em `from`, e o pedido continua pendente com a falha em `last_failure`. Valor das contas diferente do pedido (alguma mudou por fora): 409 `PEDIDO_DESATUALIZADO`, o pedido continua pendente com o motivo em `last_failure`, e o caminho é recusar o pedido e pedir de novo. Pedido já decidido: 409 `PEDIDO_NAO_PENDENTE`; inexistente ou de outra conta de cliente: 404. Devolve o pedido, agora `aprovado`.",
        response: `200
{ "data": { "id": "cl...", "status": "aprovado", "total": 4911.55, "created_at": "2026-11-08T14:00:00.000Z", "requested_by": { "id": "cl...", "name": "Fernanda" }, "from": { "kind": "conta", "id": "cl...", "name": "Conta PIX" }, "entries": [{ "entry_id": "cl...", "description": "Mercadorias para revenda", "supplier_or_category": "Mercadorias para revenda", "due_date": "2026-11-20", "amount": 4911.55 }], "reason": null, "last_failure": null, "decided_by": { "name": "Marcos" }, "decided_at": "2026-11-08T15:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/finance/payment-requests/:id/reject",
        auth: "Sessão · emporio:write · só o Gerente geral e o Dono (ação `conta`; o Financeiro e os outros papéis: 403 `FORBIDDEN`) · perfil emporio · recurso `emporio` liberado",
        description: "Recusa o pedido, com `reason` obrigatório (422 `reason`). Nada é pago e as contas voltam a poder ser pagas, adiadas ou canceladas. Pedido já decidido: 409 `PEDIDO_NAO_PENDENTE`; inexistente ou de outra conta de cliente: 404. Entra no Histórico como `pagamento.recusar`. Devolve o pedido, agora `recusado`, com o motivo.",
        request: `{ "reason": "Conferir o preço com o fornecedor antes" }`,
        response: `200
{ "data": { "id": "cl...", "status": "recusado", "total": 4911.55, "created_at": "2026-11-08T14:00:00.000Z", "requested_by": { "id": "cl...", "name": "Fernanda" }, "from": { "kind": "conta", "id": "cl...", "name": "Conta PIX" }, "entries": [], "reason": "Conferir o preço com o fornecedor antes", "last_failure": null, "decided_by": { "name": "Marcos" }, "decided_at": "2026-11-08T15:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/projection",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "O fluxo de caixa projetado (Q228), por semana, só leitura. Query: `establishment_id` (opcional; fora do alcance: 404) e `days` (`30`, `60` ou `90`; padrão 30; outro: 422 em `days`). Parte do saldo de hoje (`opening_balance`, a posição de todos os lugares) e soma por semana o a receber (`fiado` e parcelas de acordo pelo vencimento, `cards` pelo `expected_on` líquido, `checks` pelo `good_for`) e o a pagar (`entries` pendentes pelo vencimento e `fixed_estimated`, as despesas fixas automáticas que ainda não nasceram, estimadas com a base de hoje). O que já venceu entra na primeira semana. Conta pendente sem vencimento fica fora. `notes` avisa a estimativa e, por loja, que a conta bancária fica de fora (é da rede, Q242). A leitura faz nascer a ocorrência do mês das despesas fixas automáticas.",
        response: `200
{ "data": { "today": "2026-11-08", "days": 30, "establishment_id": null, "opening_balance": 5000, "weeks": [{ "numero": 1, "de": "2026-11-08", "ate": "2026-11-14", "receivables": { "fiado": 320, "cards": 95.5, "checks": 0, "total": 415.5 }, "payables": { "entries": 220, "fixed_estimated": 0, "total": 220 }, "net": 195.5, "closing_balance": 5195.5 }], "closing_balance": 5195.5, "notes": ["Despesas fixas com rateio automático dos meses seguintes são estimativa com a base de hoje."] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/reports/receivables-aging",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "O a receber por idade de atraso (Q235): o fiado e as parcelas de acordo em aberto, por cliente e no total, nas faixas `em_dia`, `1-15`, `16-30` e `30+` (dias depois do vencimento efetivo), com `total` em cada linha. É o retrato de hoje, sem período (Q241). Query: `establishment_id` (opcional; fora do alcance: 404).",
        response: `200
{ "data": { "today": "2026-11-08", "customers": [{ "customer_id": "cl...", "customer_name": "Zé da Silva", "phone": "34 99876-1234", "em_dia": 0, "1-15": 0, "16-30": 320, "30+": 0, "total": 320 }], "totals": { "em_dia": 0, "1-15": 0, "16-30": 320, "30+": 0, "total": 320 } }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/reports/payables-by-due",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "O a pagar por vencimento (Q235): as contas pendentes que vencem até `ate`, por semana de 7 dias a partir de `de` e por nome. Query: `establishment_id` (opcional), `de` e `ate` (AAAA-MM-DD; padrão de hoje a hoje mais 30 dias; até 366 dias; 422 no campo que falhar, `ate` inclusive quando passa do teto). O que venceu antes de hoje entra sempre na primeira semana, em destaque (`overdue`, `overdue_total`), mesmo anterior a `de` (Q243). Lê até 500 contas.",
        response: `200
{ "data": { "de": "2026-11-08", "ate": "2026-12-08", "weeks": [{ "de": "2026-11-08", "ate": "2026-11-14", "total": 220, "overdue": false, "items": [{ "name": "Aluguel", "total": 220 }] }], "by_name": [{ "name": "Aluguel", "total": 220, "overdue_total": 0 }], "overdue_total": 0, "total": 220 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/finance/reports/cash-by-place",
        auth: "Sessão · emporio:read · Financeiro, Gerente geral e Dono (os outros papéis: 403)",
        description: "A posição de caixa por lugar (Q235): o saldo de hoje de cada gaveta, gerência e conta (`balance`) e o que se moveu em cada uma no período, por origem (`period.entradas`, `period.saidas`, `by_origin`). Query: `establishment_id` (opcional), `de` e `ate` (como no a pagar por vencimento; até 366 dias). Por loja, a conta bancária fica de fora (é da rede, Q242). Na conta, a parcela de cartão do período entra com a origem `cartao`.",
        response: `200
{ "data": { "de": "2026-11-01", "ate": "2026-11-08", "places": [{ "kind": "conta", "id": "cl...", "name": "Conta principal", "establishment_id": null, "balance": 5000, "period": { "entradas": 95.5, "saidas": 220, "by_origin": [{ "origin": "cartao", "label": "Cartão", "entradas": 95.5, "saidas": 0 }] } }], "total_balance": 5000 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/payables/pay",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Paga várias contas de uma vez, cada uma pelo valor dela, saindo da gaveta (`from.establishment_id`) OU da conta (`from.bank_account_id`): um pagamento e um movimento `pagamento_despesa` por conta. Da gaveta, o dinheiro sai de um turno aberto da loja (`cash_register_id` opcional, recusas `CASH_CLOSED` e `CASH_REGISTER_REQUIRED` como na venda), e o saldo que conta é o do caixa desse turno. Saldo menor que o total: 409 `INSUFFICIENT_CASH` em `from`. Conta de fora do Empório, já paga ou cancelada: 422 `entry_ids`. `paid_at` opcional (padrão agora). O `/financeiro` do Tibé recusa quitar conta do Empório (422 `ENTRY_DO_EMPORIO`) desde 07/11/2026: a conta só se paga por aqui. Desde 08/11/2026 (Q227): se o total passa do teto da conta (`payment_approval_limit`) e quem paga não é Gerente geral nem Dono, nada é pago: a resposta é `201` com `waiting_approval: true` e o `request` (o pedido de pagamento, ver `finance/payment-requests`), e os Aprovadores com telefone recebem o aviso pelo WhatsApp do Tibé. O pagamento feito traz `waiting_approval: false`. Conta que já está num pedido pendente: 409 `CONTA_EM_APROVACAO` em `entry_ids` (vale também para cancelar, adiar e corrigir essa conta).",
        request: `{ "entry_ids": ["cl...", "cl..."], "from": { "establishment_id": "cl..." } }`,
        response: `201
{ "data": { "waiting_approval": false, "total": 9.5, "from": { "establishment_id": "cl...", "bank_account_id": null }, "payments": [{ "entry_id": "cl...", "amount": 5, "financial_payment_id": "cl..." }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/result",
        auth: "Sessão · emporio:read · só OWNER e ADMIN; com vínculo, só as lojas dele (404 `establishment_id` nas outras)",
        description: "Resultado da Loja no mês (F4a, Q101), calculado na leitura. Query: `establishment_id` (ou `all`, a visão somada de todas as lojas não arquivadas, só para quem não tem vínculo: 403 `FORBIDDEN`; a resposta ganha `stores`, uma linha por loja), `month` (AAAA-MM, 422 `month`). Devolve `sales`, `cost`, `variable_expenses` (regras mais `card_fees`), `margin` e `margin_pct`, `losses` (perdas e quebras, linha própria), `fixed_expenses`, `result`, `break_even` (`status` `ok`, `sem_dados` ou `nao_se_paga`; `amount` e `missing`, nunca negativo), `tracking` (vendas por dia, acumulado e projeção linear) e `estimated` com `estimated_reasons`.",
        response: `200
{ "data": { "month": "2026-11", "sales": 12000, "cost": 6000, "variable_expenses": 600, "margin": 5400, "margin_pct": 45, "losses": 100, "fixed_expenses": 3000, "result": 2300, "break_even": { "status": "ok", "amount": 6666.67, "missing": 0, "margin_pct_used": 45, "basis": "mes" }, "estimated": false, "estimated_reasons": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/result/products",
        auth: "Sessão · emporio:read · só OWNER e ADMIN; `establishment_id=all` só sem vínculo (403 `FORBIDDEN`)",
        description: "Produtos do mês (F4b, Q104): `top_sales` e `top_margin`, até 10 cada, ordenados por `sales` e por `margin` (desempate pelo nome). Query: `establishment_id` (id ou `all`), `month` (AAAA-MM). Cada linha: `emporio_product_id`, `name`, `base_unit`, `quantity` (unidade-base), `sales`, `cost`, `variable_expenses` (o \"Vendeu, Pagou\" rateado pelo valor dos itens, a taxa de cartão entre todos), `margin` e `margin_pct` (nulo sem vendas). Devoluções do mês descontam pelo item devolvido.",
        response: `200
{ "data": { "establishment_id": "all", "month": "2026-11", "top_sales": [{ "emporio_product_id": "cl...", "name": "Milho", "base_unit": "quilograma", "quantity": 120, "sales": 600, "cost": 360, "variable_expenses": 30, "margin": 210, "margin_pct": 35 }], "top_margin": [] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/result/negative-sales",
        auth: "Sessão · emporio:read · só OWNER e ADMIN; `establishment_id=all` só sem vínculo (403 `FORBIDDEN`)",
        description: "Vendas concluídas do mês com margem negativa (F4b, Q105), da pior para a melhor: `net_amount` menos o custo dos itens menos o \"Vendeu, Pagou\" da venda (taxa de cartão inclusive). Query: `establishment_id` (id ou `all`), `month`. `cause`, na primeira que vale: `custo_provisorio`, `preco_abaixo_do_custo`, `desconto`, `taxa_cartao`, `despesas_da_venda`.",
        response: `200
{ "data": [{ "sale_id": "cl...", "sold_at": "2026-11-05T15:00:00.000Z", "establishment_name": "Loja Centro", "net_amount": 90, "margin": -12.5, "cause": "preco_abaixo_do_custo" }], "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/reports/sales",
        auth: "Sessão · emporio:read · Gestor da loja, Gerente geral e Dono (o Vendedor e o Caixa recebem 403); o Gestor só as lojas dele (404 `establishment_id` nas outras)",
        description: "Relatório de vendas (entrega 3), calculado na leitura. Query: `from` e `to` (AAAA-MM-DD, os dois inclusivos, dia de Brasília, até 366 dias; 422 em `from` ou `to`), `establishment_id` opcional (ausente: todas as lojas não arquivadas que o ator vê). `por_vendedor` e `por_loja` por total decrescente: `sales_count` conta as vendas concluídas, sem a venda nova da troca; `total` soma o líquido delas (a da troca inclusa) menos o devolvido no período, que vai ao vendedor e à loja da venda original e pode deixar o total negativo; `average_ticket` é o total dividido pela quantidade (nulo sem vendas). Venda sem vendedor sai em `seller_user_id: null`, \"Sem vendedor\". `por_produto`: quantidade na unidade-base e total, líquidos de devolução, por total. `parados`: produto não arquivado com preço na loja e sem venda nela no período, uma linha por produto e loja.",
        response: `200
{ "data": { "periodo": { "from": "2026-11-01", "to": "2026-11-05" }, "lojas": [{ "id": "cl...", "name": "Loja Centro" }], "por_vendedor": [{ "seller_user_id": "cl...", "name": "Ana", "sales_count": 3, "total": 60, "average_ticket": 20 }], "por_produto": [{ "emporio_product_id": "cl...", "name": "Milho", "base_unit": "quilograma", "quantity": 8, "total": 80 }], "parados": [{ "emporio_product_id": "cl...", "name": "Sal mineral", "establishment_id": "cl...", "establishment_name": "Loja Centro" }], "por_loja": [{ "establishment_id": "cl...", "name": "Loja Centro", "sales_count": 3, "total": 60, "average_ticket": 20 }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/bank-accounts",
        auth: "Sessão · emporio:read · só OWNER e ADMIN",
        description: "Contas bancárias do Empório com o saldo (soma dos movimentos) e as lojas que a usam como conta PIX. `incluir_arquivados=1` traz as arquivadas.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Conta PIX", "bank": "Sicredi", "balance": 320.5, "archived_at": null, "pix_establishment_ids": ["cl..."] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/bank-accounts",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Cadastra a conta. `name` obrigatório (422 `name`) e único na conta do cliente (409 `DUPLICATE_NAME`); `bank` opcional.",
        request: `{ "name": "Conta PIX", "bank": "Sicredi" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Conta PIX", "balance": 0 }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/emporio/bank-accounts/:id",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Edita nome e banco, ou arquiva (`archived: true`) e desarquiva. Nome repetido: 409 `DUPLICATE_NAME`.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-10-28T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/establishments/:id/pix-account",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Define a conta que recebe o PIX da loja (`bank_account_id`, ou `null` para limpar). Conta inexistente ou arquivada: 422 `bank_account_id`.",
        request: `{ "bank_account_id": "cl..." }`,
        response: `200
{ "data": { "establishment_id": "cl...", "pix_bank_account_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash",
        auth: "Sessão · emporio:read · gaveta de quem tem a loja no vínculo; contas só OWNER e ADMIN",
        description: "Saldos e movimentos. `drawers` traz o saldo da gaveta de cada loja visível, `accounts` o de cada conta (vazio para quem não é OWNER ou ADMIN) e `movements` os lançamentos de caixa, do mais recente. Saldo da gaveta = entradas menos saídas; o da conta soma também as parcelas do cartão que já caíram (`expected_on` até hoje em Brasília). Nada é gravado. Cada gaveta traz `last_count` (a última conferência), `registers` (os caixas numerados: `id`, `number`, `nome`, `saldo`, `turno_aberto`; o `balance` da gaveta é a soma deles) e `manager_balance` (o saldo \"Com a gerência\" da loja, só para o Gestor dela para cima; nulo para os outros). Os movimentos trazem `cash_register_id`, `cash_session_id`, `manager_establishment_id` e `cash_handover_id`, e os da gerência aparecem para o Gestor da loja. `accounts[].to_receive` e `card_receivables` (parcelas futuras do cartão, por data) só vêm para OWNER e ADMIN; `checks` é a carteira de cheques (recebido e depositado) das lojas visíveis. Filtros: `establishment_id`, `bank_account_id` (só OWNER e ADMIN), `limit`.",
        response: `200
{ "data": { "drawers": [{ "establishment_id": "cl...", "name": "Loja Centro", "balance": 150 }], "accounts": [], "movements": [{ "direction": "entrada", "amount": 50, "origin": "venda" }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/opening",
        auth: "Sessão · emporio:write · caixa e gerência: Gestor da loja para cima; conta: só OWNER e ADMIN",
        description: "Saldo inicial (implantação), uma vez por lugar (409 `OPENING_ALREADY_DONE`): um caixa (`cash_register_id`), a gerência de uma loja (`manager_establishment_id`) OU uma conta (`bank_account_id`). O caixa só recebe saldo inicial enquanto nunca teve turno (depois: 409 `OPENING_ALREADY_DONE`); o troco de um caixa novo entra pelo reforço da gerência na abertura. `establishment_id` sozinho, de antes dos caixas numerados, vale como o Caixa 1 da loja. Informar mais de um lugar ou nenhum: 422 `cash_register_id`. `amount` maior que zero (422 `amount`).",
        request: `{ "cash_register_id": "cl...", "amount": 200 }`,
        response: `201
{ "data": { "direction": "entrada", "amount": 200, "origin": "implantacao" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/card-fee-rules",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo (o nome da conta só para OWNER e ADMIN)",
        description: "Taxas de cartão das lojas visíveis: uma regra por loja e forma (`debito`, `credito_vista`, `credito_parcelado`), com `fee_pct`, `days` (prazo da 1ª parcela) e a conta que recebe. Filtro: `establishment_id`.",
        response: `200
{ "data": [{ "id": "cl...", "establishment_id": "cl...", "kind": "credito_vista", "fee_pct": 3, "days": 30, "bank_account_id": "cl...", "bank_account_name": "Conta PIX" }], "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/v1/emporio/card-fee-rules",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Cria ou substitui a regra da loja para a forma. `fee_pct` de 0 a 100 (422 `fee_pct`), `days` inteiro de 0 a 120 (422 `days`), `bank_account_id` de conta não arquivada (422 `bank_account_id`). Mudar a regra não mexe nas vendas passadas: a taxa fica gravada no pagamento.",
        request: `{ "establishment_id": "cl...", "kind": "credito_vista", "fee_pct": 3, "days": 30, "bank_account_id": "cl..." }`,
        response: `200
{ "data": { "id": "cl...", "kind": "credito_vista", "fee_pct": 3, "days": 30 }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/emporio/card-fee-rules/:id",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Remove a regra. As vendas passadas guardam a taxa no pagamento; sem regra, a venda no cartão daquela forma é recusada (422 `payments`).",
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/checks",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Cheques recebidos nas vendas, por `good_for` (bom para). Filtros: `establishment_id`, `customer_id` (antes `contact_id`), `status` (`recebido`, `depositado`, `compensado`, `devolvido`, `devolvido_ao_cliente`). A carteira é a soma dos `recebido` e `depositado` (também vem em `GET /api/v1/emporio/cash`).",
        response: `200
{ "data": [{ "id": "cl...", "number": "000123", "bank": "Sicredi", "good_for": "2026-12-10", "amount": 100, "status": "recebido", "customer_id": "cl...", "customer_name": "Seu Zé" }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/checks/:id/deposit",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo",
        description: "Depositar: `recebido` para `depositado`, na conta escolhida (422 `bank_account_id`). Fora da ordem: 409 `CHECK_STATUS`.",
        request: `{ "bank_account_id": "cl..." }`,
        response: `200
{ "data": { "id": "cl...", "status": "depositado", "bank_account_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/checks/:id/clear",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Compensou: `depositado` para `compensado`, e o valor entra na conta do depósito (movimento `cheque_compensado`). Sem corpo. Fora da ordem: 409 `CHECK_STATUS`.",
        response: `200
{ "data": { "id": "cl...", "status": "compensado" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/checks/:id/return",
        auth: "Sessão · emporio:write · só OWNER e ADMIN",
        description: "Voltou: `recebido` ou `depositado` para `devolvido`. `reason` obrigatório (422 `reason`). O pagamento do cheque sai do lançamento da venda, que volta a pendente, e o cliente volta a dever no fiado. Fora da ordem: 409 `CHECK_STATUS`.",
        request: `{ "reason": "Sem fundos" }`,
        response: `200
{ "data": { "id": "cl...", "status": "devolvido", "return_reason": "Sem fundos" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/transfers",
        auth: "Sessão · emporio:write · sai da gerência: Gestor daquela loja para cima; sai de conta: só OWNER e ADMIN",
        description: "Transfere dinheiro entre contas e a gerência das lojas (entrega 2: a gaveta não transfere mais). `from` e `to` levam `bank_account_id` (conta) OU `manager_establishment_id` (\"Com a gerência\" de uma loja; extensão aditiva). `establishment_id` (a gaveta) na origem ou no destino: 422 `DRAWER_TRANSFER` em `from` ou `to` (\"A gaveta vai ao gerente pela sangria ou pelo malote.\"). Origem igual ao destino: 422 `to`. Saldo de origem menor que o valor: 409 `INSUFFICIENT_CASH` em `amount`. Grava dois movimentos `transferencia` e nada no Financeiro. `operation_key` obrigatória: repetir devolve a transferência gravada com 200. Na resposta, `from.establishment_id` só vem preenchido nas transferências da gaveta de antes da entrega 2.",
        request: `{ "operation_key": "k-20", "from": { "manager_establishment_id": "cl..." }, "to": { "bank_account_id": "cl..." }, "amount": 150 }`,
        response: `201
{ "data": { "id": "cl...", "amount": 150, "from": { "establishment_id": null, "bank_account_id": null, "manager_establishment_id": "cl..." }, "to": { "establishment_id": null, "bank_account_id": "cl...", "manager_establishment_id": null } }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/counts",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Histórico das conferências de gaveta, da mais recente. Filtros: `establishment_id`, `limit`.",
        response: `200
{ "data": [{ "id": "cl...", "establishment_id": "cl...", "expected": 200, "counted": 190, "difference": -10, "justification": "Troco errado" }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/counts",
        auth: "Sessão · emporio:write · OWNER, ADMIN e OPERADOR com a loja no vínculo",
        description: "Conferência livre de um caixa (`cash_register_id`, obrigatório: 422 `cash_register_id`), dentro do turno aberto dele (sem turno: 409 `CASH_CLOSED`); não encerra o turno. `expected` é o saldo do caixa no momento e `difference` é `counted` menos `expected`. `counted` negativo: 422 `counted`. Diferença diferente de zero exige `justification` (422 `justification`) e grava um movimento de ajuste (`conferencia`) no caixa e no turno e o lançamento pago \"Diferença de caixa\" (receita se sobra, despesa se falta). A resposta traz `kind: \"livre\"`, `cash_register_id` e `cash_session_id`.",
        request: `{ "cash_register_id": "cl...", "counted": 190, "justification": "Troco errado" }`,
        response: `201
{ "data": { "id": "cl...", "kind": "livre", "expected": 200, "counted": 190, "difference": -10 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/registers",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Os caixas numerados da loja (`establishment_id`, obrigatório: 422), por número: `id`, `number`, `nome` (\"Caixa 2\"), `saldo` (soma dos movimentos do caixa, nada gravado) e `turno_aberto` (`{ id, aberto_por: { id, name }, aberto_em }`, ou nulo). Toda loja nasce com o Caixa 1.",
        response: `200
{ "data": [{ "id": "cl...", "number": 1, "nome": "Caixa 1", "saldo": 120, "turno_aberto": { "id": "cl...", "aberto_por": { "id": "cl...", "name": "Ana" }, "aberto_em": "2026-11-05T11:00:00.000Z" } }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/registers",
        auth: "Sessão · emporio:write · Gestor da loja para cima",
        description: "Cria o próximo caixa da loja: `number` é o maior da loja mais um. Loja arquivada: 422 `establishment_id`.",
        request: `{ "establishment_id": "cl..." }`,
        response: `201
{ "data": { "id": "cl...", "number": 2, "nome": "Caixa 2", "saldo": 0, "turno_aberto": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/sessions",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Os turnos de caixa das lojas visíveis, do mais recente (até 100). Filtros: `establishment_id`, `status` (`open` ou `closed`; outro valor: 422 `status`). Cada turno traz o caixa (`number`, `nome`), quem abriu e quando, `opening_expected`, `opening_counted`, `reinforcement`, o encerramento (`closed_at`, `closed_by`, `closing_expected`, `closing_counted`, `malote_amount`), `balance` (saldo do caixa agora) e `handovers` (sangrias e malote).",
        response: `200
{ "data": [{ "id": "cl...", "nome": "Caixa 1", "status": "open", "opening_counted": 100, "reinforcement": 0, "balance": 150, "handovers": [] }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/sessions",
        auth: "Sessão · emporio:write · quem trabalha na loja (o Caixa incluso)",
        description: "Abre o turno do caixa com o troco contado (`counted`, zero ou mais: 422 `counted`). Abrir é conferir o troco: `reinforcement` (opcional) sai da gerência da loja e entra no caixa antes do esperado ser calculado (gerência sem o valor: 409 `INSUFFICIENT_CASH` em `reinforcement`, \"Não há dinheiro suficiente para isso.\"); o esperado é o saldo do caixa depois do reforço, e a diferença segue a conferência (422 `justification`, ajuste e \"Diferença de caixa\"). Grava a contagem `kind: abertura`. Um turno aberto por caixa: 409 `SESSION_ALREADY_OPEN` em `cash_register_id` (\"Este caixa já está aberto.\"), também em duas aberturas simultâneas. Caixa de loja de outra pessoa: 403. `operation_key` obrigatória: repetir devolve o turno com 200, também com as duas chamadas em paralelo; a chave já usada noutro caixa: 409 `OPERATION_KEY_REUSED` em `operation_key` (vale igual para sangria, encerramento e confirmação).",
        request: `{ "operation_key": "k-30", "cash_register_id": "cl...", "counted": 100, "reinforcement": 50 }`,
        response: `201
{ "data": { "id": "cl...", "status": "open", "opening_expected": 100, "opening_counted": 100, "reinforcement": 50 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/sessions/:id",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Um turno, no formato da listagem, com as entregas (sangrias e malote). Turno de outra conta ou de loja fora do vínculo: 404.",
        response: `200
{ "data": { "id": "cl...", "nome": "Caixa 1", "status": "closed", "closing_counted": 120, "malote_amount": 100, "handovers": [{ "kind": "malote", "amount": 100, "status": "pending" }] }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/sessions/:id/report",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Os dados do relatório de fechamento do turno (A4 e bobina): loja, caixa, operador, abertura e encerramento, troco inicial e reforço, vendas por forma, fiado recebido, sangrias (uma por linha, com `confirmada`), devoluções, cancelamentos e despesas em dinheiro, esperado, contado, diferença, justificativa, malote e troco que ficou. Turno aberto: os campos do encerramento vêm `null`. Turno de outra conta ou de loja fora do vínculo: 404.",
        response: `200
{ "data": { "caixa": "Caixa 1", "troco_inicial": 100, "vendas_por_forma": [{ "forma": "Dinheiro", "valor": 70 }], "sangrias": [{ "em": "2026-11-04T15:00:00.000Z", "valor": 40, "confirmada": false }], "esperado": 110, "contado": 110, "diferenca": 0, "malote": 60, "troco_que_ficou": 50 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/sessions/:id/withdrawals",
        auth: "Sessão · emporio:write · quem trabalha na loja (o Caixa incluso)",
        description: "Sangria: o dinheiro sai do caixa (movimento `sangria`, no turno) e fica numa entrega aguardando o gerente; só entra em \"Com a gerência\" quando ele confirma. `amount` maior que zero (422 `amount`) e até o saldo do caixa (409 `INSUFFICIENT_CASH` em `amount`). Turno encerrado: 409 `SESSION_CLOSED`. `operation_key` obrigatória: repetir devolve a entrega com 200.",
        request: `{ "operation_key": "k-31", "amount": 300, "notes": "Notas de 100" }`,
        response: `201
{ "data": { "id": "cl...", "kind": "sangria", "amount": 300, "status": "pending" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/sessions/:id/close",
        auth: "Sessão · emporio:write · quem abriu, o Gestor da loja para cima, ou qualquer um da loja quando ela não tem usuário Caixa",
        description: "Encerra o turno. `closing_expected` é o saldo do caixa; a contagem (`kind: encerramento`) segue a regra da conferência (422 `justification`, ajuste e \"Diferença de caixa\"). `malote_amount` (zero ou mais, até o contado: 422 `MALOTE_TOO_BIG` em `malote_amount`) sai do caixa numa entrega aguardando o gerente; o resto fica como troco do próximo turno. Quem não pode: 403 `NOT_SESSION_OWNER` (\"Só quem abriu o caixa ou o gestor da loja encerra este turno.\"). Já encerrado: 409 `SESSION_CLOSED`. `operation_key` obrigatória: repetir devolve o turno encerrado.",
        request: `{ "operation_key": "k-32", "counted": 120, "malote_amount": 100 }`,
        response: `200
{ "data": { "id": "cl...", "status": "closed", "closing_expected": 120, "closing_counted": 120, "malote_amount": 100 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/emporio/cash/handovers",
        auth: "Sessão · emporio:read · quem tem a loja no vínculo",
        description: "Sangrias e malotes das lojas visíveis. `status`: `pending` (o padrão, da mais antiga) ou `confirmed` (da mais recente); outro valor: 422 `status`. Filtro: `establishment_id`.",
        response: `200
{ "data": [{ "id": "cl...", "kind": "malote", "amount": 100, "status": "pending", "register_number": 1, "establishment_name": "Loja Centro" }], "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/emporio/cash/handovers/:id/confirm",
        auth: "Sessão · emporio:write · Gestor da loja da entrega para cima",
        description: "O gerente confirma o valor recebido (`received_amount`, zero ou mais), que entra em \"Com a gerência\" (movimento `entrega_gerencia`). `difference` = recebido menos o entregue; diferente de zero exige `notes` (422 `notes`) e vira \"Diferença de caixa\" (despesa se faltou, receita se sobrou). Já confirmada: 409 `HANDOVER_ALREADY_CONFIRMED`. `operation_key` obrigatória: repetir devolve a entrega confirmada.",
        request: `{ "operation_key": "k-33", "received_amount": 95, "notes": "Faltou uma nota de 5" }`,
        response: `200
{ "data": { "id": "cl...", "status": "confirmed", "received_amount": 95, "difference": -5 }, "meta": {} }`,
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
        description: "Desativa o pasto (não deleta). Idempotente. Pasto com gado (qualquer dono ou situação) é recusado com 409 PASTO_OCUPADO: transfira as cabeças antes.",
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
        auth: "Sessão · rebanho:read · perfil fazenda ou emporio",
        description:
          "Lista os contatos de negociação (vendedor, comprador, frigorífico, leiloeira). Filtros opcionais: `q` (parte do nome) e `type`. Não devolve o Consumidor final do Empório. Cada contato traz os campos do cadastro PF/PJ (`person_kind`, `document`, endereços etc.) e `incomplete` (true se faltar tipo, documento ou telefone). Fora do balcão do Empório nada disso é obrigatório (§5).",
        response: `200
{ "data": [{ "id": "cl...", "name": "João da Ponte", "type": "fazendeiro", "phone": null, "city": "Unaí", "person_kind": null, "document": null, "incomplete": true }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/contacts",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Cadastra um contato. Só `name` é obrigatório: até o tipo é opcional (§4). Aceita, opcionais, `person_kind` (`pf` ou `pj`), `document` (CPF ou CNPJ, com ou sem máscara, gravado sem pontuação; o CNPJ aceita o formato alfanumérico da Receita e é gravado em maiúscula; exige `person_kind`), `state_registration`, `birth_date` (AAAA-MM-DD, só PF), `responsible_name` (só PJ), `address_*` (zip, street, number, complement, district, state; a cidade é `city`) e `delivery_*` (os mesmos mais `delivery_city`). Recusas 422 trazem o `field`; documento já usado no tenant (arquivados contam) devolve 409 `DUPLICATE_DOCUMENT` em `document`.",
        request: `{ "name": "Frigorífico Boa Carne", "type": "frigorifico", "city": "Paracatu", "person_kind": "pj", "document": "11.222.333/0001-81" }`,
        response: `201
{ "data": { "id": "cl...", "name": "Frigorífico Boa Carne", "type": "frigorifico" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/contacts/:id",
        auth: "Sessão · rebanho:read · perfil fazenda ou emporio",
        description:
          "O contato (com todos os campos do cadastro PF/PJ e `incomplete`) mais o histórico dele: as negociações NÃO canceladas, da mais recente para a mais antiga (máx. 50). As canceladas ficam de fora porque o §17.10 mantém a linha no histórico da própria negociação, e aqui elas só inflariam a conta de quanto já se negociou com aquela pessoa.",
        response: `200
{ "data": { "id": "cl...", "name": "João da Ponte", "type": "fazendeiro", "archived": false, "negotiations": [{ "id": "cl...", "type": "venda_gado", "occurred_at": "2026-08-01T00:00:00.000Z", "amount": 15000 }] }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/contacts/:id",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Edita o contato. Existe porque o contato criado pela conversa do WhatsApp nasce só com o nome dito (`findOrCreateContact`), e até esta rota não havia como acrescentar telefone, tipo ou município depois. Os campos são os mesmos do POST. `name`, `type`, `phone`, `city` e `notes` substituem tudo (ausente vira nulo); os campos do cadastro PF/PJ seguem outra regra: ausente no corpo mantém o valor guardado, `null` limpa. A conferência usa o registro mesclado (um `document` sem `person_kind` usa o tipo guardado; trocar o tipo zera `birth_date` ou `responsible_name` do outro). O Consumidor final não pode ser editado (422).",
        request: `{ "name": "João da Ponte", "type": "fazendeiro", "phone": "38999990000", "city": "Unaí" }`,
        response: `200
{ "data": { "id": "cl...", "name": "João da Ponte", "type": "fazendeiro", "phone": "38999990000", "city": "Unaí" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/contacts/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Arquiva ou desarquiva, conforme `archived`. Nunca apaga, como em Fazenda e Pasto: apagar deixaria o histórico anônimo em silêncio, porque `Negotiation.contact_id` é `onDelete: SetNull`. Um `PATCH` com booleano em vez de `DELETE` porque `DELETE` cobriria só um dos dois sentidos e deixaria o desarquivamento sem porta. O arquivado some da listagem E deixa de ser reaproveitado pela conversa, então um negócio novo com o mesmo nome cria um contato novo.",
        request: `{ "archived": true }`,
        response: `200
{ "data": { "id": "cl...", "name": "João da Ponte" }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/negotiations",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description:
          "Lista as negociações, da mais recente para a mais antiga. Canceladas aparecem por padrão (o §17.10 exige histórico completo); use `include_canceled=false` para ocultar. Filtros: type (os sete tipos, inclusive venda_leite), contact_id, property_id, since, until, situacao (confirmada, vencida, parcialmente_paga, paga, cancelada, sem_valor), limit (máx. 200), offset. A situação é derivada das contas e não gravada: com ela o período inteiro é calculado antes de paginar. Cada item já traz a SITUAÇÃO derivada e os totais do §15.",
        response: `200
{ "data": [{ "id": "cl...", "type": "venda_gado", "amount": 80000, "situacao": "paga", "totais": { "principal": 80000, "custos": 5500, "total": 85500, "liquido": 74500 } }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra um negócio. UMA rota para `compra_gado`, `venda_gado`, `compra_produto` e `venda_produto`, com o tipo no corpo: são a mesma operação com o sinal invertido, e só muda o filho que o negócio cria (`HerdMovement` ou `StockMovement`). Nos tipos de produto, `itens` traz `product_id` em vez de `category_id`, e a quantidade aceita casa decimal quando a unidade permite (saca sim, ferramenta não). Tudo numa transação só: se a venda não tiver saldo, NADA é gravado, nem o envelope. `pago: true` gera lançamento já quitado; `pago: false` com `parcelas` gera uma conta a pagar/receber por parcela, e a soma delas precisa bater exatamente com `amount` (§14), senão devolve 422 `PARCELAS_NAO_FECHAM`. A prazo sem `parcelas`, `due_date` é obrigatória: sem ela, 422 `VENCIMENTO_OBRIGATORIO` no campo `due_date`. `custos` (frete, comissão, taxa) viram lançamentos de DESPESA próprios, para aparecerem no DRE. `payment_method` opcional (dinheiro, pix, transferencia, boleto, cheque, cartao, outro) vai para as contas principais, todas as parcelas, e para o pagamento quando já nasce pago. Em gado, `itens[].pasture_id` opcional é o pasto de destino na compra e de origem na venda.",
        request: `{ "type": "compra_gado", "property_id": "cl...", "itens": [{ "category_id": "bezerro_0_7", "quantity": 20 }], "amount": 60000, "contact_id": "cl...", "pago": false, "parcelas": [{ "due_date": "2026-03-10T00:00:00.000Z", "amount": 60000 }], "payment_method": "boleto" }`,
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
          "Encerra a remessa: quantos venderam, quantos voltaram e quantos seguiram para outro destino. A SOMA DOS TRÊS precisa ser igual ao que está na remessa, senão devolve 422 `DESTINOS_NAO_BATEM` no campo `quantity` e nada se move. O dinheiro só nasce AGORA: `amount` vira o valor da mesma negociação e o lançamento `principal` (com parcelas, quando houver, somando exatamente `amount`; a prazo sem parcelas, `due_date` é obrigatória, senão 422 `VENCIMENTO_OBRIGATORIO`), e `custos` (comissão da leiloeira, taxa do evento, frete) viram lançamentos de DESPESA próprios. Sem venda, custo com valor também precisa de `pago` ou `due_date` (422 `VENCIMENTO_OBRIGATORIO`). Venda sem valor é 422 `VENDA_SEM_VALOR` e valor sem venda é 422 `VALOR_SEM_VENDA`, os dois no campo `amount`. `outro_destino` fecha esta remessa e abre uma estadia NOVA do tipo escolhido, cujo id volta em `meta.nova_estadia_id`: nenhuma cabeça some, e nenhuma volta para a fazenda por engano.",
        request: `{ "vendidos": 12, "retornados": 8, "amount": 60000, "pago": true, "custos": [{ "descricao": "Comissão da leiloeira", "amount": 3000 }] }`,
        response: `200
{ "data": { "id": "cl...", "type": "evento", "amount": 60000, "situacao": "paga" }, "meta": { "nova_estadia_id": null, "encerrada": true } }`,
      },
      {
        method: "POST",
        path: "/api/v1/negotiations/barters",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Registra uma PERMUTA (§12): o produtor entrega uma coisa e recebe outra, com ou sem diferença em dinheiro. UMA chamada atualiza rebanho, estoque, máquinas e financeiro, que é o §12.6 (\"o produtor não deverá precisar criar manualmente uma venda e depois uma compra\"). Cada lado tem um `kind`: `animais` (vira `permuta_saida`/`permuta_entrada` no livro-razão, nunca `venda`/`compra`), `produtos` (idem no estoque), `maquina` (no lado entregue é o `machine_id` de uma máquina que já existe, que passa a `negociada`; no recebido são os campos de cadastro, e a máquina nasce ligada à permuta e SEM custo de aquisição, porque o que ela custou foi o gado) e `descricao` (serviço ou outro, que não tem área no Tibé e fica como texto). O VALOR da negociação é a `diferenca`, e só ela: `paguei` gera despesa, `recebi` gera receita, com parcelas quando houver (a soma tem que dar o valor, §14). A prazo sem parcelas, `due_date` é obrigatória (422 `VENCIMENTO_OBRIGATORIO`). Recusas: 422 `PERMUTA_INCOMPLETA` quando falta um dos lados (§12.3 os torna obrigatórios), 422 `PERMUTA_VAZIA` quando nada se move e não há dinheiro, 422 `MAQUINA_INDISPONIVEL` quando a máquina entregue já saiu, e 422 `INSUFFICIENT_BALANCE` ou `INSUFFICIENT_STOCK` sem saldo. Em qualquer recusa NADA é gravado, nem o envelope nem o contato.",
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
          "O catálogo com o SALDO de cada produto. O saldo nunca é coluna: é a soma das movimentações não canceladas, por produto e fazenda. `?property_id=` filtra o saldo, não o catálogo, então um produto sem movimentação naquela fazenda aparece com zero (e é isso que deixa lançar a primeira compra dele lá). `meta.units` traz as unidades do §10.5 (11, mais o fardo), cada uma dizendo se aceita quantidade quebrada.",
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
          "Encerra a estadia, total ou parcialmente: a soma dos destinos pode ser MENOR que o que está na estadia (o resto continua nela), e maior devolve 422 `DESTINOS_NAO_BATEM` com `field: quantity`. Os destinos vêm como lista por tipo de movimento (`retorno_estadia`, `venda`, `morte`, `perda_confirmada`, `saida_terceiro`, `ajuste`), e cada tipo de estadia aceita só alguns (422 `ENCERRAMENTO_NAO_PERMITIDO`). Numa `venda`, cria a negociação de gado com `contact_id` ou `contact_name` opcionais, e `value` vira a receita: `pago: true` nasce quitada, e a prazo `due_date` é obrigatória, senão 422 `VENCIMENTO_OBRIGATORIO` no campo `due_date` e nada se move. Num `retorno_estadia`, `property_id` manda para outra fazenda, `confinement_site_id` abre lote novo noutro confinamento, e `evento` (`event_name`, `event_type`, `organizer_name`) abre a remessa para leilão ou feira. `ajuste` (confinamento e boitel) exige `reason`, e as cabeças saem do rebanho.",
        request: `{ "destinos": [{ "movement_type": "venda", "quantity": 12, "value": 60000, "contact_name": "Frigorífico Boa Carne", "pago": false, "due_date": "2026-11-10T12:00:00.000Z" }, { "movement_type": "retorno_estadia", "quantity": 8, "confinement_site_id": "cl..." }] }`,
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
      {
        method: "POST",
        path: "/api/v1/confinement/stays/:id/costs",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Custo avulso do lote (§13, §14): ração comprada, remédio, frete. Vira despesa no Financeiro ligada ao lote (`related_module: confinamento`), e entra no `financial_cost` do resumo. `pago: true` nasce quitada; a prazo, `due_date` é obrigatória, senão 422 `VENCIMENTO_OBRIGATORIO`.",
        request: `{ "category": "Ração", "amount": 3000, "pago": false, "due_date": "2026-10-10T12:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
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
{ "data": { "property_id": "cl...", "hoje": { "dia": "2026-09-02", "vacas_em_lactacao": 32, "litros": 480, "media_por_vaca": 15 }, "periodos": [{ "chave": "hoje", "rotulo": "Hoje", "de": "2026-09-02", "ate": "2026-09-02", "litros": 480, "dias": 1, "dias_com_registro": 1, "media_diaria": 480, "media_por_vaca": 15, "dias_com_contagem": 1 }] }, "meta": {} }`,
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
      {
        method: "POST",
        path: "/api/v1/milk/sales",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "A venda avulsa de leite (§23 a §27). **Vender JÁ RETIRA o leite**: os litros saem do local e a venda nasce na mesma transação, porque é assim que o produtor fala e o §23 lista a quantidade vendida como obrigatória. Vende sempre o leite PRÓPRIO: vender o de terceiro guardado no seu tanque seria vender o que não é seu (§19). O §25 aceita `amount` OU `price_per_liter`, nunca os dois (422 `VALOR_DUPLICADO`), e grava sempre o total, com o preço por litro derivado na leitura. A venda vira uma `Negotiation` de tipo `venda_leite` e herda parcelas (§27), custos adicionais (o desconto do laticínio) e estorno. Sem saldo próprio no local, 422 `SALDO_INSUFICIENTE` no campo `liters`. ⚠️ **Cancelar NÃO tem rota aqui**: é `POST /api/v1/negotiations/:id/cancel`, que passou a desfazer o leite junto.",
        request: `{ "site_id": "cl...", "property_id": "cl...", "liters": 500, "price_per_liter": 2.40, "buyer_id": "cl...", "pago": true }

// a prazo (§27), com parcelas
{ "site_id": "cl...", "property_id": "cl...", "liters": 1000, "amount": 2400, "parcelas": [{ "due_date": "2026-10-10", "amount": 1200 }, { "due_date": "2026-11-10", "amount": 1200 }] }`,
        response: `201
{ "data": { "negotiation_id": "cl...", "liters": 500, "amount": 1200, "price_per_liter": 2.4 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/milk/sales/close",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "O fechamento por período (§28 e §29). **Não move leite**: cobra o que já saiu. Soma as retiradas daquele `buyer_id` no período que ainda não foram liquidadas, aplica o preço e cria a venda. Cada entrega recebe o `negotiation_id` do fechamento, e é isso que impede cobrar o mesmo leite duas vezes: a segunda chamada não encontra nada em aberto e devolve 422 `SEM_ENTREGAS`. A prazo (`pago` falso, sem `parcelas`), `due_date` é obrigatória: sem ela, 422 `VENCIMENTO_OBRIGATORIO`. O exemplo do §29 sai daqui: 15 dias, 7.200 litros a R$ 2,35, R$ 16.920,00 em Contas a Receber.",
        request: `{ "buyer_id": "cl...", "property_id": "cl...", "de": "2026-09-01", "ate": "2026-09-15", "price_per_liter": 2.35, "due_date": "2026-09-25", "period_label": "1a quinzena de setembro" }`,
        response: `201
{ "data": { "negotiation_id": "cl...", "liters": 7200, "amount": 16920, "price_per_liter": 2.35, "entregas": 15 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/milk/sales/pending",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "As entregas que saíram para um comprador e ainda NÃO foram cobradas (§28), agrupadas por comprador. \"Não cobradas\" é `negotiation_id: null` na movimentação, e a marca é posta no fechamento: por isso a lista some sozinha depois que o período fecha. Filtros: `buyer_id`, `de`, `ate` (AAAA-MM-DD).",
        response: `200
{ "data": [{ "buyer_id": "cl...", "liters": 1380, "entregas": 3, "primeira": "2026-09-01T15:00:00.000Z", "ultima": "2026-09-03T15:00:00.000Z" }], "meta": { "total": 1, "total_litros": 1380 } }`,
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
      {
        method: "GET",
        path: "/api/v1/machines/:id/services",
        auth: "Sessão · maquinas:read · perfil fazenda",
        description:
          "O histórico de serviços PRESTADOS com esta máquina (§32 do documento de Máquinas): quantos serviços, quanto foi faturado e a lista de cada um com cliente e quantidade. ⚠️ `quantidade_por_unidade` é um MAPA, nunca um número só: um trator que fez 12 horas de gradagem e 25 hectares de roçada não trabalhou 37 de nada. Serviços cancelados ficam de fora. Guard `maquinas`, e não `servicos`: quem pode ver a máquina pode ver o que ela fez.",
        response: `200
{ "data": { "machine_id": "cl...", "servicos": 2, "quantidade_por_unidade": { "hora": 12, "hectare": 25 }, "faturado": 6300, "linhas": [{ "description": "Gradagem", "quantidade": 12, "pricing": "hora", "contact_name": "Cliente João", "total": 1800 }] }, "meta": { "total": 2 } }`,
      },
    ],
  },
  {
    title: "Mão de Obra (Módulo 33, fase 1)",
    note: "O trabalhador fixo e o dinheiro dele. NÃO é folha de pagamento: os §35 e §41 do documento do cliente excluem eSocial, FGTS, INSS, férias, 13º, rescisão e ponto. Nenhum valor pago ou devido é gravado no trabalhador: tudo é `FinancialEntry` com `related_module: mao_de_obra` e `related_id` do trabalhador, o que faz conta a pagar, alerta de vencimento e DRE funcionarem sem nada novo. ⚠️ Permissão PRÓPRIA, mais fechada que a do financeiro: só OWNER e ADMIN, porque isto guarda salário.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workers",
        auth: "Sessão · mao_de_obra:read · perfil fazenda",
        description:
          "Lista a equipe (§38, \"Minha equipe\"), com o PRÓXIMO PAGAMENTO já junto de cada um. Filtros: `status` (ativo/inativo) e `property_id`. O `meta` traz `funcoes_sugeridas`, as dez funções do §6 que a tela oferece; a função em si é texto livre, porque a lista do documento termina em \"Outro\".",
        response: `200
{ "data": [{ "id": "cl...", "name": "João", "role": "Vaqueiro", "type": "fixo", "status": "ativo", "pay_frequency": "mensal", "pay_amount": 2500, "pay_day": 5, "proximo_pagamento": { "id": "cl...", "amount": 2500, "due_date": "2026-10-05T12:00:00.000Z" } }], "meta": { "total": 1, "funcoes_sugeridas": ["Vaqueiro", "..."] } }`,
      },
      {
        method: "POST",
        path: "/api/v1/workers",
        auth: "Sessão · mao_de_obra:write · perfil fazenda",
        description:
          "Cadastra um trabalhador (§5). No `fixo`, `pay_frequency` e `pay_amount` são obrigatórios e o cadastro JÁ CRIA a primeira previsão de pagamento (uma `FinancialEntry` pendente, §7 e §40.2). No `eventual` não: quem paga o diarista é a diária do §13, e frequência e valor nem são gravados.",
        request: `{ "name": "João", "role": "Vaqueiro", "type": "fixo", "pay_frequency": "mensal", "pay_amount": 2500, "pay_day": 5 }`,
        response: `201
{ "data": { "id": "cl...", "name": "João", "proximo_pagamento": { "amount": 2500, "due_date": "2026-09-05T12:00:00.000Z" } }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/workers/:id",
        auth: "Sessão · mao_de_obra:read · perfil fazenda",
        description:
          "O trabalhador e o histórico dele (§37): pagamentos, adiantamentos, gratificações e benefícios, pagos e pendentes. Quem separa um do outro é `kind` (`worker_entry_kind`), não a categoria, que é texto que o produtor renomeia no painel.",
        response: `200
{ "data": { "id": "cl...", "name": "João", "entries": [{ "id": "cl...", "kind": "adiantamento", "amount": 500, "status": "paid", "paid_at": "2026-09-02T00:00:00.000Z" }] }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/workers/:id",
        auth: "Sessão · mao_de_obra:write · perfil fazenda",
        description:
          "Edita o cadastro, ou muda a situação (§39). `{ \"status\": \"inativo\" }` sozinho muda só ela, e NÃO é inócuo: inativar apaga as previsões PENDENTES (um trabalhador que saiu não pode gerar conta a pagar nos meses seguintes) e preserva as pagas, que o §40.8 exige no histórico. Reativar recria a previsão, uma só.",
        request: `{ "pay_amount": 2800 }`,
        response: `200
{ "data": { "id": "cl...", "pay_amount": 2800 }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/workers/:id/payments",
        auth: "Sessão · mao_de_obra:write · perfil fazenda",
        description:
          "Registra dinheiro pago, com `kind` escolhendo o gesto. ⚠️ `pagamento` é o único que NÃO cria lançamento novo: ele QUITA a previsão pendente e faz a PRÓXIMA nascer, ancorada no vencimento da que foi paga (não na data em que o dinheiro saiu, senão pagar adiantado repetiria o mesmo mês e pagar atrasado pularia um). Sem previsão pendente ele devolve 404 em vez de inventar um valor, porque o §40.3 diz que o sistema prevê e o produtor confirma. `amount` opcional sobrescreve o previsto. Os outros três (`adiantamento`, `gratificacao`, `beneficio`, `outro`) criam lançamento já pago e NÃO abatem da previsão do mês: o §9 pede o adiantamento mostrado separado.",
        request: `{ "kind": "adiantamento", "amount": 500 }`,
        response: `201
{ "data": { "id": "cl...", "amount": 500 }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Serviços contratados e prestados (Módulos 33 e 34)",
    note: "As duas direções na mesma tabela: o serviço que a fazenda CONTRATA de terceiro (a diária do §13, o empreito do §15, o serviço por unidade do §16) e o que ela PRESTA com máquina própria (`direction: prestado`), que gera RECEITA em vez de despesa. ⚠️ Permissão `servicos`, OPERACIONAL e diferente da de `mao_de_obra`: OPERADOR registra serviço e continua sem enxergar salário. Nenhum saldo é gravado: o total combinado é derivado dos logs, o pago e o restante são somas de `FinancialEntry`, e os três podem divergir se o produtor editar um lançamento em `/financeiro`, que é onde o dinheiro de verdade mora. Manutenção de máquina NÃO entra aqui: é `MachineMaintenance`, na ficha da própria máquina.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/service-jobs",
        auth: "Sessão · servicos:read · perfil fazenda",
        description:
          "Lista os serviços, do mais recente para o mais antigo, cada um já com os quatro números do §22 (quantidade trabalhada, total combinado, pago, restante). Cancelados ficam de fora por padrão; use `incluir_cancelados=true`. Filtros: `status`, `property_id`, `contact_id`. O `meta` traz `servicos_sugeridos`, os 19 do §20 que a tela oferece; a descrição em si é texto livre.",
        response: `200
{ "data": [{ "id": "cl...", "description": "Reforma de cerca", "pricing": "dia", "unit_price": 150, "worker_count": 3, "quantidade": 4, "total": 1800, "pago": 0, "restante": 1800, "contact_name": "Turma da cerca" }], "meta": { "total": 1, "servicos_sugeridos": ["Construção de cerca", "..."] } }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-jobs",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "Registra um serviço. `direction` ausente vale `contratado`. `pricing: fechado` exige `agreed_amount` e ignora quantidade (é o empreito do §15); qualquer outra forma exige `unit_price`, e `quantity` vira o primeiro lançamento de quantidade. `worker_count` multiplica o VALOR e nunca a quantidade: o §14 diz que 3 homens por 4 dias são 12 diárias, mas o serviço durou 4 dias. `contact_name` sem `contact_id` cria o contato pelo nome dito. `pago: true` gera lançamento já quitado; sem ele nasce uma conta pelo total (a pagar no contratado, a RECEBER no prestado). ⚠️ `pago: true` com `due_date` é recusado: o §21 lista à vista e futuro como caminhos diferentes. ⚠️ No `prestado`, `machine_id` e o cliente são obrigatórios (§17); no `contratado`, `machine_id` é RECUSADO, apontando para Máquinas, porque manutenção e máquina de terceiro são `MachineMaintenance`. Os campos `client_location`, `implement`, `operator_worker_id` e `operator_note` são do prestado. O status vem da DATA: no futuro nasce `agendado` e entra na agenda do §39; no passado nasce `concluido`.",
        request: `{ "property_id": "cl...", "occurred_at": "2026-09-01T12:00:00.000Z", "description": "Reforma de cerca", "pricing": "dia", "unit_price": 150, "quantity": 4, "worker_count": 3, "contact_name": "Turma da cerca" }`,
        response: `201
{ "data": { "id": "cl...", "quantidade": 4, "total": 1800, "restante": 1800 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-jobs/:id",
        auth: "Sessão · servicos:read · perfil fazenda",
        description:
          "O serviço, os lançamentos de quantidade (`logs`) e os lançamentos financeiros (`entries`). É o que a tela do §22 usa para mostrar valor total, valor já pago, valor restante e próximo vencimento.",
        response: `200
{ "data": { "id": "cl...", "total": 10000, "pago": 3000, "restante": 7000, "logs": [], "entries": [{ "amount": 3000, "status": "paid" }, { "amount": 7000, "status": "pending" }] }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-jobs/:id/payments",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "Registra um pagamento, ou um RECEBIMENTO se o serviço for `prestado` (§21, §22, §26, §27). Cria um lançamento quitado e ENCOLHE a conta em aberto; quando ela zera, é apagada, porque conta de R$ 0,00 seria ruído no Financeiro. ⚠️ O sinal do lançamento vem da direção DO SERVIÇO, nunca do corpo: um recebimento gravado como despesa mostraria \"recebido R$ 3.000\" na tela e uma despesa de R$ 3.000 no DRE, com o saldo batendo. ⚠️ Pagar mais que o restante devolve 422 no campo `amount` dizendo quanto falta: sem essa recusa, um dedo pesado transforma R$ 700 em R$ 7.000 e os R$ 6.300 a mais viram lançamento fantasma. Serviço já quitado ou cancelado devolve 409.",
        request: `{ "amount": 3000 }`,
        response: `201
{ "data": { "pago": 3000, "restante": 7000 }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/service-jobs/:id",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "CANCELA o serviço, não apaga. Remove as contas a pagar PENDENTES (um serviço que não aconteceu não pode seguir gerando despesa no DRE dos meses seguintes) e preserva os lançamentos PAGOS, porque aquele dinheiro saiu de verdade. Os lançamentos de quantidade também ficam: o §40.8 exige histórico. Aceita `reason` opcional no corpo.",
        request: `{ "reason": "O tratorista não voltou" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-jobs/:id/logs",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "Acrescenta produção a um serviço que dura vários dias, sem criar um serviço novo (§19, §20). A conta em aberto acompanha o total novo. §33: informe `hour_meter_start` e `hour_meter_end` no lugar de `quantity`, e as horas saem da diferença; os dois juntos com `quantity` é recusado. O horímetro final atualiza `Machine.hour_meter`, e SÓ ANDA PARA A FRENTE (um lançamento fora de ordem não faz a máquina voltar). Serviço `fechado` (empreito) recusa quantidade: o §16 não calcula por hora ou hectare.",
        request: `{ "quantity": 7, "occurred_at": "2026-09-02T12:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "quantidade": 16, "total": 2400, "horas": null }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-jobs/:id/costs",
        auth: "Sessão · servicos:read · perfil fazenda",
        description:
          "Os custos do serviço (§21 a §25): a lista, o total e a soma por natureza. Cancelados ficam no histórico e saem da soma.",
        response: `200
{ "data": { "linhas": [], "total": 800, "por_natureza": { "mao_de_obra": 600, "pedagio": 200 } }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-jobs/:id/costs",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "Registra um custo. Com `kind: \"combustivel\"` ou `product_id`, é o combustível do §21: SE o produto existir no estoque, baixa a quantidade informada (§35); sem produto cadastrado, o custo entra do mesmo jeito, sem baixa. `amount` e `unit_price` são as duas formas do §22 de dizer o valor (o total informado vence); sem nenhum dos dois, o custo fica com valor nulo. ⚠️ O combustível NUNCA gera lançamento financeiro: o diesel já virou despesa quando foi comprado (decisão 17). Nas outras naturezas, `saiu_do_caixa: true` gera a despesa no Financeiro, apontando para o CUSTO, nunca para o serviço, para o dinheiro que saiu não aparecer como se o cliente tivesse pagado.",
        request: `{ "kind": "combustivel", "product_id": "cl...", "quantity": 80, "unit_price": 6 }`,
        response: `201
{ "data": { "id": "cl...", "kind": "combustivel", "amount": 480, "gerou_lancamento": false, "baixou_estoque": true }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/service-jobs/:id/status",
        auth: "Sessão · servicos:write · perfil fazenda",
        description:
          "Começa ou encerra o serviço (§42): `status: \"em_andamento\"` ou `\"concluido\"`. Concluir NÃO quita nada: o §42 pergunta se o cliente já pagou DEPOIS de mostrar quantidade, total e o que falta receber, e a resposta é outro passo (`POST .../payments`). Serviço cancelado devolve 409.",
        request: `{ "status": "concluido" }`,
        response: `200
{ "data": { "id": "cl...", "status": "concluido", "quantidade": 10, "total": 3000, "a_receber": 3000 }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/workers/:id/logs",
        auth: "Sessão · mao_de_obra:read · perfil fazenda",
        description:
          "As anotações do trabalhador: atividade (§12) e ausência (§34), da mais recente para a mais antiga. ⚠️ Guard `mao_de_obra`, e não `servicos`: quem não pode ver o salário de alguém não pode ver as faltas dele.",
        response: `200
{ "data": [{ "id": "cl...", "kind": "falta", "occurred_at": "2026-09-02T12:00:00.000Z", "description": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/workers/:id/logs",
        auth: "Sessão · mao_de_obra:write · perfil fazenda",
        description:
          "Registra atividade ou ausência. ⚠️ NADA aqui calcula nada, e isso é o requisito: o §34 diz que o Tibé não deve calcular consequências trabalhistas, então uma FALTA não gera desconto e não toca na previsão de pagamento. Férias, 13º, FGTS, INSS e rescisão continuam com o contador (§35). `atividade` exige descrição; as ausências dispensam, porque o tipo já é a informação inteira.",
        request: `{ "kind": "falta", "occurred_at": "2026-09-02T12:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "kind": "falta" }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/workers/:id/logs/:logId",
        auth: "Sessão · mao_de_obra:write · perfil fazenda",
        description:
          "Apaga uma anotação. ⚠️ Aqui apagar é apagar mesmo, e é a única exceção do módulo ao 'desativar, nunca apagar' que vale para Fazenda, Pasto, Contato e Trabalhador: uma anotação errada não é histórico de dinheiro, e registrar 'folga' no dia errado sem poder corrigir seria pior que perder a linha.",
        response: `200
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
        description:
          "Cria uma tarefa. Só o título é obrigatório: data, horário, responsável, prioridade, fazenda, observação e recorrência são opcionais. Horário e recorrência sem data são recusados.",
        request: `{ "title": "Vacinar os bezerros", "due_date": "2026-09-18T00:00:00.000Z", "due_time": "14:00", "priority": "urgente", "recurrence": "semanal" }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/tasks/:id",
        auth: "Sessão · tarefas:write",
        description:
          "Conclui, cancela ou edita uma tarefa. Concluir uma recorrente cria a próxima e devolve o id dela em `next_task_id`. Cancelar mantém o histórico.",
        request: `{ "status": "completed" }`,
        response: `200
{ "data": { "id": "cl...", "next_task_id": "cl..." }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/tasks/:id",
        auth: "Sessão · tarefas:write",
        description: "Apaga uma tarefa de vez. Para manter o histórico, use o PATCH com status cancelled.",
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/tasks/:id/postpone",
        auth: "Sessão · tarefas:write",
        description: "Adia uma tarefa pendente para outra data. Tarefa concluída ou cancelada é recusada.",
        request: `{ "due_date": "2026-09-19T00:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/meu-dia",
        auth: "Sessão · tarefas:read",
        description:
          "As seções do Meu Dia (atenção, hoje, próximos dias e sem data), já na ordem de importância. Lê ao vivo tarefas, contas, vacinas, serviços agendados, estadias e estoque baixo. `?property_id=` filtra por fazenda; item sem fazenda aparece em todas. Quem vê o Meu Empório recebe também os itens dele (origens `emporio_pagar`, `emporio_fiado`, `emporio_turno` (turno de caixa aberto desde antes de hoje, para quem trabalha na loja: \"Caixa 2 da Loja Centro aberto desde 03/11\"), `emporio_entrega` (soma das sangrias e malotes aguardando o gerente, para o Gestor da loja para cima: \"R$ 130,00 aguardando o gerente na Loja Centro\") e, só para o dono e o gerente geral, `emporio_equipe`: loja sem Gestor, sem data, com link para `/emporio/equipe`; com a loja no título). Quem é só da loja recebe apenas os itens do Empório, nenhuma seção da fazenda; a conta do Empório nunca entra para quem não o vê.",
        response: `200
{ "data": { "atencao": [...], "hoje": [{ "origem": "pagar", "titulo": "Pagar João", "valor": 2500, "dias": 0, "...": "..." }], "proximos": [...], "sem_data": [...] }, "meta": { "total": 12 } }`,
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
        description: "Lista lançamentos. Filtros: start, end (sobre due_date), entry_type, category, related_module, status, area (fazenda | emporio | tudo; inválido: 422 `area`). `area`: aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance.",
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
        description:
          "Quita a conta de uma vez. Desde o Módulo 35 isso registra um pagamento do SALDO restante: uma conta de R$ 10.000 com R$ 4.000 já pagos é quitada com um pagamento de R$ 6.000.",
        request: `{ "paid_at": "2026-07-10T00:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl...", "status": "paid", "paid_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial-entries/:id/payments",
        auth: "Sessão · financeiro:read",
        description:
          "Os pagamentos da conta, do mais recente para o mais antigo. `meta` traz o derivado: valor, pago, saldo e situacao (em_aberto, parcialmente_paga, paga, cancelada). O valor pago é sempre a SOMA dos pagamentos, nunca um campo gravado.",
        response: `200
{ "data": [{ "id": "cl...", "amount": 4000, "paid_at": "...", "method": "pix" }], "meta": { "total": 1, "valor": 10000, "pago": 4000, "saldo": 6000, "situacao": "parcialmente_paga" } }`,
      },
      {
        method: "POST",
        path: "/api/v1/financial-entries/:id/payments",
        auth: "Sessão · financeiro:write",
        description:
          "Registra um pagamento (ou recebimento) parcial, §13 e §14. Recusa com 422 e `field: \"amount\"` quando o valor estoura o saldo, e com ENTRY_CANCELLED quando a conta está cancelada. `method` é opcional: quem paga metade no PIX e metade em dinheiro registra dois pagamentos.",
        request: `{ "amount": 4000, "paid_at": "2026-09-10T00:00:00.000Z", "method": "pix", "notes": "primeira parcela" }`,
        response: `201
{ "data": { "id": "cl..." }, "meta": { "valor": 10000, "pago": 4000, "saldo": 6000, "situacao": "parcialmente_paga" } }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/financial-entries/:id/payments/:paymentId",
        auth: "Sessão · financeiro:write",
        description:
          "Desfaz um pagamento registrado por engano. A linha é apagada, e a conta volta a dever o que voltou a faltar: sai de 'paga' se deixar de estar coberta. O histórico do LANÇAMENTO continua intacto.",
        response: `200
{ "data": { "entry_id": "cl..." }, "meta": { "valor": 10000, "pago": 0, "saldo": 10000, "situacao": "em_aberto" } }`,
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
        description: "Saldo por período (regime de caixa), agrupado por dia ou mês. Query: start, end, group_by=day|month, related_module, area (fazenda | emporio | tudo; 422 `area`). `area`: aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance.",
        response: `200
{ "data": [{ "period": "2026-06", "income": 8000, "expense": 5200, "balance": 2800 }], "meta": { "group_by": "month" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/dre",
        auth: "Sessão · financeiro:read",
        description: "Receita e despesa agrupadas por módulo, com resultado por módulo e total geral. Query: start, end, area (fazenda | emporio | tudo; 422 `area`). `area`: aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance.",
        response: `200
{ "data": { "period": { "start": "2026-06-01", "end": "2026-06-30" }, "by_module": [{ "module": "rebanho", "total_income": 4500, "total_expense": 245, "result": 4255 }], "total_result": 4255 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/upcoming",
        auth: "Sessão · financeiro:read",
        description: "Lançamentos pending com due_date nos próximos 7 dias. Query: area (fazenda | emporio | tudo; 422 `area`). `area`: aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance.",
        response: `200
{ "data": [{ "id": "cl...", "entry_type": "expense", "category": "Combustível", "amount": 350, "due_date": "...", "related_module": "geral" }] }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report/link",
        auth: "Sessão · financeiro:read",
        description: "Gera um link assinado (HMAC, válido por 1h) para o PDF do relatório financeiro do período. Query: start, end, area (fazenda | emporio | tudo; 422 `area`). `area`: aceito e ignorado desde 07/11/2026: o Financeiro do Tibé é só da fazenda; o Empório tem o seu em /api/v1/emporio/finance. Usado pelo botão \"Exportar relatório\".",
        response: `200
{ "data": { "report_url": "https://.../api/v1/financial/report?token=...", "expires_in_seconds": 3600 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report",
        auth: "Público: autorização pelo token assinado, não por sessão (o link pode ser aberto fora do navegador logado, ex: WhatsApp)",
        description: "Gera o PDF sob demanda a partir do token e transmite direto na resposta (Content-Type: application/pdf). Não há armazenamento: o arquivo não fica salvo em nenhum lugar. O PDF é sempre da fazenda (o `area` do token é ignorado desde 07/11/2026).",
        response: `200: corpo binário (application/pdf), Content-Disposition: attachment
401 se o token for inválido ou tiver expirado`,
      },
    ],
  },
  {
    title: "Minha Lista de Compra (Módulo 36)",
    note: "Anotar um item NÃO é uma compra: nada aqui mexe em estoque ou financeiro. A compra só acontece por /purchase, que passa por Negociações.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/shopping-items",
        auth: "Sessão · rebanho:read · perfil fazenda ou emporio",
        description:
          "A lista. Sem ?status=, devolve os PENDENTES, urgentes primeiro. Filtros: status=pendente|comprado|removido, property_id, establishment_id, priority, place, purpose. meta.units traz as unidades para o seletor.",
        response: `200
{ "data": [{ "id": "cl...", "description": "Sal mineral", "quantity": 10, "unit": "saca", "priority": "urgente", "status": "pendente" }], "meta": { "total": 1, "units": [] } }`,
      },
      {
        method: "POST",
        path: "/api/v1/shopping-items",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Anota um item. Só description é obrigatória. `establishment_id` (opcional) liga o item a uma loja do Empório visível ao usuário (404 no campo se não for); junto com `property_id`, 422 no campo `establishment_id`. Item parecido já pendente é recusado com ITEM_JA_NA_LISTA (409) para que a pergunta do §19.7 possa ser feita; repetir com permitir_duplicata: true adiciona assim mesmo.",
        request: `{ "description": "Sal mineral", "quantity": 10, "unit": "saca", "priority": "urgente" }`,
        response: `201
{ "data": { "id": "cl...", "description": "Sal mineral", "quantity": 10, "unit": "saca", "priority": "urgente", "status": "pendente", "negotiation_id": null }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/shopping-items/:id",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Sem acao, edita os campos que vierem (a quantidade pode chegar depois). acao=concluir tira da lista sem gerar nada. acao=repetir cria um item novo igual, sem tocar no antigo. Item que já saiu da lista não é editável (NOT_EDITABLE).",
        request: `{ "acao": "concluir" }`,
        response: `200
{ "data": { "id": "cl...", "description": "Sal mineral", "status": "comprado", "priority": "urgente" }, "meta": {} }`,
      },
      {
        method: "DELETE",
        path: "/api/v1/shopping-items/:id",
        auth: "Sessão · rebanho:write · perfil fazenda ou emporio",
        description:
          "Remove da lista. NÃO apaga a linha: o item vira status removido e continua no histórico.",
        response: `200
{ "data": { "id": "cl...", "description": "Sal mineral", "status": "removido", "priority": "normal" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/shopping-items/:id/purchase",
        auth: "Sessão · rebanho:write · perfil fazenda (ou emporio, quando há loja)",
        description:
          "Com `establishment_id` (no corpo ou já no item) o item vira uma compra simples do Empório: à vista, recebida, um item, `operation_key` derivada do item (repetir não duplica); exige produto que esteja no Empório e a quantidade é lida na unidade-base; a resposta traz `purchase_id` e `negotiation_id: null`. Sem loja, o caminho da fazenda: o item vira compra de verdade: despesa, conta a pagar quando não foi à vista, e entrada no estoque, tudo por Negociações (type: compra_produto). Produto, quantidade e fazenda saem do item quando já estiverem lá. Item sem produto é recusado com PRODUTO_NECESSARIO no campo product_id: repita com product_id de um produto existente, ou com novo_produto para cadastrar na hora. A conclusão do item entra na MESMA transação da compra.",
        request: `{ "amount": 1800, "pago": true, "novo_produto": { "unit": "saca", "category_id": "cl..." } }`,
        response: `201
{ "data": { "item_id": "cl...", "negotiation_id": "cl...", "product_id": "cl..." }, "meta": {} }`,
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
        method: "POST",
        path: "/api/v1/alerts/:id/shopping-item",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description:
          "Manda o produto de um alerta low_stock para a Lista de Compra (Módulo 36, §13), com unidade e categoria já preenchidas, e dispensa o alerta. Nunca roda sozinho: o sistema não adiciona sem confirmação. Produto já pendente na lista devolve ITEM_JA_NA_LISTA (409); repita com permitir_duplicata: true.",
        request: `{ "permitir_duplicata": false }`,
        response: `201
{ "data": { "id": "cl...", "description": "Sal mineral", "status": "pendente", "priority": "normal" }, "meta": {} }`,
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
    note: "Push é por PESSOA: um alerta vai para os aparelhos de quem o recebe, nunca para os de outra pessoa do mesmo tenant, e é o resultado DESSA pessoa que decide se o WhatsApp entra como reserva. A inscrição guarda o endpoint do navegador porque uma pessoa pode ter vários aparelhos. Inscrição que o serviço de push reporta morta (404/410) some na hora; três falhas seguidas de outro tipo também.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/notifications/public-key",
        auth: "Sessão",
        description: "Devolve a chave pública VAPID que o navegador precisa para criar a inscrição. Quando o push não está configurado no ambiente (VAPID ausente), responde 200 com `vapid_public_key: null`: ausência não é erro, e o cliente simplesmente não oferece o push.",
        response: `200
{ "data": { "vapid_public_key": "BEl62i..." }, "meta": {} }`,
      },
      {
        method: "GET",
        path: "/api/v1/notifications/subscribe",
        auth: "Sessão",
        description: "Se o servidor conhece este aparelho (`?endpoint=`) para a pessoa da sessão. A tela de alertas usa para não dizer \"ativas neste navegador\" sobre uma inscrição que o servidor já podou.",
        response: `200
{ "data": { "subscribed": true }, "meta": {} }`,
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
        description: "Cancela a inscrição daquele endpoint (o usuário desliga a notificação no aparelho). `deleted` diz quantas linhas saíram: 0 quando o endpoint não é desta pessoa, e aí `unsubscribed` é false.",
        request: `{ "endpoint": "https://fcm.googleapis.com/fcm/send/..." }`,
        response: `200
{ "data": { "unsubscribed": true, "deleted": 1 }, "meta": {} }`,
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
        description: "Executa a intenção já classificada pelo LLM, roteando para as mesmas lib/actions/* usadas pelo painel web. Loga a interação em AgentConversationLog. Desde a Fase 2 do agente, com a mesma resposta: por dentro grava o cursor da conversa e confere o usuário (ativo, no tenant) antes do replay.",
        request: `{ "tenant_id": "cl...", "user_id": "cl...", "intent": "registrar_peso", "parameters": { "ear_tag": "1234", "weight": 382 }, "message_text": "o boi 1234 pesou 382" }`,
        response: `200
{ "data": { "reply_text": "Peso de 382 kg registrado para o animal 1234. GMD: 0.65 kg/dia.", "requires_confirmation": false, "auxiliary_data": {}, "report_url": null } }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/turno",
        auth: "Header x-internal-secret",
        description:
          "Turno inteiro do agente (Fase 2): recebe a mensagem consolidada, identifica o contato pelo telefone, entende a mensagem no Tibé (cursor da conversa quando há pergunta aberta, senão classificação em duas etapas por LLM), executa cada pedido pelo mesmo núcleo do execute-action e devolve as mensagens a enviar. `pode_humanizar` só é true para texto sem número, sem confirmação pendente e sem pergunta. `texto` só pode vir vazio com `recibo` (lido por imagem no n8n), que vai direto ao lançamento financeiro, sem classificar. Idempotente por `provider_message_id`: o reenvio devolve as mesmas mensagens com `replay: true`. Falha do modelo ou erro interno devolve as respostas já produzidas seguidas de uma frase fixa, sem registrar o turno: antes de executar qualquer pedido, a frase pede para mandar de novo; depois, avisa que parte pode já ter sido registrada e pede para conferir antes.",
        request: `{ "telefone": "5522999990000", "texto": "quantos animais eu tenho e o que tenho a pagar", "provider_message_id": "wamid.HBgM...", "recibo": null }`,
        response: `200
{ "data": { "mensagens": [{ "texto": "Seu rebanho possui atualmente 23 animais.\\nFêmeas: 3 | Machos: 20", "pode_humanizar": false, "report_url": null }, { "texto": "Nenhuma conta a pagar no período.", "pode_humanizar": true, "report_url": null }], "replay": false }, "meta": {} }`,
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
        method: "GET",
        path: "/api/platform/tenants/:id/features",
        auth: "Sessão de PlatformUser · equipe e master_admin",
        description: "Recursos em rollout da conta (Módulo 39): uma entrada por recurso conhecido. Recurso nunca ligado vem `enabled: false` e `user_ids: []`.",
        response: `200
{ "data": [{ "feature_key": "emporio", "enabled": true, "user_ids": [] }], "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/platform/tenants/:id/features/:key",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Liga ou desliga um recurso da conta. `user_ids` (opcional) restringe a quem da conta vê; vazio ou ausente libera a conta inteira, e a lista enviada substitui a anterior. Ligar `emporio` também ativa o perfil `emporio`; desligar só o desativa, sem apagar dado. 404 `NOT_FOUND` para chave ou conta desconhecida, 422 em `user_ids` quando algum usuário não é da conta.",
        request: `{ "enabled": true, "user_ids": ["cl..."] }`,
        response: `200
{ "data": { "feature_key": "emporio", "enabled": true, "user_ids": ["cl..."] }, "meta": {} }`,
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
