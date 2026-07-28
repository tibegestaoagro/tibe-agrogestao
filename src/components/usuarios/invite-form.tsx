"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { apiPost } from "@/lib/client-api";

type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  VISUALIZADOR: "Visualizador",
};

export default function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("OPERADOR");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    if (!name || !email) return setError("Preencha nome e email.");
    setLoading(true);
    setError(null);
    const res = await apiPost<{ temp_password: string }>("/api/v1/users", {
      name, email, phone: phone || null, role,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setName(""); setEmail(""); setPhone(""); setRole("OPERADOR");
    setTempPassword(null); setError(null);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <SheetTrigger asChild>
        <Button>Convidar usuário</Button>
      </SheetTrigger>
      <SheetContent title="Convidar usuário">
        <SheetHeader><SheetTitle>Convidar usuário</SheetTitle></SheetHeader>

        {tempPassword ? (
          <div className="space-y-3">
            <p className="rounded-md bg-tibe-light p-3 text-sm text-tibe-dark">
              Usuário criado. Repasse estas credenciais manualmente: a senha
              só aparece aqui uma vez.
            </p>
            <div>
              <Label>Email</Label>
              <Input readOnly value={email} />
            </div>
            <div>
              <Label>Senha temporária</Label>
              <Input readOnly value={tempPassword} className="font-mono" />
            </div>
            <Button onClick={close} className="w-full">Fechar</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="u-name">Nome *</Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="u-email">Email *</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="u-phone">Telefone</Label>
              <Input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Papel *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as Role[])
                    .filter((r) => r !== "OWNER" || canInviteOwner)
                    .map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button onClick={submit} disabled={loading} className="w-full">
              {loading ? "Criando..." : "Convidar"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
