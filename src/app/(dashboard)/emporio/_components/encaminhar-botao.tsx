"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { lerOpcional, paraCampo, UNIDADE_BASE_SUFIXO } from "./formato";

const ORDEM = ["quantity"] as const;

/**
 * "Encaminhar à Lista" (Q68). A quantidade já vem com a sugestão (máximo menos
 * saldo e compras a caminho), mas passa por um painel: sem máximo definido não
 * há sugestão, e a pessoa precisa poder dizer quanto.
 *
 * O item que já está na Lista (409) não é erro de campo: avisa e fecha.
 */
export function EncaminharBotao({
  establishmentId,
  produtoId,
  baseUnit,
  sugestao,
  titulo,
}: {
  establishmentId: string;
  produtoId: string;
  baseUnit: string;
  sugestao: number | null;
  /** "Loja X, Produto Y": diz o que está sendo encaminhado. */
  titulo: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `rep-${establishmentId}-${produtoId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quantidade, setQuantidade] = useState(paraCampo(sugestao));
  const sufixo = UNIDADE_BASE_SUFIXO[baseUnit] ?? baseUnit;

  async function submit() {
    const q = lerOpcional(quantidade);
    if (q === "invalido" || q === null || q <= 0) {
      err.setGlobal(null);
      err.reprovar({ quantity: q === "invalido" ? "Não consegui ler esse número." : "Informe quanto comprar." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/stock/restock/to-list", {
      establishment_id: establishmentId,
      emporio_product_id: produtoId,
      quantity: q,
    });
    setLoading(false);
    if (!res.ok) {
      if (res.code === "ITEM_JA_NA_LISTA") {
        aviso.erro(res.message);
        setOpen(false);
        return;
      }
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Encaminhado à Lista de Compra.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Encaminhar à Lista
        </Button>
      }
      title="Encaminhar à Lista"
      description={titulo}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setQuantidade(paraCampo(sugestao));
        else err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Encaminhar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label={`Quanto comprar (${sufixo})`}
        required
        id={err.idDe("quantity")}
        error={err.erros.quantity}
        hint={sugestao == null ? "Sem máximo definido não há sugestão: diga a quantidade." : "Sugestão a partir do máximo."}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={quantidade}
            onValueChange={(v) => {
              setQuantidade(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
