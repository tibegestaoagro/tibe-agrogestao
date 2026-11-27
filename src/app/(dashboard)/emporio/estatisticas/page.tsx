import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { lojasDoAtor } from "@/lib/actions/emporio-catalogo";
import { lerLojaDoTopo } from "@/lib/emporio/loja-do-topo-servidor";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import {
  abaDaEstatistica,
  atalhosDasEstatisticas,
  mesDoPeriodo,
  periodoDasEstatisticas,
  periodoPegaMaisDeUmMes,
} from "@/lib/emporio/estatisticas";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { AbasDaTela } from "../_components/abas-da-tela";
import { EstatisticasFiltro } from "../_components/estatisticas-filtro";
import { EstatisticasVendas } from "../_components/estatisticas-vendas";
import { EstatisticasDinheiro } from "../_components/estatisticas-dinheiro";
import { EstatisticasResultado } from "../_components/estatisticas-resultado";
import { EstatisticasImprimir } from "../_components/estatisticas-imprimir";
import { EstatisticasVisaoGeral } from "../_components/estatisticas-visao-geral";

type Parametros = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/**
 * Estatísticas: Vendas, Dinheiro e Resultado num lugar só, com um filtro de período e loja no topo.
 * Só a aba aberta busca dados. Vendas e Resultado são do Gestor da loja para cima; Dinheiro, de quem vê o dinheiro.
 */
export default async function EstatisticasPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const user = await requireFeaturePage("emporio");
  const sp = await searchParams;

  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/estatisticas")) redirect("/emporio");

  const aba = abaDaEstatistica(um(sp.aba), pode(papel, "dinheiro"));
  const hoje = hojeEmBrasilia();
  const periodo = periodoDasEstatisticas({ de: um(sp.de) || undefined, ate: um(sp.ate) || undefined }, hoje);
  const periodoNaUrl = !periodo.invalido && (um(sp.de) !== "" || um(sp.ate) !== "");

  // A loja do topo (a da URL, a do cookie ou "" = Todas as minhas lojas), sempre ao alcance de quem olha.
  const { lojas, loja } = await lerLojaDoTopo(db, user, um(sp.loja));

  const dias = um(sp.dias) === "60" ? 60 : um(sp.dias) === "90" ? 90 : 30;
  const abc = um(sp.abc);
  const medida = um(sp.medida);
  const manter =
    aba === "dinheiro" ? { dias: um(sp.dias) } : aba === "vendas" ? { abc, medida } : aba === "imprimir" ? { medida } : {};

  const hrefDaAba = (valor: string) => {
    const q = new URLSearchParams({ aba: valor });
    if (periodoNaUrl) {
      q.set("de", periodo.de);
      q.set("ate", periodo.ate);
    }
    // A medida da Curva ABC passa entre Vendas e Relatórios para imprimir, que imprime a mesma curva.
    if (medida && (valor === "vendas" || valor === "imprimir")) q.set("medida", medida);
    return `/emporio/estatisticas?${q.toString()}`;
  };
  const abas = [
    { valor: "geral", rotulo: "Visão geral" },
    { valor: "vendas", rotulo: "Vendas" },
    ...(pode(papel, "dinheiro") ? [{ valor: "dinheiro", rotulo: "Dinheiro" }] : []),
    { valor: "resultado", rotulo: "Resultado" },
    { valor: "imprimir", rotulo: "Relatórios para imprimir" },
  ].map((a) => ({ ...a, href: hrefDaAba(a.valor) }));

  // Um ator com uma loja só no alcance vê o resultado detalhado dela, sem escolher.
  const lojaDoResultado = loja || (lojas.length === 1 ? lojas[0].id : "");

  let conteudo: React.ReactNode;
  if (lojas.length === 0) {
    conteudo = <EmptyState titulo="Nenhuma loja disponível">Cadastre uma loja em Lojas para ver as estatísticas.</EmptyState>;
  } else if (aba === "vendas") {
    conteudo = <EstatisticasVendas db={db} user={user} de={periodo.de} ate={periodo.ate} loja={loja} abc={abc} medida={medida} />;
  } else if (aba === "dinheiro") {
    conteudo = (
      <EstatisticasDinheiro
        db={db}
        user={user}
        hoje={hoje.toISOString().slice(0, 10)}
        de={periodo.de}
        ate={periodo.ate}
        periodoNaUrl={periodoNaUrl}
        loja={loja}
        dias={dias}
      />
    );
  } else if (aba === "resultado") {
    conteudo = (
      <EstatisticasResultado
        db={db}
        user={user}
        mes={mesDoPeriodo(periodo.ate)}
        loja={lojaDoResultado}
        alcanceTotal={(await lojasDoAtor(db, user)) === null}
        maisDeUmMes={periodoPegaMaisDeUmMes(periodo.de, periodo.ate)}
      />
    );
  } else if (aba === "geral") {
    conteudo = (
      <EstatisticasVisaoGeral
        db={db}
        user={user}
        hoje={hoje.toISOString().slice(0, 10)}
        de={periodo.de}
        ate={periodo.ate}
        loja={loja}
        lojaDoResultado={lojaDoResultado}
        alcanceTotal={(await lojasDoAtor(db, user)) === null}
        podeDinheiro={pode(papel, "dinheiro")}
        hrefDaAba={hrefDaAba}
      />
    );
  } else {
    conteudo = (
      <EstatisticasImprimir
        db={db}
        user={user}
        hoje={hoje.toISOString().slice(0, 10)}
        de={periodo.de}
        ate={periodo.ate}
        loja={loja}
        medida={medida}
        podeDinheiro={pode(papel, "dinheiro")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="Estatísticas"
        ajuda="Os números da loja num lugar só: vendas, dinheiro e resultado, no período que você escolher aqui e na loja do seletor lá em cima."
      />
      <EstatisticasFiltro
        aba={aba}
        de={periodo.de}
        ate={periodo.ate}
        atalhos={atalhosDasEstatisticas(hoje)}
        invalido={periodo.invalido}
        manter={manter}
      />
      <AbasDaTela rotulo="Abas das Estatísticas" abas={abas} atual={aba} />
      {conteudo}
    </div>
  );
}
