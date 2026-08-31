"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "document", "phone", "email", "notes"] as const;

export default function ClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [form, setForm] = useState({ name: "", document: "", phone: "", email: "", notes: "" });

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      err.limparCampo(k);
    };

  function reset() {
    setForm({ name: "", document: "", phone: "", email: "", notes: "" });
    err.limparTudo();
  }

  async function submit() {
    if (!form.name.trim()) {
      err.setGlobal(null);
      err.reprovar({ name: "Informe o nome do cliente." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/service-clients", {
      name: form.name.trim(),
      document: form.document.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Novo cliente</Button>}
      title="Novo cliente"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id="name" error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={form.name} onChange={set("name")} />
        )}
      </Field>

      <Field label="Documento (CPF/CNPJ)" id="document" error={err.erros.document}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={form.document} onChange={set("document")} />
        )}
      </Field>

      <Field label="Telefone" id="phone" error={err.erros.phone}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={form.phone} onChange={set("phone")} />
        )}
      </Field>

      <Field label="Email" id="email" error={err.erros.email}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} type="email" value={form.email} onChange={set("email")} />
        )}
      </Field>

      <Field label="Observações" id="notes" error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={form.notes} onChange={set("notes")} />
        )}
      </Field>
    </FormSheet>
  );
}
