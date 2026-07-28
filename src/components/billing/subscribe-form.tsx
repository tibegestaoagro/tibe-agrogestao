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
import { apiPost } from "@/lib/client-api";

type Plan = "campo" | "fazenda" | "grupo";
type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

const PLAN_LABEL: Record<Plan, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };
const PLAN_PRICE: Record<Plan, string> = { campo: "R$ 97", fazenda: "R$ 197", grupo: "R$ 397" };

type SubscribeResult =
  | { method: "pix"; payload: string; encodedImage: string; expirationDate: string }
  | { method: "boleto"; identificationField: string; barCode: string }
  | { method: "redirect"; redirectUrl: string };

export default function SubscribeForm({ currentPlan }: { currentPlan: Plan | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>(currentPlan ?? "fazenda");
  const [billingType, setBillingType] = useState<BillingType>("PIX");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubscribeResult | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await apiPost<SubscribeResult>("/api/v1/billing/subscribe", {
      plan,
      billing_type: billingType,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (res.data.method === "redirect") {
      window.open(res.data.redirectUrl, "_blank");
    }
    setResult(res.data);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-700">
        {currentPlan ? "Trocar de plano" : "Assinar agora"}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600">Plano</label>
          <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PLAN_LABEL[p]}: {PLAN_PRICE[p]}/mês
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Forma de pagamento</label>
          <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PIX">PIX</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {billingType === "CREDIT_CARD" && (
        <p className="mt-2 text-xs text-gray-500">
          Cartão de crédito é processado numa página segura do próprio Asaas: você será
          redirecionado só nesta etapa.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <Button onClick={submit} disabled={loading} className="mt-4">
        {loading ? "Processando..." : currentPlan ? "Confirmar troca de plano" : "Assinar"}
      </Button>

      {result?.method === "pix" && (
        <div className="mt-5 rounded-md bg-tibe-light p-4">
          <p className="text-sm font-medium text-tibe-dark">Pague com PIX</p>
          <img
            src={`data:image/png;base64,${result.encodedImage}`}
            alt="QR Code PIX"
            className="mt-3 h-44 w-44"
          />
          <p className="mt-3 text-xs text-gray-600">PIX copia e cola:</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs">
            {result.payload}
          </code>
          <p className="mt-2 text-xs text-gray-500">
            Expira em {new Date(result.expirationDate).toLocaleString("pt-BR")}
          </p>
        </div>
      )}

      {result?.method === "boleto" && (
        <div className="mt-5 rounded-md bg-tibe-light p-4">
          <p className="text-sm font-medium text-tibe-dark">Pague com boleto</p>
          <p className="mt-2 text-xs text-gray-600">Linha digitável:</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs">
            {result.identificationField}
          </code>
        </div>
      )}
    </div>
  );
}
