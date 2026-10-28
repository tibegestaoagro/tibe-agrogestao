"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPut } from "@/lib/client-api";

const ORDEM = ["bank_account_id"] as const;
const NENHUMA = "__nenhuma__";

/** Escolhe a conta onde o PIX da loja cai (OWNER e ADMIN, Q83). */
export function PixLojaForm({
  lojaId,
  lojaNome,
  contas,
  atual,
}: {
  lojaId: string;
  lojaNome: string;
  contas: { id: string; name: string }[];
  atual: string | null;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `pix-${lojaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conta, setConta] = useState(atual ?? NENHUMA);

  async function submit() {
    err.limparTudo();
    setLoading(true);
    const res = await apiPut(`/api/v1/emporio/establishments/${lojaId}/pix-account`, {
      bank_account_id: conta === NENHUMA ? null : conta,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Conta PIX da loja atualizada.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          {atual ? "Trocar conta PIX" : "Definir conta PIX"}
        </Button>
      }
      title={`Conta PIX da ${lojaNome}`}
      description="O PIX recebido nesta loja entra nesta conta, a menos que a venda diga outra."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setConta(atual ?? NENHUMA);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Conta" id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
        {({ id, ...aria }) => (
          <Select
            value={conta}
            onValueChange={(v) => {
              setConta(v);
              err.limparCampo("bank_account_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUMA}>Nenhuma (a loja não recebe PIX)</SelectItem>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormSheet>
  );
}
