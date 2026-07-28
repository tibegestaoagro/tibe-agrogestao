"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { writeUtmCookieIfAbsent } from "@/lib/utm";

/**
 * Captura UTM da URL em qualquer página pública (renderizado dentro de
 * PublicNav, presente em todas elas) e grava em cookie first-touch: não
 * renderiza nada visível.
 */
export default function UtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const utm_source = searchParams.get("utm_source");
    const utm_medium = searchParams.get("utm_medium");
    const utm_campaign = searchParams.get("utm_campaign");
    if (!utm_source && !utm_medium && !utm_campaign) return;
    writeUtmCookieIfAbsent({ utm_source, utm_medium, utm_campaign });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
