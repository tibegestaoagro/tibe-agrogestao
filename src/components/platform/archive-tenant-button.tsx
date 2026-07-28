"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

/** Arquiva/desarquiva um tenant (spec 2026-07-27): só master_admin. Nunca deleta. */
export default function ArchiveTenantButton({
  tenantId,
  archived,
}: {
  tenantId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const verb = archived ? "desarquivar" : "arquivar";
    if (!window.confirm(`Confirma ${verb} este tenant?`)) return;
    setLoading(true);
    const res = await apiPost<{ archived_at: string | null }>(
      `/api/platform/tenants/${tenantId}/archive`,
      { archived: !archived },
    );
    setLoading(false);
    if (!res.ok) return window.alert(res.message);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-800 disabled:opacity-60"
    >
      {loading ? "Aguarde..." : archived ? "Desarquivar" : "Arquivar"}
    </button>
  );
}
