import type { RomaneioView } from "@/lib/actions/emporio-impressao";
import { pesoBr, textoDoPesoTotal } from "@/lib/emporio/peso";
import { LogoDoPapel } from "./logo-do-papel";
import { avisoDaSituacao } from "./romaneio-aviso";

/**
 * Romaneio em folha A4: o que separar e entregar, sem nenhum valor. Preto sobre branco,
 * sem tokens do tema, como os outros papéis.
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
.a4 .faixa { border: 3px solid #000; text-align: center; font-size: 26px; font-weight: bold; letter-spacing: 3px; padding: 6px 0; margin: 0 0 12px }
.a4 .aviso { border: 4px solid #000; padding: 6px 10px; margin: 0 0 12px; text-align: center; font-size: 15px; font-weight: bold }
.a4 .bloco { border: 1px solid #999; padding: 8px 10px; margin-bottom: 10px; border-radius: 3px }
.a4 .rot { font-size: 10px; text-transform: uppercase; color: #444; margin-bottom: 2px }
.a4 table { width: 100%; border-collapse: collapse; margin: 6px 0 6px }
.a4 th { text-align: left; font-size: 10px; text-transform: uppercase; color: #333; border-bottom: 1px solid #000; padding: 4px 3px }
.a4 td { border-bottom: 1px solid #ccc; padding: 5px 3px; overflow-wrap: anywhere; vertical-align: middle }
.a4 .n { text-align: right; white-space: nowrap }
.a4 .caixa { display: inline-block; width: 5mm; height: 5mm; border: 1.5px solid #000; box-sizing: border-box }
.a4 .marcar { width: 8mm }
.a4 .contagem { margin: 0 0 10px; font-size: 11px }
.a4 .assinaturas { break-inside: avoid; margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px 24px }
.a4 .assinaturas .linha { border-top: 1px solid #000; padding-top: 3px; font-size: 11px }
.a4 .assinaturas .larga { grid-column: 1 / -1 }
`;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function RomaneioA4({ d }: { d: RomaneioView }) {
  const contato = [d.loja.telefone, d.loja.whatsapp ? `WhatsApp ${d.loja.whatsapp}` : null].filter(Boolean).join(" · ");
  const dadosCliente = [d.cliente.telefone, d.cliente.documento].filter(Boolean).join(" · ");
  const aviso = avisoDaSituacao(d.situacao);
  const pesoTotalTexto = textoDoPesoTotal(d.peso_total_kg, d.itens_sem_peso);
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
          <h1>ROMANEIO</h1>
          <div>
            Venda nº <b>{d.numero}</b>
          </div>
          {d.orcamento_origem && <div>Orçamento nº {d.orcamento_origem}</div>}
          <div>{DATA_HORA.format(new Date(d.emitida_em))}</div>
        </div>
      </header>

      <p className="faixa">{d.pedido_para_entrega ? "ENTREGA" : "RETIRADA NO BALCÃO"}</p>
      {aviso && <p className="aviso">{aviso}</p>}

      <section className="bloco">
        <div className="rot">Cliente</div>
        <b>{d.cliente.nome}</b>
        {dadosCliente && <div>{dadosCliente}</div>}
        {d.pedido_para_entrega && d.endereco_de_entrega && (
          <div style={{ marginTop: 6 }}>
            <div className="rot">Endereço de entrega</div>
            <b>{d.endereco_de_entrega}</b>
          </div>
        )}
      </section>

      {(d.vendedor || d.caixa) && (
        <div style={{ marginBottom: 8 }}>
          {d.vendedor && (
            <div>
              Vendedor: <b>{d.vendedor}</b>
            </div>
          )}
          {d.caixa && (
            <div>
              Caixa: <b>{d.caixa}</b>
            </div>
          )}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th className="marcar" />
            <th>Produto</th>
            <th>Apresentação</th>
            <th className="n">Quantidade</th>
            <th className="n">Peso</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, k) => (
            <tr key={k}>
              <td>
                <span className="caixa" />
              </td>
              <td>{i.produto}</td>
              <td>{i.apresentacao}</td>
              <td className="n">
                <b>{i.quantidade}</b>
              </td>
              <td className="n">{i.peso_kg === null ? "Sem peso" : pesoBr(i.peso_kg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="contagem">
        {d.linhas} {d.linhas === 1 ? "linha de produto" : "linhas de produto"}
      </p>
      {pesoTotalTexto && (
        <p className="contagem">
          <b>{pesoTotalTexto}</b>
        </p>
      )}

      {d.observacoes && (
        <section className="bloco">
          <div className="rot">Observações</div>
          <div style={{ whiteSpace: "pre-line" }}>{d.observacoes}</div>
        </section>
      )}

      <section className="assinaturas">
        <div className="linha">Separado por</div>
        <div className="linha">Conferido por</div>
        <div className="linha larga">Recebido por: nome, documento e assinatura</div>
        <div className="larga">Data: ____/____/______</div>
      </section>
    </article>
  );
}
