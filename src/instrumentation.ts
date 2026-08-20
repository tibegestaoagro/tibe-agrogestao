import { log, resumirErro } from "@/lib/log";

/**
 * Rede de captura do framework, complementar ao `withApi`.
 *
 * `withApi` (`src/lib/route.ts`) garante o envelope de erro nas rotas de API,
 * mas ele não alcança PÁGINA: uma exceção num Server Component do painel cai
 * no error boundary do Next e, até aqui, não deixava rastro nenhum. Foi
 * exatamente assim que `/alertas?type=xyz` derrubou a página inteira sem que
 * ninguém soubesse, incidente registrado num comentário de
 * `src/app/(dashboard)/alertas/page.tsx`.
 *
 * `onRequestError` é chamado pelo Next para todo erro de servidor não tratado,
 * em qualquer runtime, incluindo os que o wrapper não vê. Aqui ele só
 * registra: não muda comportamento, não engole nada, não responde nada.
 *
 * Este é também o ponto de plugue para um coletor externo (Sentry ou
 * equivalente). Enquanto não houver um configurado, o destino é o log
 * estruturado, que a Vercel já indexa. Trocar isso é acrescentar a chamada
 * aqui, num lugar só.
 */

type ContextoDeRequisicao = {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ContextoDoNext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
};

export async function onRequestError(
  err: unknown,
  request: ContextoDeRequisicao,
  context: ContextoDoNext,
) {
  log.error("excecao nao tratada, capturada pelo framework", {
    route: context?.routePath ?? request?.path,
    method: request?.method,
    // `routeType` distingue página de rota de API, e é o que diz se o
    // `withApi` deveria ter pego antes. Se aparecer "route" aqui com
    // frequência, há caminho escapando do wrapper.
    code: context?.routeType,
  });

  // Segunda linha, com a pilha, pelo mesmo motivo do wrapper: é o campo mais
  // volumoso e não deve inflar o evento principal.
  console.error(
    JSON.stringify({
      level: "error",
      msg: "detalhe",
      route: context?.routePath ?? request?.path,
      err: resumirErro(err),
    }),
  );
}

/**
 * Chamado uma vez por processo, na subida. Fica vazio de propósito: é aqui que
 * a inicialização de um coletor externo entraria, e declarar o gancho agora
 * evita ter que criar o arquivo (e lembrar do `onRequestError`) depois.
 */
export async function register() {}
