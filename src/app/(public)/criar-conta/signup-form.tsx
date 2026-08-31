"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { readUtmCookie } from "@/lib/utm";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const utm = readUtmCookie();

    // Etapa 1 não cria conta nenhuma: só abre o cadastro pendente e dispara o
    // código de WhatsApp (Módulo 19). Tenant e User só nascem na etapa 4.
    const res = await fetch("/api/v1/signup/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: companyName,
        document: taxDocument,
        phone,
        plan,
        owner_name: ownerName,
        owner_email: email,
        utm_source: utm?.utm_source ?? null,
        utm_medium: utm?.utm_medium ?? null,
        utm_campaign: utm?.utm_campaign ?? null,
      }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(body?.error?.message ?? "Não foi possível iniciar o cadastro.");
      return;
    }

    router.push("/criar-conta/whatsapp");
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

      {error && (
        <p className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">{error}</p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enviando código..." : "Continuar"}
      </Button>

      <p className="text-center text-xs text-texto-discreto">
        Vamos confirmar seu WhatsApp e seu email antes de criar a conta. A senha
        é enviada por esses canais, então você não precisa criar uma agora.
      </p>
    </form>
  );
}
