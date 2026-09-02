"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost, apiPatch } from "@/lib/client-api";
import { CONTACT_TYPE_LABELS } from "@/components/contatos/contact-labels";

/**
 * Cadastro e edição de contato (§4 e §5 do Módulo 31).
 *
 * Um componente para as duas coisas porque os campos são exatamente os mesmos:
 * dois arquivos divergiriam no primeiro campo novo, e o §5 é explícito que esta
 * lista não cresce (nada de CPF, endereço ou dados bancários nesta versão).
 *
 * Só `name` é obrigatório. O TIPO é opcional de propósito: o §4 diz que o
 * usuário "não deverá ser obrigado a classificar a pessoa ou empresa quando não
 * souber", e é por isso que existe a opção "Não sei ainda" no seletor em vez de
 * o campo ser required.
 */

export type ContatoDoFormulario = {
  id: string;
  name: string;
  type: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
};

const ORDEM = ["name", "type", "phone", "city", "notes"] as const;
type Campo = (typeof ORDEM)[number];

/** O valor que o Select usa para "sem tipo". String vazia fecharia o placeholder. */
const SEM_TIPO = "__sem_tipo__";

export default function ContactForm({
  contato,
  trigger,
}: {
  contato?: ContatoDoFormulario;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const editando = contato !== undefined;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, editando ? `edit-${contato.id}` : undefined);

  const [name, setName] = useState(contato?.name ?? "");
  const [type, setType] = useState(contato?.type ?? SEM_TIPO);
  const [phone, setPhone] = useState(contato?.phone ?? "");
  const [city, setCity] = useState(contato?.city ?? "");
  const [notes, setNotes] = useState(contato?.notes ?? "");

  function limpar() {
    // Editar volta ao que o servidor tem, não ao vazio: fechar o painel sem
    // salvar não pode dar a impressão de que os dados sumiram.
    setName(contato?.name ?? "");
    setType(contato?.type ?? SEM_TIPO);
    setPhone(contato?.phone ?? "");
    setCity(contato?.city ?? "");
    setNotes(contato?.notes ?? "");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do contato.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: name.trim(),
      type: type === SEM_TIPO ? null : type,
      phone: phone.trim() || null,
      city: city.trim() || null,
      notes: notes.trim() || null,
    };
    const res = editando
      ? await apiPatch(`/api/v1/contacts/${contato.id}`, corpo)
      : await apiPost("/api/v1/contacts", corpo);
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    if (!editando) limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        trigger ?? (
          <Button variant={editando ? "outline" : "default"}>
            {editando ? "Editar" : "+ Novo contato"}
          </Button>
        )
      }
      title={editando ? "Editar contato" : "Cadastrar contato"}
      description={
        editando
          ? "Só o nome é obrigatório. O resto pode ficar em branco."
          : "Quem você compra, vende ou contrata. Só o nome é obrigatório."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel={editando ? "Salvar" : "Cadastrar"}
      submitPendingLabel={editando ? "Salvando..." : "Cadastrando..."}
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
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Ex: João da Ponte"
          />
        )}
      </Field>

      <Field
        label="Tipo"
        hint="Opcional. Deixe em branco se não souber."
        id={err.idDe("type")}
        error={err.erros.type}
      >
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              err.limparCampo("type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Não sei ainda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_TIPO}>Não sei ainda</SelectItem>
              {Object.entries(CONTACT_TYPE_LABELS).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Telefone"
        hint="Opcional."
        id={err.idDe("phone")}
        error={err.erros.phone}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              err.limparCampo("phone");
            }}
            placeholder="Ex: 38 99999-0000"
          />
        )}
      </Field>

      <Field label="Município" hint="Opcional." id={err.idDe("city")} error={err.erros.city}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              err.limparCampo("city");
            }}
            placeholder="Ex: Unaí"
          />
        )}
      </Field>

      <Field
        label="Observações"
        hint="Opcional."
        id={err.idDe("notes")}
        error={err.erros.notes}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
