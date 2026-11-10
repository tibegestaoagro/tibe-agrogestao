import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { listarContasAPagarAction } from "@/lib/actions/emporio-despesas";
import { reaisBr } from "@/lib/numero-br";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { EmptyState } from "@/components/ui/empty-state";
import { ContasAPagar } from "../../_components/contas-a-pagar";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";

/** Financeiro, "A pagar": as contas do Empório em aberto, por vencimento, com pagar, adiar e cancelar. */
export default async function FinanceiroPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();
  // O Financeiro paga só pela conta bancária: a gaveta é da loja.
  const podeGaveta = pode(papel, "gestor_da_loja");

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";

  const [contasRes, caixaRes] = await Promise.all([
    listarContasAPagarAction(db, user, { status: "pending", establishment_id: loja || undefined }),
    lerCaixaAction(db, user),
  ]);
  const contas = contasRes.ok ? contasRes.data : [];
  const caixa = caixaRes.ok ? caixaRes.data : { drawers: [], accounts: [] };
  const caixasDaLoja = podeGaveta ? paraCaixasDaLoja(caixa.drawers.flatMap((d) => d.registers)) : [];
  const origens = [
    ...(podeGaveta
      ? caixa.drawers.map((d) => ({ valor: `loja:${d.establishment_id}`, rotulo: `Gaveta: ${d.name} (${reaisBr(d.balance)})` }))
      : []),
    ...caixa.accounts.map((a) => ({ valor: `conta:${a.bank_account_id}`, rotulo: `Conta: ${a.name} (${reaisBr(a.balance)})` })),
  ];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: a pagar</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Contas avulsas, das despesas fixas, do Vendeu, Pagou, dos fretes e das compras. Pagar tira o dinheiro do caixa do Empório.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/pagar" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/pagar" />

      {!contasRes.ok ? (
        <EmptyState titulo="Não foi possível ler as contas">{contasRes.message}</EmptyState>
      ) : contas.length === 0 ? (
        <EmptyState titulo="Nenhuma conta a pagar">
          As contas avulsas, das despesas fixas, do Vendeu, Pagou, dos fretes e das compras aparecem aqui até serem pagas.
        </EmptyState>
      ) : (
        <ContasAPagar
          contas={contas}
          origens={origens}
          hoje={hojeEmBrasilia()}
          caixas={caixasDaLoja}
          usuarioId={user.id}
          podeGaveta={podeGaveta}
          podeAdiarECancelar={pode(papel, "dinheiro")}
        />
      )}
    </div>
  );
}
