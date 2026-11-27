import type { TenantPrismaClient } from "@/lib/prisma";
import { podeVerLucroAction } from "@/lib/actions/emporio-relatorios";
import { mesDoPeriodo } from "@/lib/emporio/estatisticas";
import { somarDiasCalendario } from "@/lib/dia-calendario";
import { Button } from "@/components/ui/button";
import { consulta } from "./relatorio-acoes";

const IMPRIMIR = "/emporio/imprimir/relatorio";
const FINANCEIRO = "/api/v1/emporio/finance/reports";

type Relatorio = { titulo: string; frase: string; csvHref: string; imprimirHref: string };

function Grupo({ titulo, relatorios }: { titulo: string; relatorios: Relatorio[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
        {relatorios.map((r) => (
          <li key={r.titulo} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-texto">{r.titulo}</p>
              <p className="text-sm text-texto-secundario">{r.frase}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={r.imprimirHref} target="_blank" rel="noopener">
                  Imprimir ou PDF
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={r.csvHref} download>
                  Planilha
                </a>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A aba Relatórios para imprimir: os oito relatórios, cada um com a folha (nova aba) e a planilha.
 * Vendas e Resultado valem para quem chega à tela; Dinheiro só para quem vê o dinheiro.
 * Sem `loja`, vale "todas as minhas lojas": as rotas e as folhas já aplicam o alcance.
 */
export async function EstatisticasImprimir({
  db,
  user,
  hoje,
  de,
  ate,
  loja,
  medida,
  podeDinheiro,
}: {
  db: TenantPrismaClient;
  user: Parameters<typeof podeVerLucroAction>[1];
  /** "AAAA-MM-DD" de hoje em Brasília. */
  hoje: string;
  de: string;
  ate: string;
  /** Vazio: todas as lojas ao alcance. */
  loja: string;
  /** A medida da curva ABC na aba Vendas ("lucro" ou outra coisa). */
  medida: string;
  podeDinheiro: boolean;
}) {
  const estab = loja || undefined;
  const lucro = medida === "lucro" && (await podeVerLucroAction(db, user));
  const mes = mesDoPeriodo(ate);
  const pagarAte = somarDiasCalendario(hoje, 30);

  const vendas: Relatorio[] = [
    {
      titulo: "Curva ABC de produtos",
      frase: "Quem mais pesa no faturamento ou no lucro, no período",
      csvHref: `/api/v1/emporio/reports/abc${consulta({ from: de, to: ate, establishment_id: estab, kind: "products", measure: lucro ? "profit" : "revenue", format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/curva-abc${consulta({ de, ate, loja: estab, medida: lucro ? "lucro" : undefined })}`,
    },
    {
      titulo: "Vendas por vendedor",
      frase: "Para conferir comissão",
      csvHref: `/api/v1/emporio/reports/sales${consulta({ from: de, to: ate, establishment_id: estab, relatorio: "vendedores", format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/vendedores${consulta({ de, ate, loja: estab })}`,
    },
    {
      titulo: "Produtos parados",
      frase: "O que não vendeu no período, loja por loja",
      csvHref: `/api/v1/emporio/reports/sales${consulta({ from: de, to: ate, establishment_id: estab, relatorio: "parados", format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/parados${consulta({ de, ate, loja: estab })}`,
    },
  ];

  const dinheiro: Relatorio[] = [
    {
      titulo: "A receber por idade",
      frase: "Fiado, cheques, boletos e cartões, por faixa de atraso",
      csvHref: `${FINANCEIRO}/receivables-aging${consulta({ establishment_id: estab, format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/a-receber${consulta({ loja: estab })}`,
    },
    {
      titulo: "A pagar por vencimento",
      frase: "O que vence em cada semana, nos próximos 30 dias",
      csvHref: `${FINANCEIRO}/payables-by-due${consulta({ establishment_id: estab, de: hoje, ate: pagarAte, format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/a-pagar${consulta({ loja: estab, de: hoje, ate: pagarAte })}`,
    },
    {
      titulo: "Posição de caixa",
      frase: "Saldo de cada gaveta, gerência e conta, no período",
      csvHref: `${FINANCEIRO}/cash-by-place${consulta({ establishment_id: estab, de, ate, format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/posicao${consulta({ loja: estab, de, ate })}`,
    },
    {
      titulo: "Fluxo projetado",
      frase: "O que entra e sai nos próximos 30 dias",
      csvHref: `/api/v1/emporio/finance/projection${consulta({ establishment_id: estab, days: 30, format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/projecao${consulta({ loja: estab, dias: 30 })}`,
    },
  ];

  const resultado: Relatorio[] = [
    {
      titulo: "Resultado do mês por loja",
      frase: "Vendas, margem, despesas fixas, perdas e resultado",
      csvHref: `/api/v1/emporio/result/stores${consulta({ month: mes, establishment_id: estab, format: "csv" })}`,
      imprimirHref: `${IMPRIMIR}/resultado${consulta({ mes, loja: estab })}`,
    },
  ];

  return (
    <div className="space-y-6">
      <Grupo titulo="Vendas" relatorios={vendas} />
      {podeDinheiro ? <Grupo titulo="Dinheiro" relatorios={dinheiro} /> : null}
      <Grupo titulo="Resultado" relatorios={resultado} />
    </div>
  );
}
