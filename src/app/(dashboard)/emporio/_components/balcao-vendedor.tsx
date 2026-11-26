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
        // As setas andam e escolhem, como num grupo de rádios: uma parada de Tab só para o grupo.
        const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (passo && vendedores.length > 0) {
          e.preventDefault();
          const atual = vendedores.findIndex((u) => u.id === valor);
          const proximo = atual < 0 ? (passo > 0 ? 0 : vendedores.length - 1) : (atual + passo + vendedores.length) % vendedores.length;
          aoEscolher(vendedores[proximo].id);
          e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[proximo]?.focus();
          return;
        }
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
          tabIndex={valor === u.id || (n === 0 && !vendedores.some((x) => x.id === valor)) ? 0 : -1}
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
