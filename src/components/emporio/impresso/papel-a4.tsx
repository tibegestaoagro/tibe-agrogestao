import type { ImpressoVenda } from "@/lib/actions/emporio-impressao";
import { reaisBr } from "@/lib/numero-br";
import { LogoDoPapel } from "./logo-do-papel";

/**
 * Venda em folha A4. O papel é sempre preto sobre branco, sem tokens do tema:
 * o painel inverte as cores no modo escuro e a folha não pode acompanhar.
 */

const ESTILO = `
@page { size: A4; margin: 12mm }
.a4 { background: #fff; color: #000; font: 12px/1.45 Arial, Helvetica, sans-serif; max-width: 190mm; margin: 0 auto; padding: 8mm 0 }
.a4 .topo { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px }
.a4 .marca { display: flex; gap: 10px; align-items: flex-start }
.a4 .logo { max-width: 64px; max-height: 64px; object-fit: contain }
.a4 .loja b { font-size: 14px }
.a4 .doc { text-align: right }
.a4 .doc h1 { font-size: 18px; margin: 0; letter-spacing: .5px }
.a4 .cancelada { border: 3px solid #000; padding: 4px 10px; margin: 0 0 12px; text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 1px }
.a4 .bloco { border: 1px solid #999; padding: 8px 10px; margin-bottom: 10px; border-radius: 3px }
.a4 .rot { font-size: 10px; text-transform: uppercase; color: #444; margin-bottom: 2px }
.a4 table { width: 100%; border-collapse: collapse; margin: 6px 0 10px }
.a4 th { text-align: left; font-size: 10px; text-transform: uppercase; color: #333; border-bottom: 1px solid #000; padding: 4px 3px }
.a4 td { border-bottom: 1px solid #ccc; padding: 4px 3px; overflow-wrap: anywhere }
.a4 .n { text-align: right; white-space: nowrap }
.a4 .totais { margin-left: auto; width: 52% }
.a4 .totais div { display: flex; justify-content: space-between; padding: 2px 0 }
.a4 .totais .final { border-top: 2px solid #000; font-weight: bold; font-size: 14px; margin-top: 4px; padding-top: 4px }
.a4 .rodape { margin-top: 16px; font-size: 11px; border-top: 1px solid #999; padding-top: 8px }
`;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function PapelA4({ d }: { d: ImpressoVenda }) {
  const contato = [d.loja.telefone, d.loja.whatsapp ? `WhatsApp ${d.loja.whatsapp}` : null].filter(Boolean).join(" · ");
  const dadosCliente = d.cliente ? [d.cliente.documento, d.cliente.telefone, d.cliente.endereco].filter(Boolean).join(" · ") : "";
  return (
    <article className="a4">
      <style>{ESTILO}</style>
      <header className="topo">
        <div className="marca">
          {d.tem_logo && <LogoDoPapel versao={d.logo_updated_at} />}
          <div className="loja">
            <b>{d.loja.nome}</b>
            {d.loja.documento && <div>CNPJ {d.loja.documento}</div>}
            {d.loja.endereco && <div>{d.loja.endereco}</div>}
            {contato && <div>{contato}</div>}
          </div>
        </div>
        <div className="doc">
          <h1>VENDA</h1>
          <div>
            Nº <b>{d.numero}</b>
          </div>
          <div>Emitida em {DATA_HORA.format(new Date(d.emitida_em))}</div>
        </div>
      </header>

      {d.cancelada && <p className="cancelada">VENDA CANCELADA</p>}

      {d.cliente && (
        <section className="bloco">
          <div className="rot">Cliente</div>
          <b>{d.cliente.nome}</b>
          {dadosCliente && <div>{dadosCliente}</div>}
        </section>
      )}

      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th className="n">Qtd</th>
            <th className="n">Preço</th>
            <th className="n">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, k) => (
            <tr key={k}>
              <td>{i.produto}</td>
              <td className="n">{i.quantidade}</td>
              <td className="n">{reaisBr(i.preco)}</td>
              <td className="n">{reaisBr(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totais">
        <div>
          <span>Subtotal</span>
          <span>{reaisBr(d.subtotal)}</span>
        </div>
        {d.desconto > 0 && (
          <div>
            <span>Desconto</span>
            <span>- {reaisBr(d.desconto)}</span>
          </div>
        )}
        <div className="final">
          <span>Total</span>
          <span>{reaisBr(d.total)}</span>
        </div>
      </div>

      <section className="bloco" style={{ marginTop: 12 }}>
        <div className="rot">Pagamento</div>
        {d.pagamentos.map((p, k) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{p.forma}</span>
            <span>{reaisBr(p.valor)}</span>
          </div>
        ))}
        {d.troco !== null && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Troco</span>
            <span>{reaisBr(d.troco)}</span>
          </div>
        )}
      </section>

      <footer className="rodape">
        {d.vendedor && (
          <div>
            Vendedor: <b>{d.vendedor}</b>
          </div>
        )}
        {d.rodape && <div style={{ whiteSpace: "pre-line" }}>{d.rodape}</div>}
        <div>Documento sem valor fiscal.</div>
      </footer>
    </article>
  );
}
