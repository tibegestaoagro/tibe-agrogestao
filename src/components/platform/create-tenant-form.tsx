"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Criação manual de tenant pelo painel (spec 2026-07-24, revisado
 * 2026-07-27) — só master_admin. Sem campo de plano: o cliente escolhe o
 * plano ele mesmo no primeiro login, depois de trocar a senha temporária
 * (ver /escolher-plano) — Tenant nasce com plan_confirmed=false.
 */
export default function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
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
      owner_name: ownerName,
      owner_email: ownerEmail,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function reset() {
    setCompanyName("");
    setDocument("");
    setPhone("");
    setOwnerName("");
    setOwnerEmail("");
    setTempPassword(null);
    setError(null);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          Criar tenant
        </button>
      </SheetTrigger>
      <SheetContent
        title="Criar tenant"
        className="border-gray-800 bg-gray-900 text-gray-100"
      >
        <SheetHeader>
          <SheetTitle className="text-white">Criar tenant</SheetTitle>
        </SheetHeader>

        {tempPassword ? (
          <div className="space-y-3">
            <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Tenant criado. Repasse estas credenciais manualmente — a senha só aparece aqui uma vez.
              No primeiro login, o usuário será obrigado a trocar a senha e, em seguida, escolher o plano.
            </p>
            <p className="text-sm text-gray-300">
              Email: <span className="font-mono">{ownerEmail}</span>
            </p>
            <p className="text-sm text-gray-300">
              Senha temporária: <span className="font-mono">{tempPassword}</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
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
            <p className="text-xs text-gray-500">
              O plano é escolhido pelo próprio cliente no primeiro login, depois de trocar a senha.
            </p>
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
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
