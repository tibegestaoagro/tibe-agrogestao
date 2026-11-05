import type { RelatorioTurno } from "@/lib/actions/emporio-relatorio-turno";
import { reaisBr } from "@/lib/numero-br";

/**
 * Fechamento de caixa em folha A4. Preto sobre branco, sem tokens do tema (o
 * painel inverte as cores no modo escuro e a folha não pode acompanhar).
 */

const ESTILO = `
@page { size: A4; margin: 12mm }
.a4 { background: #fff; color: #000; font: 12px/1.45 Arial, Helvetica, sans-serif; max-width: 190mm; margin: 0 auto; padding: 8mm 0 }
.a4 .topo { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px }
.a4 .loja b { font-size: 14px }
.a4 .doc { text-align: right }
.a4 .doc h1 { font-size: 18px; margin: 0; letter-spacing: .5px }
.a4 .faixa { border: 3px solid #000; padding: 4px 10px; margin: 0 0 12px; text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px }
.a4 .bloco { border: 1px solid #999; padding: 8px 10px; margin-bottom: 10px; border-radius: 3px }
.a4 .rot { font-size: 10px; text-transform: uppercase; color: #444; margin-bottom: 2px }
.a4 .par { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0 }
.a4 .forte { font-weight: bold; border-top: 2px solid #000; margin-top: 4px; padding-top: 4px; font-size: 14px }
.a4 .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px }
.a4 .vazio { color: #444 }
`;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function Par({ r, v, forte }: { r: string; v: string; forte?: boolean }) {
  return (
    <div className={forte ? "par forte" : "par"}>
      <span>{r}</span>
      <span>{v}</span>
    </div>
  );
}

export function RelatorioTurnoA4({ d }: { d: RelatorioTurno }) {
  const fechado = d.encerrado_em !== null;
  return (
    <article className="a4">
      <style>{ESTILO}</style>
      <header className="topo">
        <div className="loja">
          <b>{d.loja.nome}</b>
          {d.loja.documento && <div>CNPJ {d.loja.documento}</div>}
          {d.loja.endereco && <div>{d.loja.endereco}</div>}
          {d.loja.telefone && <div>{d.loja.telefone}</div>}
        </div>
        <div className="doc">
          <h1>FECHAMENTO DE CAIXA</h1>
          <div>
            <b>{d.caixa}</b>
          </div>
        </div>
      </header>

      {!fechado && <p className="faixa">TURNO ABERTO</p>}

      <section className="bloco grade">
        <div>
          <div className="rot">Operador</div>
          <b>{d.operador}</b>
          {d.encerrado_por && d.encerrado_por !== d.operador && <div>Encerrado por {d.encerrado_por}</div>}
        </div>
        <div>
          <div className="rot">Abertura</div>
          <b>{DATA_HORA.format(new Date(d.aberto_em))}</b>
          {d.encerrado_em && (
            <>
              <div className="rot">Encerramento</div>
              <b>{DATA_HORA.format(new Date(d.encerrado_em))}</b>
            </>
          )}
        </div>
      </section>

      <section className="bloco">
        <div className="rot">Troco</div>
        <Par r="Troco inicial" v={reaisBr(d.troco_inicial)} />
        {d.reforco > 0 && <Par r="Do total, reforço da gerência" v={reaisBr(d.reforco)} />}
      </section>

      <section className="bloco">
        <div className="rot">Vendas por forma de pagamento</div>
        {d.vendas_por_forma.length === 0 && <div className="vazio">Nenhuma venda no turno.</div>}
        {d.vendas_por_forma.map((p, k) => (
          <Par key={k} r={p.forma} v={reaisBr(p.valor)} />
        ))}
      </section>

      <section className="bloco">
        <div className="rot">Fiado recebido</div>
        {d.fiado_recebido.length === 0 && <div className="vazio">Nenhum fiado recebido.</div>}
        {d.fiado_recebido.map((p, k) => (
          <Par key={k} r={p.forma} v={reaisBr(p.valor)} />
        ))}
      </section>

      <section className="bloco">
        <div className="rot">Sangrias</div>
        {d.sangrias.length === 0 && <div className="vazio">Nenhuma sangria.</div>}
        {d.sangrias.map((s, k) => (
          <Par key={k} r={`${DATA_HORA.format(new Date(s.em))} (${s.confirmada ? "confirmada pelo gerente" : "a confirmar"})`} v={reaisBr(s.valor)} />
        ))}
      </section>

      <section className="bloco">
        <div className="rot">Outras saídas em dinheiro</div>
        <Par r="Devoluções" v={reaisBr(d.devolucoes_dinheiro)} />
        <Par r="Cancelamentos" v={reaisBr(d.cancelamentos_dinheiro)} />
        <Par r="Despesas" v={reaisBr(d.despesas_dinheiro)} />
      </section>

      {fechado && d.esperado !== null && d.contado !== null && (
        <>
          <section className="bloco">
            <div className="rot">Conferência</div>
            <Par r="Esperado" v={reaisBr(d.esperado)} />
            <Par r="Contado" v={reaisBr(d.contado)} />
            <Par r="Diferença" v={reaisBr(d.diferenca ?? 0)} forte />
            {d.justificativa && <div>Justificativa: {d.justificativa}</div>}
          </section>
          <section className="bloco">
            <div className="rot">Destino do dinheiro</div>
            <Par
              r={`Malote para o gerente${d.malote_confirmado === null ? "" : d.malote_confirmado ? " (confirmado)" : " (a confirmar)"}`}
              v={reaisBr(d.malote ?? 0)}
            />
            <Par r="Troco que ficou na gaveta" v={reaisBr(d.troco_que_ficou ?? 0)} />
          </section>
        </>
      )}
    </article>
  );
}
