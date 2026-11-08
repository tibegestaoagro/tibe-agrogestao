import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import {
  aReceberPorIdadeAction,
  aPagarPorVencimentoAction,
  posicaoPorLugarAction,
} from "@/lib/actions/emporio-relatorios-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";
import {
  AReceberPorIdadeBloco,
  APagarPorVencimentoBloco,
  PosicaoPorLugarBloco,
  RelatoriosPeriodo,
} from "../../_components/financeiro-relatorios";

const DIA_MS = 86_400_000;
// Ida e volta: `2026-02-31` passa pelo regex e o V8 rola para março, então a data volta diferente.
const ehData = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const paraData = (iso: string) => new Date(`${iso}T00:00:00Z`);

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
  const deUrl = ehData(q.de) ? q.de : "";
  const ateUrl = ehData(q.ate) ? q.ate : "";
  // O a pagar olha para frente (hoje a hoje+30); a posição olha para trás (30 dias até hoje).
  const pagarDe = deUrl || hoje;
  const pagarAte = ateUrl || somarDias(pagarDe, 30);
  const posAte = ateUrl || hoje;
  const posDe = deUrl || somarDias(posAte, -29);

  const [receber, pagar, posicao] = await Promise.all([
    aReceberPorIdadeAction(db, user, { establishment_id: estab }),
    aPagarPorVencimentoAction(db, user, { establishment_id: estab, de: paraData(pagarDe), ate: paraData(pagarAte) }),
    posicaoPorLugarAction(db, user, { establishment_id: estab, de: paraData(posDe), ate: paraData(posAte) }),
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

      {receber.ok ? <AReceberPorIdadeBloco r={receber.data} /> : falhou("Não foi possível ler o a receber", receber.message)}
      {pagar.ok ? <APagarPorVencimentoBloco r={pagar.data} /> : falhou("Não foi possível ler o a pagar", pagar.message)}
      {posicao.ok ? <PosicaoPorLugarBloco r={posicao.data} /> : falhou("Não foi possível ler a posição de caixa", posicao.message)}
    </div>
  );
}
