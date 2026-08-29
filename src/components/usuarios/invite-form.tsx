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
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  VISUALIZADOR: "Visualizador",
};

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "email", "phone", "role"] as const;
type Campo = (typeof ORDEM)[number];

export default function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("OPERADOR");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    // Com a senha na tela, o botão do rodapé vira "Fechar": o mesmo submit
    // encerra o painel em vez de criar outro usuário.
    if (tempPassword) {
      close();
      return;
    }

    // Antes os dois dividiam UMA frase ("Preencha nome e email"), e quem
    // tinha esquecido só o email lia a cobrança dos dois.
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do usuário.";
    if (!email.trim()) novos.email = "Informe o email de acesso.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ temp_password: string }>("/api/v1/users", {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      role,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
    setRole("OPERADOR");
    setTempPassword(null);
    err.limparTudo();
  }

  return (
    <FormSheet
      trigger={<Button>Convidar usuário</Button>}
      title="Convidar usuário"
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : close())}
      onSubmit={submit}
      submitLabel={tempPassword ? "Fechar" : "Convidar"}
      submitPendingLabel="Criando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {tempPassword ? (
        /*
         * Isto NÃO é formulário, é resultado: a senha temporária aparece uma
         * vez só e some quando o painel fecha. Por isso continua com `Label` +
         * `Input readOnly` em vez de `Field`, que existe para campo editável.
         */
        <div className="space-y-3">
          <p className="rounded-md bg-primaria-suave p-3 text-sm text-primaria-tinta">
            Usuário criado. Repasse estas credenciais manualmente: a senha
            só aparece aqui uma vez.
          </p>
          <div className="space-y-1">
            <Label htmlFor="convite-email-criado">Email</Label>
            <Input id="convite-email-criado" readOnly value={email} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="convite-senha-criada">Senha temporária</Label>
            <Input
              id="convite-senha-criada"
              readOnly
              value={tempPassword}
              className="font-mono"
            />
          </div>
        </div>
      ) : (
        <>
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

          <Field label="Email" required id="email" error={err.erros.email}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  err.limparCampo("email");
                }}
              />
            )}
          </Field>

          <Field label="Telefone" id="phone" error={err.erros.phone}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>

          <Field label="Papel" required id="role" error={err.erros.role}>
            {({ id, ...aria }) => (
              <Select
                value={role}
                onValueChange={(v) => {
                  setRole(v as Role);
                  err.limparCampo("role");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as Role[])
                    .filter((r) => r !== "OWNER" || canInviteOwner)
                    .map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </>
      )}
    </FormSheet>
  );
}
