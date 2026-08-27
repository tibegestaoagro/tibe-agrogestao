"use client";

import * as React from "react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Painel lateral de escrita com um `<form>` DE VERDADE dentro.
 *
 * Os 27 painéis de escrita do produto (todos eles, medido em 2026-08-20) eram
 * uma `<div>` com um botão que chamava `submit()` no clique. Consequência no
 * celular, que é onde o produtor está: a tecla de confirmar do teclado não faz
 * nada. O Android mostra "Ir", o produtor toca, o teclado fecha, e o
 * lançamento não foi. Ele toca de novo, nada. É o tipo de defeito que ninguém
 * reporta como bug: a pessoa conclui que o sistema é ruim.
 *
 * Com `<form onSubmit>`, Enter e a tecla do teclado virtual passam a submeter
 * de graça, porque é comportamento nativo do navegador. `noValidate` desliga a
 * bolha de validação do próprio navegador, que aparece em inglês, some sozinha
 * e não é lida por leitor de tela: a validação é a nossa, campo a campo, pelo
 * `Field`.
 *
 * O rodapé fica preso embaixo (`sticky`) porque formulário longo em tela de
 * celular empurra o botão de salvar para fora da vista, e o produtor rola
 * procurando o que fazer depois de preencher.
 */

export interface FormSheetProps {
  /** O que abre o painel. Recebe `asChild`, então pode ser um `Button`. */
  trigger: React.ReactNode;
  title: string;
  /** Uma frase dizendo o que este painel faz. Some se não vier. */
  description?: React.ReactNode;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Chamado no submit do form: Enter, tecla do teclado ou clique no botão. */
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  /** Rótulo enquanto salva. Padrão: "Salvando...". */
  submitPendingLabel?: string;
  pending?: boolean;
  /** Erro que não pertence a nenhum campo (falha de rede, recusa do servidor). */
  error?: string | null;
  /**
   * Id do campo que deve receber o foco depois de uma recusa. Quem escolhe é
   * `primeiroInvalido`, em `src/lib/erros-de-formulario.ts`; aqui só se
   * executa a escolha.
   *
   * O campo precisa ter `id` estável (passado ao `Field`), porque o `useId`
   * do React gera valor diferente entre servidor e cliente.
   */
  focarCampoId?: string | null;
  /**
   * Contador de tentativas. Precisa mudar a cada submit reprovado, mesmo
   * quando o campo errado é o MESMO da vez anterior: sem ele, `focarCampoId`
   * não muda, o efeito não roda de novo, e o produtor toca em salvar sem nada
   * acontecer na tela.
   */
  tentativa?: number;
  children: React.ReactNode;
}

export function FormSheet({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  submitPendingLabel = "Salvando...",
  pending,
  error,
  focarCampoId,
  tentativa,
  children,
}: FormSheetProps) {
  React.useEffect(() => {
    if (!focarCampoId) return;
    const alvo = document.getElementById(focarCampoId);
    if (!alvo) return;
    // `preventScroll` e depois `scrollIntoView` porque o rolar do próprio
    // foco é abrupto e costuma parar com o campo colado no topo, atrás do
    // cabeçalho fixo do painel.
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focarCampoId, tentativa]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent title={title} className="p-0">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            void onSubmit();
          }}
          className="flex h-full flex-col"
        >
          <SheetHeader className="border-b border-borda px-6 py-4">
            <SheetTitle>{title}</SheetTitle>
            {description && (
              <p className="text-sm text-texto-secundario">{description}</p>
            )}
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">{children}</div>

          <div className="sticky bottom-0 space-y-3 border-t border-borda bg-superficie px-6 py-4">
            {error && (
              <p
                role="alert"
                className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta"
              >
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? submitPendingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
