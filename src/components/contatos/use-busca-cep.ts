"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** O que a rota `GET /api/v1/cep/:cep` devolve. Campo que o CEP não traz vem `null`. */
export type EnderecoDoCep = {
  cep: string;
  street: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export const TEXTO_BUSCANDO_CEP = "Buscando o CEP...";
const FALHA_PADRAO = "Não deu para buscar o CEP agora. Preencha o endereço à mão.";

/**
 * Busca o endereço quando o CEP chega a 8 números (Q340). Chame `aoMudarCep` com o
 * valor mascarado em TODO onChange do campo de CEP: com menos de 8 números ele só
 * cancela a busca em andamento e limpa o aviso; com 8, e diferente da última
 * busca, chama a rota e entrega o endereço em `aoAchar`.
 *
 * A recusa vira `erro` (texto pronto, do servidor): é um aviso junto ao campo, não
 * um erro de validação, porque o cadastro nunca trava por causa do serviço de fora.
 * Quem usa passa `erro` e `buscando` ao `hint` do `Field`, nunca ao `error`.
 *
 * `aoAchar` é lido da última renderização, então enxerga os valores de quando a
 * resposta chega, e não os de quando a busca saiu (é isso que deixa "Rua já
 * preenchida não é sobrescrita" valer mesmo se a pessoa digitou no meio).
 */
export function useBuscaCep(aoAchar: (e: EnderecoDoCep) => void) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ultimo = useRef("");
  const controle = useRef<AbortController | null>(null);
  const achar = useRef(aoAchar);

  useEffect(() => {
    achar.current = aoAchar;
  });
  useEffect(() => () => controle.current?.abort(), []);

  const aoMudarCep = useCallback(async (cepMascarado: string) => {
    const digitos = cepMascarado.replace(/\D/g, "");
    if (digitos.length !== 8) {
      controle.current?.abort();
      controle.current = null;
      ultimo.current = "";
      setBuscando(false);
      setErro(null);
      return;
    }
    if (digitos === ultimo.current) return;
    ultimo.current = digitos;
    controle.current?.abort();
    const meu = new AbortController();
    controle.current = meu;
    setBuscando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/v1/cep/${digitos}`, { signal: meu.signal });
      const json = await res.json().catch(() => null);
      if (meu.signal.aborted) return;
      if (!res.ok || !json?.data) {
        // Libera a mesma busca: digitar o mesmo CEP de novo tenta outra vez.
        ultimo.current = "";
        setErro(typeof json?.error?.message === "string" ? json.error.message : FALHA_PADRAO);
        return;
      }
      achar.current(json.data as EnderecoDoCep);
    } catch {
      if (meu.signal.aborted) return;
      ultimo.current = "";
      setErro(FALHA_PADRAO);
    } finally {
      if (controle.current === meu) {
        controle.current = null;
        setBuscando(false);
      }
    }
  }, []);

  return { buscando, erro, aoMudarCep };
}

/** O texto de ajuda junto ao campo de CEP: a espera, a recusa, ou nada (aí vale a dica do campo). */
export function avisoDoCep(b: { buscando: boolean; erro: string | null }): string | undefined {
  if (b.buscando) return TEXTO_BUSCANDO_CEP;
  return b.erro ?? undefined;
}

/** Depois de preencher, o foco vai ao Número, a menos que a pessoa já tenha ido a outro campo. */
export function focarNumero(idDoNumero: string, idDoCep: string) {
  const ativo = document.activeElement;
  if (ativo && ativo !== document.body && ativo.id !== idDoCep) return;
  document.getElementById(idDoNumero)?.focus();
}
