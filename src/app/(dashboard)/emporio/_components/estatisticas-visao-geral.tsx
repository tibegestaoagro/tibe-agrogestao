import Link from "next/link";
import type { ReactNode } from "react";
import type { TenantPrismaClient } from "@/lib/prisma";
import { reaisBr } from "@/lib/numero-br";
import { somarDiasCalendario, dataCalendario } from "@/lib/dia-calendario";
import { compararVendasAction, relatorioDeVendasAction } from "@/lib/actions/emporio-relatorios";
import { lerAReceberPorIdadeAction, lerAPagarPorVencimentoAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import {
  resultadoDaLojaAction,
  resultadoPorLojaAction,
  vendasComMargemNegativaAction,
  TODAS_AS_LOJAS,
} from "@/lib/actions/emporio-resultado";
import { diaDoEquilibrio, mesDoPeriodo, textoDaComparacao } from "@/lib/emporio/estatisticas";
import { lerMes } from "@/lib/emporio/mes";
import { rotuloDoMes } from "./meses";
import { pctBr } from "./formato";
import { EstatisticasBarrasDia } from "./estatisticas-barras-dia";

type Ator = Parameters<typeof relatorioDeVendasAction>[1];

const corDoResultado = (n: number) => (n < 0 ? "text-perigo-tinta" : n > 0 ? "text-sucesso-tinta" : "text-texto");

/**
 * A Visão geral das Estatísticas: três cartões (Vendas, Dinheiro, Resultado), cada um só busca dados se a pessoa
 * pode vê-lo. Vendas e Resultado seguem o período e a loja do filtro (o Resultado, o mês da data final); o Dinheiro
 * olha de hoje para a frente. Uma action que recusa vira uma linha discreta, sem derrubar a página.
 */
export async function EstatisticasVisaoGeral({
  db,
  user,
  hoje,
  de,
  ate,
  loja,
  lojaDoResultado,
  alcanceTotal,
  podeDinheiro,
  hrefDaAba,
}: {
  db: TenantPrismaClient;
  user: Ator;
  /** "AAAA-MM-DD" de hoje em Brasília. */
  hoje: string;
  de: string;
  ate: string;
  /** Vazio: "Todas as minhas lojas". */
  loja: string;
  /** A loja do resultado: a escolhida, ou a única ao alcance; vazio quando são várias. */
  lojaDoResultado: string;
  /** Quem alcança todas as lojas (`lojasDoAtor` nulo). */
  alcanceTotal: boolean;
  podeDinheiro: boolean;
  hrefDaAba: (aba: string) => string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <CartaoDeVendas db={db} user={user} de={de} ate={ate} loja={loja} href={hrefDaAba("vendas")} />
      {podeDinheiro && <CartaoDeDinheiro db={db} user={user} hoje={hoje} loja={loja} href={hrefDaAba("dinheiro")} />}
      <CartaoDeResultado
        db={db}
        user={user}
        mes={mesDoPeriodo(ate)}
        loja={lojaDoResultado}
        alcanceTotal={alcanceTotal}
        href={hrefDaAba("resultado")}
      />
    </div>
  );
}

function Cartao({ titulo, href, aviso, children }: { titulo: string; href: string; aviso: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <div className="mt-3 flex-1 space-y-3">{children}</div>
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primaria-tinta hover:underline">
        {aviso}
      </Link>
    </section>
  );
}

const NaoFoiPossivel = () => <p className="text-sm text-texto-secundario">Não foi possível carregar.</p>;

function Grande({ valor, rotulo, classe = "text-texto" }: { valor: string; rotulo?: string; classe?: string }) {
  return (
    <div>
      <p className={`text-3xl font-semibold ${classe}`}>{valor}</p>
      {rotulo && <p className="text-sm text-texto-secundario">{rotulo}</p>}
    </div>
  );
}

function Linha({ rotulo, valor, classe = "text-texto" }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-borda pt-2 text-sm">
      <span className="text-texto-secundario">{rotulo}</span>
      <span className={`min-w-0 break-words text-right font-medium ${classe}`}>{valor}</span>
    </div>
  );
}

