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
import {
  lerOpcional,
  rotuloCustoBase,
  UNIDADE_BASE_ROTULO,
  CONTEUDO_UNIDADES_POR_BASE,
} from "./formato";

/**
 * Os dois caminhos de criar produto no Empório. Cada um tem o seu painel, e os
 * dois vivem na mesma página, por isso o `prefixoDeId` diferente.
 *
 * O produto simples não pede composição nem configuração comercial (aceite
 * §25): só o que o servidor exige para existir.
 */

export type CategoriaParaForm = { id: string; name: string };
export type CandidatoParaForm = { id: string; name: string; category_name: string };
/**
 * A lista de espécies mora em `emporio-catalogo.ts`, que arrasta permissões e
 * banco: a página server a lê e desce por prop, nunca se importa aqui.
 */
export type EspecieParaForm = { id: string; label: string };

const ORDEM_NOVO = [
  "name",
  "category_id",
  "base_unit",
  "content_qty",
  "content_unit",
  "reference_cost",
  "brand",
  "manufacturer",
  "internal_code",
  "species",
] as const;
type CampoNovo = (typeof ORDEM_NOVO)[number];

/** Unidades do produto que nasce na loja. A saca e o fardo pedem conteúdo (Q123). */
const UNIDADES_NOVO = ["quilograma", "litro", "unidade", "saca", "fardo"];
/** O produto da fazenda não tem onde informar o conteúdo, então só as três simples. */
const UNIDADES_FAZENDA = ["quilograma", "litro", "unidade"];

