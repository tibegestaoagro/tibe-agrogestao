import "./_env-local";
import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actions/types";
import type { AppUserRole } from "@/types/next-auth";
import { getSeatUsage } from "@/lib/seats";
import { cadastrarFornecedorAction } from "@/lib/actions/emporio-fornecedores";
import { ensureProductCategories } from "@/lib/actions/products";
import * as cat from "@/lib/actions/emporio-catalogo";
import * as equipe from "@/lib/actions/emporio-equipe";
import * as est from "@/lib/actions/emporio-estoque";
import * as compras from "@/lib/actions/emporio-compras";
import * as transf from "@/lib/actions/emporio-transferencias";
import * as vendas from "@/lib/actions/emporio-vendas";
import {
  cadastrarClienteAction,
  editarClienteAction,
  garantirConsumidorFinal,
  serializarCliente,
} from "@/lib/actions/emporio-clientes";
import * as caixa from "@/lib/actions/emporio-caixa";
import * as turno from "@/lib/actions/emporio-turno";
import * as desp from "@/lib/actions/emporio-despesas";
import * as prod from "@/lib/actions/emporio-producao";
import * as orc from "@/lib/actions/emporio-orcamentos";
import * as conf from "@/lib/actions/emporio-configuracoes";
import { definirCreditoDoClienteAction } from "@/lib/actions/emporio-credito";
import { fazerAcordoAction } from "@/lib/actions/emporio-acordos";
import { carimbarLinhaAction, lerExtratoAction } from "@/lib/actions/emporio-financeiro";

/**
 * Cenario de demonstracao do Meu Emporio (Modulo 39, Q137): monta, numa conta,
 * tres lojas, a Equipe, 25 produtos e 30 dias de movimento, sempre pelas
 * ACTIONS (nunca por escrita direta), para estoque, custo medio, caixa, fiado,
 * Financeiro, Resultado e Historico saírem de verdade.
 *
 * O caixa tem um turno por dia em cada loja que vende: abre as 8h, recebe as
 * vendas do dia, faz sangria em alguns dias e encerra as 18h com malote, que a
 * Gestora confirma (alguns dias com diferenca justificada). As actions de turno
 * e o orcamento recebem a hora pelo relogio interno (`opts.agora`), que rota
 * nenhuma passa. O turno de hoje fica aberto, e nele caem os passos que as
 * actions gravam com a hora real: devolucao, troca, cancelamento, recebimento
 * de fiado, conferencia e o faturamento dos orcamentos.
 *
 * A Loja Centro nao tem Caixa (o Vendedor abre, vende e encerra). A Loja da
 * Rodovia tem: a Juliana, com o papel Caixa, abre, encerra e faz toda venda
 * escolhendo quem atendeu (a Gestora ou o Gerente geral).
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

/**
 * Data `n` dias no passado (negativo = futuro), na hora dada de Brasília
 * (UTC-3, sem horário de verão), qualquer que seja o fuso da máquina.
 */
function dia(n: number, h = 10, m = 0): Date {
  const [y, mo, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d - n, h + 3, m));
}
const dd = (n: number) => String(n).padStart(2, "0");

