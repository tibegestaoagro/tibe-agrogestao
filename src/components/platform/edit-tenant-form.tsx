"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client-api";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Plan = "campo" | "fazenda" | "grupo";
const PLAN_LABEL: Record<Plan, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };

/** Edição de dados cadastrais + plano de um tenant (spec 2026-07-27): só master_admin. */
export default function EditTenantForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: { name: string; document: string; phone: string | null; email: string | null; plan: Plan };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [document, setDocument] = useState(initial.document);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [plan, setPlan] = useState<Plan>(initial.plan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name || !document) return setError("Nome e CNPJ/CPF são obrigatórios.");
    setLoading(true);
    setError(null);
    const res = await apiPatch<{ id: string }>(`/api/platform/tenants/${tenantId}`, {
      name,
      document,
      phone: phone || null,
      email: email || null,
      plan,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          Editar
        </button>
      </SheetTrigger>
      <SheetContent title="Editar tenant" className="border-gray-800 bg-gray-900 text-gray-100">
        <SheetHeader>
          <SheetTitle className="text-white">Editar tenant</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400">Nome da empresa *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">CNPJ/CPF *</label>
            <input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Plano *</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            >
              {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Troca direta, sem passar pelo Asaas: o cliente não é cobrado automaticamente pela diferença.
            </p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
