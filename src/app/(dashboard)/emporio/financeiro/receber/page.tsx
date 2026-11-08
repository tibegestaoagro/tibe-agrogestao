import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { listarContasAReceberAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { FinanceiroReceber } from "../../_components/financeiro-receber";
import { LojaFiltro } from "../../_components/loja-filtro";

/** Financeiro, "A receber": fiado por cliente, cheques em carteira e cartões por data. */
export default async function FinanceiroReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";

  const [dadosRes, contasDoBanco] = await Promise.all([
    listarContasAReceberAction(db, user, { establishment_id: loja || undefined }),
    // Só id e nome, para escolher o destino ao depositar um cheque.
    db.bankAccount.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Quem recebe dinheiro em espécie precisa dos caixas abertos; o Financeiro só recebe PIX.
  const caixas = pode(papel, "vendedor_da_loja") ? paraCaixasDaLoja(await viewsDosCaixas(db, lojas.map((l) => l.id))) : [];
  const lojasDoRecebimento = loja ? lojas.filter((l) => l.id === loja) : lojas;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: a receber</h1>
        <p className="mt-1 text-sm text-texto-secundario">O que ainda vai entrar: fiado, cheques e parcelas de cartão.</p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/receber" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/receber" />

      {dadosRes.ok ? (
        <FinanceiroReceber
          dados={dadosRes.data}
          papel={papel}
          lojas={lojasDoRecebimento}
          caixas={caixas}
          contasDoBanco={contasDoBanco}
          usuarioId={user.id}
        />
      ) : (
        <EmptyState titulo="Não foi possível ler o que receber">{dadosRes.message}</EmptyState>
      )}
    </div>
  );
}
