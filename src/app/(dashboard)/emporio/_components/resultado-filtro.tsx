"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// A mesma chave do balcão: a loja que a pessoa usou por último vale aqui também.
const CHAVE_LOJA = "tibe:emporio:loja-do-balcao";

/**
 * Loja e mês do Resultado da Loja. Vivem na URL, e a página server relê.
 * Quando a URL não traz a loja e há mais de uma, usa a lembrada do balcão.
 */
export function ResultadoFiltro({
  lojas,
  loja,
  lojaVeioDaUrl,
  mes,
  meses,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  lojaVeioDaUrl: boolean;
  mes: string;
  meses: { valor: string; rotulo: string }[];
}) {
  const router = useRouter();

  useEffect(() => {
    if (lojaVeioDaUrl || lojas.length < 2) return;
    try {
      const lembrada = window.localStorage.getItem(CHAVE_LOJA);
      if (lembrada && lembrada !== loja && lojas.some((l) => l.id === lembrada)) {
        router.replace(`/emporio/resultado?loja=${encodeURIComponent(lembrada)}&mes=${mes}`);
      }
    } catch {
      // Sem armazenamento, fica na loja padrão.
    }
  }, [lojaVeioDaUrl, lojas, loja, mes, router]);

  function ir(novaLoja: string, novoMes: string) {
    router.push(`/emporio/resultado?loja=${encodeURIComponent(novaLoja)}&mes=${novoMes}`);
  }

  return (
    <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
      <Select value={loja} onValueChange={(v) => ir(v, mes)}>
        <SelectTrigger aria-label="Loja">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lojas.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={mes} onValueChange={(v) => ir(loja, v)}>
        <SelectTrigger aria-label="Mês">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meses.map((m) => (
            <SelectItem key={m.valor} value={m.valor}>
              {m.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
