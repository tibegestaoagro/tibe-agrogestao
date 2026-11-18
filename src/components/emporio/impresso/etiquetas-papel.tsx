import { reaisBr } from "@/lib/numero-br";
import { CodigoDeBarras } from "@/components/emporio/codigo-de-barras";

/**
 * Etiquetas de prateleira em folha A4 ou rolo. Papel preto sobre branco, sem
 * tokens do tema. Todas as medidas vêm das Configurações do Empório, em mm.
 */

export type EtiquetaDados = {
  produto: string;
  apresentacao: string;
  barcode: string | null;
  preco: number;
};

export type MedidasA4 = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  margin_top: number;
  margin_left: number;
  gap_x: number;
  gap_y: number;
};

export type MedidasRolo = { width: number; height: number; columns: number; gap_x: number };

const PT_EM_MM = 0.3528;
const FOLGA = 1.2;

function Etiqueta({ e, largura, altura }: { e: EtiquetaDados; largura: number; altura: number }) {
  // As fontes crescem e encolhem com a etiqueta (base: 40 x 25 mm).
  const escala = Math.min(Math.max(Math.min(largura / 40, altura / 25), 0.75), 1.6);
  const fNome = 7 * escala;
  const fApres = 6 * escala;
  const fPreco = 10.5 * escala;
  const pad = 1.4;
  const textos = (2 * 1.15 * fNome + 1.2 * fApres + 1.25 * fPreco) * PT_EM_MM;
  const alturaBarras = Math.max(altura - 2 * pad - textos - FOLGA, 0);
  const larguraBarras = largura - 2 * pad;
  const comBarras = !!e.barcode && alturaBarras >= 5;
  return (
    <div className="etq" style={{ width: `${largura}mm`, height: `${altura}mm`, padding: `${pad}mm` }}>
      <div className="nome" style={{ fontSize: `${fNome}pt` }}>
        {e.produto}
      </div>
      <div className="apres" style={{ fontSize: `${fApres}pt` }}>
        {e.apresentacao}
      </div>
      <div className="preco" style={{ fontSize: `${fPreco}pt` }}>
        {reaisBr(e.preco)}
      </div>
      {comBarras && e.barcode && (
        <div className="barras">
          <CodigoDeBarras codigo={e.barcode} larguraMm={larguraBarras} alturaMm={alturaBarras} />
        </div>
      )}
    </div>
  );
}

const ESTILO_BASE = `
.etq-folha { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif }
.etq { box-sizing: border-box; overflow: hidden; background: #fff; color: #000; display: flex; flex-direction: column; align-items: center; text-align: center; line-height: 1.1 }
.etq .nome { font-weight: bold; width: 100%; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere }
.etq .apres { width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.etq .preco { font-weight: bold; line-height: 1.25 }
.etq .barras { margin-top: auto; line-height: 0 }
`;

/** Folha A4: cada etiqueta posicionada em mm; `inicio` pula posições já usadas. */
export function EtiquetasFolhaA4({ etiquetas, medidas, inicio }: { etiquetas: EtiquetaDados[]; medidas: MedidasA4; inicio: number }) {
  const m = medidas;
  const porFolha = m.columns * m.rows;
  const posicoes: (EtiquetaDados | null)[] = [...Array<null>(Math.max(inicio - 1, 0)).fill(null), ...etiquetas];
  const folhas: (EtiquetaDados | null)[][] = [];
  for (let i = 0; i < posicoes.length; i += porFolha) folhas.push(posicoes.slice(i, i + porFolha));
  return (
    <div className="etq-folha">
      <style>{`${ESTILO_BASE}
@page { size: A4; margin: 0 }
.etq-a4 { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: #fff; margin: 0 auto 8mm; box-shadow: 0 0 0 1px #ccc }
.etq-a4 .pos { position: absolute }
@media print {
  .etq-a4 { margin: 0; box-shadow: none; break-after: page; page-break-after: always }
  .etq-a4:last-child { break-after: auto; page-break-after: auto }
}`}</style>
      {folhas.map((folha, f) => (
        <div key={f} className="etq-a4">
          {folha.map((e, k) => {
            if (!e) return null;
            const col = k % m.columns;
            const lin = Math.floor(k / m.columns);
            return (
              <div
                key={k}
                className="pos"
                style={{
                  left: `${m.margin_left + col * (m.width + m.gap_x)}mm`,
                  top: `${m.margin_top + lin * (m.height + m.gap_y)}mm`,
                }}
              >
                <Etiqueta e={e} largura={m.width} altura={m.height} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Rolo: uma linha de etiquetas por página, no tamanho exato da linha. */
export function EtiquetasRolo({ etiquetas, medidas }: { etiquetas: EtiquetaDados[]; medidas: MedidasRolo }) {
  const m = medidas;
  const larguraTotal = m.columns * m.width + (m.columns - 1) * m.gap_x;
  const linhas: EtiquetaDados[][] = [];
  for (let i = 0; i < etiquetas.length; i += m.columns) linhas.push(etiquetas.slice(i, i + m.columns));
  return (
    <div className="etq-folha">
      <style>{`${ESTILO_BASE}
@page { size: ${larguraTotal}mm ${m.height}mm; margin: 0 }
.etq-linha { display: flex; gap: ${m.gap_x}mm; width: ${larguraTotal}mm; height: ${m.height}mm; margin: 0 auto 4mm; background: #fff; box-shadow: 0 0 0 1px #ccc }
@media print {
  .etq-linha { margin: 0; box-shadow: none; break-after: page; page-break-after: always }
  .etq-linha:last-child { break-after: auto; page-break-after: auto }
}`}</style>
      {linhas.map((linha, i) => (
        <div key={i} className="etq-linha">
          {linha.map((e, k) => (
            <Etiqueta key={k} e={e} largura={m.width} altura={m.height} />
          ))}
        </div>
      ))}
    </div>
  );
}
