import type {
  AReceberPorIdadeView,
  APagarPorVencimentoView,
  PosicaoPorLugarView,
  SemVencimentoView,
} from "@/lib/actions/emporio-relatorios-financeiro";
import type { FluxoProjetadoView } from "@/lib/actions/emporio-projecao";
import { reaisBr } from "@/lib/numero-br";

/**
 * Relatórios do dinheiro em folha A4. Preto sobre branco, sem tokens do tema
 * (o painel inverte as cores no modo escuro e a folha não pode acompanhar).
 */

const ESTILO = `
@page { size: A4; margin: 12mm }
.a4 { background: #fff; color: #000; font: 12px/1.45 Arial, Helvetica, sans-serif; max-width: 190mm; margin: 0 auto; padding: 8mm 0 }
.a4 .topo { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px }
.a4 .topo h1 { font-size: 18px; margin: 0 }
.a4 .doc { text-align: right }
.a4 h2 { font-size: 14px; margin: 14px 0 4px }
.a4 p { margin: 2px 0 6px }
.a4 table { width: 100%; border-collapse: collapse; margin-bottom: 8px }
.a4 th, .a4 td { border-bottom: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: top }
.a4 th { font-size: 10px; text-transform: uppercase; color: #444 }
.a4 .num { text-align: right; white-space: nowrap }
.a4 .forte td { font-weight: bold; border-top: 2px solid #000 }
.a4 .neg { font-weight: bold }
.a4 .vazio { color: #444 }
`;

const ddmm = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const FAIXAS = [
  { chave: "em_dia", rotulo: "Em dia" },
  { chave: "1-15", rotulo: "1 a 15" },
  { chave: "16-30", rotulo: "16 a 30" },
  { chave: "30+", rotulo: "Mais de 30" },
] as const;
const ROTULO_DO_LUGAR = { gaveta: "Gaveta", gerencia: "Com a gerência", conta: "Conta" } as const;

export type DadosDoRelatorio =
  | { tipo: "a-receber"; r: AReceberPorIdadeView }
  | { tipo: "a-pagar"; r: APagarPorVencimentoView }
  | { tipo: "posicao"; r: PosicaoPorLugarView }
  | { tipo: "projecao"; r: FluxoProjetadoView };

export const TITULO_DO_RELATORIO = {
  "a-receber": "A receber por idade",
  "a-pagar": "A pagar por vencimento",
  posicao: "Posição de caixa por lugar",
  projecao: "Fluxo de caixa projetado",
} as const;

