"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
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

type Plan = "campo" | "fazenda" | "grupo";
const PLAN_LABEL: Record<Plan, string> = {
  campo: "Campo",
  fazenda: "Fazenda",
  grupo: "Grupo",
};

function isPlan(v: string | null): v is Plan {
  return v === "campo" || v === "fazenda" || v === "grupo";
}

export default function SignupForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialPlan = isPlan(sp.get("plan")) ? sp.get("plan")! : "fazenda";

  const [plan, setPlan] = useState<Plan>(initialPlan as Plan);
  const [companyName, setCompanyName] = useState("");
  const [taxDocument, setTaxDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: companyName,
        document: taxDocument,
        phone,
        plan,
        owner_name: ownerName,
        owner_email: email,
        password,
      }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setLoading(false);
      setError(body?.error?.message ?? "Não foi possível criar a conta.");
      return;
    }

    // Conta criada — login automático com as mesmas credenciais.
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (!signInRes || signInRes.error) {
      // Conta foi criada, mas o login automático falhou: manda para /login.
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Plano</Label>
        <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PLAN_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="company_name">Nome da empresa *</Label>
        <Input
          id="company_name"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="document">CNPJ ou CPF *</Label>
          <Input
            id="document"
            required
            value={taxDocument}
            onChange={(e) => setTaxDocument(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="owner_name">Seu nome (responsável) *</Label>
        <Input
          id="owner_name"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="email">Email (será seu login) *</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="password">Senha *</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confirm_password">Confirmar senha *</Label>
          <Input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}
