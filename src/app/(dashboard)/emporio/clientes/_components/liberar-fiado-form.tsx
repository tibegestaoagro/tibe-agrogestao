"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["establishment_id", "reason"] as const;
type Campo = (typeof ORDEM)[number];

const CLASSE_TEXTAREA =
  "flex min-h-24 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

/**
 * O Gestor da loja (ou o Dono e o Gerente geral) libera UMA venda em fiado de cliente bloqueado,
 * até o fim do dia. `lojas` já vem filtrada no servidor: só as lojas em que o ator pode liberar.
 */
export function LiberarFiadoForm({
  customerId,
  lojas,
}: {
  customerId: string;
  lojas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "liberar");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : "");
  const [motivo, setMotivo] = useState("");
  // A confirmação mora aqui (e não na ficha) porque o `router.refresh()` preserva o estado do cliente.
  const [liberado, setLiberado] = useState(false);

  function reiniciar() {
    setLoja(lojas.length === 1 ? lojas[0].id : "");
    setMotivo("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!loja) novos.establishment_id = "Escolha a loja da liberação.";
    const texto = motivo.trim();
    if (texto.length < 3 || texto.length > 300) novos.reason = "Diga o motivo da liberação, de 3 a 300 caracteres.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/customers/${customerId}/credit/releases`, {
      establishment_id: loja,
      reason: texto,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    reiniciar();
    setLiberado(true);
    router.refresh();
  }

  return (
    <>
    {liberado && (
      <p role="status" className="basis-full rounded-md bg-sucesso-suave px-3 py-2 text-sm text-sucesso-tinta">
        Liberado até o fim do dia. O Caixa pode fechar a venda.
      </p>
    )}
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Liberar fiado hoje
        </Button>
      }
      title="Liberar fiado hoje"
      description="Libera uma venda em fiado até o fim do dia, nesta loja."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Liberar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={loja}
            onValueChange={(valor) => {
              if (valor === "") return;
              setLoja(valor);
              err.limparCampo("establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Motivo"
        required
        hint="De 3 a 300 caracteres. Fica no Histórico."
        id={err.idDe("reason")}
        error={err.erros.reason}
      >
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            className={CLASSE_TEXTAREA}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
          />
        )}
      </Field>
    </FormSheet>
    </>
  );
}
