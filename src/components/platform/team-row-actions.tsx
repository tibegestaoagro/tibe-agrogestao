"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client-api";

type Role = "MASTER_ADMIN" | "EQUIPE";
const ROLE_LABEL: Record<Role, string> = { MASTER_ADMIN: "Master Admin", EQUIPE: "Equipe" };

export default function TeamRowActions({
  memberId,
  role,
  active,
  isSelf,
}: {
  memberId: string;
  role: Role;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function changeRole(newRole: string) {
    setLoading(true);
    const res = await apiPatch(`/api/platform/team/${memberId}/role`, { role: newRole });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  async function toggleActive() {
    setLoading(true);
    const res = await apiPatch(`/api/platform/team/${memberId}/active`, { active: !active });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  if (isSelf) {
    return <span className="text-xs text-gray-500">{ROLE_LABEL[role]} (você)</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={role}
        onChange={(e) => changeRole(e.target.value)}
        disabled={loading}
        className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white"
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={toggleActive}
        disabled={loading}
        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 transition hover:bg-gray-800 disabled:opacity-60"
      >
        {active ? "Desativar" : "Reativar"}
      </button>
    </div>
  );
}
