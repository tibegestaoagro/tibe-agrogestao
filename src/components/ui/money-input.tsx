"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { lerNumeroBr } from "@/lib/numero-br";
import { cn } from "@/lib/utils";

/**
 * Campo de dinheiro e de quantidade, do jeito que o brasileiro escreve.
 *
 * `<input type="number">` é o controle ERRADO para isto, e não por gosto:
 * medido no Chrome em 2026-08-20, com `type="number"`,
 *
 *   digitado "1.500,00"  ->  .value = ""      ->  Number() = 0
 *   digitado "1.500"     ->  .value = "1.500" ->  Number() = 1.5
 *
 * e nos dois casos `validity.valid` é `true`. Ou seja: o produtor conta 1.500
 * cabeças ou digita mil e quinhentos reais, e o sistema grava 1,5 sem reclamar
 * de nada. O parser do navegador é o do inglês, e não há como trocá-lo.
 *
 * A correção é `type="text"` com `inputMode="decimal"` (o celular continua
 * abrindo o teclado numérico) e a leitura por `lerNumeroBr`, o mesmo módulo
 * puro que o agente do WhatsApp usa. É de propósito que seja o mesmo: o
 * comentário de `src/lib/numero-br.ts` conta que este erro já foi corrigido
 * duas vezes, e voltou nas duas porque a tela tinha um parser próprio.
 *
 * O eco embaixo do campo ("R$ 1.500,00") não é enfeite. "1.500" é ambíguo em
 * português, e a única resposta honesta é mostrar ao produtor o número que vai
 * ser gravado, antes de ele salvar.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const QUANTIDADE = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  /** O que o usuário digitou, cru. O dono do estado é quem chama. */
  value: string;
  onValueChange: (bruto: string) => void;
  /** `dinheiro` mostra o eco em R$; `quantidade` mostra só o número. */
  kind?: "dinheiro" | "quantidade";
  /** Sufixo do eco quando `kind` é quantidade: "kg", "cabeças", "ha". */
  unit?: string;
  /** Esconde o eco. Use só quando o campo já vive ao lado de um total. */
  hideEcho?: boolean;
}

/** Lê o que o usuário digitou. `null` quando está vazio ou ilegível. */
export function lerValorDoCampo(bruto: string): number | null {
  return lerNumeroBr(bruto);
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, kind = "dinheiro", unit, hideEcho, className, ...props }, ref) => {
    const numero = lerNumeroBr(value);
    const temTexto = value.trim() !== "";

    const eco =
      numero === null
        ? null
        : kind === "dinheiro"
          ? MOEDA.format(numero)
          : QUANTIDADE.format(numero) + (unit ? ` ${unit}` : "");

    return (
      <div className="space-y-1">
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn(className)}
          {...props}
        />
        {!hideEcho && temTexto && (
          <p
            className={cn(
              "text-xs",
              numero === null ? "text-perigo-tinta" : "text-texto-secundario",
            )}
            // `polite` porque o eco muda a cada tecla: `assertive` faria o
            // leitor de tela interromper o próprio usuário enquanto digita.
            aria-live="polite"
          >
            {numero === null ? "Não consegui ler esse número." : eco}
          </p>
        )}
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