async function CartaoDeVendas({
  db,
  user,
  de,
  ate,
  loja,
  href,
}: {
  db: TenantPrismaClient;
  user: Ator;
  de: string;
  ate: string;
  loja: string;
  href: string;
}) {
  const entrada = { from: de, to: ate, ...(loja ? { establishment_id: loja } : {}) };
  const [rel, cmp] = await Promise.all([relatorioDeVendasAction(db, user, entrada), compararVendasAction(db, user, entrada)]);

  if (!rel.ok) {
    return (
      <Cartao titulo="Vendas" href={href} aviso="Ver vendas ›">
        <NaoFoiPossivel />
      </Cartao>
    );
  }
  const r = rel.data;
  const total = r.por_loja.reduce((s, l) => s + l.total, 0);
  const topo = <T extends { total: number }>(lista: T[]): T | undefined =>
    lista.reduce<T | undefined>((m, x) => (!m || x.total > m.total ? x : m), undefined);
  const produto = topo(r.por_produto);
  const vendedor = topo(r.por_vendedor.filter((v) => v.seller_user_id !== null));

  return (
    <Cartao titulo="Vendas" href={href} aviso="Ver vendas ›">
      <Grande valor={reaisBr(total)} rotulo="vendido no período" />
      {cmp.ok ? (
        <p className="text-sm text-texto-secundario">
          {textoDaComparacao(
            Math.round(cmp.data.atual.total * 100),
            Math.round(cmp.data.anterior.total * 100),
            cmp.data.anterior.from,
            cmp.data.anterior.to,
          )}
        </p>
      ) : (
        <NaoFoiPossivel />
      )}
      <EstatisticasBarrasDia dias={r.por_dia} />
      <Linha rotulo="Produto que mais vendeu" valor={produto ? produto.name : "-"} />
      <Linha rotulo="Melhor vendedor" valor={vendedor ? vendedor.name : "-"} />
      <Linha rotulo="Produtos parados no período" valor={String(r.parados.length)} />
    </Cartao>
  );
}

async function CartaoDeDinheiro({
  db,
  user,
  hoje,
  loja,
  href,
}: {
  db: TenantPrismaClient;
  user: Ator;
  hoje: string;
  loja: string;
  href: string;
}) {
  const estab = loja || undefined;
  const ate30 = somarDiasCalendario(hoje, 30);
  const [receber, pagar, fluxo] = await Promise.all([
    lerAReceberPorIdadeAction(db, user, { establishment_id: estab }),
    lerAPagarPorVencimentoAction(db, user, { establishment_id: estab, de: dataCalendario(hoje), ate: dataCalendario(ate30) }),
    lerFluxoProjetadoAction(db, user, { establishment_id: estab, days: 30 }),
  ]);

  return (
    <Cartao titulo="Dinheiro" href={href} aviso="Ver dinheiro ›">
      {fluxo.ok ? <Grande valor={reaisBr(fluxo.data.opening_balance)} rotulo="em caixa e nas contas agora" /> : <NaoFoiPossivel />}
      {receber.ok ? (
        <>
          <Linha rotulo="A receber" valor={reaisBr(receber.data.totals.total)} />
          <Linha
            rotulo="dos quais vencido"
            valor={reaisBr(receber.data.totals["1-15"] + receber.data.totals["16-30"] + receber.data.totals["30+"])}
          />
        </>
      ) : (
        <NaoFoiPossivel />
      )}
      {pagar.ok ? <Linha rotulo="A pagar nos próximos 30 dias" valor={reaisBr(pagar.data.total)} /> : <NaoFoiPossivel />}
      {fluxo.ok && (
        <Linha
          rotulo="Saldo previsto em 30 dias"
          valor={reaisBr(fluxo.data.closing_balance)}
          classe={corDoResultado(fluxo.data.closing_balance)}
        />
      )}
      <p className="text-xs text-texto-secundario">Olha de hoje para a frente e não usa o período escolhido.</p>
    </Cartao>
  );
}

