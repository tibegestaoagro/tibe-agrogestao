"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPut } from "@/lib/client-api";

/** Ordem visual. `pin_confirmacao` só existe no cliente: não vai para a API. */
const ORDEM = ["pin", "pin_confirmacao", "password"] as const;

/**
 * Cadastrar ou trocar o PIN de autorização do Empório. O PIN nunca é mostrado
 * nem devolvido: a tela só sabe se ele existe (`temPin`).
 */
export function EmporioPinForm({ temPin }: { temPin: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [password, setPassword] = useState("");

  function fechar() {
    setOpen(false);
    setPin("");
    setConfirmacao("");
    setPassword("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM)[number], string>> = {};
    if (!/^\d{4,6}$/.test(pin)) novos.pin = "O PIN tem de 4 a 6 números.";
    if (confirmacao !== pin) novos.pin_confirmacao = "A confirmação não é igual ao PIN.";
    if (!password) novos.password = "Informe a sua senha de entrada.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPut<{ has_pin: boolean }>("/api/v1/me/emporio-pin", { pin, password });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(temPin ? "PIN trocado." : "PIN cadastrado.");
    fechar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">{temPin ? "Trocar PIN" : "Cadastrar PIN"}</Button>}
      title={temPin ? "Trocar PIN" : "Cadastrar PIN"}
      description="De 4 a 6 números. Ele libera desconto no balcão; não é a sua senha de entrada."
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : fechar())}
      onSubmit={submit}
      submitLabel={temPin ? "Trocar PIN" : "Cadastrar PIN"}
      submitPendingLabel="Salvando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="PIN" required id={err.idDe("pin")} error={err.erros.pin}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              err.limparCampo("pin");
            }}
          />
        )}
      </Field>
      <Field label="Confirme o PIN" required id={err.idDe("pin_confirmacao")} error={err.erros.pin_confirmacao}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={confirmacao}
            onChange={(e) => {
              setConfirmacao(e.target.value.replace(/\D/g, ""));
              err.limparCampo("pin_confirmacao");
            }}
          />
        )}
      </Field>
      <Field
        label="Senha de entrada"
        required
        id={err.idDe("password")}
        error={err.erros.password}
        hint="Pedimos a senha para confirmar que é você."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              err.limparCampo("password");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
