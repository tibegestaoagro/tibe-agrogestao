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
          "flex min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-base",
          "sm:min-h-0 sm:h-9 sm:text-sm",
          // O placeholder era `text-gray-400`, que dá 2,85:1 sobre branco e
          // some ao sol. `gray-500` passa em AA.
          "shadow-sm transition-colors placeholder:text-gray-500",
          "focus-visible:outline-none focus-visible:border-tibe-primary focus-visible:ring-2 focus-visible:ring-tibe-primary/40",
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
