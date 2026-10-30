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
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost, apiPatch } from "@/lib/client-api";
import { lerOpcional, paraCampo } from "./formato";

export type LojaParaForm = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  responsible_user_id: string | null;
  allow_negative_stock: boolean;
  max_discount_pct: number | null;
  default_expense_pct: number | null;
  default_profit_pct: number | null;
};

export type UsuarioParaForm = { id: string; name: string };

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = [
  "name",
  "address",
  "city",
  "responsible_user_id",
  "default_expense_pct",
  "default_profit_pct",
  "max_discount_pct",
  "allow_negative_stock",
] as const;
type Campo = (typeof ORDEM)[number];

const NINGUEM = "__ninguem__";

/** Criar (sem `loja`) e editar (com `loja`) no mesmo painel. */
export function EstabelecimentoForm({
  loja,
  usuarios,
}: {
  loja?: LojaParaForm;
  usuarios: UsuarioParaForm[];
}) {
  const router = useRouter();
  const editando = !!loja;
  const err = useErrosDeFormulario(ORDEM, editando ? `loja-${loja.id}` : "loja-nova");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(loja?.name ?? "");
  const [address, setAddress] = useState(loja?.address ?? "");
  const [city, setCity] = useState(loja?.city ?? "");
  const [responsavel, setResponsavel] = useState(loja?.responsible_user_id ?? NINGUEM);
  const [despesa, setDespesa] = useState(paraCampo(loja?.default_expense_pct));
  const [lucro, setLucro] = useState(paraCampo(loja?.default_profit_pct));
  const [desconto, setDesconto] = useState(paraCampo(loja?.max_discount_pct));
  const [negativo, setNegativo] = useState(loja?.allow_negative_stock ?? false);

  function reiniciar() {
    setName(loja?.name ?? "");
    setAddress(loja?.address ?? "");
    setCity(loja?.city ?? "");
    setResponsavel(loja?.responsible_user_id ?? NINGUEM);
    setDespesa(paraCampo(loja?.default_expense_pct));
    setLucro(paraCampo(loja?.default_profit_pct));
    setDesconto(paraCampo(loja?.max_discount_pct));
    setNegativo(loja?.allow_negative_stock ?? false);
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do estabelecimento.";
    const d = lerOpcional(despesa);
    const l = lerOpcional(lucro);
    const m = lerOpcional(desconto);
    if (d === "invalido") novos.default_expense_pct = "Não consegui ler esse número.";
    if (l === "invalido") novos.default_profit_pct = "Não consegui ler esse número.";
    if (m === "invalido") novos.max_discount_pct = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim() || null,
      responsible_user_id: responsavel === NINGUEM ? null : responsavel,
      default_expense_pct: d as number | null,
      default_profit_pct: l as number | null,
      max_discount_pct: m as number | null,
      allow_negative_stock: negativo,
    };
    const res = editando
      ? await apiPatch(`/api/v1/emporio/establishments/${loja.id}`, corpo)
      : await apiPost("/api/v1/emporio/establishments", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    if (!editando) reiniciar();
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        editando ? (
          <Button variant="outline" size="sm">
            Editar
          </Button>
        ) : (
          <Button>Novo estabelecimento</Button>
        )
      }
      title={editando ? "Editar estabelecimento" : "Novo estabelecimento"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel={editando ? "Salvar" : "Cadastrar"}
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
          />
        )}
      </Field>

      <Field label="Endereço" id={err.idDe("address")} error={err.erros.address}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              err.limparCampo("address");
            }}
          />
        )}
      </Field>

      <Field label="Cidade" id={err.idDe("city")} error={err.erros.city}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              err.limparCampo("city");
            }}
          />
        )}
      </Field>

      <Field label="Responsável" id={err.idDe("responsible_user_id")} error={err.erros.responsible_user_id}>
        {({ id, ...aria }) => (
          <Select
            value={responsavel}
            onValueChange={(v) => {
              setResponsavel(v);
              err.limparCampo("responsible_user_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NINGUEM}>Sem responsável</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Despesas padrão (%)"
        hint="Percentual de despesas sobre o custo, usado no preço sugerido desta loja."
        id={err.idDe("default_expense_pct")}
        error={err.erros.default_expense_pct}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={despesa}
            onValueChange={(v) => {
              setDespesa(v);
              err.limparCampo("default_expense_pct");
            }}
          />
        )}
      </Field>

      <Field
        label="Lucro padrão (%)"
        id={err.idDe("default_profit_pct")}
        error={err.erros.default_profit_pct}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={lucro}
            onValueChange={(v) => {
              setLucro(v);
              err.limparCampo("default_profit_pct");
            }}
          />
        )}
      </Field>

      <Field
        label="Desconto máximo (%)"
        hint="De 0 a 100. Em branco, sem limite definido."
        id={err.idDe("max_discount_pct")}
        error={err.erros.max_discount_pct}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={desconto}
            onValueChange={(v) => {
              setDesconto(v);
              err.limparCampo("max_discount_pct");
            }}
          />
        )}
      </Field>

      <Field label="Estoque" id={err.idDe("allow_negative_stock")} error={err.erros.allow_negative_stock}>
        {({ id, ...aria }) => (
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={negativo}
              onChange={(e) => {
                setNegativo(e.target.checked);
                err.limparCampo("allow_negative_stock");
              }}
              className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
            />
            Permitir vender com estoque negativo
          </label>
        )}
      </Field>
    </FormSheet>
  );
}
