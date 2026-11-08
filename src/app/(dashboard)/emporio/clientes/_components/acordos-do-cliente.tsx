import type { AcordoView } from "@/lib/actions/emporio-acordos";
import { reaisBr } from "@/lib/numero-br";
import { dataBr } from "@/lib/emporio/datas";
import { Badge } from "@/components/ui/badge";
import { AcordoForm, type OrigemDoAcordo } from "./acordo-form";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * A seção "Acordos" da ficha do cliente: os acordos de fiado em parcelas e, para quem pode (`podeFazer`, resolvido no
 * servidor) e se há fiado em aberto, o botão de fazer um novo.
 */
export function AcordosDoCliente({
  customerId,
  acordos,
  origens,
  podeFazer,
  hoje,
}: {
  customerId: string;
  acordos: AcordoView[];
  /** Os fiados de VENDA em aberto do cliente (parcela de acordo não entra em outro acordo). */
  origens: OrigemDoAcordo[];
  podeFazer: boolean;
  hoje: string;
}) {
  if (acordos.length === 0 && !(podeFazer && origens.length > 0)) return null;

  return (
    <section className="space-y-4" aria-label="Acordos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-texto">Acordos</h2>
        {podeFazer && origens.length > 0 && <AcordoForm customerId={customerId} origens={origens} hoje={hoje} />}
      </div>

      {acordos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Nenhum acordo ainda.</p>
      ) : (
        <ul className="space-y-3">
          {acordos.map((a) => {
            const pagas = a.installments.filter((p) => p.status === "paga").length;
            const abertas = a.installments.length - pagas;
            const proxima = a.installments.find((p) => p.status !== "paga");
            return (
              <li key={a.id} className="rounded-lg border border-borda bg-superficie p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-texto">
                    Acordo de {DATA.format(new Date(a.created_at))}, {reaisBr(a.total)}
                  </p>
                  <Badge variant={a.status === "quitado" ? "green" : "amber"}>
                    {a.status === "quitado" ? "Quitado" : "Ativo"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-texto-secundario">
                  {plural(pagas, "parcela paga", "parcelas pagas")}, {plural(abertas, "aberta", "abertas")}
                  {a.status === "ativo" && `. Falta ${reaisBr(a.open_total)}`}
                </p>
                {proxima && (
                  <p className={proxima.status === "vencida" ? "mt-1 text-sm text-perigo-tinta" : "mt-1 text-sm text-texto"}>
                    Próxima: parcela {proxima.number}, {dataBr(proxima.due_date)}, {reaisBr(proxima.open)}
                    {proxima.status === "vencida" && " (vencida)"}
                  </p>
                )}
                {a.notes && <p className="mt-1 break-words text-sm text-texto-secundario">{a.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
