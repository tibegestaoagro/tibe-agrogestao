import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-tibe-primary text-white hover:bg-tibe-dark",
        outline:
          "border border-gray-300 bg-white text-gray-800 shadow-none hover:bg-gray-50 hover:border-gray-400",
        ghost: "text-gray-700 shadow-none hover:bg-gray-100",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        // Novo nesta rodada (identidade visual, laranja como cor de ação):
        // extensão aditiva, não usada em nenhuma página ainda.
        accent: "bg-tibe-accent text-white hover:bg-tibe-accentDark",
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
