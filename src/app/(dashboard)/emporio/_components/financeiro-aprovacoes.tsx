"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PedidoDePagamentoView } from "@/lib/actions/emporio-aprovacoes";
import { apiPost } from "@/lib/client-api";
import { dataBr } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS: Record<PedidoDePagamentoView["status"], { rotulo: string; variante: "amber" | "green" | "red" }> = {
  pendente: { rotulo: "Esperando", variante: "amber" },
  aprovado: { rotulo: "Aprovado", variante: "green" },
  recusado: { rotulo: "Recusado", variante: "red" },
};

const ORDEM_RECUSA = ["reason"] as const;

const CLASSE_TEXTAREA =
  "flex min-h-24 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

function RecusarPainel({ pedido }: { pedido: PedidoDePagamentoView }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_RECUSA, `recusar-${pedido.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    const texto = motivo.trim();
    if (texto.length < 3 || texto.length > 300) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga o motivo da recusa, de 3 a 300 caracteres." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/finance/payment-requests/${pedido.id}/reject`, { reason: texto });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Pagamento recusado.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Recusar
        </Button>
      }
      title="Recusar pagamento"
      description={`${reaisBr(pedido.total)}, pedido de ${pedido.requested_by.name}. Quem pediu vê o motivo.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setMotivo("");
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Recusar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Motivo" required hint="De 3 a 300 caracteres. Fica no Histórico." id={err.idDe("reason")} error={err.erros.reason}>
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            className={CLASSE_TEXTAREA}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

function AprovarBotao({ pedido }: { pedido: PedidoDePagamentoView }) {
  const router = useRouter();
  const aviso = useAviso();

  async function aprovar() {
    const res = await apiPost(`/api/v1/emporio/finance/payment-requests/${pedido.id}/approve`);
    if (!res.ok) {
      aviso.erro(res.message);
      // A falha fica gravada no pedido: recarregar a lista a mostra.
      router.refresh();
      return;
    }
    aviso.sucesso("Pagamento aprovado e feito.");
    router.refresh();
  }

  return (
    <ConfirmDialog
      gatilho={<Button size="sm">Aprovar</Button>}
      titulo="Aprovar e pagar?"
      descricao={`O pagamento de ${reaisBr(pedido.total)} sai de ${pedido.from.name} agora, com o saldo conferido na hora.`}
      rotuloConfirmar="Aprovar e pagar"
      destrutivo={false}
      aoConfirmar={aprovar}
    />
  );
}

/** Os pedidos de pagamento acima do teto. Só quem é da conta (`podeDecidir`) vê Aprovar e Recusar. */
export function FinanceiroAprovacoes({
  pedidos,
  podeDecidir,
  decididos,
}: {
  pedidos: PedidoDePagamentoView[];
  podeDecidir: boolean;
  decididos: boolean;
}) {
  if (pedidos.length === 0) {
    return decididos ? (
      <EmptyState titulo="Nenhum pedido decidido">Os pedidos aprovados e recusados aparecem aqui.</EmptyState>
    ) : (
      <EmptyState titulo="Nada esperando aprovação">
        Quando alguém pagar acima do teto da conta, o pedido aparece aqui.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {pedidos.map((p) => {
        const s = STATUS[p.status];
        return (
          <li key={p.id} className="rounded-lg border border-borda bg-superficie p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-texto">{reaisBr(p.total)}</p>
                <p className="text-sm text-texto-secundario">
                  {p.requested_by.name} pediu em {DATA_HORA.format(new Date(p.created_at))}
                </p>
                <p className="text-sm text-texto-secundario">
                  Sai de {p.from.kind === "gaveta" ? "gaveta" : "conta"}: {p.from.name}
                </p>
              </div>
              <Badge variant={s.variante}>{s.rotulo}</Badge>
            </div>

            <ul className="mt-3 divide-y divide-borda text-sm">
              {p.entries.map((e) => (
                <li key={e.entry_id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span className="min-w-0 break-words text-texto">
                    {e.supplier_or_category ?? e.description}
                    {e.due_date ? `, vence ${dataBr(e.due_date)}` : ""}
                  </span>
                  <span className="shrink-0 text-texto">{reaisBr(e.amount)}</span>
                </li>
              ))}
            </ul>

            {p.last_failure && (
              <p role="alert" className="mt-3 rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
                A última tentativa de pagar falhou: {p.last_failure}
              </p>
            )}

            {p.status !== "pendente" && (
              <p className="mt-3 text-sm text-texto-secundario">
                {p.status === "aprovado" ? "Aprovado" : "Recusado"} por {p.decided_by?.name ?? "alguém"}
                {p.decided_at ? ` em ${DATA_HORA.format(new Date(p.decided_at))}` : ""}
                {p.status === "recusado" && p.reason ? `. Motivo: ${p.reason}` : ""}
              </p>
            )}

            {podeDecidir && p.status === "pendente" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <AprovarBotao pedido={p} />
                <RecusarPainel pedido={p} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
