"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

type Role = "MASTER_ADMIN" | "EQUIPE";
const ROLE_LABEL: Record<Role, string> = { MASTER_ADMIN: "Master Admin", EQUIPE: "Equipe" };

/** Convite de novo membro da equipe (spec 6.10) — só master_admin. */
export default function InviteTeamForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EQUIPE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    if (!name || !email) return setError("Preencha nome e email.");
    setLoading(true);
    setError(null);
    const res = await apiPost<{ temp_password: string }>("/api/platform/team", { name, email, role });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setRole("EQUIPE");
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
        Convidar membro
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-700 bg-gray-900 p-4">
      {tempPassword ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-300">
            Membro criado. Repasse estas credenciais manualmente — a senha só aparece aqui uma vez.
          </p>
          <p className="text-sm text-gray-300">
            Email: <span className="font-mono">{email}</span>
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
            <label className="block text-xs text-gray-400">Nome *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400">Papel *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Criando..." : "Convidar"}
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
