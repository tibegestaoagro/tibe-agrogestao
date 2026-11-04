"use client";

import { useLayoutEffect, useState } from "react";

/**
 * `size: <comprimento> auto` é inválido no CSS e o Chrome descarta a
 * declaração inteira, então a bobina nunca chegava ao diálogo de impressão.
 * Medindo a altura do cupom, a página sai com o tamanho exato do recibo.
 */
export function TamanhoDaBobina({ largura }: { largura: 80 | 58 }) {
  const [alturaMm, setAlturaMm] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>("article.cupom");
    if (!el) return;
    const medir = () => setAlturaMm(Math.ceil((el.offsetHeight * 25.4) / 96) + 2);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (alturaMm === null) return null;
  return <style>{`@page { size: ${largura}mm ${alturaMm}mm; margin: 0 }`}</style>;
}
