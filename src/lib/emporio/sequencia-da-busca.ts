/**
 * A sequência da busca da janela de escolha (cliente, fornecedor), como regra
 * pura: o gancho `useBuscaNoServidor` só a liga ao React e ao `fetch`.
 *
 * Cada mudança (abrir, digitar, "Carregar mais", "Tentar de novo") tira um
 * número de pedido NA HORA, e só a resposta desse número entra. Assim a resposta
 * de um termo velho que chega durante a espera de 300 ms do termo novo é
 * descartada, e o "Buscando..." continua até a resposta do termo digitado.
 */

export const ESPERA_DA_DIGITACAO_MS = 300;

/** A frase dos poucos dígitos: a janela de escolha e as telas Clientes e Fornecedores a mostram igual. */
export const POUCOS_DIGITOS = "Digite pelo menos 3 números para buscar por CPF/CNPJ ou telefone.";

export type ResultadoDaPagina<T> = { itens: T[]; total: number; poucosDigitos: boolean } | { erro: string };

/** O pedido a fazer: o número, o termo, a página, e quanto esperar antes de sair. */
export type Pedido = { numero: number; termo: string; pagina: number; acrescentar: boolean; espera: number };

export type EstadoDaBusca<T> = {
  termo: string;
  itens: T[];
  total: number;
  poucosDigitos: boolean;
  carregando: boolean;
  erro: string | null;
  /** O termo e a página do que está em `itens`. */
  daLista: { termo: string; pagina: number } | null;
  /** O último pedido: só a resposta com este número entra. */
  pedido: Pedido | null;
};

export type EventoDaBusca<T> =
  | { tipo: "abrir" }
  | { tipo: "digitar"; termo: string }
  | { tipo: "mais" }
  | { tipo: "tentar" }
  | { tipo: "resposta"; numero: number; resultado: ResultadoDaPagina<T> };

export function buscaVazia<T>(): EstadoDaBusca<T> {
  return { termo: "", itens: [], total: 0, poucosDigitos: false, carregando: false, erro: null, daLista: null, pedido: null };
}

function novoPedido<T>(e: EstadoDaBusca<T>, p: Omit<Pedido, "numero">): Pedido {
  return { ...p, numero: (e.pedido?.numero ?? 0) + 1 };
}

/** A lista em `itens` é do termo que está no campo. */
function listaDoTermo<T>(e: EstadoDaBusca<T>): boolean {
  return e.daLista !== null && e.daLista.termo === e.termo;
}

export function proximaBusca<T>(e: EstadoDaBusca<T>, ev: EventoDaBusca<T>): EstadoDaBusca<T> {
  switch (ev.tipo) {
    case "abrir": {
      // Recomeça do termo vazio; o número continua subindo, para nada de antes de fechar entrar.
      const base = { ...buscaVazia<T>(), pedido: e.pedido };
      return { ...base, carregando: true, pedido: novoPedido(base, { termo: "", pagina: 1, acrescentar: false, espera: 0 }) };
    }
    case "digitar":
      return {
        ...e,
        termo: ev.termo,
        carregando: true,
        erro: null,
        pedido: novoPedido(e, {
          termo: ev.termo,
          pagina: 1,
          acrescentar: false,
          espera: ev.termo.trim() === "" ? 0 : ESPERA_DA_DIGITACAO_MS,
        }),
      };
    case "mais": {
      if (!temMaisNaBusca(e) || !e.daLista) return e;
      const { termo, pagina } = e.daLista;
      return { ...e, carregando: true, pedido: novoPedido(e, { termo, pagina: pagina + 1, acrescentar: true, espera: 0 }) };
    }
    case "tentar":
      return { ...e, carregando: true, erro: null, pedido: novoPedido(e, { termo: e.termo, pagina: 1, acrescentar: false, espera: 0 }) };
    case "resposta": {
      const p = e.pedido;
      if (!p || ev.numero !== p.numero) return e;
      if ("erro" in ev.resultado) return { ...e, carregando: false, erro: ev.resultado.erro };
      const r = ev.resultado;
      return {
        ...e,
        carregando: false,
        erro: null,
        itens: p.acrescentar ? [...e.itens, ...r.itens] : r.itens,
        total: r.total,
        poucosDigitos: r.poucosDigitos,
        daLista: { termo: p.termo, pagina: p.pagina },
      };
    }
  }
}

export function temMaisNaBusca<T>(e: EstadoDaBusca<T>): boolean {
  return !e.carregando && e.erro === null && listaDoTermo(e) && e.itens.length < e.total;
}

/**
 * O que a janela mostra: a lista só quando é do termo digitado e sem falha. Uma
 * lista de outro termo não aparece como se fosse a atual.
 */
export function itensVisiveis<T>(e: EstadoDaBusca<T>): T[] {
  return e.erro === null && listaDoTermo(e) ? e.itens : [];
}

/** O aviso de poucos dígitos vale só para o termo que o recebeu. */
export function poucosDigitosVisivel<T>(e: EstadoDaBusca<T>): boolean {
  return e.poucosDigitos && listaDoTermo(e);
}

/** Enter escolhe sozinho só com um termo digitado, a lista dele pronta, sem falha e com um resultado só. */
export function escolhaPeloEnter<T>(v: { termo: string; carregando: boolean; erro: string | null; itens: T[] }): T | null {
  if (v.carregando || v.erro !== null || v.termo.trim() === "" || v.itens.length !== 1) return null;
  return v.itens[0];
}
