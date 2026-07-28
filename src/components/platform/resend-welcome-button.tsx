"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client-api";

/** Reenvia a mensagem de boas-vindas do Tibé pelo WhatsApp — só master_admin. */
export default function ResendWelcomeButton({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function send() {
    setLoading(true);
    setFeedback(null);
    const res = await apiPost<{ sent: boolean }>(`/api/platform/tenants/${tenantId}/welcome-message`, {});
    setLoading(false);
    setFeedback(res.ok ? { ok: true, message: "Mensagem enviada." } : { ok: false, message: res.message });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={loading}
        className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? "Enviando..." : "Reenviar boas-vindas"}
      </button>
      {feedback && (
        <span className={`text-xs ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>{feedback.message}</span>
      )}
    </div>
  );
}
