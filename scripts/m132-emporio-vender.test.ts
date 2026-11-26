import "./_env-local";
import {
  algoNasMaisOpcoes,
  tituloDasMaisOpcoes,
  CAMPOS_DAS_MAIS_OPCOES,
  faixaDoCaixa,
  vendedorQueVemEscolhido,
  vendedorPelaTecla,
  formaPedeClienteDeVerdade,
  type MaisOpcoesPreenchidas,
} from "@/lib/emporio/balcao-tela";
import { reaisBr } from "@/lib/numero-br";

/**
 * M132: Módulo 39 (Meu Empório), UX onda 3: as regras puras do Vender (`balcao-tela.ts`).
 * Roda: `npm run test:m132`
 *
 * Escrita só do plano docs/superpowers/plans/2026-11-26-emporio-ux-onda3-vender.md (T2) e do
 * desenho §5.7, sem ler a implementação. Pura, sem banco.
 *
 * Seção 1: título e conteúdo de "Mais opções".
 * Seção 2: campos que vivem em "Mais opções".
 * Seção 3: faixa do caixa, com o fuso de São Paulo.
 * Seção 4: vendedor que vem escolhido.
 * Seção 5: vendedor pela tecla.
 * Seção 6: formas que pedem cliente de verdade.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const vazio: MaisOpcoesPreenchidas = {
  descontoNoTotalCent: 0,
  freteCent: 0,
  origem: "balcao",
  paraEntrega: false,
  franqueadoNome: null,
  creditoDoFranqueadoCent: 0,
  orcamentoNumero: null,
};

console.log("🐄 M132: as regras puras do Vender\n");

console.log("1. Título e conteúdo de Mais opções");
check("vazio: algoNasMaisOpcoes falso", algoNasMaisOpcoes(vazio) === false);
check("vazio: título simples", tituloDasMaisOpcoes(vazio) === "Mais opções", tituloDasMaisOpcoes(vazio));
const soFrete = { ...vazio, freteCent: 3000 };
check("só frete: conta como algo", algoNasMaisOpcoes(soFrete) === true);
check(
  "só frete de R$ 30",
  tituloDasMaisOpcoes(soFrete) === `Mais opções (frete ${reaisBr(30)})`,
  tituloDasMaisOpcoes(soFrete),
);
const freteEntrega = { ...vazio, freteCent: 3000, paraEntrega: true };
check(
  "frete e entrega, na ordem",
  tituloDasMaisOpcoes(freteEntrega) === `Mais opções (frete ${reaisBr(30)}, para entrega)`,
  tituloDasMaisOpcoes(freteEntrega),
);
const tudo: MaisOpcoesPreenchidas = {
  descontoNoTotalCent: 1050,
  freteCent: 3000,
  origem: "ecommerce",
  paraEntrega: true,
  franqueadoNome: "João",
  creditoDoFranqueadoCent: 20000,
  orcamentoNumero: "0042",
};
check(
  "os sete preenchidos, na ordem exata",
  tituloDasMaisOpcoes(tudo) ===
    `Mais opções (desconto ${reaisBr(10.5)}, frete ${reaisBr(30)}, e-commerce, para entrega, franqueado João, crédito ${reaisBr(200)}, orçamento nº 0042)`,
  tituloDasMaisOpcoes(tudo),
);
check("origem balcão não conta", algoNasMaisOpcoes({ ...vazio, origem: "balcao" }) === false);
check("origem e-commerce conta", algoNasMaisOpcoes({ ...vazio, origem: "ecommerce" }) === true);
check(
  "só e-commerce no título",
  tituloDasMaisOpcoes({ ...vazio, origem: "ecommerce" }) === "Mais opções (e-commerce)",
);
check("só desconto conta", algoNasMaisOpcoes({ ...vazio, descontoNoTotalCent: 500 }) === true);
check("só orçamento conta", algoNasMaisOpcoes({ ...vazio, orcamentoNumero: "7" }) === true);
check("só franqueado conta", algoNasMaisOpcoes({ ...vazio, franqueadoNome: "Ana" }) === true);
check("só crédito conta", algoNasMaisOpcoes({ ...vazio, creditoDoFranqueadoCent: 100 }) === true);

console.log("\n2. Campos de Mais opções");
for (const c of [
  "order_discount_amount",
  "freight_amount",
  "origin",
  "for_delivery",
  "franchisee_id",
  "franchisee_credit",
  "number",
  "quote_id",
]) {
  check(`lista contém ${c}`, CAMPOS_DAS_MAIS_OPCOES.includes(c));
}
check(
  "existe ao menos um campo delivery_*",
  CAMPOS_DAS_MAIS_OPCOES.some((c) => c.startsWith("delivery_")),
);

console.log("\n3. Faixa do caixa");
const SEP = " · ";
const hoje = new Date("2026-11-26T15:00:00Z");
const f1 = faixaDoCaixa({
  escolhido: { nome: "Caixa 1", aberto_em: "2026-11-26T11:02:00Z" },
  abertos: 1,
  lojaNome: "Loja da Rodovia",
  agora: hoje,
});
check("aberto hoje: só a hora", f1.texto === `Caixa 1 aberto desde 08:02${SEP}Loja da Rodovia`, f1.texto);
check("aberto hoje: tom aberto", f1.tom === "aberto");
const f2 = faixaDoCaixa({ escolhido: null, abertos: 0, lojaNome: "Loja da Rodovia", agora: hoje });
check("fechado: texto", f2.texto === "Dá para montar a venda; para fechar, abra o caixa", f2.texto);
check("fechado: tom fechado", f2.tom === "fechado");
const f3 = faixaDoCaixa({ escolhido: null, abertos: 2, lojaNome: "Loja da Rodovia", agora: hoje });
check("dois abertos sem escolha", f3.texto === `2 caixas abertos${SEP}Loja da Rodovia`, f3.texto);
check("dois abertos: tom aberto", f3.tom === "aberto");
const f4 = faixaDoCaixa({
  escolhido: { nome: "Caixa 1", aberto_em: "2026-11-25T11:02:00Z" },
  abertos: 1,
  lojaNome: "Loja da Rodovia",
  agora: hoje,
});
check(
  "aberto em dia anterior: data e hora",
  f4.texto === `Caixa 1 aberto desde 25/11, 08:02${SEP}Loja da Rodovia`,
  f4.texto,
);
const f5 = faixaDoCaixa({
  escolhido: { nome: "Caixa 1", aberto_em: "2026-11-26T02:50:00Z" },
  abertos: 1,
  lojaNome: "Loja X",
  agora: new Date("2026-11-26T04:30:00Z"),
});
check(
  "fuso: 01:30 SP de 26/11 e turno de 23:50 SP de 25/11 mostra a data",
  f5.texto === `Caixa 1 aberto desde 25/11, 23:50${SEP}Loja X`,
  f5.texto,
);
const f6 = faixaDoCaixa({
  escolhido: { nome: "Caixa 1", aberto_em: "2026-11-25T11:02:00Z" },
  abertos: 1,
  lojaNome: "Loja X",
  agora: new Date("2026-11-26T01:30:00Z"),
});
check(
  "fuso inverso: 22:30 SP de 25/11 e turno de 08:02 SP do mesmo dia mostra só a hora",
  f6.texto === `Caixa 1 aberto desde 08:02${SEP}Loja X`,
  f6.texto,
);

console.log("\n4. Vendedor que vem escolhido");
const dois = [{ id: "u1" }, { id: "u2" }];
check(
  "Caixa com um vendedor recebe ele",
  vendedorQueVemEscolhido({ vendedores: [{ id: "u1" }], ehCaixa: true, usuarioId: "cx", escolhido: "" }) === "u1",
);
check(
  "Caixa com dois recebe vazio",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: true, usuarioId: "cx", escolhido: "" }) === "",
);
check(
  "gestor na lista recebe a si mesmo",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: false, usuarioId: "u2", escolhido: "" }) === "u2",
);
check(
  "escolha fora da lista é descartada",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: true, usuarioId: "cx", escolhido: "zz" }) === "",
);
check(
  "escolha fora da lista cai em si mesmo quando gestor",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: false, usuarioId: "u1", escolhido: "zz" }) === "u1",
);
check(
  "escolha dentro da lista é mantida para o Caixa com dois",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: true, usuarioId: "cx", escolhido: "u2" }) === "u2",
);
check(
  "escolha dentro da lista vence o próprio usuário",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: false, usuarioId: "u1", escolhido: "u2" }) === "u2",
);
check(
  "gestor fora da lista, lista de dois: vazio",
  vendedorQueVemEscolhido({ vendedores: dois, ehCaixa: false, usuarioId: "g", escolhido: "" }) === "",
);

console.log("\n5. Vendedor pela tecla");
check('"1" dá o primeiro', vendedorPelaTecla(dois, "1") === "u1");
check('"2" dá o segundo', vendedorPelaTecla(dois, "2") === "u2");
check('"3" com dois dá null', vendedorPelaTecla(dois, "3") === null);
check('"a" dá null', vendedorPelaTecla(dois, "a") === null);
check('"0" dá null', vendedorPelaTecla(dois, "0") === null);
check("lista vazia dá null", vendedorPelaTecla([], "1") === null);

console.log("\n6. Formas que pedem cliente de verdade");
const formas: [string, boolean][] = [
  ["dinheiro", false],
  ["pix", false],
  ["debito", false],
  ["credito_vista", false],
  ["credito_parcelado", false],
  ["cheque", true],
  ["boleto", true],
  ["fiado", true],
];
for (const [k, esperado] of formas) {
  check(`${k}: ${esperado}`, formaPedeClienteDeVerdade(k) === esperado);
}

console.log(falhas === 0 ? "\n✅ M132 verde" : `\n❌ M132: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
