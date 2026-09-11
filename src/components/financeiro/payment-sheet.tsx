"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost, apiGet, apiDelete } from "@/lib/client-api";

/**
 * Pagamento e recebimento, inteiro ou PARCIAL (§13 e §14 do documento do
 * cliente).
 *
 * Substituiu o botão "Marcar como pago", que só quitava a conta inteira e não
 * dizia quanto faltava. O valor nasce preenchido com o saldo, então quitar de
 * uma vez continua sendo dois cliques; quem paga menos, digita menos.
 *
 * O valor pago é a SOMA dos pagamentos, e é ela que este painel lista: o
 * produtor precisa ver de onde vieram os 4.000 antes de registrar mais 6.000.
 */

const ORDEM = ["amount", "paid_at", "method", "notes"] as const;
type Campo = (typeof ORDEM)[number];

const FORMAS: { valor: string; rotulo: string }[] = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "cheque", rotulo: "Cheque" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "outro", rotulo: "Outro" },
];

const ROTULO_DA_FORMA: Record<string, string> = Object.fromEntries(
  FORMAS.map((f) => [f.valor, f.rotulo]),
);

type Pagamento = {
  id: string;
  amount: number | null;
  paid_at: string;
  method: string | null;
  notes: string | null;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O dinheiro é `Decimal(14,2)`: a comparação é em centavos, nunca em float. */
const centavos = (n: number) => Math.round(n * 100);

function hojeNoCampo(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export default function PaymentSheet({
  entryId,
  entryType,
  valor,
}: {
  entryId: string;
  entryType: string;
  valor: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `pg-${entryId}`);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);

  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(hojeNoCampo());
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");

  const recebimento = entryType === "income";
  const pago = (pagamentos ?? []).reduce((soma, p) => soma + (p.amount ?? 0), 0);
  const saldo = Math.max(0, (centavos(valor) - centavos(pago)) / 100);

  async function carregar(preencherValor: boolean) {
    const res = await apiGet<Pagamento[]>(`/api/v1/financial-entries/${entryId}/payments`);
    if (!res.ok) {
      err.setGlobal(res.message);
      return;
    }
    setPagamentos(res.data);
    if (preencherValor) {
      const jaPago = res.data.reduce((soma, p) => soma + (p.amount ?? 0), 0);
      const falta = Math.max(0, (centavos(valor) - centavos(jaPago)) / 100);
      setAmount(falta > 0 ? falta.toFixed(2).replace(".", ",") : "");
    }
  }

  function limpar() {
    setAmount("");
    setPaidAt(hojeNoCampo());
    setMethod("");
    setNotes("");
    setPagamentos(null);
    err.limparTudo();
  }

  async function submit() {
    const valorPago = lerValorDoCampo(amount);
    const novos: Partial<Record<Campo, string>> = {};
    if (valorPago === null) novos.amount = "Informe o valor.";
    else if (valorPago <= 0) novos.amount = "O valor precisa ser maior que zero.";
    else if (centavos(valorPago) > centavos(saldo)) {
      novos.amount =
        saldo > 0
          ? `Falta ${recebimento ? "receber" : "pagar"} apenas ${brl(saldo)} desta conta.`
          : "Esta conta já está quitada.";
    }
    if (!paidAt) novos.paid_at = "Informe a data.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    setLoading(true);
    const res = await apiPost(`/api/v1/financial-entries/${entryId}/payments`, {
      amount: valorPago,
      paid_at: new Date(`${paidAt}T12:00:00`).toISOString(),
      method: method || null,
      notes: notes || null,
    });
    setLoading(false);
    if (!res.ok) return err.doServidor(res);

    const fechou = centavos((valorPago ?? 0) + pago) >= centavos(valor);
    aviso.sucesso(
      fechou
        ? recebimento
          ? "Conta recebida por inteiro."
          : "Conta paga por inteiro."
        : `${recebimento ? "Recebimento" : "Pagamento"} de ${brl(valorPago ?? 0)} registrado.`,
    );
    if (fechou) {
      setOpen(false);
      limpar();
    } else {
      await carregar(true);
      setNotes("");
    }
    router.refresh();
  }

  async function desfazer(paymentId: string) {
    const res = await apiDelete(`/api/v1/financial-entries/${entryId}/payments/${paymentId}`);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso("Pagamento desfeito.");
    await carregar(true);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          {recebimento ? "Receber" : "Pagar"}
        </Button>
      }
      title={recebimento ? "Registrar recebimento" : "Registrar pagamento"}
      description="Pode ser o valor inteiro ou uma parte. O que faltar continua em aberto."
      open={open}
      onOpenChange={(aberto) => {
        setOpen(aberto);
        if (aberto) {
          limpar();
          void carregar(true);
        } else {
          limpar();
        }
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-borda bg-superficie-afundada p-3 text-center">
        <div>
          <p className="text-xs text-texto-discreto">Valor da conta</p>
          <p className="text-sm font-semibold text-texto">{brl(valor)}</p>
        </div>
        <div>
          <p className="text-xs text-texto-discreto">{recebimento ? "Recebido" : "Pago"}</p>
          <p className="text-sm font-semibold text-texto">
            {pagamentos === null ? "..." : brl(pago)}
          </p>
        </div>
        <div>
          <p className="text-xs text-texto-discreto">{recebimento ? "A receber" : "A pagar"}</p>
          <p className="text-sm font-semibold text-texto">
            {pagamentos === null ? "..." : brl(saldo)}
          </p>
        </div>
      </div>

      <Field label="Valor" required id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={amount}
            onValueChange={(v) => {
              setAmount(v);
              err.limparCampo("amount");
            }}
            placeholder="0,00"
          />
        )}
      </Field>

      <Field label="Data" required id={err.idDe("paid_at")} error={err.erros.paid_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={paidAt}
            onChange={(e) => {
              setPaidAt(e.target.value);
              err.limparCampo("paid_at");
            }}
          />
        )}
      </Field>

      <Field label="Forma" id={err.idDe("method")} error={err.erros.method}>
        {({ id, ...aria }) => (
          <Select
            value={method}
            onValueChange={(v) => {
              setMethod(v);
              err.limparCampo("method");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Não informar" />
            </SelectTrigger>
            <SelectContent>
              {FORMAS.map((f) => (
                <SelectItem key={f.valor} value={f.valor}>
                  {f.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
            placeholder="Ex: primeira parcela"
          />
        )}
      </Field>

      {pagamentos !== null && pagamentos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-texto-secundario">
            {recebimento ? "Recebimentos já registrados" : "Pagamentos já registrados"}
          </p>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-texto">{brl(p.amount ?? 0)}</p>
                  <p className="truncate text-xs text-texto-discreto">
                    {new Date(p.paid_at).toLocaleDateString("pt-BR")}
                    {p.method ? ` · ${ROTULO_DA_FORMA[p.method] ?? p.method}` : ""}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void desfazer(p.id)}
                >
                  Desfazer
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormSheet>
  );
}
