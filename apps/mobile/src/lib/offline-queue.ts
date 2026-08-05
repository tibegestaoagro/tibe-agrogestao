import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Fila local de escrita (decisão D4 do roadmap).
 *
 * O caso real é anotar no curral ou no pasto, onde não há sinal: a escrita
 * entra numa fila em disco e sobe sozinha quando a conexão volta. A LEITURA
 * continua exigindo conexão, de propósito. Um banco local espelhado com
 * sincronização nos dois sentidos foi descartado por ser o item mais caro e
 * arriscado do roadmap: sincronização bidirecional num sistema multi-tenant
 * é onde nascem os piores bugs.
 *
 * ## O que esta fila NÃO faz, deliberadamente
 *
 * Não resolve conflito. Ela só guarda "o usuário pediu POST X com corpo Y" e
 * repete isso depois. Se o servidor recusar por regra de negócio (422, 409),
 * o item vira `failed` e espera decisão humana, em vez de sumir. Some só
 * quando o servidor confirma (2xx).
 *
 * ## Por que o corpo é guardado cru
 *
 * Guardamos o caminho e o JSON, não uma "ação" tipada. Assim uma área nova
 * entra na fila sem tocar neste arquivo, e a fila não precisa saber o que é
 * uma máquina ou um lançamento. O preço é não conseguir reescrever um item
 * quando o contrato da API mudar: aceitável, porque um item vive minutos ou
 * horas, não versões.
 *
 * ## tenant_id nunca entra aqui
 *
 * O corpo enfileirado é o mesmo que a tela enviaria, e nenhuma tela envia
 * `tenant_id`: ele é sempre resolvido no servidor a partir do token. Um item
 * antigo subindo depois de uma troca de conta é enviado com o token ATUAL,
 * então o servidor o atribui ao tenant certo, não ao antigo.
 */

const STORAGE_KEY = 'tibe.offline-queue.v1';

export type QueuedWrite = {
  id: string;
  /** Caminho relativo da API, ex: "/api/v1/machines". */
  path: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  /** Rótulo curto mostrado ao usuário: "Máquina Trator 4x4". */
  label: string;
  created_at: string;
  /** Preenchido quando o servidor recusou por regra de negócio. */
  failure?: { code: string; message: string } | null;
};

/**
 * Lê a fila inteira. Nunca lança: fila corrompida (JSON inválido, versão
 * antiga) devolve vazio em vez de quebrar o app na abertura. Perder uma fila
 * corrompida é ruim; não abrir o app é pior.
 */
export async function readQueue(): Promise<QueuedWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedWrite[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** Coloca uma escrita na fila e devolve a fila resultante. */
export async function enqueue(
  item: Omit<QueuedWrite, 'id' | 'created_at' | 'failure'>,
): Promise<QueuedWrite[]> {
  const queue = await readQueue();
  const next: QueuedWrite = {
    ...item,
    // `Date.now` sozinho colide quando dois itens entram no mesmo
    // milissegundo (salvar duas vezes seguidas sem sinal), e o id é o que
    // identifica o item na remoção.
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    failure: null,
  };
  const updated = [...queue, next];
  await writeQueue(updated);
  return updated;
}

export async function removeFromQueue(id: string): Promise<QueuedWrite[]> {
  const queue = await readQueue();
  const updated = queue.filter((i) => i.id !== id);
  await writeQueue(updated);
  return updated;
}

async function markFailed(
  id: string,
  failure: { code: string; message: string },
): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.map((i) => (i.id === id ? { ...i, failure } : i)));
}

export type FlushResult = { sent: number; failed: number; remaining: QueuedWrite[] };

/**
 * Tenta subir a fila inteira, na ordem em que foi criada.
 *
 * `send` é injetado (não importado) para esta função não depender do
 * contexto de autenticação: quem chama passa o `authorizedFetch` que já sabe
 * anexar e renovar o token. Isso mantém a fila testável sem sessão e sem
 * servidor.
 *
 * **Para na primeira falha de REDE**, em vez de percorrer o resto: sem
 * conexão, insistir nos outros só gastaria bateria e produziria a mesma
 * falha. Já a recusa por REGRA DE NEGÓCIO não interrompe: aquele item fica
 * marcado e a fila continua, senão um cadastro inválido travaria para sempre
 * todos os que vieram depois dele.
 */
export async function flushQueue(
  send: (item: QueuedWrite) => Promise<{ ok: boolean; code?: string; message?: string }>,
): Promise<FlushResult> {
  const queue = await readQueue();
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    if (item.failure) {
      failed += 1;
      continue; // já recusado antes: espera decisão do usuário
    }
    try {
      const res = await send(item);
      if (res.ok) {
        await removeFromQueue(item.id);
        sent += 1;
      } else {
        await markFailed(item.id, {
          code: res.code ?? 'UNKNOWN_ERROR',
          message: res.message ?? 'O servidor recusou este registro.',
        });
        failed += 1;
      }
    } catch {
      break; // falha de rede: para e tenta tudo de novo depois
    }
  }

  return { sent, failed, remaining: await readQueue() };
}
