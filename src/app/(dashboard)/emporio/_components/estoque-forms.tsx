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
import { useAviso } from "@/components/ui/toast";
import { apiPost, apiPut } from "@/lib/client-api";
import { lerOpcional, paraCampo, MOTIVO_PERDA_ROTULO, UNIDADE_BASE_SUFIXO } from "./formato";

/**
 * Os quatro painéis de estoque do produto numa loja (F2a, Q60 a Q66).
 *
 * Cada loja da tela do produto renderiza os seus, então todo painel leva
 * `prefixoDeId` com o id da loja: sem ele, "quantity" e "reason" se repetiriam
 * no DOM e o foco da recusa cairia no painel de outra loja.
 */

export type ProdutoParaEstoque = {
  id: string;
  base_unit: string;
  /** O produto separa lacrado de avulso (Q57). */
  separa: boolean;
  /** Apresentações fechadas ativas: é o que o lacrado conta. */
  fechadas: { id: string; name: string }[];
};

export type LojaParaEstoque = {
  id: string;
  name: string;
  /** Embalagens fechadas hoje, por apresentação (para pré-preencher a contagem). */
  lacrado: Record<string, number>;
  avulso: number;
  min_qty: number | null;
  max_qty: number | null;
};

function lerInteiroOpcional(bruto: string): number | null | "invalido" {
  const n = lerOpcional(bruto);
  if (n === "invalido") return "invalido";
  if (n !== null && !Number.isInteger(n)) return "invalido";
  return n;
}

const ILEGIVEL = "Não consegui ler esse número.";
const INTEIRO = "Informe um número inteiro de embalagens.";

/** Lê as caixas de embalagens e devolve a lista pronta, ou o erro do bloco. */
function lerLacrado(
  fechadas: { id: string }[],
  valores: Record<string, string>,
  incluirZero: boolean,
): { ok: true; sealed: { presentation_id: string; packages: number }[] } | { ok: false; msg: string } {
  const sealed: { presentation_id: string; packages: number }[] = [];
  for (const f of fechadas) {
    const bruto = valores[f.id] ?? "";
    const n = lerInteiroOpcional(bruto);
    if (n === "invalido") return { ok: false, msg: bruto.trim() && lerOpcional(bruto) !== "invalido" ? INTEIRO : ILEGIVEL };
    if (n === null) continue;
    if (n === 0 && !incluirZero) continue;
    sealed.push({ presentation_id: f.id, packages: n });
  }
  return { ok: true, sealed };
}

type AriaDoCampo = {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
};

