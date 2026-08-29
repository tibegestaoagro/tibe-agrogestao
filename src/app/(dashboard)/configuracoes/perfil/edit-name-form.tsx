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

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name"] as const;

/**
 * Nome do usuário, em Configurações → Perfil.
 *
 * Renderiza o nome como as outras linhas do cartão (email, papel, fazenda) e
 * abre o painel lateral para editar. O aviso de "Nome atualizado" era um
 * parágrafo que ficava na tela até a próxima ação; agora é o toast do kit,
 * que é lido por leitor de tela e some sozinho.
 */
export default function EditNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  async function submit() {
    // `minLength={2}` do navegador saía numa bolha em inglês que some sozinha
    // e leitor de tela nenhum lê. A regra continua, a mensagem é nossa.
    if (name.trim().length < 2) {
      err.setGlobal(null);
      err.reprovar({ name: "O nome precisa ter pelo menos 2 letras." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch<{ name: string }>("/api/v1/auth/profile", {
      name: name.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Nome atualizado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm font-medium text-texto-secundario">Nome</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-sm text-texto">{initialName || "Não informado"}</p>
        <FormSheet
          trigger={
            <Button variant="outline" size="sm">
              Editar
            </Button>
          }
          title="Editar nome"
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setName(initialName);
              err.limparTudo();
            }
          }}
          onSubmit={submit}
          submitLabel="Salvar nome"
          pending={loading}
          error={err.global}
          focarCampoId={err.focarCampoId}
          tentativa={err.tentativa}
        >
          <Field label="Nome" required id="name" error={err.erros.name}>
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
        </FormSheet>
      </div>
    </div>
  );
}
