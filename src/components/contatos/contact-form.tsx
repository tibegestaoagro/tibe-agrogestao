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
import {
  CADASTRO_VAZIO,
  CamposDoCadastro,
  corpoDoCadastro,
  valoresDoContato,
  type CampoCadastro,
  type ContatoDoCadastro,
  type ValoresCadastro,
} from "@/components/contatos/campos-do-cadastro";

/**
 * Cadastro e edição de contato (§4 e §5 do Módulo 31, e o cadastro PF/PJ do
 * Empório).
 *
 * Um componente para as duas coisas porque os campos são exatamente os mesmos:
 * dois arquivos divergiriam no primeiro campo novo. Os dados de pessoa física ou
 * jurídica (CPF/CNPJ, endereços) vêm de `CamposDoCadastro`, o mesmo do balcão.
 *
 * Só `name` é obrigatório. O tipo de pessoa e o TIPO do contato são opcionais de
 * propósito: o §4 diz que o usuário "não deverá ser obrigado a classificar a
 * pessoa ou empresa quando não souber", e é por isso que existe a opção "Não sei
 * ainda" no seletor em vez de o campo ser required.
 *
 * O PATCH manda todos os campos: o que está vazio vai como `null` e limpa o
 * dado guardado, porque o formulário mostra tudo o que existe.
 */

export type ContatoDoFormulario = ContatoDoCadastro & {
  id: string;
  name: string;
  type: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
};

// Ordem VISUAL: os campos de `CamposDoCadastro`, depois o tipo do contato e as observações.
const ORDEM = [
  "person_kind",
  "name",
  "document",
  "phone",
  "birth_date",
  "responsible_name",
  "state_registration",
  "address_zip",
  "address_street",
  "address_number",
  "address_complement",
  "address_district",
  "city",
  "address_state",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
  "type",
  "notes",
] as const;
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

  const inicial = (): ValoresCadastro => (contato ? valoresDoContato(contato) : CADASTRO_VAZIO);
  const [valores, setValores] = useState<ValoresCadastro>(inicial);
  const [type, setType] = useState(contato?.type ?? SEM_TIPO);
  const [notes, setNotes] = useState(contato?.notes ?? "");

  function mudar(campo: CampoCadastro, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    err.limparCampo(campo);
  }

  function limpar() {
    // Editar volta ao que o servidor tem, não ao vazio: fechar o painel sem
    // salvar não pode dar a impressão de que os dados sumiram.
    setValores(inicial());
    setType(contato?.type ?? SEM_TIPO);
    setNotes(contato?.notes ?? "");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!valores.name.trim()) novos.name = "Informe o nome do contato.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      ...corpoDoCadastro(valores),
      type: type === SEM_TIPO ? null : type,
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
      <CamposDoCadastro
        valores={valores}
        aoMudar={mudar}
        erros={err.erros}
        idDe={err.idDe}
        obrigatorios={false}
      />

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
