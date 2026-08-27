"use client";

import { useState } from "react";
import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

/**
 * O estado de erro de um painel de escrita, inteiro, num lugar só.
 *
 * Existe porque a mesma dúzia de linhas apareceu em quatro painéis do Rebanho
 * assim que a conversão começou, e o rollout vai repeti-la em mais vinte e
 * dois. Padrão copiado vinte e duas vezes é padrão que diverge em silêncio: um
 * painel esquece de limpar o erro, outro não move o foco, e ninguém percebe
 * porque cada tela é olhada uma vez só.
 *
 * As DECISÕES continuam fora daqui, em `src/lib/erros-de-formulario.ts`, que
 * tem suíte (`npm run test:m46`). Este hook é só o estado de React em volta
 * delas: sem runner de DOM, o que mora aqui não é testável, então o que mora
 * aqui precisa ser trivial.
 *
 * `prefixoDeId` só é necessário quando dois painéis irmãos vivem na mesma
 * página, como as três ações do animal: `value` existe em dois deles, e id
 * repetido faz o foco cair no painel errado. O nome do campo NA API continua
 * sendo a chave, porque é ele que casa com `error.field` do servidor.
 */
export function useErrosDeFormulario<K extends string>(
  ordem: readonly K[],
  prefixoDeId?: string,
) {
  const [erros, setErros] = useState<Partial<Record<K, string>>>({});
  const [global, setGlobal] = useState<string | null>(null);
  const [foco, setFoco] = useState<K | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const idDe = (campo: K) => (prefixoDeId ? `${prefixoDeId}-${campo}` : campo);

  /** Reprova o envio: pinta os campos, move o foco, conta a tentativa. */
  function reprovar(novos: Partial<Record<K, string>>) {
    setErros(novos);
    setFoco(primeiroInvalido(novos, ordem));
    setTentativa((n) => n + 1);
  }

  /** Traduz a recusa do servidor: campo quando ele diz qual, rodapé quando não. */
  function doServidor(res: { code: string; message: string; field?: string }) {
    const { erros: novos, global: rodape } = aplicarErroDoServidor(res, ordem);
    setGlobal(rodape);
    reprovar(novos);
  }

  /**
   * Some com o erro de um campo assim que ele muda.
   *
   * Sem isto, o aviso vermelho fica embaixo de um campo já corrigido até o
   * próximo envio, e o produtor não sabe se a correção foi aceita. Chame no
   * `onChange` do controle.
   */
  function limparCampo(campo: K) {
    setErros((atuais) => (atuais[campo] ? { ...atuais, [campo]: undefined } : atuais));
  }

  function limparTudo() {
    setErros({});
    setGlobal(null);
  }

  return {
    erros,
    /** Erro que não pertence a campo nenhum. Vai para o rodapé do painel. */
    global,
    setGlobal,
    reprovar,
    doServidor,
    limparCampo,
    limparTudo,
    idDe,
    focarCampoId: foco ? idDe(foco) : null,
    tentativa,
  };
}
