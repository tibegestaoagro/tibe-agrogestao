import { reaisBr } from "@/lib/numero-br";
import { plural, type NumerosDoDia } from "@/lib/emporio/inicio";

/** "5% acima de outubro", "igual a outubro"; sem comparação possível (mês anterior zerado), nada. */
function fraseDaVariacao(pct: number | null, mesAnterior: string): string | null {
  if (pct === null) return null;
  if (pct === 0) return `igual a ${mesAnterior}`;
  return `${Math.abs(pct)}% ${pct > 0 ? "acima" : "abaixo"} de ${mesAnterior}`;
}

function Numero({ titulo, valor, apoio }: { titulo: string; valor: string; apoio: (string | null)[] }) {
  const linhas = apoio.filter((l): l is string => !!l);
  return (
    <div className="min-w-0 rounded-lg border border-borda bg-superficie p-4 shadow-sm">
      <p className="text-sm text-texto-secundario">{titulo}</p>
      <p className="mt-1 break-words text-xl font-semibold text-texto">{valor}</p>
      {linhas.map((l) => (
        <p key={l} className="mt-0.5 break-words text-xs text-texto-secundario">
          {l}
        </p>
      ))}
    </div>
  );
}

/** Os números do dia: quatro cartões, ou dois quando a pessoa não vê o dinheiro (entra e sai vêm nulos). */
export function InicioNumeros({ numeros, mesAnterior }: { numeros: NumerosDoDia; mesAnterior: string }) {
  const { vendas_hoje, vendas_mes, entra_hoje, sai_hoje } = numeros;
  return (
    <section aria-label="Números do dia" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Numero
        titulo="Vendas hoje"
        valor={reaisBr(vendas_hoje.total)}
        apoio={[plural(vendas_hoje.quantidade, "venda", "vendas")]}
      />
      <Numero
        titulo="Vendas no mês"
        valor={reaisBr(vendas_mes.total)}
        apoio={[fraseDaVariacao(vendas_mes.variacao_pct, mesAnterior)]}
      />
      {entra_hoje && <Numero titulo="Entra hoje" valor={reaisBr(entra_hoje.total)} apoio={[entra_hoje.detalhe || null]} />}
      {sai_hoje && (
        <Numero
          titulo="Sai hoje"
          valor={reaisBr(sai_hoje.total)}
          apoio={[plural(sai_hoje.quantidade, "conta", "contas")]}
        />
      )}
    </section>
  );
}
