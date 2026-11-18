import type { EstadoDaParcela } from "@/lib/actions/emporio-conferencia-cartao";
import { Badge } from "@/components/ui/badge";

const SELO: Record<EstadoDaParcela, { rotulo: string; variant: "gray" | "amber" | "red" | "green" }> = {
  prevista: { rotulo: "Prevista", variant: "gray" },
  a_conferir: { rotulo: "A conferir", variant: "amber" },
  atrasada: { rotulo: "Atrasada", variant: "red" },
  conferida: { rotulo: "Conferida", variant: "green" },
};

/** O estado da parcela de cartão (frente B), em selo. Só leitura. */
export function SeloDoEstado({ estado, className }: { estado: EstadoDaParcela; className?: string }) {
  const s = SELO[estado];
  return (
    <Badge variant={s.variant} className={className}>
      {s.rotulo}
    </Badge>
  );
}
