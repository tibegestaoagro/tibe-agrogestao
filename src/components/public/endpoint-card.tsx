const METHOD_COLOR: Record<string, string> = {
  GET: "bg-info-suave text-info-tinta",
  POST: "bg-superficie-afundada text-tibe-dark",
  PUT: "bg-primaria-suave text-primaria-tinta",
  PATCH: "bg-atencao-suave text-atencao-tinta",
  DELETE: "bg-perigo-suave text-perigo-tinta",
};

export type Endpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  auth: string;
  description: string;
  request?: string;
  response: string;
};

export function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div id={endpoint.method + endpoint.path} className="scroll-mt-24 rounded-lg border border-borda p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${METHOD_COLOR[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-medium text-texto">{endpoint.path}</code>
        <span className="ml-auto text-xs text-texto-discreto">{endpoint.auth}</span>
      </div>
      <p className="mt-2 text-sm text-texto-secundario">{endpoint.description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {endpoint.request && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-discreto">Request</p>
            <pre className="overflow-x-auto rounded-md bg-codigo-fundo p-3 text-xs text-codigo-texto">
              <code>{endpoint.request}</code>
            </pre>
          </div>
        )}
        <div className={endpoint.request ? "" : "sm:col-span-2"}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-discreto">Response</p>
          <pre className="overflow-x-auto rounded-md bg-codigo-fundo p-3 text-xs text-codigo-texto">
            <code>{endpoint.response}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
