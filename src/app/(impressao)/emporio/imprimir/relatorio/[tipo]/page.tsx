import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { dataCalendario, ehDataCalendario, somarDiasCalendario } from "@/lib/dia-calendario";
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
import {
  RelatorioEstatisticasA4,
  TITULO_DA_ESTATISTICA,
  type DadosDaEstatistica,
} from "@/components/emporio/impresso/relatorio-estatisticas-a4";
import { relatorioDeVendasAction, curvaAbcAction, podeVerLucroAction } from "@/lib/actions/emporio-relatorios";
import { resultadoPorLojaAction } from "@/lib/actions/emporio-resultado";
import { periodoDasEstatisticas } from "@/lib/emporio/estatisticas";
import { hojeEmBrasilia as hojeEmBrasiliaData } from "@/lib/emporio/cartao";
import { lerMes, mesAtualEmBrasilia, primeiroDia, textoDoMes } from "@/lib/emporio/mes";

export const metadata = { title: "Imprimir relatório" };

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
  searchParams: Promise<{ loja?: string; de?: string; ate?: string; dias?: string; medida?: string; mes?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { tipo } = await params;
  const ehEstatistica = tipo in TITULO_DA_ESTATISTICA;
  if (!ehEstatistica && !(tipo in TITULO_DO_RELATORIO)) notFound();
  const q = await searchParams;

  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, ehEstatistica ? "/emporio/estatisticas" : "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const lojaEscolhida = lojas.find((l) => l.id === q.loja);
  const estab = lojaEscolhida?.id;

  const hoje = hojeEmBrasilia();

  if (ehEstatistica) {
    const lojaTexto = lojaEscolhida ? lojaEscolhida.name : "Todas as minhas lojas";
    let dadosE: DadosDaEstatistica;
    let periodoE: string;
    if (tipo === "resultado") {
      const mes = lerMes(q.mes) ?? mesAtualEmBrasilia();
      const res = await resultadoPorLojaAction(db, user, { month: textoDoMes(mes), establishment_id: estab });
      if (!res.ok) notFound();
      dadosE = { tipo: "resultado", r: res.data };
      periodoE = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(primeiroDia(mes));
    } else {
      const p = periodoDasEstatisticas({ de: q.de, ate: q.ate }, hojeEmBrasiliaData());
      const periodoTexto = `${dmy(p.de)} a ${dmy(p.ate)}`;
      periodoE = periodoTexto;
      if (tipo === "curva-abc") {
        const lucro = q.medida === "lucro" && (await podeVerLucroAction(db, user));
        const res = await curvaAbcAction(db, user, {
          from: p.de,
          to: p.ate,
          establishment_id: estab,
          kind: "products",
          measure: lucro ? "profit" : "revenue",
        });
        if (!res.ok) notFound();
        dadosE = { tipo: "curva-abc", r: res.data };
      } else {
        const res = await relatorioDeVendasAction(db, user, { from: p.de, to: p.ate, establishment_id: estab });
        if (!res.ok) notFound();
        dadosE = tipo === "vendedores" ? { tipo: "vendedores", r: res.data.por_vendedor } : { tipo: "parados", r: res.data.parados };
      }
    }
    return (
      <main className="p-3 print:p-0">
        <div className="flex justify-center pb-3 print:hidden">
          <BotaoImprimir />
        </div>
        <RelatorioEstatisticasA4 d={dadosE} loja={lojaTexto} periodo={periodoE} emitidoEm={hoje} />
      </main>
    );
  }

  const deUrl = ehDataCalendario(q.de) ? q.de : "";
  const ateUrl = ehDataCalendario(q.ate) ? q.ate : "";
  let dados: DadosDoRelatorio;
  let periodo: string | null = null;

  if (tipo === "a-receber") {
    const res = await lerAReceberPorIdadeAction(db, user, { establishment_id: estab });
    if (res.ok) dados = { tipo, r: res.data };
    else notFound();
  } else if (tipo === "a-pagar") {
    const de = deUrl || hoje;
    const ate = ateUrl || somarDiasCalendario(de, 30);
    const res = await lerAPagarPorVencimentoAction(db, user, { establishment_id: estab, de: dataCalendario(de), ate: dataCalendario(ate) });
    if (!res.ok) notFound();
    dados = { tipo, r: res.data };
    periodo = `Vencimentos de ${dmy(de)} a ${dmy(ate)}`;
  } else if (tipo === "posicao") {
    const ate = ateUrl || hoje;
    const de = deUrl || somarDiasCalendario(ate, -29);
    const res = await lerPosicaoPorLugarAction(db, user, { establishment_id: estab, de: dataCalendario(de), ate: dataCalendario(ate) });
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
