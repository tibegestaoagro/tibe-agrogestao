"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { UNIDADE_BASE_SUFIXO, numeroBr } from "./formato";

/**
 * "Produzir aqui" e "Cancelar produção" (F2b, Q43, Q72, Q78, Q79).
 *
 * A `operation_key` nasce com o primeiro envio e só troca depois de uma
 * produção gravada: reenviar depois de uma falha de rede devolve a mesma
 * produção em vez de baixar os componentes duas vezes.
 */

export type ProdutoParaProduzir = {
  id: string;
  name: string;
  base_unit: string;
  /** O produto separa lacrado de avulso (Q57). */
  separa: boolean;
  fechadas: { id: string; name: string }[];
};

export type ComposicaoParaProduzir = {
  reference_qty: number;
  yield_pct: number | null;
  items: { name: string; base_unit: string; quantity: number }[];
};

/** A mesma fórmula do contrato (Q72). Aqui é só prévia: quem baixa é o servidor. */
function baixaDe(quantity: number, produzido: number, c: ComposicaoParaProduzir): number {
  const fator = (c.yield_pct ?? 100) / 100;
  return Math.round(((quantity * produzido) / c.reference_qty / fator) * 1000) / 1000;
}

const ORDEM_PROD = ["produced_qty", "sealed", "components"] as const;
type CampoProd = (typeof ORDEM_PROD)[number];

const ILEGIVEL = "Não consegui ler esse número.";

export function ProduzirForm({
  loja,
  produto,
  composicao,
}: {
  loja: { id: string; name: string };
  produto: ProdutoParaProduzir;
  composicao: ComposicaoParaProduzir;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_PROD, `prod-${loja.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [sealed, setSealed] = useState<Record<string, string>>({});
  const sufixo = UNIDADE_BASE_SUFIXO[produto.base_unit] ?? produto.base_unit;
  const separa = produto.separa && produto.fechadas.length > 0;

  const produzido = lerNumeroBr(quantidade);
  const previa = produzido !== null && produzido > 0;

  function reiniciar() {
    setQuantidade("");
    setSealed({});
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<CampoProd, string>> = {};
    if (produzido === null || produzido <= 0) novos.produced_qty = "Informe quanto foi produzido.";

    const lista: { presentation_id: string; packages: number }[] = [];
    if (separa) {
      for (const f of produto.fechadas) {
        const bruto = sealed[f.id] ?? "";
        if (bruto.trim() === "") continue;
        const n = lerNumeroBr(bruto);
        if (n === null) {
          novos.sealed = ILEGIVEL;
          break;
        }
        if (!Number.isInteger(n) || n < 0) {
          novos.sealed = "Informe um número inteiro de embalagens.";
          break;
        }
        if (n > 0) lista.push({ presentation_id: f.id, packages: n });
      }
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/production", {
      operation_key: (chave.current ??= crypto.randomUUID()),
      establishment_id: loja.id,
      emporio_product_id: produto.id,
      produced_qty: produzido as number,
      ...(separa ? { sealed: lista } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      if (res.code === "COMPOSITION_REQUIRED") {
        aviso.erro(res.message);
        setOpen(false);
        router.refresh();
        return;
      }
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso("Produção registrada: os componentes foram baixados.");
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Produzir aqui
        </Button>
      }
      title="Produzir aqui"
      description={`${loja.name}. Os componentes saem do estoque desta loja e o produto entra pronto.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Depois de uma falha o rascunho fica, para a pessoa corrigir e reenviar com a mesma chave.
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar produção"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label={`Quantidade produzida (${sufixo})`}
        required
        id={err.idDe("produced_qty")}
        error={err.erros.produced_qty}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={sufixo}
            value={quantidade}
            onValueChange={(v) => {
              setQuantidade(v);
              err.limparCampo("produced_qty");
              err.limparCampo("components");
            }}
          />
        )}
      </Field>

      {separa && (
        <Field
          label="Embalagens fechadas"
          id={err.idDe("sealed")}
          error={err.erros.sealed}
          hint="Opcional. O que não virar embalagem entra como avulso."
        >
          {({ id, ...aria }) => (
            <div id={id} tabIndex={-1} {...aria} className="space-y-2">
              {produto.fechadas.map((f) => (
                <div key={f.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-texto">{f.name}</span>
                  <div className="w-28">
                    <MoneyInput
                      kind="quantidade"
                      unit="emb."
                      aria-label={`Embalagens de ${f.name}`}
                      id={`${id}-${f.id}`}
                      value={sealed[f.id] ?? ""}
                      onValueChange={(v) => {
                        setSealed((a) => ({ ...a, [f.id]: v }));
                        err.limparCampo("sealed");
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>
      )}

      <Field label="Baixa dos componentes (prévia)" id={err.idDe("components")} error={err.erros.components}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-1 rounded-lg border border-borda bg-superficie p-3 text-sm">
            {previa ? (
              <>
                {composicao.items.map((c) => (
                  <p key={c.name} className="flex justify-between gap-3 text-texto">
                    <span>{c.name}</span>
                    <span className="font-medium">
                      {numeroBr(baixaDe(c.quantity, produzido as number, composicao))}{" "}
                      {UNIDADE_BASE_SUFIXO[c.base_unit] ?? c.base_unit}
                    </span>
                  </p>
                ))}
                <p className="pt-1 text-xs text-texto-secundario">
                  Só uma prévia: o servidor recalcula ao gravar, pelo custo médio de cada componente.
                </p>
              </>
            ) : (
              <p className="text-texto-secundario">Informe a quantidade para ver o que será baixado.</p>
            )}
          </div>
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_CANC = ["reason"] as const;

/** Cancelar produção (OWNER e ADMIN, o servidor confere). Recusa 409 não pertence a campo: vai para o aviso. */
export function CancelarProducaoForm({ producaoId }: { producaoId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_CANC, `cprod-${producaoId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    if (!motivo.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga o motivo do cancelamento." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/production/${producaoId}/cancel`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      if (res.code === "INSUFFICIENT_STOCK" || res.code === "ALREADY_CANCELED" || res.code === "FORBIDDEN") {
        aviso.erro(res.message);
        setOpen(false);
        router.refresh();
        return;
      }
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Produção cancelada: os componentes voltaram ao estoque.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Cancelar produção
        </Button>
      }
      title="Cancelar produção"
      description="O produto sai do estoque e os componentes voltam. Nada é apagado."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar produção"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
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
            placeholder="Ex: lançada na loja errada"
          />
        )}
      </Field>
    </FormSheet>
  );
}
