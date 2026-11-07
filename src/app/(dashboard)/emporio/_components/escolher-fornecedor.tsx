"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reaisBr } from "@/lib/numero-br";
import { formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";
import type { FornecedorDaBusca, FornecedorEscolhido } from "@/lib/actions/emporio-fornecedores";
import { FornecedorForm } from "./fornecedor-form";
import { useBuscaNoServidor } from "./busca-no-servidor";
import { JanelaDeEscolha, type CampoDoField } from "./janela-de-escolha";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

const documentoOuNada = (d: string | null) => (d ? formatarDocumento(d) : "sem CPF/CNPJ");

/** O que a busca digitou vira o começo do cadastro: com letra, o nome; só dígitos, o telefone. */
function inicialDoTermo(termo: string): { name?: string; phone?: string } | undefined {
  const t = termo.trim();
  if (/\p{L}/u.test(t)) return { name: t };
  if (/\d/.test(t)) return { phone: t };
  return undefined;
}

/**
 * O campo Fornecedor da Compra (opcional): sem fornecedor, os botões "Escolher
 * fornecedor" e "Cadastrar novo fornecedor"; com fornecedor, o quadro dele, o
 * "Trocar" e o "Tirar fornecedor". A escolha é pela janela de busca no servidor.
 *
 * O contêiner recebe o `id` e o `aria` do `<Field>` (e `tabIndex={-1}`): é nele
 * que cai o foco quando o servidor recusa o fornecedor.
 */
export function EscolherFornecedor({
  campo,
  valor,
  onEscolher,
  permitirCadastro = true,
}: {
  campo: CampoDoField;
  valor: FornecedorEscolhido | null;
  /** Também chamado depois de "Cadastrar novo", e com `null` no "Tirar fornecedor". */
  onEscolher: (f: FornecedorEscolhido | null) => void;
  permitirCadastro?: boolean;
}) {
  const [janela, setJanela] = useState(false);
  const [novo, setNovo] = useState(false);
  const [inicial, setInicial] = useState<{ name?: string; phone?: string } | undefined>(undefined);
  const busca = useBuscaNoServidor<FornecedorDaBusca>("/api/v1/emporio/suppliers/search", janela);

  function escolher(f: FornecedorEscolhido) {
    onEscolher(f);
    setJanela(false);
  }

  function cadastrar(termo: string) {
    setJanela(false);
    setInicial(inicialDoTermo(termo));
    setNovo(true);
  }

  return (
    <div {...campo} role="group" aria-label="Fornecedor" tabIndex={-1} className="space-y-2">
      {valor ? (
        <div
          data-escolhido="fornecedor"
          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-borda bg-superficie-afundada px-3 py-2"
        >
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-texto">
              <span className="break-words">{valor.name}</span>
            </p>
            <p className="text-xs text-texto-secundario">
              {valor.kind === "propriedade"
                ? "Propriedade do dono"
                : `${formatarTelefone(valor.phone)}, ${documentoOuNada(valor.document)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" aria-label="Trocar fornecedor" onClick={() => setJanela(true)}>
              Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEscolher(null)}>
              Tirar fornecedor
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-texto-secundario">Nenhum fornecedor escolhido.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setJanela(true)}>
              Escolher fornecedor
            </Button>
            {permitirCadastro && (
              <Button type="button" variant="outline" onClick={() => cadastrar("")}>
                Cadastrar novo fornecedor
              </Button>
            )}
          </div>
        </>
      )}

      <JanelaDeEscolha<FornecedorDaBusca>
        titulo="Escolher fornecedor"
        tipo="fornecedor"
        aberta={janela}
        onAbertaChange={setJanela}
        busca={busca}
        onEscolher={escolher}
        onCadastrar={permitirCadastro ? cadastrar : undefined}
        linha={(f) => (
          <>
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {f.name}
              {f.kind === "propriedade" && <Badge variant="blue">Propriedade</Badge>}
            </span>
            {f.kind !== "propriedade" && (
              <span className="text-xs text-texto-secundario">
                {formatarTelefone(f.phone)}, {documentoOuNada(f.document)}
              </span>
            )}
            <span className="text-xs text-texto-secundario">
              {f.ultima_compra
                ? `Última compra ${DATA.format(new Date(f.ultima_compra.em))}, ${reaisBr(f.ultima_compra.valor)}`
                : "Sem compras"}
            </span>
          </>
        )}
      />

      {permitirCadastro && (
        <FornecedorForm
          modo="novo"
          trigger={null}
          open={novo}
          onOpenChange={setNovo}
          inicial={inicial}
          onSalvo={(f) => onEscolher(f)}
        />
      )}
    </div>
  );
}
