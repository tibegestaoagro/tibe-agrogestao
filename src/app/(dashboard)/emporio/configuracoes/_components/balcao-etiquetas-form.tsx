"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { alturaMinimaComBarras, cabemBarras, textoSemBarras } from "@/lib/emporio/etiqueta-medidas";
import { ATALHOS_PADRAO, TECLAS_PERMITIDAS } from "@/lib/emporio/atalhos";
import type { EmporioSettingsView } from "@/lib/actions/emporio-configuracoes";
import { paraCampo } from "../../_components/formato";

export type BalcaoParaForm = Pick<
  EmporioSettingsView,
  "shortcuts" | "show_shortcut_legend" | "label_default_format" | "label_a4" | "label_roll"
>;

/** Ordem VISUAL, com o nome que a API usa: cada um tem o seu `<Field error=>`. */
const ORDEM = [
  "shortcut_product",
  "shortcut_customer",
  "shortcut_seller",
  "shortcut_payment",
  "shortcut_close",
  "show_shortcut_legend",
  "label_default_format",
  "label_a4_columns",
  "label_a4_rows",
  "label_a4_width",
  "label_a4_height",
  "label_a4_margin_top",
  "label_a4_margin_left",
  "label_a4_gap_x",
  "label_a4_gap_y",
  "label_roll_width",
  "label_roll_height",
  "label_roll_columns",
  "label_roll_gap_x",
] as const;
type Campo = (typeof ORDEM)[number];
type CampoDeTexto = Exclude<Campo, "show_shortcut_legend">;
type Estado = Record<CampoDeTexto, string>;

/** Inteiros (colunas e linhas); o resto é medida em mm. O servidor confere os limites e se a grade cabe. */
const INTEIROS: CampoDeTexto[] = ["label_a4_columns", "label_a4_rows", "label_roll_columns"];
/** Margem e espaço aceitam zero; largura e altura da etiqueta, não. */
const ACEITAM_ZERO: CampoDeTexto[] = [
  "label_a4_margin_top",
  "label_a4_margin_left",
  "label_a4_gap_x",
  "label_a4_gap_y",
  "label_roll_gap_x",
];

/** As mesmas medidas de fábrica do servidor (modelo de 21 etiquetas; 40 x 25 mm no rolo). */
const PADRAO: Estado & { show_shortcut_legend: boolean } = {
  shortcut_product: ATALHOS_PADRAO.produto,
  shortcut_customer: ATALHOS_PADRAO.cliente,
  shortcut_seller: ATALHOS_PADRAO.vendedor,
  shortcut_payment: ATALHOS_PADRAO.pagamento,
  shortcut_close: ATALHOS_PADRAO.fechar,
  show_shortcut_legend: true,
  label_default_format: "a4",
  label_a4_columns: "3",
  label_a4_rows: "7",
  label_a4_width: "63,5",
  label_a4_height: "38,1",
  label_a4_margin_top: "15,15",
  label_a4_margin_left: "7,2",
  label_a4_gap_x: "2,5",
  label_a4_gap_y: "0",
  label_roll_width: "40",
  label_roll_height: "25",
  label_roll_columns: "1",
  label_roll_gap_x: "2",
};

function estadoDe(c: BalcaoParaForm): Estado & { show_shortcut_legend: boolean } {
  return {
    shortcut_product: c.shortcuts.produto,
    shortcut_customer: c.shortcuts.cliente,
    shortcut_seller: c.shortcuts.vendedor,
    shortcut_payment: c.shortcuts.pagamento,
    shortcut_close: c.shortcuts.fechar,
    show_shortcut_legend: c.show_shortcut_legend,
    label_default_format: c.label_default_format,
    label_a4_columns: String(c.label_a4.columns),
    label_a4_rows: String(c.label_a4.rows),
    label_a4_width: paraCampo(c.label_a4.width),
    label_a4_height: paraCampo(c.label_a4.height),
    label_a4_margin_top: paraCampo(c.label_a4.margin_top),
    label_a4_margin_left: paraCampo(c.label_a4.margin_left),
    label_a4_gap_x: paraCampo(c.label_a4.gap_x),
    label_a4_gap_y: paraCampo(c.label_a4.gap_y),
    label_roll_width: paraCampo(c.label_roll.width),
    label_roll_height: paraCampo(c.label_roll.height),
    label_roll_columns: String(c.label_roll.columns),
    label_roll_gap_x: paraCampo(c.label_roll.gap_x),
  };
}

