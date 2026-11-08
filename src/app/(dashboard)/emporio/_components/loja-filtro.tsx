"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const TODAS = "__todas__";

/**
 * O filtro de loja (`?loja=`, "Todas as lojas" como padrão) de uma tela do
 * Empório. Vive na URL e a página server relê. Trocar a loja zera o resto
 * (conta e período do extrato valem para a loja anterior).
 */
export function LojaFiltro({
  lojas,
  loja,
  caminho,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  /** A rota da tela, sem query: "/emporio/financeiro/pagar". */
  caminho: string;
}) {
  const router = useRouter();

  function ir(nova: string) {
    router.push(nova ? `${caminho}?loja=${encodeURIComponent(nova)}` : caminho);
  }

  return (
    <div className="sm:max-w-xs">
      <Select value={loja || TODAS} onValueChange={(v) => ir(v === TODAS ? "" : v)}>
        <SelectTrigger aria-label="Filtrar por loja">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as lojas</SelectItem>
          {lojas.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
