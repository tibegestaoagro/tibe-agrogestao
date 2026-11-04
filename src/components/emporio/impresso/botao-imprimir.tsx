"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Só abre o diálogo de impressão quando a pessoa clica: a página nunca imprime sozinha. */
export function BotaoImprimir({ rotulo = "Imprimir" }: { rotulo?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
      {rotulo}
    </Button>
  );
}
