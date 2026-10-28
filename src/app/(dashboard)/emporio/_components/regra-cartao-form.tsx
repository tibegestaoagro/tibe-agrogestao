"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPut } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "./formato";
import { CARTAO_ROTULO } from "./venda-rotulos";

// Ordem visual, de cima para baixo. Os nomes são os da API (`PUT card-fee-rules`).
const ORDEM = ["establishment_id", "kind", "fee_pct", "days", "bank_account_id"] as const;
type Campo = (typeof ORDEM)[number];

export type RegraParaEditar = {
  id: string;
  establishment_id: string;
  kind: string;
  fee_pct: number;
  days: number;
  bank_account_id: string;
};

/**
 * Taxa de cartão de uma loja para uma forma (OWNER e ADMIN, Q89). O mesmo
 * painel cria e altera: o servidor cria ou substitui a regra da loja para a
 * forma, então alterar é mandar de novo com a loja e a forma da linha.
 *
 * Há um painel por linha da tabela: o prefixo leva o id da regra.
 */
export function RegraCartaoForm({
  lojas,
  contas,
  regra,
}: {
  lojas: { id: string; name: string }[];
  contas: { id: string; name: string }[];
  regra?: RegraParaEditar;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `regra-${regra?.id ?? "nova"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loja, setLoja] = useState(regra?.establishment_id ?? (lojas.length === 1 ? lojas[0].id : ""));
  const [forma, setForma] = useState(regra?.kind ?? "");
  const [taxa, setTaxa] = useState(regra ? paraCampo(regra.fee_pct) : "");
  const [dias, setDias] = useState(regra ? String(regra.days) : "");
  const [conta, setConta] = useState(regra?.bank_account_id ?? "");

  function recomecar() {
    setLoja(regra?.establishment_id ?? (lojas.length === 1 ? lojas[0].id : ""));
    setForma(regra?.kind ?? "");
    setTaxa(regra ? paraCampo(regra.fee_pct) : "");
    setDias(regra ? String(regra.days) : "");
    setConta(regra?.bank_account_id ?? "");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!loja) novos.establishment_id = "Escolha a loja.";
    if (!forma) novos.kind = "Escolha a forma: débito, crédito à vista ou crédito parcelado.";
    const pct = lerNumeroBr(taxa);
    if (pct === null || pct < 0 || pct > 100) novos.fee_pct = "A taxa deve ficar entre 0% e 100%.";
    const prazo = lerNumeroBr(dias);
    if (prazo === null || !Number.isInteger(prazo) || prazo < 0 || prazo > 120) {
      novos.days = "O prazo deve ser um número inteiro de dias, de 0 a 120.";
    }
    if (!conta) novos.bank_account_id = "Escolha a conta que recebe o cartão.";
    if (Object.keys(novos).length > 0 || pct === null || prazo === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPut("/api/v1/emporio/card-fee-rules", {
      establishment_id: loja,
      kind: forma,
      fee_pct: pct,
      days: prazo,
      bank_account_id: conta,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(regra ? "Taxa atualizada." : "Taxa cadastrada.");
    setOpen(false);
    if (!regra) recomecar();
    router.refresh();
  }

  const fixa = !!regra;

  return (
    <FormSheet
      trigger={
        regra ? (
          <Button variant="outline" size="sm">
            Alterar
          </Button>
        ) : (
          <Button>Nova taxa</Button>
        )
      }
      title={regra ? "Alterar taxa de cartão" : "Nova taxa de cartão"}
      description="Vale para as vendas novas daquela loja e forma. As vendas já feitas guardam a taxa que valia na hora."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) recomecar();
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={regra ? "Salvar taxa" : "Cadastrar taxa"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={loja}
            disabled={fixa}
            onValueChange={(v) => {
              setLoja(v);
              err.limparCampo("establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Forma" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select
            value={forma}
            disabled={fixa}
            onValueChange={(v) => {
              setForma(v);
              err.limparCampo("kind");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a forma" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CARTAO_ROTULO).map(([k, nome]) => (
                <SelectItem key={k} value={k}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Taxa (%)" required id={err.idDe("fee_pct")} error={err.erros.fee_pct} hint="Ex: 3,5 para 3,5%.">
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={taxa}
            onValueChange={(v) => {
              setTaxa(v);
              err.limparCampo("fee_pct");
            }}
          />
        )}
      </Field>

      <Field
        label="Prazo para cair (dias)"
        required
        id={err.idDe("days")}
        error={err.erros.days}
        hint="Dias entre a venda e a primeira parcela. As seguintes caem de 30 em 30 dias."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="dias"
            value={dias}
            onValueChange={(v) => {
              setDias(v);
              err.limparCampo("days");
            }}
          />
        )}
      </Field>

      <Field label="Conta que recebe" required id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
        {({ id, ...aria }) => (
          <Select
            value={conta}
            onValueChange={(v) => {
              setConta(v);
              err.limparCampo("bank_account_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormSheet>
  );
}
