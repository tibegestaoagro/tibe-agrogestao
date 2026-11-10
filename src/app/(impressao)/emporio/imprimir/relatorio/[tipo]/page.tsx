import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import {
  lerAReceberPorIdadeAction,
  lerAPagarPorVencimentoAction,
  lerPosicaoPorLugarAction,
} from "@/lib/actions/emporio-relatorios-financeiro";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import {
  RelatorioFinanceiroA4,
  TITULO_DO_RELATORIO,
  type DadosDoRelatorio,
} from "@/components/emporio/impresso/relatorio-financeiro-a4";
import { BotaoImprimir } from "@/components/emporio/impresso/botao-imprimir";

export const metadata = { title: "Imprimir relatório" };

const DIA_MS = 86_400_000;
// Ida e volta: `2026-02-31` passa pelo regex e o V8 rola para março, então a data volta diferente.
const ehData = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const paraData = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * `/emporio/imprimir/relatorio/<tipo>?loja=&de=&ate=&dias=`: a mesma leitura das
 * telas do Financeiro, com o mesmo acesso, numa folha A4. Nunca imprime sozinha.
 */
export default async function ImprimirRelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ loja?: string; de?: string; ate?: string; dias?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { tipo } = await params;
  if (!(tipo in TITULO_DO_RELATORIO)) notFound();
  const q = await searchParams;

  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const lojaEscolhida = lojas.find((l) => l.id === q.loja);
  const estab = lojaEscolhida?.id;

  const hoje = hojeEmBrasilia();
  const deUrl = ehData(q.de) ? q.de : "";
  const ateUrl = ehData(q.ate) ? q.ate : "";
  let dados: DadosDoRelatorio;
  let periodo: string | null = null;

  if (tipo === "a-receber") {
    const res = await lerAReceberPorIdadeAction(db, user, { establishment_id: estab });
    if (res.ok) dados = { tipo, r: res.data };
    else notFound();
  } else if (tipo === "a-pagar") {
    const de = deUrl || hoje;
    const ate = ateUrl || somarDias(de, 30);
    const res = await lerAPagarPorVencimentoAction(db, user, { establishment_id: estab, de: paraData(de), ate: paraData(ate) });
    if (!res.ok) notFound();
    dados = { tipo, r: res.data };
    periodo = `Vencimentos de ${dmy(de)} a ${dmy(ate)}`;
  } else if (tipo === "posicao") {
    const ate = ateUrl || hoje;
    const de = deUrl || somarDias(ate, -29);
    const res = await lerPosicaoPorLugarAction(db, user, { establishment_id: estab, de: paraData(de), ate: paraData(ate) });
    if (!res.ok) notFound();
    dados = { tipo, r: res.data };
    periodo = `Movimento de ${dmy(de)} a ${dmy(ate)}`;
  } else {
    const dias = q.dias === "60" ? 60 : q.dias === "90" ? 90 : 30;
    const res = await lerFluxoProjetadoAction(db, user, { establishment_id: estab, days: dias });
    if (!res.ok) notFound();
    dados = { tipo: "projecao", r: res.data };
    periodo = `Próximos ${dias} dias`;
  }

  return (
    <main className="p-3 print:p-0">
      <div className="flex justify-center pb-3 print:hidden">
        <BotaoImprimir />
      </div>
      <RelatorioFinanceiroA4 d={dados} loja={lojaEscolhida ? lojaEscolhida.name : "Todas as lojas"} periodo={periodo} emitidoEm={hoje} />
    </main>
  );
}
