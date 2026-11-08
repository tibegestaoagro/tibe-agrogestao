"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CobrancaView } from "@/lib/actions/emporio-credito";
import { formatarTelefone } from "@/lib/emporio/telefone";
import { reaisBr } from "@/lib/numero-br";
import { apiPost } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

type Cliente = CobrancaView["customers"][number];

const ORDEM = ["message"] as const;

// O instante da cobrança vira o dia de Brasília (a data UTC erraria depois das 21h).
const DIA_BR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

const CLASSE_TEXTAREA =
  "flex min-h-40 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

/** O painel de cobrar um cliente: a mensagem pronta, editável, e o WhatsApp só abre depois de gravar a cobrança. */
function CobrarPainel({
  cliente,
  loja,
  aoCobrar,
}: {
  cliente: Cliente;
  /** A loja filtrada na tela, ou "" para todas. */
  loja: string;
  aoCobrar: (customerId: string) => void;
}) {
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `cobrar-${cliente.customer_id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(cliente.message);

  async function submit() {
    if (!message.trim()) {
      err.setGlobal(null);
      err.reprovar({ message: "Escreva a mensagem que vai para o cliente." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/customers/${cliente.customer_id}/collections`, {
      establishment_id: loja || null,
      message,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    window.open(`https://wa.me/${cliente.phone_whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    aviso.sucesso(`Cobrança de ${cliente.customer_name} registrada.`);
    setOpen(false);
    aoCobrar(cliente.customer_id);
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Cobrar no WhatsApp</Button>}
      title={`Cobrar ${cliente.customer_name}`}
      description="Confira a mensagem. Ao confirmar, a cobrança fica registrada e o WhatsApp abre com o texto."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setMessage(cliente.message);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Abrir o WhatsApp"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Mensagem" required id={err.idDe("message")} error={err.erros.message}>
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={8}
            className={CLASSE_TEXTAREA}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              err.limparCampo("message");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const TODAS = "__todas__";
const FAIXAS = [
  { valor: "1-15", rotulo: "1 a 15 dias" },
  { valor: "16-30", rotulo: "16 a 30 dias" },
  { valor: "31-60", rotulo: "31 a 60 dias" },
  { valor: "60+", rotulo: "Mais de 60 dias" },
];

/** O filtro de faixa de atraso (`?faixa=`), que preserva `?loja=`. */
export function FaixaFiltro({ faixa, loja }: { faixa: string; loja: string }) {
  const router = useRouter();

  function ir(nova: string) {
    const q = new URLSearchParams();
    if (loja) q.set("loja", loja);
    if (nova) q.set("faixa", nova);
    const s = q.toString();
    router.push(s ? `/emporio/financeiro/cobranca?${s}` : "/emporio/financeiro/cobranca");
  }

  return (
    <div className="sm:max-w-xs">
      <Select value={faixa || TODAS} onValueChange={(v) => ir(v === TODAS ? "" : v)}>
        <SelectTrigger aria-label="Filtrar por tempo de atraso">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todos os atrasos</SelectItem>
          {FAIXAS.map((f) => (
            <SelectItem key={f.valor} value={f.valor}>
              {f.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A lista de cobrança: quem tem fiado vencido, do mais atrasado ao menos, com o botão do WhatsApp. */
export function FinanceiroCobranca({ dados, loja }: { dados: CobrancaView; loja: string }) {
  const router = useRouter();
  const [cobrados, setCobrados] = useState<Set<string>>(new Set());

  function aoCobrar(id: string) {
    setCobrados((s) => new Set(s).add(id));
    router.refresh();
  }

  if (dados.customers.length === 0) {
    return (
      <EmptyState titulo="Ninguém com fiado vencido">
        Quando uma venda no fiado passar do vencimento, o cliente aparece aqui para ser cobrado.
      </EmptyState>
    );
  }

  const total = dados.customers.reduce((s, c) => s + Math.round(c.overdue_total * 100), 0) / 100;

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto">
        Vencido: <strong>{reaisBr(total)}</strong> em {dados.customers.length}{" "}
        {dados.customers.length === 1 ? "cliente" : "clientes"}.
      </p>
      <ul className="space-y-3">
        {dados.customers.map((c) => {
          const cobradoHoje = cobrados.has(c.customer_id);
          return (
            <li key={c.customer_id} className="rounded-lg border border-borda bg-superficie p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/emporio/clientes/${c.customer_id}`}
                    className="break-words font-medium text-texto hover:underline"
                  >
                    {c.customer_name}
                  </Link>
                  <p className="text-sm text-texto-secundario">{formatarTelefone(c.phone)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-texto">{reaisBr(c.overdue_total)}</p>
                  <p className="text-sm text-texto-secundario">
                    há {c.oldest_days} {c.oldest_days === 1 ? "dia" : "dias"}
                  </p>
                </div>
              </div>
              {c.stores.length > 0 && (
                <p className="mt-2 text-sm text-texto-secundario">
                  {c.stores.map((l) => `${l.establishment_name} (${reaisBr(l.overdue)})`).join(", ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {c.phone_whatsapp ? (
                  <CobrarPainel cliente={c} loja={loja} aoCobrar={aoCobrar} />
                ) : (
                  <p className="text-sm text-texto-secundario">
                    Sem telefone no cadastro.{" "}
                    <Link href={`/emporio/clientes/${c.customer_id}`} className="font-medium text-texto-marca hover:underline">
                      Completar em Clientes
                    </Link>
                  </p>
                )}
                {cobradoHoje ? (
                  <Badge variant="green">Cobrado hoje</Badge>
                ) : (
                  c.last_charged_at && <Badge variant="blue">Cobrado em {DIA_BR.format(new Date(c.last_charged_at))}</Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
