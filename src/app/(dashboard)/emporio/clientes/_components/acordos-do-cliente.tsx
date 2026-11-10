import type { AcordoView } from "@/lib/actions/emporio-acordos";
import { reaisBr } from "@/lib/numero-br";
import { dataBr } from "@/lib/emporio/datas";
import { Badge } from "@/components/ui/badge";
import { AcordoForm, type OrigemDoAcordo } from "./acordo-form";
import { DesfazerAcordo } from "./desfazer-acordo";

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
            if (a.status === "desfeito" && a.undone_at) {
              return (
                <li key={a.id} className="rounded-lg border border-borda bg-superficie p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-texto">
                      Acordo de {DATA.format(new Date(a.created_at))}, {reaisBr(a.total)}
                    </p>
                    <Badge variant="gray">Desfeito</Badge>
                  </div>
                  <p className="mt-1 break-words text-sm text-texto-secundario">
                    Desfeito em {DATA.format(new Date(a.undone_at)).slice(0, 5)}
                    {a.undone_reason ? `: ${a.undone_reason}` : ""}
                  </p>
                </li>
              );
            }
            const pagas = a.installments.filter((p) => p.status === "paga").length;
            const abatidas = a.installments.filter((p) => p.status === "abatida").length;
            // A parcela abatida (zerada por devolução abatida no fiado) não é paga nem aberta.
            const abertas = a.installments.length - pagas - abatidas;
            const proxima = a.installments.find((p) => p.status !== "paga" && p.status !== "abatida");
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
                {abatidas > 0 && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-texto-secundario">
                    <Badge variant="gray">Abatida</Badge>
                    {plural(abatidas, "parcela abatida por devolução", "parcelas abatidas por devolução")}
                  </p>
                )}
                {proxima && (
                  <p className={proxima.status === "vencida" ? "mt-1 text-sm text-perigo-tinta" : "mt-1 text-sm text-texto"}>
                    Próxima: parcela {proxima.number}, {dataBr(proxima.due_date)}, {reaisBr(proxima.open)}
                    {proxima.status === "vencida" && " (vencida)"}
                  </p>
                )}
                {a.notes && <p className="mt-1 break-words text-sm text-texto-secundario">{a.notes}</p>}
                {podeFazer && a.can_undo && (
                  <div className="mt-3">
                    <DesfazerAcordo customerId={customerId} agreementId={a.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
