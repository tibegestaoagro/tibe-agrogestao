"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPut } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { UNIDADE_BASE_SUFIXO, lerOpcional, paraCampo } from "./formato";

/**
 * "Editar composição" (F2b, Q22, Q77). O PUT substitui a composição inteira,
 * então o painel sempre abre com a receita atual.
 */

export type ComponenteOpcao = { id: string; name: string; base_unit: string };

export type ComposicaoParaEditar = {
  reference_qty: number;
  yield_pct: number | null;
  items: { component_emporio_product_id: string; quantity: number }[];
};

type Linha = { key: number; componente: string; qtd: string };

// Ordem visual, de cima para baixo.
const ORDEM = ["reference_qty", "yield_pct", "items"] as const;
type Campo = (typeof ORDEM)[number];

export function ComposicaoForm({
  produtoId,
  baseUnit,
  composicao,
  componentes,
}: {
  produtoId: string;
  baseUnit: string;
  composicao: ComposicaoParaEditar | null;
  componentes: ComponenteOpcao[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "comp");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Chaves das linhas que o usuário acrescenta; as iniciais usam o índice (0 a 999).
  const contador = useRef(1000);
  const proximo = () => {
    contador.current += 1;
    return contador.current;
  };
  const sufixo = UNIDADE_BASE_SUFIXO[baseUnit] ?? baseUnit;

  const inicialLinhas = (): Linha[] =>
    composicao && composicao.items.length > 0
      ? composicao.items.map((i, n) => ({
          key: n,
          componente: i.component_emporio_product_id,
          qtd: paraCampo(i.quantity),
        }))
      : [{ key: 0, componente: "", qtd: "" }];

  const [referencia, setReferencia] = useState(paraCampo(composicao?.reference_qty));
  const [rendimento, setRendimento] = useState(paraCampo(composicao?.yield_pct));
  const [linhas, setLinhas] = useState<Linha[]>(inicialLinhas);

  function reiniciar() {
    setReferencia(paraCampo(composicao?.reference_qty));
    setRendimento(paraCampo(composicao?.yield_pct));
    setLinhas(inicialLinhas());
    err.limparTudo();
  }

  function atualizar(key: number, parte: Partial<Linha>) {
    setLinhas((l) => l.map((x) => (x.key === key ? { ...x, ...parte } : x)));
    err.limparCampo("items");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const ref = lerNumeroBr(referencia);
    if (ref === null || ref <= 0) novos.reference_qty = "Informe para quanto rende a receita (maior que zero).";
    const y = lerOpcional(rendimento);
    if (y === "invalido" || (y !== null && (y <= 0 || y > 100))) {
      novos.yield_pct = "O rendimento deve ficar acima de 0 e até 100%.";
    }

    const itens: { component_emporio_product_id: string; quantity: number }[] = [];
    for (const l of linhas) {
      const q = lerNumeroBr(l.qtd);
      if (!l.componente || q === null || q <= 0) {
        novos.items = "Cada componente precisa de produto e quantidade maior que zero.";
        break;
      }
      itens.push({ component_emporio_product_id: l.componente, quantity: q });
    }
    if (!novos.items && new Set(itens.map((i) => i.component_emporio_product_id)).size !== itens.length) {
      novos.items = "Um componente aparece mais de uma vez. Junte as quantidades.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPut(`/api/v1/emporio/products/${produtoId}/composition`, {
      reference_qty: ref as number,
      yield_pct: y as number | null,
      items: itens,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          {composicao ? "Editar composição" : "Cadastrar composição"}
        </Button>
      }
      title="Composição"
      description="A receita para uma quantidade de referência. Salvar não mexe no estoque: só a produção baixa os componentes."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reiniciar();
        else err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar composição"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label={`A receita rende (${sufixo})`}
        required
        id={err.idDe("reference_qty")}
        error={err.erros.reference_qty}
        hint="Ex: 100 kg de ração. Os componentes abaixo valem para essa quantidade."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={referencia}
            onValueChange={(v) => {
              setReferencia(v);
              err.limparCampo("reference_qty");
            }}
          />
        )}
      </Field>

      <Field
        label="Rendimento (%)"
        id={err.idDe("yield_pct")}
        error={err.erros.yield_pct}
        hint="Em branco, vale 100%. Use menos quando a mistura perde massa."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={rendimento}
            onValueChange={(v) => {
              setRendimento(v);
              err.limparCampo("yield_pct");
            }}
          />
        )}
      </Field>

      <Field label="Componentes" required id={err.idDe("items")} error={err.erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            {linhas.map((l, n) => {
              const comp = componentes.find((c) => c.id === l.componente);
              const unid = comp ? (UNIDADE_BASE_SUFIXO[comp.base_unit] ?? comp.base_unit) : "";
              return (
                <div key={l.key} className="space-y-2 rounded-lg border border-borda p-3">
                  <Select value={l.componente} onValueChange={(v) => atualizar(l.key, { componente: v })}>
                    <SelectTrigger aria-label={`Componente ${n + 1}`}>
                      <SelectValue placeholder="Produto do Empório" />
                    </SelectTrigger>
                    <SelectContent>
                      {componentes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <MoneyInput
                    kind="quantidade"
                    unit={unid}
                    aria-label={`Quantidade do componente ${n + 1}`}
                    placeholder={unid ? `Quantidade em ${unid}` : "Quantidade"}
                    value={l.qtd}
                    onValueChange={(v) => atualizar(l.key, { qtd: v })}
                  />
                  {linhas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLinhas((x) => x.filter((y) => y.key !== l.key));
                        err.limparCampo("items");
                      }}
                    >
                      Remover componente
                    </Button>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinhas((x) => [...x, { key: proximo(), componente: "", qtd: "" }])}
            >
              Adicionar componente
            </Button>
          </div>
        )}
      </Field>
    </FormSheet>
  );
}
