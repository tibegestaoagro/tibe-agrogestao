"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch, apiPost } from "@/lib/client-api";
import { mascararTelefone } from "@/components/contatos/campos-do-cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";

// Ordem VISUAL, e os nomes são os da API.
const ORDEM = ["name", "phone", "document", "notes"] as const;
type Campo = (typeof ORDEM)[number];

type Valores = Record<Campo, string>;

const VAZIO: Valores = { name: "", phone: "", document: "", notes: "" };

export type FranqueadoInicial = {
  name: string;
  phone: string;
  document: string | null;
  notes: string | null;
};

/**
 * Cadastro curto do franqueado (Q300): só nome e telefone são obrigatórios. Na edição, os valores
 * vêm da ficha (props), então o painel abre sem leitura extra.
 */
export function FranqueadoForm({
  modo,
  id,
  inicial,
  trigger,
}: {
  modo: "novo" | "editar";
  id?: string;
  inicial?: FranqueadoInicial;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const editar = modo === "editar";
  const err = useErrosDeFormulario(ORDEM, editar ? `franqueado-${id}` : "franqueado-novo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valores, setValores] = useState<Valores>(VAZIO);

  function mudar(campo: Campo, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    err.limparCampo(campo);
  }

  function mudarAberto(o: boolean) {
    setOpen(o);
    if (!o) return;
    err.limparTudo();
    setValores(
      editar && inicial
        ? {
            name: inicial.name,
            phone: formatarTelefone(inicial.phone),
            document: inicial.document ?? "",
            notes: inicial.notes ?? "",
          }
        : VAZIO,
    );
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!valores.name.trim()) novos.name = "Informe o nome do franqueado.";
    if (!valores.phone.trim()) novos.phone = "Informe o telefone do franqueado.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: valores.name.trim(),
      phone: valores.phone.trim(),
      document: valores.document.trim() || null,
      notes: valores.notes.trim() || null,
    };
    const res = editar
      ? await apiPatch(`/api/v1/emporio/franchisees/${id}`, corpo)
      : await apiPost("/api/v1/emporio/franchisees", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    mudarAberto(false);
    router.refresh();
  }

  function texto(
    campo: Campo,
    rotulo: string,
    extra: { required?: boolean; hint?: string; placeholder?: string; mascara?: (v: string) => string; inputMode?: "numeric" | "text" } = {},
  ) {
    return (
      <Field label={rotulo} required={extra.required} hint={extra.hint} id={err.idDe(campo)} error={err.erros[campo]}>
        {({ id: fid, ...aria }) => (
          <Input
            id={fid}
            {...aria}
            autoComplete="off"
            inputMode={extra.inputMode}
            placeholder={extra.placeholder}
            value={valores[campo]}
            onChange={(e) => mudar(campo, extra.mascara ? extra.mascara(e.target.value) : e.target.value)}
          />
        )}
      </Field>
    );
  }

  return (
    <FormSheet
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            Novo franqueado
          </Button>
        )
      }
      title={editar ? "Editar franqueado" : "Novo franqueado"}
      description="Só o nome e o telefone são obrigatórios."
      open={open}
      onOpenChange={mudarAberto}
      onSubmit={submit}
      submitLabel={editar ? "Salvar franqueado" : "Cadastrar franqueado"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {texto("name", "Nome", { required: true })}
      {texto("phone", "Telefone", { required: true, inputMode: "numeric", placeholder: "(38) 99999-0000", mascara: mascararTelefone })}
      {texto("document", "CPF/CNPJ", { hint: "Opcional." })}
      {texto("notes", "Observação", { hint: "Opcional." })}
    </FormSheet>
  );
}