function SemVencimento({ r }: { r: SemVencimentoView }) {
  return (
    <>
      <h2>Sem vencimento</h2>
      {r.count === 0 ? (
        <p className="vazio">Nenhuma conta pendente sem data de vencimento.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th className="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {r.entries.map((e) => (
              <tr key={e.entry_id}>
                <td>{e.name}</td>
                <td className="num">{reaisBr(e.total)}</td>
              </tr>
            ))}
            <tr className="forte">
              <td>
                Total ({r.count} {r.count === 1 ? "conta" : "contas"})
              </td>
              <td className="num">{reaisBr(r.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}

function Corpo({ d }: { d: DadosDoRelatorio }) {
  if (d.tipo === "a-receber") {
    const { r } = d;
    if (r.customers.length === 0) return <p className="vazio">Ninguém deve: não há fiado nem parcela em aberto.</p>;
    return (
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            {FAIXAS.map((f) => (
              <th key={f.chave} className="num">
                {f.rotulo}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {r.customers.map((c) => (
            <tr key={c.customer_id}>
              <td>{c.customer_name}</td>
              {FAIXAS.map((f) => (
                <td key={f.chave} className="num">
                  {reaisBr(c[f.chave])}
                </td>
              ))}
              <td className="num">{reaisBr(c.total)}</td>
            </tr>
          ))}
          <tr className="forte">
            <td>Total</td>
            {FAIXAS.map((f) => (
              <td key={f.chave} className="num">
                {reaisBr(r.totals[f.chave])}
              </td>
            ))}
            <td className="num">{reaisBr(r.totals.total)}</td>
          </tr>
        </tbody>
      </table>
    );
  }
  if (d.tipo === "a-pagar") {
    const { r } = d;
    const semConta = r.weeks.every((s) => s.items.length === 0);
    return (
      <>
        <p>
          Contas pendentes que vencem de {ddmm(r.de)} a {ddmm(r.ate)}: {reaisBr(r.total)}
          {r.overdue_total > 0 ? `, das quais ${reaisBr(r.overdue_total)} já venceram` : ""}.
        </p>
        {semConta ? (
          <p className="vazio">Nenhuma conta pendente vence nestas datas.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th className="num">Total</th>
                  <th>Contas</th>
                </tr>
              </thead>
              <tbody>
                {r.weeks.map((s) => (
                  <tr key={s.de}>
                    <td>
                      de {ddmm(s.de)} a {ddmm(s.ate)}
                      {s.overdue ? " (vencido)" : ""}
                    </td>
                    <td className="num">{reaisBr(s.total)}</td>
                    <td>{s.items.length === 0 ? "Nenhuma" : s.items.map((i) => `${i.name} ${reaisBr(i.total)}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2>Por nome</h2>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="num">Total</th>
                  <th className="num">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {r.by_name.map((n) => (
                  <tr key={n.name}>
                    <td>{n.name}</td>
                    <td className="num">{reaisBr(n.total)}</td>
                    <td className="num">{reaisBr(n.overdue_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <SemVencimento r={r.without_due} />
      </>
    );
  }
  if (d.tipo === "posicao") {
    const { r } = d;
    return (
      <>
        <p>
          Saldo de hoje e o que entrou e saiu de {ddmm(r.de)} a {ddmm(r.ate)}. Total em caixa: {reaisBr(r.total_balance)}.
        </p>
        {r.places.length === 0 ? (
          <p className="vazio">Nenhum lugar com dinheiro ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lugar</th>
                <th className="num">Saldo</th>
                <th className="num">Entradas</th>
                <th className="num">Saídas</th>
              </tr>
            </thead>
            <tbody>
              {r.places.map((p) => (
                <tr key={`${p.kind}:${p.id}`}>
                  <td>
                    {p.name} ({ROTULO_DO_LUGAR[p.kind]})
                  </td>
                  <td className="num">{reaisBr(p.balance)}</td>
                  <td className="num">{reaisBr(p.period.entradas)}</td>
                  <td className="num">{reaisBr(p.period.saidas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }
  const { r } = d;
  return (
    <>
      <p>
        Saldo de hoje: <b>{reaisBr(r.opening_balance)}</b>
      </p>
      {r.weeks.length === 0 ? (
        <p className="vazio">Não há semanas na janela escolhida.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Semana</th>
              <th className="num">A receber</th>
              <th className="num">A pagar</th>
              <th className="num">Saldo ao fim</th>
            </tr>
          </thead>
          <tbody>
            {r.weeks.map((s) => (
              <tr key={s.numero}>
                <td>
                  Semana {s.numero} (de {ddmm(s.de)} a {ddmm(s.ate)})
                </td>
                <td className="num">{reaisBr(s.receivables.total)}</td>
                <td className="num">{reaisBr(s.payables.total)}</td>
                <td className={s.closing_balance < 0 ? "num neg" : "num"}>
                  {reaisBr(s.closing_balance)}
                  {s.closing_balance < 0 ? " (negativo)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SemVencimento r={r.without_due} />
      {r.notes.length > 0 && (
        <ul>
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RelatorioFinanceiroA4({
  d,
  loja,
  periodo,
  emitidoEm,
}: {
  d: DadosDoRelatorio;
  /** O nome da loja, ou "Todas as lojas". */
  loja: string;
  /** O período como texto pronto, ou nulo quando o relatório é um retrato de hoje. */
  periodo: string | null;
  /** Data de emissão, "AAAA-MM-DD". */
  emitidoEm: string;
}) {
  return (
    <article className="a4">
      <style>{ESTILO}</style>
      <header className="topo">
        <div>
          <h1>{TITULO_DO_RELATORIO[d.tipo]}</h1>
          <div>{loja}</div>
          {periodo && <div>{periodo}</div>}
        </div>
        <div className="doc">
          <div>Emitido em</div>
          <b>{dmy(emitidoEm)}</b>
        </div>
      </header>
      <Corpo d={d} />
    </article>
  );
}
