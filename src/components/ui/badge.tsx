import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-tibe-light text-tibe-dark",
        gray: "bg-superficie-afundada text-texto-secundario",
        green: "bg-sucesso-suave text-sucesso-tinta",
        red: "bg-perigo-suave text-perigo-tinta",
        amber: "bg-atencao-suave text-atencao-tinta",
        blue: "bg-info-suave text-info-tinta",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
