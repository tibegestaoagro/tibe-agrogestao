import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { menuDoEmporio, type EntradaDoMenu } from "@/lib/emporio/menu";
import { veAPagina } from "@/lib/emporio/paginas";
import type { PapelContexto, PapelEmporio } from "@/lib/emporio/papel";

exigirBancoLocal();

/**
 * M130: Meu Empório, frente de UX, onda 1: o menu lateral agrupado.
 * Roda: `npm run test:m130`
 *
 * Escrita do briefing da Task 1, sem ler a implementação. Só funções puras:
 * não toca no banco (a trava acima é só a convenção das suítes).
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);

function ctx(papel: PapelEmporio, lojas: string[] | null): PapelContexto {
  return { papel, lojas: lojas ? new Set(lojas) : null, chaves: new Set(), soDaLoja: papel !== "dono" };
}

const PAPEIS: PapelEmporio[] = ["dono", "gerente_geral", "gestor", "vendedor", "caixa", "financeiro"];
const CONTEXTOS: Record<PapelEmporio, PapelContexto> = {
  dono: ctx("dono", null),
  gerente_geral: ctx("gerente_geral", null),
  gestor: ctx("gestor", ["L"]),
  vendedor: ctx("vendedor", ["L"]),
  caixa: ctx("caixa", ["L"]),
  financeiro: ctx("financeiro", null),
};

type Grupo = Extract<EntradaDoMenu, { tipo: "grupo" }>;
type Item = Extract<EntradaDoMenu, { tipo: "item" }>;

const grupos = (m: EntradaDoMenu[]) => m.filter((e): e is Grupo => e.tipo === "grupo");
const grupo = (m: EntradaDoMenu[], rotulo: string) => grupos(m).find((g) => g.rotulo === rotulo);
const itemSolto = (m: EntradaDoMenu[], rotulo: string) =>
  m.find((e): e is Item => e.tipo === "item" && e.rotulo === rotulo);
const rotulosDe = (g: Grupo | undefined) => (g ? g.itens.map((i) => i.rotulo) : null);
const todosOsItens = (m: EntradaDoMenu[]) => m.flatMap((e) => (e.tipo === "item" ? [e] : e.itens));
const hrefDe = (m: EntradaDoMenu[], rotulo: string) => todosOsItens(m).find((i) => i.rotulo === rotulo)?.href;

console.log("🧭 M130: Empório UX onda 1: menu agrupado\n");

console.log("1. Dono: a ordem e o conteúdo");
const dono = menuDoEmporio(CONTEXTOS.dono);
const ordemEsperada = ["Início", "Vender", "Vendas", "Estoque", "Dinheiro", "Estatísticas", "Ajustes"];
check("entradas na ordem Início, Vender e os cinco grupos", j(dono.map((e) => e.rotulo)) === j(ordemEsperada), j(dono.map((e) => e.rotulo)));
const inicio = dono[0];
check("Início é item com exact", inicio?.tipo === "item" && inicio.exact === true, j(inicio));
const vender = dono[1];
check("Vender é item com destaque", vender?.tipo === "item" && vender.destaque === true, j(vender));
check("Vendas e os outros quatro são grupos", j(dono.slice(2).map((e) => e.tipo)) === j(["grupo", "grupo", "grupo", "grupo", "grupo"]));
check(
  "grupo Vendas",
  j(rotulosDe(grupo(dono, "Vendas"))) === j(["Vendas", "Orçamentos", "Clientes", "Fiado", "Franqueados"]),
  j(rotulosDe(grupo(dono, "Vendas"))),
);
check(
  "grupo Estoque",
  j(rotulosDe(grupo(dono, "Estoque"))) === j(["Produtos", "Estoque", "Compras", "Transferências", "Fornecedores"]),
  j(rotulosDe(grupo(dono, "Estoque"))),
);
check(
  "grupo Dinheiro",
  j(rotulosDe(grupo(dono, "Dinheiro"))) === j(["Hoje", "Caixa", "A receber", "A pagar", "Aprovações"]),
  j(rotulosDe(grupo(dono, "Dinheiro"))),
);
check(
  "grupo Estatísticas",
  j(rotulosDe(grupo(dono, "Estatísticas"))) === j(["Relatórios", "Resultado", "Projeção", "Relatórios do dinheiro"]),
  j(rotulosDe(grupo(dono, "Estatísticas"))),
);
check(
  "grupo Ajustes",
  j(rotulosDe(grupo(dono, "Ajustes"))) === j(["Lojas", "Equipe", "Histórico", "Configurações"]),
  j(rotulosDe(grupo(dono, "Ajustes"))),
);

console.log("\n2. Dono: os endereços");
const hrefs: Record<string, string> = {
  Hoje: "/emporio/financeiro",
  Caixa: "/emporio/caixa",
  "A receber": "/emporio/financeiro/receber",
  "A pagar": "/emporio/financeiro/pagar",
  Aprovações: "/emporio/financeiro/aprovacoes",
  "Relatórios do dinheiro": "/emporio/financeiro/relatorios",
  Relatórios: "/emporio/relatorios",
  Resultado: "/emporio/resultado",
  Projeção: "/emporio/financeiro/projecao",
  Lojas: "/emporio/estabelecimentos",
};
for (const [rotulo, href] of Object.entries(hrefs)) {
  check(`${rotulo} aponta para ${href}`, hrefDe(dono, rotulo) === href, String(hrefDe(dono, rotulo)));
}

console.log("\n3. Caixa: menu plano");
const caixa = menuDoEmporio(CONTEXTOS.caixa);
check("nenhum grupo", grupos(caixa).length === 0, j(caixa));
check(
  "exatamente Vender, Vendas, Clientes, Fiado, Caixa (sem Início: ele entra direto em Vender)",
  j(caixa.map((e) => e.rotulo)) === j(["Vender", "Vendas", "Clientes", "Fiado", "Caixa"]),
  j(caixa.map((e) => e.rotulo)),
);

console.log("\n4. Gestor da loja");
const gestor = menuDoEmporio(CONTEXTOS.gestor);
const hrefsGestor = todosOsItens(gestor).map((i) => i.href);
check(
  "do /emporio/financeiro só A pagar",
  j(hrefsGestor.filter((h) => h.startsWith("/emporio/financeiro"))) === j(["/emporio/financeiro/pagar"]),
  j(hrefsGestor.filter((h) => h.startsWith("/emporio/financeiro"))),
);
check("grupo Dinheiro com Caixa e A pagar", j(rotulosDe(grupo(gestor, "Dinheiro"))) === j(["Caixa", "A pagar"]), j(rotulosDe(grupo(gestor, "Dinheiro"))));
check(
  "sem Despesas, Hoje nem A receber",
  !hrefsGestor.includes("/emporio/despesas") && !hrefsGestor.includes("/emporio/financeiro") && !hrefsGestor.includes("/emporio/financeiro/receber"),
  j(hrefsGestor),
);
const estGestor = rotulosDe(grupo(gestor, "Estatísticas"));
check("Estatísticas tem Relatórios e Resultado", !!estGestor && estGestor.includes("Relatórios") && estGestor.includes("Resultado"), j(estGestor));
check("Estatísticas não tem Projeção", !!estGestor && !estGestor.includes("Projeção"), j(estGestor));

console.log("\n5. Financeiro");
const fin = menuDoEmporio(CONTEXTOS.financeiro);
const rotulosFin = todosOsItens(fin).map((i) => i.rotulo);
check("não tem Vender", !rotulosFin.includes("Vender"), j(rotulosFin));
check("não tem Equipe", !rotulosFin.includes("Equipe"), j(rotulosFin));
check(
  "Dinheiro com os 5 itens",
  j(rotulosDe(grupo(fin, "Dinheiro"))) === j(["Hoje", "Caixa", "A receber", "A pagar", "Aprovações"]),
  j(rotulosDe(grupo(fin, "Dinheiro"))),
);
check(
  "Estatísticas com Relatórios do dinheiro",
  (rotulosDe(grupo(fin, "Estatísticas")) ?? []).includes("Relatórios do dinheiro"),
  j(rotulosDe(grupo(fin, "Estatísticas"))),
);

console.log("\n6. Grupo de um item só vira item solto (vendedor)");
const vend = menuDoEmporio(CONTEXTOS.vendedor);
check("Caixa é item solto", itemSolto(vend, "Caixa") !== undefined, j(vend));
check("Lojas é item solto", itemSolto(vend, "Lojas") !== undefined, j(vend));
check("Caixa não está dentro de grupo", !grupos(vend).some((g) => g.itens.some((i) => i.rotulo === "Caixa")));
check("Lojas não está dentro de grupo", !grupos(vend).some((g) => g.itens.some((i) => i.rotulo === "Lojas")));
check("sem grupo Estatísticas", grupo(vend, "Estatísticas") === undefined);
check("sem grupo Dinheiro nem Ajustes", grupo(vend, "Dinheiro") === undefined && grupo(vend, "Ajustes") === undefined);
check("não é plano: tem Vendas e Estoque", grupo(vend, "Vendas") !== undefined && grupo(vend, "Estoque") !== undefined, j(vend.map((e) => e.rotulo)));

console.log("\n7. Nenhum grupo vazio, em nenhum papel");
for (const p of PAPEIS) {
  const vazios = grupos(menuDoEmporio(CONTEXTOS[p])).filter((g) => g.itens.length === 0).map((g) => g.rotulo);
  check(`${p}: sem grupo vazio`, vazios.length === 0, j(vazios));
}

console.log("\n8. Todo endereço do menu abre para o papel");
for (const p of PAPEIS) {
  const c = CONTEXTOS[p];
  const fechados = todosOsItens(menuDoEmporio(c))
    .map((i) => i.href)
    .filter((h) => !(veAPagina(c, h) || (h.startsWith("/emporio/financeiro") && veAPagina(c, "/emporio/financeiro"))));
  check(`${p}: nenhum item que o papel não abre`, fechados.length === 0, j(fechados));
}

if (falhas > 0) {
  console.log(`\n❌ ${falhas} afirmação(ões) falharam`);
  process.exit(1);
}
console.log("\n✅ M130: tudo verde");
