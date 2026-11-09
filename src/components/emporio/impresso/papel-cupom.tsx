import type { ImpressoVenda } from "@/lib/actions/emporio-impressao";
import { reaisBr } from "@/lib/numero-br";
import { TamanhoDaBobina } from "./tamanho-da-bobina";

/** Comprovante de venda na bobina (80 ou 58 mm). Sem logo, preto sobre branco. */

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

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
.cupom .nome { overflow-wrap: anywhere; word-break: break-word }
.cupom .cancelada { border: 2px solid #000; text-align: center; font-weight: bold; padding: 3px 0; margin: 4px 0 }
`;
}

export function PapelCupom({ d }: { d: ImpressoVenda }) {
  const orcamento = d.tipo === "orcamento";
  return (
    <article className="cupom">
      <style>{estilo(d.largura_bobina)}</style>
      <TamanhoDaBobina largura={d.largura_bobina} />
      <div className="c g">{d.loja.nome.toUpperCase()}</div>
      {d.loja.documento && <div className="c">CNPJ {d.loja.documento}</div>}
      {d.loja.endereco && <div className="c">{d.loja.endereco}</div>}
      {d.loja.telefone && <div className="c">{d.loja.telefone}</div>}
      {d.loja.whatsapp && <div className="c">WhatsApp {d.loja.whatsapp}</div>}
      <hr />
      <div className="c g">{orcamento ? "ORÇAMENTO" : "COMPROVANTE DE VENDA"}</div>
      <div className="c">SEM VALOR FISCAL</div>
      {d.cancelada && <div className="cancelada">VENDA CANCELADA</div>}
      {d.faturado_na_venda && <div className="cancelada">FATURADO (venda nº {d.faturado_na_venda})</div>}
      <hr />
      <div className="l">
        <span>
          {orcamento ? "Orçamento" : "Venda"} nº {d.numero}
        </span>
        <span>{DATA_HORA.format(new Date(d.emitida_em))}</span>
      </div>
      {d.orcamento_origem && <div>Orçamento nº {d.orcamento_origem}</div>}
      {d.origem === "ecommerce" && <div>Pedido do e-commerce</div>}
      {orcamento && d.validade && <div className="g">Válido até {d.validade}</div>}
      <hr />
      {d.itens.map((i, k) => (
        <div key={k}>
          <div className="nome">{i.produto}</div>
          <div className="l">
            <span>
              {i.quantidade} x {reaisBr(i.preco)}
            </span>
            <span>{reaisBr(i.total)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="l">
        <span>Subtotal</span>
        <span>{reaisBr(d.subtotal)}</span>
      </div>
      {d.desconto > 0 && (
        <div className="l">
          <span>Desconto</span>
          <span>-{reaisBr(d.desconto)}</span>
        </div>
      )}
      {d.frete > 0 && (
        <div className="l">
          <span>Frete</span>
          <span>{reaisBr(d.frete)}</span>
        </div>
      )}
      <div className="l g">
        <span>TOTAL</span>
        <span>{reaisBr(d.total)}</span>
      </div>
      {d.pagamentos.length > 0 && <hr />}
      {d.pagamentos.map((p, k) => (
        <div key={k} className="l">
          <span>{p.forma}</span>
          <span>{reaisBr(p.valor)}</span>
        </div>
      ))}
      {d.troco !== null && (
        <div className="l">
          <span>Troco</span>
          <span>{reaisBr(d.troco)}</span>
        </div>
      )}
      {(d.pedido_para_entrega || d.cliente || d.vendedor || d.caixa) && <hr />}
      {d.pedido_para_entrega && (
        <div className="nome g">
          PEDIDO PARA ENTREGA{d.endereco_de_entrega ? `: ${d.endereco_de_entrega}` : ""}
        </div>
      )}
      {d.cliente && <div className="nome">Cliente: {d.cliente.nome}</div>}
      {d.vendedor && <div className="nome">Vendedor: {d.vendedor}</div>}
      {d.caixa && <div className="nome">Caixa: {d.caixa}</div>}
      {d.rodape && (
        <>
          <hr />
          <div className="c" style={{ whiteSpace: "pre-line" }}>
            {d.rodape}
          </div>
        </>
      )}
    </article>
  );
}
