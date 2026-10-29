"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAviso } from "@/components/ui/toast";
import { apiGet, apiPost } from "@/lib/client-api";

/**
 * Meu Empório, F5 (Q114): "Criar composição desta receita".
 *
 * ⚠️ **Casar ingrediente com produto é ESCOLHA, nunca nome.** Mesma regra do
 * painel da Lista de Compra: "milho" e "milho moído" são o mesmo ingrediente
 * para o produtor e dois produtos para o estoque. Ingrediente sem escolha
 * impede salvar.
 *
 * O botão só existe para quem vê o Empório: a rota de lojas devolve 404 quando
 * o recurso está desligado ou escondido do usuário, e o componente não renderiza
 * nada nesse caso. Quem fica sem permissão de escrita lê a recusa do servidor.
 */

export type ReceitaParaComposicao = {
  quantidadeFinalKg: number;
  ingredientes: { nome: string; quantidadeKg: number }[];
};

type ProdutoDoEmporio = { id: string; name: string; base_unit: string };

const ESCOLHER = "__escolher__";

export default function CriarComposicaoDaReceita({ receita }: { receita: ReceitaParaComposicao }) {
  const aviso = useAviso();
  const [veEmporio, setVeEmporio] = useState(false);
  const [open, setOpen] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoDoEmporio[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [produtoFinal, setProdutoFinal] = useState("");
  const [escolhas, setEscolhas] = useState<string[]>(() => receita.ingredientes.map(() => ""));
  const [pedeSubstituir, setPedeSubstituir] = useState(false);
  const [criadoId, setCriadoId] = useState<string | null>(null);

  const err = useErrosDeFormulario(
    ["emporio_product_id", ...receita.ingredientes.map((_, i) => `item_${i}`)],
    "composicao-da-receita",
  );

  useEffect(() => {
    let vivo = true;
    /* Os primeiros passos têm a mesma porta da composição (ADMIN ou mais, com o
       Empório visível): 404 fora do recurso, 403 para o OPERADOR, que só leria
       a recusa depois de casar a receita inteira. */
    apiGet<unknown>("/api/v1/emporio/first-steps").then((r) => {
      if (vivo) setVeEmporio(r.ok);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!open || produtos !== null) return;
    let vivo = true;
    apiGet<ProdutoDoEmporio[]>("/api/v1/emporio/products").then((r) => {
      if (!vivo) return;
      if (r.ok) setProdutos(r.data.filter((p) => p.base_unit === "quilograma"));
      else {
        setProdutos([]);
        aviso.erro(r.message);
      }
    });
    return () => {
      vivo = false;
    };
  }, [open, produtos, aviso]);

  async function enviar(substituir: boolean) {
    err.setGlobal(null);
    const novos: Record<string, string> = {};
    if (!produtoFinal) novos.emporio_product_id = "Escolha o produto final do Empório.";
    receita.ingredientes.forEach((ing, i) => {
      if (!escolhas[i]) novos[`item_${i}`] = `Escolha o produto do Empório para ${ing.nome}.`;
    });
    if (Object.keys(novos).length > 0) {
      err.reprovar(novos);
      return;
    }

    setEnviando(true);
    const r = await apiPost<{ id: string }>(
      `/api/v1/emporio/products/${produtoFinal}/composition/from-recipe`,
      {
        reference_qty: receita.quantidadeFinalKg,
        items: receita.ingredientes.map((ing, i) => ({
          component_emporio_product_id: escolhas[i],
          quantity: ing.quantidadeKg,
        })),
        ...(substituir ? { replace: true } : {}),
      },
    );
    setEnviando(false);

    if (r.ok) {
      setPedeSubstituir(false);
      setCriadoId(produtoFinal);
      setOpen(false);
      aviso.sucesso("Composição criada a partir da receita.");
      return;
    }
    if (r.code === "COMPOSITION_EXISTS") {
      setPedeSubstituir(true);
      return;
    }
    setPedeSubstituir(false);
    err.doServidor(r);
  }

  if (!veEmporio) return null;

  const opcoes = produtos ?? [];

  return (
    <div className="space-y-2">
      <FormSheet
        trigger={<Button variant="outline">Criar composição desta receita</Button>}
        title="Criar composição desta receita"
        description="A composição diz quanto de cada produto do Empório entra em um quilo do produto final. O estoque não é mexido."
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPedeSubstituir(false);
            err.limparTudo();
          }
        }}
        onSubmit={() => enviar(false)}
        submitLabel="Criar composição"
        pending={enviando || produtos === null}
        error={err.global}
        focarCampoId={err.focarCampoId}
        tentativa={err.tentativa}
      >
        {produtos === null && <p className="text-sm text-texto-secundario">Lendo os produtos do Empório...</p>}

        {produtos !== null && (
          <>
            <Field
              label={`Produto final (rende ${receita.quantidadeFinalKg.toLocaleString("pt-BR")} kg)`}
              required
              id="composicao-da-receita-emporio_product_id"
              error={err.erros.emporio_product_id}
              hint="Só aparecem os produtos do Empório medidos em quilo."
            >
              {({ id, ...aria }) => (
                <Select
                  value={produtoFinal || ESCOLHER}
                  onValueChange={(v) => {
                    setProdutoFinal(v === ESCOLHER ? "" : v);
                    setPedeSubstituir(false);
                    err.limparCampo("emporio_product_id");
                  }}
                >
                  <SelectTrigger id={id} {...aria}>
                    <SelectValue placeholder="Escolha o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ESCOLHER}>Escolha o produto</SelectItem>
                    {opcoes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {receita.ingredientes.map((ing, i) => (
              <Field
                key={`${ing.nome}-${i}`}
                label={`${ing.nome}: ${ing.quantidadeKg.toLocaleString("pt-BR")} kg`}
                required
                id={`composicao-da-receita-item_${i}`}
                error={err.erros[`item_${i}`]}
              >
                {({ id, ...aria }) => (
                  <Select
                    value={escolhas[i] || ESCOLHER}
                    onValueChange={(v) => {
                      setEscolhas((atual) => atual.map((e, j) => (j === i ? (v === ESCOLHER ? "" : v) : e)));
                      setPedeSubstituir(false);
                      err.limparCampo(`item_${i}`);
                    }}
                  >
                    <SelectTrigger id={id} {...aria}>
                      <SelectValue placeholder="Escolha o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ESCOLHER}>Escolha o produto</SelectItem>
                      {opcoes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ))}

            {pedeSubstituir && (
              <div className="space-y-2 rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
                <p>Esse produto já tem composição. A nova substitui a antiga.</p>
                <Button type="button" onClick={() => enviar(true)} disabled={enviando}>
                  Substituir a composição
                </Button>
              </div>
            )}
          </>
        )}
      </FormSheet>

      {criadoId && (
        <Link
          href={`/emporio/produtos/${criadoId}`}
          className="inline-flex min-h-11 items-center text-sm text-primaria-tinta hover:underline sm:min-h-0"
        >
          Ver o produto com a composição
        </Link>
      )}
    </div>
  );
}
