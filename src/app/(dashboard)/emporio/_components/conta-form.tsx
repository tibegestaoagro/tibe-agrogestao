"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

const ORDEM = ["name", "bank"] as const;
type Campo = (typeof ORDEM)[number];

/** Cadastro de conta bancária do Empório (OWNER e ADMIN): é onde o PIX cai. */
export function ContaForm() {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "conta-nova");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [banco, setBanco] = useState("");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!nome.trim()) novos.name = "Dê um nome à conta.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/bank-accounts", {
      name: nome.trim(),
      bank: banco.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Conta cadastrada.");
    setOpen(false);
    setNome("");
    setBanco("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Nova conta</Button>}
      title="Nova conta bancária"
      description="Só o nome é obrigatório. O saldo começa em zero: lance o saldo inicial depois."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar conta"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome da conta" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Ex: Conta do PIX da loja Centro"
          />
        )}
      </Field>
      <Field label="Banco" id={err.idDe("bank")} error={err.erros.bank} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={banco}
            onChange={(e) => {
              setBanco(e.target.value);
              err.limparCampo("bank");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
