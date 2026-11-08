import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerExtratoDaContaAction, lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { ExtratoDaConta, ExtratoPeriodo, PosicoesTabela } from "../../_components/financeiro-extrato";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";

const DIA_MS = 86_400_000;
const ehData = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Financeiro, "Posição de caixa": as posições por lugar e, com `?conta=`, o extrato do período. */
export default async function FinanceiroCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; conta?: string; de?: string; ate?: string }>;
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

  // O extrato é de uma conta bancária; um `?conta=` que não está na lista é ignorado.
  const conta = posicoes.some((p) => p.kind === "conta" && p.id === q.conta) ? (q.conta as string) : "";
  const hoje = hojeEmBrasilia();
  const ate = ehData(q.ate) ? q.ate : hoje;
  const de = ehData(q.de) ? q.de : new Date(Date.parse(`${ate}T00:00:00Z`) - 29 * DIA_MS).toISOString().slice(0, 10);
  const extrato = conta
    ? await lerExtratoDaContaAction(db, user, {
        bank_account_id: conta,
        de: new Date(`${de}T00:00:00Z`),
        ate: new Date(`${ate}T00:00:00Z`),
      })
    : null;

  function enderecoDoExtrato(contaId: string): string {
    const p = new URLSearchParams();
    if (loja) p.set("loja", loja);
    p.set("conta", contaId);
    return `/emporio/financeiro/caixa?${p.toString()}`;
  }

  const nomeDaConta = posicoes.find((p) => p.kind === "conta" && p.id === conta)?.name;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: posição de caixa</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O saldo de cada lugar é a soma dos movimentos. Escolha uma conta para ver o extrato do período.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/caixa" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/caixa" />

      {resumo.ok ? (
        <PosicoesTabela
          posicoes={posicoes}
          total={resumo.data.total_balance}
          contaAtual={conta}
          enderecoDoExtrato={enderecoDoExtrato}
        />
      ) : (
        <EmptyState titulo="Não foi possível ler as posições">{resumo.message}</EmptyState>
      )}

      {conta && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Extrato: {nomeDaConta}</h2>
          <ExtratoPeriodo loja={loja} conta={conta} de={de} ate={ate} />
          {extrato && extrato.ok ? (
            <ExtratoDaConta extrato={extrato.data} hoje={hoje} />
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
