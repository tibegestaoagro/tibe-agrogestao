import type { TenantPrismaClient } from "@/lib/prisma";
import { somarDiasCalendario, dataCalendario } from "@/lib/dia-calendario";
import { lerAReceberPorIdadeAction, lerAPagarPorVencimentoAction, lerPosicaoPorLugarAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import { EmptyState } from "@/components/ui/empty-state";
import { RelatorioAcoes, consulta } from "./relatorio-acoes";
import { idDoClientePadrao } from "./cliente-padrao";
import { AReceberPorIdadeBloco, APagarPorVencimentoBloco, PosicaoPorLugarBloco } from "./financeiro-relatorios";
import { FluxoProjetadoTabela, ProjecaoJanelas } from "./financeiro-projecao";

const API = "/api/v1/emporio/finance/reports";
const IMPRIMIR = "/emporio/imprimir/relatorio";
const SO_PARA_FRENTE = "Olha de hoje para a frente e não usa o período escolhido.";

const Nota = ({ children }: { children: string }) => <p className="text-sm text-texto-secundario">{children}</p>;
const falhou = (titulo: string, message: string) => <EmptyState titulo={titulo}>{message}</EmptyState>;

/**
 * A aba Dinheiro das Estatísticas (só `dinheiro`): a receber por idade, a pagar dos próximos 30 dias, a posição
 * de caixa no período do filtro e o fluxo projetado. Os três que olham para a frente ignoram o período.
 */
export async function EstatisticasDinheiro({
  db,
  user,
  hoje,
  de,
  ate,
  periodoNaUrl,
  loja,
  dias,
}: {
  db: TenantPrismaClient;
  user: Parameters<typeof lerAReceberPorIdadeAction>[1];
  /** "AAAA-MM-DD" de hoje em Brasília. */
  hoje: string;
  de: string;
  ate: string;
  /** O período veio da URL: os botões de janela o preservam. */
  periodoNaUrl: boolean;
  loja: string;
  dias: 30 | 60 | 90;
}) {
  const estab = loja || undefined;
  const pagarAte = somarDiasCalendario(hoje, 30);

  const [receber, pagar, posicao, fluxo] = await Promise.all([
    lerAReceberPorIdadeAction(db, user, { establishment_id: estab }),
    lerAPagarPorVencimentoAction(db, user, { establishment_id: estab, de: dataCalendario(hoje), ate: dataCalendario(pagarAte) }),
    lerPosicaoPorLugarAction(db, user, { establishment_id: estab, de: dataCalendario(de), ate: dataCalendario(ate) }),
    lerFluxoProjetadoAction(db, user, { establishment_id: estab, days: dias }),
  ]);

  const hrefJanela = (d: number) => {
    const q = new URLSearchParams({ aba: "dinheiro", dias: String(d) });
    if (loja) q.set("loja", loja);
    if (periodoNaUrl) {
      q.set("de", de);
      q.set("ate", ate);
    }
    return `/emporio/estatisticas?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      {receber.ok ? (
        <div className="space-y-3">
          <RelatorioAcoes
            csvHref={`${API}/receivables-aging${consulta({ establishment_id: estab, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/a-receber${consulta({ loja: estab })}`}
          />
          <AReceberPorIdadeBloco r={receber.data} padraoId={await idDoClientePadrao(db)} />
          <Nota>{SO_PARA_FRENTE}</Nota>
        </div>
      ) : (
        falhou("Não foi possível ler o a receber", receber.message)
      )}

      {pagar.ok ? (
        <div className="space-y-3">
          <RelatorioAcoes
            csvHref={`${API}/payables-by-due${consulta({ establishment_id: estab, de: hoje, ate: pagarAte, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/a-pagar${consulta({ loja: estab, de: hoje, ate: pagarAte })}`}
          />
          <APagarPorVencimentoBloco r={pagar.data} />
          <Nota>{SO_PARA_FRENTE}</Nota>
        </div>
      ) : (
        falhou("Não foi possível ler o a pagar", pagar.message)
      )}

      {posicao.ok ? (
        <div className="space-y-3">
          <RelatorioAcoes
            csvHref={`${API}/cash-by-place${consulta({ establishment_id: estab, de, ate, format: "csv" })}`}
            imprimirHref={`${IMPRIMIR}/posicao${consulta({ loja: estab, de, ate })}`}
          />
          <PosicaoPorLugarBloco r={posicao.data} />
        </div>
      ) : (
        falhou("Não foi possível ler a posição de caixa", posicao.message)
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Fluxo projetado</h2>
        <Nota>{SO_PARA_FRENTE}</Nota>
        <ProjecaoJanelas dias={dias} hrefDe={hrefJanela} />
        {fluxo.ok ? (
          <>
            <RelatorioAcoes
              csvHref={`/api/v1/emporio/finance/projection${consulta({ establishment_id: estab, days: dias, format: "csv" })}`}
              imprimirHref={`${IMPRIMIR}/projecao${consulta({ loja: estab, dias })}`}
            />
            <FluxoProjetadoTabela fluxo={fluxo.data} />
          </>
        ) : (
          falhou("Não foi possível montar a projeção", fluxo.message)
        )}
      </section>
    </div>
  );
}
