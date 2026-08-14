import { hasMinRole } from "@/lib/permissions";
import type { NavItem } from "@/components/layout/sidebar";
import type { AppUserRole } from "@/types/next-auth";

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
}: {
  role: AppUserRole;
  hasFazenda: boolean;
  hasPrestador: boolean;
}): NavItem[] {
  return [
    { kind: "link", href: "/dashboard", label: "Início", icon: "home", show: true },
    // "Minha Fazenda" (Módulo 29): tela própria de cadastro da fazenda +
    // pastos, ponto de partida do sistema (docs/Minha Fazenda —
    // Especificação Funcional.doc). Antes deste módulo, "Minha Fazenda" era
    // o nome do grupo abaixo (Rebanho/Máquinas/.../Alertas): renomeado pra
    // "Operação" pra não colidir com o novo significado (decisão do
    // usuário, 2026-08-04).
    { kind: "link", href: "/minha-fazenda", label: "Minha Fazenda", icon: "fazenda", show: hasFazenda },
    {
      kind: "group",
      label: "Operação",
      icon: "operacao",
      show: true,
      children: [
        { href: "/rebanho", label: "Rebanho", show: hasFazenda },
        // Módulo 31: "Negociações" substitui a nomenclatura "Compra e Venda"
        // (§1), porque as relações comerciais da fazenda não se limitam a
        // comprar e vender. Fica ao lado de Rebanho porque é de lá que sai a
        // maior parte do que se negocia.
        { href: "/negociacoes", label: "Negociações", show: hasFazenda },
        // Módulo 31, §9 e §10: o estoque de insumos. Fica depois de
        // Negociações porque é de lá que a maior parte do que entra vem: uma
        // compra de produto abastece o estoque, e o uso é a outra ponta.
        { href: "/estoque", label: "Estoque", show: hasFazenda },
        { href: "/maquinas", label: "Máquinas", show: hasFazenda },
        { href: "/lavoura", label: "Lavoura", show: hasFazenda },
        { href: "/prestador", label: "Prestador", show: hasPrestador },
        { href: "/financeiro", label: "Financeiro", show: true },
        { href: "/alertas", label: "Alertas", show: true },
      ],
    },
    { kind: "link", href: "/meu-dia", label: "Meu Dia", icon: "meu-dia", show: true },
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
