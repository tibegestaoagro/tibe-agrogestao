"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

type Tenant = {
  name: string;
  document: string;
  phone: string | null;
  email: string | null;
};

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "document", "phone", "email"] as const;

/**
 * Dados da empresa (Configurações §5.3).
 *
 * Era um formulário INLINE no cartão da página: uma `<div>` com um botão que
 * chamava `submit()` no clique, sem `<form>` nenhum. No celular isso significa
 * que a tecla de confirmar do teclado não fazia nada, que é o defeito descrito
 * em `form-sheet.tsx`. Agora a página mostra os dados, e a edição acontece no
 * painel lateral, como toda outra escrita do produto
 * (`.claude/rules/ui.md`: "ações de escrita são componentes client dentro de
 * `<Sheet>`").
 */
export default function TenantForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tenant.name);
  const [document, setDocument] = useState(tenant.document);
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [email, setEmail] = useState(tenant.email ?? "");
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  /** Volta ao que está salvo: fechar sem salvar não pode deixar rascunho. */
  function restaurar() {
    setName(tenant.name);
    setDocument(tenant.document);
    setPhone(tenant.phone ?? "");
    setEmail(tenant.email ?? "");
    err.limparTudo();
  }

  async function submit() {
    if (!name.trim()) {
      err.setGlobal(null);
      err.reprovar({ name: "Informe o nome da empresa." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch("/api/v1/tenant", {
      name: name.trim(),
      document: document.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Dados da empresa salvos.");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <dl className="space-y-3 text-sm">
        <Linha rotulo="Nome da empresa" valor={tenant.name} />
        <Linha rotulo="CNPJ/CPF" valor={tenant.document} />
        <Linha rotulo="Telefone" valor={tenant.phone} />
        <Linha rotulo="Email" valor={tenant.email} />
      </dl>

      <FormSheet
        trigger={<Button variant="outline">Editar dados</Button>}
        title="Dados da empresa"
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) restaurar();
        }}
        onSubmit={submit}
        submitLabel="Salvar"
        pending={loading}
        error={err.global}
        focarCampoId={err.focarCampoId}
        tentativa={err.tentativa}
      >
        <Field label="Nome da empresa" required id="name" error={err.erros.name}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                err.limparCampo("name");
              }}
            />
          )}
        </Field>

        <Field label="CNPJ/CPF" id="document" error={err.erros.document}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={document}
              onChange={(e) => {
                setDocument(e.target.value);
                err.limparCampo("document");
              }}
            />
          )}
        </Field>

        <Field label="Telefone" id="phone" error={err.erros.phone}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                err.limparCampo("phone");
              }}
            />
          )}
        </Field>

        <Field label="Email" id="email" error={err.erros.email}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                err.limparCampo("email");
              }}
            />
          )}
        </Field>
      </FormSheet>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="font-medium text-texto-secundario">{rotulo}</dt>
      <dd className="mt-0.5 text-texto">{valor?.trim() ? valor : "Não informado"}</dd>
    </div>
  );
}
