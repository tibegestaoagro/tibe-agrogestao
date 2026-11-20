"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { apiPost } from "@/lib/client-api";
import { JANELA_DA_BAIXA_DIAS } from "@/lib/emporio/data-da-baixa";
import { diaDeHoje } from "./venda-estado";
import { CompletarChequeForm, type ChequeParaCompletar } from "./completar-cheque-form";

/**
 * As ações de um cheque da carteira, só as que valem para a situação dele:
 *
 * - na carteira (`recebido`): Depositar (OPERADOR para cima) e Voltou (dono ou administrador);
 * - depositado: Compensou e Voltou (dono ou administrador);
 * - incompleto: Completar no lugar de Depositar; completo na carteira: Corrigir
 *   (para quem pode completar).
 *
 * Quem decide o que cada perfil vê é a página de servidor (`podeDepositar`,
 * `ehAdmin`), porque este componente não pode importar as permissões. O
 * servidor reconfere de qualquer jeito.
 */
export function ChequeAcoes({
  chequeId,
  cheque,
  situacao,
  contas,
  podeDepositar,
  podeCompletar,
  ehAdmin,
  podeMudarData = false,
}: {
  /** Q371: só o Financeiro, o Gerente geral e o Dono escolhem a data da baixa. O servidor confere de novo. */
  podeMudarData?: boolean;
  chequeId: string;
  cheque: ChequeParaCompletar;
  situacao: string;
  contas: { id: string; name: string }[];
  podeDepositar: boolean;
  podeCompletar: boolean;
  ehAdmin: boolean;
}) {
  const numero = cheque.number ?? "sem número";
  const naCarteira = situacao === "recebido";
  const depositado = situacao === "depositado";
  const deposita = naCarteira && podeDepositar && !cheque.incomplete;
  const completa = naCarteira && podeCompletar;
  const acoes = deposita || completa || (ehAdmin && (naCarteira || depositado));
  if (!acoes) return <span className="text-sm text-texto-secundario">-</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {completa && <CompletarChequeForm cheque={cheque} />}
      {deposita && <DepositarCheque chequeId={chequeId} numero={numero} contas={contas} podeMudarData={podeMudarData} />}
      {depositado && ehAdmin && <CompensouCheque chequeId={chequeId} numero={numero} podeMudarData={podeMudarData} />}
      {ehAdmin && (naCarteira || depositado) && <VoltouCheque chequeId={chequeId} numero={numero} />}
    </div>
  );
}

// ----- Depositar -----

const ORDEM_DEPOSITO = ["bank_account_id", "deposited_on"] as const;

function DepositarCheque({
  chequeId,
  numero,
  contas,
  podeMudarData,
}: {
  chequeId: string;
  numero: string;
  contas: { id: string; name: string }[];
  podeMudarData: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_DEPOSITO, `deposita-${chequeId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conta, setConta] = useState("");
  const [depositadoEm, setDepositadoEm] = useState("");
  const hoje = diaDeHoje();

  async function submit() {
    if (!conta) {
      err.setGlobal(null);
      err.reprovar({ bank_account_id: "Escolha a conta onde o cheque foi depositado." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/checks/${chequeId}/deposit`, {
      bank_account_id: conta,
      ...(podeMudarData ? { deposited_on: depositadoEm || hoje } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`Cheque ${numero} depositado.`);
    setOpen(false);
    setDepositadoEm("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Depositar
        </Button>
      }
      title={`Depositar o cheque ${numero}`}
      description="O dinheiro só entra na conta quando o dono confirmar que o cheque compensou."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Depositar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Conta do depósito" required id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
        {({ id, ...aria }) => (
          <Select
            value={conta}
            onValueChange={(v) => {
              setConta(v);
              err.limparCampo("bank_account_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder={contas.length === 0 ? "Nenhuma conta cadastrada" : "Escolha a conta"} />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {podeMudarData && (
        <Field
          label="Data do depósito"
          id={err.idDe("deposited_on")}
          error={err.erros.deposited_on}
          hint={`Até ${JANELA_DA_BAIXA_DIAS} dias para trás ou para frente.`}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={depositadoEm || hoje}
              onChange={(e) => {
                setDepositadoEm(e.target.value);
                err.limparCampo("deposited_on");
              }}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}

// ----- Compensou -----

const ORDEM_COMPENSOU = ["cleared_on"] as const;

function CompensouCheque({ chequeId, numero, podeMudarData }: { chequeId: string; numero: string; podeMudarData: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_COMPENSOU, `compensou-${chequeId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [caiuEm, setCaiuEm] = useState("");
  const hoje = diaDeHoje();

  async function submit() {
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(
      `/api/v1/emporio/checks/${chequeId}/clear`,
      podeMudarData ? { cleared_on: caiuEm || hoje } : undefined,
    );
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    const dia = caiuEm || hoje;
    aviso.sucesso(
      podeMudarData && dia > hoje
        ? `Cheque ${numero} compensado: o dinheiro cai na conta em ${dia.split("-").reverse().join("/")}.`
        : `Cheque ${numero} compensado: o dinheiro entrou na conta.`,
    );
    setOpen(false);
    setCaiuEm("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Compensou</Button>}
      title={`Cheque ${numero} compensou?`}
      description="O valor entra como saldo na conta onde o cheque foi depositado. Confirme só depois de ver o dinheiro no extrato."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Sim, compensou"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {podeMudarData && (
        <Field
          label="Data em que caiu"
          id={err.idDe("cleared_on")}
          error={err.erros.cleared_on}
          hint={`Para o extrato bater com o do banco. Até ${JANELA_DA_BAIXA_DIAS} dias para trás ou para frente.`}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={caiuEm || hoje}
              onChange={(e) => {
                setCaiuEm(e.target.value);
                err.limparCampo("cleared_on");
              }}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}

// ----- Voltou -----

const ORDEM_VOLTOU = ["reason"] as const;

function VoltouCheque({ chequeId, numero }: { chequeId: string; numero: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_VOLTOU, `voltou-${chequeId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    if (!motivo.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga por que o cheque voltou." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/checks/${chequeId}/return`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`Cheque ${numero} marcado como devolvido. O cliente voltou a dever.`);
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Voltou
        </Button>
      }
      title={`O cheque ${numero} voltou`}
      description="O pagamento sai da venda e a dívida volta para o Fiado do cliente."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Marcar como devolvido"
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
            placeholder="Ex: sem fundos"
          />
        )}
      </Field>
    </FormSheet>
  );
}
