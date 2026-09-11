"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAviso } from "@/components/ui/toast";
import { apiGet, apiPost } from "@/lib/client-api";

/**
 * §37 e §39: depois do calculo, o produtor pode mandar o material para a
 * Minha Lista de Compra, comparado com o que ele ja tem no estoque.
 *
 * ⚠️ **Isto quebra, de proposito, a premissa de que a calculadora nao fala com
 * a rede.** As 12 telas originais rodavam inteiras no navegador, e comparar com
 * o estoque exige ler o saldo do tenant. A quebra e contida: o saldo so e
 * buscado quando o produtor ABRE este painel. Calculo que ninguem vai comprar
 * continua sem chamar nada.
 *
 * ⚠️ **Casar material com produto do catalogo e ESCOLHA, nunca adivinhacao por
 * nome.** "Arame liso 500m" e "arame" sao a mesma coisa para uma pessoa e dois
 * produtos diferentes para o estoque, e errar aqui contamina saldo. Sem
 * escolha, o item nasce so com a descricao, que e o item hibrido que a Lista
 * ja aceita.
 */

export type Material = {
  /** O que aparece na lista quando nenhum produto e escolhido. */
  descricao: string;
  quantidade: number;
  unidade?: string;
};

type ProdutoDaApi = {
  id: string;
  name: string;
  unit: string;
  saldo_total: number;
};

type Escolha = {
  /** Vazio quer dizer "sem produto do catalogo", e esse e um caso legitimo. */
  product_id: string;
  incluir: boolean;
};

const SEM_PRODUTO = "__sem_produto__";

