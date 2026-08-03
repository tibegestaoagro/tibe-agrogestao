import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { TenantPrismaClient } from "@/lib/prisma";
import { getDre } from "@/lib/actions/financial-reports";
import { decToNum } from "@/lib/serialize";
import { MODULE_LABEL } from "@/lib/related-modules";

/**
 * Gera o PDF do relatório financeiro (spec 4.7): resumo do período, DRE por
 * módulo, lista de lançamentos. Chamada tanto pela interface web quanto pelo
 * agente WhatsApp (intenção `gerar_relatorio`): única fonte de verdade do
 * conteúdo do relatório.
 */

const ENTRY_LABEL: Record<string, string> = { income: "Receita", expense: "Despesa" };
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAGE_SIZE: [number, number] = [595, 842]; // A4 em pontos
const MARGIN = 50;
const LINE_HEIGHT = 15;

export async function generateFinancialPdf(
  db: TenantPrismaClient,
  params: { tenantName: string; start: Date; end: Date },
): Promise<Uint8Array> {
  const [dre, entries] = await Promise.all([
    getDre(db, { start: params.start, end: params.end }),
    db.financialEntry.findMany({
      where: { due_date: { gte: params.start, lte: params.end } },
      orderBy: { due_date: "asc" },
    }),
  ]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function writeLine(
    str: string,
    opts: { size?: number; font?: PDFFont; color?: [number, number, number] } = {},
  ) {
    if (y < MARGIN + LINE_HEIGHT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
    page.drawText(str, {
      x: MARGIN,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
    });
    y -= opts.size ? opts.size + 6 : LINE_HEIGHT;
  }

  const tibeGreen: [number, number, number] = [0.18, 0.49, 0.2];

  writeLine("Relatório Financeiro: Tibé", { size: 18, font: bold, color: tibeGreen });
  writeLine(params.tenantName, { size: 12, font: bold });
  writeLine(
    `Período: ${params.start.toLocaleDateString("pt-BR")} a ${params.end.toLocaleDateString("pt-BR")}`,
  );
  y -= 8;

  writeLine("Resumo por módulo (DRE)", { size: 13, font: bold });
  for (const m of dre.by_module) {
    writeLine(
      `${MODULE_LABEL[m.module]}: receita ${brl(m.total_income)}  ·  despesa ${brl(m.total_expense)}  ·  resultado ${brl(m.result)}`,
    );
  }
  writeLine(`Resultado total do período: ${brl(dre.total_result)}`, { size: 12, font: bold });
  y -= 8;

  writeLine(`Lançamentos do período (${entries.length})`, { size: 13, font: bold });
  if (entries.length === 0) {
    writeLine("Nenhum lançamento no período.", { size: 9 });
  }
  for (const e of entries) {
    const amount = decToNum(e.amount) ?? 0;
    const dueDate = e.due_date ? e.due_date.toLocaleDateString("pt-BR") : "sem data";
    writeLine(
      `${dueDate}  ·  ${ENTRY_LABEL[e.entry_type]}  ·  ${e.category ?? "não informado"}  ·  ${brl(amount)}  ·  ${STATUS_LABEL[e.status]}  ·  ${MODULE_LABEL[e.related_module ?? "geral"]}`,
      { size: 9 },
    );
  }

  return pdfDoc.save();
}
