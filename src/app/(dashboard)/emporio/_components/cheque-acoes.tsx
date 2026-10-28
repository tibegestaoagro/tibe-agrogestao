"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

/**
 * As ações de um cheque da carteira, só as que valem para a situação dele:
 *
 * - na carteira (`recebido`): Depositar (OPERADOR para cima) e Voltou (dono ou administrador);
 * - depositado: Compensou e Voltou (dono ou administrador).
 *
 * Quem decide o que cada perfil vê é a página de servidor (`podeDepositar`,
 * `ehAdmin`), porque este componente não pode importar as permissões. O
 * servidor reconfere de qualquer jeito.
 */
export function ChequeAcoes({
  chequeId,
  numero,
  situacao,
  contas,
  podeDepositar,
  ehAdmin,
}: {
  chequeId: string;
  numero: string;
  situacao: string;
  contas: { id: string; name: string }[];
  podeDepositar: boolean;
  ehAdmin: boolean;
}) {
  const naCarteira = situacao === "recebido";
  const depositado = situacao === "depositado";
  const acoes = (naCarteira && podeDepositar) || (ehAdmin && (naCarteira || depositado));
  if (!acoes) return <span className="text-sm text-texto-secundario">-</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {naCarteira && podeDepositar && <DepositarCheque chequeId={chequeId} numero={numero} contas={contas} />}
      {depositado && ehAdmin && <CompensouCheque chequeId={chequeId} numero={numero} />}
      {ehAdmin && (naCarteira || depositado) && <VoltouCheque chequeId={chequeId} numero={numero} />}
    </div>
  );
}

// ----- Depositar -----

const ORDEM_DEPOSITO = ["bank_account_id"] as const;

function DepositarCheque({
  chequeId,
  numero,
  contas,
}: {
  chequeId: string;
  numero: string;
  contas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_DEPOSITO, `deposita-${chequeId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conta, setConta] = useState("");

  async function submit() {
    if (!conta) {
      err.setGlobal(null);
      err.reprovar({ bank_account_id: "Escolha a conta onde o cheque foi depositado." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/checks/${chequeId}/deposit`, { bank_account_id: conta });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`Cheque ${numero} depositado.`);
    setOpen(false);
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
    </FormSheet>
  );
}

// ----- Compensou -----

/** Sem campo para preencher: a confirmação é um diálogo, e a recusa vai para o aviso. */
function CompensouCheque({ chequeId, numero }: { chequeId: string; numero: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function compensar() {
    const res = await apiPost(`/api/v1/emporio/checks/${chequeId}/clear`);
    if (res.ok) {
      aviso.sucesso(`Cheque ${numero} compensado: o dinheiro entrou na conta.`);
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <ConfirmDialog
      gatilho={<Button size="sm">Compensou</Button>}
      titulo={`Cheque ${numero} compensou?`}
      descricao="O valor entra como saldo na conta onde o cheque foi depositado. Confirme só depois de ver o dinheiro no extrato."
      rotuloConfirmar="Sim, compensou"
      destrutivo={false}
      aoConfirmar={compensar}
    />
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
