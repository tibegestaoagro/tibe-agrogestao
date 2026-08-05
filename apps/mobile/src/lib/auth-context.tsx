import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { ApiError, AuthExpiredError, rawRequest, toApiError, type RequestOptions } from "@/lib/api-client";
import {
  clearRefreshToken,
  clearUserCache,
  loadRefreshToken,
  loadUserCache,
  saveRefreshToken,
  saveUserCache,
} from "@/lib/auth-storage";
import { isBiometricEnabled, promptBiometrics } from "@/lib/biometrics";
import type { ApiOk, AuthUser, LoginData, TokenPair } from "@/types/api";

/**
 * Seam de identidade do aplicativo (briefing da Onda 2, agente B2, decisões
 * 4-6). É o ÚNICO lugar do app que sabe como a sessão funciona: login,
 * renovação silenciosa, rotação de refresh token, logout e o `authedFetch`
 * que toda tela usa para falar com a API já autenticada. Nenhuma tela chama
 * `fetch` diretamente.
 *
 * Espelha, do lado do cliente, o mesmo seam que `getSessionUser()`
 * implementa no back-end (`src/lib/tenant-context.ts`): o token carrega
 * só identidade (`user_id`), nunca `tenant_id`: o servidor resolve o
 * tenant sozinho a cada requisição. Este arquivo nunca guarda, deriva ou
 * envia um `tenant_id`; se um dia alguém sentir necessidade de adicionar
 * isso aqui, pare: é sinal de que a regra está migrando pro lugar errado.
 */

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthUser | null };

type SignInResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /**
   * `fetch` autenticado para rotas `/api/v1/*`. Anexa `Authorization:
   * Bearer`, tenta renovar UMA vez em caso de 401 e repete a requisição
   * original, e lança `AuthExpiredError` se nem isso resolver (a sessão
   * já foi encerrada localmente nesse ponto). Em qualquer outro erro do
   * envelope da API, lança `ApiError` com o `code`/`message` reais do
   * back-end (já em pt-BR, pronto para mostrar na tela).
   */
  authedFetch: <T>(path: string, init?: RequestOptions) => Promise<ApiOk<T>>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Refs = fonte da verdade "ao vivo" para código assíncrono (o valor mais
  // recente, sem depender de closures presas ao `state` do momento em que a
  // função foi criada). `state` só existe para disparar re-render da UI.
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshingRef = useRef<Promise<string | null> | null>(null);
  const proactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProactiveTimer = useCallback(() => {
    if (proactiveTimerRef.current) {
      clearTimeout(proactiveTimerRef.current);
      proactiveTimerRef.current = null;
    }
  }, []);

  /**
   * Agenda uma renovação silenciosa a 90% da validade do access token. É só
   * conforto de UX (evita uma requisição do usuário esbarrar num 401 no meio
   * do uso); a renovação REATIVA em `authedFetch` continua sendo a rede de
   * segurança real, então uma falha aqui (app em background, sem rede) não é
   * tratada como erro.
   */
  const scheduleProactiveRefresh = useCallback(
    (expiresInSeconds: number) => {
      clearProactiveTimer();
      const delayMs = Math.max(expiresInSeconds * 0.9, 5) * 1000;
      proactiveTimerRef.current = setTimeout(() => {
        void triggerRefresh();
      }, delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearProactiveTimer],
  );

  const applyTokenPair = useCallback(
    async (pair: TokenPair) => {
      accessTokenRef.current = pair.access_token;
      refreshTokenRef.current = pair.refresh_token;
      await saveRefreshToken(pair.refresh_token);
      scheduleProactiveRefresh(pair.expires_in);
    },
    [scheduleProactiveRefresh],
  );

  const forceSignOut = useCallback(async () => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    clearProactiveTimer();
    await Promise.all([clearRefreshToken(), clearUserCache()]);
    setState({ status: "signedOut" });
  }, [clearProactiveTimer]);

  /**
   * Renova o par de tokens. O refresh token é de uso único com rotação no
   * back-end (`POST /api/v1/auth/token/refresh` invalida o token apresentado
   * ao emitir o novo): chamadas concorrentes coalescem numa única promise
   * (`refreshingRef`) para que a segunda nunca chegue com um token que a
   * primeira já consumiu, o que derrubaria a sessão à toa.
   */
  const triggerRefresh = useCallback((): Promise<string | null> => {
    if (!refreshingRef.current) {
      refreshingRef.current = doRefresh().finally(() => {
        refreshingRef.current = null;
      });
    }
    return refreshingRef.current;

    async function doRefresh(): Promise<string | null> {
      const raw = refreshTokenRef.current ?? (await loadRefreshToken());
      if (!raw) return null;

      let res: Response;
      let body: unknown;
      try {
        ({ res, body } = await rawRequest("/api/v1/auth/token/refresh", {
          method: "POST",
          json: { refresh_token: raw },
        }));
      } catch {
        // Falha de REDE (sem conexão, timeout) não é a mesma coisa que
        // refresh token inválido: não desloga por causa de Wi-Fi ruim, só
        // esta tentativa falha e quem chamou decide o que fazer.
        return null;
      }

      if (res.status === 401) {
        // O back-end devolve o MESMO INVALID_REFRESH_TOKEN para token
        // inexistente, expirado, revogado OU já usado: é aqui, e só aqui,
        // que a sessão termina de verdade.
        await forceSignOut();
        return null;
      }
      if (!res.ok) return null; // erro do servidor (5xx etc.): tentativa falhou, sessão local preservada

      const pair = (body as ApiOk<TokenPair> | null)?.data;
      if (!pair) return null;

      await applyTokenPair(pair);
      return pair.access_token;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTokenPair, forceSignOut]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      let res: Response;
      let body: unknown;
      try {
        ({ res, body } = await rawRequest("/api/v1/auth/token", {
          method: "POST",
          json: { email, password },
        }));
      } catch {
        return {
          ok: false,
          message: "Não foi possível conectar ao servidor. Verifique sua conexão.",
        };
      }

      if (!res.ok) {
        const err: ApiError = toApiError(body, res.status);
        return { ok: false, message: err.message };
      }

      const data = (body as ApiOk<LoginData>).data;
      await applyTokenPair(data);
      await saveUserCache(data.user);
      setState({ status: "signedIn", user: data.user });
      return { ok: true };
    },
    [applyTokenPair],
  );

  const signOut = useCallback(async () => {
    const raw = refreshTokenRef.current ?? (await loadRefreshToken());
    clearProactiveTimer();
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    await Promise.all([clearRefreshToken(), clearUserCache()]);
    setState({ status: "signedOut" });
    if (raw) {
      // Melhor esforço: o logout local já aconteceu (é o que importa pra
      // UI); não vale travar a saída numa chamada de rede nem repetir se
      // falhar. O access token já emitido expira sozinho em até 15 min
      // (mesma decisão do back-end, ver POST /api/v1/auth/token/revoke).
      rawRequest("/api/v1/auth/token/revoke", {
        method: "POST",
        json: { refresh_token: raw },
      }).catch(() => {});
    }
  }, [clearProactiveTimer]);

  const authedFetch = useCallback(
    async <T,>(path: string, init?: RequestOptions): Promise<ApiOk<T>> => {
      let token = accessTokenRef.current ?? (await triggerRefresh());
      if (!token) throw new AuthExpiredError();

      let { res, body } = await rawRequest(path, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        token = await triggerRefresh();
        if (!token) throw new AuthExpiredError();
        ({ res, body } = await rawRequest(path, {
          ...init,
          headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
        }));
      }

      if (!res.ok) throw toApiError(body, res.status);
      return body as ApiOk<T>;
    },
    [triggerRefresh],
  );

  // Bootstrap: roda uma vez, ao abrir o app. Tenta renovar silenciosamente a
  // partir do refresh token salvo (briefing, decisão 5); sem token salvo, ou
  // com renovação recusada pelo servidor, cai para a tela de login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await loadRefreshToken();
      if (!raw) {
        if (!cancelled) setState({ status: "signedOut" });
        return;
      }

      // Portão biométrico (spec da fundação de UI): quando o usuário ativou
      // biometria, ela é pedida ANTES de a sessão salva ser restaurada.
      // Precisa ser aqui, e não numa tela: qualquer gate desenhado depois
      // deste ponto teria a sessão já válida por trás dele, e bastaria
      // fechar o aviso para estar dentro.
      //
      // Falhar cai na tela de senha em vez de bloquear o app: a biometria é
      // um atalho, e perdê-la (dedo sujo, máscara, leitor quebrado) não pode
      // significar perder o acesso à própria fazenda.
      if (await isBiometricEnabled()) {
        const passou = await promptBiometrics("Entrar no Tibé");
        if (cancelled) return;
        if (!passou) {
          setState({ status: "signedOut" });
          return;
        }
      }

      refreshTokenRef.current = raw;
      const token = await triggerRefresh();
      if (cancelled) return;
      if (!token) {
        setState({ status: "signedOut" });
        return;
      }
      const cachedUser = await loadUserCache();
      if (cancelled) return;
      setState({ status: "signedIn", user: cachedUser });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextValue = { state, signIn, signOut, authedFetch };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>");
  return ctx;
}
