"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { DevolucaoItens, montarDevolvidos, type EscolhaDevolucao, type ItemDevolvivel } from "./devolucao-itens";
import { VendaCampos } from "./venda-campos";
import { useVenda, type CampoDaVenda, type PrecosVenda, type ProdutoVenda } from "./venda-estado";

// Ordem visual, de cima para baixo. Na troca o servidor recusa os itens
// devolvidos em `items_devolvidos` e os da venda nova em `items`.
const ORDEM = ["items_devolvidos", "amount", "items", "contact_id", "payments", "reason"] as const;
type Campo = (typeof ORDEM)[number];

const VAZIA: EscolhaDevolucao = { qtds: {}, avarias: {} };

/**
 * Troca: devolução mais venda nova, numa operação só. A venda nova usa o mesmo
 * formulário do balcão (`VendaCampos`), com a loja da venda de origem, e o
 * valor devolvido abate o que o cliente paga (o excesso sai da gaveta).
 */
export function TrocarForm({
  vendaId,
  lojaId,
  lojaNome,
  itensDevolviveis,
  produtos,
  precos,
  contatos,
  contatoId,
}: {
  vendaId: string;
  lojaId: string;
  lojaNome: string;
  itensDevolviveis: ItemDevolvivel[];
  produtos: ProdutoVenda[];
  precos: PrecosVenda;
  contatos: { id: string; name: string }[];
  contatoId: string | null;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "troca-venda");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [escolha, setEscolha] = useState<EscolhaDevolucao>(VAZIA);
  const [motivo, setMotivo] = useState("");

  const devolvidos = montarDevolvidos(itensDevolviveis, escolha);
  const devolvidoCent = devolvidos.ok ? devolvidos.totalCent : 0;
  const v = useVenda({
    produtos,
    precos,
    lojaInicial: lojaId,
    contatoInicial: contatoId ?? "",
    abatimentoCent: devolvidoCent,
  });

  async function submit() {
    const m = v.montar(false);
    const novos: Partial<Record<Campo, string>> = {};
    if (!devolvidos.ok) novos.items_devolvidos = devolvidos.erro;
    if (m.novos.items) novos.items = m.novos.items;
    if (m.novos.contact_id) novos.contact_id = m.novos.contact_id;
    if (m.novos.payments) novos.payments = m.novos.payments;
    if (Object.keys(novos).length > 0 || !devolvidos.ok || !m.corpo) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([devolvidos.itens, m.assinatura, motivo.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/sales/${vendaId}/exchange`, {
      operation_key: chave.current.key,
      items_devolvidos: devolvidos.itens,
      reason: motivo.trim() || null,
      venda: m.corpo,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso("Troca registrada.");
    setOpen(false);
    setEscolha(VAZIA);
    setMotivo("");
    v.reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Trocar</Button>}
      title="Trocar mercadoria"
      description={`Devolução na ${lojaNome} e venda nova, juntas. O valor devolvido abate o que o cliente paga.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar troca"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que o cliente devolve" required id={err.idDe("items_devolvidos")} error={err.erros.items_devolvidos}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria}>
            <DevolucaoItens
              itens={itensDevolviveis}
              escolha={escolha}
              aoMudar={(nova) => {
                setEscolha(nova);
                err.limparCampo("items_devolvidos");
                err.limparCampo("amount");
              }}
            />
          </div>
        )}
      </Field>

      <Field label="Valor devolvido" id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-lg font-semibold text-texto">
            {reaisBr(devolvidoCent / 100)}
          </p>
        )}
      </Field>

      <VendaCampos
        v={v}
        produtos={produtos}
        lojas={[]}
        contatos={contatos}
        erros={err.erros}
        idDe={(c: CampoDaVenda) => (c === "establishment_id" ? c : err.idDe(c))}
        limpar={(c: CampoDaVenda) => {
          if (c !== "establishment_id") err.limparCampo(c);
        }}
        lojaFixa
      />

      <Field label="Motivo da troca" id={err.idDe("reason")} error={err.erros.reason} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
