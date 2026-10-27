"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPut } from "@/lib/client-api";

const ORDEM = ["user_ids"] as const;

/** Q56: quem trabalha em cada loja. Sem nenhuma marca, todos os usuários veem a loja. */
export function VinculosForm({
  lojaId,
  lojaNome,
  usuarios,
  marcados,
}: {
  lojaId: string;
  lojaNome: string;
  usuarios: { id: string; name: string }[];
  marcados: string[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, `vinculos-${lojaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string[]>(marcados);

  function alternar(id: string, ligado: boolean) {
    setSel((atual) => (ligado ? [...atual, id] : atual.filter((x) => x !== id)));
    err.limparCampo("user_ids");
  }

  async function submit() {
    err.limparTudo();
    setLoading(true);
    const res = await apiPut(`/api/v1/emporio/establishments/${lojaId}/users`, { user_ids: sel });
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
          Quem trabalha aqui
        </Button>
      }
      title="Quem trabalha aqui"
      description={lojaNome}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSel(marcados);
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
      <Field label="Usuários" id={err.idDe("user_ids")} error={err.erros.user_ids}>
        {({ id, ...aria }) => (
          <div id={id} {...aria} tabIndex={-1} className="space-y-2">
            {usuarios.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-texto">
                <input
                  type="checkbox"
                  checked={sel.includes(u.id)}
                  onChange={(e) => alternar(u.id, e.target.checked)}
                  className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
                />
                {u.name}
              </label>
            ))}
          </div>
        )}
      </Field>
      {sel.length === 0 && (
        <p className="text-sm text-texto-secundario">Sem vínculo: todos os usuários veem esta loja.</p>
      )}
    </FormSheet>
  );
}
