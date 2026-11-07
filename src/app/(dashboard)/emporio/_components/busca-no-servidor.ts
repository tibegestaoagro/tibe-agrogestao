"use client";

import { useEffect, useRef, useState } from "react";

/** Espera depois da última tecla antes de perguntar ao servidor. */
const ESPERA_MS = 300;

type Pagina<T> = { itens: T[]; total: number; poucosDigitos: boolean };

async function pedirPagina<T>(rota: string, termo: string, pagina: number): Promise<Pagina<T> | { erro: string }> {
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
 *
 * Duas corridas que trocariam a lista pela errada:
 * - digitação rápida: cada pedido leva um número, e só a resposta do último
 *   número entra na lista (a de um texto antigo que chega depois é descartada);
 * - "Carregar mais" depois de mudar o texto: a página seguinte é sempre do termo
 *   que está na lista, e o botão some enquanto o termo digitado não é esse.
 *
 * Abrir a janela recomeça do termo vazio.
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
  const [termo, setTermoEstado] = useState("");
  const [itens, setItens] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [poucosDigitos, setPoucosDigitos] = useState(false);
  const [carregando, setCarregando] = useState(aberta);
  const [erro, setErro] = useState<string | null>(null);
  // O termo e a página do que está na lista agora.
  const [daLista, setDaLista] = useState<{ termo: string; pagina: number } | null>(null);
  const [tentativas, setTentativas] = useState(0);
  const numero = useRef(0);

  // Abrir recomeça: estado ajustado no render, quando `aberta` muda (sem efeito).
  const [abertaAntes, setAbertaAntes] = useState(aberta);
  if (aberta !== abertaAntes) {
    setAbertaAntes(aberta);
    if (aberta) {
      setTermoEstado("");
      setItens([]);
      setTotal(0);
      setPoucosDigitos(false);
      setErro(null);
      setDaLista(null);
      setCarregando(true);
    }
  }

  async function carregar(n: number, t: string, pagina: number, acrescentar: boolean) {
    const r = await pedirPagina<T>(rota, t, pagina);
    if (n !== numero.current) return;
    setCarregando(false);
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setItens((atuais) => (acrescentar ? [...atuais, ...r.itens] : r.itens));
    setTotal(r.total);
    setPoucosDigitos(r.poucosDigitos);
    setDaLista({ termo: t, pagina });
  }

  useEffect(() => {
    if (!aberta) return;
    const espera = setTimeout(
      () => {
        // O número é tirado quando o pedido sai, não quando a tecla cai: assim um
        // "Carregar mais" tocado durante a espera também perde para este pedido.
        numero.current += 1;
        void carregar(numero.current, termo, 1, false);
      },
      termo.trim() === "" ? 0 : ESPERA_MS,
    );
    return () => clearTimeout(espera);
    // `carregar` muda a cada render e só lê `rota`, que já está nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota, aberta, termo, tentativas]);

  function setTermo(s: string) {
    setTermoEstado(s);
    setCarregando(true);
  }

  const temMais = !carregando && erro === null && daLista !== null && daLista.termo === termo && itens.length < total;

  function carregarMais() {
    if (!temMais || !daLista) return;
    numero.current += 1;
    setCarregando(true);
    void carregar(numero.current, daLista.termo, daLista.pagina + 1, true);
  }

  function tentarDeNovo() {
    setErro(null);
    setCarregando(true);
    setTentativas((n) => n + 1);
  }

  return { termo, setTermo, itens, total, poucosDigitos, carregando, erro, temMais, carregarMais, tentarDeNovo };
}
