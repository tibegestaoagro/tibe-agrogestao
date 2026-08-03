import { Platform } from "react-native";
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
 * `src/lib/auth-token.ts` no back-end): o tenant é sempre resolvido no
 * servidor a partir do usuário.
 */

const REFRESH_TOKEN_KEY = "tibe_refresh_token";
const USER_CACHE_KEY = "tibe_user_cache";

/**
 * `expo-secure-store` não tem implementação nenhuma pra web (não é "menos
 * seguro", é literalmente ausente: `getValueWithKeyAsync` nem existe no
 * módulo web, quebra com "is not a function"). O produto real é iOS/Android
 * (o PWA já é o produto web do Tibé, construído dentro do próprio Next.js,
 * não este app); web aqui existe só pra rodar `expo start --web` durante o
 * desenvolvimento/validação local. Por isso, e só nesse caso, cai pra
 * `localStorage` (sem criptografia: aceitável para essa finalidade, nunca
 * para o app publicado de verdade, que roda em iOS/Android via Keychain/
 * Keystore normalmente).
 */
const isWeb = Platform.OS === "web";

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function loadRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await deleteItem(REFRESH_TOKEN_KEY);
}

export async function saveUserCache(user: AuthUser): Promise<void> {
  await setItem(USER_CACHE_KEY, JSON.stringify(user));
}

export async function loadUserCache(): Promise<AuthUser | null> {
  const raw = await getItem(USER_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function clearUserCache(): Promise<void> {
  await deleteItem(USER_CACHE_KEY);
}