function BlocoLacrado({
  id,
  fechadas,
  valores,
  onChange,
  aria,
}: {
  id: string;
  fechadas: { id: string; name: string }[];
  valores: Record<string, string>;
  onChange: (presentationId: string, v: string) => void;
  aria: AriaDoCampo;
}) {
  if (fechadas.length === 0) {
    return (
      <p id={id} tabIndex={-1} {...aria} className="text-sm text-texto-secundario">
        Cadastre uma apresentação fechada para contar o lacrado.
      </p>
    );
  }
  return (
    <div id={id} tabIndex={-1} {...aria} className="space-y-2">
      {fechadas.map((f) => (
        <div key={f.id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm text-texto">{f.name}</span>
          <div className="w-28">
            <MoneyInput
              kind="quantidade"
              unit="emb."
              aria-label={`Embalagens de ${f.name}`}
              id={`${id}-${f.id}`}
              value={valores[f.id] ?? ""}
              onValueChange={(v) => onChange(f.id, v)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estoque inicial
// ---------------------------------------------------------------------------

const ORDEM_IMPL = ["sealed", "loose_qty", "unit_cost"] as const;
type CampoImpl = (typeof ORDEM_IMPL)[number];

export function ImplantarForm({ loja, produto }: { loja: LojaParaEstoque; produto: ProdutoParaEstoque }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_IMPL, `impl-${loja.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sealed, setSealed] = useState<Record<string, string>>({});
  const [solto, setSolto] = useState("");
  const [custo, setCusto] = useState("");
  const sufixo = UNIDADE_BASE_SUFIXO[produto.base_unit] ?? produto.base_unit;

  function reiniciar() {
    setSealed({});
    setSolto("");
    setCusto("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoImpl, string>> = {};
    let lista: { presentation_id: string; packages: number }[] = [];
    if (produto.separa) {
      const l = lerLacrado(produto.fechadas, sealed, false);
      if (!l.ok) novos.sealed = l.msg;
      else lista = l.sealed;
    }
    const q = lerOpcional(solto);
    if (q === "invalido") novos.loose_qty = ILEGIVEL;
    const c = lerOpcional(custo);
    if (c === "invalido") novos.unit_cost = ILEGIVEL;
    if (Object.keys(novos).length === 0 && lista.length === 0 && !q) {
      novos.loose_qty = "Informe a quantidade do estoque inicial.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/stock/implantation", {
      establishment_id: loja.id,
      emporio_product_id: produto.id,
      ...(produto.separa ? { sealed: lista } : {}),
      loose_qty: (q as number | null) ?? 0,
      unit_cost: c as number | null,
    });
    setLoading(false);
    if (!res.ok) {
      if (res.code === "ALREADY_IMPLANTED") {
        // Outra pessoa lançou antes: avisa, fecha e relê a página, que então esconde a opção.
        aviso.erro(res.message);
        setOpen(false);
        router.refresh();
        return;
      }
      err.doServidor(res);
      return;
    }
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Estoque inicial
        </Button>
      }
      title="Estoque inicial"
      description={`${loja.name}. Só vale uma vez por produto e loja; depois, use Contar estoque.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Gravar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {produto.separa && (
        <Field
          label="Lacrado (embalagens fechadas)"
          id={err.idDe("sealed")}
          error={err.erros.sealed}
          hint="Quantas embalagens fechadas de cada apresentação."
        >
          {({ id, ...aria }) => (
            <BlocoLacrado
              id={id}
              aria={aria}
              fechadas={produto.fechadas}
              valores={sealed}
              onChange={(pid, v) => {
                setSealed((a) => ({ ...a, [pid]: v }));
                err.limparCampo("sealed");
              }}
            />
          )}
        </Field>
      )}

      <Field
        label={produto.separa ? `Avulso (${sufixo})` : `Quantidade (${sufixo})`}
        id={err.idDe("loose_qty")}
        error={err.erros.loose_qty}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={solto}
            onValueChange={(v) => {
              setSolto(v);
              err.limparCampo("loose_qty");
            }}
          />
        )}
      </Field>

      <Field
        label={`Custo por ${sufixo} (R$)`}
        id={err.idDe("unit_cost")}
        error={err.erros.unit_cost}
        hint="Em branco, o saldo fica marcado como estimado."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={custo}
            onValueChange={(v) => {
              setCusto(v);
              err.limparCampo("unit_cost");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Contagem
// ---------------------------------------------------------------------------

const ORDEM_CONT = ["sealed", "loose_qty", "reason"] as const;
type CampoCont = (typeof ORDEM_CONT)[number];

export function ContagemForm({ loja, produto }: { loja: LojaParaEstoque; produto: ProdutoParaEstoque }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_CONT, `cont-${loja.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sufixo = UNIDADE_BASE_SUFIXO[produto.base_unit] ?? produto.base_unit;

  const inicialLacrado = () =>
    Object.fromEntries(produto.fechadas.map((f) => [f.id, paraCampo(loja.lacrado[f.id] ?? 0)]));
  const [sealed, setSealed] = useState<Record<string, string>>(inicialLacrado);
  const [solto, setSolto] = useState(paraCampo(loja.avulso));
  const [motivo, setMotivo] = useState("");

  function reiniciar() {
    setSealed(inicialLacrado());
    setSolto(paraCampo(loja.avulso));
    setMotivo("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoCont, string>> = {};
    let lista: { presentation_id: string; packages: number }[] = [];
    if (produto.separa) {
      const l = lerLacrado(produto.fechadas, sealed, true);
      if (!l.ok) novos.sealed = l.msg;
      else lista = l.sealed;
    }
    const q = lerOpcional(solto);
    if (q === "invalido") novos.loose_qty = ILEGIVEL;
    else if (q === null) novos.loose_qty = "Informe quanto existe agora (zero, se acabou).";
    if (!motivo.trim()) novos.reason = "Diga o motivo da contagem.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/stock/count", {
      establishment_id: loja.id,
      emporio_product_id: produto.id,
      ...(produto.separa ? { sealed: lista } : {}),
      loose_qty: q as number,
      reason: motivo.trim(),
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
          Contar estoque
        </Button>
      }
      title="Contar estoque"
      description={`${loja.name}. Informe o que existe de verdade; o sistema ajusta a diferença.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reiniciar();
        else err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Gravar contagem"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {produto.separa && (
        <Field
          label="Lacrado (embalagens fechadas)"
          id={err.idDe("sealed")}
          error={err.erros.sealed}
          hint="Zero diz que acabou."
        >
          {({ id, ...aria }) => (
            <BlocoLacrado
              id={id}
              aria={aria}
              fechadas={produto.fechadas}
              valores={sealed}
              onChange={(pid, v) => {
                setSealed((a) => ({ ...a, [pid]: v }));
                err.limparCampo("sealed");
              }}
            />
          )}
        </Field>
      )}

      <Field
        label={produto.separa ? `Avulso (${sufixo})` : `Quantidade (${sufixo})`}
        required
        id={err.idDe("loose_qty")}
        error={err.erros.loose_qty}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={solto}
            onValueChange={(v) => {
              setSolto(v);
              err.limparCampo("loose_qty");
            }}
          />
        )}
      </Field>

      <Field label="Motivo" required id={err.idDe("reason")} error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
            placeholder="Ex: contagem de sexta"
          />
        )}
      </Field>
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Perda
// ---------------------------------------------------------------------------

// Ordem visual: estado, apresentação, quantidade, motivo, observação.
const ORDEM_PERDA = ["package_state", "presentation_id", "quantity", "reason", "notes"] as const;
type CampoPerda = (typeof ORDEM_PERDA)[number];

export function PerdaForm({ loja, produto }: { loja: LojaParaEstoque; produto: ProdutoParaEstoque }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_PERDA, `perda-${loja.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sufixo = UNIDADE_BASE_SUFIXO[produto.base_unit] ?? produto.base_unit;

  const [estado, setEstado] = useState<"lacrado" | "avulso">("avulso");
  const [apresentacao, setApresentacao] = useState(produto.fechadas[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  const lacrado = produto.separa && estado === "lacrado";

  function reiniciar() {
    setEstado("avulso");
    setApresentacao(produto.fechadas[0]?.id ?? "");
    setQuantidade("");
    setMotivo("");
    setObs("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoPerda, string>> = {};
    // Campo que some da tela não é cobrado: a apresentação só vale no lacrado.
    if (lacrado && !apresentacao) novos.presentation_id = "Escolha a apresentação que se perdeu.";
    const q = lerOpcional(quantidade);
    if (q === "invalido") novos.quantity = ILEGIVEL;
    else if (q === null || q <= 0) novos.quantity = "Informe quanto se perdeu.";
    else if (lacrado && !Number.isInteger(q)) novos.quantity = INTEIRO;
    if (!motivo) novos.reason = "Escolha o motivo.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/stock/loss", {
      establishment_id: loja.id,
      emporio_product_id: produto.id,
      package_state: produto.separa ? estado : null,
      presentation_id: lacrado ? apresentacao : null,
      quantity: q as number,
      reason: motivo,
      notes: obs.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Registrar perda
        </Button>
      }
      title="Registrar perda"
      description={`${loja.name}. A perda sai do estoque pelo custo médio do momento.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {produto.separa && (
        <Field label="O que se perdeu" id={err.idDe("package_state")} error={err.erros.package_state}>
          {({ id, ...aria }) => (
            <Select
              value={estado}
              onValueChange={(v) => {
                setEstado(v === "lacrado" ? "lacrado" : "avulso");
                err.limparCampo("package_state");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avulso">Avulso</SelectItem>
                <SelectItem value="lacrado">Embalagem fechada</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {lacrado && (
        <Field label="Apresentação" required id={err.idDe("presentation_id")} error={err.erros.presentation_id}>
          {({ id, ...aria }) => (
            <Select
              value={apresentacao}
              onValueChange={(v) => {
                setApresentacao(v);
                err.limparCampo("presentation_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {produto.fechadas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field
        label={lacrado ? "Quantidade (embalagens)" : `Quantidade (${sufixo})`}
        required
        id={err.idDe("quantity")}
        error={err.erros.quantity}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={lacrado ? "emb." : sufixo}
            value={quantidade}
            onValueChange={(v) => {
              setQuantidade(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      <Field label="Motivo" required id={err.idDe("reason")} error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Select
            value={motivo}
            onValueChange={(v) => {
              setMotivo(v);
              err.limparCampo("reason");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOTIVO_PERDA_ROTULO).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              err.limparCampo("notes");
            }}
            placeholder="Ex: saco rasgado"
          />
        )}
      </Field>
    </FormSheet>
  );
}

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

const ORDEM_LIM = ["min_qty", "max_qty"] as const;
type CampoLim = (typeof ORDEM_LIM)[number];

export function LimitesForm({ loja, produto }: { loja: LojaParaEstoque; produto: ProdutoParaEstoque }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM_LIM, `lim-${loja.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sufixo = UNIDADE_BASE_SUFIXO[produto.base_unit] ?? produto.base_unit;
  const [min, setMin] = useState(paraCampo(loja.min_qty));
  const [max, setMax] = useState(paraCampo(loja.max_qty));

  function reiniciar() {
    setMin(paraCampo(loja.min_qty));
    setMax(paraCampo(loja.max_qty));
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoLim, string>> = {};
    const a = lerOpcional(min);
    const b = lerOpcional(max);
    if (a === "invalido") novos.min_qty = ILEGIVEL;
    if (b === "invalido") novos.max_qty = ILEGIVEL;
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPut("/api/v1/emporio/stock/limits", {
      establishment_id: loja.id,
      emporio_product_id: produto.id,
      min_qty: a as number | null,
      max_qty: b as number | null,
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
          Limites
        </Button>
      }
      title="Mínimo e máximo"
      description={`${loja.name}, em ${sufixo}. Em branco, não há limite.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reiniciar();
        else err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label={`Mínimo (${sufixo})`}
        id={err.idDe("min_qty")}
        error={err.erros.min_qty}
        hint="Com saldo igual ou abaixo disso, o produto aparece em Precisa repor."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={min}
            onValueChange={(v) => {
              setMin(v);
              err.limparCampo("min_qty");
            }}
          />
        )}
      </Field>

      <Field label={`Máximo (${sufixo})`} id={err.idDe("max_qty")} error={err.erros.max_qty}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={max}
            onValueChange={(v) => {
              setMax(v);
              err.limparCampo("max_qty");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
