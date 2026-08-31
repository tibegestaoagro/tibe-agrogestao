"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client-api";
import { useAviso } from "@/components/ui/toast";

type Preference = { alert_type: string; enabled: boolean; label: string };

export default function AlertPreferenceToggles({ preferences }: { preferences: Preference[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [savingType, setSavingType] = useState<string | null>(null);

  /**
   * Ligar e desligar um tipo de alerta.
   *
   * Engolia o erro (2026-08-20). O sintoma era cruel: o interruptor voltava
   * sozinho ao estado anterior depois do `refresh`, e o produtor concluía que
   * a preferência "não pega", sem nunca saber que a gravação falhou.
   */
  async function toggle(pref: Preference) {
    setSavingType(pref.alert_type);
    const res = await apiPatch("/api/v1/alert-preferences", {
      alert_type: pref.alert_type,
      enabled: !pref.enabled,
    });
    setSavingType(null);
    if (res.ok) {
      aviso.sucesso(
        pref.enabled ? `Avisos de ${pref.label} desligados.` : `Avisos de ${pref.label} ligados.`,
      );
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="rounded-lg border border-borda bg-superficie divide-y divide-gray-100">
      {preferences.map((p) => (
        <label
          key={p.alert_type}
          className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer"
        >
          <span className="text-sm text-texto">{p.label}</span>
          <input
            type="checkbox"
            checked={p.enabled}
            disabled={savingType === p.alert_type}
            onChange={() => toggle(p)}
            className="h-4 w-4 rounded border-borda"
          />
        </label>
      ))}
    </div>
  );
}
