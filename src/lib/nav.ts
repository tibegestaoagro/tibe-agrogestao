import { hasMinRole, canAccess } from "@/lib/permissions";
import type { NavItem } from "@/components/layout/sidebar";
import type { AppUserRole } from "@/types/next-auth";
import { paginaPermitidaAoSoDaLoja } from "@/lib/emporio/paginas-do-so-da-loja";

/**
 * Constrói a navegação lateral (auditoria de arquitetura, 2026-08-04:
 * extraído de (dashboard)/layout.tsx, que era o arquivo mais editado do
 * projeto por misturar isso com gate de sessão/billing e busca de dados).
 * Função pura: só depende de role/perfis, testável sem sessão nem Prisma.
 *
 * Fase 1 do briefing de layout (docs/design/briefing-novo-layout.md):
 * reagrupa os 12 links planos de sempre em 7 entradas, seguindo a IA do
 * mockup do cliente. Nenhuma regra de permissão nova: "Configurações da
 * conta" aponta pro hub /configuracoes, que já é gated por
 * hasMinRole("ADMIN") e já lista Usuários/Assinatura internamente (a
 * segunda com o gate extra de OWNER): evita duplicar essa checagem aqui.
 */
export function buildNavItems({
  role,
  hasFazenda,
  hasPrestador,
  hasEmporio,
  soDaLoja = false,
  veHistoricoDoEmporio = false,
}: {
  role: AppUserRole;
  hasFazenda: boolean;
  hasPrestador: boolean;
  hasEmporio: boolean;
  /** F6b (Q120): Gestor, Vendedor e Gerente geral "só da loja" veem apenas as páginas permitidas a eles. */
  soDaLoja?: boolean;
  /** F6b (Q134): o Histórico é do Dono, do Gerente geral e do Gestor; o Vendedor nunca o vê. */
  veHistoricoDoEmporio?: boolean;
}): NavItem[] {
  const itens = montarItens({ role, hasFazenda, hasPrestador, hasEmporio, veHistoricoDoEmporio });
  return soDaLoja ? restringirAoSoDaLoja(itens) : itens;
}

/** A mesma lista que o layout usa para barrar a URL: o menu nunca oferece o que o layout fecharia. */
function restringirAoSoDaLoja(itens: NavItem[]): NavItem[] {
  const saida: NavItem[] = [];
  for (const item of itens) {
    if (item.kind === "link") {
      if (item.show && paginaPermitidaAoSoDaLoja(item.href)) saida.push(item);
    } else if (item.kind === "group") {
      const filhos = item.children.filter((c) => c.show && paginaPermitidaAoSoDaLoja(c.href));
      if (filhos.length > 0) saida.push({ ...item, children: filhos });
    }
  }
  return saida;
}

