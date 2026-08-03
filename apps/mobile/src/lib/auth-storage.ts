import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "@/types/api";

/**
 * Armazenamento seguro de sessão do aplicativo (briefing da Onda 2, agente
 * B2, decisão 4).
 *
 * O refresh token (validade de 30 dias) SEMPRE fica no `expo-secure-store`
 * (Keychain no iOS, Keystore no Android, criptografado em disco): NUNCA em
 * `AsyncStorage` puro, que grava em texto simples. Vazar esse token de um
 * aparelho perdido/roubado equivale a vazar a senha por um mês inteiro.
 *
 * O access token (15 min) não é persistido aqui de propósito: vive só em
 * memória (dentro do `AuthProvider`) e é descartável, então não vale o risco
 * de deixá-lo em disco, nem a complexidade de gerenciar mais uma chave.
 *
 * `AuthUser` (nome/email/role) é cacheado só para a tela Início poder
 * mostrar "Olá, Fulano" imediatamente ao reabrir o app, sem esperar uma
 * requisição. Isto NÃO é fonte de autoridade nenhuma: toda checagem de
 * permissão é sempre reconferida pelo servidor a cada requisição (`guard()`
 * em cada rota, a partir do token), nunca a partir deste cache local. E
 * `tenant_id` nunca é guardado aqui, nem em nenhum outro lugar do app: o
 * login por token não devolve esse campo (de propósito, ver
 * `src/lib/auth-token.ts` no back-end) — o tenant é sempre resolvido no
 * servidor a partir do usuário.
 */

const REFRESH_TOKEN_KEY = "tibe_refresh_token";
const USER_CACHE_KEY = "tibe_user_cache";

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveUserCache(user: AuthUser): Promise<void> {
  await SecureStore.setItemAsync(USER_CACHE_KEY, JSON.stringify(user));
}

export async function loadUserCache(): Promise<AuthUser | null> {
  const raw = await SecureStore.getItemAsync(USER_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function clearUserCache(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_CACHE_KEY);
}
