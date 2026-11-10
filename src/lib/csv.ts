/**
 * CSV brasileiro para o Excel (Q269): BOM no início, `;` como separador, vírgula decimal sem milhar,
 * datas DD/MM/AAAA (dia de Brasília) e `\r\n` entre as linhas. Campo com `;`, aspas ou quebra de linha
 * vai entre aspas duplas, com as aspas internas dobradas.
 */

export type ColunaCsv<T> = { titulo: string; valor: (linha: T) => string | number | Date | null };

const BOM = "﻿";
const FIM_DE_LINHA = "\r\n";

const diaEmBrasilia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/** O dia de Brasília de um instante, como AAAA-MM-DD. */
export function diaIsoEmBrasilia(d: Date): string {
  return diaEmBrasilia.format(d);
}

/** `AAAA-MM-DD` vira `DD/MM/AAAA` (só troca a ordem: não há fuso num dia de calendário). */
export function diaBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function textoDoValor(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : diaBr(diaIsoEmBrasilia(v));
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "";
  // Texto que começa como fórmula não pode ser executado pela planilha.
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function campo(v: string | number | Date | null | undefined): string {
  const t = textoDoValor(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((c) => campo(c.titulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => campo(c.valor(l))).join(";"));
  return BOM + [cabecalho, ...corpo].join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

/** A resposta de download. `hoje` dá o dia (de Brasília) do nome do arquivo. */
export function respostaCsv(conteudo: string, nomeBase: string, hoje: Date): Response {
  return new Response(conteudo, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeBase}-${diaIsoEmBrasilia(hoje)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
