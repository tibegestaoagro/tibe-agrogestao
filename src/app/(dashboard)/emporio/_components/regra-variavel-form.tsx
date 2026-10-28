"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { apiPatch, apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "./formato";
import { FORMA_ROTULO, TIPO_REGRA_ROTULO } from "./venda-rotulos";

// Ordem visual, de cima para baixo. Os nomes são os da API (`variable-expense-rules`).
const ORDEM = [
  "establishment_id",
  "name",
  "kind",
  "value",
  "packaging_emporio_product_id",
  "payment_kind",
  "emporio_product_id",
  "presentation_id",
] as const;
type Campo = (typeof ORDEM)[number];

const QUALQUER = "__qualquer__";
const FORMAS = ["dinheiro", "pix", "debito", "credito_vista", "credito_parcelado", "cheque", "fiado"] as const;

export type RegraParaEditar = {
  id: string;
  establishment_id: string;
  name: string;
  kind: string;
  value: number;
  payment_kind: string | null;
  emporio_product_id: string | null;
  presentation_id: string | null;
  packaging_emporio_product_id: string | null;
};

export type ProdutoDaRegra = {
  id: string;
  name: string;
  /** Embalagens só aceitam produto ativo; a lista já vem filtrada. */
  presentations: { id: string; name: string }[];
};

/**
 * Regra do "Vendeu, Pagou" de uma loja (OWNER e ADMIN, Q97). O mesmo painel
 * cria e altera; a loja não muda depois de criada. Há um painel por linha da
 * tabela: o prefixo leva o id da regra.
 */
