import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 44px de alvo no celular, como no Button. E `text-base` no
          // celular por um motivo específico do iOS: campo com fonte abaixo de
          // 16px faz o Safari dar zoom automático ao focar, e o produtor perde
          // o enquadramento da tela no meio do preenchimento.
          // A borda usa `--borda-campo`, não a cinza clara de antes: a cinza
          // dava 1,47:1 contra o branco, e a WCAG 1.4.11 exige 3:1 para o
          // contorno de um controle. Na prática, era um campo que sumia ao sol.
          "flex min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-1 text-base",
          "sm:min-h-0 sm:h-9 sm:text-sm",
          // O placeholder era a cinza clara do Tailwind (2,85:1 sobre branco),
          // que some ao sol. `--texto-discreto` dá 4,83:1 e passa em AA.
          "shadow-sm transition-colors placeholder:text-texto-discreto",
          "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
