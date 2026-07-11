const METHOD_COLOR: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-tibe-light text-tibe-dark",
  PUT: "bg-purple-100 text-purple-700",
  PATCH: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
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
    <div id={endpoint.method + endpoint.path} className="scroll-mt-24 rounded-lg border border-gray-200 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${METHOD_COLOR[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-medium text-gray-900">{endpoint.path}</code>
        <span className="ml-auto text-xs text-gray-400">{endpoint.auth}</span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{endpoint.description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {endpoint.request && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Request</p>
            <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
              <code>{endpoint.request}</code>
            </pre>
          </div>
        )}
        <div className={endpoint.request ? "" : "sm:col-span-2"}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Response</p>
          <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
            <code>{endpoint.response}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
