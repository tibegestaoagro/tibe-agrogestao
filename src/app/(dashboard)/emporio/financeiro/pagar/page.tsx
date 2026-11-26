import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import {
  listarContasAPagarAction,
  listarDespesasFixasAction,
  listarRegrasVariaveisAction,
  resumoDoAPagarAction,
} from "@/lib/actions/emporio-despesas";
import { reaisBr } from "@/lib/numero-br";
import { dataBr, hojeEmBrasilia } from "@/lib/emporio/datas";
import { hojeEmBrasilia as hojeDeBrasilia } from "@/lib/emporio/cartao";
import { periodoDaUrl } from "@/lib/emporio/periodo";
import { abaDoPagar } from "@/lib/emporio/dinheiro-telas";
import { mesAtualEmBrasilia, textoDoMes } from "@/lib/emporio/mes";
import { normalizar } from "@/lib/emporio/vendeu-pagou";
import { EmptyState } from "@/components/ui/empty-state";
import { PagosLista } from "../../_components/pagos-lista";
import { PeriodoFiltro } from "../../_components/periodo-filtro";
import { noRecorte, verDoPagar } from "../../_components/recorte";
import { ResumoFaixa } from "../../_components/resumo-faixa";
import { ContasAPagar } from "../../_components/contas-a-pagar";
import { ContaAvulsaForm } from "../../_components/conta-avulsa-form";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { AbasDaTela } from "../../_components/abas-da-tela";
import { DespesasFixasSecao } from "../../_components/despesas-fixas-secao";
import { VendeuPagouSecao } from "../../_components/vendeu-pagou-secao";
import { LojaFiltro } from "../../_components/loja-filtro";
import { opcoesDeMes } from "../../_components/meses";

const CAMINHO = "/emporio/financeiro/pagar";

/** Financeiro, "A pagar": as contas, as despesas fixas e as regras do Vendeu, Pagou, em abas. */
export default async function FinanceiroPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; ver?: string; de?: string; ate?: string; aba?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "", ver: verDaUrl, de: deDaUrl, ate: ateDaUrl, aba: abaDaUrl } = await searchParams;
  const aba = abaDoPagar(abaDaUrl);
  const ver = verDoPagar(verDaUrl);
  // Sem `de` e `ate` válidos, o período é Este mês (o Pago abre nele).
  const periodo = periodoDaUrl({ de: deDaUrl, ate: ateDaUrl }, hojeDeBrasilia());
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, CAMINHO)) redirect("/emporio");
  // O Financeiro paga só pela conta bancária: a gaveta é da loja.
  const podeGaveta = pode(papel, "gestor_da_loja");
  // Os critérios automáticos da despesa fixa são de quem vê todas as lojas (o servidor recusa os demais).
  const podeAutomatico = papel.lojas === null;

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";

  const hrefDaAba = (valor: string) => {
    const q = new URLSearchParams();
    if (valor !== "contas") q.set("aba", valor);
    if (loja) q.set("loja", loja);
    const qs = q.toString();
    return qs ? `${CAMINHO}?${qs}` : CAMINHO;
  };
  const abas = (
    <AbasDaTela
      rotulo="Abas do A pagar"
      atual={aba}
      abas={[
        { valor: "contas", rotulo: "Contas", href: hrefDaAba("contas") },
        { valor: "fixas", rotulo: "Despesas fixas", href: hrefDaAba("fixas") },
        { valor: "vendeu_pagou", rotulo: "Vendeu, Pagou", href: hrefDaAba("vendeu_pagou") },
      ]}
    />
  );
  const cabecalho = (
    <CabecalhoDaTela
      titulo="A pagar"
      caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}
      ajuda="Contas avulsas, das despesas fixas, do Vendeu, Pagou, dos fretes e das compras."
    >
      Pagar tira o dinheiro do caixa do Empório.
    </CabecalhoDaTela>
  );

  if (aba === "fixas") {
    const fixasRes = await listarDespesasFixasAction(db, user);
    const atual = mesAtualEmBrasilia();
    return (
      <div className="space-y-6">
        {cabecalho}
        {abas}
        <DespesasFixasSecao
          fixas={fixasRes.ok ? fixasRes.data : []}
          lojas={lojas}
          podeAutomatico={podeAutomatico}
          mesesDeInicio={opcoesDeMes(atual, 3, 11)}
          mesAtual={textoDoMes(atual)}
        />
      </div>
    );
  }

  if (aba === "vendeu_pagou") {
    const [regrasRes, produtosDb] = await Promise.all([
      listarRegrasVariaveisAction(db, user),
      db.emporioProduct.findMany({
        select: {
          id: true,
          archived_at: true,
          product: { select: { name: true } },
          presentations: { where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
      }),
    ]);
    const todosProdutos = produtosDb.map((p) => ({
      id: p.id,
      name: p.product.name,
      presentations: p.presentations,
      arquivado: !!p.archived_at,
    }));
    const produtosAtivos = todosProdutos.filter((p) => !p.arquivado).map(({ arquivado: _a, ...p }) => p);
    // Q292: os nomes de apresentação distintos (sem caixa, acento e espaço), com em quantos produtos aparecem.
    const grupos = new Map<string, { grafias: Map<string, number>; produtos: Set<string> }>();
    for (const p of produtosAtivos) {
      for (const a of p.presentations) {
        const chave = normalizar(a.name);
        if (!chave) continue;
        const g = grupos.get(chave) ?? { grafias: new Map<string, number>(), produtos: new Set<string>() };
        const grafia = a.name.trim();
        g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1);
        g.produtos.add(p.id);
        grupos.set(chave, g);
      }
    }
    const nomesDeApresentacao = [...grupos.values()]
      .map((g) => ({
        nome: [...g.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0],
        produtos: g.produtos.size,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return (
      <div className="space-y-6">
        {cabecalho}
        {abas}
        <VendeuPagouSecao
          regras={regrasRes.ok ? regrasRes.data : []}
          lojas={lojas}
          produtos={produtosAtivos}
          nomesDeApresentacao={nomesDeApresentacao}
          nomeDoProduto={new Map(todosProdutos.map((p) => [p.id, p.name]))}
          nomeDaApresentacao={new Map(todosProdutos.flatMap((p) => p.presentations.map((a) => [a.id, a.name] as const)))}
        />
      </div>
    );
  }

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
      {cabecalho}
      {abas}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-texto">Contas a pagar</h2>
        <ContaAvulsaForm lojas={lojas} origens={origens} caixas={caixasDaLoja} usuarioId={user.id} hoje={hojeIso} />
      </div>

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