function SeletorUnidade({
  id,
  aria,
  valor,
  onChange,
  unidades,
}: {
  id: string;
  aria: object;
  valor: string;
  onChange: (v: string) => void;
  unidades: string[];
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {unidades.map((v) => (
          <SelectItem key={v} value={v}>
            {UNIDADE_BASE_ROTULO[v]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Escolha múltipla das espécies. O `id` vai no grupo (com tabIndex) para a recusa poder focá-lo. */
export function SeletorEspecies({
  id,
  aria,
  especies,
  valor,
  onChange,
}: {
  id: string;
  aria: object;
  especies: EspecieParaForm[];
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div id={id} {...aria} role="group" tabIndex={-1} className="flex flex-wrap gap-x-4 gap-y-2">
      {especies.map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-sm text-texto-secundario">
          <input
            type="checkbox"
            checked={valor.includes(e.id)}
            onChange={(ev) => onChange(ev.target.checked ? [...valor, e.id] : valor.filter((x) => x !== e.id))}
            className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
          />
          {e.label}
        </label>
      ))}
    </div>
  );
}

function rotuloConteudo(base: string): string {
  if (base === "saca") return "Quanto pesa ou quanto cabe em uma saca";
  if (base === "fardo") return "Quanto pesa ou quanto cabe em um fardo";
  return "Conteúdo, se tiver (ex.: 500 ml = 0,5 L)";
}

export function ProdutoNovoForm({
  categorias,
  especiesLista,
}: {
  categorias: CategoriaParaForm[];
  especiesLista: EspecieParaForm[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_NOVO, "produto-novo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [categoria, setCategoria] = useState("");
  const [base, setBase] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [conteudoUnidade, setConteudoUnidade] = useState("quilograma");
  const [brand, setBrand] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [codigo, setCodigo] = useState("");
  const [especies, setEspecies] = useState<string[]>([]);
  const [maisDados, setMaisDados] = useState(false);
  const [custo, setCusto] = useState("");

  const opcoesConteudo = CONTEUDO_UNIDADES_POR_BASE[base] ?? null;
  const conteudoObrigatorio = base === "saca" || base === "fardo";
  // Uma recusa num campo escondido abriria a seção sozinha: sem isso o foco iria para o vazio.
  const mostrarMaisDados =
    maisDados || !!(err.erros.brand || err.erros.manufacturer || err.erros.internal_code || err.erros.species);

  function reiniciar() {
    setName("");
    setCategoria("");
    setBase("");
    setConteudo("");
    setConteudoUnidade("quilograma");
    setBrand("");
    setFabricante("");
    setCodigo("");
    setEspecies([]);
    setMaisDados(false);
    setCusto("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoNovo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do produto.";
    if (!categoria) novos.category_id = "Escolha a categoria.";
    if (!base) novos.base_unit = "Escolha a unidade-base: quilo, litro, unidade, saca ou fardo.";
    const c = lerOpcional(custo);
    if (c === "invalido") novos.reference_cost = "Não consegui ler esse número.";
    // Só cobra o conteúdo quando o campo está na tela.
    const q = opcoesConteudo ? lerOpcional(conteudo) : null;
    if (opcoesConteudo) {
      if (q === "invalido") novos.content_qty = "Não consegui ler esse número.";
      else if (q === null && conteudoObrigatorio) {
        novos.content_qty = `Informe quanto ${base === "saca" ? "pesa ou cabe na saca" : "pesa ou cabe no fardo"}.`;
      }
    }
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
      ...(typeof q === "number" ? { content_qty: q, content_unit: conteudoUnidade } : {}),
      brand: brand.trim() || null,
      manufacturer: fabricante.trim() || null,
      internal_code: codigo.trim() || null,
      species: especies,
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
        hint="Em que o produto é medido e custa: quilo, litro, unidade, saca ou fardo."
        id={err.idDe("base_unit")}
        error={err.erros.base_unit}
      >
        {({ id, ...aria }) => (
          <SeletorUnidade
            id={id}
            aria={aria}
            valor={base}
            unidades={UNIDADES_NOVO}
            onChange={(v) => {
              setBase(v);
              // A unidade do conteúdo tem de existir na nova unidade-base.
              const aceitas = CONTEUDO_UNIDADES_POR_BASE[v] ?? [];
              if (!aceitas.some((u) => u.valor === conteudoUnidade)) setConteudoUnidade("quilograma");
              err.limparCampo("base_unit");
              err.limparCampo("content_qty");
              err.limparCampo("content_unit");
            }}
          />
        )}
      </Field>

      {opcoesConteudo && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={rotuloConteudo(base)}
              required={conteudoObrigatorio}
              id={err.idDe("content_qty")}
              error={err.erros.content_qty}
            >
              {({ id, ...aria }) => (
                <MoneyInput
                  id={id}
                  {...aria}
                  kind="quantidade"
                  unit={opcoesConteudo.find((u) => u.valor === conteudoUnidade)?.rotulo}
                  value={conteudo}
                  onValueChange={(v) => {
                    setConteudo(v);
                    err.limparCampo("content_qty");
                  }}
                />
              )}
            </Field>

            <Field label="Unidade do conteúdo" id={err.idDe("content_unit")} error={err.erros.content_unit}>
              {({ id, ...aria }) => (
                <Select
                  value={conteudoUnidade}
                  onValueChange={(v) => {
                    setConteudoUnidade(v);
                    err.limparCampo("content_unit");
                  }}
                >
                  <SelectTrigger id={id} {...aria}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesConteudo.map((u) => (
                      <SelectItem key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
          {conteudoObrigatorio && (
            <p className="text-xs text-texto-secundario">
              A {base === "saca" ? "saca" : "fardo"} já nasce com a apresentação fechada (ex.: &ldquo;
              {base === "saca" ? "Saca" : "Fardo"} 10 kg&rdquo;). O conteúdo não muda depois: se errar, arquive o
              produto e cadastre de novo.
            </p>
          )}
        </>
      )}

      <Field
        label={base ? `${rotuloCustoBase(base)} (R$)` : "Custo de referência (R$)"}
        hint="Pode ficar em branco por enquanto."
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

      <div className="space-y-3 rounded-lg border border-borda p-3">
        <button
          type="button"
          onClick={() => setMaisDados((a) => !a)}
          aria-expanded={mostrarMaisDados}
          className="text-sm font-medium text-texto-marca hover:underline"
        >
          {mostrarMaisDados ? "Ocultar mais dados" : "Mais dados"}
        </button>
        {mostrarMaisDados && (
          <div className="space-y-4">
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

            <Field label="Fabricante" id={err.idDe("manufacturer")} error={err.erros.manufacturer}>
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  value={fabricante}
                  onChange={(e) => {
                    setFabricante(e.target.value);
                    err.limparCampo("manufacturer");
                  }}
                />
              )}
            </Field>

            <Field
              label="Código interno"
              hint="O seu código para achar o produto. Não pode repetir."
              id={err.idDe("internal_code")}
              error={err.erros.internal_code}
            >
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value);
                    err.limparCampo("internal_code");
                  }}
                />
              )}
            </Field>

            <Field label="Espécie" id={err.idDe("species")} error={err.erros.species}>
              {({ id, ...aria }) => (
                <SeletorEspecies
                  id={id}
                  aria={aria}
                  especies={especiesLista}
                  valor={especies}
                  onChange={(v) => {
                    setEspecies(v);
                    err.limparCampo("species");
                  }}
                />
              )}
            </Field>
          </div>
        )}
      </div>
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
            unidades={UNIDADES_FAZENDA}
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
