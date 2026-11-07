"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reaisBr } from "@/lib/numero-br";
import { formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";
import type { Falta } from "@/lib/emporio/cliente-cadastro";
import {
  clienteEscolhidoDe,
  consumidorFinalEscolhido,
  type ClienteDaBusca,
  type ClienteEscolhido,
} from "@/lib/emporio/cliente-escolhido";
import { ClienteForm } from "./cliente-form";
import { useBuscaNoServidor } from "./busca-no-servidor";
import { JanelaDeEscolha, type CampoDoField } from "./janela-de-escolha";

const AVISO_CONSUMIDOR_FINAL = "Não vale para fiado, cheque nem entrega.";

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
 * O campo Cliente da venda, do orçamento e da troca: sem cliente, os botões
 * "Escolher cliente" e "Cadastrar novo cliente"; com cliente, o quadro dele e o
 * "Trocar". A escolha é pela janela de busca no servidor; o Consumidor final
 * fica fixo no topo dela.
 *
 * O contêiner recebe o `id` e o `aria` do `<Field>` (e `tabIndex={-1}`): é nele
 * que cai o foco quando o servidor recusa o cliente.
 */
export function EscolherCliente({
  campo,
  consumidorFinal,
  valor,
  onEscolher,
  permitirCadastro = true,
  aviso = null,
}: {
  campo: CampoDoField;
  consumidorFinal: { id: string; name: string };
  valor: ClienteEscolhido | null;
  /** Também chamado depois de "Completar cadastro" e de "Cadastrar novo". */
  onEscolher: (c: ClienteEscolhido) => void;
  permitirCadastro?: boolean;
  /** Gancho do plano 3: mostrado no quadro, com "Completar cadastro". */
  aviso?: Falta | null;
}) {
  const [janela, setJanela] = useState(false);
  const [novo, setNovo] = useState(false);
  const [inicial, setInicial] = useState<{ name?: string; phone?: string } | undefined>(undefined);
  const busca = useBuscaNoServidor<ClienteDaBusca>("/api/v1/emporio/customers/search", janela);

  function escolher(c: ClienteEscolhido) {
    onEscolher(c);
    setJanela(false);
  }

  function cadastrar(termo: string) {
    setJanela(false);
    setInicial(inicialDoTermo(termo));
    setNovo(true);
  }

  const fixo = (
    <button
      type="button"
      data-opcao
      data-fixo
      data-nome={consumidorFinal.name}
      onClick={() => escolher(consumidorFinalEscolhido(consumidorFinal))}
      className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border border-borda bg-superficie-afundada px-3 py-2 text-left text-sm text-texto hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria-tinta"
    >
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {consumidorFinal.name}
        <Badge variant="blue">Cliente padrão</Badge>
      </span>
      <span className="text-xs text-texto-secundario">{AVISO_CONSUMIDOR_FINAL}</span>
    </button>
  );

  // O que o quadro pede para completar: o aviso do plano 3, senão o cadastro incompleto.
  const pendencia = valor && (aviso ? aviso.message : valor.incomplete ? "Cadastro incompleto" : null);

  return (
    <div {...campo} tabIndex={-1} className="space-y-2">
      {valor ? (
        <>
          <div
            data-escolhido="cliente"
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-borda bg-superficie-afundada px-3 py-2"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 font-medium text-texto">
                <span className="break-words">{valor.name}</span>
                {valor.fixed && <Badge variant="blue">Cliente padrão</Badge>}
              </p>
              {valor.fixed ? (
                <p className="text-xs text-texto-secundario">{AVISO_CONSUMIDOR_FINAL}</p>
              ) : (
                <p className="text-xs text-texto-secundario">
                  {formatarTelefone(valor.phone)}, {documentoOuNada(valor.document)}
                </p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" aria-label="Trocar cliente" onClick={() => setJanela(true)}>
              Trocar
            </Button>
          </div>
          {pendencia && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
              <span>{pendencia}</span>
              {/* No Consumidor final não há o que completar: é trocar de cliente. */}
              {permitirCadastro && !valor.fixed && (
                <ClienteForm
                  key={valor.id}
                  modo="completar"
                  contatoId={valor.id}
                  faltaInicial={aviso}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Completar cadastro
                    </Button>
                  }
                  onSalvo={(c) => onEscolher(clienteEscolhidoDe(c))}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-texto-secundario">Nenhum cliente escolhido.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setJanela(true)}>
              Escolher cliente
            </Button>
            {permitirCadastro && (
              <Button type="button" variant="outline" onClick={() => cadastrar("")}>
                Cadastrar novo cliente
              </Button>
            )}
          </div>
        </>
      )}

      <JanelaDeEscolha<ClienteDaBusca>
        titulo="Escolher cliente"
        tipo="cliente"
        aberta={janela}
        onAbertaChange={setJanela}
        busca={busca}
        fixoNoTopo={fixo}
        onEscolher={escolher}
        onCadastrar={permitirCadastro ? cadastrar : undefined}
        linha={(c) => (
          <>
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {c.name}
              {c.incomplete && <Badge variant="amber">Cadastro incompleto</Badge>}
            </span>
            <span className="text-xs text-texto-secundario">
              {formatarTelefone(c.phone)}, {documentoOuNada(c.document)}
            </span>
            <span className="text-xs text-texto-secundario">
              {c.ultima_compra
                ? `Última compra ${DATA.format(new Date(c.ultima_compra.em))}, ${reaisBr(c.ultima_compra.valor)}`
                : "Sem compras"}
            </span>
          </>
        )}
      />

      {permitirCadastro && (
        <ClienteForm
          modo="novo"
          trigger={null}
          open={novo}
          onOpenChange={setNovo}
          inicial={inicial}
          onSalvo={(c) => onEscolher(clienteEscolhidoDe(c))}
        />
      )}
    </div>
  );
}
