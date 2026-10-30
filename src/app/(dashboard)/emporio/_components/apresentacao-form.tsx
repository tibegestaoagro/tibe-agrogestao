"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost, apiPatch } from "@/lib/client-api";
import {
  lerOpcional,
  paraCampo,
  textoEmUnidadeBase,
  CONTEUDO_UNIDADE_SUFIXO,
  UNIDADE_BASE_SUFIXO,
} from "./formato";

export type ApresentacaoParaForm = {
  id: string;
  name: string;
  base_qty: number;
  content_equivalent: number | null;
  is_sealed_package: boolean;
};

/** O conteúdo do produto (Q123): quando existe, a apresentação é informada nele (Q125). */
export type ConteudoDoProduto = { qty: number; unit: string };

const ORDEM = ["name", "base_qty", "content_qty", "is_sealed_package"] as const;
type Campo = (typeof ORDEM)[number];

/** Criar (sem `apresentacao`) e editar (com) no mesmo painel. */
export function ApresentacaoForm({
  produtoId,
  baseUnit,
  conteudo = null,
  apresentacao,
}: {
  produtoId: string;
  baseUnit: string;
  conteudo?: ConteudoDoProduto | null;
  apresentacao?: ApresentacaoParaForm;
}) {
  const router = useRouter();
  const editando = !!apresentacao;
  const err = useErrosDeFormulario(ORDEM, editando ? `apr-${apresentacao.id}` : "apr-nova");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sufixo = UNIDADE_BASE_SUFIXO[baseUnit] ?? baseUnit;
  const sufixoConteudo = conteudo ? (CONTEUDO_UNIDADE_SUFIXO[conteudo.unit] ?? conteudo.unit) : "";

  const [name, setName] = useState(apresentacao?.name ?? "");
  const [qtd, setQtd] = useState(paraCampo(apresentacao?.base_qty));
  const [qtdConteudo, setQtdConteudo] = useState(paraCampo(apresentacao?.content_equivalent));
  const [fechada, setFechada] = useState(apresentacao?.is_sealed_package ?? false);

  function reiniciar() {
    setName(apresentacao?.name ?? "");
    setQtd(paraCampo(apresentacao?.base_qty));
    setQtdConteudo(paraCampo(apresentacao?.content_equivalent));
    setFechada(apresentacao?.is_sealed_package ?? false);
    err.limparTudo();
  }

  // "= 0,1 saca": a conta que o servidor fará, mostrada antes de enviar.
  const lido = conteudo ? lerOpcional(qtdConteudo) : null;
  const conversao =
    conteudo && typeof lido === "number" && lido > 0
      ? textoEmUnidadeBase(Math.round((lido / conteudo.qty) * 1000) / 1000, baseUnit)
      : null;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome da apresentação.";
    // Só um dos dois campos está na tela; só ele é cobrado.
    const q = conteudo ? lerOpcional(qtdConteudo) : lerOpcional(qtd);
    const campoQtd: Campo = conteudo ? "content_qty" : "base_qty";
    if (q === null) {
      novos[campoQtd] = conteudo ? `Informe quanto, em ${sufixoConteudo}.` : `Informe quanto vale em ${sufixo}.`;
    } else if (q === "invalido") novos[campoQtd] = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: name.trim(),
      ...(conteudo ? { content_qty: q as number } : { base_qty: q as number }),
      is_sealed_package: fechada,
    };
    const res = editando
      ? await apiPatch(`/api/v1/emporio/presentations/${apresentacao.id}`, corpo)
      : await apiPost(`/api/v1/emporio/products/${produtoId}/presentations`, corpo);
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
          <Button size="sm">Nova apresentação</Button>
        )
      }
      title={editando ? "Editar apresentação" : "Nova apresentação"}
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
            placeholder="Ex: Saco 25 kg, 1 kg avulso"
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      {conteudo ? (
        <Field
          label={`Quanto (em ${sufixoConteudo})`}
          required
          id={err.idDe("content_qty")}
          error={err.erros.content_qty}
        >
          {({ id, ...aria }) => (
            <div className="space-y-1">
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit={sufixoConteudo}
                value={qtdConteudo}
                onValueChange={(v) => {
                  setQtdConteudo(v);
                  err.limparCampo("content_qty");
                }}
              />
              {conversao && (
                <p className="text-xs font-medium text-texto" aria-live="polite">
                  = {conversao}
                </p>
              )}
            </div>
          )}
        </Field>
      ) : (
        <Field
          label={`Vale quanto (${sufixo})`}
          required
          hint={baseUnit === "unidade" ? "Número inteiro." : undefined}
          id={err.idDe("base_qty")}
          error={err.erros.base_qty}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit={sufixo}
              value={qtd}
              onValueChange={(v) => {
                setQtd(v);
                err.limparCampo("base_qty");
              }}
            />
          )}
        </Field>
      )}

      <Field label="Embalagem" id={err.idDe("is_sealed_package")} error={err.erros.is_sealed_package}>
        {({ id, ...aria }) => (
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={fechada}
              onChange={(e) => {
                setFechada(e.target.checked);
                err.limparCampo("is_sealed_package");
              }}
              className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
            />
            É uma embalagem fechada (lacrada)
          </label>
        )}
      </Field>
    </FormSheet>
  );
}
