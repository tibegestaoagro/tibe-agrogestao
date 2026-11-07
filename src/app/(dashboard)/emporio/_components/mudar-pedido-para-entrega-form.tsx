"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";
import type { EnderecoDoPedido } from "@/lib/emporio/cliente-cadastro";
import type { EscolhaDoEndereco } from "@/lib/emporio/pedido-para-entrega";
import {
  AVISO_SEM_ESCOLHA,
  corpoDoPedidoParaEntrega,
  PedidoParaEntregaCampos,
  valorDoPedido,
  type PedidoParaEntregaValor,
} from "./pedido-para-entrega-campos";

// Ordem visual, de cima para baixo: o cliente (só leitura, recebe a recusa dele) e o pedido.
const ORDEM = [
  "customer_id",
  "for_delivery",
  "delivery_address_kind",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Quem fatura muda a marca e o endereço de uma venda fechada (D5). Só o pedido
 * muda: estoque, caixa e financeiro ficam como estão, e o cliente da venda não
 * muda aqui. A recusa do cliente (cadastro incompleto, Consumidor final) cai
 * embaixo do nome dele, no topo do painel.
 */
export function MudarPedidoParaEntregaForm({
  vendaId,
  cliente,
  pedido,
}: {
  vendaId: string;
  cliente: { id: string | null; name: string | null };
  pedido: { for_delivery: boolean; delivery_address_kind: EscolhaDoEndereco | null; delivery_address: EnderecoDoPedido | null };
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "muda-pedido");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState<PedidoParaEntregaValor>(() => valorDoPedido(pedido));

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (valor.for_delivery && !valor.delivery_address_kind) novos.delivery_address_kind = AVISO_SEM_ESCOLHA;
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/sales/${vendaId}/delivery`, corpoDoPedidoParaEntrega(valor));
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Pedido para entrega atualizado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Mudar
        </Button>
      }
      title="Pedido para entrega"
      description="Muda só a marca e o endereço. Estoque, caixa e financeiro da venda não mudam."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        err.limparTudo();
        // Abrir de novo parte do que está gravado, não do que ficou digitado e não foi salvo.
        if (o) setValor(valorDoPedido(pedido));
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Cliente" id={err.idDe("customer_id")} error={err.erros.customer_id}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-sm font-medium text-texto">
            {cliente.name ?? "Sem cliente"}
          </p>
        )}
      </Field>

      <PedidoParaEntregaCampos
        valor={valor}
        aoMudar={setValor}
        customerId={cliente.id}
        erros={err.erros}
        idDe={err.idDe}
        limpar={(campo) => {
          err.limparCampo(campo);
          // Desmarcar a entrega também resolve a recusa do cliente.
          if (campo === "for_delivery") err.limparCampo("customer_id");
        }}
        aoMudarCadastro={() => err.limparCampo("customer_id")}
      />
    </FormSheet>
  );
}
