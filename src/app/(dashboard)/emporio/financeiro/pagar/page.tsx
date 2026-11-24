import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { listarContasAPagarAction, resumoDoAPagarAction } from "@/lib/actions/emporio-despesas";
import { reaisBr } from "@/lib/numero-br";
import { dataBr, hojeEmBrasilia } from "@/lib/emporio/datas";
import { hojeEmBrasilia as hojeDeBrasilia } from "@/lib/emporio/cartao";
import { periodoDaUrl } from "@/lib/emporio/periodo";
import { EmptyState } from "@/components/ui/empty-state";
import { PagosLista } from "../../_components/pagos-lista";
import { PeriodoFiltro } from "../../_components/periodo-filtro";
import { noRecorte, verDoPagar } from "../../_components/recorte";
import { ResumoFaixa } from "../../_components/resumo-faixa";
import { ContasAPagar } from "../../_components/contas-a-pagar";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";

const CAMINHO = "/emporio/financeiro/pagar";

/** Financeiro, "A pagar": as contas do Empório em aberto, por vencimento, com pagar, adiar e cancelar. */
export default async function FinanceiroPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; ver?: string; de?: string; ate?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "", ver: verDaUrl, de: deDaUrl, ate: ateDaUrl } = await searchParams;
  const ver = verDoPagar(verDaUrl);
  // Sem `de` e `ate` válidos, o período é Este mês (o Pago abre nele).
  const periodo = periodoDaUrl({ de: deDaUrl, ate: ateDaUrl }, hojeDeBrasilia());
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) redirect("/emporio");
  // O Financeiro paga só pela conta bancária: a gaveta é da loja.
  const podeGaveta = pode(papel, "gestor_da_loja");

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";

  const [contasRes, caixaRes, resumoRes] = await Promise.all([
    listarContasAPagarAction(db, user, { status: "pending", establishment_id: loja || undefined }),
    lerCaixaAction(db, user),
    resumoDoAPagarAction(db, user, { establishment_id: loja || undefined, de: periodo.de, ate: periodo.ate }),
  ]);
  const hojeIso = hojeEmBrasilia();
  const todasAsContas = contasRes.ok ? contasRes.data : [];
  const contas = ver && ver !== "pago" ? todasAsContas.filter((c) => noRecorte(ver, hojeIso, c.due_date)) : todasAsContas;
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
      <CabecalhoDaTela
        titulo="A pagar"
        caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}
        ajuda="Contas avulsas, das despesas fixas, do Vendeu, Pagou, dos fretes e das compras."
      >
        Pagar tira o dinheiro do caixa do Empório.
      </CabecalhoDaTela>

      <FinanceiroAbas atual="/emporio/financeiro/pagar" loja={loja} />
      <LojaFiltro
        lojas={lojas}
        loja={loja}
        caminho={CAMINHO}
        preservar={{ ver: ver ?? undefined, de: deDaUrl, ate: ateDaUrl }}
      />

      {resumoRes.ok && (
        <ResumoFaixa
          ativo={ver}
          caminho={CAMINHO}
          params={{ loja, de: periodo.de, ate: periodo.ate }}
          cartoes={[
            { chave: "vencida", rotulo: "Vencida", ...resumoRes.data.summary.overdue, alerta: true },
            { chave: "hoje", rotulo: "Vence hoje", ...resumoRes.data.summary.due_today },
            {
              chave: "a_vencer",
              rotulo: "A vencer",
              total: resumoRes.data.summary.upcoming.total,
              count: resumoRes.data.summary.upcoming.count,
              nota:
                resumoRes.data.summary.upcoming.undated_count > 0
                  ? `${resumoRes.data.summary.upcoming.undated_count} sem vencimento`
                  : undefined,
            },
            {
              chave: "pago",
              rotulo: "Pago no período",
              total: resumoRes.data.summary.paid.total,
              count: resumoRes.data.summary.paid.count,
              nota:
                resumoRes.data.summary.paid.expected_pct === null
                  ? undefined
                  : `${resumoRes.data.summary.paid.expected_pct}% do previsto`,
            },
          ]}
        />
      )}
      <PeriodoFiltro caminho={CAMINHO} de={periodo.de} ate={periodo.ate} extras={{ loja, ver: ver ?? undefined }} />

      {ver === "pago" ? (
        resumoRes.ok ? (
          <PagosLista itens={resumoRes.data.paid_items} periodo={`De ${dataBr(periodo.de)} a ${dataBr(periodo.ate)}.`} />
        ) : (
          <EmptyState titulo="Não foi possível ler os pagamentos">{resumoRes.message}</EmptyState>
        )
      ) : !contasRes.ok ? (
        <EmptyState titulo="Não foi possível ler as contas">{contasRes.message}</EmptyState>
      ) : contas.length === 0 ? (
        <EmptyState titulo={ver ? "Nenhuma conta neste recorte" : "Nenhuma conta a pagar"}>
          {ver
            ? "Nenhuma conta pendente tem esse vencimento. Use Ver tudo para voltar."
            : "As contas avulsas, das despesas fixas, do Vendeu, Pagou, dos fretes e das compras aparecem aqui até serem pagas."}
        </EmptyState>
      ) : (
        <ContasAPagar
          contas={contas}
          origens={origens}
          hoje={hojeIso}
          caixas={caixasDaLoja}
          usuarioId={user.id}
          podeGaveta={podeGaveta}
          podeAdiarECancelar={pode(papel, "dinheiro")}
        />
      )}
    </div>
  );
}
