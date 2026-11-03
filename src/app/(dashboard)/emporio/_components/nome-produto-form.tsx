"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";

const ORDEM = ["name"] as const;

export function NomeProdutoForm({ produtoId, nome }: { produtoId: string; nome: string }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState(nome);

  async function submit() {
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/products/${produtoId}`, { name: valor });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Editar nome
        </Button>
      }
      title="Editar nome"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setValor(nome);
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Salvar"
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
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
