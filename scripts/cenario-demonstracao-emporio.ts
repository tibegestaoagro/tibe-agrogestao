import "./_env-local";
import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actions/types";
import type { AppUserRole } from "@/types/next-auth";
import { getSeatUsage } from "@/lib/seats";
import { createContact } from "@/lib/actions/contacts";
import { ensureProductCategories } from "@/lib/actions/products";
import * as cat from "@/lib/actions/emporio-catalogo";
import * as equipe from "@/lib/actions/emporio-equipe";
import * as est from "@/lib/actions/emporio-estoque";
import * as compras from "@/lib/actions/emporio-compras";
import * as transf from "@/lib/actions/emporio-transferencias";
import * as vendas from "@/lib/actions/emporio-vendas";
import * as caixa from "@/lib/actions/emporio-caixa";
import * as desp from "@/lib/actions/emporio-despesas";
import * as prod from "@/lib/actions/emporio-producao";

/**
 * Cenario de demonstracao do Meu Emporio (Modulo 39, Q137): monta, numa conta,
 * tres lojas, a Equipe, 25 produtos e 30 dias de movimento, sempre pelas
 * ACTIONS (nunca por escrita direta), para estoque, custo medio, caixa, fiado,
 * Financeiro, Resultado e Historico saírem de verdade.
 *
 * Uso:
 *   npm run cenario:emporio-demo -- --conta <id do tenant>              (so mostra o plano)
 *   npm run cenario:emporio-demo -- --conta <id do tenant> --confirmar  (executa)
 *   npm run cenario:emporio-demo -- --conta <id do tenant> --apagar --confirmar  (SO banco local)
 *
 * Repetivel: toda escrita com `operation_key` usa chave fixa com o prefixo
 * `demo-emporio-`; lojas, produtos, contatos e conta bancaria sao achados pelo
 * nome antes de criar; usuarios, pelo email. Rodar de novo so acrescenta o que
 * falta. O Historico grava a hora real da execucao, nao a data da operacao.
 *
 * O banco vem do ambiente (`.env.local`, depois `.env`; URL inline vence). O
 * script imprime o host no topo: confira antes de confirmar.
 */

const PREFIXO = "demo-emporio-";
const args = process.argv.slice(2);
const confirmar = args.includes("--confirmar");
const apagar = args.includes("--apagar");
const contaArg = (() => {
  const i = args.findIndex((a) => a === "--conta" || a.startsWith("--conta="));
  if (i < 0) return null;
  return args[i].includes("=") ? args[i].split("=")[1] : (args[i + 1] ?? null);
})();

type Ator = { id: string; role: AppUserRole };

class Parar extends Error {}

