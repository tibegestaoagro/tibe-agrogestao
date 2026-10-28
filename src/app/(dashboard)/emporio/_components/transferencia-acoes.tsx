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
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { MOTIVO_PERDA_ROTULO, UNIDADE_BASE_SUFIXO, numeroBr, paraCampo } from "./formato";

export type ItemParaReceber = {
  id: string;
  product_name: string;
  base_unit: string;
  presentation_name: string | null;
  sent_qty: number;
};

/** 409 que não pertence a campo nenhum: a transferência mudou de situação enquanto o painel estava aberto. */
const CODIGOS_DE_AVISO = new Set(["TRANSFER_NOT_IN_TRANSIT", "FORBIDDEN", "NOT_FOUND"]);

const ORDEM_REC = ["items"] as const;

/**
 * Receber a transferência (F2b, Q74): quantidade recebida já preenchida com a
 * enviada. Se diminuir, o motivo aparece e é obrigatório. Mais que o enviado o
 * servidor também recusa, mas a tela avisa antes.
 */
export function ReceberTransferenciaForm({
  transferenciaId,
  origem,
  itens,
}: {
  transferenciaId: string;
  origem: string;
  itens: ItemParaReceber[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_REC, `rec-${transferenciaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const inicial = () => Object.fromEntries(itens.map((i) => [i.id, paraCampo(i.sent_qty)]));
  const [qtds, setQtds] = useState<Record<string, string>>(inicial);
  const [motivos, setMotivos] = useState<Record<string, string>>({});

  function reiniciar() {
    setQtds(inicial());
    setMotivos({});
    err.limparTudo();
  }

  async function submit() {
    let msg: string | null = null;
    const corpo: { item_id: string; received_qty: number; loss_reason: string | null }[] = [];
    for (const i of itens) {
      const q = lerNumeroBr(qtds[i.id] ?? "");
      if (q === null || q < 0) {
        msg = `Não consegui ler a quantidade recebida de ${i.product_name}.`;
        break;
      }
      if (q > i.sent_qty) {
        msg = `${i.product_name}: não se aceita mais do que foi enviado (${numeroBr(i.sent_qty)}).`;
        break;
      }
      const falta = q < i.sent_qty;
      if (falta && !motivos[i.id]) {
        msg = `${i.product_name}: chegou menos do que foi enviado, escolha o motivo.`;
        break;
      }
      corpo.push({ item_id: i.id, received_qty: q, loss_reason: falta ? motivos[i.id] : null });
    }
    if (msg) {
      err.setGlobal(null);
      err.reprovar({ items: msg });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/transfers/${transferenciaId}/receive`, { items: corpo });
    setLoading(false);
    if (!res.ok) {
      if (CODIGOS_DE_AVISO.has(res.code)) {
        aviso.erro(res.message);
        setOpen(false);
        router.refresh();
        return;
      }
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Transferência recebida: o estoque do destino foi atualizado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Receber</Button>}
      title="Receber transferência"
      description={`Veio de ${origem}. Confira o que chegou de cada item.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reiniciar();
        else err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Confirmar recebimento"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que chegou" required id={err.idDe("items")} error={err.erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            {itens.map((i) => {
              const sufixo = UNIDADE_BASE_SUFIXO[i.base_unit] ?? i.base_unit;
              const q = lerNumeroBr(qtds[i.id] ?? "");
              const menos = q !== null && q >= 0 && q < i.sent_qty;
              return (
                <div key={i.id} className="space-y-2 rounded-lg border border-borda p-3">
                  <p className="text-sm font-medium text-texto">
                    {i.product_name}
                    {i.presentation_name ? `, lacrado (${i.presentation_name})` : ""}
                  </p>
                  <p className="text-xs text-texto-secundario">
                    Enviado: {numeroBr(i.sent_qty)} {sufixo}
                  </p>
                  <MoneyInput
                    kind="quantidade"
                    unit={sufixo}
                    aria-label={`Recebido de ${i.product_name}`}
                    value={qtds[i.id] ?? ""}
                    onValueChange={(v) => {
                      setQtds((a) => ({ ...a, [i.id]: v }));
                      err.limparCampo("items");
                    }}
                  />
                  {menos && (
                    <Select
                      value={motivos[i.id] ?? ""}
                      onValueChange={(v) => {
                        setMotivos((a) => ({ ...a, [i.id]: v }));
                        err.limparCampo("items");
                      }}
                    >
                      <SelectTrigger aria-label={`Motivo da diferença de ${i.product_name}`}>
                        <SelectValue placeholder="Motivo da diferença" />
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
                </div>
              );
            })}
          </div>
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_CANC = ["reason"] as const;

/** Cancelar a transferência em trânsito: a origem recupera o saldo. */
export function CancelarTransferenciaForm({ transferenciaId }: { transferenciaId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_CANC, `canc-${transferenciaId}`);
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
    const res = await apiPost(`/api/v1/emporio/transfers/${transferenciaId}/cancel`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      if (CODIGOS_DE_AVISO.has(res.code)) {
        aviso.erro(res.message);
        setOpen(false);
        router.refresh();
        return;
      }
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Transferência cancelada: a mercadoria voltou para a origem.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Cancelar
        </Button>
      }
      title="Cancelar transferência"
      description="A mercadoria volta para o estoque da origem. Nada é apagado."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar transferência"
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
            placeholder="Ex: enviado para a loja errada"
          />
        )}
      </Field>
    </FormSheet>
  );
}
