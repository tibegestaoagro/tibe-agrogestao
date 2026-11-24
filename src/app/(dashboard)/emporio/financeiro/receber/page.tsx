import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { listarAntecipacoesAction } from "@/lib/actions/emporio-antecipacao";
import { listarContasAReceberAction } from "@/lib/actions/emporio-financeiro";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { dataBr, hojeEmBrasilia as hojeIsoEmBrasilia } from "@/lib/emporio/datas";
import { periodoDaUrl } from "@/lib/emporio/periodo";
import { EmptyState } from "@/components/ui/empty-state";
import { idDoClientePadrao } from "../../_components/cliente-padrao";
import { Paginacao, paginaDaUrl } from "../../_components/paginacao";
import { PeriodoFiltro } from "../../_components/periodo-filtro";
import { RecebidosLista } from "../../_components/recebidos-lista";
import { verDoReceber } from "../../_components/recorte";
import { ResumoFaixa } from "../../_components/resumo-faixa";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { FinanceiroReceber } from "../../_components/financeiro-receber";
import { LojaFiltro } from "../../_components/loja-filtro";

const CAMINHO = "/emporio/financeiro/receber";

/** Financeiro, "A receber": fiado por cliente, cheques em carteira e cartões por data. */
export default async function FinanceiroReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; ver?: string; cheques?: string; de?: string; ate?: string; pagina_ant?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "", ver: verDaUrl, cheques: chequesDaUrl, de: deDaUrl, ate: ateDaUrl, pagina_ant: paginaAntDaUrl } = await searchParams;
  const ver = verDoReceber(verDaUrl);
  // Filtro próprio (não é um valor do ?ver=): a faixa, o fiado e os cartões ficam como estão.
  const soACompletar = chequesDaUrl === "a_completar";
  // Sem `de` e `ate` válidos, o período é Este mês (o Recebido do cartão abre nele).
  const periodo = periodoDaUrl({ de: deDaUrl, ate: ateDaUrl }, hojeEmBrasilia());
  const hoje = hojeIsoEmBrasilia();
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) redirect("/emporio");

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";

  const [dadosRes, antecipacoesRes, contasDoBanco, padraoId] = await Promise.all([
    listarContasAReceberAction(db, user, { establishment_id: loja || undefined, de: periodo.de, ate: periodo.ate }),
    // Quem não antecipa recebe a recusa de permissão: a lista fica vazia, sem erro na tela.
    listarAntecipacoesAction(db, user, {
      establishment_id: loja || undefined,
      page: paginaDaUrl(paginaAntDaUrl),
      per_page: 20,
    }),
    // Só id e nome, para escolher o destino ao depositar um cheque.
    db.bankAccount.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    idDoClientePadrao(db),
  ]);
  // Quem recebe dinheiro em espécie precisa dos caixas abertos; o Financeiro só recebe PIX.
  const caixas = pode(papel, "vendedor_da_loja") ? paraCaixasDaLoja(await viewsDosCaixas(db, lojas.map((l) => l.id))) : [];
  const lojasDoRecebimento = loja ? lojas.filter((l) => l.id === loja) : lojas;

  // Os demais parâmetros da tela seguem como vieram; só a página das antecipações muda.
  function hrefDaAntecipacao(n: number): string {
    const p = new URLSearchParams();
    if (loja) p.set("loja", loja);
    if (ver) p.set("ver", ver);
    if (deDaUrl) p.set("de", deDaUrl);
    if (ateDaUrl) p.set("ate", ateDaUrl);
    if (n > 1) p.set("pagina_ant", String(n));
    const texto = p.toString();
    return texto ? `${CAMINHO}?${texto}` : CAMINHO;
  }

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="A receber"
        caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}
        ajuda="O que ainda vai entrar: fiado, cheques, boletos e parcelas de cartão."
      />

      <FinanceiroAbas atual="/emporio/financeiro/receber" loja={loja} />
      <LojaFiltro
        lojas={lojas}
        loja={loja}
        caminho="/emporio/financeiro/receber"
        preservar={{ ver: ver ?? undefined, cheques: soACompletar ? "a_completar" : undefined, de: deDaUrl, ate: ateDaUrl }}
      />

      {dadosRes.ok && (
        <ResumoFaixa
          ativo={ver}
          caminho={CAMINHO}
          params={{ loja, de: periodo.de, ate: periodo.ate }}
          cartoes={[
            { chave: "vencido", rotulo: "Vencido", ...dadosRes.data.summary.overdue, alerta: true },
            { chave: "hoje", rotulo: "Vence hoje", ...dadosRes.data.summary.due_today },
            { chave: "a_vencer", rotulo: "A vencer", ...dadosRes.data.summary.upcoming },
            {
              chave: "recebido",
              rotulo: "Recebido no período",
              total: dadosRes.data.summary.received.total,
              count: dadosRes.data.summary.received.count,
              nota:
                dadosRes.data.summary.received.expected_pct === null
                  ? undefined
                  : `${dadosRes.data.summary.received.expected_pct}% do previsto`,
            },
          ]}
        />
      )}
      <PeriodoFiltro caminho={CAMINHO} de={periodo.de} ate={periodo.ate} extras={{ loja, ver: ver ?? undefined }} />

      {!dadosRes.ok ? (
        <EmptyState titulo="Não foi possível ler o que receber">{dadosRes.message}</EmptyState>
      ) : ver === "recebido" ? (
        <RecebidosLista
          itens={dadosRes.data.received_items}
          padraoId={padraoId}
          periodo={`De ${dataBr(periodo.de)} a ${dataBr(periodo.ate)}.`}
        />
      ) : (
        <FinanceiroReceber
          ver={ver}
          soACompletar={soACompletar}
          loja={loja}
          hoje={hoje}
          padraoId={padraoId}
          dados={dadosRes.data}
          papel={papel}
          lojas={lojasDoRecebimento}
          caixas={caixas}
          contasDoBanco={contasDoBanco}
          usuarioId={user.id}
          antecipacoes={antecipacoesRes.ok ? antecipacoesRes.data.linhas : []}
          paginacaoAntecipacoes={
            antecipacoesRes.ok ? (
              <Paginacao
                page={antecipacoesRes.data.page}
                perPage={antecipacoesRes.data.per_page}
                total={antecipacoesRes.data.total}
                hrefDe={hrefDaAntecipacao}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}