function exigir<T>(r: ActionResult<T>, oQue: string): T {
  if (!r.ok) throw new Error(`${oQue}: ${r.message} (${r.code}${r.field ? `, campo ${r.field}` : ""})`);
  return r.data;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Data `n` dias no passado (negativo = futuro), na hora dada. */
function dia(n: number, h = 10, m = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}

const cents = (x: number) => Math.round(Number((x * 100).toPrecision(12)));
const r2 = (x: number) => cents(x) / 100;
const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Gerador deterministico (mulberry32): o mesmo cenario em toda execucao. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Dados do cenario
// ---------------------------------------------------------------------------

const LOJAS = [
  { chave: "deposito", nome: "Depósito Central", endereco: "Rodovia BR-163, km 12, Galpão 3", cidade: "Rondonópolis", desc: 0, desp: 8, lucro: 20 },
  { chave: "centro", nome: "Loja Centro", endereco: "Avenida Mato Grosso, 1450", cidade: "Rondonópolis", desc: 5, desp: 12, lucro: 25 },
  { chave: "rodovia", nome: "Loja da Rodovia", endereco: "Rodovia BR-364, km 3, Jardim Primavera", cidade: "Rondonópolis", desc: 8, desp: 11, lucro: 22 },
] as const;
type ChaveLoja = (typeof LOJAS)[number]["chave"];
type ChaveVenda = "centro" | "rodovia";

const CONTA_NOME = "Conta da loja";

const MEMBROS = [
  { chave: "gerente", name: "Marcos Oliveira", email: "gerente.demo.emporio@example.com", funcao: "gerente_geral", lojas: [] as ChaveLoja[], keys: [] as string[] },
  { chave: "gestor", name: "Fernanda Souza", email: "gestor.demo.emporio@example.com", funcao: "gestor", lojas: ["centro", "rodovia"] as ChaveLoja[], keys: [] as string[] },
  { chave: "vendCentro", name: "Rafael Almeida", email: "vendedor.centro.demo.emporio@example.com", funcao: "vendedor", lojas: ["centro"] as ChaveLoja[], keys: ["devolver_trocar", "contagem"] },
  { chave: "vendRodovia", name: "Juliana Costa", email: "vendedor.rodovia.demo.emporio@example.com", funcao: "vendedor", lojas: ["rodovia"] as ChaveLoja[], keys: [] as string[] },
] as const;
type ChaveMembro = (typeof MEMBROS)[number]["chave"];

const FORNECEDORES = [
  { chave: "A", nome: "Nutrisul Rações e Suplementos", cidade: "Cuiabá" },
  { chave: "B", nome: "Vet Campo Medicamentos Veterinários", cidade: "Campo Grande" },
  { chave: "C", nome: "Ferragens e Cordoalhas Planalto", cidade: "Goiânia" },
  { chave: "D", nome: "Agropecuária Vale Verde Distribuidora", cidade: "Rondonópolis" },
] as const;

const CLIENTES = [
  { chave: "tresIrmaos", nome: "Chácara Três Irmãos", tipo: "fazendeiro" as const, cidade: "Juscimeira" },
  { chave: "boaEsperanca", nome: "Sítio Boa Esperança", tipo: "fazendeiro" as const, cidade: "Pedra Preta" },
  { chave: "santaClara", nome: "Haras Santa Clara", tipo: "fazendeiro" as const, cidade: "Rondonópolis" },
  { chave: "pedraBranca", nome: "Fazenda Pedra Branca", tipo: "fazendeiro" as const, cidade: "Itiquira" },
  { chave: "mariaDores", nome: "Maria das Dores Ferreira", tipo: "particular" as const, cidade: "Rondonópolis" },
] as const;

type Papel = "fechada" | "granel";
type Ap = { papel: Papel; nome: string; base_qty?: number; content_qty?: number; sealed: boolean; auto?: boolean; preco: number };
type Prod = {
  slug: string;
  nome: string;
  cat: string;
  marca: string;
  fab: string;
  codigo: string;
  especies: string[];
  base: "quilograma" | "saca" | "fardo" | "unidade";
  conteudo?: [number, "quilograma" | "litro"];
  aps: Ap[];
  custo: number;
  origem: "A" | "B" | "C" | "D" | "inicial" | "producao";
  pop: number;
  qf: number[];
  qg?: number[];
};

const sacaKg = (kg: number, preco: number): Ap => ({ papel: "fechada", nome: `Saca ${kg} kg`, base_qty: kg, sealed: true, preco });
const quilo = (preco: number, content = false): Ap => ({ papel: "granel", nome: "Quilo", ...(content ? { content_qty: 1 } : { base_qty: 1 }), sealed: false, preco });
const autoFechada = (preco: number): Ap => ({ papel: "fechada", nome: "(automática)", sealed: true, auto: true, preco });
const unitaria = (nome: string, preco: number): Ap => ({ papel: "fechada", nome, base_qty: 1, sealed: false, preco });

const CATALOGO: Prod[] = [
  { slug: "caoAdulto", nome: "Ração Cães Adultos Carne", cat: "Ração", marca: "Nutripet", fab: "Nutripet Indústria de Rações", codigo: "RC-0150", especies: ["cao"], base: "quilograma", aps: [sacaKg(15, 159.9), quilo(12.5)], custo: 112, origem: "A", pop: 6, qf: [1, 1, 2], qg: [1, 2, 3, 5] },
  { slug: "caoFilhote", nome: "Ração Cães Filhotes", cat: "Ração", marca: "Nutripet", fab: "Nutripet Indústria de Rações", codigo: "RC-0100", especies: ["cao"], base: "quilograma", aps: [sacaKg(10, 139.9), quilo(15.9)], custo: 96, origem: "A", pop: 4, qf: [1, 1, 2], qg: [1, 2, 3] },
  { slug: "gatoAdulto", nome: "Ração Gatos Adultos Peixe", cat: "Ração", marca: "Felino Premium", fab: "Felino Premium Alimentos Pet", codigo: "RG-0100", especies: ["gato"], base: "quilograma", aps: [sacaKg(10, 169.9), quilo(19.5)], custo: 118, origem: "A", pop: 3, qf: [1, 1, 2], qg: [1, 2, 3] },
  { slug: "gatoCastrado", nome: "Ração Gatos Castrados", cat: "Ração", marca: "Felino Premium", fab: "Felino Premium Alimentos Pet", codigo: "RG-0150", especies: ["gato"], base: "quilograma", aps: [sacaKg(15, 214.9), quilo(16)], custo: 152, origem: "A", pop: 3, qf: [1, 1], qg: [1, 2, 3] },
  { slug: "bovEngorda", nome: "Ração Bovinos Engorda", cat: "Ração", marca: "Boi Forte", fab: "Boi Forte Nutrição Animal", codigo: "RB-0250", especies: ["bovino"], base: "saca", conteudo: [25, "quilograma"], aps: [autoFechada(94.9), quilo(4.5, true)], custo: 68, origem: "A", pop: 5, qf: [1, 2, 4, 6], qg: [5, 10, 20] },
  { slug: "bovLeite", nome: "Ração Vacas em Lactação", cat: "Ração", marca: "Boi Forte", fab: "Boi Forte Nutrição Animal", codigo: "RB-0260", especies: ["bovino"], base: "saca", conteudo: [25, "quilograma"], aps: [autoFechada(104.9), quilo(4.9, true)], custo: 74, origem: "A", pop: 3, qf: [1, 2, 4], qg: [5, 10] },
  { slug: "salCria", nome: "Sal Mineral Bovinos Cria", cat: "Sal mineral", marca: "MinerCampo", fab: "MinerCampo Suplementos", codigo: "SM-0300", especies: ["bovino"], base: "saca", conteudo: [30, "quilograma"], aps: [autoFechada(159)], custo: 119, origem: "A", pop: 5, qf: [1, 2, 3, 4] },
  { slug: "salEngorda", nome: "Sal Mineral Bovinos Engorda", cat: "Sal mineral", marca: "MinerCampo", fab: "MinerCampo Suplementos", codigo: "SM-0250", especies: ["bovino"], base: "saca", conteudo: [25, "quilograma"], aps: [autoFechada(134.9), quilo(6.2, true)], custo: 98, origem: "A", pop: 4, qf: [1, 2, 3], qg: [5, 10] },
  { slug: "equinos", nome: "Ração Equinos Manutenção", cat: "Ração", marca: "Cavalo Nobre", fab: "Cavalo Nobre Nutrição Equina", codigo: "RE-0250", especies: ["equino"], base: "saca", conteudo: [25, "quilograma"], aps: [autoFechada(129.9), quilo(5.9, true)], custo: 92, origem: "A", pop: 3, qf: [1, 2, 3], qg: [5, 10] },
  { slug: "milho", nome: "Milho em Grão", cat: "Alimentação animal", marca: "Safra Cheia", fab: "Cerealista Safra Cheia", codigo: "MG-0500", especies: ["aves", "suino", "bovino"], base: "saca", conteudo: [50, "quilograma"], aps: [autoFechada(84.9), quilo(2.2, true)], custo: 62, origem: "A", pop: 6, qf: [1, 2, 4, 8], qg: [5, 10, 20] },
  { slug: "farelo", nome: "Farelo de Trigo", cat: "Alimentação animal", marca: "Safra Cheia", fab: "Cerealista Safra Cheia", codigo: "FT-0300", especies: ["aves", "bovino", "suino"], base: "saca", conteudo: [30, "quilograma"], aps: [autoFechada(56.9)], custo: 41, origem: "A", pop: 3, qf: [1, 2, 3] },
  { slug: "poedeiras", nome: "Ração Poedeiras", cat: "Ração", marca: "Granja Ouro", fab: "Granja Ouro Rações", codigo: "RA-0250", especies: ["aves"], base: "saca", conteudo: [25, "quilograma"], aps: [autoFechada(89.9), quilo(4.2, true)], custo: 66, origem: "A", pop: 3, qf: [1, 2, 3], qg: [5, 10] },
  { slug: "feno", nome: "Feno de Tifton", cat: "Alimentação animal", marca: "Campo Verde", fab: "Fenos Campo Verde", codigo: "FE-0200", especies: ["equino", "bovino"], base: "fardo", conteudo: [20, "quilograma"], aps: [autoFechada(32.9)], custo: 21, origem: "D", pop: 4, qf: [2, 4, 6, 10] },
  { slug: "vermBov", nome: "Vermífugo Bovinos Ivermectina 1% 50 ml", cat: "Medicamentos", marca: "Vetmax", fab: "Vetmax Saúde Animal", codigo: "VB-0050", especies: ["bovino"], base: "unidade", conteudo: [0.05, "litro"], aps: [unitaria("Frasco", 24.9)], custo: 14.5, origem: "B", pop: 5, qf: [1, 2, 4, 6] },
  { slug: "vermPet", nome: "Vermífugo Cães e Gatos 4 comprimidos", cat: "Medicamentos", marca: "Vetmax", fab: "Vetmax Saúde Animal", codigo: "VP-0004", especies: ["cao", "gato"], base: "unidade", aps: [unitaria("Caixa", 39.9)], custo: 22, origem: "B", pop: 3, qf: [1, 1, 2] },
  { slug: "aftosa", nome: "Vacina Aftosa 50 doses", cat: "Vacinas", marca: "Imunovet", fab: "Imunovet Biológicos", codigo: "VA-0050", especies: ["bovino"], base: "unidade", aps: [unitaria("Frasco", 118)], custo: 82, origem: "B", pop: 3, qf: [1, 2, 3] },
  { slug: "v10", nome: "Vacina V10 Cães", cat: "Vacinas", marca: "Imunovet", fab: "Imunovet Biológicos", codigo: "VV-0010", especies: ["cao"], base: "unidade", aps: [unitaria("Dose", 69.9)], custo: 38, origem: "B", pop: 2, qf: [1, 1, 2] },
  { slug: "carrap", nome: "Carrapaticida Pour-on 1 L", cat: "Medicamentos", marca: "Vetmax", fab: "Vetmax Saúde Animal", codigo: "CP-0100", especies: ["bovino"], base: "unidade", conteudo: [1, "litro"], aps: [unitaria("Frasco", 89.9)], custo: 58, origem: "B", pop: 3, qf: [1, 2, 3] },
  { slug: "arameFarpado", nome: "Arame Farpado 500 m", cat: "Materiais para cerca", marca: "Aço Rural", fab: "Aço Rural Trefilados", codigo: "AF-0500", especies: ["outros"], base: "unidade", aps: [unitaria("Rolo", 489.9)], custo: 355, origem: "C", pop: 3, qf: [1, 1, 2, 3] },
  { slug: "arameLiso", nome: "Arame Liso Galvanizado 1000 m", cat: "Materiais para cerca", marca: "Aço Rural", fab: "Aço Rural Trefilados", codigo: "AL-1000", especies: ["outros"], base: "unidade", aps: [unitaria("Rolo", 429.9)], custo: 312, origem: "C", pop: 2, qf: [1, 1, 2] },
  { slug: "corda", nome: "Corda de Nylon 10 mm 50 m", cat: "Ferramentas", marca: "Cordas Forte", fab: "Cordoaria Forte", codigo: "CN-0050", especies: ["outros"], base: "unidade", aps: [unitaria("Rolo", 169.9)], custo: 118, origem: "inicial", pop: 2, qf: [1, 1, 2] },
  { slug: "ferr4", nome: "Ferradura nº 4", cat: "Ferramentas", marca: "Ferrovet", fab: "Ferrovet Artefatos", codigo: "FR-0004", especies: ["equino"], base: "unidade", aps: [unitaria("Unidade", 19.9)], custo: 11.5, origem: "inicial", pop: 2, qf: [4, 8, 12] },
  { slug: "ferr5", nome: "Ferradura nº 5", cat: "Ferramentas", marca: "Ferrovet", fab: "Ferrovet Artefatos", codigo: "FR-0005", especies: ["equino"], base: "unidade", aps: [unitaria("Unidade", 21.9)], custo: 12.5, origem: "inicial", pop: 2, qf: [4, 8, 12] },
  { slug: "grampo", nome: "Grampo para Cerca", cat: "Materiais para cerca", marca: "Aço Rural", fab: "Aço Rural Trefilados", codigo: "GC-0050", especies: ["outros"], base: "quilograma", aps: [{ papel: "fechada", nome: "Caixa 5 kg", base_qty: 5, sealed: true, preco: 69.9 }, quilo(15.9)], custo: 48, origem: "inicial", pop: 3, qf: [1, 2], qg: [1, 2, 3] },
  { slug: "mistura", nome: "Mistura para Galinhas", cat: "Alimentação animal", marca: "Feito na loja", fab: "Loja da Rodovia", codigo: "MG-0001", especies: ["aves"], base: "quilograma", aps: [{ papel: "fechada", nome: "Saco 20 kg", base_qty: 20, sealed: true, preco: 69.9 }, quilo(3.8)], custo: 0, origem: "producao", pop: 0, qf: [1] },
];

const porSlug = new Map(CATALOGO.map((p) => [p.slug, p]));
const precoDe = (slug: string, papel: Papel, loja: ChaveVenda): number => {
  const ap = (porSlug.get(slug) as Prod).aps.find((a) => a.papel === papel);
  if (!ap) throw new Error(`Sem apresentação ${papel} em ${slug}`);
  return loja === "centro" ? ap.preco : r2(ap.preco * 1.05);
};

// ---------------------------------------------------------------------------
// Vendas: as explicitas e as de todo dia
// ---------------------------------------------------------------------------

type ItemV = { slug: string; papel: Papel; qtd: number };
type PagV =
  | { kind: "dinheiro" | "pix" | "debito" | "credito_vista"; cents: number }
  | { kind: "credito_parcelado"; cents: number; parcelas: number }
  | { kind: "fiado"; cents: number; vence: Date }
  | { kind: "cheque"; cents: number; numero: string; banco: string; bomPara: Date };
type VendaPlan = {
  chave: string;
  tag: string;
  loja: ChaveVenda;
  quando: Date;
  quem: ChaveMembro;
  itens: ItemV[];
  cliente?: (typeof CLIENTES)[number]["chave"];
  fator?: number; // desconto: preço unitário = tabela * fator
  pagamentos: PagV[];
};

const precoItem = (v: { loja: ChaveVenda; fator?: number }, i: ItemV) => r2(precoDe(i.slug, i.papel, v.loja) * (v.fator ?? 1));
const totalCents = (v: { loja: ChaveVenda; fator?: number }, itens: ItemV[]) =>
  itens.reduce((s, i) => s + cents(i.qtd * precoItem(v, i)), 0);

function vendasExplicitas(): VendaPlan[] {
  const mk = (tag: string, loja: ChaveVenda, d: number, h: number, quem: ChaveMembro, itens: ItemV[], pag: (c: number) => PagV[], extra: Partial<VendaPlan> = {}): VendaPlan => {
    const c = totalCents({ loja, fator: extra.fator }, itens);
    return { chave: `${PREFIXO}venda-${tag}`, tag, loja, quando: dia(d, h), quem, itens, pagamentos: pag(c), ...extra };
  };
  return [
    mk("fiado-vencido", "centro", 26, 11, "vendCentro", [{ slug: "bovEngorda", papel: "fechada", qtd: 8 }, { slug: "salEngorda", papel: "fechada", qtd: 4 }], (c) => [{ kind: "fiado", cents: c, vence: dia(8, 12) }], { cliente: "tresIrmaos" }),
    mk("fiado-parcial", "centro", 18, 15, "vendCentro", [{ slug: "salCria", papel: "fechada", qtd: 4 }, { slug: "vermBov", papel: "fechada", qtd: 6 }], (c) => [{ kind: "fiado", cents: c, vence: dia(-10, 12) }], { cliente: "boaEsperanca" }),
    mk("fiado-rodovia", "rodovia", 9, 16, "vendRodovia", [{ slug: "equinos", papel: "fechada", qtd: 6 }, { slug: "feno", papel: "fechada", qtd: 10 }], (c) => [{ kind: "fiado", cents: c, vence: dia(-12, 12) }], { cliente: "santaClara" }),
    mk("cheque", "centro", 14, 10, "gestor", [{ slug: "arameFarpado", papel: "fechada", qtd: 2 }, { slug: "grampo", papel: "fechada", qtd: 2 }], (c) => [{ kind: "cheque", cents: c, numero: "004512", banco: "Banco do Brasil", bomPara: dia(-20, 12) }], { cliente: "pedraBranca" }),
    mk("devolver", "centro", 22, 9, "vendCentro", [{ slug: "caoAdulto", papel: "fechada", qtd: 2 }, { slug: "vermPet", papel: "fechada", qtd: 1 }], (c) => [{ kind: "dinheiro", cents: c }]),
    mk("troca", "centro", 15, 14, "vendCentro", [{ slug: "caoAdulto", papel: "fechada", qtd: 1 }, { slug: "v10", papel: "fechada", qtd: 1 }], (c) => [{ kind: "pix", cents: c }], { cliente: "mariaDores" }),
    mk("avaria", "rodovia", 11, 10, "vendRodovia", [{ slug: "v10", papel: "fechada", qtd: 3 }], (c) => [{ kind: "pix", cents: c }]),
    mk("cancelar", "centro", 5, 17, "vendCentro", [{ slug: "corda", papel: "fechada", qtd: 1 }, { slug: "ferr4", papel: "fechada", qtd: 4 }], (c) => [{ kind: "dinheiro", cents: c }]),
    mk("desconto-gestor", "centro", 3, 13, "gestor", [{ slug: "milho", papel: "fechada", qtd: 20 }], (c) => [{ kind: "credito_parcelado", cents: c, parcelas: 3 }], { fator: 0.92, cliente: "pedraBranca" }),
  ];
}

/** As duas vendas da mistura saem depois da produção (ela só existe então). */
function vendasDaMistura(): VendaPlan[] {
  const mk = (tag: string, d: number, h: number, itens: ItemV[], pag: (c: number) => PagV[]): VendaPlan => {
    const c = totalCents({ loja: "rodovia" }, itens);
    return { chave: `${PREFIXO}venda-${tag}`, tag, loja: "rodovia", quando: dia(d, h), quem: "vendRodovia", itens, pagamentos: pag(c) };
  };
  return [
    mk("mistura-1", 4, 9, [{ slug: "mistura", papel: "fechada", qtd: 2 }, { slug: "mistura", papel: "granel", qtd: 7.5 }], (c) => [{ kind: "pix", cents: c }]),
    mk("mistura-2", 1, 15, [{ slug: "mistura", papel: "granel", qtd: 12 }], (c) => [{ kind: "dinheiro", cents: c }]),
  ];
}

function vendasDeTodoDia(): VendaPlan[] {
  const rnd = prng(20261030);
  const escolher = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const pool: { slug: string; papel: Papel; peso: number; qtds: number[] }[] = [];
  for (const p of CATALOGO) {
    if (p.pop === 0) continue;
    pool.push({ slug: p.slug, papel: "fechada", peso: p.pop, qtds: p.qf });
    if (p.qg) pool.push({ slug: p.slug, papel: "granel", peso: p.pop * 0.6, qtds: p.qg });
  }
  const somaPesos = pool.reduce((s, x) => s + x.peso, 0);
  const sortear = () => {
    let r = rnd() * somaPesos;
    for (const x of pool) {
      r -= x.peso;
      if (r <= 0) return x;
    }
    return pool[pool.length - 1];
  };

  const saida: VendaPlan[] = [];
  const clientes = CLIENTES.map((c) => c.chave);
  for (let d = 30; d >= 1; d--) {
    for (const loja of ["centro", "rodovia"] as ChaveVenda[]) {
      const dow = dia(d).getDay();
      if (loja === "centro" && dow === 0) continue;
      const n = loja === "centro" ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 4);
      for (let k = 1; k <= n; k++) {
        const r = rnd();
        const nItens = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
        const itens: ItemV[] = [];
        while (itens.length < nItens) {
          const x = sortear();
          if (itens.some((i) => i.slug === x.slug && i.papel === x.papel)) continue;
          itens.push({ slug: x.slug, papel: x.papel, qtd: escolher(x.qtds) });
        }
        const fator = rnd() < 0.08 ? 0.97 : undefined;
        const c = totalCents({ loja, fator }, itens);
        const q = rnd();
        let pagamentos: PagV[];
        if (q < 0.3) pagamentos = [{ kind: "dinheiro", cents: c }];
        else if (q < 0.58) pagamentos = [{ kind: "pix", cents: c }];
        else if (q < 0.75) pagamentos = [{ kind: "debito", cents: c }];
        else if (q < 0.84) pagamentos = [{ kind: "credito_vista", cents: c }];
        else if (q < 0.9) {
          pagamentos = c >= 15000 ? [{ kind: "credito_parcelado", cents: c, parcelas: 2 + Math.floor(rnd() * 3) }] : [{ kind: "credito_vista", cents: c }];
        } else {
          const parte = Math.min(Math.floor(c / 200) * 100, c - 100);
          pagamentos = parte >= 100 ? [{ kind: "dinheiro", cents: parte }, { kind: "pix", cents: c - parte }] : [{ kind: "pix", cents: c }];
        }
        const quemR = rnd();
        const quem: ChaveMembro = quemR < 0.82 ? (loja === "centro" ? "vendCentro" : "vendRodovia") : "gestor";
        const horaR = rnd();
        saida.push({
          chave: `${PREFIXO}venda-${loja}-${String(d).padStart(2, "0")}-${k}`,
          tag: `${loja}-${d}-${k}`,
          loja,
          quando: dia(d, 8 + Math.floor(horaR * 10), Math.floor(rnd() * 60)),
          quem,
          itens,
          cliente: rnd() < 0.15 ? escolher(clientes) : undefined,
          fator,
          pagamentos,
        });
      }
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Estado resolvido (ids) e consulta
// ---------------------------------------------------------------------------

type Resolvido = { epId: string; fechadaId: string; granelId: string | null; fechadaBase: number; granelBase: number | null; tracked: boolean };

type Ctx = {
  db: TenantPrismaClient;
  tenantId: string;
  lojas: Record<ChaveLoja, string>;
  atores: Record<ChaveMembro | "dono", Ator>;
  contatos: Record<string, string>;
  contaId: string;
  prods: Map<string, Resolvido>;
};

async function resolverProdutos(db: TenantPrismaClient): Promise<Map<string, Resolvido>> {
  const mapa = new Map<string, Resolvido>();
  for (const p of CATALOGO) {
    const base = await db.product.findFirst({ where: { name: { equals: p.nome, mode: "insensitive" } }, select: { id: true } });
    if (!base) continue;
    const ep = await db.emporioProduct.findFirst({ where: { product_id: base.id }, include: { presentations: true } });
    if (!ep) continue;
    const ativas = ep.presentations.filter((a) => !a.archived_at);
    const fechadaAp = p.aps.find((a) => a.papel === "fechada") as Ap;
    const granelAp = p.aps.find((a) => a.papel === "granel");
    const fechada = fechadaAp.auto ? ativas.find((a) => a.is_sealed_package) : ativas.find((a) => a.name.toLowerCase() === fechadaAp.nome.toLowerCase());
    const granel = granelAp ? ativas.find((a) => a.name.toLowerCase() === granelAp.nome.toLowerCase()) : undefined;
    if (!fechada) continue;
    if (granelAp && !granel) continue;
    const num = (v: unknown) => Number(v);
    mapa.set(p.slug, {
      epId: ep.id,
      fechadaId: fechada.id,
      granelId: granel?.id ?? null,
      fechadaBase: num(fechada.base_qty),
      granelBase: granel ? num(granel.base_qty) : null,
      tracked: ativas.some((a) => a.is_sealed_package) && ativas.some((a) => !a.is_sealed_package),
    });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Demanda, compras e transferencias
// ---------------------------------------------------------------------------

type Demanda = Map<string, Record<ChaveVenda, number>>; // em embalagens (fechadas) por loja

/** Quantas embalagens fechadas cada loja vai precisar, somando as vendas planejadas. */
function calcularDemanda(planos: VendaPlan[], prods: Map<string, Resolvido> | null): Demanda {
  const baseDe = (slug: string, papel: Papel): number => {
    const p = porSlug.get(slug) as Prod;
    const ap = p.aps.find((a) => a.papel === papel) as Ap;
    if (ap.base_qty) return ap.base_qty;
    if (papel === "fechada") return 1; // saca ou fardo automáticos valem 1 na unidade-base
    // granel em produto de saca/fardo: 1 kg dividido pelo conteúdo
    return Number((1 / (p.conteudo as [number, string])[0]).toFixed(3));
  };
  const fechadaBase = (slug: string): number => {
    const r = prods?.get(slug);
    if (r) return r.fechadaBase;
    const ap = (porSlug.get(slug) as Prod).aps.find((a) => a.papel === "fechada") as Ap;
    return ap.base_qty ?? 1;
  };
  const d: Demanda = new Map();
  for (const p of CATALOGO) d.set(p.slug, { centro: 0, rodovia: 0 });
  for (const v of planos) {
    for (const i of v.itens) {
      const linha = d.get(i.slug);
      if (!linha) continue;
      linha[v.loja] += (i.qtd * baseDe(i.slug, i.papel)) / fechadaBase(i.slug);
    }
  }
  // A produção da mistura baixa 2 sacas de milho e 2 de farelo na Loja da Rodovia.
  (d.get("milho") as Record<ChaveVenda, number>).rodovia += 2;
  (d.get("farelo") as Record<ChaveVenda, number>).rodovia += 2;
  // A troca da Loja Centro leva 1 saca de ração de gatos castrados.
  (d.get("gatoCastrado") as Record<ChaveVenda, number>).centro += 1;
  return d;
}

const ONDAS = 3;
const porOnda = (embalagens: number) => Math.max(Math.ceil((embalagens * 1.3) / ONDAS) + 1, 2);

/** Extras do Depósito: o que as transferências especiais levam, em embalagens. */
const EXTRAS_SAIDA: Record<string, number> = { milho: 10, vermBov: 24, salEngorda: 10, equinos: 6 };

function saidaDoDeposito(demanda: Demanda): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of CATALOGO) {
    if (p.origem === "producao") continue;
    const d = demanda.get(p.slug) as Record<ChaveVenda, number>;
    m.set(p.slug, porOnda(d.centro) * ONDAS + porOnda(d.rodovia) * ONDAS + (EXTRAS_SAIDA[p.slug] ?? 0));
  }
  return m;
}

const COMPRAS_PLANO = [
  { chave: "A-30", forn: "A", dias: 30, parte: 0.5, pagamento: "a_vista", frete: 380 },
  { chave: "A-20", forn: "A", dias: 20, parte: 0.3, pagamento: "a_prazo", frete: 250 },
  { chave: "A-10", forn: "A", dias: 10, parte: 0.2, pagamento: "parcelada", frete: 0 },
  { chave: "B-30", forn: "B", dias: 30, parte: 0.6, pagamento: "a_vista", frete: 0 },
  { chave: "B-12", forn: "B", dias: 12, parte: 0.4, pagamento: "a_prazo", frete: 0 },
  { chave: "C-25", forn: "C", dias: 25, parte: 1, pagamento: "parcelada", frete: 120 },
  { chave: "D-28", forn: "D", dias: 28, parte: 1, pagamento: "a_vista", frete: 90 },
] as const;

type CompraMontada = { chave: string; forn: string; dias: number; pagamento: string; frete: number; itens: { slug: string; qtd: number }[] };

function montarCompras(saida: Map<string, number>): CompraMontada[] {
  const grupos = new Map<string, typeof COMPRAS_PLANO[number][]>();
  for (const c of COMPRAS_PLANO) grupos.set(c.forn, [...(grupos.get(c.forn) ?? []), c]);
  const montadas: CompraMontada[] = COMPRAS_PLANO.map((c) => ({ chave: c.chave, forn: c.forn, dias: c.dias, pagamento: c.pagamento, frete: c.frete, itens: [] }));
  for (const p of CATALOGO) {
    if (p.origem === "inicial" || p.origem === "producao") continue;
    const total = Math.ceil((saida.get(p.slug) as number) * 1.25) + 6;
    const doGrupo = grupos.get(p.origem) as typeof COMPRAS_PLANO[number][];
    let restante = total;
    doGrupo.forEach((c, idx) => {
      const q = idx === doGrupo.length - 1 ? restante : Math.max(Math.ceil(total * c.parte), 1);
      restante -= q;
      if (q > 0) montadas.find((m) => m.chave === c.chave)?.itens.push({ slug: p.slug, qtd: q });
    });
  }
  return montadas;
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

const log = (m: string) => console.log(m);

async function contarExistentes(db: TenantPrismaClient) {
  const pref = { startsWith: PREFIXO };
  const [compras, transfs, vendas, devolucoes, recebimentos, caixas, producoes] = await Promise.all([
    db.emporioPurchase.count({ where: { operation_key: pref } }),
    db.stockTransfer.count({ where: { operation_key: pref } }),
    db.emporioSale.count({ where: { operation_key: pref } }),
    db.emporioSaleReturn.count({ where: { operation_key: pref } }),
    db.cashMovement.count({ where: { operation_key: pref, origin: "recebimento_fiado" } }),
    db.cashTransfer.count({ where: { operation_key: pref } }),
    db.productionEntry.count({ where: { operation_key: pref } }),
  ]);
  return { compras, transfs, vendas, devolucoes, recebimentos, caixas, producoes };
}

async function main() {
  if (!contaArg) {
    console.error("Informe a conta: --conta <id do tenant>.");
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://sem-url");
  const host = url.hostname;
  const local = host === "127.0.0.1" || host === "localhost";

  const tenant = await prisma.tenant.findUnique({ where: { id: contaArg }, select: { id: true, name: true, plan: true } });
  console.log("=".repeat(70));
  console.log(`Banco:  ${host}${url.port ? `:${url.port}` : ""}${url.pathname}  (${local ? "LOCAL" : "NÃO É LOCAL"})`);
  console.log(`Conta:  ${tenant ? `${tenant.name} (${tenant.id}), plano ${tenant.plan}` : `${contaArg} (NÃO ENCONTRADA)`}`);
  console.log(`Modo:   ${apagar ? "APAGAR o cenário" : "montar o cenário"} ${confirmar ? "(--confirmar: ESCREVE)" : "(sem --confirmar: só mostra o plano)"}`);
  console.log("=".repeat(70));
  if (!tenant) process.exit(1);

  const db = prismaForTenant(tenant.id);

  const recurso = await db.tenantFeature.findFirst({ where: { feature_key: "emporio", enabled: true }, select: { id: true } });
  const perfil = await db.tenantProfile.findFirst({ where: { profile_type: "emporio", active: true }, select: { id: true } });
  if (!recurso || !perfil) {
    console.error(
      `Esta conta não tem o Meu Empório ligado (recurso ${recurso ? "ok" : "desligado"}, perfil ${perfil ? "ativo" : "inativo"}). Ligue pela Plataforma, no cartão do Empório da conta, e rode de novo.`,
    );
    process.exit(1);
  }
  const owner = await db.user.findFirst({ where: { role: "OWNER", active: true }, orderBy: { created_at: "asc" } });
  if (!owner) {
    console.error("A conta não tem um OWNER ativo.");
    process.exit(1);
  }

  if (apagar) {
    if (!local) {
      console.error("--apagar só vale no banco local (127.0.0.1 ou localhost). Recusado.");
      process.exit(1);
    }
    await apagarCenario(tenant.id, confirmar);
    await prisma.$disconnect();
    return;
  }

  await montar(db, tenant.id, owner, local);
  await prisma.$disconnect();
}

async function montar(db: TenantPrismaClient, tenantId: string, owner: { id: string; role: AppUserRole }, _local: boolean) {
  // ---- Plano (sempre calculado: serve ao modo seco e à execução) ----------
  const explicitas = vendasExplicitas();
  const todoDia = vendasDeTodoDia();
  const daMistura = vendasDaMistura();
  const sortidas = [...explicitas, ...todoDia].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const demanda = calcularDemanda([...sortidas, ...daMistura], null);
  const saida = saidaDoDeposito(demanda);
  const comprasMontadas = montarCompras(saida);

  // ---- Situação atual ------------------------------------------------------
  const lojasExistentes = new Map<string, string>();
  for (const l of LOJAS) {
    const e = await db.establishment.findFirst({ where: { name: { equals: l.nome, mode: "insensitive" } }, select: { id: true } });
    if (e) lojasExistentes.set(l.chave, e.id);
  }
  const membrosFaltando: string[] = [];
  for (const m of MEMBROS) {
    const u = await prisma.user.findUnique({ where: { email: m.email }, select: { id: true, tenant_id: true } });
    if (u && u.tenant_id !== tenantId) throw new Parar(`O email ${m.email} já pertence a outra conta. O cenário não pode seguir.`);
    if (!u) membrosFaltando.push(m.email);
  }
  const prodsExistentes = await resolverProdutos(db);
  const contatosExistentes = new Set(
    (await db.contact.findMany({ where: { name: { in: [...FORNECEDORES.map((f) => f.nome), ...CLIENTES.map((c) => c.nome)] } }, select: { name: true } })).map((c) => c.name),
  );
  const conta = await db.bankAccount.findFirst({ where: { name: CONTA_NOME }, select: { id: true } });
  const existentes = await contarExistentes(db);
  const seats = await getSeatUsage(db, tenantId);

  const resumoPlano = [
    ["Lojas", `${lojasExistentes.size} de ${LOJAS.length} já existem`, LOJAS.length - lojasExistentes.size],
    ["Conta bancária", conta ? "já existe" : "seria criada", conta ? 0 : 1],
    ["Equipe", `${MEMBROS.length - membrosFaltando.length} de ${MEMBROS.length} já existem (assentos: ${seats.used} de ${seats.limit} em uso)`, membrosFaltando.length],
    ["Contatos", `${contatosExistentes.size} de ${FORNECEDORES.length + CLIENTES.length} já existem`, FORNECEDORES.length + CLIENTES.length - contatosExistentes.size],
    ["Produtos", `${prodsExistentes.size} de ${CATALOGO.length} já existem`, CATALOGO.length - prodsExistentes.size],
    ["Compras", `${existentes.compras} de ${comprasMontadas.length} já lançadas`, comprasMontadas.length - existentes.compras],
    ["Transferências", `${existentes.transfs} de ${ONDAS * 2 + 3} já enviadas`, ONDAS * 2 + 3 - existentes.transfs],
    ["Produção", `${existentes.producoes} de 1`, 1 - existentes.producoes],
    // +1: a troca gera a venda nova (chave `...:venda`), que também leva o prefixo.
    ["Vendas", `${existentes.vendas} de ${sortidas.length + daMistura.length + 1} já lançadas`, sortidas.length + daMistura.length + 1 - existentes.vendas],
    ["Devoluções e trocas", `${existentes.devolucoes} de 3`, 3 - existentes.devolucoes],
    ["Recebimentos de fiado", `${existentes.recebimentos} de 2 (partes)`, Math.max(0, 2 - existentes.recebimentos)],
    ["Levar gaveta ao banco", `${existentes.caixas} de 2`, 2 - existentes.caixas],
  ] as const;
  log("\nO que existe e o que seria criado:");
  for (const [nome, estado, falta] of resumoPlano) log(`  - ${nome.padEnd(24)} ${estado}${falta > 0 ? `  -> criaria/lançaria ${falta}` : ""}`);
  const vendasTotal = [...sortidas, ...daMistura].reduce((s, v) => s + totalCents(v, v.itens), 0);
  log(`\nPlano de vendas: ${sortidas.length + daMistura.length} vendas, ${brl(vendasTotal / 100)} no papel (as canceladas e devolvidas não entram no resultado).`);
  log(`Assentos: o cenário precisa de ${membrosFaltando.length} novo(s); sobram ${Math.max(seats.limit - seats.used, 0)}.`);

  if (membrosFaltando.length > seats.limit - seats.used) {
    console.error("\nA conta precisa do plano grupo (5 assentos). Suba o plano e rode de novo.");
    process.exit(1);
  }
  if (!confirmar) {
    log("\n(nada foi escrito; repita com --confirmar para executar)");
    return;
  }

  // ---- Execução ------------------------------------------------------------
  const dono: Ator = { id: owner.id, role: owner.role };
  const senhas: { email: string; name: string; senha: string }[] = [];

  // Lojas (o Dono cria)
  const lojas = {} as Record<ChaveLoja, string>;
  for (const l of LOJAS) {
    let id = lojasExistentes.get(l.chave);
    if (!id) {
      const v = exigir(await cat.criarEstabelecimentoAction(db, dono, {
        name: l.nome,
        address: l.endereco,
        city: l.cidade,
        max_discount_pct: l.desc,
        default_expense_pct: l.desp,
        default_profit_pct: l.lucro,
      }), `loja ${l.nome}`);
      id = v.id;
      log(`Loja criada: ${l.nome}`);
    }
    lojas[l.chave] = id;
  }

  // Equipe (o Dono cadastra; o assento já foi conferido antes de qualquer escrita)
  for (const m of MEMBROS) {
    const ja = await db.user.findFirst({ where: { email: m.email } });
    if (ja) continue;
    const r = await equipe.cadastrarMembroAction(db, dono, {
      name: m.name,
      email: m.email,
      emporio_role: m.funcao,
      establishment_ids: m.lojas.map((c) => lojas[c]),
      emporio_keys: [...m.keys],
    });
    if (!r.ok) {
      if (r.code === "SEAT_LIMIT_REACHED") throw new Parar("A conta precisa do plano grupo (5 assentos). Suba o plano e rode de novo.");
      throw new Error(`equipe ${m.email}: ${r.message} (${r.code})`);
    }
    senhas.push({ email: m.email, name: m.name, senha: r.data.temp_password });
    log(`Pessoa cadastrada: ${m.name} (${m.funcao})`);
  }

  const atores = { dono } as Ctx["atores"];
  for (const m of MEMBROS) {
    const u = await db.user.findFirst({ where: { email: m.email } });
    if (!u) throw new Error(`Usuário ${m.email} não apareceu.`);
    atores[m.chave] = { id: u.id, role: u.role };
  }
  const { gerente, gestor, vendCentro, vendRodovia } = atores;

  // Conta bancária e PIX
  let contaId = conta?.id;
  if (!contaId) {
    contaId = exigir(await caixa.criarContaAction(db, dono, { name: CONTA_NOME, bank: "Sicredi" }), "conta bancária").id;
    log(`Conta bancária criada: ${CONTA_NOME}`);
  }
  for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
    const e = await db.establishment.findFirst({ where: { id: lojas[c] }, select: { pix_bank_account_id: true } });
    if (e?.pix_bank_account_id !== contaId) exigir(await caixa.definirContaPixAction(db, gerente, lojas[c], { bank_account_id: contaId }), `PIX ${c}`);
  }
  // Saldo inicial da conta (o Dono) e troco da gaveta de cada loja (o Vendedor).
  const saldoConta = await caixa.saldoInicialCaixaAction(db, dono, { bank_account_id: contaId, amount: 30000, occurred_at: dia(30, 8) });
  if (!saldoConta.ok && saldoConta.code !== "OPENING_ALREADY_DONE") throw new Error(`saldo da conta: ${saldoConta.message}`);
  for (const [c, quem] of [["centro", vendCentro], ["rodovia", vendRodovia]] as const) {
    const r = await caixa.saldoInicialCaixaAction(db, quem, { establishment_id: lojas[c], amount: 300, occurred_at: dia(30, 8, 30) });
    if (!r.ok && r.code !== "OPENING_ALREADY_DONE") throw new Error(`troco ${c}: ${r.message}`);
  }

  // Regras de cartão por loja (o Gerente geral configura)
  const taxas: Record<ChaveVenda, Record<string, [number, number]>> = {
    centro: { debito: [1.5, 1], credito_vista: [3.2, 30], credito_parcelado: [4.5, 30] },
    rodovia: { debito: [1.6, 1], credito_vista: [3.4, 30], credito_parcelado: [4.8, 30] },
  };
  for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
    for (const [kind, [pct, dias]] of Object.entries(taxas[c])) {
      const ja = await db.cardFeeRule.findFirst({ where: { establishment_id: lojas[c], kind: kind as "debito" } });
      if (ja) continue;
      exigir(await caixa.definirRegraCartaoAction(db, gerente, { establishment_id: lojas[c], kind, fee_pct: pct, days: dias, bank_account_id: contaId }), `cartão ${c} ${kind}`);
    }
  }

  // Contatos
  const contatos: Record<string, string> = {};
  for (const f of FORNECEDORES) contatos[f.chave] = await acharOuCriarContato(db, f.nome, "loja_fornecedor", f.cidade);
  for (const c of CLIENTES) contatos[c.chave] = await acharOuCriarContato(db, c.nome, c.tipo, c.cidade);

  // Produtos (o Gerente geral cadastra)
  await ensureProductCategories(db);
  const categorias = new Map((await db.productCategory.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]));
  for (const p of CATALOGO) {
    let r = (await resolverProdutos(db)).get(p.slug);
    if (r) continue;
    const catId = categorias.get(p.cat);
    if (!catId) throw new Error(`A categoria "${p.cat}" não existe nesta conta.`);
    const jaProduto = await db.product.findFirst({ where: { name: { equals: p.nome, mode: "insensitive" } }, select: { id: true } });
    let epId: string;
    const existente = jaProduto ? await db.emporioProduct.findFirst({ where: { product_id: jaProduto.id }, select: { id: true } }) : null;
    if (existente) {
      epId = existente.id;
    } else {
      const novo = exigir(await cat.criarProdutoEmporioAction(db, gerente, {
        name: p.nome,
        category_id: catId,
        brand: p.marca,
        manufacturer: p.fab,
        internal_code: p.codigo,
        species: p.especies,
        base_unit: p.base,
        ...(p.conteudo ? { content_qty: p.conteudo[0], content_unit: p.conteudo[1] } : {}),
      }), `produto ${p.nome}`);
      epId = novo.id;
    }
    const atuais = await db.productPresentation.findMany({ where: { emporio_product_id: epId } });
    for (const ap of p.aps) {
      if (ap.auto) continue;
      if (atuais.some((a) => a.name.toLowerCase() === ap.nome.toLowerCase())) continue;
      exigir(await cat.criarApresentacaoAction(db, gerente, epId, {
        name: ap.nome,
        is_sealed_package: ap.sealed,
        ...(ap.content_qty !== undefined ? { content_qty: ap.content_qty } : { base_qty: ap.base_qty }),
      }), `apresentação ${ap.nome} de ${p.nome}`);
    }
    r = (await resolverProdutos(db)).get(p.slug);
    if (!r) throw new Error(`O produto ${p.nome} não ficou completo.`);
    log(`Produto: ${p.nome}`);
  }
  const prods = await resolverProdutos(db);

  const ctx: Ctx = { db, tenantId, lojas, atores, contatos, contaId, prods };

  // Preços por loja (Depósito não vende)
  for (const p of CATALOGO) {
    const r = prods.get(p.slug) as Resolvido;
    for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
      for (const ap of p.aps) {
        const id = ap.papel === "fechada" ? r.fechadaId : (r.granelId as string);
        const preco = precoDe(p.slug, ap.papel, c);
        const atual = await db.presentationPrice.findFirst({ where: { establishment_id: lojas[c], presentation_id: id } });
        if (atual && Number(atual.price) === preco) continue;
        exigir(await cat.definirPrecoAction(db, gerente, { establishment_id: lojas[c], presentation_id: id, price: preco }), `preço ${p.nome}`);
      }
    }
  }

  // Composição da mistura (a conta configura)
  {
    const mist = prods.get("mistura") as Resolvido;
    const ja = await db.composition.findFirst({ where: { emporio_product_id: mist.epId } });
    if (!ja) {
      exigir(await prod.definirComposicaoAction(db, gerente, mist.epId, {
        reference_qty: 80,
        items: [
          { component_emporio_product_id: (prods.get("milho") as Resolvido).epId, quantity: 1 },
          { component_emporio_product_id: (prods.get("farelo") as Resolvido).epId, quantity: 1 },
        ],
      }), "composição da mistura");
    }
  }

  // Despesas: regra do Vendeu, Pagou e as despesas fixas
  for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
    const ja = await db.variableExpenseRule.findFirst({ where: { establishment_id: lojas[c], name: "Comissão de venda" } });
    if (!ja) exigir(await desp.criarRegraVariavelAction(db, gestor, { establishment_id: lojas[c], name: "Comissão de venda", kind: "percentual", value: 1.5 }), `regra de comissão ${c}`);
  }
  {
    const inicio = new Date();
    inicio.setDate(1);
    inicio.setMonth(inicio.getMonth() - 1);
    inicio.setHours(12, 0, 0, 0);
    const aluguel = await db.fixedExpenseTemplate.findFirst({ where: { name: "Aluguel" } });
    if (!aluguel) {
      exigir(await desp.criarDespesaFixaAction(db, gerente, {
        name: "Aluguel",
        category: "Aluguel",
        amount: 5100,
        due_day: 5,
        split_kind: "valor",
        starts_on: inicio,
        splits: [{ establishment_id: lojas.centro, value: 2400 }, { establishment_id: lojas.rodovia, value: 1800 }, { establishment_id: lojas.deposito, value: 900 }],
      }), "despesa fixa Aluguel");
    }
    const energia = await db.fixedExpenseTemplate.findFirst({ where: { name: "Energia elétrica" } });
    if (!energia) {
      exigir(await desp.criarDespesaFixaAction(db, gerente, {
        name: "Energia elétrica",
        category: "Energia elétrica",
        amount: 1380,
        due_day: 15,
        split_kind: "percentual",
        starts_on: inicio,
        splits: [{ establishment_id: lojas.deposito, value: 20 }, { establishment_id: lojas.centro, value: 45 }, { establishment_id: lojas.rodovia, value: 35 }],
      }), "despesa fixa Energia");
    }
  }

  // Estoque inicial (Depósito, para o que não se compra) e limites
  for (const p of CATALOGO.filter((x) => x.origem === "inicial")) {
    const r = prods.get(p.slug) as Resolvido;
    const qtd = Math.ceil((saida.get(p.slug) as number) * 1.5) + 10;
    const entrada = r.tracked
      ? { sealed: [{ presentation_id: r.fechadaId, packages: qtd }] }
      : { loose_qty: qtd * r.fechadaBase };
    const rr = await est.implantarEstoqueAction(db, gerente, { establishment_id: lojas.deposito, emporio_product_id: r.epId, unit_cost: p.custo / r.fechadaBase, ...entrada });
    if (!rr.ok && rr.code !== "ALREADY_IMPLANTED") throw new Error(`estoque inicial ${p.nome}: ${rr.message}`);
  }
  {
    const corda = prods.get("corda") as Resolvido;
    const rr = await est.implantarEstoqueAction(db, gestor, { establishment_id: lojas.rodovia, emporio_product_id: corda.epId, loose_qty: 10, unit_cost: 118 });
    if (!rr.ok && rr.code !== "ALREADY_IMPLANTED") throw new Error(`estoque inicial da corda na Rodovia: ${rr.message}`);
  }
  const limites: [string, number, number][] = [["caoAdulto", 30, 150], ["bovEngorda", 5, 30], ["milho", 6, 40], ["vermBov", 10, 60], ["aftosa", 4, 20], ["arameFarpado", 3, 12]];
  for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
    for (const [slug, min, max] of limites) {
      const r = prods.get(slug) as Resolvido;
      const ja = await db.stockLimit.findFirst({ where: { establishment_id: lojas[c], emporio_product_id: r.epId } });
      if (ja) continue;
      exigir(await est.definirLimitesAction(db, gestor, { establishment_id: lojas[c], emporio_product_id: r.epId, min_qty: min, max_qty: max }), `limite ${slug}`);
    }
  }

  // Compras (o Gerente geral lança), todas recebidas no Depósito
  for (const c of comprasMontadas) {
    const itens = c.itens.map((i) => {
      const p = porSlug.get(i.slug) as Prod;
      const r = prods.get(i.slug) as Resolvido;
      return { emporio_product_id: r.epId, presentation_id: r.fechadaId, quantity: i.qtd, item_total: r2(i.qtd * p.custo) };
    });
    const totalC = itens.reduce((s, i) => s + cents(i.item_total), 0) + cents(c.frete);
    let payment: compras.CompraInput["payment"];
    if (c.pagamento === "a_vista") payment = { kind: "a_vista" };
    else if (c.pagamento === "a_prazo") payment = { kind: "a_prazo", due_date: c.chave === "A-20" ? dia(8, 12) : dia(-8, 12) };
    else {
      const entrada = c.chave === "A-10" ? Math.round(totalC * 0.3) : 0;
      const resto = totalC - entrada;
      const p1 = Math.floor(resto / 2);
      payment = {
        kind: "parcelada",
        down_payment: entrada / 100,
        installments: [
          { amount: p1 / 100, due_date: c.chave === "C-25" ? dia(5, 12) : dia(-10, 12) },
          { amount: (resto - p1) / 100, due_date: c.chave === "C-25" ? dia(-25, 12) : dia(-40, 12) },
        ],
      };
    }
    const forn = FORNECEDORES.find((f) => f.chave === c.forn) as (typeof FORNECEDORES)[number];
    exigir(await compras.criarCompraAction(db, gerente, {
      operation_key: `${PREFIXO}compra-${c.chave}`,
      establishment_id: lojas.deposito,
      contact_id: contatos[c.forn],
      purchased_at: dia(c.dias, 9),
      received: true,
      freight: c.frete || null,
      items: itens,
      payment,
      notes: `Pedido ${forn.nome}`,
    }), `compra ${c.chave}`);
  }

  // Transferências do Depósito para as lojas
  const linhaTransf = (slug: string, embalagens: number) => {
    const r = prods.get(slug) as Resolvido;
    return r.tracked
      ? { emporio_product_id: r.epId, presentation_id: r.fechadaId, packages: embalagens }
      : { emporio_product_id: r.epId, quantity: embalagens * r.fechadaBase };
  };
  const receberTudo = async (t: transf.TransferView, quem: Ator) => {
    exigir(await transf.receberTransferenciaAction(db, quem, t.id, { items: t.items.map((i) => ({ item_id: i.id, received_qty: i.sent_qty })) }), `receber ${t.operation_key}`);
  };
  const demandaReal = calcularDemanda([...sortidas, ...daMistura], prods);
  for (let w = 1; w <= ONDAS; w++) {
    for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
      const items = CATALOGO.filter((p) => p.origem !== "producao").map((p) =>
        linhaTransf(p.slug, porOnda((demandaReal.get(p.slug) as Record<ChaveVenda, number>)[c])),
      );
      const t = exigir(await transf.enviarTransferenciaAction(db, gerente, {
        operation_key: `${PREFIXO}transf-onda${w}-${c}`,
        origin_establishment_id: lojas.deposito,
        destination_establishment_id: lojas[c],
        items,
        notes: `Reposição da semana ${w}`,
      }), `envio onda ${w} ${c}`);
      if (t.status === "em_transito") await receberTudo(t, c === "centro" ? vendCentro : vendRodovia);
    }
  }
  // Chegou com diferença e ficou aguardando o Gestor (Centro)
  {
    const t = exigir(await transf.enviarTransferenciaAction(db, gerente, {
      operation_key: `${PREFIXO}transf-diferenca`,
      origin_establishment_id: lojas.deposito,
      destination_establishment_id: lojas.centro,
      items: [linhaTransf("milho", 10)],
      notes: "Milho para o fim do mês",
    }), "envio com diferença");
    if (t.status === "em_transito") {
      exigir(await transf.receberTransferenciaAction(db, vendCentro, t.id, {
        items: t.items.map((i) => ({ item_id: i.id, received_qty: i.sent_qty - 1, loss_reason: "avaria" })),
      }), "recebimento com diferença");
    }
  }
  // Perda no caminho, resolvida pela Gestora (Rodovia)
  {
    const t = exigir(await transf.enviarTransferenciaAction(db, gerente, {
      operation_key: `${PREFIXO}transf-perda`,
      origin_establishment_id: lojas.deposito,
      destination_establishment_id: lojas.rodovia,
      items: [linhaTransf("vermBov", 24)],
      notes: "Vermífugo para a campanha",
    }), "envio da perda");
    let atual: transf.TransferView = t;
    if (atual.status === "em_transito") {
      atual = exigir(await transf.receberTransferenciaAction(db, vendRodovia, t.id, {
        items: t.items.map((i) => ({ item_id: i.id, received_qty: i.sent_qty - 4, loss_reason: "avaria" })),
      }), "recebimento da perda");
    }
    if (atual.status === "aguardando_gestor") {
      exigir(await transf.resolverDiferencaAction(db, gestor, t.id, {
        operation_key: `${PREFIXO}transf-perda-resolver`,
        resolution: "perda_no_caminho",
        reason: "Caixa de frascos quebrou na estrada de terra",
      }), "resolver perda no caminho");
    }
  }
  // Ainda em trânsito (Rodovia)
  exigir(await transf.enviarTransferenciaAction(db, gerente, {
    operation_key: `${PREFIXO}transf-transito`,
    origin_establishment_id: lojas.deposito,
    destination_establishment_id: lojas.rodovia,
    items: [linhaTransf("salEngorda", 10), linhaTransf("equinos", 6)],
    notes: "Saiu hoje cedo",
  }), "envio em trânsito");

  // Produção da mistura (Loja da Rodovia, pela Gestora)
  {
    const mist = prods.get("mistura") as Resolvido;
    const jaProduziu = await db.productionEntry.findFirst({ where: { operation_key: `${PREFIXO}producao-mistura` }, select: { id: true } });
    // A produção baixa o milho AVULSO. Se só há saca lacrada, a contagem separa 2 sacas
    // (o total não muda: o que sai do lacrado entra no avulso).
    if (!jaProduziu) {
      const milho = prods.get("milho") as Resolvido;
      const motivo = "Separei 2 sacas de milho para a mistura de galinhas";
      const ja = await db.stockMovement.findFirst({ where: { establishment_id: lojas.rodovia, movement_type: "ajuste", notes: motivo } });
      const linha = exigir(await est.saldoDaLojaAction(db, gestor, lojas.rodovia), "saldo da Rodovia").find((l) => l.emporio_product_id === milho.epId);
      if (!ja && linha && linha.loose_qty < 2) {
        const k = Math.ceil(2 - linha.loose_qty);
        const lacrada = linha.sealed.find((s) => s.presentation_id === milho.fechadaId);
        if (!lacrada || lacrada.packages < k) throw new Error("Sem milho lacrado na Rodovia para separar para a mistura.");
        exigir(await est.registrarContagemAction(db, gestor, {
          establishment_id: lojas.rodovia,
          emporio_product_id: milho.epId,
          sealed: [{ presentation_id: milho.fechadaId, packages: lacrada.packages - k }],
          loose_qty: linha.loose_qty + k,
          reason: motivo,
        }), "separar milho avulso");
      }
    }
    exigir(await prod.produzirAction(db, gestor, {
      operation_key: `${PREFIXO}producao-mistura`,
      establishment_id: lojas.rodovia,
      emporio_product_id: mist.epId,
      produced_qty: 160,
      sealed: [{ presentation_id: mist.fechadaId, packages: 4 }],
    }), "produção da mistura");
  }

  // Vendas, na ordem do tempo, com o que depende de cada uma
  const ordenadas = [...sortidas, ...daMistura].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const vendasPorTag = new Map<string, vendas.VendaView>();
  let feitas = 0;
  for (const v of ordenadas) {
    const lojaId = lojas[v.loja];
    const quem = atores[v.quem];
    const payments: vendas.VendaPagamentoInput[] = v.pagamentos.map((p) => {
      const base: vendas.VendaPagamentoInput = { kind: p.kind, amount: p.cents / 100 };
      if (p.kind === "credito_parcelado") base.installments = p.parcelas;
      if (p.kind === "fiado") base.due_date = p.vence;
      if (p.kind === "cheque") base.check = { number: p.numero, bank: p.banco, good_for: p.bomPara };
      return base;
    });
    const r = exigir(await vendas.venderAction(db, quem, {
      operation_key: v.chave,
      establishment_id: lojaId,
      contact_id: v.cliente ? contatos[v.cliente] : null,
      sold_at: v.quando,
      items: v.itens.map((i) => {
        const res = prods.get(i.slug) as Resolvido;
        return { emporio_product_id: res.epId, presentation_id: i.papel === "fechada" ? res.fechadaId : (res.granelId as string), quantity: i.qtd, unit_price: precoItem(v, i) };
      }),
      payments,
    }), `venda ${v.tag}`);
    vendasPorTag.set(v.tag, r);
    feitas++;
    await depoisDaVenda(ctx, v, r);
  }
  log(`Vendas lançadas: ${feitas}`);

  // Contagem e perda
  {
    const arame = prods.get("arameFarpado") as Resolvido;
    const motivo = "Contagem do fim do mês: faltou 1 rolo de arame farpado";
    const ja = await db.stockMovement.findFirst({ where: { establishment_id: lojas.centro, movement_type: "ajuste", notes: motivo } });
    if (!ja) {
      const linhas = exigir(await est.saldoDaLojaAction(db, vendCentro, lojas.centro), "saldo do Centro");
      const linha = linhas.find((l) => l.emporio_product_id === arame.epId);
      if (linha && linha.total_qty >= 1) {
        exigir(await est.registrarContagemAction(db, vendCentro, { establishment_id: lojas.centro, emporio_product_id: arame.epId, loose_qty: linha.total_qty - 1, reason: motivo }), "contagem do arame");
      }
    }
    const vac = prods.get("aftosa") as Resolvido;
    const nota = "Lote vencido na geladeira da Rodovia";
    const jaPerda = await db.stockMovement.findFirst({ where: { establishment_id: lojas.rodovia, movement_type: "perda", notes: nota } });
    if (!jaPerda) {
      exigir(await est.registrarPerdaAction(db, gestor, { establishment_id: lojas.rodovia, emporio_product_id: vac.epId, quantity: 2, reason: "vencido", notes: nota }), "perda da vacina");
    }
  }

  // Levar a gaveta ao banco (a Gestora), despesas pagas e conferências de gaveta
  for (const [c, quem] of [["centro", gestor], ["rodovia", gestor]] as const) {
    const chave = `${PREFIXO}caixa-${c}-1`;
    const ja = await db.cashTransfer.findFirst({ where: { operation_key: chave }, select: { id: true } });
    if (ja) continue;
    const saldo = (await caixa.saldoDaGaveta(db, lojas[c])) / 100;
    const valor = Math.floor((saldo * 0.6) / 100) * 100;
    if (valor >= 100) {
      exigir(await caixa.transferirCaixaAction(db, quem, { operation_key: chave, from: { establishment_id: lojas[c] }, to: { bank_account_id: contaId }, amount: valor, notes: "Depósito semanal da gaveta" }), `gaveta ${c} ao banco`);
    }
  }
  {
    const hoje = new Date();
    const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const periodo = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}`;
    const abertas = exigir(await desp.listarContasAPagarAction(db, gerente, { status: "pending" }), "contas a pagar");
    const doMes = abertas.filter((a) => a.origin === "despesa_fixa" && a.period === periodo);
    if (doMes.length > 0) {
      exigir(await desp.pagarDespesasAction(db, gerente, { entry_ids: doMes.map((a) => a.entry_id), paid_at: dia(2, 11), from: { bank_account_id: contaId } }), "pagamento das despesas fixas");
    }
  }
  for (const [c, quem] of [["centro", vendCentro], ["rodovia", vendRodovia]] as const) {
    const ja = await db.cashCount.count({ where: { establishment_id: lojas[c] } });
    if (ja > 0) continue;
    const esperado = (await caixa.saldoDaGaveta(db, lojas[c])) / 100;
    if (c === "rodovia") {
      exigir(await caixa.conferirGavetaAction(db, quem, { establishment_id: lojas[c], counted: r2(esperado - 12.5), justification: "Troco dado a maior no sábado" }), "conferência com diferença");
    } else {
      exigir(await caixa.conferirGavetaAction(db, quem, { establishment_id: lojas[c], counted: esperado }), "conferência da gaveta");
    }
  }

  await resumo(ctx, senhas);
}

/** O que cada venda explícita ainda pede: devolver, trocar, cancelar, depositar cheque, receber fiado. */
async function depoisDaVenda(ctx: Ctx, v: VendaPlan, r: vendas.VendaView) {
  const { db, atores, lojas, contaId, prods } = ctx;
  const { gestor, vendCentro } = atores;
  const item = (slug: string) => {
    const res = prods.get(slug) as Resolvido;
    return r.items.find((i) => i.emporio_product_id === res.epId) as vendas.VendaItemView;
  };
  if (v.tag === "devolver") {
    exigir(await vendas.devolverAction(db, vendCentro, r.id, {
      operation_key: `${PREFIXO}devolucao-1`,
      refund_kind: "dinheiro",
      items: [{ sale_item_id: item("caoAdulto").id, quantity: 1 }],
      reason: "O cachorro não aceitou a ração",
    }), "devolução");
  }
  if (v.tag === "avaria") {
    exigir(await vendas.devolverAction(db, gestor, r.id, {
      operation_key: `${PREFIXO}devolucao-2`,
      refund_kind: "dinheiro",
      items: [{ sale_item_id: item("v10").id, quantity: 1, loss_reason: "avaria" }],
      reason: "Frasco chegou trincado",
    }), "devolução com avaria");
  }
  if (v.tag === "troca") {
    const novo = [{ slug: "gatoCastrado", papel: "fechada" as Papel, qtd: 1 }];
    const devolvido = cents(precoDe("caoAdulto", "fechada", "centro"));
    const diferenca = totalCents({ loja: "centro" }, novo) - devolvido;
    const res = prods.get("gatoCastrado") as Resolvido;
    exigir(await vendas.trocarAction(db, vendCentro, r.id, {
      operation_key: `${PREFIXO}troca-1`,
      items_devolvidos: [{ sale_item_id: item("caoAdulto").id, quantity: 1 }],
      reason: "O gato da cliente não come ração de cachorro, e era para gato",
      venda: {
        items: [{ emporio_product_id: res.epId, presentation_id: res.fechadaId, quantity: 1, unit_price: precoDe("gatoCastrado", "fechada", "centro") }],
        payments: diferenca > 0 ? [{ kind: "dinheiro", amount: diferenca / 100 }] : [],
      },
    }), "troca");
  }
  if (v.tag === "cancelar") {
    const c = await vendas.cancelarVendaAction(db, gestor, r.id, { reason: "Lançada em duplicidade" });
    if (!c.ok && c.code !== "SALE_CANCELED") throw new Error(`cancelar venda: ${c.message}`);
  }
  if (v.tag === "cheque") {
    const cheque = r.payments.find((p) => p.check)?.check;
    if (cheque && cheque.status === "recebido") {
      exigir(await caixa.depositarChequeAction(db, gestor, cheque.id, { bank_account_id: contaId }), "depositar cheque");
    }
  }
  if (v.tag === "fiado-parcial") {
    const base = { contact_id: ctx.contatos.boaEsperanca, establishment_id: lojas.centro };
    exigir(await caixa.receberFiadoAction(db, vendCentro, { ...base, operation_key: `${PREFIXO}recebimento-1`, amount: 300, kind: "dinheiro" }), "recebimento de fiado em dinheiro");
    exigir(await caixa.receberFiadoAction(db, vendCentro, { ...base, operation_key: `${PREFIXO}recebimento-2`, amount: 200, kind: "pix" }), "recebimento de fiado em PIX");
  }
}

async function acharOuCriarContato(db: TenantPrismaClient, nome: string, tipo: "loja_fornecedor" | "fazendeiro" | "particular", cidade: string): Promise<string> {
  const ja = await db.contact.findFirst({ where: { name: { equals: nome, mode: "insensitive" } }, select: { id: true } });
  if (ja) return ja.id;
  return exigir(await createContact(db, { name: nome, type: tipo, city: cidade }), `contato ${nome}`).id;
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

async function resumo(ctx: Ctx, senhas: { email: string; name: string; senha: string }[]) {
  const { db, lojas, atores } = ctx;
  const doCenario = { operation_key: { startsWith: PREFIXO } };
  const vendasLinhas = await db.emporioSale.findMany({ where: doCenario, select: { status: true, net_amount: true } });
  const concluidas = vendasLinhas.filter((v) => v.status === "concluida");
  const totalVendido = concluidas.reduce((s, v) => s + cents(Number(v.net_amount)), 0) / 100;
  const fiado = exigir(await caixa.listarFiadoAction(db, atores.dono), "fiado");
  const fiadoAberto = fiado.reduce((s, c) => s + c.owed, 0);
  const fiadoVencido = fiado.reduce((s, c) => s + c.overdue_amount, 0);
  const transfs = await db.stockTransfer.groupBy({ by: ["status"], where: doCenario, _count: { _all: true } });
  const pessoas = await db.user.count({ where: { active: true } });

  log("\n" + "=".repeat(70));
  log("CENÁRIO PRONTO");
  log("=".repeat(70));
  log(`Lojas:           ${LOJAS.map((l) => l.nome).join(", ")}`);
  log(`Pessoas ativas:  ${pessoas} (Dono, Gerente geral, Gestora, 2 Vendedores)`);
  log(`Produtos:        ${CATALOGO.length}`);
  log(`Vendas:          ${vendasLinhas.length} lançadas, ${concluidas.length} concluídas, ${vendasLinhas.length - concluidas.length} cancelada(s)`);
  log(`Total vendido:   ${brl(totalVendido)} (vendas concluídas, antes das devoluções)`);
  log(`Fiado em aberto: ${brl(fiadoAberto)} (vencido: ${brl(fiadoVencido)})`);
  log(`Transferências:  ${transfs.map((t) => `${t._count._all} ${t.status}`).join(", ")}`);
  log("\nPara conferir no painel (logado como o Dono ou como cada pessoa):");
  log("  /emporio                 (visão geral e Primeiros Passos)");
  log("  /emporio/vendas          (vendas, devoluções e a troca)");
  log("  /emporio/estoque         (saldo por loja, lacrado e avulso)");
  log("  /emporio/transferencias  (em trânsito, aguardando o Gestor, recebidas)");
  log("  /emporio/caixa           (gaveta, conta, cartão a receber, cheque, fiado)");
  log("  /emporio/despesas        (contas a pagar e despesas fixas)");
  log("  /emporio/resultado       (resultado do mês por loja)");
  log("  /emporio/equipe          (a Equipe)");
  log("  /emporio/historico       (quem fez o quê)");
  void lojas;

  if (senhas.length > 0) {
    log("\nSENHAS TEMPORÁRIAS (criadas nesta execução; aparecem UMA vez, anote agora):");
    for (const s of senhas) log(`  ${s.email}  (${s.name})  ${s.senha}`);
  } else {
    log("\nNenhuma pessoa foi criada nesta execução (nenhuma senha a mostrar).");
  }
}

// ---------------------------------------------------------------------------
// Apagar (so no banco local)
// ---------------------------------------------------------------------------

async function apagarCenario(tenantId: string, executar: boolean) {
  const t = { tenant_id: tenantId };
  const lojas = (await prisma.establishment.findMany({ where: { ...t, name: { in: LOJAS.map((l) => l.nome) } }, select: { id: true } })).map((x) => x.id);
  const produtosBase = (await prisma.product.findMany({ where: { ...t, name: { in: CATALOGO.map((p) => p.nome) } }, select: { id: true } })).map((x) => x.id);
  const eps = (await prisma.emporioProduct.findMany({ where: { ...t, product_id: { in: produtosBase } }, select: { id: true } })).map((x) => x.id);
  const contas = (await prisma.bankAccount.findMany({ where: { ...t, name: CONTA_NOME }, select: { id: true } })).map((x) => x.id);
  const usuarios = (await prisma.user.findMany({ where: { ...t, email: { in: MEMBROS.map((m) => m.email) } }, select: { id: true } })).map((x) => x.id);
  const contatos = (await prisma.contact.findMany({ where: { ...t, name: { in: [...FORNECEDORES.map((f) => f.nome), ...CLIENTES.map((c) => c.nome)] } }, select: { id: true } })).map((x) => x.id);
  const vendasIds = (await prisma.emporioSale.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { ...t, sale_id: { in: vendasIds } }, select: { id: true } })).map((x) => x.id);
  const comprasIds = (await prisma.emporioPurchase.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const transfIds = (await prisma.stockTransfer.findMany({ where: { ...t, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] }, select: { id: true } })).map((x) => x.id);
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { ...t, splits: { some: { establishment_id: { in: lojas } } } }, select: { id: true } })).map((x) => x.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const producoes = (await prisma.productionEntry.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const relacionados = [...vendasIds, ...devolucoes, ...comprasIds, ...modelos, ...conferencias, ...producoes];
  const entradas = (
    await prisma.financialEntry.findMany({
      where: { ...t, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: relacionados } }] },
      select: { id: true },
    })
  ).map((x) => x.id);

  log(`Seria apagado: ${lojas.length} lojas, ${eps.length} produtos, ${vendasIds.length} vendas, ${comprasIds.length} compras, ${transfIds.length} transferências, ${entradas.length} lançamentos, ${usuarios.length} usuários, ${contatos.length} contatos.`);
  if (!executar) {
    log("(nada foi apagado; repita com --confirmar)");
    return;
  }

  await prisma.emporioSale.updateMany({ where: { id: { in: vendasIds } }, data: { exchange_return_id: null } });
  await prisma.stockMovement.deleteMany({ where: { ...t, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtosBase } }] } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { return_id: { in: devolucoes } } });
  await prisma.cardReceivable.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.emporioCheck.deleteMany({ where: { OR: [{ sale_id: { in: vendasIds } }, { establishment_id: { in: lojas } }] } });
  await prisma.cashMovement.deleteMany({ where: { ...t, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { sale_id: { in: vendasIds } }] } });
  await prisma.cashTransfer.deleteMany({ where: { ...t, OR: [{ from_establishment_id: { in: lojas } }, { to_establishment_id: { in: lojas } }, { from_bank_account_id: { in: contas } }, { to_bank_account_id: { in: contas } }] } });
  await prisma.cashCount.deleteMany({ where: { id: { in: conferencias } } });
  await prisma.saleVariableExpense.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { template_id: { in: modelos } } });
  await prisma.emporioSalePayment.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.financialPayment.deleteMany({ where: { entry_id: { in: entradas } } });
  await prisma.financialEntry.deleteMany({ where: { id: { in: entradas } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.emporioSale.deleteMany({ where: { id: { in: vendasIds } } });
  await prisma.stockTransferItem.deleteMany({ where: { transfer_id: { in: transfIds } } });
  await prisma.stockTransfer.deleteMany({ where: { id: { in: transfIds } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { purchase_id: { in: comprasIds } } });
  await prisma.emporioPurchase.deleteMany({ where: { id: { in: comprasIds } } });
  await prisma.productionEntry.deleteMany({ where: { id: { in: producoes } } });
  await prisma.compositionItem.deleteMany({ where: { OR: [{ component_emporio_product_id: { in: eps } }, { composition: { emporio_product_id: { in: eps } } }] } });
  await prisma.composition.deleteMany({ where: { emporio_product_id: { in: eps } } });
  await prisma.variableExpenseRule.deleteMany({ where: { establishment_id: { in: lojas } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { template_id: { in: modelos } } });
  await prisma.fixedExpenseTemplate.deleteMany({ where: { id: { in: modelos } } });
  await prisma.cardFeeRule.deleteMany({ where: { establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { emporio_product_id: { in: eps } } });
  await prisma.presentationPrice.deleteMany({ where: { establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { emporio_product_id: { in: eps } } });
  await prisma.emporioProduct.deleteMany({ where: { id: { in: eps } } });
  await prisma.product.deleteMany({ where: { id: { in: produtosBase } } });
  await prisma.userEstablishment.deleteMany({ where: { OR: [{ establishment_id: { in: lojas } }, { user_id: { in: usuarios } }] } });
  await prisma.establishment.deleteMany({ where: { id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { id: { in: contas } } });
  await prisma.emporioAuditLog.deleteMany({ where: { ...t, OR: [{ user_id: { in: usuarios } }, { establishment_id: { in: lojas } }, { target_id: { in: [...eps, ...usuarios, ...contas, ...lojas, ...relacionados] } }] } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.contact.deleteMany({ where: { id: { in: contatos } } });
  log("Cenário apagado.");
}

main().catch(async (e) => {
  if (e instanceof Parar) console.error(`\n${e.message}`);
  else console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
