import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import { canAccess, canWrite } from "@/lib/permissions";
import { INTENT_ACCESS, type Intent } from "@/lib/whatsapp-intents";
import type { RouterResult, HandlerCtx, Handler } from "@/lib/actions/whatsapp-handlers/shared";
import {
  cadastrarAnimal,
  registrarLoteAnimal,
  registrarPeso,
  registrarVacina,
  registrarPrevisaoVacina,
  registrarMovimento,
  consultarAnimal,
} from "@/lib/actions/whatsapp-handlers/rebanho";
import { cadastrarServicoOrdem, consultarCliente } from "@/lib/actions/whatsapp-handlers/prestador";
import {
  consultarSaldo,
  gerarRelatorio,
  registrarLancamentoFinanceiro,
} from "@/lib/actions/whatsapp-handlers/financeiro";
import { criarTarefa } from "@/lib/actions/whatsapp-handlers/tarefas";
import {
  consultarRebanho,
  registrarMovimentacaoRebanho,
} from "@/lib/actions/whatsapp-handlers/herd";
import { registrarNegocioGado } from "@/lib/actions/whatsapp-handlers/negociacao";
import { resolveCategoryTerm } from "@/lib/herd/categories";
import {
  registrarNegocioProduto,
  registrarUsoEstoque,
  ajustarEstoque,
  consultarEstoque,
  resolverProduto,
} from "@/lib/actions/whatsapp-handlers/estoque";
import { loadPendingNegotiation } from "@/lib/actions/negotiation-pending";
import { loadPendingStock } from "@/lib/actions/stock-pending";
import { ajuda } from "@/lib/actions/whatsapp-handlers/ajuda";
import { resumo } from "@/lib/actions/whatsapp-handlers/resumo";
import { handleActiveFlow, maybeStartAnimalFlow } from "@/lib/actions/whatsapp-flow-bridge";

