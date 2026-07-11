"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPut } from "@/lib/client-api";

type Provider = "evolution" | "meta_cloud_api";

const PROVIDER_LABEL: Record<Provider, string> = {
  evolution: "Evolution API (não-oficial)",
  meta_cloud_api: "Meta Cloud API (oficial)",
};

const FIELDS: Record<Provider, { key: string; label: string; type?: string }[]> = {
  evolution: [
    { key: "base_url", label: "URL base (ex: https://evo.up.railway.app)" },
    { key: "api_key", label: "API key", type: "password" },
    { key: "instance", label: "Nome da instância" },
  ],
  meta_cloud_api: [
    { key: "access_token", label: "Access token", type: "password" },
    { key: "phone_number_id", label: "Phone Number ID" },
  ],
};

/** Card de config de um provider WhatsApp (spec 2026-07-11) — só master_admin. */
export default function WhatsAppProviderCard({
  provider,
  configured,
  active,
  credentialsMasked,
}: {
  provider: Provider;
  configured: boolean;
  active: boolean;
  credentialsMasked: Record<string, string> | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const missing = FIELDS[provider].some((f) => !values[f.key]?.trim());
    if (missing) return setError("Preencha todos os campos.");
    setLoading(true);
    setError(null);
    const res = await apiPut<{ provider: string }>("/api/platform/whatsapp-config", {
      provider,
      credentials: values,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setEditing(false);
    setValues({});
    router.refresh();
  }

  async function activate() {
    if (!window.confirm(`Ativar ${PROVIDER_LABEL[provider]} como provider de envio?`)) return;
    setLoading(true);
    setError(null);
    const res = await apiPost<{ provider: string }>(
      `/api/platform/whatsapp-config/${provider}/activate`,
      {},
    );
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">{PROVIDER_LABEL[provider]}</h2>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              active
                ? "bg-emerald-500/15 text-emerald-300"
                : configured
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-gray-600/20 text-gray-400"
            }`}
          >
            {active ? "Ativo" : configured ? "Configurado (inativo)" : "Não configurado"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            {editing ? "Cancelar" : configured ? "Editar" : "Configurar"}
          </button>
          {configured && !active && (
            <button
              type="button"
              onClick={activate}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              Ativar
            </button>
          )}
        </div>
      </div>

      {!editing && credentialsMasked && (
        <dl className="mt-4 space-y-1">
          {Object.entries(credentialsMasked).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="text-gray-500">{k}:</dt>
              <dd className="font-mono text-gray-300">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing && (
        <div className="mt-4 space-y-3">
          {FIELDS[provider].map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-gray-400">{f.label} *</label>
              <input
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={loading}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar credenciais"}
          </button>
        </div>
      )}
      {!editing && error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
