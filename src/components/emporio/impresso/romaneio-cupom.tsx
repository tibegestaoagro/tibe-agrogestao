import type { RomaneioView } from "@/lib/actions/emporio-impressao";
import { pesoBr, textoDoPesoTotal } from "@/lib/emporio/peso";
import { TamanhoDaBobina } from "./tamanho-da-bobina";
import { avisoDaSituacao } from "./romaneio-aviso";

/** Romaneio na bobina (80 ou 58 mm), sem valores. Preto sobre branco. */

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function estilo(largura: 80 | 58): string {
  return `
@page { margin: 0 }
.cupom { background: #fff; color: #000; font: 12px/1.35 "Courier New", monospace; width: ${largura}mm; box-sizing: border-box; padding: 3mm; margin: 0 auto }
.cupom .c { text-align: center; overflow-wrap: anywhere }
.cupom .g { font-weight: bold }
.cupom hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
.cupom .nome { overflow-wrap: anywhere; word-break: break-word }
.cupom .faixa { border: 3px solid #000; text-align: center; font-weight: bold; font-size: 16px; padding: 4px 0; margin: 4px 0 }
.cupom .aviso { border: 3px solid #000; text-align: center; font-weight: bold; padding: 3px 2px; margin: 4px 0; overflow-wrap: anywhere }
.cupom .item { display: flex; gap: 6px; align-items: flex-start; margin-bottom: 4px }
.cupom .caixa { flex: none; width: 4mm; height: 4mm; border: 1.5px solid #000; box-sizing: border-box; margin-top: 2px }
.cupom .item span:last-child { min-width: 0; overflow-wrap: anywhere }
.cupom .assina { margin-top: 14px; border-top: 1px solid #000; padding-top: 2px; overflow-wrap: anywhere }
`;
}

export function RomaneioCupom({ d }: { d: RomaneioView }) {
  const aviso = avisoDaSituacao(d.situacao);
  const pesoTotalTexto = textoDoPesoTotal(d.peso_total_kg, d.itens_sem_peso);
  return (
    <article className="cupom">
      <style>{estilo(d.largura_bobina)}</style>
      <TamanhoDaBobina largura={d.largura_bobina} />
      <div className="c g">{d.loja.nome.toUpperCase()}</div>
      <hr />
      <div className="c g">ROMANEIO</div>
      <div className="c">Venda nº {d.numero}</div>
      {d.orcamento_origem && <div className="c">Orçamento nº {d.orcamento_origem}</div>}
      <div className="c">{DATA_HORA.format(new Date(d.emitida_em))}</div>
      <div className="faixa">{d.pedido_para_entrega ? "ENTREGA" : "RETIRADA NO BALCÃO"}</div>
      {aviso && <div className="aviso">{aviso}</div>}
      <hr />
      <div className="nome">Cliente: {d.cliente.nome}</div>
      {d.cliente.telefone && <div className="nome">Tel: {d.cliente.telefone}</div>}
      {d.cliente.documento && <div className="nome">Doc: {d.cliente.documento}</div>}
      {d.pedido_para_entrega && d.endereco_de_entrega && <div className="nome g">Entregar em: {d.endereco_de_entrega}</div>}
      {d.vendedor && <div className="nome">Vendedor: {d.vendedor}</div>}
      {d.caixa && <div className="nome">Caixa: {d.caixa}</div>}
      <hr />
      {d.itens.map((i, k) => (
        <div key={k} className="item">
          <span className="caixa" />
          <span>
            {i.quantidade} x {i.produto} ({i.apresentacao})
            {i.peso_kg !== null ? ` [${pesoBr(i.peso_kg)}]` : ""}
          </span>
        </div>
      ))}
      <hr />
      <div>
        {d.linhas} {d.linhas === 1 ? "linha de produto" : "linhas de produto"}
      </div>
      {pesoTotalTexto && <div className="nome g">{pesoTotalTexto}</div>}
      {d.observacoes && (
        <>
          <hr />
          <div className="nome" style={{ whiteSpace: "pre-line" }}>
            Obs: {d.observacoes}
          </div>
        </>
      )}
      <div className="assina">Separado por</div>
      <div className="assina">Conferido por</div>
      <div className="assina">Recebido por: nome, documento e assinatura</div>
      <div style={{ marginTop: 10 }}>Data: ____/____/______</div>
    </article>
  );
}
