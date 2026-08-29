"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost, apiPatch } from "@/lib/client-api";

type Fazenda = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  area_hectares: number | null;
};

/**
 * Cadastro/edição da fazenda (doc "Minha Fazenda" §3, Módulo 29). Um único
 * componente para os dois modos: "criar" (sem `fazenda`) reusa a mesma
 * validação de "editar" (com `fazenda`), evitando duas cópias do formulário.
 */

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "area_hectares", "city", "district", "address"] as const;
type Campo = (typeof ORDEM)[number];

export default function FazendaForm({
  fazenda,
  trigger,
}: {
  fazenda?: Fazenda;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const editing = !!fazenda;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fazenda?.name ?? "");
  const [area, setArea] = useState(fazenda?.area_hectares?.toString() ?? "");
  const [city, setCity] = useState(fazenda?.city ?? "");
  const [district, setDistrict] = useState(fazenda?.district ?? "");
  const [address, setAddress] = useState(fazenda?.address ?? "");
  const [loading, setLoading] = useState(false);
  /**
   * `prefixoDeId` porque a página de Minha Fazenda pode renderizar mais de um
   * destes: o de criar e o de editar a fazenda atual. Sem ele os dois teriam
   * `id="name"`, e o foco do erro cairia no painel errado.
   */
  const err = useErrosDeFormulario(ORDEM, fazenda?.id ?? "fazenda-nova");

  async function save() {
    /**
     * ⚠️ O aviso de soma dos pastos maior que a fazenda é SÓ AVISO, nunca
     * bloqueia salvar (decisão do usuário, em `.claude/rules/rebanho-e-fazenda.md`,
     * que confirma a leitura literal do documento: "o sistema não deverá
     * realizar alterações automaticamente"). Ele vive na página, como
     * `meta.area_summary`, e NÃO pode virar `err.reprovar` aqui.
     */
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome da fazenda.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const payload = {
      name: name.trim(),
      /**
       * ⚠️ Município vazio sai como `undefined`, NUNCA como `""`.
       *
       * O schema é `city: z.string().trim().min(1).optional()`: string vazia
       * bate no `min(1)` e vira recusa, enquanto ausente é aceito. Mandando
       * `""` sempre, editar a fazenda sem preencher o município recusava com
       * uma frase sobre um campo que a tela nem marca como obrigatório.
       * Achado na validação ao vivo de 2026-08-29; vem do Módulo 29.
       */
      city: city.trim() || undefined,
      district: district.trim() || null,
      address: address.trim() || null,
      area_hectares: lerValorDoCampo(area) ?? undefined,
    };
    const res = editing
      ? await apiPatch(`/api/v1/properties/${fazenda.id}`, payload)
      : await apiPost("/api/v1/properties", payload);
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
      title={editing ? "Editar fazenda" : "Nova fazenda"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={save}
      submitLabel={editing ? "Salvar alterações" : "Cadastrar fazenda"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome da fazenda" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            placeholder="Ex: Fazenda Santa Helena"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <Field
        label="Tamanho total (hectares)"
        id={err.idDe("area_hectares")}
        error={err.erros.area_hectares}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="ha"
            placeholder="Ex: 120"
            value={area}
            onValueChange={(v) => {
              setArea(v);
              err.limparCampo("area_hectares");
            }}
          />
        )}
      </Field>

      <Field label="Município" id={err.idDe("city")} error={err.erros.city}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            placeholder="Ex: Montes Claros"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              err.limparCampo("city");
            }}
          />
        )}
      </Field>

      <Field label="Distrito (opcional)" id={err.idDe("district")} error={err.erros.district}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            placeholder="Ex: São João da Vereda"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          />
        )}
      </Field>

      <Field label="Endereço (opcional)" id={err.idDe("address")} error={err.erros.address}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