export function RegraVariavelForm({
  lojas,
  produtos,
  regra,
}: {
  lojas: { id: string; name: string }[];
  produtos: ProdutoDaRegra[];
  regra?: RegraParaEditar;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `regra-${regra?.id ?? "nova"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const inicial = () => ({
    loja: regra?.establishment_id ?? (lojas.length === 1 ? lojas[0].id : ""),
    nome: regra?.name ?? "",
    tipo: regra?.kind ?? "",
    valor: regra ? paraCampo(regra.value) : "",
    forma: regra?.payment_kind ?? QUALQUER,
    produto: regra?.emporio_product_id ?? QUALQUER,
    apresentacao: regra?.presentation_id ?? QUALQUER,
    embalagem: regra?.packaging_emporio_product_id ?? "",
  });
  const [f, setF] = useState(inicial);
  const set = (parcial: Partial<ReturnType<typeof inicial>>) => setF((a) => ({ ...a, ...parcial }));

  const apresentacoes = produtos.find((p) => p.id === f.produto)?.presentations ?? [];
  const ehEmbalagem = f.tipo === "embalagem";
  const ehPct = f.tipo === "percentual";

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!regra && !f.loja) novos.establishment_id = "Escolha a loja.";
    if (!f.nome.trim()) novos.name = "Dê um nome à regra.";
    if (!f.tipo) novos.kind = "Escolha o cálculo da regra.";
    const valor = lerNumeroBr(f.valor);
    if (valor === null) novos.value = "Informe o valor da regra.";
    else if (ehPct && (valor < 0 || valor > 100)) novos.value = "O percentual deve ficar entre 0% e 100%.";
    else if (!ehPct && f.tipo && !(valor > 0)) novos.value = "O valor deve ser maior que zero.";
    if (ehEmbalagem && !f.embalagem) novos.packaging_emporio_product_id = "Escolha o produto de embalagem que sai do estoque.";
    if (Object.keys(novos).length > 0 || valor === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: f.nome.trim(),
      kind: f.tipo,
      value: valor,
      payment_kind: f.forma === QUALQUER ? null : f.forma,
      emporio_product_id: f.produto === QUALQUER ? null : f.produto,
      presentation_id: f.produto === QUALQUER || f.apresentacao === QUALQUER ? null : f.apresentacao,
      packaging_emporio_product_id: ehEmbalagem ? f.embalagem : null,
    };
    const res = regra
      ? await apiPatch(`/api/v1/emporio/variable-expense-rules/${regra.id}`, corpo)
      : await apiPost("/api/v1/emporio/variable-expense-rules", { establishment_id: f.loja, ...corpo });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(regra ? "Regra atualizada." : "Regra cadastrada.");
    setOpen(false);
    if (!regra) setF(inicial());
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        regra ? (
          <Button variant="outline" size="sm">
            Editar
          </Button>
        ) : (
          <Button>Nova regra</Button>
        )
      }
      title={regra ? "Editar regra" : "Nova regra do Vendeu, Pagou"}
      description="Vale para as vendas novas da loja. As vendas já feitas guardam a regra que valia na hora."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(inicial());
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={regra ? "Salvar regra" : "Cadastrar regra"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={f.loja}
            disabled={!!regra}
            onValueChange={(v) => {
              set({ loja: v });
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

      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name} hint="Ex: Comissão da vendedora, Entrega, Sacola.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={f.nome}
            maxLength={80}
            onChange={(e) => {
              set({ nome: e.target.value });
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <Field label="Cálculo" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select
            value={f.tipo}
            onValueChange={(v) => {
              set({ tipo: v });
              err.limparCampo("kind");
              err.limparCampo("value");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o cálculo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_REGRA_ROTULO).map(([k, nome]) => (
                <SelectItem key={k} value={k}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label={ehPct ? "Percentual" : ehEmbalagem ? "Quantidade por unidade vendida" : "Valor"}
        required
        id={err.idDe("value")}
        error={err.erros.value}
        hint={
          ehPct
            ? "Ex: 5 para 5% do valor da venda."
            : ehEmbalagem
              ? "Quanto da embalagem sai do estoque para cada unidade vendida, na unidade-base dela."
              : undefined
        }
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind={ehPct || ehEmbalagem ? "quantidade" : "dinheiro"}
            unit={ehPct ? "%" : undefined}
            value={f.valor}
            onValueChange={(v) => {
              set({ valor: v });
              err.limparCampo("value");
            }}
          />
        )}
      </Field>

      {ehEmbalagem && (
        <Field
          label="Produto de embalagem"
          required
          id={err.idDe("packaging_emporio_product_id")}
          error={err.erros.packaging_emporio_product_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={f.embalagem}
              onValueChange={(v) => {
                set({ embalagem: v });
                err.limparCampo("packaging_emporio_product_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <p className="text-sm font-medium text-texto">Só quando (opcional)</p>

      <Field label="Forma de pagamento" id={err.idDe("payment_kind")} error={err.erros.payment_kind}>
        {({ id, ...aria }) => (
          <Select
            value={f.forma}
            onValueChange={(v) => {
              set({ forma: v });
              err.limparCampo("payment_kind");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={QUALQUER}>Qualquer forma</SelectItem>
              {FORMAS.map((k) => (
                <SelectItem key={k} value={k}>
                  {FORMA_ROTULO[k] ?? k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Produto vendido" id={err.idDe("emporio_product_id")} error={err.erros.emporio_product_id}>
        {({ id, ...aria }) => (
          <Select
            value={f.produto}
            onValueChange={(v) => {
              set({ produto: v, apresentacao: QUALQUER });
              err.limparCampo("emporio_product_id");
              err.limparCampo("presentation_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={QUALQUER}>Qualquer produto</SelectItem>
              {produtos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {f.produto !== QUALQUER && (
        <Field label="Apresentação" id={err.idDe("presentation_id")} error={err.erros.presentation_id}>
          {({ id, ...aria }) => (
            <Select
              value={f.apresentacao}
              onValueChange={(v) => {
                set({ apresentacao: v });
                err.limparCampo("presentation_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={QUALQUER}>Qualquer apresentação</SelectItem>
                {apresentacoes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    </FormSheet>
  );
}
