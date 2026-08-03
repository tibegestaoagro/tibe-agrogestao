"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client-api";

type Preference = { alert_type: string; enabled: boolean; label: string };

export default function AlertPreferenceToggles({ preferences }: { preferences: Preference[] }) {
  const router = useRouter();
  const [savingType, setSavingType] = useState<string | null>(null);

  async function toggle(pref: Preference) {
    setSavingType(pref.alert_type);
    await apiPatch("/api/v1/alert-preferences", {
      alert_type: pref.alert_type,
      enabled: !pref.enabled,
    });
    setSavingType(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
      {preferences.map((p) => (
        <label
          key={p.alert_type}
          className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer"
        >
          <span className="text-sm text-gray-900">{p.label}</span>
          <input
            type="checkbox"
            checked={p.enabled}
            disabled={savingType === p.alert_type}
            onChange={() => toggle(p)}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>
      ))}
    </div>
  );
}