/** Dígito verificador de CPF e CNPJ (módulo 11). */
function dv(nums: number[], pesos: number[]): number {
  const resto = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function cpfCom(base9: string): string {
  const n = base9.split("").map(Number);
  const d1 = dv(n, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base9}${d1}${dv([...n, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])}`;
}
function cnpjCom(base12: string): string {
  const n = base12.split("").map(Number);
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;
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
  { chave: "deposito", nome: "Depósito Central", endereco: "Rodovia BR-163, km 12, Galpão 3", cidade: "Rondonópolis", desc: 0, desp: 8, lucro: 20, cnpj: "331207450001", fone: "(66) 3421-1800", zap: "(66) 99640-1800", cep: "78740000" },
  { chave: "centro", nome: "Loja Centro", endereco: "Avenida Mato Grosso, 1450", cidade: "Rondonópolis", desc: 5, desp: 12, lucro: 25, cnpj: "331207450002", fone: "(66) 3421-1450", zap: "(66) 99640-1450", cep: "78700000" },
  { chave: "rodovia", nome: "Loja da Rodovia", endereco: "Rodovia BR-364, km 3, Jardim Primavera", cidade: "Rondonópolis", desc: 8, desp: 11, lucro: 22, cnpj: "331207450003", fone: "(66) 3423-3640", zap: "(66) 99640-3640", cep: "78710000" },
] as const;
type ChaveLoja = (typeof LOJAS)[number]["chave"];

/** Área e funcionários das lojas que vendem (base do rateio automático da entrega 4); o Depósito fica sem base. */
const BASE_DO_RATEIO: Partial<Record<ChaveLoja, { area_m2: number; employees_count: number }>> = {
  centro: { area_m2: 120, employees_count: 4 },
  rodovia: { area_m2: 80, employees_count: 2 },
};
type ChaveVenda = "centro" | "rodovia";

const CONTA_NOME = "Conta da loja";
/** O troco que fica na gaveta de um turno para o outro; o resto do encerramento vai no malote. */
const TROCO = 300;

const MEMBROS = [
  { chave: "gerente", name: "Marcos Oliveira", email: "gerente.demo.emporio@example.com", funcao: "gerente_geral", lojas: [] as ChaveLoja[], keys: [] as string[] },
  // O Financeiro vê o dinheiro de todas as lojas (sem loja vinculada) e não vende.
  { chave: "financeiro", name: "Patrícia Lima", email: "financeiro.demo.emporio@example.com", funcao: "financeiro", lojas: [] as ChaveLoja[], keys: [] as string[] },
  { chave: "gestor", name: "Fernanda Souza", email: "gestor.demo.emporio@example.com", funcao: "gestor", lojas: ["centro", "rodovia"] as ChaveLoja[], keys: [] as string[] },
  { chave: "vendCentro", name: "Rafael Almeida", email: "vendedor.centro.demo.emporio@example.com", funcao: "vendedor", lojas: ["centro"] as ChaveLoja[], keys: ["devolver_trocar", "contagem"] },
  // O email é o de quando ela era Vendedora: quando a equipe ocupava os 5 assentos do plano, o Caixa ficou com o dela.
  { chave: "caixaRodovia", name: "Juliana Costa", email: "vendedor.rodovia.demo.emporio@example.com", funcao: "caixa", lojas: ["rodovia"] as ChaveLoja[], keys: [] as string[] },
] as const;
type ChaveMembro = (typeof MEMBROS)[number]["chave"];

const FORNECEDORES = [
  { chave: "A", nome: "Nutrisul Rações e Suplementos", cidade: "Cuiabá" },
  { chave: "B", nome: "Vet Campo Medicamentos Veterinários", cidade: "Campo Grande" },
  { chave: "C", nome: "Ferragens e Cordoalhas Planalto", cidade: "Goiânia" },
  { chave: "D", nome: "Agropecuária Vale Verde Distribuidora", cidade: "Rondonópolis" },
] as const;

/**
 * Os clientes do Empório (`EmporioCustomer`, fora de Contatos). O orçamento exige o cadastro completo
 * para o tipo: a PF com nome e telefone (o CPF vai junto), a PJ também com CNPJ e o endereço principal.
 */
const CLIENTES = [
  { chave: "tresIrmaos", nome: "Chácara Três Irmãos", cidade: "Juscimeira", pessoa: "pf" as const, doc: cpfCom("381029475"), fone: "(66) 99812-3401", endereco: null },
  { chave: "boaEsperanca", nome: "Sítio Boa Esperança", cidade: "Pedra Preta", pessoa: "pf" as const, doc: cpfCom("472915836"), fone: "(66) 99754-2210", endereco: null },
  {
    chave: "santaClara", nome: "Haras Santa Clara", cidade: "Rondonópolis", pessoa: "pj" as const, doc: cnpjCom("274150380001"), fone: "(66) 3422-7781",
    endereco: { address_zip: "78700-000", address_street: "Rodovia BR-364", address_number: "Km 12", address_district: "Zona Rural", address_state: "MT" },
  },
  {
    chave: "pedraBranca", nome: "Fazenda Pedra Branca", cidade: "Itiquira", pessoa: "pj" as const, doc: cnpjCom("193846520001"), fone: "(66) 99633-9015",
    endereco: { address_zip: "78790-000", address_street: "Estrada da Pedra Branca", address_number: "s/n", address_district: "Zona Rural", address_state: "MT" },
  },
  // A PF só com nome e telefone: o mínimo do tipo, e o orçamento dela salva assim mesmo.
  { chave: "mariaDores", nome: "Maria das Dores Ferreira", cidade: "Rondonópolis", pessoa: "pf" as const, doc: null, fone: "(66) 99921-4478", endereco: null },
] as const;

/**
 * Uma propriedade da conta vira fornecedor do Empório, com uma compra só de custo
 * (sem forma de pagamento e sem lançamento no Financeiro). A nota marca o que o
 * cenário criou, para o `--apagar` não levar um fornecedor cadastrado à mão.
 */
const NOTA_FORNECEDOR_PROPRIEDADE = "Cadastrado pelo cenário de demonstração.";
const CHAVE_COMPRA_PROPRIEDADE = `${PREFIXO}propriedade-compra`;

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
  /** Quantos dias atrás: a venda cai no turno desse dia, nessa loja. */
  d: number;
  quando: Date;
  quem: ChaveMembro;
  /** Quem atendeu, quando quem lança é o Caixa (ele não vende em nome próprio). */
  vendedor?: ChaveMembro;
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
    // Toda venda da Rodovia passa pelo Caixa, com a Gestora como quem atendeu.
    const vendedor = quem === "caixaRodovia" ? { vendedor: "gestor" as ChaveMembro } : {};
    return { chave: `${PREFIXO}venda-${tag}`, tag, loja, d, quando: dia(d, h), quem, ...vendedor, itens, pagamentos: pag(c), ...extra };
  };
  return [
    mk("fiado-vencido", "centro", 26, 11, "vendCentro", [{ slug: "bovEngorda", papel: "fechada", qtd: 8 }, { slug: "salEngorda", papel: "fechada", qtd: 4 }], (c) => [{ kind: "fiado", cents: c, vence: dia(20, 12) }], { cliente: "tresIrmaos" }),
    mk("fiado-parcial", "centro", 18, 15, "vendCentro", [{ slug: "salCria", papel: "fechada", qtd: 4 }, { slug: "vermBov", papel: "fechada", qtd: 6 }], (c) => [{ kind: "fiado", cents: c, vence: dia(-10, 12) }], { cliente: "boaEsperanca" }),
    mk("fiado-rodovia", "rodovia", 9, 16, "caixaRodovia", [{ slug: "equinos", papel: "fechada", qtd: 6 }, { slug: "feno", papel: "fechada", qtd: 10 }], (c) => [{ kind: "fiado", cents: c, vence: dia(-12, 12) }], { cliente: "santaClara" }),
    mk("cheque", "centro", 14, 10, "gestor", [{ slug: "arameFarpado", papel: "fechada", qtd: 2 }, { slug: "grampo", papel: "fechada", qtd: 2 }], (c) => [{ kind: "cheque", cents: c, numero: "004512", banco: "Banco do Brasil", bomPara: dia(-20, 12) }], { cliente: "pedraBranca" }),
    mk("devolver", "centro", 22, 9, "vendCentro", [{ slug: "caoAdulto", papel: "fechada", qtd: 2 }, { slug: "vermPet", papel: "fechada", qtd: 1 }], (c) => [{ kind: "dinheiro", cents: c }]),
    mk("troca", "centro", 15, 14, "vendCentro", [{ slug: "caoAdulto", papel: "fechada", qtd: 1 }, { slug: "v10", papel: "fechada", qtd: 1 }], (c) => [{ kind: "pix", cents: c }], { cliente: "mariaDores" }),
    mk("avaria", "rodovia", 11, 10, "caixaRodovia", [{ slug: "v10", papel: "fechada", qtd: 3 }], (c) => [{ kind: "pix", cents: c }]),
    mk("cancelar", "centro", 5, 17, "vendCentro", [{ slug: "corda", papel: "fechada", qtd: 1 }, { slug: "ferr4", papel: "fechada", qtd: 4 }], (c) => [{ kind: "dinheiro", cents: c }]),
    mk("desconto-gestor", "centro", 3, 13, "gestor", [{ slug: "milho", papel: "fechada", qtd: 20 }], (c) => [{ kind: "credito_parcelado", cents: c, parcelas: 3 }], { fator: 0.92, cliente: "pedraBranca" }),
  ];
}

/** As duas vendas da mistura saem depois da produção (ela só existe então). */
function vendasDaMistura(): VendaPlan[] {
  const mk = (tag: string, d: number, h: number, itens: ItemV[], pag: (c: number) => PagV[]): VendaPlan => {
    const c = totalCents({ loja: "rodovia" }, itens);
    return { chave: `${PREFIXO}venda-${tag}`, tag, loja: "rodovia", d, quando: dia(d, h), quem: "caixaRodovia", vendedor: "gestor", itens, pagamentos: pag(c) };
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
      // 10h em Brasília é 13h UTC: o mesmo dia da semana em UTC.
      const dow = dia(d).getUTCDay();
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
        // Centro (sem Caixa): o Vendedor ou a Gestora lançam em nome próprio.
        // Rodovia (com Caixa): toda venda passa pelo Caixa, que escolhe quem atendeu.
        const quemR = rnd();
        const quem: ChaveMembro = loja === "rodovia" ? "caixaRodovia" : quemR < 0.82 ? "vendCentro" : "gestor";
        const vendedor: ChaveMembro | undefined = loja === "rodovia" ? (k % 3 === 0 ? "gerente" : "gestor") : undefined;
        const horaR = rnd();
        saida.push({
          chave: `${PREFIXO}venda-${loja}-${String(d).padStart(2, "0")}-${k}`,
          tag: `${loja}-${d}-${k}`,
          loja,
          d,
          quando: dia(d, 8 + Math.floor(horaR * 10), Math.floor(rnd() * 60)),
          quem,
          vendedor,
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
// Orçamentos: abertos, um vencido, faturados (pelo Vendedor e pelo Caixa) e um
// faturado e cancelado (volta a aberto). A validade da conta é de 10 dias.
// ---------------------------------------------------------------------------

const VALIDADE_ORCAMENTO = 10;

/** As configurações da conta que o cenário grava (o `--apagar` só apaga a linha que ainda tem estes rodapés). */
const CONFIG_DEMO = {
  quote_validity_days: VALIDADE_ORCAMENTO,
  quote_footer: "Orçamento sujeito à disponibilidade de estoque. Preços válidos até a data indicada.",
  sale_footer: "Obrigado pela preferência! Trocas em até 7 dias com este comprovante.",
  receipt_width: 80,
};

type OrcPlan = {
  chave: string;
  loja: ChaveVenda;
  quem: ChaveMembro;
  /** Quem atendeu, quando quem orça é o Caixa. */
  vendedor?: ChaveMembro;
  cliente: (typeof CLIENTES)[number]["chave"];
  /** Dias atrás e hora em que foi feito; nulo é agora. */
  feito: [number, number] | null;
  itens: ItemV[];
  fim: "aberto" | "vencido" | "faturado" | "cancelado";
  /** Quem fatura hoje, e como o cliente paga. */
  fatura?: { quem: ChaveMembro; kind: "dinheiro" | "pix" };
  notas?: string;
  /** Pedido para entrega (plano 3): o orçamento sai marcado e a venda faturada herda a marca e o endereço. Sem isto, é retirada no balcão. */
  entrega?: { delivery_address_kind: "outro"; delivery_zip: string; delivery_street: string; delivery_number: string; delivery_district: string; delivery_city: string; delivery_state: string };
};

const ORCAMENTOS: OrcPlan[] = [
  { chave: "orc-aberto-cerca", loja: "centro", quem: "vendCentro", cliente: "pedraBranca", feito: [2, 10], fim: "aberto", itens: [{ slug: "arameFarpado", papel: "fechada", qtd: 4 }, { slug: "grampo", papel: "fechada", qtd: 3 }], notas: "Cerca da invernada nova; entrega na fazenda" },
  { chave: "orc-aberto-haras", loja: "rodovia", quem: "caixaRodovia", vendedor: "gestor", cliente: "santaClara", feito: [1, 15], fim: "aberto", itens: [{ slug: "equinos", papel: "fechada", qtd: 8 }, { slug: "feno", papel: "fechada", qtd: 20 }, { slug: "ferr5", papel: "fechada", qtd: 16 }] },
  { chave: "orc-aberto-pet", loja: "centro", quem: "gestor", cliente: "mariaDores", feito: null, fim: "aberto", itens: [{ slug: "gatoAdulto", papel: "fechada", qtd: 1 }, { slug: "vermPet", papel: "fechada", qtd: 1 }] },
  { chave: "orc-vencido", loja: "centro", quem: "vendCentro", cliente: "tresIrmaos", feito: [16, 11], fim: "vencido", itens: [{ slug: "salCria", papel: "fechada", qtd: 10 }, { slug: "aftosa", papel: "fechada", qtd: 2 }], notas: "Cliente ia ver o preço com outro fornecedor" },
  { chave: "orc-faturado-vendedor", loja: "centro", quem: "vendCentro", cliente: "boaEsperanca", feito: [3, 9], fim: "faturado", itens: [{ slug: "salEngorda", papel: "fechada", qtd: 3 }, { slug: "vermBov", papel: "fechada", qtd: 4 }], fatura: { quem: "vendCentro", kind: "pix" } },
  { chave: "orc-faturado-caixa", loja: "rodovia", quem: "caixaRodovia", vendedor: "gerente", cliente: "santaClara", feito: [2, 16], fim: "faturado", itens: [{ slug: "equinos", papel: "fechada", qtd: 4 }, { slug: "carrap", papel: "fechada", qtd: 1 }], fatura: { quem: "caixaRodovia", kind: "dinheiro" } },
  // Para entrega em "Outro endereço" (a obra, não a sede), faturado: a venda herda a marca e o endereço. Os demais faturados são retirada no balcão.
  {
    chave: "orc-entrega-obra", loja: "centro", quem: "vendCentro", cliente: "pedraBranca", feito: [1, 14], fim: "faturado",
    itens: [{ slug: "arameLiso", papel: "fechada", qtd: 2 }, { slug: "grampo", papel: "fechada", qtd: 2 }], fatura: { quem: "vendCentro", kind: "pix" },
    notas: "Entregar na obra da cerca, não na sede",
    entrega: { delivery_address_kind: "outro", delivery_zip: "78790-000", delivery_street: "Estrada do Rio Vermelho", delivery_number: "Km 8", delivery_district: "Zona Rural", delivery_city: "Itiquira", delivery_state: "MT" },
  },
  { chave: "orc-cancelado", loja: "centro", quem: "vendCentro", cliente: "pedraBranca", feito: [1, 11], fim: "cancelado", itens: [{ slug: "milho", papel: "fechada", qtd: 6 }], fatura: { quem: "vendCentro", kind: "dinheiro" } },
];

/** O que os orçamentos faturados tiram do estoque: entra na demanda das transferências. */
const vendasDosOrcamentos = (): VendaPlan[] =>
  ORCAMENTOS.filter((o) => o.fatura).map((o) => ({ chave: o.chave, tag: o.chave, loja: o.loja, d: 0, quando: new Date(), quem: o.quem, itens: o.itens, pagamentos: [] }));

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
  /** Entrega 2: o Caixa 1 de cada loja que vende, onde o cenário abre um turno por dia. */
  caixas: Record<ChaveVenda, string>;
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
  const [compras, transfs, vendas, devolucoes, recebimentos, caixas, producoes, turnos, orcamentos] = await Promise.all([
    db.emporioPurchase.count({ where: { operation_key: pref, NOT: { operation_key: CHAVE_COMPRA_PROPRIEDADE } } }),
    db.stockTransfer.count({ where: { operation_key: pref } }),
    db.emporioSale.count({ where: { operation_key: pref } }),
    db.emporioSaleReturn.count({ where: { operation_key: pref } }),
    db.cashMovement.count({ where: { operation_key: pref, origin: "recebimento_fiado" } }),
    db.cashTransfer.count({ where: { operation_key: pref } }),
    db.productionEntry.count({ where: { operation_key: pref } }),
    db.cashSession.count({ where: { operation_key: { startsWith: `${PREFIXO}turno-dia-` } } }),
    db.emporioQuote.count({ where: { operation_key: pref } }),
  ]);
  return { compras, transfs, vendas, devolucoes, recebimentos, caixas, producoes, turnos, orcamentos };
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
  const demanda = calcularDemanda([...sortidas, ...daMistura, ...vendasDosOrcamentos()], null);
  const saida = saidaDoDeposito(demanda);
  const comprasMontadas = montarCompras(saida);
  // Um turno por loja em cada dia passado com venda, mais o de hoje em cada loja.
  const diasDeTurno = new Set([...sortidas, ...daMistura].map((v) => `${v.d}|${v.loja}`));
  const turnosPlanejados = diasDeTurno.size + 2;
  const faturados = ORCAMENTOS.filter((o) => o.fatura).length;

  // ---- Situação atual ------------------------------------------------------
  const lojasExistentes = new Map<string, string>();
  for (const l of LOJAS) {
    const e = await db.establishment.findFirst({ where: { name: { equals: l.nome, mode: "insensitive" } }, select: { id: true } });
    if (e) lojasExistentes.set(l.chave, e.id);
  }
  const membrosFaltando: string[] = [];
  const funcoesAMudar: string[] = [];
  for (const m of MEMBROS) {
    const u = await prisma.user.findUnique({ where: { email: m.email }, select: { id: true, tenant_id: true, name: true, emporio_role: true } });
    if (u && u.tenant_id !== tenantId) throw new Parar(`O email ${m.email} já pertence a outra conta. O cenário não pode seguir.`);
    if (!u) membrosFaltando.push(m.email);
    else if (u.emporio_role !== m.funcao) funcoesAMudar.push(`${u.name} (${m.email}): de ${u.emporio_role ?? "sem função"} para ${m.funcao}`);
  }
  // Turno aberto no Caixa 1 que não é o de hoje deste cenário: uma montagem
  // anterior (a versão de turno único, ou uma rodada de outro dia). Seguir
  // escreveria cabeçalho, configurações, equipe e clientes e só pararia no dia 30.
  const turnosAlheios: string[] = [];
  for (const c of ["centro", "rodovia"] as const) {
    const lojaId = lojasExistentes.get(c);
    if (!lojaId) continue;
    const reg = await db.cashRegister.findFirst({ where: { establishment_id: lojaId, number: 1 }, select: { id: true } });
    if (!reg) continue;
    const aberto = await db.cashSession.findFirst({ where: { open_register_id: reg.id }, select: { operation_key: true, opened_at: true } });
    // A chave de hoje também vale para o "hoje" de uma rodada de outro dia: por isso a data.
    const deHoje = aberto?.operation_key === `${PREFIXO}turno-dia-${c}-00` && aberto.opened_at.getTime() >= dia(0, 0).getTime();
    if (aberto && !deHoje) {
      turnosAlheios.push(`${LOJAS.find((l) => l.chave === c)?.nome}: turno aberto em ${aberto.opened_at.toISOString()} (chave ${aberto.operation_key})`);
    }
  }
  const prodsExistentes = await resolverProdutos(db);
  const semCusto =
    CATALOGO.length -
    prodsExistentes.size +
    (await db.emporioProduct.count({ where: { id: { in: [...prodsExistentes.values()].map((r) => r.epId) }, reference_cost: null } }));
  const contatosExistentes = new Set([
    ...(await db.emporioSupplier.findMany({ where: { name: { in: FORNECEDORES.map((f) => f.nome) } }, select: { name: true } })).map((c) => c.name),
    ...(await db.emporioCustomer.findMany({ where: { name: { in: CLIENTES.map((c) => c.nome) } }, select: { name: true } })).map((c) => c.name),
  ]);
  const conta = await db.bankAccount.findFirst({ where: { name: CONTA_NOME }, select: { id: true } });
  const existentes = await contarExistentes(db);
  const seats = await getSeatUsage(db, tenantId, "emporio");

  const resumoPlano = [
    ["Lojas", `${lojasExistentes.size} de ${LOJAS.length} já existem`, LOJAS.length - lojasExistentes.size],
    ["Conta bancária", conta ? "já existe" : "seria criada", conta ? 0 : 1],
    ["Equipe", `${MEMBROS.length - membrosFaltando.length} de ${MEMBROS.length} já existem (equipe do Empório: ${seats.used} de ${seats.limit} ativos)`, membrosFaltando.length],
    ["Fornecedores e clientes", `${contatosExistentes.size} de ${FORNECEDORES.length + CLIENTES.length} já existem`, FORNECEDORES.length + CLIENTES.length - contatosExistentes.size],
    ["Produtos", `${prodsExistentes.size} de ${CATALOGO.length} já existem`, CATALOGO.length - prodsExistentes.size],
    ["Custo de referência", `${CATALOGO.length - semCusto} de ${CATALOGO.length} produtos com custo`, semCusto],
    ["Compras", `${existentes.compras} de ${comprasMontadas.length} já lançadas`, comprasMontadas.length - existentes.compras],
    ["Transferências", `${existentes.transfs} de ${ONDAS * 2 + 3} já enviadas`, ONDAS * 2 + 3 - existentes.transfs],
    ["Produção", `${existentes.producoes} de 1`, 1 - existentes.producoes],
    ["Turnos de caixa", `${existentes.turnos} de ${turnosPlanejados} já abertos (um por dia e loja; o de hoje fica aberto)`, turnosPlanejados - existentes.turnos],
    // +1: a troca gera a venda nova (chave `...:venda`), que também leva o prefixo; e cada orçamento faturado, a sua.
    ["Vendas", `${existentes.vendas} de ${sortidas.length + daMistura.length + 1 + faturados} já lançadas`, sortidas.length + daMistura.length + 1 + faturados - existentes.vendas],
    ["Orçamentos", `${existentes.orcamentos} de ${ORCAMENTOS.length} já salvos`, ORCAMENTOS.length - existentes.orcamentos],
    ["Devoluções e trocas", `${existentes.devolucoes} de 3`, 3 - existentes.devolucoes],
    ["Recebimentos de fiado", `${existentes.recebimentos} de 2 (partes)`, Math.max(0, 2 - existentes.recebimentos)],
    ["Levar da gerência ao banco", `${existentes.caixas} de 2`, 2 - existentes.caixas],
  ] as const;
  log("\nO que existe e o que seria criado:");
  for (const [nome, estado, falta] of resumoPlano) log(`  - ${nome.padEnd(26)} ${estado}${falta > 0 ? `  -> criaria/lançaria ${falta}` : ""}`);
  const vendasTotal = [...sortidas, ...daMistura].reduce((s, v) => s + totalCents(v, v.itens), 0);
  log(`\nPlano de vendas: ${sortidas.length + daMistura.length} vendas, ${brl(vendasTotal / 100)} no papel (as canceladas e devolvidas não entram no resultado).`);
  log(`Equipe do Empório: o cenário precisa de ${membrosFaltando.length} novo(s); sobram ${Math.max(seats.limit - seats.used, 0)}.`);
  if (funcoesAMudar.length > 0) {
    log("\nFunção na Equipe que o cenário mudaria (pela action da Equipe):");
    for (const f of funcoesAMudar) log(`  - ${f}`);
  }

  if (turnosAlheios.length > 0) {
    console.error("\nPARADO antes de qualquer escrita: o Caixa 1 tem um turno aberto que não é o de hoje deste cenário.");
    for (const t of turnosAlheios) console.error(`  - ${t}`);
    console.error(
      "A conta foi montada por uma versão anterior do cenário (um turno só) ou por uma rodada de outro dia. " +
        "Encerre esse turno pela tela (ou, no banco local, use --apagar) e rode de novo.",
    );
    process.exit(1);
  }
  if (membrosFaltando.length > seats.limit - seats.used) {
    console.error("\nA equipe do Empório não tem vaga para o cenário. Desative alguém da equipe e rode de novo.");
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
    // Cabeçalho do papel (entrega 1): CNPJ, telefone, WhatsApp, UF e CEP, editados como na tela.
    const cnpj = cnpjCom(l.cnpj);
    const atual = await db.establishment.findFirst({ where: { id }, select: { document: true, phone: true, whatsapp: true, state: true, zip: true } });
    if (atual?.document !== cnpj || atual?.phone !== l.fone || atual?.whatsapp !== l.zap || atual?.state !== "MT" || atual?.zip !== l.cep) {
      exigir(await cat.editarEstabelecimentoAction(db, dono, id, { document: cnpj, phone: l.fone, whatsapp: l.zap, state: "MT", zip: l.cep }), `cabeçalho da ${l.nome}`);
    }
    // Base do rateio automático (entrega 4): área e funcionários, só nas lojas que vendem.
    const base = BASE_DO_RATEIO[l.chave];
    if (base) {
      const lida = await db.establishment.findFirst({ where: { id }, select: { area_m2: true, employees_count: true } });
      if (Number(lida?.area_m2 ?? -1) !== base.area_m2 || lida?.employees_count !== base.employees_count) {
        exigir(await cat.editarEstabelecimentoAction(db, dono, id, base), `área e funcionários da ${l.nome}`);
      }
    }
  }

  // Configurações da conta (entrega 1): validade do orçamento, rodapés e bobina.
  {
    const desejado = CONFIG_DEMO;
    const atual = exigir(await conf.lerConfiguracoesAction(db, dono), "configurações");
    if ((Object.keys(desejado) as (keyof typeof desejado)[]).some((k) => atual[k] !== desejado[k])) {
      exigir(await conf.salvarConfiguracoesAction(db, dono, desejado), "configurações");
    }
  }

  // Equipe (o Dono cadastra; o assento já foi conferido antes de qualquer escrita)
  for (const m of MEMBROS) {
    const ja = await db.user.findFirst({ where: { email: m.email } });
    if (ja) {
      // A conta montada antes tinha a Juliana como Vendedora: vira Caixa da Rodovia
      // pela mesma action da Equipe que a tela usa. Já Caixa, nada muda. O mesmo
      // vale para o vínculo com as lojas: depois de um `--apagar` as lojas nascem
      // com id novo e a pessoa, que ficou, perde o vínculo (a Gestora sem loja
      // recebia "Estabelecimento não encontrado" na primeira escrita).
      const lojasDesejadas = m.lojas.map((c) => lojas[c]).sort();
      const lojasAtuais = (await db.userEstablishment.findMany({ where: { user_id: ja.id }, select: { establishment_id: true } })).map((x) => x.establishment_id).sort();
      if (ja.emporio_role !== m.funcao || lojasAtuais.join(",") !== lojasDesejadas.join(",")) {
        exigir(await equipe.alterarMembroAction(db, dono, ja.id, {
          emporio_role: m.funcao,
          establishment_ids: m.lojas.map((c) => lojas[c]),
          emporio_keys: [...m.keys],
        }), `equipe ${m.email}`);
        log(`Função ou lojas ajustadas: ${m.name} agora é ${m.funcao}`);
      }
      continue;
    }
    const r = await equipe.cadastrarMembroAction(db, dono, {
      name: m.name,
      email: m.email,
      emporio_role: m.funcao,
      establishment_ids: m.lojas.map((c) => lojas[c]),
      emporio_keys: [...m.keys],
    });
    if (!r.ok) {
      if (r.code === "SEAT_LIMIT_REACHED") throw new Parar("A equipe do Empório não tem vaga para o cenário. Desative alguém da equipe e rode de novo.");
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
  const { gerente, gestor, vendCentro } = atores;

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
  // Saldo inicial da conta (o Dono) e troco do Caixa 1 de cada loja (o Gerente
  // geral: entrega 2, do Gestor para cima), antes do primeiro turno, que abre às 8h.
  const saldoConta = await caixa.saldoInicialCaixaAction(db, dono, { bank_account_id: contaId, amount: 200000, occurred_at: dia(30, 7) });
  if (!saldoConta.ok && saldoConta.code !== "OPENING_ALREADY_DONE") throw new Error(`saldo da conta: ${saldoConta.message}`);
  for (const c of ["centro", "rodovia"] as const) {
    const r = await caixa.saldoInicialCaixaAction(db, gerente, { establishment_id: lojas[c], amount: TROCO, occurred_at: dia(30, 7, 30) });
    if (!r.ok && r.code !== "OPENING_ALREADY_DONE") throw new Error(`troco ${c}: ${r.message}`);
  }
  // Entrega 2: os turnos abrem e encerram dia a dia, junto com as vendas (abaixo).
  // Não usa o ajudante das suítes (`_emporio-turno`): ele é travado no banco
  // local, e este cenário também monta a demonstração numa conta de verdade.
  const caixas = {} as Record<ChaveVenda, string>;
  for (const c of ["centro", "rodovia"] as const) {
    const reg = await db.cashRegister.findFirst({ where: { establishment_id: lojas[c], number: 1 }, select: { id: true } });
    if (!reg) throw new Error(`a loja ${c} não tem o Caixa 1`);
    caixas[c] = reg.id;
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

  // Fornecedores e clientes do Empório (tabelas próprias, fora de Contatos).
  // O mapa guarda os dois pela chave: o fornecedor vai na compra, o cliente na venda e no orçamento.
  const contatos: Record<string, string> = {};
  for (const f of FORNECEDORES) contatos[f.chave] = await acharOuCriarFornecedor(db, gerente, f.nome, f.cidade);
  for (const c of CLIENTES) contatos[c.chave] = await acharOuCriarCliente(db, gerente, c);
  // O Sítio Boa Esperança tem limite e prazo próprios (o resto vale o padrão da conta). A action só
  // grava no Histórico quando o valor muda, então rodar de novo não repete nada.
  exigir(await definirCreditoDoClienteAction(db, gerente, contatos.boaEsperanca, { fiado_limit: 5000, fiado_due_days: 45 }), "limite e prazo do Sítio Boa Esperança");

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

  // Custo de referência de cada produto, pela action da tela (Dados comerciais,
  // campo "Custo por <unidade-base> (R$)"). O Custo e o Sugerido do Preço por
  // loja saem só dele: nenhuma action o preenche sozinha, nem a compra. Sem ele,
  // a coluna Custo diz "sem custo" e o Sugerido fica "-". O valor é o custo da
  // embalagem fechada dividido pela base dela, em centavos, como a tela aceita;
  // a mistura usa a composição (1 saca de milho e 1 de farelo rendem 80 kg).
  for (const p of CATALOGO) {
    const r = prods.get(p.slug) as Resolvido;
    const custoFechada = p.slug === "mistura" ? (porSlug.get("milho") as Prod).custo + (porSlug.get("farelo") as Prod).custo : p.custo;
    const base = p.slug === "mistura" ? 80 : r.fechadaBase;
    const desejado = r2(custoFechada / base);
    const atual = await db.emporioProduct.findFirst({ where: { id: r.epId }, select: { reference_cost: true } });
    if (atual?.reference_cost != null && Number(atual.reference_cost) === desejado) continue;
    exigir(await cat.editarProdutoEmporioAction(db, gerente, r.epId, { reference_cost: desejado }), `custo de referência ${p.nome}`);
  }

  const ctx: Ctx = { db, tenantId, lojas, atores, contatos, contaId, prods, caixas };

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
        split_kind: "faturamento",
        starts_on: inicio,
      }), "despesa fixa Energia");
    } else if (energia.split_kind !== "faturamento") {
      exigir(await desp.editarDespesaFixaAction(db, gerente, energia.id, { split_kind: "faturamento" }), "Energia elétrica para faturamento");
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
    if (c.pagamento === "a_vista") payment = { kind: "a_vista", paid_from: { bank_account_id: contaId } };
    else if (c.pagamento === "a_prazo") payment = { kind: "a_prazo", due_date: c.chave === "A-20" ? dia(8, 12) : dia(-8, 12) };
    else {
      const entrada = c.chave === "A-10" ? Math.round(totalC * 0.3) : 0;
      const resto = totalC - entrada;
      const p1 = Math.floor(resto / 2);
      payment = {
        kind: "parcelada",
        down_payment: entrada / 100,
        ...(entrada > 0 ? { paid_from: { bank_account_id: contaId } } : {}),
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
      supplier_id: contatos[c.forn],
      purchased_at: dia(c.dias, 9),
      received: true,
      freight: c.frete || null,
      items: itens,
      payment,
      notes: `Pedido ${forn.nome}`,
    }), `compra ${c.chave}`);
  }

  // A compra de uma propriedade do Dono: só o custo entra no estoque (Q194).
  const propriedade = await db.property.findFirst({ where: { archived_at: null }, orderBy: { created_at: "asc" }, select: { id: true, name: true } });
  if (propriedade) {
    const jaFornecedor = await db.emporioSupplier.findFirst({ where: { property_id: propriedade.id }, select: { id: true } });
    const fornecedorId = jaFornecedor
      ? jaFornecedor.id
      : exigir(
          await cadastrarFornecedorAction(db, gerente, { kind: "propriedade", property_id: propriedade.id, notes: NOTA_FORNECEDOR_PROPRIEDADE }),
          `fornecedor da propriedade ${propriedade.name}`,
        ).id;
    const milho = prods.get("milho") as Resolvido;
    exigir(await compras.criarCompraAction(db, gerente, {
      operation_key: CHAVE_COMPRA_PROPRIEDADE,
      establishment_id: lojas.deposito,
      supplier_id: fornecedorId,
      purchased_at: dia(12, 9),
      received: true,
      items: [{ emporio_product_id: milho.epId, presentation_id: milho.fechadaId, quantity: 10, item_total: 550 }],
      notes: `Milho colhido na ${propriedade.name}`,
    }), "compra da propriedade");
  } else {
    log("A conta não tem propriedade ativa: a compra de propriedade ficou de fora.");
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
  const demandaReal = calcularDemanda([...sortidas, ...daMistura, ...vendasDosOrcamentos()], prods);
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
      if (t.status === "em_transito") await receberTudo(t, c === "centro" ? vendCentro : gestor);
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
      // A Rodovia não tem Vendedor e o Caixa não recebe transferência: a Gestora
      // recebe e, como chegou menos, resolve no mesmo passo.
      atual = exigir(await transf.receberTransferenciaAction(db, gestor, t.id, {
        items: t.items.map((i) => ({ item_id: i.id, received_qty: i.sent_qty - 4, loss_reason: "avaria" })),
        resolution: "perda_no_caminho",
        reason: "Caixa de frascos quebrou na estrada de terra",
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

  // Vendas, dia a dia. Em cada loja com venda no dia, o turno abre às 8h,
  // recebe as vendas do dia (e uma sangria em alguns dias) e encerra às 18h com
  // o malote, que a Gestora confirma. Rodar de novo repete as chaves: o turno
  // já encerrado volta como está, e nada é gravado de novo.
  const ordenadas = [...sortidas, ...daMistura].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const vendasPorTag = new Map<string, vendas.VendaView>();
  let feitas = 0;
  let turnosDoMes = 0;
  // Toda venda exige cliente (design 2026-11-03-emporio-cliente-nome-menu): sem cliente nomeado, vai o Consumidor final.
  const consumidorFinalId = (await garantirConsumidorFinal(db)).id;
  for (let d = 30; d >= 1; d--) {
    for (const c of ["centro", "rodovia"] as ChaveVenda[]) {
      const doDia = ordenadas.filter((v) => v.d === d && v.loja === c);
      if (doDia.length === 0) continue;
      const aberto = await abrirTurnoDoDia(ctx, c, d);
      // Turno já encerrado (rodada anterior): a sangria não se repete fora dele.
      let semSangria = aberto.status === "closed" || !DIAS_DE_SANGRIA.has(d);
      for (const v of doDia) {
        if (!semSangria && v.quando.getTime() >= dia(d, 13).getTime()) {
          await sangriaDoDia(ctx, c, d, aberto.id);
          semSangria = true;
        }
        vendasPorTag.set(v.tag, await vender(ctx, v, consumidorFinalId));
        feitas++;
      }
      if (!semSangria) await sangriaDoDia(ctx, c, d, aberto.id);
      await confirmarMaloteDoDia(ctx, c, d, await encerrarTurnoDoDia(ctx, c, d, aberto.id));
      turnosDoMes++;
    }
  }
  log(`Vendas lançadas: ${feitas}, em ${turnosDoMes} turnos encerrados`);

  // Hoje: o turno abre e fica aberto, para a demonstração começar com o caixa
  // aberto. Nele caem os passos que as actions gravam com a hora real: o
  // faturamento dos orçamentos, devolução, troca, cancelamento e fiado.
  for (const c of ["centro", "rodovia"] as ChaveVenda[]) await abrirTurnoDoDia(ctx, c, 0);
  await montarOrcamentos(ctx);
  for (const v of explicitas) {
    const r = vendasPorTag.get(v.tag);
    if (r) await depoisDaVenda(ctx, v, r);
  }

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

  // Uma sangria de hoje na Rodovia, deixada aguardando a Gestora (a tela de entregas tem o que mostrar).
  {
    const chave = `${PREFIXO}sangria-hoje-rodovia`;
    const ja = await db.cashHandover.findFirst({ where: { operation_key: chave }, select: { id: true } });
    const aberto = await db.cashSession.findFirst({ where: { open_register_id: caixas.rodovia }, select: { id: true } });
    if (!ja && aberto && (await caixa.saldoDoCaixa(db, caixas.rodovia)) >= (TROCO + 100) * 100) {
      exigir(await turno.sangriaAction(db, atores.caixaRodovia, aberto.id, { operation_key: chave, amount: 100, notes: "Sangria do meio do dia" }), "sangria de hoje na Rodovia");
    }
  }

  // Levar da gerência ao banco (a Gestora). Entrega 2: a gaveta não transfere
  // (Q92); o dinheiro dos malotes e sangrias confirmados está "Com a gerência".
  for (const c of ["centro", "rodovia"] as const) {
    const chave = `${PREFIXO}caixa-${c}-1`;
    const ja = await db.cashTransfer.findFirst({ where: { operation_key: chave }, select: { id: true } });
    if (ja) continue;
    const valor = Math.floor(((await caixa.saldoDaGerencia(db, lojas[c])) / 100) * 0.8 / 100) * 100;
    if (valor < 100) continue;
    exigir(await caixa.transferirCaixaAction(db, gestor, { operation_key: chave, from: { manager_establishment_id: lojas[c] }, to: { bank_account_id: contaId }, amount: valor, notes: "Depósito da gerência no banco" }), `gerência ${c} ao banco`);
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
  // Entrega 2: a conferência é livre, dentro do turno aberto de hoje (a abertura grava a contagem dela, kind abertura).
  for (const c of ["centro", "rodovia"] as const) {
    const quem = operadorDoCaixa(ctx, c);
    const ja = await db.cashCount.count({ where: { establishment_id: lojas[c], kind: "livre" } });
    if (ja > 0) continue;
    const caixaId = caixas[c];
    const esperado = (await caixa.saldoDoCaixa(db, caixaId)) / 100;
    if (c === "rodovia") {
      exigir(await caixa.conferirGavetaAction(db, quem, { cash_register_id: caixaId, counted: r2(esperado - 12.5), justification: "Troco dado a maior de manhã" }), "conferência com diferença");
    } else {
      exigir(await caixa.conferirGavetaAction(db, quem, { cash_register_id: caixaId, counted: esperado }), "conferência da gaveta");
    }
  }

  // Entrega 3 do financeiro: o acordo do Haras Santa Clara (duas parcelas, a primeira paga hoje), o
  // teto de R$ 2.000,00, um pedido de pagamento esperando e três linhas carimbadas no extrato da conta.
  {
    const hojeIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const [ay, am, ad] = hojeIso.split("-").map(Number);
    const maisDias = (n: number) => new Date(Date.UTC(ay, am - 1, ad + n)).toISOString().slice(0, 10);

    const jaTemAcordo = await db.emporioCreditAgreement.count({ where: { customer_id: contatos.santaClara } });
    if (jaTemAcordo === 0) {
      const abertas = await db.financialEntry.findMany({
        where: { related_module: "emporio", entry_type: "income", status: "pending", emporio_customer_id: contatos.santaClara, agreement_id: null },
        select: { id: true, amount: true },
      });
      const totalCent = abertas.reduce((s, e) => s + cents(Number(e.amount)), 0);
      if (abertas.length > 0 && totalCent >= 200) {
        const primeira = Math.round(totalCent / 2);
        const acordo = exigir(await fazerAcordoAction(db, dono, contatos.santaClara, {
          entry_ids: abertas.map((e) => e.id),
          installments: [
            { due_date: maisDias(0), amount: primeira / 100 },
            { due_date: maisDias(30), amount: (totalCent - primeira) / 100 },
          ],
          notes: "Acordo em duas parcelas, combinado no balcão da Rodovia",
        }), "acordo do Haras Santa Clara");
        exigir(await caixa.receberFiadoAction(db, gerente, {
          operation_key: `${PREFIXO}acordo-parcela-1`,
          customer_id: contatos.santaClara,
          establishment_id: lojas.rodovia,
          amount: acordo.installments[0].amount,
          kind: "pix",
          entry_id: acordo.installments[0].entry_id,
          bank_account_id: contaId,
        }), "primeira parcela do acordo");
      }
    }

    exigir(await conf.salvarAlcadaAction(db, dono, { payment_approval_limit: 2000 }), "teto de aprovação");
    const pedidosPendentes = await db.emporioPaymentRequest.count({ where: { status: "pendente" } });
    if (pedidosPendentes === 0) {
      const contas = exigir(await desp.listarContasAPagarAction(db, gerente, { status: "pending" }), "contas a pagar");
      const grandes = contas.filter((a) => a.open_amount > 2000).sort((a, b) => b.open_amount - a.open_amount);
      // Quem pede: o Financeiro, se estiver ativo; senão a Gestora, que só enxerga as contas das lojas dela.
      const financeiroAtivo = (await db.user.findFirst({ where: { email: "financeiro.demo.emporio@example.com" }, select: { active: true } }))?.active;
      const quemPede = financeiroAtivo ? atores.financeiro : atores.gestor;
      let pediu = false;
      for (const grande of grandes) {
        const r = await desp.pagarDespesasAction(db, quemPede, { entry_ids: [grande.entry_id], from: { bank_account_id: contaId } });
        if (!r.ok) continue;
        if (!r.data.waiting_approval) throw new Error("O pagamento acima do teto deveria virar pedido de aprovação.");
        pediu = true;
        break;
      }
      if (!pediu) {
        log("AVISO: nenhuma conta a pagar acima de R$ 2.000,00; o pedido de pagamento pendente não foi criado.");
      }
    }

    const carimbadas = (await db.cashMovement.count({ where: { bank_account_id: contaId, reconciled_at: { not: null } } })) + (await db.cardReceivable.count({ where: { bank_account_id: contaId, reconciled_at: { not: null } } }));
    if (carimbadas < 3) {
      const de = new Date(Date.UTC(ay, am - 1, ad - 35));
      const ate = new Date(Date.UTC(ay, am - 1, ad));
      const extrato = exigir(await lerExtratoAction(db, dono, { lugar: { kind: "conta", id: contaId }, de, ate }), "extrato da conta");
      const livres = extrato.lines.filter((l) => !l.reconciled_at).slice(0, 3 - carimbadas);
      for (const l of livres) exigir(await carimbarLinhaAction(db, dono, { kind: l.kind, id: l.id }), "carimbo do extrato");
    }
  }

  await resumo(ctx, senhas);
}

// ---------------------------------------------------------------------------
// O turno do dia, a venda e os orçamentos
// ---------------------------------------------------------------------------

/** Dias (atrás) com sangria ao meio-dia, nas duas lojas. */
const DIAS_DE_SANGRIA = new Set([27, 22, 17, 12, 7, 2]);
/** Encerramentos com diferença, por `loja|dias atrás`: [diferença, justificativa]. */
const DIFERENCA_NO_ENCERRAMENTO: Record<string, [number, string]> = {
  "centro|23": [-7.5, "Troco dado errado para um cliente no fim da tarde"],
  "centro|12": [-4, "Faltaram moedas na contagem do troco"],
  "rodovia|17": [5, "Sobra: cliente deixou o troco para a próxima compra"],
};
/**
 * O malote recebido com falta: o primeiro da Rodovia de R$ 100 para cima nos
 * últimos 10 dias. Não é um dia fixo porque nem todo dia tem malote (o troco
 * pode ser tudo o que sobrou na gaveta), e as vendas de cada dia mudam com o
 * calendário (a Centro fecha aos domingos).
 */
const FALTA_NO_MALOTE: [number, string] = [-10, "Faltou uma nota de R$ 10 no malote; conferido com a Juliana"];

/** Quem opera o caixa: na Centro (sem Caixa), o Vendedor; na Rodovia, o Caixa. */
const operadorDoCaixa = (ctx: Ctx, c: ChaveVenda): Ator => (c === "centro" ? ctx.atores.vendCentro : ctx.atores.caixaRodovia);

/** Abre o Caixa 1 às 8h do dia (hoje: às 8h, ou agora se ainda não deu 8h), contando o troco que ficou. */
async function abrirTurnoDoDia(ctx: Ctx, c: ChaveVenda, d: number): Promise<turno.TurnoGravadoView> {
  const reg = ctx.caixas[c];
  const agora = d === 0 ? new Date(Math.min(dia(0, 8).getTime(), Date.now())) : dia(d, 8);
  const r = await turno.abrirTurnoAction(
    ctx.db,
    operadorDoCaixa(ctx, c),
    { operation_key: `${PREFIXO}turno-dia-${c}-${dd(d)}`, cash_register_id: reg, counted: (await caixa.saldoDoCaixa(ctx.db, reg)) / 100 },
    { agora },
  );
  if (!r.ok && r.code === "SESSION_ALREADY_OPEN") {
    throw new Parar(
      `O Caixa 1 da loja ${c} já tem um turno aberto que não é o deste dia (${dd(d)} dia(s) atrás). ` +
        "A conta foi montada por uma versão anterior do cenário, ou o turno ficou aberto de uma rodada de outro dia. " +
        "Encerre esse turno pela tela (ou, no banco local, use --apagar) e rode de novo.",
    );
  }
  return exigir(r, `abrir o caixa da loja ${c} (${dd(d)} dia(s) atrás)`);
}

/** Sangria ao meio-dia (60% do que passa do troco), confirmada pela Gestora meia hora depois. */
async function sangriaDoDia(ctx: Ctx, c: ChaveVenda, d: number, sessionId: string) {
  const { db, atores, caixas } = ctx;
  const saldo = (await caixa.saldoDoCaixa(db, caixas[c])) / 100;
  const valor = Math.floor(((saldo - TROCO) * 0.6) / 50) * 50;
  if (valor < 100) return;
  const e = exigir(
    await turno.sangriaAction(db, operadorDoCaixa(ctx, c), sessionId, { operation_key: `${PREFIXO}sangria-dia-${c}-${dd(d)}`, amount: valor, notes: "Sangria do meio do dia" }, { agora: dia(d, 13) }),
    `sangria da loja ${c} (${dd(d)} dia(s) atrás)`,
  );
  if (e.status === "pending") {
    exigir(
      await turno.confirmarEntregaAction(db, atores.gestor, e.id, { operation_key: `${PREFIXO}confirma-sangria-dia-${c}-${dd(d)}`, received_amount: e.amount }, { agora: dia(d, 13, 30) }),
      `confirmar a sangria da loja ${c} (${dd(d)} dia(s) atrás)`,
    );
  }
}

/** Encerra às 18h: conta (com a diferença do dia, se houver), deixa o troco e manda o resto no malote. */
async function encerrarTurnoDoDia(ctx: Ctx, c: ChaveVenda, d: number, sessionId: string): Promise<turno.TurnoGravadoView> {
  const esperado = (await caixa.saldoDoCaixa(ctx.db, ctx.caixas[c])) / 100;
  const dif = DIFERENCA_NO_ENCERRAMENTO[`${c}|${d}`];
  const contado = r2(esperado + (dif?.[0] ?? 0));
  const malote = contado > TROCO ? r2(contado - TROCO) : 0;
  return exigir(
    await turno.encerrarTurnoAction(
      ctx.db,
      operadorDoCaixa(ctx, c),
      sessionId,
      { operation_key: `${PREFIXO}encerra-dia-${c}-${dd(d)}`, counted: contado, justification: dif?.[1] ?? null, malote_amount: malote },
      { agora: dia(d, 18) },
    ),
    `encerrar o caixa da loja ${c} (${dd(d)} dia(s) atrás)`,
  );
}

/** A Gestora confirma o malote às 18h30 (num dia, com falta justificada). */
async function confirmarMaloteDoDia(ctx: Ctx, c: ChaveVenda, d: number, t: turno.TurnoGravadoView) {
  const m = t.handovers.find((h) => h.kind === "malote");
  if (!m || m.status !== "pending") return;
  const comFalta =
    c === "rodovia" &&
    d <= 10 &&
    m.amount >= 100 &&
    (await ctx.db.cashHandover.count({ where: { establishment_id: ctx.lojas.rodovia, kind: "malote", difference: { not: 0 } } })) === 0;
  const dif = comFalta ? FALTA_NO_MALOTE : undefined;
  exigir(
    await turno.confirmarEntregaAction(
      ctx.db,
      ctx.atores.gestor,
      m.id,
      { operation_key: `${PREFIXO}confirma-malote-${c}-${dd(d)}`, received_amount: r2(m.amount + (dif?.[0] ?? 0)), notes: dif?.[1] ?? null },
      { agora: dia(d, 18, 30) },
    ),
    `confirmar o malote da loja ${c} (${dd(d)} dia(s) atrás)`,
  );
}

/** A venda no turno aberto da loja; o Caixa diz quem atendeu. */
async function vender(ctx: Ctx, v: VendaPlan, consumidorFinalId: string): Promise<vendas.VendaView> {
  const { db, atores, lojas, contatos, prods, caixas } = ctx;
  const payments: vendas.VendaPagamentoInput[] = v.pagamentos.map((p) => {
    const base: vendas.VendaPagamentoInput = { kind: p.kind, amount: p.cents / 100 };
    if (p.kind === "credito_parcelado") base.installments = p.parcelas;
    if (p.kind === "fiado") base.due_date = p.vence;
    if (p.kind === "cheque") base.check = { number: p.numero, bank: p.banco, good_for: p.bomPara };
    return base;
  });
  return exigir(await vendas.venderAction(db, atores[v.quem], {
    operation_key: v.chave,
    establishment_id: lojas[v.loja],
    customer_id: v.cliente ? contatos[v.cliente] : consumidorFinalId,
    // O caixa do turno que o cenário abriu: numa conta real com um segundo caixa aberto, sem ele a venda pediria a escolha.
    cash_register_id: caixas[v.loja],
    seller_user_id: v.vendedor ? atores[v.vendedor].id : null,
    sold_at: v.quando,
    items: v.itens.map((i) => {
      const res = prods.get(i.slug) as Resolvido;
      return { emporio_product_id: res.epId, presentation_id: i.papel === "fechada" ? res.fechadaId : (res.granelId as string), quantity: i.qtd, unit_price: precoItem(v, i) };
    }),
    payments,
  }), `venda ${v.tag}`);
}

/** Salva os orçamentos (os antigos com a data deles) e fatura hoje os que o plano manda; um é cancelado depois. */
async function montarOrcamentos(ctx: Ctx) {
  const { db, atores, lojas, contatos, prods, caixas } = ctx;
  for (const o of ORCAMENTOS) {
    const itens = o.itens.map((i) => {
      const res = prods.get(i.slug) as Resolvido;
      return { emporio_product_id: res.epId, presentation_id: i.papel === "fechada" ? res.fechadaId : (res.granelId as string), quantity: i.qtd, unit_price: precoItem({ loja: o.loja }, i) };
    });
    const q = exigir(
      await orc.salvarOrcamentoAction(
        db,
        atores[o.quem],
        {
          operation_key: `${PREFIXO}${o.chave}`,
          establishment_id: lojas[o.loja],
          customer_id: contatos[o.cliente],
          items: itens,
          seller_user_id: o.vendedor ? atores[o.vendedor].id : null,
          notes: o.notas ?? null,
          ...(o.entrega ? { for_delivery: true, ...o.entrega } : {}),
        },
        o.feito ? { agora: dia(o.feito[0], o.feito[1]) } : {},
      ),
      `orçamento ${o.chave}`,
    );
    if (!o.fatura) continue;
    const total = itens.reduce((s, i) => s + cents(i.quantity * i.unit_price), 0);
    const venda = exigir(await vendas.venderAction(db, atores[o.fatura.quem], {
      operation_key: `${PREFIXO}venda-${o.chave}`,
      establishment_id: lojas[o.loja],
      customer_id: contatos[o.cliente],
      cash_register_id: caixas[o.loja],
      quote_id: q.id,
      items: itens,
      payments: [{ kind: o.fatura.kind, amount: total / 100 }],
    }), `faturar o ${o.chave}`);
    if (o.fim === "cancelado" && venda.status !== "cancelada") {
      exigir(await vendas.cancelarVendaAction(db, atores.gestor, venda.id, { reason: "O cliente desistiu na hora de carregar", cash_register_id: caixas[o.loja] }), `cancelar a venda do ${o.chave}`);
    }
  }
}

/** O que cada venda explícita ainda pede, hoje: devolver, trocar, cancelar, depositar cheque, receber fiado. */
async function depoisDaVenda(ctx: Ctx, v: VendaPlan, r: vendas.VendaView) {
  const { db, atores, lojas, contaId, prods, caixas } = ctx;
  const { gestor, vendCentro } = atores;
  // Entrega 2: o dinheiro sai e entra no turno de hoje, aberto na loja da venda.
  const caixaDaVenda = caixas[v.loja];
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
      cash_register_id: caixaDaVenda,
    }), "devolução");
  }
  if (v.tag === "avaria") {
    exigir(await vendas.devolverAction(db, gestor, r.id, {
      operation_key: `${PREFIXO}devolucao-2`,
      refund_kind: "dinheiro",
      items: [{ sale_item_id: item("v10").id, quantity: 1, loss_reason: "avaria" }],
      reason: "Frasco chegou trincado",
      cash_register_id: caixaDaVenda,
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
      cash_register_id: caixaDaVenda,
      venda: {
        customer_id: r.customer_id ?? (await garantirConsumidorFinal(db)).id,
        items: [{ emporio_product_id: res.epId, presentation_id: res.fechadaId, quantity: 1, unit_price: precoDe("gatoCastrado", "fechada", "centro") }],
        payments: diferenca > 0 ? [{ kind: "dinheiro", amount: diferenca / 100 }] : [],
      },
    }), "troca");
  }
  if (v.tag === "cancelar") {
    const c = await vendas.cancelarVendaAction(db, gestor, r.id, { reason: "Lançada em duplicidade", cash_register_id: caixaDaVenda });
    if (!c.ok && c.code !== "SALE_CANCELED") throw new Error(`cancelar venda: ${c.message}`);
  }
  if (v.tag === "cheque") {
    const cheque = r.payments.find((p) => p.check)?.check;
    if (cheque && cheque.status === "recebido") {
      exigir(await caixa.depositarChequeAction(db, gestor, cheque.id, { bank_account_id: contaId }), "depositar cheque");
    }
  }
  if (v.tag === "fiado-parcial") {
    const base = { customer_id: ctx.contatos.boaEsperanca, establishment_id: lojas.centro, cash_register_id: caixas.centro };
    exigir(await caixa.receberFiadoAction(db, vendCentro, { ...base, operation_key: `${PREFIXO}recebimento-1`, amount: 300, kind: "dinheiro" }), "recebimento de fiado em dinheiro");
    exigir(await caixa.receberFiadoAction(db, vendCentro, { ...base, operation_key: `${PREFIXO}recebimento-2`, amount: 200, kind: "pix" }), "recebimento de fiado em PIX");
  }
}

async function acharOuCriarFornecedor(db: TenantPrismaClient, ator: Ator, nome: string, cidade: string): Promise<string> {
  const ja = await db.emporioSupplier.findFirst({
    where: { name: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (ja) return ja.id;
  return exigir(await cadastrarFornecedorAction(db, ator, { name: nome, city: cidade }), `fornecedor ${nome}`).id;
}

/** O cliente do Empório pelo nome; o que já existe incompleto (o de uma montagem antiga) é completado. */
async function acharOuCriarCliente(db: TenantPrismaClient, ator: Ator, c: (typeof CLIENTES)[number]): Promise<string> {
  const cadastro = {
    name: c.nome, person_kind: c.pessoa, document: c.doc, phone: c.fone, city: c.cidade, ...(c.endereco ?? {}),
  };
  const ja = await db.emporioCustomer.findFirst({ where: { name: { equals: c.nome, mode: "insensitive" } } });
  if (ja) {
    if (serializarCliente(ja).incomplete) exigir(await editarClienteAction(db, ator, ja.id, cadastro), `cadastro de ${c.nome}`);
    return ja.id;
  }
  return exigir(await cadastrarClienteAction(db, ator, cadastro), `cliente ${c.nome}`).id;
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
  const turnosAbertos = await db.cashSession.count({ where: { operation_key: { startsWith: `${PREFIXO}turno-dia-` }, open_register_id: { not: null } } });
  const turnosEncerrados = await db.cashSession.count({ where: { operation_key: { startsWith: `${PREFIXO}turno-dia-` }, closed_at: { not: null } } });
  const orcamentos = await db.emporioQuote.findMany({ where: doCenario, select: { sale_id: true } });

  log("\n" + "=".repeat(70));
  log("CENÁRIO PRONTO");
  log("=".repeat(70));
  log(`Lojas:           ${LOJAS.map((l) => l.nome).join(", ")}`);
  log(`Pessoas ativas:  ${pessoas} (Dono, Gerente geral, Gestora, Vendedor da Centro, Caixa da Rodovia)`);
  log(`Turnos:          ${turnosEncerrados} encerrados, ${turnosAbertos} aberto(s) hoje`);
  log(`Orçamentos:      ${orcamentos.length}, ${orcamentos.filter((o) => o.sale_id).length} faturado(s)`);
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
  const clientes = (await prisma.emporioCustomer.findMany({ where: { ...t, name: { in: CLIENTES.map((c) => c.nome) } }, select: { id: true } })).map((x) => x.id);
  const vendasIds = (await prisma.emporioSale.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { ...t, sale_id: { in: vendasIds } }, select: { id: true } })).map((x) => x.id);
  // Entrega 4: o orçamento prende a loja, o contato e a apresentação (Restrict), e a venda o prende.
  const orcamentos = (await prisma.emporioQuote.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const comprasIds = (await prisma.emporioPurchase.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const transfIds = (await prisma.stockTransfer.findMany({ where: { ...t, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] }, select: { id: true } })).map((x) => x.id);
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { ...t, splits: { some: { establishment_id: { in: lojas } } } }, select: { id: true } })).map((x) => x.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const producoes = (await prisma.productionEntry.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  const turnos = await prisma.cashSession.count({ where: { ...t, establishment_id: { in: lojas } } });
  // A Diferença de caixa da confirmação aponta para a entrega (sangria ou malote).
  const entregas = (await prisma.cashHandover.findMany({ where: { ...t, establishment_id: { in: lojas } }, select: { id: true } })).map((x) => x.id);
  // Entrega 3: o acordo de fiado (as parcelas têm `related_id` = acordo) e o pedido de pagamento.
  const acordos = (await prisma.emporioCreditAgreement.findMany({ where: { ...t, customer_id: { in: clientes } }, select: { id: true } })).map((x) => x.id);
  const relacionados = [...vendasIds, ...devolucoes, ...comprasIds, ...modelos, ...conferencias, ...producoes, ...entregas, ...acordos];
  const entradas = (
    await prisma.financialEntry.findMany({
      where: { ...t, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: relacionados } }, { emporio_customer_id: { in: clientes } }] },
      select: { id: true },
    })
  ).map((x) => x.id);
  const pedidos = (
    await prisma.emporioPaymentRequest.findMany({
      where: { ...t, OR: [{ requested_by_user_id: { in: usuarios } }, { entry_ids: { hasSome: entradas } }, { bank_account_id: { in: contas } }] },
      select: { id: true },
    })
  ).map((x) => x.id);

  log(`Seria apagado: ${lojas.length} lojas, ${eps.length} produtos, ${vendasIds.length} vendas, ${turnos} turnos, ${entregas.length} entregas, ${orcamentos.length} orçamentos, ${comprasIds.length} compras, ${transfIds.length} transferências, ${entradas.length} lançamentos, ${usuarios.length} usuários, ${contatos.length} contatos.`);
  if (!executar) {
    log("(nada foi apagado; repita com --confirmar)");
    return;
  }

  await prisma.emporioSale.updateMany({ where: { id: { in: vendasIds } }, data: { exchange_return_id: null } });
  await prisma.stockMovement.deleteMany({ where: { ...t, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtosBase } }] } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { return_id: { in: devolucoes } } });
  await prisma.cardReceivable.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.emporioCheck.deleteMany({ where: { OR: [{ sale_id: { in: vendasIds } }, { establishment_id: { in: lojas } }] } });
  // Entrega 2: "Com a gerência" é um terceiro lugar do dinheiro; o turno, o caixa e a entrega caem com a loja.
  await prisma.cashMovement.deleteMany({ where: { ...t, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { sale_id: { in: vendasIds } }] } });
  await prisma.cashTransfer.deleteMany({
    where: {
      ...t,
      OR: [
        { from_establishment_id: { in: lojas } },
        { to_establishment_id: { in: lojas } },
        { from_manager_establishment_id: { in: lojas } },
        { to_manager_establishment_id: { in: lojas } },
        { from_bank_account_id: { in: contas } },
        { to_bank_account_id: { in: contas } },
      ],
    },
  });
  await prisma.cashCount.deleteMany({ where: { id: { in: conferencias } } });
  await prisma.saleVariableExpense.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { template_id: { in: modelos } } });
  await prisma.emporioSalePayment.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.financialPayment.deleteMany({ where: { entry_id: { in: entradas } } });
  await prisma.financialEntry.deleteMany({ where: { id: { in: entradas } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { sale_id: { in: vendasIds } } });
  await prisma.emporioSale.deleteMany({ where: { id: { in: vendasIds } } });
  // Os turnos e as entregas cairiam em cascata com a loja; apagados aqui, depois de quem aponta para eles.
  await prisma.cashHandover.deleteMany({ where: { ...t, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { ...t, establishment_id: { in: lojas } } });
  // Depois das vendas (que apontam para ele) e antes de loja, contato e apresentação; os itens vão em cascata.
  await prisma.emporioQuote.deleteMany({ where: { id: { in: orcamentos } } });
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
  // Entregas 2 e 3: liberação de fiado, acordo e pedido de pagamento apontam para cliente, loja e usuário com Restrict.
  await prisma.emporioCreditRelease.deleteMany({ where: { ...t, OR: [{ customer_id: { in: clientes } }, { establishment_id: { in: lojas } }, { released_by_user_id: { in: usuarios } }] } });
  await prisma.emporioCreditAgreement.deleteMany({ where: { id: { in: acordos } } });
  await prisma.emporioPaymentRequest.deleteMany({ where: { id: { in: pedidos } } });
  await prisma.userEstablishment.deleteMany({ where: { OR: [{ establishment_id: { in: lojas } }, { user_id: { in: usuarios } }] } });
  await prisma.establishment.deleteMany({ where: { id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { id: { in: contas } } });
  await prisma.emporioAuditLog.deleteMany({ where: { ...t, OR: [{ user_id: { in: usuarios } }, { establishment_id: { in: lojas } }, { target_id: { in: [...eps, ...usuarios, ...contas, ...lojas, ...relacionados, ...pedidos, ...clientes] } }] } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.emporioCustomer.deleteMany({ where: { id: { in: clientes } } });
  await prisma.emporioSupplier.deleteMany({
    where: { ...t, OR: [{ name: { in: FORNECEDORES.map((f) => f.nome) } }, { kind: "propriedade", notes: NOTA_FORNECEDOR_PROPRIEDADE }] },
  });
  await prisma.contact.deleteMany({ where: { id: { in: contatos } } });
  // As configurações da conta são uma linha só: ela sai apenas se ainda tem os
  // rodapés que o cenário gravou (mexida depois, na tela, fica). Só banco local.
  const config = await prisma.emporioSettings.deleteMany({
    where: { ...t, quote_footer: CONFIG_DEMO.quote_footer, sale_footer: CONFIG_DEMO.sale_footer },
  });
  if (config.count === 0) log("As configurações da conta não são as do cenário: ficaram.");
  log("Cenário apagado.");
}

main().catch(async (e) => {
  if (e instanceof Parar) console.error(`\n${e.message}`);
  else console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
