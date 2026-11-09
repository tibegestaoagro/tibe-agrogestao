"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch, apiPost } from "@/lib/client-api";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["name"] as const;
type Campo = (typeof ORDEM)[number];

/** Cria uma adquirente, ou renomeia a que vem em `adquirente` (Dono e Gerente geral). */
export function AdquirenteForm({ adquirente }: { adquirente?: { id: string; name: string } }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `adquirente-${adquirente?.id ?? "nova"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState(adquirente?.name ?? "");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (nome.trim() === "") novos.name = "Dê um nome à adquirente.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = adquirente
      ? await apiPatch(`/api/v1/emporio/card-acquirers/${adquirente.id}`, { name: nome.trim() })
      : await apiPost("/api/v1/emporio/card-acquirers", { name: nome.trim() });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(adquirente ? "Adquirente renomeada." : "Adquirente cadastrada.");
    setOpen(false);
    if (!adquirente) setNome("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        adquirente ? (
          <Button variant="outline" size="sm">
            Renomear
          </Button>
        ) : (
          <Button>Nova adquirente</Button>
        )
      }
      title={adquirente ? "Renomear adquirente" : "Nova adquirente"}
      description="A empresa da maquininha (Cielo, Stone, Rede, a máquina do banco). A taxa e o prazo ficam por adquirente."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNome(adquirente?.name ?? "");
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={adquirente ? "Salvar nome" : "Cadastrar adquirente"}
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
    </FormSheet>
  );
}

/** Arquivar e reativar não têm formulário: a recusa vai para o aviso. */
export function AdquirenteArquivarBotao({ id, arquivada }: { id: string; arquivada: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function alternar() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/card-acquirers/${id}`, { archived: !arquivada });
    setLoading(false);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(arquivada ? "Adquirente reativada." : "Adquirente arquivada.");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" disabled={loading} onClick={alternar}>
      {arquivada ? "Reativar" : "Arquivar"}
    </Button>
  );
}
