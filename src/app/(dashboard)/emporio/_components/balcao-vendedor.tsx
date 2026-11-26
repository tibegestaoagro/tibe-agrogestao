"use client";

import { Button } from "@/components/ui/button";
import { vendedorPelaTecla } from "@/lib/emporio/balcao-tela";

/**
 * O vendedor do Caixa em botões (Q168, Q169): quem atende escolhe a cada venda, sem padrão, e o
 * dígito de 1 a 9 escolhe o vendedor daquela posição. O contêiner leva o `id` e o `aria` do
 * `<Field>` de `seller_user_id` (`tabIndex={-1}`): é nele que cai o F8 e o foco da recusa.
 */
export function VendedorDoBalcao({
  id,
  aria,
  vendedores,
  valor,
  aoEscolher,
}: {
  id: string;
  aria: Record<string, string | boolean | undefined>;
  vendedores: { id: string; name: string }[];
  valor: string;
  aoEscolher: (id: string) => void;
}) {
  return (
    <div
      id={id}
      tabIndex={-1}
      role="radiogroup"
      aria-label="Vendedor"
      {...aria}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const escolhido = vendedorPelaTecla(vendedores, e.key);
        if (!escolhido) return;
        e.preventDefault();
        aoEscolher(escolhido);
      }}
    >
      {vendedores.map((u, n) => (
        <Button
          key={u.id}
          type="button"
          role="radio"
          aria-checked={valor === u.id}
          size="sm"
          variant={valor === u.id ? "default" : "outline"}
          onClick={() => aoEscolher(u.id)}
        >
          {n < 9 ? `${n + 1} ${u.name}` : u.name}
        </Button>
      ))}
    </div>
  );
}
