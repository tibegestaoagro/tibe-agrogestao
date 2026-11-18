import { modulosEan } from "@/lib/emporio/codigo-de-barras";

/**
 * Barras EAN-13 ou EAN-8 em SVG, para a etiqueta. Papel: preto sobre branco, sem
 * token do tema (o painel inverte no modo escuro e a folha não pode acompanhar).
 * `larguraMm` e `alturaMm` são o tamanho total, zona quieta e número inclusos.
 * Código que não é EAN-8 nem EAN-13 não desenha nada.
 */
export function CodigoDeBarras({
  codigo,
  larguraMm,
  alturaMm,
}: {
  codigo: string;
  larguraMm: number;
  alturaMm: number;
}) {
  const modulos = modulosEan(codigo);
  if (!modulos) return null;
  const ean13 = codigo.length === 13;
  // Zona quieta do padrão: 11 módulos à esquerda e 7 à direita no EAN-13; 7 nos dois lados no EAN-8.
  const quietaEsq = ean13 ? 11 : 7;
  const quietaDir = 7;
  const total = quietaEsq + modulos.length + quietaDir;
  const m = larguraMm / total;

  const hTexto = alturaMm * 0.2;
  const hBarras = alturaMm - hTexto;
  const hGuarda = hBarras + hTexto * 0.5;

  // Guardas: 3 módulos de cada ponta e os 5 do meio.
  const meio = ean13 ? 45 : 31;
  const ehGuarda = (i: number) => i < 3 || i >= modulos.length - 3 || (i >= meio && i < meio + 5);

  const barras: { x: number; w: number; guarda: boolean }[] = [];
  for (let i = 0; i < modulos.length; ) {
    if (modulos[i] !== "1") {
      i++;
      continue;
    }
    const guarda = ehGuarda(i);
    let j = i;
    while (j < modulos.length && modulos[j] === "1" && ehGuarda(j) === guarda) j++;
    barras.push({ x: (quietaEsq + i) * m, w: (j - i) * m, guarda });
    i = j;
  }

  const fonte = Math.min(hTexto * 0.95, m * 6.2);
  const yTexto = alturaMm - hTexto * 0.12;
  const digitos = [...codigo];
  // Os dígitos ficam no centro de cada grupo de 7 módulos, entre as guardas.
  const grupo = (primeiro: number, inicioModulo: number) =>
    digitos.slice(primeiro, primeiro + (ean13 ? 6 : 4)).map((d, k) => (
      <text key={`${inicioModulo}-${k}`} x={(quietaEsq + inicioModulo + k * 7 + 3.5) * m} y={yTexto} textAnchor="middle">
        {d}
      </text>
    ));

  return (
    <svg
      role="img"
      aria-label={`Código de barras ${codigo}`}
      width={`${larguraMm}mm`}
      height={`${alturaMm}mm`}
      viewBox={`0 0 ${larguraMm} ${alturaMm}`}
      style={{ display: "block", background: "#fff" }}
    >
      <rect x={0} y={0} width={larguraMm} height={alturaMm} fill="#fff" />
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={b.guarda ? hGuarda : hBarras} fill="#000" shapeRendering="crispEdges" />
      ))}
      <g fill="#000" fontFamily="Arial, Helvetica, sans-serif" fontSize={fonte}>
        {ean13 && (
          <text x={(quietaEsq - 4) * m} y={yTexto} textAnchor="middle">
            {digitos[0]}
          </text>
        )}
        {ean13 ? grupo(1, 3) : grupo(0, 3)}
        {ean13 ? grupo(7, 50) : grupo(4, 36)}
      </g>
    </svg>
  );
}
