import "./_env-local";
import { buildNavItems } from "@/lib/nav";
import type { NavItem, NavChild } from "@/components/layout/sidebar";
import { paginasVisiveis, veAPagina } from "@/lib/emporio/paginas";
import { menuDoEmporio } from "@/lib/emporio/menu";
import { hrefAtivo } from "@/lib/emporio/href-ativo";
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
  return group.children.find((c): c is NavChild => "href" in c && c.href === childHref);
}

/** As folhas de um grupo do Empório, com as de subgrupo achatadas. */
function folhasDe(g: Extract<NavItem, { kind: "group" }> | undefined): NavChild[] {
  return (g?.children ?? []).flatMap((c) => ("kind" in c ? c.children : [c]));
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

  const descreve = (g: Extract<NavItem, { kind: "group" }> | undefined) =>
    (g?.children ?? []).map((c) => ("kind" in c ? `sub:${c.label}` : `folha:${c.label}`));
  const doDono = buildNavItems({ ...base, hasEmporio: true, menuDoEmporio: menuDoEmporio(dono) });
  const gDono = grupo(doDono);
  assert(
    JSON.stringify(descreve(gDono)) ===
      JSON.stringify([
        "folha:Início", "folha:Vender", "sub:Vendas", "sub:Estoque", "sub:Dinheiro", "folha:Estatísticas", "sub:Ajustes",
      ]),
    "dono: o grupo Meu Empório tem as folhas Início, Vender e Estatísticas e os subgrupos Vendas, Estoque, Dinheiro e Ajustes",
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
    ["/emporio/financeiro/pagar", "/emporio/estatisticas", "/emporio/clientes", "/emporio/historico"].every((h) => hrefsFin.includes(h)),
    "Financeiro vê A pagar, Estatísticas, Clientes e Histórico",
  );
  assert(gDono?.show === true && gDono.icon === "emporio", "o grupo Meu Empório aparece com o ícone do Empório");
  const primeira = gDono?.children[0];
  assert(
    !!primeira && "href" in primeira && primeira.href === "/emporio" && primeira.exact === true,
    "o Início só acende na rota exata",
  );
  const segunda = gDono?.children[1];
  assert(!!segunda && "href" in segunda && segunda.destaque === true, "o Vender sai em destaque");
  assert(findLink(doDono, "/emporio/historico") === undefined, "não há link de topo /emporio/historico");
  assert(findLink(doDono, "/emporio") === undefined, "não há link de topo /emporio");

  const doVendedor = buildNavItems({
    ...base, hasEmporio: true, soDaLoja: true, menuDoEmporio: menuDoEmporio(vendedor),
  });
  const gVend = grupo(doVendedor);
  const hrefsVend = folhasDe(gVend).map((c) => c.href);
  assert(!!gVend, "com soDaLoja, o grupo Meu Empório continua lá");
  assert(
    ["/emporio/financeiro/pagar", "/emporio/estatisticas", "/emporio/equipe", "/emporio/historico"].every((h) => !hrefsVend.includes(h)),
    "vendedor não vê A pagar, Estatísticas, Equipe nem Histórico",
  );
  assert(hrefsVend.includes("/emporio/vender"), "vendedor vê Vender");

  const hrefsGestor = paginasVisiveis(gestor).map((p) => p.href);
  assert(hrefsGestor.includes("/emporio/historico"), "gestor vê Histórico");
  assert(hrefsGestor.includes("/emporio/configuracoes"), "gestor vê Configurações");
  assert(!hrefsVend.includes("/emporio/configuracoes"), "vendedor não vê Configurações");
  assert(!hrefsGestor.includes("/emporio/equipe"), "gestor não vê Equipe");
  assert(veAPagina(gestor, "/emporio/estatisticas") && !veAPagina(vendedor, "/emporio/estatisticas"), "veAPagina segue o papel");
  assert(
    !veAPagina(gestor, "/emporio/resultado") && !veAPagina(gestor, "/emporio/relatorios"),
    "/emporio/resultado e /emporio/relatorios saíram do paginas.ts (viraram redirect)",
  );
  assert(
    folhasDe(gDono).some((f) => f.href === "/emporio/estatisticas" && f.label === "Estatísticas") &&
      folhasDe(gDono).every((f) => !["Relatórios", "Resultado", "Projeção", "Relatórios do dinheiro"].includes(f.label)),
    "dono: item Estatísticas, e nenhum dos quatro itens antigos sobra",
  );

  const caixa: PapelContexto = { papel: "caixa", lojas: new Set([lojaA]), chaves: new Set(), soDaLoja: true };
  assert(!veAPagina(caixa, "/emporio/estatisticas"), "o Caixa não abre Estatísticas");
  const doCaixa = buildNavItems({ ...base, hasEmporio: true, soDaLoja: true, menuDoEmporio: menuDoEmporio(caixa) });
  assert(
    JSON.stringify(folhasDe(grupo(doCaixa)).map((c) => c.href)) ===
      JSON.stringify(["/emporio/vender", "/emporio/vendas", "/emporio/clientes", "/emporio/fiado", "/emporio/caixa"]) &&
      !(grupo(doCaixa)?.children ?? []).some((c) => "kind" in c),
    "caixa: o menu é plano, só Vender, Vendas, Clientes, Fiado e Caixa (sem Início desde a onda 2: o Caixa entra em Vender)",
  );
  const soLoja = buildNavItems({ ...base, hasEmporio: true, soDaLoja: true, menuDoEmporio: menuDoEmporio(dono) });
  const gSoLoja = grupo(soLoja);
  assert(
    (gSoLoja?.children ?? []).some((c) => "kind" in c) &&
      folhasDe(gSoLoja).every((f) => paginaPermitidaAoSoDaLoja(f.href)),
    "com soDaLoja, os subgrupos continuam e nenhuma folha fora do Empório aparece",
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

  // A folha acesa: só a de href mais específico (Hoje não acende em /financeiro/projecao).
  const folhasDono = folhasDe(gDono);
  const acesa = (p: string) => folhasDono.find((f) => f.href === hrefAtivo(p, folhasDono))?.label ?? null;
  assert(acesa("/emporio/estatisticas") === "Estatísticas", "rota /estatisticas: só Estatísticas acende");
  assert(acesa("/emporio/financeiro") === "Hoje", "rota /financeiro: Hoje");
  assert(acesa("/emporio/financeiro/receber") === "A receber", "rota /financeiro/receber: A receber");
  assert(acesa("/emporio/vendas/abc") === "Vendas", "rota /vendas/abc: Vendas");
  assert(acesa("/emporio") === "Início", "rota /emporio: Início");
  assert(acesa("/emporio/vender") === "Vender", "rota /vender: Vender, nem Vendas nem Início");

  const semEmporio =buildNavItems({ ...base, hasEmporio: false });
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
