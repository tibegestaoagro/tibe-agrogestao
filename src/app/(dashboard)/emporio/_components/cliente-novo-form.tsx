"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

const ORDEM = ["name", "phone"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Cadastro rápido de cliente no balcão: só o nome (e o telefone, se tiver).
 * Usa a mesma rota dos Contatos, então o cliente já aparece lá.
 */
export function ClienteNovoForm({ onCriado }: { onCriado: (c: { id: string; name: string }) => void }) {
  const err = useErrosDeFormulario(ORDEM, "cliente-novo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!nome.trim()) novos.name = "Informe o nome do cliente.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string; name: string }>("/api/v1/contacts", {
      name: nome.trim(),
      phone: telefone.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    onCriado({ id: res.data.id, name: res.data.name });
    setOpen(false);
    setNome("");
    setTelefone("");
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Cliente novo
        </Button>
      }
      title="Cliente novo"
      description="Só o nome é obrigatório. O cliente também aparece em Contatos."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar cliente"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>
      <Field label="Telefone" id={err.idDe("phone")} error={err.erros.phone} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="tel"
            value={telefone}
            onChange={(e) => {
              setTelefone(e.target.value);
              err.limparCampo("phone");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
