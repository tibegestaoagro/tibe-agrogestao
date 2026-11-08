import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerExtratoAction, lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { ExtratoDoLugar, ExtratoPeriodo, PosicoesTabela } from "../../_components/financeiro-extrato";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";

const DIA_MS = 86_400_000;
// Ida e volta: `2026-02-31` passa pelo regex e o V8 rola para março, então a data volta diferente.
const ehData = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Financeiro, "Posição de caixa": as posições por lugar e, com `?lugar=<tipo>:<id>`, o extrato do período. */
export default async function FinanceiroCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; lugar?: string; conta?: string; de?: string; ate?: string; carimbo?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const q = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === q.loja) ? (q.loja as string) : "";
  const resumo = await lerResumoHojeAction(db, user, { establishment_id: loja || undefined });
  const posicoes = resumo.ok ? resumo.data.positions : [];

  // `?conta=<id>` segue valendo como `conta:<id>` (links antigos). Um lugar que não está na lista é ignorado.
  const pedido = q.lugar || (q.conta ? `conta:${q.conta}` : "");
  const lugarEscolhido = posicoes.find((p) => `${p.kind}:${p.id}` === pedido);
  const lugar = lugarEscolhido ? pedido : "";
  const hoje = hojeEmBrasilia();
  const ate = ehData(q.ate) ? q.ate : hoje;
  const de = ehData(q.de) ? q.de : new Date(Date.parse(`${ate}T00:00:00Z`) - 29 * DIA_MS).toISOString().slice(0, 10);
  const ehConta = lugarEscolhido?.kind === "conta";
  const soSemCarimbo = ehConta && q.carimbo === "sem";
  const extrato = lugarEscolhido
    ? await lerExtratoAction(db, user, {
        lugar: { kind: lugarEscolhido.kind, id: lugarEscolhido.id },
        de: new Date(`${de}T00:00:00Z`),
        ate: new Date(`${ate}T00:00:00Z`),
        apenas_sem_carimbo: soSemCarimbo,
      })
    : null;

  function enderecoDoExtrato(kind: string, id: string): string {
    const p = new URLSearchParams();
    if (loja) p.set("loja", loja);
    p.set("lugar", `${kind}:${id}`);
    if (q.de && ehData(q.de)) p.set("de", q.de);
    if (q.ate && ehData(q.ate)) p.set("ate", q.ate);
    if (kind === "conta" && q.carimbo === "sem") p.set("carimbo", "sem");
    return `/emporio/financeiro/caixa?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: posição de caixa</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O saldo de cada lugar é a soma dos movimentos. Escolha uma gaveta, a gerência ou uma conta para ver o extrato do período.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/caixa" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/caixa" />

      {resumo.ok ? (
        <PosicoesTabela
          posicoes={posicoes}
          total={resumo.data.total_balance}
          lugarAtual={lugar}
          enderecoDoExtrato={enderecoDoExtrato}
        />
      ) : (
        <EmptyState titulo="Não foi possível ler as posições">{resumo.message}</EmptyState>
      )}

      {lugarEscolhido && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Extrato: {lugarEscolhido.name}</h2>
          <ExtratoPeriodo
            loja={loja}
            lugar={lugar}
            de={de}
            ate={ate}
            mostrarFiltroCarimbo={ehConta}
            soSemCarimbo={soSemCarimbo}
          />
          {extrato && extrato.ok ? (
            <ExtratoDoLugar extrato={extrato.data} hoje={hoje} podeCarimbar={pode(papel, "dinheiro")} />
          ) : (
            <p role="alert" className="text-sm text-perigo-tinta">
              {extrato ? extrato.message : ""}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
