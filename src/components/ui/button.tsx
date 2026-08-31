import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria-tinta focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  {
    variants: {
      /**
       * Texto ESCURO sobre a cor da marca, não branco.
       *
       * Medido em 2026-08-20: branco sobre o verde `#649721` dá 3,51:1 e sobre
       * o laranja `#E97D0F` dá 2,84:1. Os dois reprovam em AA, ou seja, o botão
       * primário de todo o produto era ilegível ao sol, que é onde ele é usado.
       * O verde-escuro da própria marca resolve sem tocar no hex que o cliente
       * aprovou: 4,68:1 no verde e 5,79:1 no laranja.
       *
       * Consequência: o hover CLAREIA em vez de escurecer. Escurecer o fundo
       * sob texto escuro derruba o contraste de volta para 3,49:1.
       */
      variant: {
        default: "bg-primaria text-sobre-primaria hover:bg-primaria-hover",
        outline:
          "border border-borda-forte bg-superficie text-texto shadow-none hover:border-borda-campo hover:bg-superficie-afundada",
        ghost: "text-texto-secundario shadow-none hover:bg-superficie-afundada",
        // `text-superficie` e não `text-texto-invertido`: o gate de contraste
        // confere o par ["botao destrutivo", "superficie", "perigo"], e é esse
        // o par desenhado.
        destructive: "bg-perigo text-superficie hover:bg-perigo-tinta",
        accent: "bg-acento text-sobre-acento hover:bg-acento-hover",
      },
      /**
       * Alvo de toque: 44px no celular, densidade no desktop.
       *
       * Medido no DOM em 2026-08-20, antes desta mudança: 41 dos 42 alvos da
       * tela Meu Dia e 71 dos 72 do Financeiro ficavam abaixo de 44px. Num
       * produto usado com a mão suja, de luva, no sol, isso é o problema de
       * usabilidade mais mecânico que existe.
       *
       * O piso vale onde ele importa, e some no `sm:` para cima: no desktop o
       * ponteiro é preciso e uma tabela com dez ações de 44px vira uma tabela
       * esparsa. `text-sm` mínimo pelo mesmo motivo: 12px num botão é rótulo
       * ilegível ao sol, e `text-xs` no `sm` era o menor do produto.
       */
      size: {
        default: "min-h-11 px-4 py-2 sm:min-h-0 sm:h-9",
        sm: "min-h-11 rounded-md px-3 text-sm sm:min-h-0 sm:h-8 sm:text-xs",
        lg: "min-h-12 rounded-lg px-6 text-base sm:min-h-0 sm:h-10 sm:text-sm",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
