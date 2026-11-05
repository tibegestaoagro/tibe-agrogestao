"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { CaixaDaOperacao } from "./caixa-da-operacao";
import { abertosDaLoja, caixaInicial, type CaixaDaLoja } from "./caixas-da-loja";

// Ordem visual, de cima para baixo.
const ORDEM = ["reason", "cash_register_id"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Cancelar a venda inteira (só OWNER e ADMIN, o servidor confere). Desfaz a
 * baixa do estoque e devolve ao caixa o que entrou; nada é apagado. A recusa
 * sem campo (já cancelada, tem devolução, é de troca) cai no rodapé do painel.
 */
export function CancelarVendaForm({
  vendaId,
  lojaId,
  devolveDinheiro,
  caixas,
  usuarioId,
}: {
  vendaId: string;
  lojaId: string;
  /** A venda teve dinheiro na gaveta: só então o cancelamento mexe no caixa. */
  devolveDinheiro: boolean;
  caixas: CaixaDaLoja[];
  usuarioId: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "cancela-venda");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");
  const abertos = abertosDaLoja(caixas, lojaId);
  const [caixa, setCaixa] = useState(() => caixaInicial(abertos, usuarioId));
  const mostrarCaixa = devolveDinheiro && (abertos.length !== 1 || !!err.erros.cash_register_id);

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!motivo.trim()) novos.reason = "Diga o motivo do cancelamento.";
    if (devolveDinheiro && abertos.length > 1 && !caixa) novos.cash_register_id = "Escolha o caixa de onde sai o dinheiro.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/sales/${vendaId}/cancel`, {
      reason: motivo.trim(),
      cash_register_id: devolveDinheiro && caixa ? caixa : null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Venda cancelada.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Cancelar venda
        </Button>
      }
      title="Cancelar venda"
      description="A mercadoria volta ao estoque e o dinheiro recebido sai do caixa. A venda continua no histórico."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar venda"
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
            placeholder="Ex: cliente desistiu na hora"
          />
        )}
      </Field>

      {mostrarCaixa && (
        <Field
          label="Caixa de onde sai o dinheiro"
          required={abertos.length > 1}
          id={err.idDe("cash_register_id")}
          error={err.erros.cash_register_id}
        >
          {({ id, ...aria }) => (
            <CaixaDaOperacao
              id={id}
              aria={aria}
              abertos={abertos}
              valor={caixa}
              aoMudar={(v) => {
                setCaixa(v);
                err.limparCampo("cash_register_id");
              }}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}
