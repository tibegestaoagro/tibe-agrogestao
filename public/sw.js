/* eslint-disable */
/**
 * Service worker do Tibé (Onda 1, agente A3).
 *
 * Faz duas coisas e mais nada:
 *   1. guarda recursos estaticos em cache, para o aplicativo abrir rapido;
 *   2. mostra a tela de offline quando a navegacao falha por falta de rede.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE NAO PODE SER QUEBRADA: nenhuma resposta de /api/ entra no cache.
 * ---------------------------------------------------------------------------
 * O cache do navegador e por ORIGEM, nao por usuario. Guardar ali a resposta de
 * uma rota autenticada faria o proximo usuario do mesmo aparelho ler o dado do
 * anterior, e o publico deste produto compartilha aparelho no campo. Por isso a
 * decisao aqui e por LISTA DE PERMISSAO (`isCacheableAsset`): so entra em cache
 * o que esta explicitamente autorizado. Uma lista de proibicao seria frageil,
 * porque bastaria alguem criar uma rota nova para o vazamento aparecer sozinho.
 * O bloqueio explicito de /api/ logo no inicio do `fetch` e defesa em segunda
 * camada, nao a defesa principal.
 *
 * Documento HTML tambem nao entra em cache: /dashboard e as demais paginas do
 * painel sao renderizadas no servidor com dado do tenant.
 *
 * ---------------------------------------------------------------------------
 * Push (notificacao) NAO faz parte desta onda.
 * ---------------------------------------------------------------------------
 * Fica para a Onda 2, junto com o seam de notificacao. Quando chegar, os
 * ouvintes `push` e `notificationclick` entram no fim deste arquivo e a
 * inscricao (`registration.pushManager.subscribe`) fica no componente de UI, ja
 * que exige gesto do usuario. Nada disso esta implementado aqui de proposito:
 * registrar um ouvinte vazio agora so criaria a impressao de que existe.
 */

// Trocar a versao invalida os caches antigos no `activate`. E o unico botao de
// "limpar tudo" que temos: use quando mudar o conteudo pre-carregado.
const VERSION = "v1";
const STATIC_CACHE = `tibe-static-${VERSION}`;

const OFFLINE_URL = "/offline.html";

/**
 * Teto de entradas no cache. Os bundles do Next têm hash no nome, então cada
 * publicação cria URLs novas e as antigas nunca mais são pedidas: sem teto, o
 * cache cresceria a cada deploy para sempre. `cache.keys()` devolve na ordem de
 * inserção, então cortar do início descarta o mais velho.
 */
const MAX_ENTRIES = 80;

// Pre-carregados na instalacao: o minimo para a tela de offline se desenhar
// sozinha, sem rede.
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png"];

/**
 * Ultimo recurso, embutido aqui: se o pre-carregamento falhar (por exemplo,
 * porque a resposta de /offline.html veio como redirecionamento), ainda assim
 * o usuario ve uma tela em vez do erro cru do navegador.
 */
const FALLBACK_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem conexão | Tibé</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
background:#E8F5E9;color:#1B5E20;font-family:system-ui,sans-serif;text-align:center;padding:24px}</style>
</head><body><div><h1>Sem conexão</h1><p>O Tibé não conseguiu falar com a internet agora.</p></div></body></html>`;

/**
 * Lista de permissao do cache. Tudo que nao estiver aqui vai para a rede e nao
 * e guardado, ponto.
 *
 * - `/_next/static/`: bundles com hash no nome, imutaveis por construcao;
 * - `/icons/`: os icones do proprio aplicativo;
 * - a tela de offline e o favicon.
 *
 * Nenhum desses caminhos depende de sessao: sao os mesmos bytes para qualquer
 * usuario, logado ou nao.
 */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === OFFLINE_URL ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Um a um, tolerando falha: `addAll` aborta tudo se um unico recurso
      // falhar, e perder a instalacao inteira por causa de um icone seria pior
      // do que ficar sem ele.
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("tibe-") && name !== STATIC_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Só GET: POST/PATCH/DELETE nunca passam por cache.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Terceiros ficam com o navegador: nao interceptamos o que nao e nosso.
  if (url.origin !== self.location.origin) return;

  // Segunda camada da regra principal: /api/ nem chega perto do cache.
  if (url.pathname.startsWith("/api/")) return;

  // Navegacao (abrir uma pagina): rede primeiro, SEM guardar a resposta, e a
  // tela de offline quando a rede falha.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(serveAsset(request));
  }

  // Qualquer outra coisa cai no comportamento padrao do navegador (rede),
  // porque nao chamamos respondWith.
});

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) return cached;
    return new Response(FALLBACK_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/**
 * Serve do cache e atualiza em segundo plano (stale-while-revalidate).
 * So guarda respostas 200 de mesma origem: resposta opaca ou de erro nao entra,
 * senao o cache passaria a servir falha.
 */
async function serveAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const fromNetwork = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone()).catch(() => undefined);
        await trim(cache);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;

  const response = await fromNetwork;
  return response ?? Response.error();
}

/** Mantém o cache dentro de MAX_ENTRIES, descartando os mais antigos. */
async function trim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const excedente = keys.slice(0, keys.length - MAX_ENTRIES);
    await Promise.all(
      excedente
        // A tela de offline nunca é descartada: sem ela o service worker perde
        // a única coisa que ele consegue mostrar sem rede.
        .filter((request) => new URL(request.url).pathname !== OFFLINE_URL)
        .map((request) => cache.delete(request)),
    );
  } catch {
    // Cache cheio ou indisponível: seguir sem podar é melhor do que falhar.
  }
}
