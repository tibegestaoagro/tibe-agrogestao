"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { apiGet } from "@/lib/client-api";
import { UFS, formatarCep } from "@/lib/contatos/cadastro";
import { faltaParaEntrega, type EnderecoDoPedido, type Falta } from "@/lib/emporio/cliente-cadastro";
import { clienteEscolhidoDe } from "@/lib/emporio/cliente-escolhido";
import type { EscolhaDoEndereco, PedidoParaEntregaInput } from "@/lib/emporio/pedido-para-entrega";
import type { ClienteView, OpcaoDeEndereco, OpcoesDeEntregaView } from "@/lib/actions/emporio-clientes";
import { ClienteForm } from "./cliente-form";

/**
 * O bloco "Pedido para entrega" do balcão (venda e orçamento) e do painel que
 * muda a venda fechada. Não escreve nada: quem monta a tela guarda o valor,
 * escreve o `ORDEM` com os campos abaixo (na ordem visual) logo depois de
 * `customer_id` e manda `corpoDoPedidoParaEntrega(valor)` no corpo.
 *
 * Os ids dos `Field` são os nomes da API, para a recusa do servidor cair embaixo
 * do campo certo. As recusas do endereço do cadastro (principal incompleto, sem
 * endereço de entrega) caem em `delivery_address_kind`, porque só os campos de
 * "Outro endereço" aparecem na tela, e só enquanto "Outro" está escolhido.
 */

export type CampoDoPedido =
  | "for_delivery"
  | "delivery_address_kind"
  | "delivery_zip"
  | "delivery_street"
  | "delivery_number"
  | "delivery_complement"
  | "delivery_district"
  | "delivery_city"
  | "delivery_state";

type CampoDoOutro =
  | "delivery_zip"
  | "delivery_street"
  | "delivery_number"
  | "delivery_complement"
  | "delivery_district"
  | "delivery_city"
  | "delivery_state";

export type PedidoParaEntregaValor = {
  for_delivery: boolean;
  delivery_address_kind: EscolhaDoEndereco | "";
  outro: Record<CampoDoOutro, string>;
};

const OUTRO_VAZIO: Record<CampoDoOutro, string> = {
  delivery_zip: "",
  delivery_street: "",
  delivery_number: "",
  delivery_complement: "",
  delivery_district: "",
  delivery_city: "",
  delivery_state: "",
};

export const PEDIDO_RETIRADA: PedidoParaEntregaValor = {
  for_delivery: false,
  delivery_address_kind: "",
  outro: OUTRO_VAZIO,
};

const textoOuNulo = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** Desmarcado, o corpo leva só a marca: o que foi digitado fica na tela, mas não vai. */
export function corpoDoPedidoParaEntrega(v: PedidoParaEntregaValor): PedidoParaEntregaInput {
  if (!v.for_delivery) return { for_delivery: false };
  if (v.delivery_address_kind !== "outro") {
    return { for_delivery: true, delivery_address_kind: v.delivery_address_kind || null };
  }
  return {
    for_delivery: true,
    delivery_address_kind: "outro",
    delivery_zip: textoOuNulo(v.outro.delivery_zip),
    delivery_street: textoOuNulo(v.outro.delivery_street),
    delivery_number: textoOuNulo(v.outro.delivery_number),
    delivery_complement: textoOuNulo(v.outro.delivery_complement),
    delivery_district: textoOuNulo(v.outro.delivery_district),
    delivery_city: textoOuNulo(v.outro.delivery_city),
    delivery_state: textoOuNulo(v.outro.delivery_state),
  };
}

/** O pedido gravado (orçamento ou venda) como valor da tela; na escolha `outro`, com o endereço copiado. */
export function valorDoPedido(x: {
  for_delivery: boolean;
  delivery_address_kind: EscolhaDoEndereco | null;
  delivery_address: EnderecoDoPedido | null;
}): PedidoParaEntregaValor {
  if (!x.for_delivery) return PEDIDO_RETIRADA;
  const e = x.delivery_address_kind === "outro" ? x.delivery_address : null;
  return {
    for_delivery: true,
    delivery_address_kind: x.delivery_address_kind ?? "",
    outro: e
      ? {
          delivery_zip: formatarCep(e.zip),
          delivery_street: e.street ?? "",
          delivery_number: e.number ?? "",
          delivery_complement: e.complement ?? "",
          delivery_district: e.district ?? "",
          delivery_city: e.city ?? "",
          delivery_state: e.state ?? "",
        }
      : OUTRO_VAZIO,
  };
}

