"use client";

import { useEffect, useState } from "react";
import {
  buscaVazia,
  itensVisiveis,
  poucosDigitosVisivel,
  proximaBusca,
  temMaisNaBusca,
  type EventoDaBusca,
  type ResultadoDaPagina,
} from "@/lib/emporio/sequencia-da-busca";

async function pedirPagina<T>(rota: string, termo: string, pagina: number): Promise<ResultadoDaPagina<T>> {
  const url = `${rota}?q=${encodeURIComponent(termo)}&page=${pagina}`;
  try {
    // `fetch` e não `apiGet`: a busca precisa do `meta` (total e poucos dígitos), que o `apiGet` descarta.
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) return { erro: json?.error?.message ?? "Não foi possível buscar agora." };
    return {
      itens: (json?.data ?? []) as T[],
      total: Number(json?.meta?.total ?? 0),
      poucosDigitos: json?.meta?.poucos_digitos === true,
    };
  } catch {
    return { erro: "Não foi possível buscar agora. Confira a conexão." };
  }
}

/**
 * A busca da janela de escolha (cliente, fornecedor) no servidor, por páginas.
 * A sequência (o número de cada pedido, o que entra, o que aparece) é a regra
 * pura de `sequencia-da-busca.ts`; aqui só o React e o `fetch`.
 *
 * Abrir a janela recomeça do termo vazio. "Tentar de novo" recarrega a primeira
 * página do termo (as páginas já vistas do "Carregar mais" saem).
 */
export function useBuscaNoServidor<T>(
  rota: string,
  aberta: boolean,
): {
  termo: string;
  setTermo: (s: string) => void;
  itens: T[];
  total: number;
  poucosDigitos: boolean;
  carregando: boolean;
  erro: string | null;
  temMais: boolean;
  carregarMais: () => void;
  tentarDeNovo: () => void;
} {
  const [estado, setEstado] = useState(() => (aberta ? proximaBusca(buscaVazia<T>(), { tipo: "abrir" }) : buscaVazia<T>()));
  const enviar = (ev: EventoDaBusca<T>) => setEstado((e) => proximaBusca(e, ev));

  // Abrir recomeça: estado ajustado no render, quando `aberta` muda (sem efeito).
  const [abertaAntes, setAbertaAntes] = useState(aberta);
  if (aberta !== abertaAntes) {
    setAbertaAntes(aberta);
    if (aberta) setEstado((e) => proximaBusca(e, { tipo: "abrir" }));
  }

  // Cada pedido novo sai depois da espera dele; trocar de pedido (outra tecla) cancela o timer.
  const pedido = estado.pedido;
  useEffect(() => {
    if (!aberta || !pedido) return;
    const espera = setTimeout(() => {
      void pedirPagina<T>(rota, pedido.termo, pedido.pagina).then((resultado) =>
        setEstado((e) => proximaBusca(e, { tipo: "resposta", numero: pedido.numero, resultado })),
      );
    }, pedido.espera);
    return () => clearTimeout(espera);
  }, [rota, aberta, pedido]);

  return {
    termo: estado.termo,
    setTermo: (s) => enviar({ tipo: "digitar", termo: s }),
    itens: itensVisiveis(estado),
    total: estado.total,
    poucosDigitos: poucosDigitosVisivel(estado),
    carregando: estado.carregando,
    erro: estado.erro,
    temMais: temMaisNaBusca(estado),
    carregarMais: () => enviar({ tipo: "mais" }),
    tentarDeNovo: () => enviar({ tipo: "tentar" }),
  };
}