async function CartaoDeResultado({
  db,
  user,
  mes,
  loja,
  alcanceTotal,
  href,
}: {
  db: TenantPrismaClient;
  user: Ator;
  mes: string;
  loja: string;
  alcanceTotal: boolean;
  href: string;
}) {
  const civil = lerMes(mes);
  const nomeDoMes = civil ? rotuloDoMes(civil) : mes;
  const falha = (
    <Cartao titulo="Resultado" href={href} aviso="Ver resultado ›">
      <NaoFoiPossivel />
    </Cartao>
  );

  // "Todas" para quem alcança só algumas lojas: a visão `all` é recusada, então vale a soma delas.
  if (!loja && !alcanceTotal) {
    const res = await resultadoPorLojaAction(db, user, { month: mes });
    if (!res.ok) return falha;
    const t = res.data.total;
    // A margem negativa é por loja (a visão `all` é recusada): soma-se a de cada loja ao alcance.
    const negativasPorLoja = await Promise.all(
      res.data.lojas.map((l) => vendasComMargemNegativaAction(db, user, { establishment_id: l.establishment_id, month: mes })),
    );
    const negativas = negativasPorLoja.every((n) => n.ok)
      ? negativasPorLoja.reduce((s, n) => s + (n.ok ? n.data.length : 0), 0)
      : null;
    return (
      <Cartao titulo="Resultado" href={href} aviso="Ver resultado ›">
        <Grande
          valor={reaisBr(t.result)}
          classe={corDoResultado(t.result)}
          rotulo={`de resultado em ${nomeDoMes}${t.margin_pct !== null ? `, margem de ${pctBr(t.margin_pct)}` : ""}`}
        />
        <p className="text-sm text-texto-secundario">Escolha uma loja para ver o ponto de equilíbrio.</p>
        {res.data.lojas.length > 1 &&
          res.data.lojas.map((l) => <Linha key={l.establishment_id} rotulo={l.name} valor={reaisBr(l.result)} classe={corDoResultado(l.result)} />)}
        {negativas !== null ? <Linha rotulo="Vendas com margem negativa" valor={String(negativas)} /> : <NaoFoiPossivel />}
      </Cartao>
    );
  }

  const entrada = { establishment_id: loja || TODAS_AS_LOJAS, month: mes };
  const [res, negativas] = await Promise.all([
    resultadoDaLojaAction(db, user, entrada),
    vendasComMargemNegativaAction(db, user, entrada),
  ]);
  if (!res.ok) return falha;
  const r = res.data;

  let equilibrio: string;
  if (r.break_even.status === "ok") {
    const dia = diaDoEquilibrio(r.tracking.days, r.break_even.amount);
    equilibrio = dia !== null ? `Ponto de equilíbrio atingido no dia ${dia}` : `Faltam ${reaisBr(r.break_even.missing ?? 0)} para o ponto de equilíbrio`;
  } else {
    equilibrio = r.break_even.message;
  }

  return (
    <Cartao titulo="Resultado" href={href} aviso="Ver resultado ›">
      <Grande
        valor={reaisBr(r.result)}
        classe={corDoResultado(r.result)}
        rotulo={`de resultado em ${nomeDoMes}${r.margin_pct !== null ? `, margem de ${pctBr(r.margin_pct)}` : ""}`}
      />
      <p className="text-sm text-texto-secundario">{equilibrio}</p>
      {r.stores && r.stores.length > 1 &&
        r.stores.map((l) => <Linha key={l.establishment_id} rotulo={l.name} valor={reaisBr(l.result)} classe={corDoResultado(l.result)} />)}
      {negativas.ok ? <Linha rotulo="Vendas com margem negativa" valor={String(negativas.data.length)} /> : <NaoFoiPossivel />}
    </Cartao>
  );
}