/** A mesma frase do servidor: a recusa daqui e a de lá são indistinguíveis. */
export const AVISO_SEM_ESCOLHA = "Escolha o endereço de entrega.";

/**
 * O que falta no cliente, com o campo do cadastro que o "Completar cadastro"
 * deve abrir recusado. O servidor só diz a frase; o campo sai da mesma regra
 * (`faltaParaEntrega`) aplicada ao cadastro lido agora.
 */
async function faltaComCampo(opcoes: OpcoesDeEntregaView): Promise<Falta | null> {
  const f = opcoes.falta_no_cliente;
  if (!f) return null;
  if (opcoes.fixed) return { field: "customer_id", message: f.message };
  const res = await apiGet<ClienteView>(`/api/v1/emporio/customers/${encodeURIComponent(opcoes.customer_id)}`);
  const local = res.ok ? faltaParaEntrega(clienteEscolhidoDe(res.data), null) : null;
  return { field: local && !local.field.startsWith("delivery_") ? local.field : "customer_id", message: f.message };
}

function rotuloDaOpcao(o: OpcaoDeEndereco): string {
  if (o.completo) return o.linha ?? "incompleto";
  return o.linha ? `${o.linha} (incompleto)` : "incompleto";
}

const CAMPOS_DO_OUTRO: { campo: Exclude<CampoDoOutro, "delivery_state">; rotulo: string; required: boolean }[] = [
  { campo: "delivery_zip", rotulo: "CEP", required: true },
  { campo: "delivery_street", rotulo: "Rua", required: true },
  { campo: "delivery_number", rotulo: "Número", required: true },
  { campo: "delivery_complement", rotulo: "Complemento", required: false },
  { campo: "delivery_district", rotulo: "Bairro", required: true },
  { campo: "delivery_city", rotulo: "Cidade", required: true },
];

const SEM_UF = "__sem_uf__";

const CLASSE_OPCAO =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-borda bg-superficie-afundada px-3 py-2 " +
  "text-sm text-texto hover:border-borda-forte has-[:checked]:border-primaria-tinta";

