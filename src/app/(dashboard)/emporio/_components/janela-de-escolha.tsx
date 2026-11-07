"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { escolhaPeloEnter } from "@/lib/emporio/sequencia-da-busca";
import type { useBuscaNoServidor } from "./busca-no-servidor";

/** O que o `<Field>` passa ao filho: o `id` e o `aria`, para o rótulo e a recusa apontarem para ele. */
export type CampoDoField = {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
  "aria-required": boolean | undefined;
};

const POUCOS_DIGITOS = "Digite pelo menos 3 números para buscar por CPF/CNPJ ou telefone.";

/**
 * A janela de escolha por busca no servidor (cliente na venda, fornecedor na
 * compra): o campo de busca, a linha fixa do topo, a lista com os estados e o
 * "Carregar mais", e o rodapé de cadastrar. Não escreve nada.
 *
 * Enter no campo nunca envia o formulário de trás (a janela pode abrir dentro
 * da Troca, que é um `FormSheet`): com um resultado só, ele escolhe.
 */
export function JanelaDeEscolha<T extends { id: string; name: string }>({
  titulo,
  tipo,
  aberta,
  onAbertaChange,
  busca,
  fixoNoTopo,
  linha,
  onEscolher,
  onCadastrar,
}: {
  titulo: string;
  tipo: "cliente" | "fornecedor";
  aberta: boolean;
  onAbertaChange: (a: boolean) => void;
  busca: ReturnType<typeof useBuscaNoServidor<T>>;
  fixoNoTopo?: React.ReactNode;
  linha: (item: T) => React.ReactNode;
  onEscolher: (item: T) => void;
  onCadastrar?: (termo: string) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const vazio = !busca.carregando && busca.erro === null && !busca.poucosDigitos && busca.itens.length === 0;

  return (
    <Sheet open={aberta} onOpenChange={onAbertaChange}>
      <SheetContent
        title={titulo}
        data-escolha={tipo}
        className="p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          campo.current?.focus();
        }}
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="gap-3 border-b border-borda px-6 py-4">
            <SheetTitle>{titulo}</SheetTitle>
            <Input
              ref={campo}
              type="search"
              aria-label={`Buscar ${tipo}`}
              placeholder="Nome, CPF/CNPJ ou telefone"
              autoComplete="off"
              value={busca.termo}
              onChange={(e) => busca.setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                // `busca.itens` já é só a lista do termo digitado (`itensVisiveis`).
                const unico = escolhaPeloEnter(busca);
                if (unico) onEscolher(unico);
              }}
            />
          </SheetHeader>

          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4" aria-busy={busca.carregando}>
            {fixoNoTopo}

            {busca.erro !== null ? (
              <div role="alert" className="space-y-2 rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
                <p>{busca.erro}</p>
                <Button type="button" variant="outline" size="sm" onClick={busca.tentarDeNovo}>
                  Tentar de novo
                </Button>
              </div>
            ) : busca.poucosDigitos ? (
              <p className="text-sm text-texto-secundario">{POUCOS_DIGITOS}</p>
            ) : vazio ? (
              <p className="text-sm text-texto-secundario">Nenhum {tipo} encontrado.</p>
            ) : null}

            {busca.erro === null &&
              !busca.poucosDigitos &&
              busca.itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-opcao
                  data-nome={item.name}
                  onClick={() => onEscolher(item)}
                  className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border border-borda bg-superficie-afundada px-3 py-2 text-left text-sm text-texto hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria-tinta"
                >
                  {linha(item)}
                </button>
              ))}

            {busca.carregando && (
              <p role="status" className="text-sm text-texto-secundario">
                Buscando...
              </p>
            )}

            {busca.temMais && (
              <Button type="button" variant="outline" className="w-full" onClick={busca.carregarMais}>
                Carregar mais
              </Button>
            )}
          </div>

          {onCadastrar && (
            <div className="border-t border-borda px-6 py-4">
              <Button type="button" variant="outline" className="w-full" onClick={() => onCadastrar(busca.termo)}>
                Não achou? Cadastrar novo
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
