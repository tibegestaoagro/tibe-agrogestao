import "./_env-local";
import {
  abaDoPagar,
  abaDoReceber,
  abaDoEstoque,
  fatiarPagina,
  clienteBateComABusca,
  enderecoDaTelaNova,
  agruparContas,
} from "@/lib/emporio/dinheiro-telas";
import { totalDaAbaCartoes } from "../src/app/(dashboard)/emporio/_components/recorte";
import { menuDoEmporio, type EntradaDoMenu } from "@/lib/emporio/menu";
import { veAPagina } from "@/lib/emporio/paginas";
import type { PapelContexto, PapelEmporio } from "@/lib/emporio/papel";
import type { ContaAPagarView } from "@/lib/actions/emporio-despesas";

/**
 * M133: Módulo 39 (Meu Empório), UX onda 4: Dinheiro em menos telas e as listas longas.
 * Roda: `npm run test:m133`
 *
 * Escrita só do plano docs/superpowers/plans/2026-11-26-emporio-ux-onda4-dinheiro.md (T2),
 * sem ler a implementação. Pura, sem banco.
 *
 * Seção 1: abas vindas da URL.
 * Seção 2: fatia de página.
 * Seção 3: busca do Fiado.
 * Seção 4: endereços antigos viram os novos.
 * Seção 5: grupo de comissões.
 * Seção 6: menu e páginas.
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

console.log("🐄 M133: Empório, onda 4 da UX: as regras puras do Dinheiro\n");

console.log("1. Abas vindas da URL");
check("abaDoPagar sem valor: contas", abaDoPagar(undefined) === "contas");
check("abaDoPagar fixas", abaDoPagar("fixas") === "fixas");
check("abaDoPagar vendeu_pagou", abaDoPagar("vendeu_pagou") === "vendeu_pagou");
check("abaDoPagar inválida: contas", abaDoPagar("x") === "contas");
check("abaDoReceber cartoes", abaDoReceber("cartoes") === "cartoes");
check("abaDoReceber inválida: fiado", abaDoReceber("x") === "fiado");
check("abaDoReceber sem valor: fiado", abaDoReceber(undefined) === "fiado");
check("abaDoReceber vencidos", abaDoReceber("vencidos") === "vencidos");
check(
  "cheques=a_completar vale mais que aba",
  abaDoReceber("boletos", "a_completar") === "cheques",
  String(abaDoReceber("boletos", "a_completar")),
);
check("cheques com outro valor não manda", abaDoReceber("boletos", "outro") === "boletos");
check("abaDoEstoque tudo", abaDoEstoque("tudo") === "tudo");
check("abaDoEstoque sem valor: repor", abaDoEstoque(undefined) === "repor");
check("abaDoEstoque inválida: repor", abaDoEstoque("zzz") === "repor");

console.log("\n2. Fatia de página");
const quarentaECinco = Array.from({ length: 45 }, (_, i) => i + 1);
const p3 = fatiarPagina(quarentaECinco, 3, 20);
check("45 itens, página 3: 5 linhas", p3.linhas.length === 5, String(p3.linhas.length));
check("45 itens, página 3: página 3", p3.pagina === 3, String(p3.pagina));
check("a página 3 começa no item 41", p3.linhas[0] === 41);
check("total é 45", p3.total === 45, String(p3.total));
const p999 = fatiarPagina(quarentaECinco, 999, 20);
check("página 999 cai na 3", p999.pagina === 3 && p999.linhas.length === 5, j(p999));
const p0 = fatiarPagina(quarentaECinco, 0, 20);
check("página 0 sobe para a 1", p0.pagina === 1 && p0.linhas.length === 20, j({ pagina: p0.pagina, n: p0.linhas.length }));
const vazia = fatiarPagina([], 5, 20);
check("lista vazia: página 1, sem linhas", vazia.pagina === 1 && vazia.linhas.length === 0 && vazia.total === 0, j(vazia));
const exata = fatiarPagina(Array.from({ length: 40 }, (_, i) => i), 999, 20);
check("40 itens, página 999: a 2, com 20 linhas", exata.pagina === 2 && exata.linhas.length === 20, j({ pagina: exata.pagina, n: exata.linhas.length }));

console.log("\n3. Busca do Fiado");
const joao = { customer_name: "João da Silva", phone: "(38) 99988-1122", document: "123.456.789-00" };
check("joao acha João", clienteBateComABusca(joao, "joao"));
check("JOÃO maiúsculo com acento acha", clienteBateComABusca(joao, "JOÃO"));
check("123.456 acha pelo documento", clienteBateComABusca({ ...joao, customer_name: "Maria" }, "123.456"));
check("12345 sem máscara acha pelo documento", clienteBateComABusca({ ...joao, customer_name: "Maria" }, "12345"));
check("9988 acha pelo telefone", clienteBateComABusca({ ...joao, customer_name: "Maria" }, "9988"));
check("(38) 99988 com máscara acha pelo telefone", clienteBateComABusca({ ...joao, customer_name: "Maria" }, "(38) 99988"));
check(
  "12 sozinho não filtra por dígito",
  clienteBateComABusca({ ...joao, customer_name: "Maria", phone: "(38) 99912-1122", document: "123.456.789-00" }, "12") === false,
);
check("12 acha se o nome contiver 12", clienteBateComABusca({ ...joao, customer_name: "Sítio 12" }, "12"));
check("document null não quebra", clienteBateComABusca({ customer_name: "Ana", phone: null, document: null }, "999") === false);
check("document null: o nome ainda acha", clienteBateComABusca({ customer_name: "Ana", phone: null, document: null }, "ana"));
check("termo vazio aceita", clienteBateComABusca({ customer_name: "Ana", phone: null, document: null }, ""));
check("termo só de espaços aceita", clienteBateComABusca(joao, "   "));
check("nome que não bate nem por dígito: recusa", clienteBateComABusca(joao, "pedro") === false);

console.log("\n4. Endereços antigos viram os novos");
function destino(url: string) {
  const [caminho, query = ""] = url.split("?");
  return { caminho, q: new URLSearchParams(query) };
}
const cx = destino(
  enderecoDaTelaNova("/emporio/financeiro/caixa", { conta: "X", de: "2026-11-01", ate: "2026-11-20", carimbo: "sem" }),
);
check("caixa antigo vai para /emporio/caixa", cx.caminho === "/emporio/caixa", cx.caminho);
check("conta=X vira lugar=conta:X", cx.q.get("lugar") === "conta:X", String(cx.q.get("lugar")));
check("conta não sobra", cx.q.get("conta") === null);
check("de e ate seguem", cx.q.get("de") === "2026-11-01" && cx.q.get("ate") === "2026-11-20");
check("carimbo segue", cx.q.get("carimbo") === "sem");
const cxLoja = destino(enderecoDaTelaNova("/emporio/financeiro/caixa", { loja: "L", lugar: "gaveta:G" }));
check("caixa: loja e lugar seguem", cxLoja.q.get("loja") === "L" && cxLoja.q.get("lugar") === "gaveta:G");
const cb = destino(enderecoDaTelaNova("/emporio/financeiro/cobranca", { loja: "L", faixa: "60" }));
check("cobrança vai para A receber", cb.caminho === "/emporio/financeiro/receber", cb.caminho);
check("cobrança abre a aba vencidos", cb.q.get("aba") === "vencidos");
check("cobrança leva loja e faixa", cb.q.get("loja") === "L" && cb.q.get("faixa") === "60");
check("despesas vai para as fixas", enderecoDaTelaNova("/emporio/despesas", {}) === "/emporio/financeiro/pagar?aba=fixas", enderecoDaTelaNova("/emporio/despesas", {}));
const desc = destino(enderecoDaTelaNova("/emporio/despesas", { x: "1" }));
check("x=1 some (despesas)", desc.q.get("x") === null && desc.q.get("aba") === "fixas");
const cbX = destino(enderecoDaTelaNova("/emporio/financeiro/cobranca", { x: "1", loja: "L" }));
check("x=1 some (cobrança)", cbX.q.get("x") === null && cbX.q.get("loja") === "L");
const cxX = destino(enderecoDaTelaNova("/emporio/financeiro/caixa", { x: "1" }));
check("x=1 some (caixa)", cxX.q.get("x") === null);
const lista = destino(enderecoDaTelaNova("/emporio/financeiro/cobranca", { loja: ["A", "B"] }));
check("valor em lista usa o primeiro", lista.q.get("loja") === "A" && lista.q.getAll("loja").length === 1, j(lista.q.getAll("loja")));
const indef = destino(enderecoDaTelaNova("/emporio/financeiro/cobranca", { loja: undefined }));
check("valor indefinido não vira parâmetro", indef.q.get("loja") === null);

console.log("\n5. Grupo de comissões");
function conta(parte: Partial<ContaAPagarView> & { entry_id: string }): ContaAPagarView {
  return {
    origin: "vendeu_pagou",
    name: "Comissão Ana",
    category: null,
    establishment_id: "L1",
    establishment_name: "Loja 1",
    amount: 0.1,
    paid_amount: 0,
    open_amount: 0.1,
    due_date: "2026-11-30",
    status: "pending",
    sale_id: null,
    sale_number: null,
    sale_variable_expense_id: null,
    template_id: null,
    period: null,
    purchase_id: null,
    supplier_name: null,
    supplier_id: null,
    can_correct: false,
    ...parte,
  };
}
const c1 = conta({ entry_id: "c1" });
const fr = conta({ entry_id: "fr", origin: "frete", name: "Frete da venda 7", open_amount: 50 });
const c2 = conta({ entry_id: "c2" });
const c3 = conta({ entry_id: "c3" });
const agrupadas = agruparContas([c1, fr, c2, c3]);
check("3 comissões e 1 frete dão 2 linhas", agrupadas.length === 2, String(agrupadas.length));
const g0 = agrupadas[0];
check("o grupo fica na posição da primeira comissão", g0?.tipo === "grupo", j(g0?.tipo));
if (g0?.tipo === "grupo") {
  check("grupo tem 3 contas", g0.contas.length === 3, String(g0.contas.length));
  check("total 0.30 exato (sem ponto flutuante)", g0.total === 0.3, String(g0.total));
  check("nome do grupo", g0.nome === "Comissão Ana", g0.nome);
  check("vencimento do grupo", g0.due_date === "2026-11-30", String(g0.due_date));
  check("o grupo carrega a loja", g0.loja === "L1" || g0.loja === "Loja 1", String(g0.loja));
  check("as contas do grupo são as três, em ordem", j(g0.contas.map((c) => c.entry_id)) === j(["c1", "c2", "c3"]), j(g0.contas.map((c) => c.entry_id)));
}
const l1 = agrupadas[1];
check("o frete segue como linha de conta", l1?.tipo === "conta" && l1.conta.entry_id === "fr", j(l1));

const sozinha = agruparContas([c1]);
check("comissão sozinha não agrupa", sozinha.length === 1 && sozinha[0].tipo === "conta", j(sozinha.map((l) => l.tipo)));
const lojasDiferentes = agruparContas([c1, conta({ entry_id: "c9", establishment_id: "L2", establishment_name: "Loja 2" })]);
check("lojas diferentes não agrupam", lojasDiferentes.length === 2 && lojasDiferentes.every((l) => l.tipo === "conta"), j(lojasDiferentes.map((l) => l.tipo)));
const vencDiferente = agruparContas([c1, conta({ entry_id: "c8", due_date: "2026-12-05" })]);
check("vencimentos diferentes não agrupam", vencDiferente.every((l) => l.tipo === "conta"));
const nomeDiferente = agruparContas([c1, conta({ entry_id: "c7", name: "Comissão Bia" })]);
check("regras de nomes diferentes não agrupam", nomeDiferente.every((l) => l.tipo === "conta"));
const fretes = agruparContas([fr, conta({ entry_id: "fr2", origin: "frete", name: "Frete da venda 7", open_amount: 50 })]);
check("frete nunca agrupa", fretes.length === 2 && fretes.every((l) => l.tipo === "conta"));
const fixas = agruparContas([
  conta({ entry_id: "f1", origin: "despesa_fixa", name: "Luz" }),
  conta({ entry_id: "f2", origin: "despesa_fixa", name: "Luz" }),
]);
check("despesa fixa nunca agrupa", fixas.every((l) => l.tipo === "conta"));
check("lista vazia dá lista vazia", agruparContas([]).length === 0);

console.log("\n6. Menu e páginas");
function ctx(papel: PapelEmporio, lojas: string[] | null): PapelContexto {
  return { papel, lojas: lojas ? new Set(lojas) : null, chaves: new Set(), soDaLoja: papel !== "dono" };
}
type Grupo = Extract<EntradaDoMenu, { tipo: "grupo" }>;
const grupo = (m: EntradaDoMenu[], rotulo: string) =>
  m.find((e): e is Grupo => e.tipo === "grupo" && e.rotulo === rotulo);
const itens = (m: EntradaDoMenu[]) => m.flatMap((e) => (e.tipo === "item" ? [e] : e.itens));
const rotulosDe = (g: Grupo | undefined) => (g ? g.itens.map((i) => i.rotulo) : null);

const gestor = ctx("gestor", ["L"]);
const mg = menuDoEmporio(gestor);
const rotG = itens(mg).map((i) => i.rotulo);
const hrefG = itens(mg).map((i) => i.href);
check("gestor sem Dinheiro vê A pagar", rotG.includes("A pagar"), j(rotG));
check("A pagar do gestor aponta para /emporio/financeiro/pagar", itens(mg).find((i) => i.rotulo === "A pagar")?.href === "/emporio/financeiro/pagar");
check("gestor não vê Despesas", !rotG.includes("Despesas"), j(rotG));
check("gestor não vê Hoje", !rotG.includes("Hoje"), j(rotG));
check("gestor não vê A receber", !rotG.includes("A receber"), j(rotG));
check("gestor não tem href /emporio/financeiro nem receber", !hrefG.includes("/emporio/financeiro") && !hrefG.includes("/emporio/financeiro/receber"), j(hrefG));
check("gestor abre /emporio/financeiro/pagar", veAPagina(gestor, "/emporio/financeiro/pagar") === true);
check("gestor não abre /emporio/financeiro/receber", veAPagina(gestor, "/emporio/financeiro/receber") === false);
check("vendedor não abre /emporio/financeiro/pagar", veAPagina(ctx("vendedor", ["L"]), "/emporio/financeiro/pagar") === false);
check("caixa não abre /emporio/financeiro/pagar", veAPagina(ctx("caixa", ["L"]), "/emporio/financeiro/pagar") === false);

const fin = menuDoEmporio(ctx("financeiro", null));
check(
  "Financeiro: Dinheiro com 5 itens",
  j(rotulosDe(grupo(fin, "Dinheiro"))) === j(["Hoje", "Caixa", "A receber", "A pagar", "Aprovações"]),
  j(rotulosDe(grupo(fin, "Dinheiro"))),
);
const estFin = rotulosDe(grupo(fin, "Estatísticas")) ?? [];
check("Financeiro: Estatísticas tem Relatórios do dinheiro", estFin.includes("Relatórios do dinheiro"), j(estFin));
check("Relatórios do dinheiro é o último de Estatísticas", estFin[estFin.length - 1] === "Relatórios do dinheiro", j(estFin));
check(
  "Relatórios do dinheiro aponta para /emporio/financeiro/relatorios",
  itens(fin).find((i) => i.rotulo === "Relatórios do dinheiro")?.href === "/emporio/financeiro/relatorios",
);
check("Financeiro abre /emporio/financeiro/pagar", veAPagina(ctx("financeiro", null), "/emporio/financeiro/pagar") === true);

const menuCaixa = menuDoEmporio(ctx("caixa", ["L"]));
check(
  "o Caixa não muda",
  j(menuCaixa.map((e) => e.rotulo)) === j(["Vender", "Vendas", "Clientes", "Fiado", "Caixa"]),
  j(menuCaixa.map((e) => e.rotulo)),
);

// Seção 7: o total do título da aba Cartões não soma a parcela já conferida.
check(
  "Cartões: conferida de 100 e prevista de 50 dão total 50",
  totalDaAbaCartoes([
    { status: "conferida", effective_net: 100 },
    { status: "prevista", effective_net: 50 },
  ]) === 50,
);
check("Cartões: só conferida dá 0", totalDaAbaCartoes([{ status: "conferida", effective_net: 100 }]) === 0);
check(
  "Cartões: a atrasada (o recorte Vencido) entra no total",
  totalDaAbaCartoes([
    { status: "atrasada", effective_net: 30.1 },
    { status: "a_conferir", effective_net: 0.2 },
  ]) === 30.3,
);

if (falhas > 0) {
  console.log(`\n❌ ${falhas} afirmação(ões) falharam`);
  process.exit(1);
}
console.log("\n✅ M133: tudo verde");
