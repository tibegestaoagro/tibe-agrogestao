import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache local de dado de REFERÊNCIA (fazendas, categorias): as listas curtas
 * e quase imutáveis que um formulário precisa para poder ser preenchido.
 *
 * Existe por causa de um defeito encontrado testando com o modo avião ligado
 * (2026-08-04): a fila de escrita offline funcionava, mas o formulário de
 * máquina se RECUSAVA a abrir sem sinal, porque carregava a lista de
 * fazendas antes de renderizar. Ou seja, a fila era inútil exatamente no
 * caso que ela existe para resolver: cadastrar no curral, sem sinal.
 *
 * Só serve para dado de referência, nunca para dado de movimento (lotes,
 * lançamentos, manutenções). A diferença é o custo de estar desatualizado:
 * uma fazenda a menos na lista atrapalha o cadastro; um saldo financeiro
 * velho leva a uma decisão errada. Leitura de movimento continua exigindo
 * conexão e marcada como desatualizada (decisão D4).
 */

const PREFIX = 'tibe.cache.';

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Cache é conveniência: falhar em gravar não pode derrubar a tela.
  }
}

/**
 * Busca na rede e guarda; sem rede, devolve o que estava guardado.
 *
 * Devolve também `fromCache` para a tela poder avisar que a lista pode estar
 * incompleta, em vez de apresentar dado velho como se fosse fresco.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T | null; fromCache: boolean }> {
  try {
    const data = await fetcher();
    await writeCache(key, data);
    return { data, fromCache: false };
  } catch {
    return { data: await readCache<T>(key), fromCache: true };
  }
}
