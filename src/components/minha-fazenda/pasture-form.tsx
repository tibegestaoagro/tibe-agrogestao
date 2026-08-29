"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost, apiPatch } from "@/lib/client-api";

type Pasture = { id: string; name: string; area_hectares: number | null };

/**
 * Cadastro/edição de pasto (doc "Minha Fazenda" §4, Módulo 29). Mesmo padrão
 * de `FazendaForm`: um componente para criar (sem `pasture`) e editar (com
 * `pasture`).
 */

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "area_hectares"] as const;
type Campo = (typeof ORDEM)[number];

export default function PastureForm({
  propertyId,
  pasture,
  trigger,
}: {
  propertyId: string;
  pasture?: Pasture;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const editing = !!pasture;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pasture?.name ?? "");
  const [area, setArea] = useState(pasture?.area_hectares?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  /**
   * ⚠️ `prefixoDeId` é obrigatório aqui: a lista de pastos renderiza UM destes
   * por linha, e sem o prefixo todos teriam `id="name"`. O rótulo passaria a
   * apontar para o campo do primeiro painel, e o foco do erro cairia sempre na
   * primeira linha, mesmo quando o problema é na quinta.
   */
  const err = useErrosDeFormulario(ORDEM, pasture?.id ?? "pasto-novo");

  async function save() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do pasto.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = editing
      ? await apiPatch(`/api/v1/pastures/${pasture.id}`, {
          name: name.trim(),
          area_hectares: lerValorDoCampo(area) ?? undefined,
        })
      : await apiPost("/api/v1/pastures", {
          name: name.trim(),
          area_hectares: lerValorDoCampo(area) ?? undefined,
          property_id: propertyId,
        });
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
      trigger={trigger}
      title={editing ? "Editar pasto" : "Novo pasto"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={save}
      submitLabel={editing ? "Salvar alterações" : "Cadastrar pasto"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome do pasto" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            placeholder="Ex: Pasto da Sede"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <Field
        label="Tamanho (hectares)"
        id={err.idDe("area_hectares")}
        error={err.erros.area_hectares}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="ha"
            placeholder="Ex: 20"
            value={area}
            onValueChange={(v) => {
              setArea(v);
              err.limparCampo("area_hectares");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
