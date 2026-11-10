import { LIMITE_AVISO_CUSTO_PCT } from "@/lib/emporio/custo-medio";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { dataCurta, textoDiferencaCusto } from "./formato";

/** Selo de atenção quando a última compra se afasta do custo médio além do limite. */
export function SeloDiferencaCusto({ gapPct }: { gapPct: number | null }) {
  const texto = textoDiferencaCusto(gapPct, LIMITE_AVISO_CUSTO_PCT);
  if (!texto) return null;
  return <Badge variant="amber">{texto}</Badge>;
}

/** "Custo médio R$ X · Última compra R$ Y (dd/mm)", com "Sem estoque" no lugar do médio sem saldo. */
export function LinhaDeCustos({
  medio,
  ultima,
  ultimaEm,
  prefixoMedio = "Custo médio",
}: {
  medio: number | null;
  ultima: number | null;
  ultimaEm: string | null;
  prefixoMedio?: string;
}) {
  return (
    <span className="block text-xs text-texto-secundario">
      {medio === null ? "Sem estoque" : `${prefixoMedio} ${reaisBr(medio)}`}
      {ultima !== null && ` · Última compra ${reaisBr(ultima)}${ultimaEm ? ` (${dataCurta(ultimaEm)})` : ""}`}
    </span>
  );
}
