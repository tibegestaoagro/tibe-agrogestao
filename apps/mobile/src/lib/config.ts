/**
 * Base URL da API do Tibé. Nunca fixa no código-fonte (briefing da Onda 2,
 * agente B2, decisão 8): aponta para o back-end local em desenvolvimento (o
 * mesmo `next dev` que o painel web usa) ou para a URL de produção, conforme
 * a variável de ambiente `EXPO_PUBLIC_API_BASE_URL`.
 *
 * Variáveis prefixadas com `EXPO_PUBLIC_` são embutidas no bundle pelo Expo
 * em tempo de build (https://docs.expo.dev/guides/environment-variables/):
 * não é segredo nenhum (é só uma URL pública), então não há problema em ir
 * para o cliente. Defina em `apps/mobile/.env` (veja `.env.example` neste
 * mesmo diretório).
 *
 * Em dispositivo físico (celular real na rede local), `localhost` aponta
 * para o próprio celular, não para o computador rodando `next dev`: use o IP
 * da máquina na rede local (ex: http://192.168.0.10:3000). Em emulador
 * Android, `localhost` também não alcança o host; use 10.0.2.2. Em simulador
 * iOS, `localhost` funciona normalmente.
 */
const DEFAULT_DEV_API_BASE_URL = "http://localhost:3000";

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return DEFAULT_DEV_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
