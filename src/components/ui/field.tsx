"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Rótulo, controle, dica e erro, com o `htmlFor` cabeado sozinho.
 *
 * Existe por causa de dois defeitos medidos em 2026-08-20:
 *
 * 1. Trinta `<Label>` do produto não tinham `htmlFor`. Um rótulo órfão não é
 *    só uma falha de leitor de tela: tocar nele não foca o campo, e num
 *    celular o rótulo é uma área de toque grande ao lado de um campo pequeno.
 * 2. Os formulários tinham UM `setError` global. Errar a data e receber
 *    "Preencha tipo, categoria, valor e data de vencimento" obriga o produtor
 *    a caçar qual dos quatro campos ele errou.
 *
 * O `id` é gerado com `useId` quando não vem de fora, então o cabeamento
 * acontece por construção e não depende de ninguém lembrar. O `children` é uma
 * função que recebe as props a repassar ao controle, porque o controle pode ser
 * `Input`, `Select` do Radix ou `textarea`, e cada um recebe `id` de um jeito.
 */

export interface FieldProps {
  label: React.ReactNode;
  /** Marca o rótulo com asterisco e liga `aria-required`. */
  required?: boolean;
  /** Dica curta abaixo do controle. Some quando há erro, para não competir. */
  hint?: React.ReactNode;
  /** Mensagem de erro deste campo. Presente = campo inválido. */
  error?: string | null;
  id?: string;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
    "aria-required": boolean | undefined;
  }) => React.ReactNode;
}

export function Field({
  label,
  required,
  hint,
  error,
  id,
  className,
  children,
}: FieldProps) {
  const gerado = React.useId();
  const campoId = id ?? gerado;
  const erroId = `${campoId}-erro`;
  const dicaId = `${campoId}-dica`;

  // Erro e dica não somam: com erro na tela, é o erro que precisa ser lido.
  const descrito = error ? erroId : hint ? dicaId : undefined;

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={campoId}>
        {label}
        {required && (
          <span className="ml-0.5 text-perigo-tinta" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {children({
        id: campoId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": descrito,
        "aria-required": required || undefined,
      })}

      {error ? (
        <p id={erroId} role="alert" className="text-sm text-perigo-tinta">
          {error}
        </p>
      ) : hint ? (
        <p id={dicaId} className="text-xs text-texto-secundario">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
