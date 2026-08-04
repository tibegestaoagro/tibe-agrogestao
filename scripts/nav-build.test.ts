import "dotenv/config";
import { buildNavItems } from "@/lib/nav";
import type { NavItem, NavChild } from "@/components/layout/sidebar";

/**
 * Teste unitário de buildNavItems (auditoria de arquitetura, 2026-08-04):
 * antes da extração de src/lib/nav.ts, verificar "quem vê o quê" na
 * sidebar exigia renderizar a página inteira do dashboard (sessão, billing,
 * Prisma). Como função pura, roda sem DB e sem sessão.
 *
 * Roda: `npm run test:nav` (sem DB necessário).
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

  const owner = buildNavItems({ role: "OWNER", hasFazenda: true, hasPrestador: true });
  const visualizadorSemPerfil = buildNavItems({ role: "VISUALIZADOR", hasFazenda: false, hasPrestador: false });

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

  console.log("");
  if (failures === 0) {
    console.log("✅ buildNavItems validado: 0 falhas.");
  } else {
    console.error(`❌ buildNavItems FALHOU: ${failures} verificação(ões) com erro.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
