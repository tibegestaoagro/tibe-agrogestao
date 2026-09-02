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
import { apiPost, apiPatch } from "@/lib/client-api";
import {
  FUNCOES_SUGERIDAS,
  PAY_FREQUENCY_LABELS,
  WORKER_TYPE_LABELS,
} from "@/components/mao-de-obra/labels";

/**
 * Cadastro e edição de trabalhador (§5 do Módulo 33).
 *
 * O CADASTRO É SIMPLES POR EXIGÊNCIA DO CLIENTE, não por falta de tempo: o §4
 * diz que o produtor "não deverá precisar cadastrar informações trabalhistas
 * complexas para registrar uma pessoa", e o exemplo dele é literalmente "João
 * trabalha comigo como vaqueiro e recebe R$ 2.500 por mês". Quatro campos.
 *
 * Frequência e valor só aparecem no `fixo`: o §13 trata o diarista como um
 * serviço, não como salário, e mostrar "quanto ele ganha por mês" para um
 * eventual convidaria a preencher o campo errado.
 */

type Property = { id: string; name: string };

export type TrabalhadorDoFormulario = {
  id: string;
  name: string;
  role: string;
  type: string;
  pay_frequency: string | null;
  pay_amount: number | null;
  pay_day: number | null;
  property_id: string | null;
  phone: string | null;
  notes: string | null;
};

const ORDEM = [
  "name",
  "role",
  "type",
  "pay_frequency",
  "pay_amount",
  "pay_day",
  "property_id",
  "phone",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

/** "Nenhuma" no seletor de fazenda. String vazia fecharia o placeholder. */
const SEM_FAZENDA = "__sem_fazenda__";

export default function WorkerForm({
  properties,
  trabalhador,
}: {
  properties: Property[];
  trabalhador?: TrabalhadorDoFormulario;
}) {
  const router = useRouter();
  const editando = trabalhador !== undefined;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, editando ? `edit-${trabalhador.id}` : undefined);

  const [name, setName] = useState(trabalhador?.name ?? "");
  const [role, setRole] = useState(trabalhador?.role ?? "");
  const [type, setType] = useState(trabalhador?.type ?? "fixo");
  const [freq, setFreq] = useState(trabalhador?.pay_frequency ?? "mensal");
  const [amount, setAmount] = useState(
    trabalhador?.pay_amount !== null && trabalhador?.pay_amount !== undefined
      ? String(trabalhador.pay_amount).replace(".", ",")
      : "",
  );
  const [payDay, setPayDay] = useState(
    trabalhador?.pay_day !== null && trabalhador?.pay_day !== undefined
      ? String(trabalhador.pay_day)
      : "",
  );
  const [propertyId, setPropertyId] = useState(trabalhador?.property_id ?? SEM_FAZENDA);
  const [phone, setPhone] = useState(trabalhador?.phone ?? "");
  const [notes, setNotes] = useState(trabalhador?.notes ?? "");

  const fixo = type === "fixo";

  function limpar() {
    setName(trabalhador?.name ?? "");
    setRole(trabalhador?.role ?? "");
    setType(trabalhador?.type ?? "fixo");
    setFreq(trabalhador?.pay_frequency ?? "mensal");
    setAmount(
      trabalhador?.pay_amount !== null && trabalhador?.pay_amount !== undefined
        ? String(trabalhador.pay_amount).replace(".", ",")
        : "",
    );
    setPayDay(
      trabalhador?.pay_day !== null && trabalhador?.pay_day !== undefined
        ? String(trabalhador.pay_day)
        : "",
    );
    setPropertyId(trabalhador?.property_id ?? SEM_FAZENDA);
    setPhone(trabalhador?.phone ?? "");
    setNotes(trabalhador?.notes ?? "");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do trabalhador.";
    if (!role.trim()) novos.role = "Informe a função.";

    const valor = lerValorDoCampo(amount);
    const dia = payDay.trim() ? Number(payDay.trim()) : null;

    if (fixo) {
      if (!freq) novos.pay_frequency = "Escolha de quanto em quanto tempo você paga.";
      if (valor === null || valor <= 0) {
        novos.pay_amount = "Informe quanto este trabalhador recebe por período.";
      }
    }
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) {
      novos.pay_day = "O dia de pagamento precisa estar entre 1 e 31.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: name.trim(),
      role: role.trim(),
      type,
      pay_frequency: fixo ? freq : null,
      pay_amount: fixo ? valor : null,
      pay_day: fixo ? dia : null,
      property_id: propertyId === SEM_FAZENDA ? null : propertyId,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    const res = editando
      ? await apiPatch(`/api/v1/workers/${trabalhador.id}`, corpo)
      : await apiPost("/api/v1/workers", corpo);
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    if (!editando) limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant={editando ? "outline" : "default"}>
          {editando ? "Editar" : "+ Novo trabalhador"}
        </Button>
      }
      title={editando ? "Editar trabalhador" : "Cadastrar trabalhador"}
      description={
        editando
          ? "Mudar o valor vale para os próximos pagamentos. O que já foi pago fica como está."
          : "Quem trabalha na fazenda. Nome, função e quanto recebe já bastam."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel={editando ? "Salvar" : "Cadastrar"}
      submitPendingLabel={editando ? "Salvando..." : "Cadastrando..."}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Ex: João da Silva"
          />
        )}
      </Field>

      <Field
        label="Função"
        required
        hint="Escolha uma da lista ou escreva a sua."
        id={err.idDe("role")}
        error={err.erros.role}
      >
        {({ id, ...aria }) => (
          <>
            <Input
              id={id}
              {...aria}
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                err.limparCampo("role");
              }}
              placeholder="Ex: Vaqueiro"
              list={`${id}-sugestoes`}
            />
            <datalist id={`${id}-sugestoes`}>
              {FUNCOES_SUGERIDAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <Field
        label="Tipo"
        required
        hint="Fixo tem relação contínua. Eventual trabalha por diária."
        id={err.idDe("type")}
        error={err.erros.type}
      >
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              err.limparCampo("type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(WORKER_TYPE_LABELS).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {fixo && (
        <Field
          label="Frequência de pagamento"
          required
          id={err.idDe("pay_frequency")}
          error={err.erros.pay_frequency}
        >
          {({ id, ...aria }) => (
            <Select
              value={freq}
              onValueChange={(v) => {
                setFreq(v);
                err.limparCampo("pay_frequency");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAY_FREQUENCY_LABELS).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {fixo && (
        <Field
          label="Valor por período"
          required
          id={err.idDe("pay_amount")}
          error={err.erros.pay_amount}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="dinheiro"
              value={amount}
              onValueChange={(v) => {
                setAmount(v);
                err.limparCampo("pay_amount");
              }}
            />
          )}
        </Field>
      )}

      {fixo && (
        <Field
          label="Dia habitual de pagamento"
          hint="Opcional. De 1 a 31. Em mês curto, cai no último dia."
          id={err.idDe("pay_day")}
          error={err.erros.pay_day}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="do mês"
              value={payDay}
              onValueChange={(v) => {
                setPayDay(v);
                err.limparCampo("pay_day");
              }}
            />
          )}
        </Field>
      )}

      <Field
        label="Fazenda"
        hint="Opcional. Serve para saber onde a pessoa trabalha, quando há mais de uma."
        id={err.idDe("property_id")}
        error={err.erros.property_id}
      >
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              err.limparCampo("property_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FAZENDA}>Nenhuma</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Telefone" hint="Opcional." id={err.idDe("phone")} error={err.erros.phone}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              err.limparCampo("phone");
            }}
            placeholder="Ex: 38 99999-0000"
          />
        )}
      </Field>

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