function montarItens({
  role,
  hasFazenda,
  hasPrestador,
  hasEmporio,
  veHistoricoDoEmporio,
}: {
  role: AppUserRole;
  hasFazenda: boolean;
  hasPrestador: boolean;
  hasEmporio: boolean;
  veHistoricoDoEmporio: boolean;
}): NavItem[] {
  return [
    /*
     * Módulo 38, §4: o Meu Dia é a porta de entrada, e por isso vem PRIMEIRO,
     * com o ícone de casa. O `/dashboard` continua existindo como "Painel",
     * com os gráficos e indicadores que o §52 proíbe no Meu Dia. Decisão do
     * usuário em 14/09/2026, com as quatro áreas no ar.
     */
    { kind: "link", href: "/meu-dia", label: "Meu Dia", icon: "home", show: true },
    { kind: "link", href: "/dashboard", label: "Painel", icon: "painel", show: true },
    // "Minha Fazenda" (Módulo 29): tela própria de cadastro da fazenda +
    // pastos, ponto de partida do sistema (docs/Minha Fazenda —
    // Especificação Funcional.doc). Antes deste módulo, "Minha Fazenda" era
    // o nome do grupo abaixo (Rebanho/Máquinas/.../Alertas): renomeado pra
    // "Operação" pra não colidir com o novo significado (decisão do
    // usuário, 2026-08-04).
    { kind: "link", href: "/minha-fazenda", label: "Minha Fazenda", icon: "fazenda", show: hasFazenda },
    // Módulo 39 (Q17): o Empório é uma área à parte, liberada por conta pela
    // Plataforma. `hasEmporio` já vem resolvido no layout (recurso visível para
    // o usuário E perfil ativo), não só pelo perfil.
    { kind: "link", href: "/emporio", label: "Meu Empório", icon: "emporio", show: hasEmporio },
    { kind: "link", href: "/emporio/historico", label: "Histórico", icon: "historico", show: hasEmporio && veHistoricoDoEmporio },
    {
      kind: "group",
      label: "Operação",
      icon: "operacao",
      show: true,
      children: [
        { href: "/rebanho", label: "Rebanho", show: hasFazenda },
        // Fase 3 do Módulo 30: o confinamento é a mesma contabilidade de
        // cabeças do Rebanho, só que fora do pasto (§3 do documento do
        // cliente: "o animal continua pertencendo ao produtor"). Fica ao
        // lado de Rebanho pelo mesmo motivo que Negociações fica perto dele.
        { href: "/confinamento", label: "Confinamento", show: hasFazenda },
        // Módulo 32, fase 1: a Área Leite. Fica ao lado de Rebanho porque as
        // vacas em lactação SÃO o rebanho, só que numa condição (§37.2 do
        // documento do cliente): a área não altera o total do rebanho, e a
        // vizinhança na navegação é o que diz isso antes de qualquer texto.
        { href: "/leite", label: "Leite", show: hasFazenda },
        // Módulo 31: "Negociações" substitui a nomenclatura "Compra e Venda"
        // (§1), porque as relações comerciais da fazenda não se limitam a
        // comprar e vender. Fica ao lado de Rebanho porque é de lá que sai a
        // maior parte do que se negocia.
        { href: "/negociacoes", label: "Negociações", show: hasFazenda },
        // Fase 0 dos Módulos 33 e 34: a agenda de pessoas. Fica logo depois de
        // Negociações porque é de lá que a maior parte dos contatos nasce
        // (`findOrCreateContact`, a partir do nome dito na conversa do
        // WhatsApp), e esta é a primeira tela que permite editar e arquivar o
        // que aquele caminho criou sozinho.
        // Módulo 39: Contatos e Lista de Compra são compartilhados com o
        // Empório (o grupo se esconde sozinho quando nenhum filho aparece).
        { href: "/contatos", label: "Contatos", show: hasFazenda || hasEmporio },
        // Módulo 33: quem trabalha na fazenda. Fica depois de Contatos porque é
        // a mesma pergunta ("quem"), separada pelo §36 do documento: aqui mora
        // quem recebe salário ou diária, e em Contatos quem entrega serviço.
        //
        // ⚠️ `show` inclui a permissão, e é o único item deste menu que o faz:
        // `mao_de_obra` guarda salário e é fechado a OPERADOR e VISUALIZADOR.
        // Sem esta checagem, os dois veriam um link que só leva a um redirect.
        {
          href: "/mao-de-obra",
          label: "Mão de Obra",
          show: hasFazenda && canAccess(role, "mao_de_obra"),
        },
        // Fase 33.2: o serviço contratado. Fica ao lado de Mão de Obra porque é
        // a outra metade da mesma pergunta do §36 (quem trabalha x quem entrega
        // serviço), e separado dela porque a PERMISSÃO é outra: OPERADOR
        // registra serviço e não vê salário. É por isso que os dois itens têm
        // `canAccess` diferente, e não é descuido.
        {
          href: "/servicos",
          label: "Serviços",
          show: hasFazenda && canAccess(role, "servicos"),
        },
        // Módulo 31, §9 e §10: o estoque de insumos. Fica depois de
        // Negociações porque é de lá que a maior parte do que entra vem: uma
        // compra de produto abastece o estoque, e o uso é a outra ponta.
        { href: "/estoque", label: "Estoque", show: hasFazenda },
        // Módulo 36: fica colado no Estoque porque é a outra ponta dele. O que
        // está acabando vira item da lista, e o item comprado volta como
        // entrada de estoque.
        { href: "/lista-de-compra", label: "Lista de Compra", show: hasFazenda || hasEmporio },
        { href: "/maquinas", label: "Máquinas", show: hasFazenda },
        { href: "/lavoura", label: "Lavoura", show: hasFazenda },
        { href: "/prestador", label: "Prestador", show: hasPrestador },
        { href: "/financeiro", label: "Financeiro", show: true },
        { href: "/alertas", label: "Alertas", show: true },
      ],
    },
    { kind: "link", href: "/calculadoras", label: "Calculadora Pecuária", icon: "calculadora", show: true },
    // "Fazenda em Números" (Fase 2): esclarecido pelo usuário como área de
    // inteligência que centraliza os relatórios (DRE, evolução do rebanho,
    // produtividade, faturamento), não mais um placeholder "em breve".
    { kind: "link", href: "/relatorios", label: "Fazenda em Números", icon: "numeros", show: true },
    // "WhatsApp" continua sem conteúdo real (nenhum número de contato
    // configurado em lugar nenhum do código ainda): segue desabilitado.
    { kind: "soon", label: "WhatsApp", icon: "whatsapp" },
    {
      kind: "group",
      label: "Configurações",
      icon: "configuracoes",
      show: true,
      children: [
        { href: "/configuracoes", label: "Configurações da conta", show: hasMinRole(role, "ADMIN") },
        // Perfil e senha não são privilégio de papel: todo usuário precisa
        // alcançar isso, inclusive quem não vê o resto (Módulo 19).
        { href: "/configuracoes/perfil", label: "Perfil", show: true },
        { href: "/configuracoes/senha", label: "Minha senha", show: true },
      ],
    },
  ];
}
