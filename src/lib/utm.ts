/**
 * Captura de UTM (Módulo 6, task 6.7 — funil por origem). First-touch: o
 * cookie só é gravado se ainda não existir, para não sobrescrever a origem
 * real do lead com uma navegação interna sem UTM (e.g. clicar de /planos
 * para /criar-conta).
 */
export const UTM_COOKIE_NAME = "tibe_utm";
const UTM_COOKIE_MAX_AGE_DAYS = 30;

export type UtmData = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function readUtmCookie(): UtmData | null {
  if (typeof document === "undefined") return null;
  const raw = getCookie(UTM_COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UtmData;
  } catch {
    return null;
  }
}

export function writeUtmCookieIfAbsent(data: UtmData): void {
  if (typeof document === "undefined") return;
  if (getCookie(UTM_COOKIE_NAME)) return; // first-touch: não sobrescreve
  const maxAge = UTM_COOKIE_MAX_AGE_DAYS * 86_400;
  document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=${maxAge}; samesite=lax`;
}
