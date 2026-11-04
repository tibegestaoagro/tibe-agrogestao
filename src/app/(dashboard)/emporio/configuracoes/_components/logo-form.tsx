"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiDelete, apiPut } from "@/lib/client-api";

const ORDEM = ["logo"] as const;

/** Lê o arquivo como base64 puro: o servidor decide o tipo pelos bytes, não pelo mime. */
function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

/** Logo do papel: prévia, troca (painel) e remoção (botão, com recusa no aviso). */
export function LogoForm({ temLogo, versao }: { temLogo: boolean; versao: string | null }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "logo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);

  function reiniciar() {
    setArquivo(null);
    err.limparTudo();
  }

  async function submit() {
    if (!arquivo) {
      err.setGlobal(null);
      err.reprovar({ logo: "Escolha a imagem do logo." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    let base64: string;
    try {
      base64 = await lerComoBase64(arquivo);
    } catch {
      setLoading(false);
      err.reprovar({ logo: "Não consegui ler o arquivo. Tente outro." });
      return;
    }
    const res = await apiPut("/api/v1/emporio/settings/logo", { data_base64: base64, mime: arquivo.type });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  async function remover() {
    setRemovendo(true);
    const res = await apiDelete("/api/v1/emporio/settings/logo");
    setRemovendo(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <div className="space-y-3">
      {temLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/v1/emporio/settings/logo?v=${encodeURIComponent(versao ?? "")}`}
          alt="Logo da loja"
          className="max-h-24 max-w-48 rounded-lg border border-borda bg-superficie p-2"
        />
      ) : (
        <p className="text-sm text-texto-secundario">Nenhum logo enviado. O papel sai só com o nome da loja.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <FormSheet
          trigger={<Button variant="outline">{temLogo ? "Trocar logo" : "Enviar logo"}</Button>}
          title={temLogo ? "Trocar logo" : "Enviar logo"}
          description="PNG ou JPEG, até 200 KB."
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reiniciar();
          }}
          onSubmit={submit}
          submitLabel="Enviar"
          pending={loading}
          error={err.global}
          focarCampoId={err.focarCampoId}
          tentativa={err.tentativa}
        >
          <Field label="Imagem" required id={err.idDe("logo")} error={err.erros.logo}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  err.limparCampo("logo");
                }}
              />
            )}
          </Field>
        </FormSheet>
        {temLogo && (
          <Button variant="outline" onClick={remover} disabled={removendo}>
            {removendo ? "Removendo..." : "Remover logo"}
          </Button>
        )}
      </div>
    </div>
  );
}
