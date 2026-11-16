/**
 * Q336: o orçamento salva só com nome e telefone, e o que falta para virar venda
 * (as frases de `pendencias_para_venda`) aparece aqui. Sem estado e sem permissão:
 * serve à página do orçamento (server) e ao resumo do balcão (client).
 */
export function pendenciasDeEntrega(pendencias: string[]): boolean {
  return pendencias.some((p) => p.toLowerCase().includes("endereço de entrega"));
}

export function PendenciasParaVenda({ pendencias }: { pendencias: string[] }) {
  if (pendencias.length === 0) return null;
  const titulo = pendenciasDeEntrega(pendencias)
    ? "Finalize os dados de entrega antes de fechar a venda"
    : "Antes de fechar a venda, complete o cadastro";
  return (
    <div role="status" className="space-y-1 rounded-lg bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
      <p className="font-semibold">{titulo}</p>
      <p>Falta no cadastro do cliente ou no pedido:</p>
      <ul className="list-disc pl-5">
        {pendencias.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
