/**
 * Regras puras da tela do Vender (desenho §5.7, onda 3 da UX do Empório, decisões 3 e 10 do
 * plano). Sem React e sem servidor, para a suíte `test:m132` provar sem navegador.
 *
 * O fuso importa: o turno do caixa pode abrir antes da meia-noite. Comparar o dia pela
 * máquina (ou por UTC) mostraria "só a hora" para um turno de ontem, então tudo aqui
 * formata em America/Sao_Paulo.
 */
import { reaisBr } from "@/lib/numero-br";
import type { OrigemDaVenda } from "@/lib/emporio/frete";

export type MaisOpcoesPreenchidas = {
  descontoNoTotalCent: number;
  freteCent: number;
  origem: OrigemDaVenda;
  paraEntrega: boolean;
  franqueadoNome: string | null;
  creditoDoFranqueadoCent: number;
  orcamentoNumero: string | null;
};

function partesDasMaisOpcoes(p: MaisOpcoesPreenchidas): string[] {
  const partes: string[] = [];
  if (p.descontoNoTotalCent > 0) partes.push("desconto " + reaisBr(p.descontoNoTotalCent / 100));
  if (p.freteCent > 0) partes.push("frete " + reaisBr(p.freteCent / 100));
  if (p.origem !== "balcao") partes.push("e-commerce");
  if (p.paraEntrega) partes.push("para entrega");
  if (p.franqueadoNome) partes.push("franqueado " + p.franqueadoNome);
  if (p.creditoDoFranqueadoCent > 0) partes.push("crédito " + reaisBr(p.creditoDoFranqueadoCent / 100));
  if (p.orcamentoNumero) partes.push("orçamento nº " + p.orcamentoNumero);
  return partes;
}

export function algoNasMaisOpcoes(p: MaisOpcoesPreenchidas): boolean {
  return partesDasMaisOpcoes(p).length > 0;
}

export function tituloDasMaisOpcoes(p: MaisOpcoesPreenchidas): string {
  const partes = partesDasMaisOpcoes(p);
  return partes.length === 0 ? "Mais opções" : "Mais opções (" + partes.join(", ") + ")";
}

/** Nomes dos campos da API que vivem em "Mais opções", na ordem visual da seção. */
export const CAMPOS_DAS_MAIS_OPCOES: readonly string[] = [
  "order_discount_amount",
  "freight_amount",
  "origin",
  "for_delivery",
  "delivery_address_kind",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
  "franchisee_id",
  "franchisee_credit",
  "number",
  "quote_id",
];

export type FaixaDoCaixa = { tom: "aberto" | "fechado"; texto: string };

const FUSO = "America/Sao_Paulo";

function dataEHoraEmSp(d: Date): { dia: string; mes: string; ano: string; hora: string } {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const m: Record<string, string> = {};
  for (const p of f.formatToParts(d)) m[p.type] = p.value;
  return { dia: m.day, mes: m.month, ano: m.year, hora: `${m.hour}:${m.minute}` };
}

export function faixaDoCaixa(a: {
  escolhido: { nome: string; aberto_em: string } | null;
  abertos: number;
  lojaNome: string;
  agora: Date;
}): FaixaDoCaixa {
  if (a.abertos === 0) {
    return { tom: "fechado", texto: "Dá para montar a venda; para fechar, abra o caixa" };
  }
  const sep = " · ";
  if (a.escolhido) {
    const aberto = dataEHoraEmSp(new Date(a.escolhido.aberto_em));
    const hoje = dataEHoraEmSp(a.agora);
    const mesmoDia = aberto.dia === hoje.dia && aberto.mes === hoje.mes && aberto.ano === hoje.ano;
    const quando = mesmoDia ? aberto.hora : `${aberto.dia}/${aberto.mes}, ${aberto.hora}`;
    return { tom: "aberto", texto: `${a.escolhido.nome} aberto desde ${quando}${sep}${a.lojaNome}` };
  }
  const n = a.abertos === 1 ? "1 caixa aberto" : `${a.abertos} caixas abertos`;
  return { tom: "aberto", texto: `${n}${sep}${a.lojaNome}` };
}

export function vendedorQueVemEscolhido(a: {
  vendedores: { id: string }[];
  ehCaixa: boolean;
  usuarioId: string;
  escolhido: string;
}): string {
  const naLista = (id: string) => a.vendedores.some((v) => v.id === id);
  if (a.escolhido && naLista(a.escolhido)) return a.escolhido;
  if (!a.ehCaixa && naLista(a.usuarioId)) return a.usuarioId;
  if (a.ehCaixa && a.vendedores.length === 1) return a.vendedores[0].id;
  return "";
}

export function vendedorPelaTecla(vendedores: { id: string }[], tecla: string): string | null {
  if (!/^[1-9]$/.test(tecla)) return null;
  return vendedores[Number(tecla) - 1]?.id ?? null;
}

export function formaPedeClienteDeVerdade(kind: string): boolean {
  return kind === "cheque" || kind === "boleto" || kind === "fiado";
}
