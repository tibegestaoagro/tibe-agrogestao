import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tabela larga em tela estreita.
 *
 * A regra deste projeto: **a tabela rola dentro do próprio quadro, nunca a
 * página**. Página que rola de lado no celular leva o menu e o cabeçalho junto,
 * e o produtor perde a referência de onde está.
 *
 * `overflow-x-auto` e não `overflow-auto`: o segundo cria também uma área de
 * rolagem vertical, que no toque compete com a rolagem da página e faz o dedo
 * "prender" no meio da tabela.
 *
 * `overscroll-x-contain` impede que o fim da rolagem horizontal vire gesto de
 * voltar do navegador, que apaga o que a pessoa estava preenchendo.
 *
 * A sangria negativa no celular faz a rolagem começar na borda da tela, e é o
 * que sinaliza que há mais coisa ao lado: tabela cortada com folga em volta
 * parece tabela truncada, não tabela rolável.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative -mx-4 w-[calc(100%+2rem)] overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:w-full sm:px-0">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("border-b bg-gray-50", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("divide-y", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn("transition-colors hover:bg-tibe-light/60", className)}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-texto-discreto",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      // Linha de tabela e o alvo de toque mais comum do produto, e era o
      // menor: 37px medidos no celular. O piso vale no celular e some no
      // `sm:`, senao uma tabela de vinte linhas vira uma tabela esparsa
      // no desktop. O seletor de descendente estica o link da celula ate
      // a borda: alvo grande sem inflar a linha.
      "px-3 py-3 align-middle text-gray-800 sm:py-2.5",
      "[&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center sm:[&>a]:min-h-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
