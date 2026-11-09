"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AntecipacaoView } from "@/lib/actions/emporio-antecipacao";
import type { CartaoAReceberView } from "@/lib/actions/emporio-financeiro";
import { apiPost } from "@/lib/client-api";
import { ROTULO_DA_BANDEIRA, type Bandeira } from "@/lib/emporio/cartao";
import { dataBr, hojeEmBrasilia } from "@/lib/emporio/datas";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { pctBr } from "./formato";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["receivable_ids", "operated_on", "received_net"] as const;
type Campo = (typeof ORDEM)[number];

const DIA_MS = 86_400_000;
const emMs = (dia: string) => Date.parse(`${dia.slice(0, 10)}T00:00:00Z`);
const cent = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

/**
 * "Cartões a receber" e "Antecipações" (Q262, Q265). Marca as parcelas futuras de
 * uma mesma conta, abre o painel da operação e mostra as operações já feitas, com
 * "Desfazer" quando o servidor diz que dá.
 */
export function CartoesAReceber({
  cards,
  antecipacoes,
  lojasQueAntecipam,
}: {
  cards: CartaoAReceberView[];
  antecipacoes: AntecipacaoView[];
  /** As lojas em que quem lê pode antecipar (a conta toda traz todas). */
  lojasQueAntecipam: string[];
}) {
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const totalCartoes = cards.reduce((s, p) => s + Math.round(p.effective_net * 100), 0) / 100;
  const podeMarcar = (p: CartaoAReceberView) =>
    !p.anticipated && !p.received && lojasQueAntecipam.includes(p.establishment_id);
  const selecionadas = cards.filter((p) => marcadas.includes(p.id));
  const contas = new Set(selecionadas.map((p) => p.bank_account_id));
  const mesmaConta = contas.size <= 1;

  function alternar(id: string) {
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Cartões a receber</h2>
        {cards.length === 0 ? (
          <EmptyState titulo="Nada a receber do cartão">
            As parcelas das vendas no cartão que ainda não caíram aparecem aqui, por data.
          </EmptyState>
        ) : (
          <>
            {cards.some(podeMarcar) && (
              <div className="flex flex-wrap items-center gap-3">
                <AnteciparForm
                  parcelas={selecionadas}
                  desabilitado={selecionadas.length === 0 || !mesmaConta}
                  aoConcluir={() => setMarcadas([])}
                />
                {selecionadas.length === 0 && (
                  <span className="text-sm text-texto-secundario">Marque as parcelas que a adquirente vai antecipar.</span>
                )}
                {selecionadas.length > 0 && !mesmaConta && (
                  <span className="text-sm text-atencao-tinta">
                    Marque parcelas de uma conta só: cada adquirente paga na sua conta.
                  </span>
                )}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Antecipar</span>
                  </TableHead>
                  <TableHead>Cai em</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Adquirente</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Líquido</TableHead>
                  <TableHead>Venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {podeMarcar(p) && (
                        <input
                          type="checkbox"
                          aria-label={`Antecipar a parcela ${p.installment}/${p.installments} de ${dataBr(p.expected_on)}`}
                          checked={marcadas.includes(p.id)}
                          onChange={() => alternar(p.id)}
                          className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {dataBr(p.effective_on)}
                      {p.received && (
                        <Badge variant="green" className="ml-2">
                          Hoje
                        </Badge>
                      )}
                      {p.anticipated && (
                        <span className="block text-xs text-texto-secundario">
                          antecipada em {dataBr(p.effective_on).slice(0, 5)} (previsto {dataBr(p.expected_on)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{p.establishment_name}</TableCell>
                    <TableCell>{p.bank_account_name}</TableCell>
                    <TableCell>
                      {p.brand && p.brand !== "qualquer" ? ROTULO_DA_BANDEIRA[p.brand as Bandeira] : "-"}
                    </TableCell>
                    <TableCell>{p.acquirer_name ?? "-"}</TableCell>
                    <TableCell>
                      {p.installment}/{p.installments}
                    </TableCell>
                    <TableCell>
                      {reaisBr(p.effective_net)}
                      {p.anticipated && (
                        <Badge variant="blue" className="ml-2">
                          Antecipada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/emporio/vendas/${p.sale_id}`} className="font-medium text-texto-marca hover:underline">
                        Ver a venda
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm text-texto">
              Total a receber: <strong>{reaisBr(totalCartoes)}</strong>
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Antecipações</h2>
        {antecipacoes.length === 0 ? (
          <EmptyState titulo="Nenhuma antecipação registrada">
            As operações em que a adquirente pagou parcelas antes do prazo aparecem aqui.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Adquirente</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Previsto</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {antecipacoes.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {dataBr(a.operated_on)}
                    <span className="block text-xs text-texto-secundario">
                      {a.kind === "automatica" ? "Automática" : "Pontual"}
                    </span>
                  </TableCell>
                  <TableCell>{a.acquirer_name ?? "-"}</TableCell>
                  <TableCell>{a.bank_account_name}</TableCell>
                  <TableCell>{a.receivables_count}</TableCell>
                  <TableCell>{reaisBr(a.expected_net)}</TableCell>
                  <TableCell>{reaisBr(a.received_net)}</TableCell>
                  <TableCell>
                    {reaisBr(a.fee_amount)}
                    {a.effective_pct_month !== null && (
                      <span className="block text-xs text-texto-secundario">{pctBr(a.effective_pct_month)} ao mês</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.undone_at ? (
                      <Badge variant="gray">Desfeita</Badge>
                    ) : (
                      a.can_undo && <DesfazerBotao id={a.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}

/** Sem formulário: a recusa (conciliada, já desfeita) vai para o aviso. */
function DesfazerBotao({ id }: { id: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function desfazer() {
    const res = await apiPost(`/api/v1/emporio/card-anticipations/${id}/undo`, {});
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso("Antecipação desfeita.");
    router.refresh();
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          Desfazer
        </Button>
      }
      titulo="Desfazer esta antecipação?"
      descricao="As parcelas voltam à data prevista e o custo registrado é cancelado."
      rotuloConfirmar="Desfazer antecipação"
      aoConfirmar={desfazer}
    />
  );
}

function AnteciparForm({
  parcelas,
  desabilitado,
  aoConcluir,
}: {
  parcelas: CartaoAReceberView[];
  desabilitado: boolean;
  aoConcluir: () => void;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "antecipar");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dia, setDia] = useState(hojeEmBrasilia());
  const [recebido, setRecebido] = useState("");

  const somaCent = parcelas.reduce((s, p) => s + cent(p.effective_net), 0);
  const recebidoN = lerNumeroBr(recebido);
  const custoCent = recebidoN === null ? null : somaCent - cent(recebidoN);
  // Dias médios até o previsto, ponderados pelo líquido (a mesma média que a operação grava).
  const diasMedios =
    somaCent > 0 && dia
      ? parcelas.reduce(
          (s, p) => s + cent(p.effective_net) * Math.max(0, Math.round((emMs(p.expected_on) - emMs(dia)) / DIA_MS)),
          0,
        ) / somaCent
      : 0;
  const pctEfetivo =
    custoCent !== null && somaCent > 0 && diasMedios > 0 ? ((custoCent / somaCent) * 100 * 30) / diasMedios : null;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (parcelas.length === 0) novos.receivable_ids = "Marque as parcelas para antecipar.";
    if (!dia) novos.operated_on = "Informe a data da operação.";
    if (recebidoN === null || recebidoN <= 0) novos.received_net = "Informe o valor que a adquirente pagou.";
    if (Object.keys(novos).length > 0 || recebidoN === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/card-anticipations", {
      receivable_ids: parcelas.map((p) => p.id),
      operated_on: dia,
      received_net: recebidoN,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Antecipação registrada.");
    setOpen(false);
    setRecebido("");
    aoConcluir();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button disabled={desabilitado}>
          {parcelas.length > 0 ? `Antecipar (${parcelas.length})` : "Antecipar"}
        </Button>
      }
      title="Antecipar parcelas"
      description="Registre o que a adquirente pagou pelas parcelas marcadas. O custo é a diferença para o líquido previsto."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDia(hojeEmBrasilia());
          setRecebido("");
        }
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar antecipação"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Parcelas" id={err.idDe("receivable_ids")} error={err.erros.receivable_ids}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-base font-medium text-texto">
            {parcelas.length === 1 ? "1 parcela" : `${parcelas.length} parcelas`}{" "}
            <span className="text-sm font-normal text-texto-secundario">
              somam {reaisBr(somaCent / 100)} de líquido previsto
            </span>
          </p>
        )}
      </Field>

      <Field label="Data da operação" required id={err.idDe("operated_on")} error={err.erros.operated_on}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={dia}
            onChange={(e) => {
              setDia(e.target.value);
              err.limparCampo("operated_on");
            }}
          />
        )}
      </Field>

      <Field label="Líquido recebido (R$)" required id={err.idDe("received_net")} error={err.erros.received_net}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={recebido}
            onValueChange={(v) => {
              setRecebido(v);
              err.limparCampo("received_net");
            }}
          />
        )}
      </Field>

      {custoCent !== null && (
        <p className="rounded-md border border-borda px-3 py-2 text-sm text-texto">
          Custo da antecipação: <strong>{reaisBr(custoCent / 100)}</strong>
          {pctEfetivo !== null && <> ({pctBr(pctEfetivo)} ao mês, em {Math.round(diasMedios)} dias em média)</>}.
        </p>
      )}
    </FormSheet>
  );
}
