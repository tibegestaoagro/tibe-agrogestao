import { fetchWithCache, readCache, writeCache } from '@/lib/local-cache';
import type { Property } from '@/types/api';

/**
 * Dado de REFERÊNCIA (fazendas): a lista curta que os formulários precisam
 * para poder ser preenchidos, com ou sem sinal.
 *
 * Existe como módulo próprio para que quem AQUECE o cache e quem LÊ dele
 * concordem sobre a chave e o formato. Antes disso a busca vivia dentro do
 * formulário de máquina, e o cache só era preenchido se o usuário tivesse
 * aberto AQUELE formulário com internet: um gesto que ninguém faz de
 * propósito. Achado testando com modo avião num aparelho real (2026-08-04),
 * depois de a primeira correção ainda deixar o formulário vazio.
 *
 * Agora qualquer tela que liste com sucesso aquece o cache de passagem, e o
 * formulário só lê. O gesto natural (abrir a área com internet em algum
 * momento) passa a ser suficiente.
 */

const KEY = 'properties';

/**
 * Aquece o cache sem interromper quem chamou: falha de rede aqui é
 * irrelevante, porque a tela que chama já está tratando a própria falha, e
 * o cache antigo continua valendo.
 */
export async function warmProperties(
  fetcher: () => Promise<Property[]>,
): Promise<void> {
  try {
    await writeCache(KEY, await fetcher());
  } catch {
    // Sem rede: mantém o que já estava guardado.
  }
}

/** Lê a lista, preferindo a rede e caindo no cache. */
export async function loadProperties(
  fetcher: () => Promise<Property[]>,
): Promise<{ properties: Property[]; fromCache: boolean }> {
  const { data, fromCache } = await fetchWithCache<Property[]>(KEY, fetcher);
  return { properties: data ?? [], fromCache: fromCache && (data?.length ?? 0) > 0 };
}

/** Só o que está guardado, sem tocar a rede. */
export async function cachedProperties(): Promise<Property[]> {
  return (await readCache<Property[]>(KEY)) ?? [];
}