export default function MateriaisParaLista({ materiais }: { materiais: Material[] }) {
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoDaApi[] | null>(null);
  const [escolhas, setEscolhas] = useState<Escolha[]>(() =>
    materiais.map(() => ({ product_id: "", incluir: true })),
  );
  const [enviando, setEnviando] = useState(false);
  /** O que a duplicata do §19.7 barrou na ultima tentativa. */
  const [jaNaLista, setJaNaLista] = useState<string[]>([]);

  useEffect(() => {
    if (!aberto || produtos !== null) return;
    let vivo = true;
    apiGet<ProdutoDaApi[]>("/api/v1/products").then((r) => {
      if (!vivo) return;
      if (r.ok) setProdutos(r.data);
      else {
        /* Sem catalogo o painel continua util: da para anotar por descricao. */
        setProdutos([]);
        aviso.erro(r.message);
      }
    });
    return () => {
      vivo = false;
    };
  }, [aberto, produtos, aviso]);

  function saldoDe(indice: number): number | null {
    const id = escolhas[indice]?.product_id;
    if (!id || !produtos) return null;
    return produtos.find((p) => p.id === id)?.saldo_total ?? null;
  }

  function faltaDe(indice: number): number {
    const saldo = saldoDe(indice);
    const necessario = materiais[indice].quantidade;
    if (saldo === null) return necessario;
    return Math.max(0, necessario - saldo);
  }

  /*
   * ⚠️ **A duplicata AVISA e nao e atropelada.** Passar `permitir_duplicata`
   * direto seria mais simples e erraria justamente onde este painel e usado:
   * quem calcula a mesma cerca duas vezes precisa SABER que ja anotou aquilo,
   * senao compra arame em dobro. Os repetidos voltam num aviso proprio, e
   * insistir e um segundo clique consciente.
   */
  async function enviar(insistindo: boolean) {
    setEnviando(true);
    let criados = 0;
    const repetidos: string[] = [];
    let primeiroErro: string | null = null;

    for (let i = 0; i < materiais.length; i += 1) {
      if (!escolhas[i].incluir) continue;
      const falta = faltaDe(i);
      /* Material que o estoque ja cobre nao vira item: o §39 quer que o
         produtor compre o que FALTA, nao o que ele ja tem no galpao. */
      if (falta <= 0) continue;

      const material = materiais[i];
      const produto = produtos?.find((p) => p.id === escolhas[i].product_id);
      const descricao = produto ? produto.name : material.descricao;

      const r = await apiPost<{ id: string }>("/api/v1/shopping-items", {
        description: descricao,
        product_id: produto ? produto.id : undefined,
        quantity: Number(falta.toFixed(3)),
        unit: produto ? produto.unit : undefined,
        permitir_duplicata: insistindo,
      });
      if (r.ok) criados += 1;
      else if (r.code === "ITEM_JA_NA_LISTA") repetidos.push(descricao);
      else if (!primeiroErro) primeiroErro = r.message;
    }

    setEnviando(false);
    setJaNaLista(repetidos);

    if (criados > 0) {
      aviso.sucesso(
        criados === 1 ? "1 item foi para a sua lista de compra." : `${criados} itens foram para a sua lista de compra.`,
      );
    }
    if (repetidos.length === 0) {
      if (criados === 0) {
        aviso.erro(primeiroErro ?? "Nada foi adicionado: o estoque já cobre tudo o que foi calculado.");
      } else {
        setAberto(false);
      }
    }
  }

  if (materiais.length === 0) return null;

  if (!aberto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        Adicionar à Lista de Compra
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h2 className="text-sm font-semibold text-texto">Adicionar à Lista de Compra</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Escolher o produto do seu catálogo é opcional. Sem ele, o item entra pela descrição, e
          você diz qual produto é na hora de registrar a compra.
        </p>
      </div>

      {produtos === null && <p className="text-sm text-texto-secundario">Lendo o seu estoque...</p>}

      {produtos !== null &&
        materiais.map((material, indice) => {
          const saldo = saldoDe(indice);
          const falta = faltaDe(indice);
          const jaTem = saldo !== null && falta <= 0;

          return (
            <div key={`${material.descricao}-${indice}`} className="space-y-1.5 border-t border-borda pt-3">
              <label className="flex items-center gap-2 text-sm text-texto">
                <input
                  type="checkbox"
                  checked={escolhas[indice].incluir}
                  onChange={(e) =>
                    setEscolhas((atual) =>
                      atual.map((esc, i) => (i === indice ? { ...esc, incluir: e.target.checked } : esc)),
                    )
                  }
                  className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-tibe-primary"
                />
                <span className="font-medium">
                  {material.descricao}: {material.quantidade}
                  {material.unidade ? ` ${material.unidade}` : ""}
                </span>
              </label>

              <Label htmlFor={`produto-${indice}`} className="text-xs text-texto-secundario">
                Produto do catálogo (opcional)
              </Label>
              <Select
                value={escolhas[indice].product_id || SEM_PRODUTO}
                onValueChange={(valor) =>
                  setEscolhas((atual) =>
                    atual.map((esc, i) =>
                      i === indice ? { ...esc, product_id: valor === SEM_PRODUTO ? "" : valor } : esc,
                    ),
                  )
                }
              >
                <SelectTrigger id={`produto-${indice}`}>
                  <SelectValue placeholder="Sem produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PRODUTO}>Sem produto do catálogo</SelectItem>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {saldo !== null && (
                <p className="text-xs text-texto-secundario">
                  {jaTem
                    ? `Você já tem ${saldo} no estoque: nada a comprar.`
                    : `Você tem ${saldo} no estoque. Faltam comprar ${Number(falta.toFixed(3))}.`}
                </p>
              )}
            </div>
          );
        })}

      {jaNaLista.length > 0 && (
        <div className="space-y-2 rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          <p>
            Você já tem {jaNaLista.join(", ")} na sua lista. Quer anotar mais assim mesmo?
          </p>
          <Button type="button" onClick={() => enviar(true)} disabled={enviando}>
            Anotar mesmo assim
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={() => enviar(false)} disabled={enviando || produtos === null}>
          {enviando ? "Adicionando..." : "Adicionar à lista"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
