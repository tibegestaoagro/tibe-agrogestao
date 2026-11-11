import "./_env-local";
import { buildNavItems } from "@/lib/nav";
import type { NavItem, NavChild } from "@/components/layout/sidebar";
import { paginasVisiveis, veAPagina } from "@/lib/emporio/paginas";
import { paginaPermitidaAoSoDaLoja } from "@/lib/emporio/paginas-do-so-da-loja";
import type { PapelContexto } from "@/lib/emporio/papel";

/**
 * Teste unitário de buildNavItems (auditoria de arquitetura, 2026-08-04):
 * antes da extração de src/lib/nav.ts, verificar "quem vê o quê" na
 * sidebar exigia renderizar a página inteira do dashboard (sessão, billing,
 * Prisma). Como função pura, roda sem DB e sem sessão.
 *
 * Roda: `npm run test:nav`. **Não abre conexão, mas exige `DATABASE_URL`
 * definida**, mesmo que apontando para lugar nenhum: `nav.ts` importa
 * `permissions`, que importa `tenant-context`, que importa `prisma`, e esse
 * módulo lança no carregamento quando a variável não existe. Na máquina de
 * quem desenvolve o `.env` cobre isso, então só apareceu quando o CI rodou num
 * clone sem `.env`, em 2026-08-20. A frase anterior aqui dizia "roda sem DB",
 * o que era falso.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

function findLink(items: NavItem[], href: string) {
  return items.find(
    (i): i is Extract<NavItem, { kind: "link" }> => i.kind === "link" && i.href === href,
  );
}

function findGroupChild(items: NavItem[], groupLabel: string, childHref: string): NavChild | undefined {
  const group = items.find((i) => i.kind === "group" && i.label === groupLabel);
  if (!group || group.kind !== "group") return undefined;
  return group.children.find((c) => c.href === childHref);
}

function main() {
  console.log("🧭 Teste de buildNavItems (sidebar)\n");

  const owner = buildNavItems({ role: "OWNER", hasFazenda: true, hasPrestador: true, hasEmporio: false });
  const visualizadorSemPerfil = buildNavItems({
    role: "VISUALIZADOR",
    hasFazenda: false,
    hasPrestador: false,
    hasEmporio: false,
  });

  assert(
    findLink(owner, "/minha-fazenda")?.show === true,
    "OWNER com perfil fazenda vê Minha Fazenda",
  );
  assert(
    findLink(visualizadorSemPerfil, "/minha-fazenda")?.show === false,
    "sem perfil fazenda, Minha Fazenda fica oculta",
  );

  assert(
    findGroupChild(owner, "Operação", "/rebanho")?.show === true,
    "com perfil fazenda, Rebanho aparece no grupo Operação",
  );
  assert(
    findGroupChild(visualizadorSemPerfil, "Operação", "/rebanho")?.show === false,
    "sem perfil fazenda, Rebanho some do grupo Operação",
  );
  assert(
    findGroupChild(owner, "Operação", "/prestador")?.show === true,
    "com perfil prestador, Prestador aparece no grupo Operação",
  );
  assert(
    findGroupChild(visualizadorSemPerfil, "Operação", "/financeiro")?.show === true,
    "Financeiro aparece mesmo sem nenhum perfil ativo",
  );

  assert(
    findGroupChild(owner, "Configurações", "/configuracoes")?.show === true,
    "OWNER vê Configurações da conta",
  );
  assert(
    findGroupChild(visualizadorSemPerfil, "Configurações", "/configuracoes")?.show === false,
    "VISUALIZADOR não vê Configurações da conta",
  );
  assert(
    findGroupChild(visualizadorSemPerfil, "Configurações", "/configuracoes/senha")?.show === true,
    "VISUALIZADOR ainda vê Minha senha (não é privilégio de papel)",
  );

  // Meu Empório como grupo, com as telas que o papel permite.
  const lojaA = "loja-a";
  const dono: PapelContexto = { papel: "dono", lojas: null, chaves: new Set(), soDaLoja: false };
  const gestor: PapelContexto = { papel: "gestor", lojas: new Set([lojaA]), chaves: new Set(), soDaLoja: true };
  const vendedor: PapelContexto = { papel: "vendedor", lojas: new Set([lojaA]), chaves: new Set(), soDaLoja: true };
  const base = { role: "OWNER" as const, hasFazenda: false, hasPrestador: false };
  const grupo = (itens: NavItem[]) =>
    itens.find((i): i is Extract<NavItem, { kind: "group" }> => i.kind === "group" && i.label === "Meu Empório");

  const ordemEsperada = [
    "/emporio", "/emporio/vender", "/emporio/vendas", "/emporio/orcamentos", "/emporio/fiado", "/emporio/clientes",
    "/emporio/caixa", "/emporio/financeiro", "/emporio/produtos", "/emporio/estoque", "/emporio/compras", "/emporio/fornecedores",
    "/emporio/franqueados", "/emporio/transferencias",
    "/emporio/despesas", "/emporio/resultado", "/emporio/relatorios", "/emporio/equipe",
    "/emporio/estabelecimentos", "/emporio/historico", "/emporio/configuracoes",
  ];
  const doDono = buildNavItems({ ...base, hasEmporio: true, paginasDoEmporio: paginasVisiveis(dono) });
  const gDono = grupo(doDono);
  assert(
    !!gDono && JSON.stringify(gDono.children.map((c) => c.href)) === JSON.stringify(ordemEsperada),
    "dono: o grupo Meu Empório tem os 21 filhos, na ordem (Financeiro depois de Caixa; Franqueados depois de Fornecedores, Q300)",
  );
  const financeiro: PapelContexto = { papel: "financeiro", lojas: null, chaves: new Set(), soDaLoja: true };
  const hrefsFin = paginasVisiveis(financeiro).map((p) => p.href);
  const hrefsVendedor = paginasVisiveis(vendedor).map((p) => p.href);
  assert(
    hrefsFin.includes("/emporio/financeiro") && !hrefsVendedor.includes("/emporio/financeiro"),
    "só quem passa em dinheiro vê Financeiro",
  );
  assert(
    ["/emporio/vender", "/emporio/equipe"].every((h) => !hrefsFin.includes(h)),
    "Financeiro não vê Vender nem Equipe",
  );
  assert(
    ["/emporio/despesas", "/emporio/resultado", "/emporio/clientes", "/emporio/historico"].every((h) => hrefsFin.includes(h)),
    "Financeiro vê Despesas, Resultado, Clientes e Histórico",
  );
  assert(gDono?.show === true && gDono.icon === "emporio", "o grupo Meu Empório aparece com o ícone do Empório");
  assert(
    gDono?.children[0].href === "/emporio" && gDono.children[0].exact === true,
    "o Início só acende na rota exata",
  );
  assert(findLink(doDono, "/emporio/historico") === undefined, "não há link de topo /emporio/historico");
  assert(findLink(doDono, "/emporio") === undefined, "não há link de topo /emporio");

  const doVendedor = buildNavItems({
    ...base, hasEmporio: true, soDaLoja: true, paginasDoEmporio: paginasVisiveis(vendedor),
  });
  const gVend = grupo(doVendedor);
  const hrefsVend = gVend?.children.map((c) => c.href) ?? [];
  assert(!!gVend, "com soDaLoja, o grupo Meu Empório continua lá");
  assert(
    ["/emporio/despesas", "/emporio/resultado", "/emporio/equipe", "/emporio/historico"].every((h) => !hrefsVend.includes(h)),
    "vendedor não vê Despesas, Resultado, Equipe nem Histórico",
  );
  assert(hrefsVend.includes("/emporio/vender"), "vendedor vê Vender");

  const hrefsGestor = paginasVisiveis(gestor).map((p) => p.href);
  assert(hrefsGestor.includes("/emporio/historico"), "gestor vê Histórico");
  assert(hrefsGestor.includes("/emporio/configuracoes"), "gestor vê Configurações");
  assert(!hrefsVend.includes("/emporio/configuracoes"), "vendedor não vê Configurações");
  assert(!hrefsGestor.includes("/emporio/equipe"), "gestor não vê Equipe");
  assert(veAPagina(gestor, "/emporio/resultado") && !veAPagina(vendedor, "/emporio/resultado"), "veAPagina segue o papel");

  const caixa: PapelContexto = { papel: "caixa", lojas: new Set([lojaA]), chaves: new Set(), soDaLoja: true };
  const doCaixa = buildNavItems({ ...base, hasEmporio: true, soDaLoja: true, paginasDoEmporio: paginasVisiveis(caixa) });
  assert(
    JSON.stringify(grupo(doCaixa)?.children.map((c) => c.href)) ===
      JSON.stringify(["/emporio", "/emporio/vender", "/emporio/vendas", "/emporio/fiado", "/emporio/clientes", "/emporio/caixa"]),
    "caixa: o menu tem só Início, Vender, Vendas, Fiado, Clientes e Caixa",
  );
  assert(
    !veAPagina(caixa, "/emporio/fornecedores") && veAPagina(gestor, "/emporio/fornecedores"),
    "fornecedores: o caixa não vê, o gestor vê (fora do caixa)",
  );
  assert(
    veAPagina(vendedor, "/emporio/clientes") && veAPagina(caixa, "/emporio/clientes"),
    "vendedor e caixa abrem Clientes",
  );
  // Só da loja: a equipe do Empório é separada do Tibé, e o cliente dela mora em /emporio/clientes.
  assert(!paginaPermitidaAoSoDaLoja("/contatos"), "só da loja: /contatos fechado");
  assert(!paginaPermitidaAoSoDaLoja("/contatos/abc"), "só da loja: /contatos/<id> fechado");
  assert(paginaPermitidaAoSoDaLoja("/emporio/clientes"), "só da loja: /emporio/clientes aberto");
  assert(paginaPermitidaAoSoDaLoja("/emporio/clientes/abc?x=1"), "só da loja: a ficha do cliente aberta");
  assert(!veAPagina(caixa, "/emporio/estoque") && !veAPagina(caixa, "/emporio/estabelecimentos"), "veAPagina esconde Estoque e Lojas do caixa");

  const semEmporio = buildNavItems({ ...base, hasEmporio: false });
  assert(grupo(semEmporio) === undefined || grupo(semEmporio)?.show === false, "sem Empório, o grupo não aparece");

  console.log("");
  if (failures === 0) {
    console.log("✅ buildNavItems validado: 0 falhas.");
  } else {
    console.error(`❌ buildNavItems FALHOU: ${failures} verificação(ões) com erro.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