export type { RouterResult } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Roteador de intenções do agente WhatsApp (spec 3.5). Recebe a intenção já
 * classificada (pelo LLM, no N8N) e os parâmetros extraídos, checa
 * permissão/perfil e despacha para o handler da intenção (um por domínio em
 * src/lib/actions/whatsapp-handlers/*), que reusa a mesma lógica de negócio
 * dos Módulos 1/2 e devolve uma resposta em português pronta para envio.
 *
 * O Record abaixo é exaustivo por construção: uma intenção nova em
 * whatsapp-intents.ts que não ganhar entrada aqui é erro de compilação, não
 * silêncio em produção.
 */
/** As intenções do estoque, para a guarda de resposta não agir sobre elas mesmas. */
const EH_ESTOQUE: ReadonlySet<string> = new Set([
  "registrar_negocio_produto",
  "registrar_uso_estoque",
  "ajustar_estoque",
  "consultar_estoque",
]);

/** Texto não vazio, sem arrastar o helper do módulo de handlers para cá. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const HANDLERS: Record<Exclude<Intent, "ambigua">, Handler> = {
  cadastrar_animal: cadastrarAnimal,
  registrar_lote_animal: registrarLoteAnimal,
  registrar_peso: registrarPeso,
  registrar_vacina: registrarVacina,
  registrar_previsao_vacina: registrarPrevisaoVacina,
  registrar_movimento: registrarMovimento,
  cadastrar_servico_ordem: cadastrarServicoOrdem,
  consultar_saldo: consultarSaldo,
  consultar_animal: consultarAnimal,
  consultar_rebanho: consultarRebanho,
  registrar_movimentacao_rebanho: registrarMovimentacaoRebanho,
  registrar_negocio_gado: registrarNegocioGado,
  registrar_negocio_produto: registrarNegocioProduto,
  registrar_uso_estoque: registrarUsoEstoque,
  ajustar_estoque: ajustarEstoque,
  consultar_estoque: consultarEstoque,
  consultar_cliente: consultarCliente,
  gerar_relatorio: gerarRelatorio,
  registrar_lancamento_financeiro: registrarLancamentoFinanceiro,
  criar_tarefa: criarTarefa,
  ajuda,
  resumo,
};

/**
 * DESEMPATE ENTRE AS DUAS INTENÇÕES DE COMPRA E VENDA, EM CÓDIGO.
 *
 * "Comprei 20 bezerros" satisfaz tanto `registrar_movimentacao_rebanho` (com
 * `movement_type: "compra"`) quanto `registrar_negocio_gado`. Deixar a escolha
 * só para o prompt do classificador significaria dois caminhos de escrita para
 * o mesmo gesto, e a decisão 1 da spec deste módulo descarta isso com o
 * argumento de que "caminho duplicado é onde o dado diverge".
 *
 * A regra: **compra e venda de gado são SEMPRE negócio**, com ou sem valor na
 * frase.
 *
 * Uma versão anterior exigia valor para converter, e o que ficava sem valor
 * seguia pelo rebanho. O efeito era o oposto do que o documento do cliente
 * pede: "Comprei 20 bezerros" registrava 20 cabeças e ZERO dinheiro, em
 * silêncio, enquanto o §6.1 e o §7.1 listam o valor total como informação
 * OBRIGATÓRIA, o §17.3 e o §17.4 dizem que a compra "aumenta o Rebanho e gera
 * despesa ou conta a pagar", e o §18.6 manda o assistente PERGUNTAR o dado que
 * falta. Perguntar é o que o handler de negócio já faz ("Por quanto você
 * comprou?"), e é a resposta certa.
 *
 * De quebra, isso mantém a conversa inteira num único pendente: com a regra
 * antiga, "comprei 10 novilhas" abria um pendente no rebanho e o "por 45 mil"
 * seguinte trocava de handler, abrindo um pendente vazio do outro lado, e o
 * produtor ouvia de novo "quantos animais e de qual categoria?".
 *
 * Correção de livro-razão sem dinheiro continua possível pelos tipos que não
 * são comerciais (`saldo_inicial`, `ajuste`, `nascimento`, `morte`,
 * transferências), que é o que eles significam.
 *
 * Função pura, testada em `test:m36`: a regra não pode viver só no prompt.
 */
export function desempatarIntencao(
  intent: Intent,
  parameters: Record<string, unknown>,
): Intent {
  /**
   * PRODUTO QUE NA VERDADE É GADO.
   *
   * O classificador pode mandar `registrar_negocio_produto` para "comprei 20
   * bezerros", porque a frase tem a mesma forma da compra de insumo. Quando o
   * item dito é uma CATEGORIA DE REBANHO conhecida, isso é decidível em código,
   * sem consultar nada: `resolveCategoryTerm` é a mesma função que traduz
   * "novilha" no rebanho.
   *
   * O caminho contrário (gado que é produto) precisa do catálogo do tenant e
   * por isso mora em `routeIntent`, que tem banco.
   */
  if (intent === "registrar_negocio_produto") {
    const item =
      typeof parameters.produto === "string"
        ? parameters.produto
        : typeof parameters.product === "string"
          ? parameters.product
          : typeof parameters.item === "string"
            ? parameters.item
            : null;
    if (item && resolveCategoryTerm(item).kind === "exact") return "registrar_negocio_gado";
    return intent;
  }

  if (intent !== "registrar_movimentacao_rebanho") return intent;

  const tipo = typeof parameters.movement_type === "string" ? parameters.movement_type : parameters.tipo;
  if (tipo !== "compra" && tipo !== "venda") return intent;

  return "registrar_negocio_gado";
}

/**
 * GADO QUE NA VERDADE É PRODUTO.
 *
 * "Comprei 10 sacas de sal por 1200" chega como `registrar_negocio_gado`
 * sempre que o classificador generaliza a partir dos exemplos de compra de
 * boi, e sem esta guarda o produtor ouviria "qual categoria de animal?" depois
 * de falar de sal.
 *
 * Precisa do banco, porque o que separa os dois é o CATÁLOGO do tenant: só
 * quem cadastrou "Sal mineral 60 P" tem sal.
 *
 * ESTREITA DE PROPÓSITO, e cada condição existe para não repetir o erro que a
 * guarda gêmea do Módulo 30 cometeu (agir demais e engolir assunto novo):
 *
 * - só quando NÃO há categoria de rebanho reconhecível na mensagem;
 * - só quando o item casa com EXATAMENTE um produto do catálogo;
 * - só quando não existe negócio de gado pendente, para nunca sequestrar uma
 *   conversa em andamento no meio de uma pergunta.
 */
async function pareceNegocioDeProduto(
  db: TenantPrismaClient,
  parameters: Record<string, unknown>,
): Promise<boolean> {
  const item =
    typeof parameters.produto === "string"
      ? parameters.produto
      : typeof parameters.product === "string"
        ? parameters.product
        : typeof parameters.item === "string"
          ? parameters.item
          : typeof parameters.categoria === "string"
            ? parameters.categoria
            : null;
  if (!item) return false;
  if (resolveCategoryTerm(item).kind === "exact") return false;

  const resolvido = await resolverProduto(db, item);
  return resolvido.ok;
}

export async function routeIntent(
  db: TenantPrismaClient,
  ctx: {
    tenant_id: string;
    role: AppUserRole;
    activeProfiles: ProfileType[];
    intent: Intent;
    parameters: Record<string, unknown>;
    /** true quando o N8N/usuário confirmou explicitamente a ação pendente. */
    confirmed: boolean;
    /** true quando o usuário recusou explicitamente ("não", "cancela"...). */
    explicitNo: boolean;
    /** Necessários para o cadastro assistido (2026-07-30): o estado é por usuário. */
    user_id?: string;
    message_text?: string | null;
  },
): Promise<RouterResult> {
  const { tenant_id, role, activeProfiles, parameters, confirmed, explicitNo } = ctx;
  // O desempate vem antes de qualquer checagem: a permissão e o handler têm
  // que ser os da intenção que vai de fato executar.
  let intent = desempatarIntencao(ctx.intent, parameters);

  /**
   * A RESPOSTA a uma pergunta pendente volta para quem perguntou.
   *
   * `desempatarIntencao` decide pela frase, e uma resposta curta não tem
   * frase: "de 13 a 24 meses" não carrega `movement_type` nenhum. Sem esta
   * guarda, o produtor que respondia a pergunta do assistente sobre um NEGÓCIO
   * caía no handler de rebanho e ouvia "não entendi que tipo de movimentação
   * é", enquanto o negócio dele seguia guardado, esperando a mesma resposta que
   * ele acabou de dar. É a família da pergunta repetida que custou uma rodada
   * de teste no Módulo 30, e foi reproduzida por um revisor independente com o
   * roteiro de aparelho na mão.
   *
   * ESTREITA DE VERDADE: só age quando a mensagem NÃO traz um
   * `movement_type` próprio.
   *
   * A primeira versão desta guarda convertia qualquer movimentação de rebanho
   * enquanto houvesse negócio pendente, e criou o problema oposto ao que
   * resolvia: "morreu 1 bezerro", dito no meio de uma compra em andamento, era
   * engolido e respondido com "Por quanto você comprou?". A morte nunca era
   * registrada e o produtor não era avisado de nada, por até 15 minutos (o TTL
   * do pendente). Um animal morto que some do registro é exatamente o erro que
   * o produtor só descobre quando o saldo não bate.
   *
   * A distinção que importa: uma RESPOSTA ("de 13 a 24 meses") não carrega
   * tipo de movimentação, porque não é uma frase sobre movimentação. Uma
   * mensagem que carrega `movement_type` é assunto novo, e assunto novo
   * interrompe o registro em andamento, que é o comportamento certo e já
   * existia.
   *
   * O par em código é o que importa aqui: sem ele, lembrar do contexto viraria
   * responsabilidade do prompt, que é justamente o que este módulo evita.
   */
  if (ctx.user_id && intent === "registrar_movimentacao_rebanho") {
    const tipoProprio =
      typeof parameters.movement_type === "string" ? parameters.movement_type : parameters.tipo;
    if (!tipoProprio) {
      /**
       * Inclui o pendente de CONFIRMAÇÃO de propósito.
       *
       * O "sim" também chega sem `movement_type`, e o classificador às vezes o
       * devolve como `registrar_movimentacao_rebanho` (é o formato que ele usa
       * para responder). Excluir a confirmação fazia o produtor ouvir "não
       * tenho nenhum registro esperando confirmação" enquanto o negócio dele
       * seguia guardado por 15 minutos: o defeito oposto ao que esta guarda
       * corrige, no mesmo trecho.
       */
      const negocioEsperando = await loadPendingNegotiation(tenant_id, ctx.user_id);
      if (negocioEsperando) intent = "registrar_negocio_gado";
    }
  }

  /**
   * Ver `pareceNegocioDeProduto`: o classificador manda compra de insumo pelo
   * caminho do gado, e sem isto o produtor que falou de sal ouve "qual
   * categoria de animal?".
   *
   * A mensagem que traz um PRODUTO do catálogo é assunto novo, e assunto novo
   * interrompe o anterior: o handler de estoque, ao guardar o pedido dele,
   * apaga o pendente de gado (`stock-pending.ts`).
   *
   * A primeira versão desta guarda fazia o contrário, recusando o desvio
   * enquanto houvesse pendente de gado, e criou o defeito que um revisor
   * reproduziu ao vivo: o produtor confirmava uma compra de R$ 600 de sal e o
   * "sim" executava um negócio de 20 bezerros de R$ 60.000 pendente de 15
   * minutos antes.
   */
  if (intent === "registrar_negocio_gado" && (await pareceNegocioDeProduto(db, parameters))) {
    intent = "registrar_negocio_produto";
  }

  /**
   * A RESPOSTA a uma pergunta do ESTOQUE volta para o estoque.
   *
   * Gêmea da guarda de rebanho acima, e pelo mesmo motivo: "60 mil" ou "2" não
   * carregam assunto nenhum, e o classificador devolve a intenção que achar
   * mais provável. Sem isto, responder o valor de uma compra de sal caía no
   * handler de gado, e o pendente de estoque ficava esperando a resposta que o
   * produtor acabou de dar.
   *
   * ESTREITA: só age quando a mensagem NÃO traz produto nem categoria de
   * rebanho própria, ou seja, quando ela de fato é só uma resposta.
   */
  if (ctx.user_id && !EH_ESTOQUE.has(intent)) {
    const semAssuntoProprio =
      !str(parameters.produto) &&
      !str(parameters.product) &&
      !str(parameters.categoria) &&
      !str(parameters.item);
    if (semAssuntoProprio) {
      const estoqueEsperando = await loadPendingStock(tenant_id, ctx.user_id);
      if (estoqueEsperando) intent = estoqueEsperando.intent;
    }
  }

  // Cadastro assistido tem prioridade sobre o roteamento normal: se existe um
  // formulário em andamento, a mensagem é primeiro oferecida a ele. O bridge
  // devolve null quando a mensagem claramente não é resposta de campo, e aí o
  // fluxo segue normalmente (a interrupção é respondida e o formulário retomado
  // logo em seguida).
  if (ctx.user_id) {
    const flowResult = await handleActiveFlow({
      db,
      userId: ctx.user_id,
      intent,
      messageText: ctx.message_text ?? null,
      confirmed,
      explicitNo,
    });
    if (flowResult) return flowResult;
  }

  // Permissão por módulo/role e por perfil ativo (spec: "visualizador não
  // consegue cadastrar nada via WhatsApp"). "ambigua" não tem módulo, cai
  // fora do gate abaixo do mesmo jeito que "gerar_relatorio" (module: null
  // em INTENT_ACCESS: o módulo real só se sabe depois de ler
  // parameters.tipo, então gerarRelatorio() faz sua própria checagem de
  // canAccess()/perfil internamente).
  if (intent !== "ambigua") {
    const rule = INTENT_ACCESS[intent];
    if (rule.module) {
      const allowed =
        rule.action === "write" ? canWrite(role, rule.module) : canAccess(role, rule.module);
      if (!allowed) {
        return {
          reply_text: "Você não tem permissão para executar essa ação.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: `${intent}:sem_permissao`,
        };
      }
    }
    if (rule.profile && !activeProfiles.includes(rule.profile)) {
      const label = rule.profile === "fazenda" ? "Fazenda" : "Prestador de Serviço";
      return {
        reply_text: `Esse recurso requer o perfil "${label}" ativo, que não está habilitado para sua empresa.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `${intent}:perfil_inativo`,
      };
    }
  }

  if (intent === "ambigua") {
    return {
      reply_text:
        "Não entendi. Posso cadastrar novas informações ou te contar o que já está cadastrado: me diga o que você precisa, ou pergunte 'o que você faz?' que eu te mostro as opções.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "ambigua",
    };
  }

  // "quero cadastrar bois, me ajuda": sem os campos, abre o modo assistido em
  // vez de despejar a lista inteira de campos numa mensagem só.
  if (intent === "cadastrar_animal" && ctx.user_id) {
    const started = await maybeStartAnimalFlow(db, ctx.user_id, parameters);
    if (started) return started;
  }

  // `user_id` chega aos handlers para o estado de conversa por usuário (o
  // pendente de rebanho, Módulo 30 §14). Opcional: rota interna sem usuário
  // resolvido continua funcionando, só sem memória de pergunta pendente.
  const handlerCtx: HandlerCtx = {
    db,
    tenant_id,
    role,
    activeProfiles,
    parameters,
    confirmed,
    explicitNo,
    user_id: ctx.user_id,
  };
  return HANDLERS[intent](handlerCtx);
}
