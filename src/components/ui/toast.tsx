"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O aviso que o produto não tinha.
 *
 * Até 2026-08-20 não existia nenhum feedback de sucesso em lugar nenhum: uma
 * ação dava certo e a tela apenas piscava. Pior, sete ações falhavam em
 * SILÊNCIO (concluir tarefa, arquivar pasto, trocar propriedade, preferências
 * de alerta, e os botões de pagar e cancelar do financeiro): o botão voltava
 * ao normal, a linha continuava igual, e o produtor não sabia se salvou. No
 * 4G ruim do curral, ele toca de novo.
 *
 * Decisões que valem explicação:
 *
 * - **`aria-live` de verdade**, e com prioridade diferente por tipo: sucesso é
 *   `polite` (não interrompe quem está lendo), erro é `assertive` (interrompe,
 *   porque exige ação). Antes disto o projeto tinha ZERO região `aria-live`.
 * - **Erro não some sozinho.** Sucesso desaparece em 4 segundos porque o
 *   resultado já está na tela; erro fica até alguém fechar, porque some antes
 *   de ser lido é o mesmo que não ter avisado.
 * - **Alvo de fechar com 44px**, como todo alvo de toque deste produto daqui
 *   para frente.
 * - **Respeita `prefers-reduced-motion`**: a entrada é a única animação, e
 *   quem pediu menos movimento não recebe nenhuma.
 */

type TipoDeAviso = "sucesso" | "erro";

type Aviso = {
  id: number;
  tipo: TipoDeAviso;
  texto: string;
};

type ContextoDeAviso = {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
};

const Contexto = createContext<ContextoDeAviso | null>(null);

/** Sucesso some; erro espera ser lido. */
const DURACAO_SUCESSO_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);

  const fechar = useCallback((id: number) => {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo: TipoDeAviso, texto: string) => {
      const id = proximoId.current++;
      setAvisos((atuais) => [...atuais, { id, tipo, texto }]);
      if (tipo === "sucesso") {
        setTimeout(() => fechar(id), DURACAO_SUCESSO_MS);
      }
    },
    [fechar],
  );

  // `useMemo`, e não um ref mutado no render: o React 19 proíbe tocar em ref
  // durante o render, e com razão. `mostrar` é estável por `useCallback`, então
  // o valor do contexto não muda a cada pintura e os consumidores não
  // rerenderizam à toa.
  const valor = useMemo<ContextoDeAviso>(
    () => ({
      sucesso: (texto: string) => mostrar("sucesso", texto),
      erro: (texto: string) => mostrar("erro", texto),
    }),
    [mostrar],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <AvisosNaTela avisos={avisos} aoFechar={fechar} />
    </Contexto.Provider>
  );
}

function AvisosNaTela({
  avisos,
  aoFechar,
}: {
  avisos: Aviso[];
  aoFechar: (id: number) => void;
}) {
  return (
    <>
      {/* Duas regiões, porque a prioridade de leitura é diferente. Ficam
          sempre no DOM: região criada junto com o conteúdo não é anunciada
          por parte dos leitores de tela. */}
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {avisos.filter((a) => a.tipo === "sucesso").map((a) => (
          <p key={a.id}>{a.texto}</p>
        ))}
      </div>
      <div aria-live="assertive" aria-atomic="false" className="sr-only">
        {avisos.filter((a) => a.tipo === "erro").map((a) => (
          <p key={a.id}>{a.texto}</p>
        ))}
      </div>

      {/* No celular os avisos nascem embaixo, ao alcance do polegar e longe do
          topo, onde o teclado virtual e a barra do navegador disputam espaço.
          `pointer-events-none` no contêiner deixa o toque passar para a tela
          onde não há aviso. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {avisos.map((aviso) => (
          <AvisoUnico key={aviso.id} aviso={aviso} aoFechar={aoFechar} />
        ))}
      </div>
    </>
  );
}

function AvisoUnico({ aviso, aoFechar }: { aviso: Aviso; aoFechar: (id: number) => void }) {
  const [entrou, setEntrou] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntrou(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const sucesso = aviso.tipo === "sucesso";
  const Icone = sucesso ? Check : TriangleAlert;

  return (
    <div
      role={sucesso ? "status" : "alert"}
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border p-3 shadow-lg shadow-black/10",
        "transition-all duration-200 ease-out motion-reduce:transition-none",
        entrou ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        sucesso
          ? "border-tibe-primary/30 bg-white text-tibe-dark"
          : "border-red-300 bg-white text-red-900",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          sucesso ? "bg-tibe-primary/15 text-primaria-tinta" : "bg-red-100 text-red-700",
        )}
      >
        <Icone className="h-4 w-4" />
      </span>

      <p className="flex-1 pt-0.5 text-sm leading-snug">{aviso.texto}</p>

      <button
        type="button"
        onClick={() => aoFechar(aviso.id)}
        aria-label="Fechar aviso"
        className={cn(
          // 44px de alvo, com o ícone menor dentro: o alvo é o que o dedo
          // precisa acertar, não o desenho.
          "-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary",
          sucesso ? "text-tibe-dark/50 hover:text-tibe-dark" : "text-red-700/60 hover:text-red-900",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Como avisar o produtor. Lança se usado fora do provider, porque um aviso que
 * não aparece é o defeito que este componente existe para corrigir.
 */
export function useAviso(): ContextoDeAviso {
  const ctx = useContext(Contexto);
  if (!ctx) {
    throw new Error("useAviso precisa estar dentro de <ToastProvider>.");
  }
  return ctx;
}
