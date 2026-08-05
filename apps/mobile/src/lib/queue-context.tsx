import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, AuthExpiredError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  enqueue,
  flushQueue,
  readQueue,
  removeFromQueue,
  type QueuedWrite,
} from '@/lib/offline-queue';

/**
 * Liga a fila de escrita (`offline-queue.ts`) à conexão e à sessão.
 *
 * A fila em si não sabe nada de React nem de autenticação, de propósito.
 * Este arquivo é a única parte que sabe as três coisas: quando há conexão,
 * como enviar autenticado, e como avisar a interface.
 *
 * ## Quando tenta subir
 *
 * Ao montar, ao app voltar do segundo plano, e depois de cada item novo
 * entrar na fila. NÃO existe timer periódico: um `setInterval` acordaria o
 * rádio do aparelho sem nada para enviar na maior parte do tempo, e o
 * momento em que o produtor sai do pasto e reabre o app já é exatamente o
 * gatilho que interessa.
 */

type QueueContextValue = {
  pending: QueuedWrite[];
  /** Itens que o servidor recusou por regra de negócio; esperam decisão. */
  failed: QueuedWrite[];
  /**
   * Executa a escrita agora se houver conexão; enfileira se não houver.
   * Devolve `queued: true` quando foi para a fila, para a tela poder dizer
   * "salvo, sobe quando a conexão voltar" em vez de fingir que salvou.
   */
  submit: (item: Omit<QueuedWrite, 'id' | 'created_at' | 'failure'>) => Promise<
    { queued: false } | { queued: true }
  >;
  flush: () => Promise<void>;
  discard: (id: string) => Promise<void>;
};

const QueueContext = createContext<QueueContextValue | null>(null);

async function hasConnection(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    // `isInternetReachable` é `undefined` em algumas plataformas: nesse caso
    // vale a conexão declarada. Melhor tentar e falhar (o item volta para a
    // fila) do que enfileirar quem estava online.
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true; // sem saber, tenta: o erro de rede é tratado no envio
  }
}

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const { state, authedFetch } = useAuth();
  const [items, setItems] = useState<QueuedWrite[]>([]);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    // Trava de reentrância: `AppState` e o efeito de montagem podem disparar
    // juntos, e duas varreduras simultâneas enviariam o mesmo item duas
    // vezes, criando registro duplicado no banco do cliente.
    if (flushingRef.current) return;
    if (state.status !== 'signedIn') return;
    if (!(await hasConnection())) return;

    flushingRef.current = true;
    try {
      const result = await flushQueue(async (item) => {
        try {
          await authedFetch(item.path, { method: item.method, json: item.body });
          return { ok: true };
        } catch (e) {
          if (e instanceof ApiError) {
            // 5xx é problema do servidor, não do registro: tratamos como
            // falha de rede (lança) para o item continuar na fila e tentar
            // de novo, em vez de virar "recusado" e exigir decisão humana.
            if (e.status >= 500) throw e;
            return { ok: false, code: e.code, message: e.message };
          }
          throw e; // rede ou sessão expirada: interrompe a varredura
        }
      });
      setItems(result.remaining);
    } catch (e) {
      if (e instanceof AuthExpiredError) setItems(await readQueue());
    } finally {
      flushingRef.current = false;
    }
  }, [authedFetch, state.status]);

  const submit = useCallback<QueueContextValue['submit']>(
    async (item) => {
      if (await hasConnection()) {
        try {
          await authedFetch(item.path, { method: item.method, json: item.body });
          return { queued: false };
        } catch (e) {
          // Recusa do servidor é erro do usuário e precisa aparecer AGORA,
          // com o campo errado à vista. Enfileirar um 422 esconderia o erro
          // e o registro morreria na fila sem ninguém entender por quê.
          if (e instanceof ApiError && e.status < 500) throw e;
          if (e instanceof AuthExpiredError) throw e;
        }
      }
      setItems(await enqueue(item));
      return { queued: true };
    },
    [authedFetch],
  );

  const discard = useCallback(async (id: string) => {
    setItems(await removeFromQueue(id));
  }, []);

  useEffect(() => {
    readQueue().then(setItems);
  }, []);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    flush();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') flush();
    });
    return () => sub.remove();
  }, [flush, state.status]);

  return (
    <QueueContext.Provider
      value={{
        pending: items.filter((i) => !i.failure),
        failed: items.filter((i) => !!i.failure),
        submit,
        flush,
        discard,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue precisa ser usado dentro de <QueueProvider>');
  return ctx;
}
