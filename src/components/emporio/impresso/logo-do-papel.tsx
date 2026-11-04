"use client";

import { useState } from "react";

/**
 * Logo do cabeçalho do A4. Client só por causa do `onError`: se a imagem não
 * carregar, some, e o papel sai só com o nome da loja. A versão na URL derruba
 * o cache de 5 minutos da rota quando o logo é trocado.
 */
export function LogoDoPapel({ versao }: { versao: string | null }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="logo"
      src={`/api/v1/emporio/settings/logo?v=${encodeURIComponent(versao ?? "")}`}
      alt=""
      onError={() => setFalhou(true)}
    />
  );
}