export function PedidoParaEntregaCampos({
  valor,
  aoMudar,
  customerId,
  erros,
  idDe,
  aoMudarCadastro,
  limpar,
  aoVerFalta,
}: {
  valor: PedidoParaEntregaValor;
  aoMudar: (v: PedidoParaEntregaValor) => void;
  customerId: string | null;
  erros: Partial<Record<CampoDoPedido, string>>;
  idDe: (campo: CampoDoPedido) => string;
  /** Chamado depois de "Completar cadastro" salvar (as opções já são lidas de novo aqui). */
  aoMudarCadastro?: () => void;
  /** Em todo onChange, com o campo que mudou: some o erro dele. */
  limpar?: (campo: CampoDoPedido) => void;
  /**
   * Quem já mostra o cliente com aviso e "Completar cadastro" (o `EscolherCliente`
   * do balcão) recebe a falta por aqui, e este bloco não repete o botão.
   */
  aoVerFalta?: (f: Falta | null) => void;
}) {
  const ativo = valor.for_delivery && !!customerId;
  const [recarga, setRecarga] = useState(0);
  const [lidas, setLidas] = useState<{
    id: string;
    recarga: number;
    opcoes: OpcoesDeEntregaView | null;
    falta: Falta | null;
  } | null>(null);

  useEffect(() => {
    if (!ativo || !customerId) return;
    let vivo = true;
    void (async () => {
      const res = await apiGet<OpcoesDeEntregaView>(
        `/api/v1/emporio/customers/${encodeURIComponent(customerId)}/delivery-options`,
      );
      const falta = res.ok ? await faltaComCampo(res.data) : null;
      if (vivo) setLidas({ id: customerId, recarga, opcoes: res.ok ? res.data : null, falta });
    })();
    return () => {
      vivo = false;
    };
  }, [ativo, customerId, recarga]);

  const atuais = ativo && lidas && lidas.id === customerId ? lidas : null;
  const opcoes = atuais?.opcoes ?? null;
  const falta = atuais?.falta ?? null;
  const carregando = ativo && (!atuais || atuais.recarga !== recarga);

  useEffect(() => {
    aoVerFalta?.(falta);
  }, [aoVerFalta, falta]);

  function mudar(campo: CampoDoPedido, novo: PedidoParaEntregaValor) {
    aoMudar(novo);
    limpar?.(campo);
  }

  function mudarOutro(campo: CampoDoOutro, texto: string) {
    mudar(campo, { ...valor, outro: { ...valor.outro, [campo]: texto } });
  }

  const escolhas: { valor: EscolhaDoEndereco; rotulo: string }[] = [
    { valor: "principal", rotulo: opcoes ? `Endereço principal: ${rotuloDaOpcao(opcoes.principal)}` : "Endereço principal" },
    // Também enquanto as opções carregam ou a leitura falha: um orçamento já
    // gravado com essa escolha precisa mostrar o botão marcado.
    ...(opcoes?.cadastro_entrega || valor.delivery_address_kind === "cadastro_entrega"
      ? [
          {
            valor: "cadastro_entrega" as const,
            rotulo: opcoes?.cadastro_entrega
              ? `Endereço de entrega do cadastro: ${rotuloDaOpcao(opcoes.cadastro_entrega)}`
              : "Endereço de entrega do cadastro",
          },
        ]
      : []),
    { valor: "outro", rotulo: "Outro endereço (só para este pedido)" },
  ];

  return (
    <div className="space-y-4">
      <Field label="Entrega" id={idDe("for_delivery")} error={erros.for_delivery}>
        {({ id, ...aria }) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-texto">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={valor.for_delivery}
              onChange={(e) => mudar("for_delivery", { ...valor, for_delivery: e.target.checked })}
              className="size-5 shrink-0 rounded border-borda-forte accent-primaria-tinta"
            />
            Pedido para entrega
          </label>
        )}
      </Field>

      {valor.for_delivery && (
        <>
          {!customerId && (
            <p className="text-sm text-texto-secundario">Escolha o cliente para ver os endereços do cadastro.</p>
          )}
          {carregando && <p className="text-sm text-texto-secundario">Lendo os endereços do cliente...</p>}
          {atuais && !opcoes && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
              <span>Não foi possível ler os endereços do cliente. Escolha &quot;Outro endereço&quot; ou tente de novo.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setRecarga((n) => n + 1)}>
                Tentar de novo
              </Button>
            </div>
          )}
          {falta && !aoVerFalta && customerId && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
              <span>{falta.message}</span>
              {!opcoes?.fixed && (
                <ClienteForm
                  key={customerId}
                  modo="completar"
                  contatoId={customerId}
                  faltaInicial={falta}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Completar cadastro
                    </Button>
                  }
                  onSalvo={() => {
                    setRecarga((n) => n + 1);
                    aoMudarCadastro?.();
                  }}
                />
              )}
            </div>
          )}

          <Field label="Endereço de entrega" required id={idDe("delivery_address_kind")} error={erros.delivery_address_kind}>
            {({ id, ...aria }) => (
              <div id={id} role="radiogroup" tabIndex={-1} {...aria} className="space-y-2">
                {escolhas.map((o) => (
                  <label key={o.valor} className={CLASSE_OPCAO}>
                    <input
                      type="radio"
                      name={id}
                      value={o.valor}
                      checked={valor.delivery_address_kind === o.valor}
                      onChange={() => mudar("delivery_address_kind", { ...valor, delivery_address_kind: o.valor })}
                      className="mt-0.5 size-5 shrink-0 accent-primaria-tinta"
                    />
                    <span className="min-w-0 break-words">{o.rotulo}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          {valor.delivery_address_kind === "outro" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_DO_OUTRO.map((c) => (
                <Field key={c.campo} label={c.rotulo} required={c.required} id={idDe(c.campo)} error={erros[c.campo]}>
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      {...aria}
                      autoComplete="off"
                      {...(c.campo === "delivery_zip" ? { inputMode: "numeric" as const, maxLength: 9, placeholder: "00000-000" } : {})}
                      value={valor.outro[c.campo]}
                      onChange={(e) => mudarOutro(c.campo, e.target.value)}
                    />
                  )}
                </Field>
              ))}
              <Field label="UF" required id={idDe("delivery_state")} error={erros.delivery_state}>
                {({ id, ...aria }) => (
                  <Select
                    value={valor.outro.delivery_state || SEM_UF}
                    onValueChange={(uf) => mudarOutro("delivery_state", uf === SEM_UF ? "" : uf)}
                  >
                    <SelectTrigger id={id} {...aria}>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_UF}>Escolha</SelectItem>
                      {UFS.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          )}
        </>
      )}
    </div>
  );
}