function SeletorDeTecla({
  id,
  aria,
  valor,
  aoMudar,
}: {
  id: string;
  aria: Record<string, unknown>;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <Select
      value={valor}
      onValueChange={(v) => {
        // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
        if (v !== "") aoMudar(v);
      }}
    >
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Escolha a tecla" />
      </SelectTrigger>
      <SelectContent>
        {TECLAS_PERMITIDAS.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Teclas dos atalhos do balcão, legenda, formato padrão e medidas das etiquetas (Q361): da conta,
 * gravam juntas na sub-rota `settings/balcao`. A tecla repetida e a grade que não cabe na folha
 * são recusas do servidor, e caem no campo que ele nomeia.
 */
export function BalcaoEtiquetasForm({ balcao }: { balcao: BalcaoParaForm }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "balcao");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState(() => estadoDe(balcao));

  function muda(campo: CampoDeTexto, valor: string) {
    setF((e) => ({ ...e, [campo]: valor }));
    err.limparCampo(campo);
  }

  function reiniciar() {
    setF(estadoDe(balcao));
    err.limparTudo();
  }

  /** Só preenche o formulário: nada grava até "Salvar". */
  function voltarAoPadrao() {
    setF(PADRAO);
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const corpo: Record<string, string | number | boolean> = {
      show_shortcut_legend: f.show_shortcut_legend,
      label_default_format: f.label_default_format,
    };
    for (const campo of ORDEM) {
      if (campo === "show_shortcut_legend" || campo === "label_default_format") continue;
      const bruto = f[campo];
      if (campo.startsWith("shortcut_")) {
        corpo[campo] = bruto;
      } else if (INTEIROS.includes(campo)) {
        if (!/^\d+$/.test(bruto.trim()) || Number(bruto) < 1) novos[campo] = "Informe um número inteiro, de 1 para cima.";
        else corpo[campo] = Number(bruto);
      } else {
        const n = lerNumeroBr(bruto);
        if (n === null || n < 0 || (n === 0 && !ACEITAM_ZERO.includes(campo))) {
          novos[campo] = ACEITAM_ZERO.includes(campo)
            ? "Informe a medida em mm, zero ou mais."
            : "Informe a medida em mm, maior que zero.";
        } else corpo[campo] = n;
      }
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch("/api/v1/emporio/settings/balcao", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  /** Aviso embaixo da altura quando, com a largura e a altura digitadas, as barras não cabem. */
  const avisoDeBarras = (largura: string, altura: string): string | undefined => {
    const l = lerNumeroBr(largura);
    const a = lerNumeroBr(altura);
    if (l === null || a === null || l <= 0 || a <= 0 || cabemBarras(l, a)) return undefined;
    return textoSemBarras(alturaMinimaComBarras(l));
  };

  const tecla = (campo: CampoDeTexto, rotulo: string, dica?: string) => (
    <Field label={rotulo} hint={dica} id={err.idDe(campo)} error={err.erros[campo]}>
      {({ id, ...aria }) => (
        <SeletorDeTecla id={id} aria={aria} valor={f[campo]} aoMudar={(v) => muda(campo, v)} />
      )}
    </Field>
  );

  return (
    <FormSheet
      trigger={<Button variant="outline">Mudar</Button>}
      title="Balcão e etiquetas"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <h3 className="text-sm font-semibold text-texto">Atalhos do balcão</h3>
      {tecla("shortcut_product", "Buscar produto")}
      {tecla("shortcut_customer", "Escolher cliente")}
      {tecla("shortcut_seller", "Vendedor")}
      {tecla("shortcut_payment", "Forma de pagamento")}
      {tecla("shortcut_close", "Fechar a venda", "Aciona o botão principal do rodapé, com as mesmas conferências.")}

      <Field label="Legenda" id={err.idDe("show_shortcut_legend")} error={err.erros.show_shortcut_legend}>
        {({ id, ...aria }) => (
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={f.show_shortcut_legend}
              onChange={(e) => {
                setF((x) => ({ ...x, show_shortcut_legend: e.target.checked }));
                err.limparCampo("show_shortcut_legend");
              }}
              className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
            />
            Mostrar as teclas no rodapé do balcão (só no computador)
          </label>
        )}
      </Field>

      <h3 className="pt-2 text-sm font-semibold text-texto">Etiquetas</h3>
      <Field label="Formato padrão" id={err.idDe("label_default_format")} error={err.erros.label_default_format}>
        {({ id, ...aria }) => (
          <Select
            value={f.label_default_format}
            onValueChange={(v) => {
              if (v !== "") muda("label_default_format", v);
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">Folha A4</SelectItem>
              <SelectItem value="rolo">Rolo</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <h4 className="text-sm font-medium text-texto">Folha A4 (medidas em mm)</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Colunas" id={err.idDe("label_a4_columns")} error={err.erros.label_a4_columns}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              value={f.label_a4_columns}
              onChange={(e) => muda("label_a4_columns", e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          )}
        </Field>
        <Field label="Linhas" id={err.idDe("label_a4_rows")} error={err.erros.label_a4_rows}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              value={f.label_a4_rows}
              onChange={(e) => muda("label_a4_rows", e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          )}
        </Field>
        <Field label="Largura da etiqueta" id={err.idDe("label_a4_width")} error={err.erros.label_a4_width}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_width}
              onValueChange={(v) => muda("label_a4_width", v)}
            />
          )}
        </Field>
        <Field
          label="Altura da etiqueta"
          hint={avisoDeBarras(f.label_a4_width, f.label_a4_height)}
          id={err.idDe("label_a4_height")}
          error={err.erros.label_a4_height}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_height}
              onValueChange={(v) => muda("label_a4_height", v)}
            />
          )}
        </Field>
        <Field label="Margem de cima" id={err.idDe("label_a4_margin_top")} error={err.erros.label_a4_margin_top}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_margin_top}
              onValueChange={(v) => muda("label_a4_margin_top", v)}
            />
          )}
        </Field>
        <Field label="Margem da esquerda" id={err.idDe("label_a4_margin_left")} error={err.erros.label_a4_margin_left}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_margin_left}
              onValueChange={(v) => muda("label_a4_margin_left", v)}
            />
          )}
        </Field>
        <Field label="Espaço entre colunas" id={err.idDe("label_a4_gap_x")} error={err.erros.label_a4_gap_x}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_gap_x}
              onValueChange={(v) => muda("label_a4_gap_x", v)}
            />
          )}
        </Field>
        <Field label="Espaço entre linhas" id={err.idDe("label_a4_gap_y")} error={err.erros.label_a4_gap_y}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_a4_gap_y}
              onValueChange={(v) => muda("label_a4_gap_y", v)}
            />
          )}
        </Field>
      </div>

      <h4 className="text-sm font-medium text-texto">Rolo (medidas em mm)</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Largura da etiqueta" id={err.idDe("label_roll_width")} error={err.erros.label_roll_width}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_roll_width}
              onValueChange={(v) => muda("label_roll_width", v)}
            />
          )}
        </Field>
        <Field
          label="Altura da etiqueta"
          hint={avisoDeBarras(f.label_roll_width, f.label_roll_height)}
          id={err.idDe("label_roll_height")}
          error={err.erros.label_roll_height}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_roll_height}
              onValueChange={(v) => muda("label_roll_height", v)}
            />
          )}
        </Field>
        <Field
          label="Colunas por linha"
          hint="De 1 a 3."
          id={err.idDe("label_roll_columns")}
          error={err.erros.label_roll_columns}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              value={f.label_roll_columns}
              onChange={(e) => muda("label_roll_columns", e.target.value.replace(/\D/g, "").slice(0, 1))}
            />
          )}
        </Field>
        <Field label="Espaço entre colunas" id={err.idDe("label_roll_gap_x")} error={err.erros.label_roll_gap_x}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="mm"
              value={f.label_roll_gap_x}
              onValueChange={(v) => muda("label_roll_gap_x", v)}
            />
          )}
        </Field>
      </div>

      <Button type="button" variant="ghost" onClick={voltarAoPadrao}>
        Voltar ao padrão
      </Button>
    </FormSheet>
  );
}
