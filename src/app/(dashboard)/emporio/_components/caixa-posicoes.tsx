import type { TenantPrismaClient } from "@/lib/prisma";
import { pode, type PapelContexto } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { listarEstabelecimentosAction, type Ator } from "@/lib/actions/emporio-catalogo";
import { lerExtratoAction, lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { ExtratoDoLugar, ExtratoPeriodo, PosicoesTabela } from "./financeiro-extrato";
import { idDoClientePadrao } from "./cliente-padrao";
import { LojaFiltro } from "./loja-filtro";

const DIA_MS = 86_400_000;
const CAMINHO = "/emporio/caixa";
// Ida e volta: `2026-02-31` passa pelo regex e o V8 rola para março, então a data volta diferente.
const ehData = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type FiltrosDaPosicao = { loja?: string; lugar?: string; conta?: string; de?: string; ate?: string; carimbo?: string };

/**
 * "Saldo de cada lugar", dentro do Caixa: as posições (gavetas, gerências e contas) e, com
 * `?lugar=<tipo>:<id>`, o extrato do período. `paginas` são os parâmetros de página do resto do
 * Caixa (`pagina_ent`, `pagina_mov`...): os links desta seção os mantêm, para abrir um extrato
 * sem perder a página em que a pessoa estava.
 */
export async function CaixaPosicoes({
  db,
  user,
  papel,
  q,
  paginas = {},
}: {
  db: TenantPrismaClient;
  user: Ator;
  papel: PapelContexto;
  q: FiltrosDaPosicao;
  paginas?: Record<string, string | undefined>;
}) {
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === q.loja) ? (q.loja as string) : "";
  const resumo = await lerResumoHojeAction(db, user, { establishment_id: loja || undefined });
  const posicoes = resumo.ok ? resumo.data.positions : [];

  // `?conta=<id>` segue valendo como `conta:<id>` (links antigos). Um lugar que não está na lista é ignorado.
  const pedido = q.lugar || (q.conta ? `conta:${q.conta}` : "");
  const lugarEscolhido = posicoes.find((p) => `${p.kind}:${p.id}` === pedido);
  const lugar = lugarEscolhido ? pedido : "";
  const hoje = hojeEmBrasilia();
  const ate = ehData(q.ate) ? q.ate : hoje;
  const de = ehData(q.de) ? q.de : new Date(Date.parse(`${ate}T00:00:00Z`) - 29 * DIA_MS).toISOString().slice(0, 10);
  const ehConta = lugarEscolhido?.kind === "conta";
  const soSemCarimbo = ehConta && q.carimbo === "sem";
  const extrato = lugarEscolhido
    ? await lerExtratoAction(db, user, {
        lugar: { kind: lugarEscolhido.kind, id: lugarEscolhido.id },
        de: new Date(`${de}T00:00:00Z`),
        ate: new Date(`${ate}T00:00:00Z`),
        apenas_sem_carimbo: soSemCarimbo,
      })
    : null;

  function enderecoDoExtrato(kind: string, id: string): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(paginas)) if (v) p.set(k, v);
    if (loja) p.set("loja", loja);
    p.set("lugar", `${kind}:${id}`);
    if (q.de && ehData(q.de)) p.set("de", q.de);
    if (q.ate && ehData(q.ate)) p.set("ate", q.ate);
    if (kind === "conta" && q.carimbo === "sem") p.set("carimbo", "sem");
    return `${CAMINHO}?${p.toString()}`;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Saldo de cada lugar</h2>
      <p className="text-sm text-texto-secundario">
        O saldo de cada lugar é a soma dos movimentos. Escolha uma gaveta, a gerência ou uma conta para ver o extrato do
        período.
      </p>
      <LojaFiltro lojas={lojas} loja={loja} caminho={CAMINHO} preservar={paginas} />

      {resumo.ok ? (
        <PosicoesTabela
          posicoes={posicoes}
          total={resumo.data.total_balance}
          lugarAtual={lugar}
          enderecoDoExtrato={enderecoDoExtrato}
        />
      ) : (
        <EmptyState titulo="Não foi possível ler as posições">{resumo.message}</EmptyState>
      )}

      {lugarEscolhido && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-texto">Extrato: {lugarEscolhido.name}</h3>
          <ExtratoPeriodo
            loja={loja}
            lugar={lugar}
            de={de}
            ate={ate}
            mostrarFiltroCarimbo={ehConta}
            soSemCarimbo={soSemCarimbo}
            preservar={paginas}
          />
          {extrato && extrato.ok ? (
            <ExtratoDoLugar
              extrato={extrato.data}
              hoje={hoje}
              podeCarimbar={pode(papel, "dinheiro")}
              padraoId={await idDoClientePadrao(db)}
            />
          ) : (
            <p role="alert" className="text-sm text-perigo-tinta">
              {extrato ? extrato.message : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
