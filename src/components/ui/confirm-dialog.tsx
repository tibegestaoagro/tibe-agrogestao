"use client";

import { useState, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Confirmação de ação destrutiva, no lugar do `window.confirm()`.
 *
 * O nativo tem três problemas concretos aqui, e nenhum é estético: ele
 * **bloqueia a thread** (num celular fraco a tela congela), não tem controle
 * de foco que volte para o botão de origem, e a pergunta aparece com a cara do
 * sistema operacional, não do produto. Havia seis usos espalhados.
 *
 * O que este componente exige e o nativo não permitia:
 *
 * - **Dizer o que vai acontecer**, não só perguntar "tem certeza?". O título
 *   nomeia a ação e a descrição diz a consequência, porque "Cancelar este
 *   lançamento?" não conta que o valor sai do total do mês.
 * - **O botão de confirmar nomeia a ação** ("Cancelar lançamento"), nunca
 *   "OK". Em diálogo destrutivo, "OK" é a palavra que faz a pessoa clicar sem
 *   ler.
 * - **Estado de carregando**, porque a ação é assíncrona e o diálogo não pode
 *   sumir antes de saber se deu certo.
 *
 * Radix cuida de foco preso, Escape e devolução do foco ao gatilho.
 */
export function ConfirmDialog({
  gatilho,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo = true,
  aoConfirmar,
}: {
  /** O que abre o diálogo. Recebe o comportamento de gatilho do Radix. */
  gatilho: React.ReactNode;
  titulo: string;
  /** A consequência, em uma frase. É o que o `confirm()` nativo não tinha onde colocar. */
  descricao: string;
  rotuloConfirmar: string;
  destrutivo?: boolean;
  aoConfirmar: () => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const confirmar = useCallback(async () => {
    setOcupado(true);
    try {
      await aoConfirmar();
      setAberto(false);
    } finally {
      setOcupado(false);
    }
  }, [aoConfirmar]);

  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(v) => !ocupado && setAberto(v)}>
      <DialogPrimitive.Trigger asChild>{gatilho}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-sobreposicao/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-borda bg-superficie p-5 shadow-xl shadow-black/15",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "motion-reduce:animate-none",
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-tibe-dark">
            {titulo}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-texto-secundario">
            {descricao}
          </DialogPrimitive.Description>

          {/* No celular os botões empilham e o de confirmar fica embaixo, ao
              alcance do polegar. Em tela larga voltam à ordem convencional. */}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" disabled={ocupado} className="min-h-11 sm:min-h-0">
                Voltar
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant={destrutivo ? "destructive" : "default"}
              onClick={confirmar}
              disabled={ocupado}
              className="min-h-11 sm:min-h-0"
            >
              {ocupado ? "Aguarde..." : rotuloConfirmar}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
