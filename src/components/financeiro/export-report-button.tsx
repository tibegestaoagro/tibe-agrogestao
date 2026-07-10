"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/client-api";

export default function ExportReportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportReport() {
    setLoading(true);
    setError(null);
    const res = await apiGet<{ report_url: string }>("/api/v1/financial/report/link");
    setLoading(false);
    if (!res.ok) return setError(res.message);
    window.open(res.data.report_url, "_blank");
  }

  return (
    <div>
      <Button variant="outline" onClick={exportReport} disabled={loading}>
        {loading ? "Gerando..." : "Exportar relatório (PDF)"}
      </Button>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
