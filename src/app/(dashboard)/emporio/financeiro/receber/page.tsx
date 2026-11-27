import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { lerLojaDoTopo } from "@/lib/emporio/loja-do-topo-servidor";
import { viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { listarAntecipacoesAction } from "@/lib/actions/emporio-antecipacao";
import { listarContasAReceberAction } from "@/lib/actions/emporio-financeiro";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { dataBr, hojeEmBrasilia as hojeIsoEmBrasilia } from "@/lib/emporio/datas";
import { periodoDaUrl } from "@/lib/emporio/periodo";
import { abaDoReceber } from "@/lib/emporio/dinheiro-telas";
import { FAIXAS_DE_COBRANCA, listarCobrancaAction, type FaixaDeCobranca } from "@/lib/actions/emporio-credito";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { idDoClientePadrao } from "../../_components/cliente-padrao";
import { Paginacao, paginaDaUrl } from "../../_components/paginacao";
import { PeriodoFiltro } from "../../_components/periodo-filtro";
import { RecebidosLista } from "../../_components/recebidos-lista";
import { totalDaAbaCartoes, valorDoFiadoNoRecorte, verDoReceber } from "../../_components/recorte";
import { ResumoFaixa } from "../../_components/resumo-faixa";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { AbasDaTela } from "../../_components/abas-da-tela";
import { FaixaFiltro, FinanceiroCobranca } from "../../_components/financeiro-cobranca";
import { FinanceiroReceber, recortarReceber } from "../../_components/financeiro-receber";

const CAMINHO = "/emporio/financeiro/receber";

/** Financeiro, "A receber": fiado por cliente, cheques em carteira e cartões por data. */
export default async function FinanceiroReceberPage({
  searchParams,
}: {
  searchParams: Promise<{
    loja?: string;
    ver?: string;
    cheques?: string;
    de?: string;
    ate?: string;
    pagina_ant?: string;
    aba?: string;
    faixa?: string;
  }>;
}) {
  const user = await requireFeaturePage("emporio");
  const {
    loja: lojaDaUrl = "",
    ver: verDaUrl,
    cheques: chequesDaUrl,
    de: deDaUrl,
    ate: ateDaUrl,
    pagina_ant: paginaAntDaUrl,
    aba: abaDaUrl,
    faixa: faixaDaUrl = "",
  } = await searchParams;
  const ver = verDoReceber(verDaUrl);
  const aba = abaDoReceber(abaDaUrl, chequesDaUrl);
  const faixa = (FAIXAS_DE_COBRANCA as readonly string[]).includes(faixaDaUrl) ? (faixaDaUrl as FaixaDeCobranca) : "";
  // Filtro próprio (não é um valor do ?ver=): a faixa, o fiado e os cartões ficam como estão.
  const soACompletar = chequesDaUrl === "a_completar";
  // Sem `de` e `ate` válidos, o período é Este mês (o Recebido do cartão abre nele).
  const periodo = periodoDaUrl({ de: deDaUrl, ate: ateDaUrl }, hojeEmBrasilia());
  const hoje = hojeIsoEmBrasilia();
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) redirect("/emporio");

  const { lojas, loja } = await lerLojaDoTopo(db, user, lojaDaUrl);

  const [dadosRes, cobrancaRes, antecipacoesRes, contasDoBanco, padraoId] = await Promise.all([
    listarContasAReceberAction(db, user, { establishment_id: loja || undefined, de: periodo.de, ate: periodo.ate }),
    // A aba Vencidos (a antiga Cobrança) não usa o recorte; a leitura é barata e dá o total do título da aba.
    listarCobrancaAction(db, user, { establishment_id: loja || undefined, faixa: faixa || undefined }),
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
    const p = new URLSearchParams({ aba: "cartoes" });
    if (ver) p.set("ver", ver);
    if (deDaUrl) p.set("de", deDaUrl);
    if (ateDaUrl) p.set("ate", ateDaUrl);
    if (n > 1) p.set("pagina_ant", String(n));
    const texto = p.toString();
    return texto ? `${CAMINHO}?${texto}` : CAMINHO;
  }

  // O recorte da faixa filtra a aba aberta, e o título de cada aba soma o que ela lista (o mesmo recorte das listas).
  const verRecorte = ver === "recebido" ? null : ver;
  const recortado = dadosRes.ok ? recortarReceber(dadosRes.data, verRecorte, hoje, soACompletar && aba === "cheques") : null;
  const soma = (xs: number[]) => xs.reduce((t, x) => t + Math.round(x * 100), 0) / 100;
  const totais: Record<string, number | null> = {
    fiado: recortado ? soma(recortado.fiado.map((c) => valorDoFiadoNoRecorte(c, verRecorte))) : null,
    cheques: recortado ? soma(recortado.cheques.map((c) => c.amount)) : null,
    boletos: recortado ? soma(recortado.boletos.map((b) => b.amount)) : null,
    cartoes: recortado ? totalDaAbaCartoes(recortado.cartoes) : null,
    vencidos: cobrancaRes.ok ? soma(cobrancaRes.data.customers.map((c) => c.overdue_total)) : null,
  };
  const abaParam = aba === "fiado" ? undefined : aba;
  const hrefDaAba = (valor: string) => {
    const q = new URLSearchParams();
    if (valor !== "fiado") q.set("aba", valor);
    if (ver) q.set("ver", ver);
    if (deDaUrl) q.set("de", deDaUrl);
    if (ateDaUrl) q.set("ate", ateDaUrl);
    const qs = q.toString();
    return qs ? `${CAMINHO}?${qs}` : CAMINHO;
  };
  const tituloDaAba = (valor: string, rotulo: string) =>
    totais[valor] === null ? rotulo : `${rotulo} ${reaisBr(totais[valor] as number)}`;
  const abas = (
    <AbasDaTela
      rotulo="Abas de A receber"
      atual={aba}
      abas={[
        { valor: "fiado", rotulo: tituloDaAba("fiado", "Fiado"), href: hrefDaAba("fiado") },
        { valor: "cheques", rotulo: tituloDaAba("cheques", "Cheques"), href: hrefDaAba("cheques") },
        { valor: "boletos", rotulo: tituloDaAba("boletos", "Boletos"), href: hrefDaAba("boletos") },
        { valor: "cartoes", rotulo: tituloDaAba("cartoes", "Cartões"), href: hrefDaAba("cartoes") },
        { valor: "vencidos", rotulo: tituloDaAba("vencidos", "Vencidos"), href: hrefDaAba("vencidos") },
      ]}
    />
  );

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="A receber"
        caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}
        ajuda="O que ainda vai entrar: fiado, cheques, boletos e parcelas de cartão."
      />

      {dadosRes.ok && (
        <ResumoFaixa
          ativo={ver}
          caminho={CAMINHO}
          params={{ aba: abaParam, faixa: faixa || undefined, de: periodo.de, ate: periodo.ate }}
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
      <PeriodoFiltro caminho={CAMINHO} de={periodo.de} ate={periodo.ate} extras={{ aba: abaParam, ver: ver ?? undefined, faixa: faixa || undefined }} />

      {!dadosRes.ok ? (
        <EmptyState titulo="Não foi possível ler o que receber">{dadosRes.message}</EmptyState>
      ) : ver === "recebido" ? (
        <RecebidosLista
          itens={dadosRes.data.received_items}
          padraoId={padraoId}
          periodo={`De ${dataBr(periodo.de)} a ${dataBr(periodo.ate)}.`}
        />
      ) : (
        <>
          {abas}
          {aba === "vencidos" ? (
            <div className="space-y-4">
              <FaixaFiltro faixa={faixa} ver={ver ?? ""} de={deDaUrl ?? ""} ate={ateDaUrl ?? ""} />
              {cobrancaRes.ok ? (
                <FinanceiroCobranca dados={cobrancaRes.data} loja={loja} />
              ) : (
                <EmptyState titulo="Não foi possível ler a cobrança">{cobrancaRes.message}</EmptyState>
              )}
            </div>
          ) : (
        <FinanceiroReceber
          aba={aba}
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
        </>
      )}
    </div>
  );
}
