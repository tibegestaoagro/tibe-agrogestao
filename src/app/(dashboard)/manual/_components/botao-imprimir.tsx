"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotaoImprimir() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
      Imprimir
    </Button>
  );
}
