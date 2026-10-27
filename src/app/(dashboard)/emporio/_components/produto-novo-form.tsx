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
import { apiPost } from "@/lib/client-api";
import { lerOpcional, UNIDADE_BASE_ROTULO } from "./formato";

/**
 * Os dois caminhos de criar produto no Empório. Cada um tem o seu painel, e os
 * dois vivem na mesma página, por isso o `prefixoDeId` diferente.
 *
 * O produto simples não pede composição nem configuração comercial (aceite
 * §25): só o que o servidor exige para existir.
 */

export type CategoriaParaForm = { id: string; name: string };
export type CandidatoParaForm = { id: string; name: string; category_name: string };

const ORDEM_NOVO = ["name", "category_id", "base_unit", "brand", "reference_cost"] as const;
type CampoNovo = (typeof ORDEM_NOVO)[number];

function SeletorUnidade({
  id,
  aria,
  valor,
  onChange,
}: {
  id: string;
  aria: object;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(UNIDADE_BASE_ROTULO).map(([v, r]) => (
          <SelectItem key={v} value={v}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProdutoNovoForm({ categorias }: { categorias: CategoriaParaForm[] }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_NOVO, "produto-novo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [categoria, setCategoria] = useState("");
  const [base, setBase] = useState("");
  const [brand, setBrand] = useState("");
  const [custo, setCusto] = useState("");

  function reiniciar() {
    setName("");
    setCategoria("");
    setBase("");
    setBrand("");
    setCusto("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoNovo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do produto.";
    if (!categoria) novos.category_id = "Escolha a categoria.";
    if (!base) novos.base_unit = "Escolha a unidade-base: quilo, litro ou unidade.";
    const c = lerOpcional(custo);
    if (c === "invalido") novos.reference_cost = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string }>("/api/v1/emporio/products", {
      name: name.trim(),
      category_id: categoria,
      base_unit: base,
      brand: brand.trim() || null,
      reference_cost: c as number | null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    reiniciar();
    setOpen(false);
    router.push(`/emporio/produtos/${res.data.id}`);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Novo produto</Button>}
      title="Novo produto"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar"
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

      <Field label="Categoria" required id={err.idDe("category_id")} error={err.erros.category_id}>
        {({ id, ...aria }) => (
          <Select
            value={categoria}
            onValueChange={(v) => {
              setCategoria(v);
              err.limparCampo("category_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Unidade-base"
        required
        hint="Em que o produto é medido e custa: quilo, litro ou unidade."
        id={err.idDe("base_unit")}
        error={err.erros.base_unit}
      >
        {({ id, ...aria }) => (
          <SeletorUnidade
            id={id}
            aria={aria}
            valor={base}
            onChange={(v) => {
              setBase(v);
              err.limparCampo("base_unit");
            }}
          />
        )}
      </Field>

      <Field label="Marca" id={err.idDe("brand")} error={err.erros.brand}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              err.limparCampo("brand");
            }}
          />
        )}
      </Field>

      <Field
        label="Custo de referência (R$)"
        hint="Por unidade-base. Pode ficar em branco por enquanto."
        id={err.idDe("reference_cost")}
        error={err.erros.reference_cost}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={custo}
            onValueChange={(v) => {
              setCusto(v);
              err.limparCampo("reference_cost");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_FAZENDA = ["product_id", "base_unit", "reference_cost"] as const;
type CampoFazenda = (typeof ORDEM_FAZENDA)[number];

export function ProdutoDaFazendaForm({ candidatos }: { candidatos: CandidatoParaForm[] }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_FAZENDA, "produto-fazenda");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [produto, setProduto] = useState("");
  const [base, setBase] = useState("");
  const [custo, setCusto] = useState("");

  function reiniciar() {
    setProduto("");
    setBase("");
    setCusto("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoFazenda, string>> = {};
    if (!produto) novos.product_id = "Escolha o produto da fazenda.";
    if (!base) novos.base_unit = "Escolha a unidade-base: quilo, litro ou unidade.";
    const c = lerOpcional(custo);
    if (c === "invalido") novos.reference_cost = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string }>("/api/v1/emporio/products", {
      product_id: produto,
      base_unit: base,
      reference_cost: c as number | null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    reiniciar();
    setOpen(false);
    router.push(`/emporio/produtos/${res.data.id}`);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Usar produto da fazenda</Button>}
      title="Usar produto da fazenda"
      description="O produto continua no Estoque da fazenda e passa a poder ser vendido no Empório."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Usar no Empório"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Produto" required id={err.idDe("product_id")} error={err.erros.product_id}>
        {({ id, ...aria }) => (
          <Select
            value={produto}
            onValueChange={(v) => {
              setProduto(v);
              err.limparCampo("product_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder={candidatos.length === 0 ? "Nenhum produto disponível" : "Selecione"} />
            </SelectTrigger>
            <SelectContent>
              {candidatos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.category_name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Unidade-base" required id={err.idDe("base_unit")} error={err.erros.base_unit}>
        {({ id, ...aria }) => (
          <SeletorUnidade
            id={id}
            aria={aria}
            valor={base}
            onChange={(v) => {
              setBase(v);
              err.limparCampo("base_unit");
            }}
          />
        )}
      </Field>

      <Field
        label="Custo de referência (R$)"
        hint="Por unidade-base. Pode ficar em branco por enquanto."
        id={err.idDe("reference_cost")}
        error={err.erros.reference_cost}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={custo}
            onValueChange={(v) => {
              setCusto(v);
              err.limparCampo("reference_cost");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
