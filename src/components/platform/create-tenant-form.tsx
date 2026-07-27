"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

type Plan = "campo" | "fazenda" | "grupo";
const PLAN_LABEL: Record<Plan, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };

/** Criação manual de tenant pelo painel (spec 2026-07-24) — só master_admin. */
export default function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("fazenda");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    if (!companyName || !document || !phone || !ownerName || !ownerEmail) {
      return setError("Preencha todos os campos.");
    }
    setLoading(true);
    setError(null);
    const res = await apiPost<{ temp_password: string }>("/api/platform/tenants", {
      company_name: companyName,
      document,
      phone,
      plan,
      owner_name: ownerName,
      owner_email: ownerEmail,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setCompanyName("");
    setDocument("");
    setPhone("");
    setPlan("fazenda");
    setOwnerName("");
    setOwnerEmail("");
    setTempPassword(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
      >
        Criar tenant
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-700 bg-gray-900 p-4">
      {tempPassword ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-300">
            Tenant criado. Repasse estas credenciais manualmente — a senha só aparece aqui uma vez.
            No primeiro login, o usuário será obrigado a trocar a senha.
          </p>
          <p className="text-sm text-gray-300">
            Email: <span className="font-mono">{ownerEmail}</span>
          </p>
          <p className="text-sm text-gray-300">
            Senha temporária: <span className="font-mono">{tempPassword}</span>
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400">Nome da empresa *</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
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
            <label className="block text-xs text-gray-400">Telefone *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
            <p className="mt-1 text-xs text-gray-500">Editável depois pelo próprio cliente na assinatura.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400">Nome do responsável *</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Email do responsável *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Criando..." : "Criar"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
