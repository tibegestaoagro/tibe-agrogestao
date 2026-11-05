import type { RelatorioTurno } from "@/lib/actions/emporio-relatorio-turno";
import { reaisBr } from "@/lib/numero-br";
import { TamanhoDaBobina } from "./tamanho-da-bobina";

/** Fechamento de caixa na bobina (80 ou 58 mm). Relatório interno: preto sobre branco. */

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" });

function estilo(largura: 80 | 58): string {
  return `
@page { margin: 0 }
.cupom { background: #fff; color: #000; font: 12px/1.35 "Courier New", monospace; width: ${largura}mm; box-sizing: border-box; padding: 3mm; margin: 0 auto }
.cupom .c { text-align: center; overflow-wrap: anywhere }
.cupom .g { font-weight: bold }
.cupom hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
.cupom .l { display: flex; justify-content: space-between; gap: 6px }
.cupom .l span:first-child { min-width: 0; overflow-wrap: anywhere }
.cupom .l span:last-child { white-space: nowrap }
.cupom .faixa { border: 2px solid #000; text-align: center; font-weight: bold; padding: 3px 0; margin: 4px 0 }
`;
}

function Linha({ r, v, forte }: { r: string; v: string; forte?: boolean }) {
  return (
    <div className={forte ? "l g" : "l"}>
      <span>{r}</span>
      <span>{v}</span>
    </div>
  );
}

export function RelatorioTurnoCupom({ d }: { d: RelatorioTurno }) {
  const fechado = d.encerrado_em !== null;
  return (
    <article className="cupom">
      <style>{estilo(d.largura_bobina)}</style>
      <TamanhoDaBobina largura={d.largura_bobina} />
      <div className="c g">{d.loja.nome.toUpperCase()}</div>
      {d.loja.documento && <div className="c">CNPJ {d.loja.documento}</div>}
      {d.loja.endereco && <div className="c">{d.loja.endereco}</div>}
      {d.loja.telefone && <div className="c">{d.loja.telefone}</div>}
      <hr />
      <div className="c g">FECHAMENTO DE CAIXA</div>
      {!fechado && <div className="faixa">TURNO ABERTO</div>}
      <hr />
      <div>{d.caixa}</div>
      <div>Operador: {d.operador}</div>
      {d.encerrado_por && d.encerrado_por !== d.operador && <div>Encerrado por: {d.encerrado_por}</div>}
      <div>Abertura: {DATA_HORA.format(new Date(d.aberto_em))}</div>
      {d.encerrado_em && <div>Encerramento: {DATA_HORA.format(new Date(d.encerrado_em))}</div>}
      <hr />
      <Linha r="Troco inicial" v={reaisBr(d.troco_inicial)} />
      {d.reforco > 0 && <Linha r="  (reforço da gerência)" v={reaisBr(d.reforco)} />}
      <hr />
      <div className="g">Vendas por forma</div>
      {d.vendas_por_forma.length === 0 && <div>Nenhuma venda.</div>}
      {d.vendas_por_forma.map((p, k) => (
        <Linha key={k} r={p.forma} v={reaisBr(p.valor)} />
      ))}
      {d.fiado_recebido.length > 0 && (
        <>
          <hr />
          <div className="g">Fiado recebido</div>
          {d.fiado_recebido.map((p, k) => (
            <Linha key={k} r={p.forma} v={reaisBr(p.valor)} />
          ))}
        </>
      )}
      <hr />
      <div className="g">Saídas do dinheiro</div>
      {d.sangrias.length === 0 && <div>Nenhuma sangria.</div>}
      {d.sangrias.map((s, k) => (
        <Linha key={k} r={`Sangria ${HORA.format(new Date(s.em))}${s.confirmada ? " (conf.)" : " (pend.)"}`} v={reaisBr(s.valor)} />
      ))}
      <Linha r="Devoluções" v={reaisBr(d.devolucoes_dinheiro)} />
      <Linha r="Cancelamentos" v={reaisBr(d.cancelamentos_dinheiro)} />
      <Linha r="Despesas" v={reaisBr(d.despesas_dinheiro)} />
      {fechado && d.esperado !== null && d.contado !== null && (
        <>
          <hr />
          <Linha r="Esperado" v={reaisBr(d.esperado)} />
          <Linha r="Contado" v={reaisBr(d.contado)} />
          <Linha r="Diferença" v={reaisBr(d.diferenca ?? 0)} forte />
          {d.justificativa && <div className="nome">Justificativa: {d.justificativa}</div>}
          <hr />
          <Linha r={`Malote${d.malote_confirmado === null ? "" : d.malote_confirmado ? " (confirmado)" : " (a confirmar)"}`} v={reaisBr(d.malote ?? 0)} forte />
          <Linha r="Troco que ficou" v={reaisBr(d.troco_que_ficou ?? 0)} />
        </>
      )}
    </article>
  );
}
