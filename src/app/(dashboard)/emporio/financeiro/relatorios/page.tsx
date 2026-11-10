import Link from "next/link";
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
import { EmptyState } from "@/components/ui/empty-state";
import { RelatorioAcoes, consulta } from "../../_components/relatorio-acoes";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";
import {
  AReceberPorIdadeBloco,
  APagarPorVencimentoBloco,
  PosicaoPorLugarBloco,
  RelatoriosPeriodo,
} from "../../_components/financeiro-relatorios";

const API = "/api/v1/emporio/finance/reports";
const IMPRIMIR = "/emporio/imprimir/relatorio";
/** Financeiro, "Relatórios": a receber por idade, a pagar por vencimento e a posição de caixa por lugar. Só leitura. */
export default async function FinanceiroRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; de?: string; ate?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const q = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === q.loja) ? (q.loja as string) : "";
  const estab = loja || undefined;

  const hoje = hojeEmBrasilia();
  const deUrl = ehDataCalendario(q.de) ? q.de : "";
  const ateUrl = ehDataCalendario(q.ate) ? q.ate : "";
  // O a pagar olha para frente (hoje a hoje+30); a posição olha para trás (30 dias até hoje).
  const pagarDe = deUrl || hoje;
  const pagarAte = ateUrl || somarDiasCalendario(pagarDe, 30);
  const posAte = ateUrl || hoje;
  const posDe = deUrl || somarDiasCalendario(posAte, -29);

  const [receber, pagar, posicao] = await Promise.all([
    lerAReceberPorIdadeAction(db, user, { establishment_id: estab }),
    lerAPagarPorVencimentoAction(db, user, { establishment_id: estab, de: dataCalendario(pagarDe), ate: dataCalendario(pagarAte) }),
    lerPosicaoPorLugarAction(db, user, { establishment_id: estab, de: dataCalendario(posDe), ate: dataCalendario(posAte) }),
  ]);

  const falhou = (titulo: string, message: string) => <EmptyState titulo={titulo}>{message}</EmptyState>;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: relatórios</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Sem período, o a pagar mostra os próximos 30 dias e a posição de caixa, os últimos 30.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/relatorios" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/relatorios" />
      <RelatoriosPeriodo loja={loja} de={deUrl} ate={ateUrl} />

      {receber.ok ? (
        <>
          <RelatorioAcoes
            csvHref={`${API}/receivables-aging${consulta({ establishment_id: estab, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/a-receber${consulta({ loja: estab })}`}
          />
          <AReceberPorIdadeBloco r={receber.data} />
        </>
      ) : (
        falhou("Não foi possível ler o a receber", receber.message)
      )}
      {pagar.ok ? (
        <>
          <RelatorioAcoes
            csvHref={`${API}/payables-by-due${consulta({ establishment_id: estab, de: pagarDe, ate: pagarAte, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/a-pagar${consulta({ loja: estab, de: pagarDe, ate: pagarAte })}`}
          />
          <APagarPorVencimentoBloco r={pagar.data} />
        </>
      ) : (
        falhou("Não foi possível ler o a pagar", pagar.message)
      )}
      {posicao.ok ? (
        <>
          <RelatorioAcoes
            csvHref={`${API}/cash-by-place${consulta({ establishment_id: estab, de: posDe, ate: posAte, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/posicao${consulta({ loja: estab, de: posDe, ate: posAte })}`}
          />
          <PosicaoPorLugarBloco r={posicao.data} />
        </>
      ) : (
        falhou("Não foi possível ler a posição de caixa", posicao.message)
      )}
    </div>
  );
}
