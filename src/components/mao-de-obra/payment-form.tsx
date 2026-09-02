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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { moeda } from "@/components/mao-de-obra/labels";

/**
 * Registra dinheiro pago a um trabalhador (§8, §9, §10, §11).
 *
 * ⚠️ CONFIRMAR O PAGAMENTO NÃO É A MESMA COISA QUE OS OUTROS TRÊS, e a tela
 * precisa dizer isso: `pagamento` QUITA a previsão pendente e faz a próxima
 * nascer; os outros criam um lançamento à parte e não encostam nela. É por isso
 * que o valor vem preenchido com o previsto no primeiro caso, e vazio nos
 * outros.
 *
 * O §40.3 é a razão de este painel existir em vez de um botão direto: o sistema
 * prevê, o produtor confirma.
 */

const ORDEM = ["kind", "amount", "occurred_at", "category", "notes"] as const;
type Campo = (typeof ORDEM)[number];

const TIPOS = [
  { valor: "pagamento", rotulo: "Pagamento do período" },
  { valor: "adiantamento", rotulo: "Adiantamento" },
  { valor: "gratificacao", rotulo: "Gratificação ou hora extra" },
  { valor: "beneficio", rotulo: "Benefício (alimentação, moradia, transporte)" },
  { valor: "outro", rotulo: "Outro" },
];

export default function PaymentForm({
  workerId,
  workerName,
  previsao,
}: {
  workerId: string;
  workerName: string;
  previsao: { amount: number; due_date: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `pgto-${workerId}`);

  const [kind, setKind] = useState(previsao ? "pagamento" : "adiantamento");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  const confirmando = kind === "pagamento";

  function limpar() {
    setKind(previsao ? "pagamento" : "adiantamento");
    setAmount("");
    setOccurredAt("");
    setCategory("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const valor = lerValorDoCampo(amount);

    // No pagamento, valor em branco significa "o previsto", que a action já
    // sabe. Nos outros não há de onde herdar, então é obrigatório.
    if (!confirmando && (valor === null || valor <= 0)) {
      novos.amount = "Informe um valor maior que zero.";
    }
    if (confirmando && amount.trim() !== "" && (valor === null || valor <= 0)) {
      novos.amount = "O valor precisa ser maior que zero.";
    }
    if (occurredAt.trim() && Number.isNaN(new Date(occurredAt).getTime())) {
      novos.occurred_at = "Data inválida.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/workers/${workerId}/payments`, {
      kind,
      amount: valor,
      occurred_at: occurredAt.trim() ? new Date(`${occurredAt}T12:00:00.000Z`).toISOString() : null,
      category: category.trim() || null,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Registrar pagamento</Button>}
      title={`Pagamento de ${workerName}`}
      description={
        previsao
          ? `Previsto: ${moeda(previsao.amount)}. Confirmar quita essa previsão e cria a próxima.`
          : "Não há pagamento previsto agora. Você pode registrar um adiantamento ou um valor avulso."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Tipo" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              err.limparCampo("kind");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.valor} value={t.valor} disabled={t.valor === "pagamento" && !previsao}>
                  {t.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Valor"
        required={!confirmando}
        hint={
          confirmando
            ? "Deixe em branco para pagar o previsto. Preencha se pagou outro valor."
            : undefined
        }
        id={err.idDe("amount")}
        error={err.erros.amount}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="dinheiro"
            value={amount}
            onValueChange={(v) => {
              setAmount(v);
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>

      <Field
        label="Data"
        hint="Opcional. Em branco, é hoje."
        id={err.idDe("occurred_at")}
        error={err.erros.occurred_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => {
              setOccurredAt(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      {!confirmando && (
        <Field
          label="Descrição"
          hint="Opcional. Ex: Ajuda de custo, Cesta básica."
          id={err.idDe("category")}
          error={err.erros.category}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                err.limparCampo("category");
              }}
            />
          )}
        </Field>
      )}

      <Field
        label="Observações"
        hint="Opcional."
        id={err.idDe("notes")}
        error={err.erros.notes}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
