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
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { UNIDADE_BASE_SUFIXO, numeroBr, paraCampo } from "./formato";

export type ItemParaReceber = {
  id: string;
  product_name: string;
  base_unit: string;
  presentation_name: string | null;
  sent_qty: number;
};

/** 409 que não pertence a campo nenhum: a transferência mudou de situação enquanto o painel estava aberto. */
const CODIGOS_DE_AVISO = new Set(["TRANSFER_NOT_IN_TRANSIT", "TRANSFER_NOT_AWAITING", "FORBIDDEN", "NOT_FOUND"]);

const RESOLUCAO_ROTULO: Record<string, string> = {
  perda_no_caminho: "Perda no caminho",
  nao_enviada: "Não foi enviada",
};

const DICA_DA_RESOLUCAO =
  "Perda no caminho: a mercadoria saiu e não chegou, e a perda fica registrada. Não foi enviada: ela nunca saiu, e volta para o estoque da origem.";

/** Os campos de "o que aconteceu com a diferença", iguais ao receber e ao resolver. */
function CamposDaResolucao({
  err,
  resolucao,
  setResolucao,
  motivo,
  setMotivo,
}: {
  err: {
    erros: { resolution?: string; reason?: string };
    idDe: (campo: "resolution" | "reason") => string;
    limparCampo: (campo: "resolution" | "reason") => void;
  };
  resolucao: string;
  setResolucao: (v: string) => void;
  motivo: string;
  setMotivo: (v: string) => void;
}) {
  return (
    <>
      <Field
        label="O que aconteceu?"
        required
        id={err.idDe("resolution")}
        error={err.erros.resolution}
        hint={DICA_DA_RESOLUCAO}
      >
        {({ id, ...aria }) => (
          <Select
            value={resolucao}
            onValueChange={(v) => {
              setResolucao(v);
              err.limparCampo("resolution");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o que aconteceu" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RESOLUCAO_ROTULO).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            placeholder="Ex: caixa molhada no caminhão"
          />
        )}
      </Field>
    </>
  );
}

const ORDEM_REC = ["items", "resolution", "reason"] as const;

/**
 * Receber a transferência (F2b, Q74; F6b, Q130): "Chegou" já vem preenchido
 * com o enviado. Se algum item chegar menor, quem pode resolver (Gestor do
 * destino, Gerente geral, Dono) diz o que aconteceu e o motivo; quem não pode
 * deixa a diferença para o Gestor. Mais que o enviado o servidor também
 * recusa, mas a tela avisa antes.
 */
export function ReceberTransferenciaForm({
  transferenciaId,
  origem,
  itens,
  podeResolver,
}: {
  transferenciaId: string;
  origem: string;
  itens: ItemParaReceber[];
  /** Calculado no servidor: quem recebe pode resolver a diferença na hora? */
  podeResolver: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_REC, `rec-${transferenciaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const inicial = () => Object.fromEntries(itens.map((i) => [i.id, paraCampo(i.sent_qty)]));
  const [qtds, setQtds] = useState<Record<string, string>>(inicial);
  const [resolucao, setResolucao] = useState("");
  const [motivo, setMotivo] = useState("");

  function reiniciar() {
    setQtds(inicial());
    setResolucao("");
    setMotivo("");
    err.limparTudo();
  }

  const chegouMenos = itens.some((i) => {
    const q = lerNumeroBr(qtds[i.id] ?? "");
    return q !== null && q >= 0 && q < i.sent_qty;
  });

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM_REC)[number], string>> = {};
    const corpo: { item_id: string; received_qty: number }[] = [];
    for (const i of itens) {
      const q = lerNumeroBr(qtds[i.id] ?? "");
      if (q === null || q < 0) {
        novos.items = `Não consegui ler o que chegou de ${i.product_name}.`;
        break;
      }
      if (q > i.sent_qty) {
        novos.items = `${i.product_name}: não se aceita mais do que foi enviado (${numeroBr(i.sent_qty)}).`;
        break;
      }
      corpo.push({ item_id: i.id, received_qty: q });
    }
    // Resolução e motivo só são cobrados quando aparecem na tela.
    const resolve = chegouMenos && podeResolver;
    if (resolve && !resolucao) novos.resolution = "Diga o que aconteceu com a diferença.";
    if (resolve && !motivo.trim()) novos.reason = "Diga o motivo da diferença.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ status: string }>(`/api/v1/emporio/transfers/${transferenciaId}/receive`, {
      items: corpo,
      ...(resolve ? { resolution: resolucao, reason: motivo.trim() } : {}),
    });
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
    aviso.sucesso(
      res.data.status === "aguardando_gestor"
        ? "Recebimento registrado. A diferença vai para o Gestor da loja resolver."
        : "Transferência recebida: o estoque do destino foi atualizado.",
    );
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
              return (
                <div key={i.id} className="space-y-2 rounded-lg border border-borda p-3">
                  <p className="text-sm font-medium text-texto">
                    {i.product_name}
                    {i.presentation_name ? `, lacrado (${i.presentation_name})` : ""}
                  </p>
                  <p className="text-xs text-texto-secundario">
                    Enviado: {numeroBr(i.sent_qty)} {sufixo}
                  </p>
                  <p className="text-xs font-medium text-texto">Chegou</p>
                  <MoneyInput
                    kind="quantidade"
                    unit={sufixo}
                    aria-label={`Chegou de ${i.product_name}`}
                    value={qtds[i.id] ?? ""}
                    onValueChange={(v) => {
                      setQtds((a) => ({ ...a, [i.id]: v }));
                      err.limparCampo("items");
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Field>

      {chegouMenos &&
        (podeResolver ? (
          <CamposDaResolucao
            err={err}
            resolucao={resolucao}
            setResolucao={setResolucao}
            motivo={motivo}
            setMotivo={setMotivo}
          />
        ) : (
          <p className="rounded-md bg-atencao-suave p-3 text-sm text-atencao-tinta">
            A diferença vai para o Gestor da loja resolver.
          </p>
        ))}
    </FormSheet>
  );
}

const ORDEM_RES = ["resolution", "reason"] as const;

/**
 * Resolver a diferença de uma transferência `aguardando_gestor` (F6b, Q131).
 * A `operation_key` nasce com o painel e só troca depois de resolvido: reenviar
 * o mesmo painel (falha de rede) não resolve duas vezes.
 */
export function ResolverDiferencaForm({
  transferenciaId,
  origem,
  itens,
}: {
  transferenciaId: string;
  origem: string;
  /** Só os itens que chegaram menos, com o que chegou. */
  itens: { id: string; product_name: string; base_unit: string; sent_qty: number; received_qty: number }[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_RES, `res-${transferenciaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolucao, setResolucao] = useState("");
  const [motivo, setMotivo] = useState("");
  const chave = useRef<string | null>(null);

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM_RES)[number], string>> = {};
    if (!resolucao) novos.resolution = "Diga o que aconteceu com a diferença.";
    if (!motivo.trim()) novos.reason = "Diga o motivo da diferença.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/transfers/${transferenciaId}/resolve`, {
      operation_key: (chave.current ??= crypto.randomUUID()),
      resolution: resolucao,
      reason: motivo.trim(),
    });
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
    chave.current = null;
    aviso.sucesso("Diferença resolvida: a transferência foi concluída.");
    setOpen(false);
    setResolucao("");
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Resolver diferença</Button>}
      title="Resolver diferença"
      description={`Transferência de ${origem}. Chegou menos do que foi enviado.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Resolver"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <ul className="space-y-1 rounded-lg border border-borda p-3 text-sm text-texto">
        {itens.map((i) => {
          const sufixo = UNIDADE_BASE_SUFIXO[i.base_unit] ?? i.base_unit;
          return (
            <li key={i.id}>
              {i.product_name}: enviados {numeroBr(i.sent_qty)} {sufixo}, chegaram {numeroBr(i.received_qty)} {sufixo}
            </li>
          );
        })}
      </ul>
      <CamposDaResolucao
        err={err}
        resolucao={resolucao}
        setResolucao={setResolucao}
        motivo={motivo}
        setMotivo={setMotivo}
      />
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
