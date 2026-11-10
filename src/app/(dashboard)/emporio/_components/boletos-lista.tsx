"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Carregando } from "@/components/ui/carregando";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiGet, apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import type { BoletoView } from "@/lib/actions/emporio-caixa";
import { BOLETO_SITUACAO_ROTULO } from "./venda-rotulos";
import { diaDeHoje } from "./venda-estado";

const FILTROS = ["aberto", "vencido", "pago", "no_fiado"] as const;
type Filtro = (typeof FILTROS)[number];
const FILTRO_ROTULO: Record<Filtro, string> = {
  aberto: "Abertos",
  vencido: "Vencidos",
  pago: "Pagos",
  no_fiado: "No fiado",
};

/** Data de calendário "AAAA-MM-DD" como "DD/MM/AAAA", sem passar por fuso. */
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * Os boletos da carteira, com filtro de situação (Q282). A lista vem da rota
 * (`GET /api/v1/emporio/boletos`) a cada troca de filtro e a cada ação. Os
 * abertos chegam já lidos pela página de servidor, para a tela não abrir vazia.
 *
 * Quem pode dar baixa ou mandar para o fiado é decidido pela página (este
 * componente não pode importar as permissões): `ehDinheiro` vale para todas as
 * lojas, e `lojasDoGestor` lista as lojas em que o perfil é gestor. O servidor
 * reconfere de qualquer jeito.
 */
export function BoletosLista({
  iniciais,
  loja,
  contas,
  ehDinheiro,
  lojasDoGestor,
}: {
  /** Os boletos abertos, lidos pelo servidor na carga da página. */
  iniciais: BoletoView[];
  /** A loja do filtro da página, vazio para todas. */
  loja: string;
  contas: { id: string; name: string }[];
  ehDinheiro: boolean;
  lojasDoGestor: string[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const [linhas, setLinhas] = useState<BoletoView[]>(iniciais);
  const [carregando, setCarregando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const primeira = useRef(true);

  const ler = useCallback(
    async (situacao: Filtro) => {
      setCarregando(true);
      const q = new URLSearchParams({ status: situacao });
      if (loja) q.set("loja", loja);
      const res = await apiGet<BoletoView[]>(`/api/v1/emporio/boletos?${q.toString()}`);
      setCarregando(false);
      if (res.ok) {
        setLinhas(res.data);
        setRecusa(null);
      } else {
        setRecusa(res.message);
      }
    },
    [loja],
  );

  useEffect(() => {
    // A primeira leitura já veio da página, no filtro "Abertos".
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    void ler(filtro);
  }, [filtro, ler]);

  function depoisDaAcao() {
    void ler(filtro);
    router.refresh();
  }

  const podeAgir = (lojaId: string) => ehDinheiro || lojasDoGestor.includes(lojaId);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Boletos</h2>
      <div role="group" aria-label="Situação dos boletos" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filtro === f ? "default" : "outline"}
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
          >
            {FILTRO_ROTULO[f]}
          </Button>
        ))}
      </div>

      {recusa ? (
        <EmptyState titulo="Não foi possível ler os boletos">{recusa}</EmptyState>
      ) : carregando ? (
        <Carregando linhas={3} />
      ) : linhas.length === 0 ? (
        <EmptyState titulo={`Nenhum boleto ${FILTRO_ROTULO[filtro].toLowerCase()}`}>
          Os boletos registrados nas vendas aparecem aqui, pelo vencimento.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Venda</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Boleto</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium text-texto">{b.customer_name}</TableCell>
                <TableCell>
                  <Link href={`/emporio/vendas/${b.sale_id}`} className="font-medium text-texto-marca hover:underline">
                    nº {b.sale_number}
                  </Link>
                </TableCell>
                <TableCell>{b.establishment_name}</TableCell>
                <TableCell>{b.number ?? "-"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {dataBr(b.due_on)}
                  {b.overdue && (
                    <Badge variant="red" className="ml-2">
                      Vencido
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{reaisBr(b.amount)}</TableCell>
                <TableCell>
                  <Badge variant={b.status === "pago" ? "green" : b.status === "no_fiado" ? "gray" : "amber"}>
                    {BOLETO_SITUACAO_ROTULO[b.status] ?? b.status}
                  </Badge>
                  {b.status === "pago" && b.paid_on && (
                    <span className="block text-xs text-texto-secundario">
                      {dataBr(b.paid_on)}
                      {b.bank_account_name ? `, ${b.bank_account_name}` : ""}
                    </span>
                  )}
                  {b.status === "no_fiado" && b.reason && (
                    <span className="block text-xs text-texto-secundario">{b.reason}</span>
                  )}
                </TableCell>
                <TableCell>
                  {b.status === "aberto" && podeAgir(b.establishment_id) ? (
                    <div className="flex flex-wrap gap-2">
                      <BoletoPago boleto={b} contas={contas} aoMudar={depoisDaAcao} />
                      <BoletoParaFiado boleto={b} aoMudar={depoisDaAcao} />
                    </div>
                  ) : (
                    <span className="text-sm text-texto-secundario">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

const rotuloDoBoleto = (b: BoletoView) => (b.number ? `boleto ${b.number}` : `boleto de ${b.customer_name}`);

// ----- Boleto pago -----

const ORDEM_PAGO = ["bank_account_id", "paid_on"] as const;

function BoletoPago({
  boleto,
  contas,
  aoMudar,
}: {
  boleto: BoletoView;
  contas: { id: string; name: string }[];
  aoMudar: () => void;
}) {
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_PAGO, `boleto-pago-${boleto.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conta, setConta] = useState("");
  const [pagoEm, setPagoEm] = useState("");
  const hoje = diaDeHoje();

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM_PAGO)[number], string>> = {};
    if (!conta) novos.bank_account_id = "Escolha a conta onde o boleto foi pago.";
    const dia = pagoEm || hoje;
    if (dia > hoje) novos.paid_on = "A data do pagamento não pode ser futura.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/boletos/${boleto.id}/pay`, { bank_account_id: conta, paid_on: dia });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`${rotuloDoBoleto(boleto)} pago: o dinheiro entrou na conta.`);
    setOpen(false);
    setConta("");
    setPagoEm("");
    aoMudar();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Boleto pago</Button>}
      title={`Boleto pago: ${rotuloDoBoleto(boleto)}`}
      description={`${reaisBr(boleto.amount)} entram como saldo na conta que você escolher. Confirme só depois de ver o dinheiro no extrato.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Marcar como pago"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Conta onde caiu" required id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
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
      <Field label="Data do pagamento" id={err.idDe("paid_on")} error={err.erros.paid_on}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            max={hoje}
            value={pagoEm || hoje}
            onChange={(e) => {
              setPagoEm(e.target.value);
              err.limparCampo("paid_on");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

// ----- Mandar para o fiado -----

const ORDEM_FIADO = ["reason"] as const;

function BoletoParaFiado({ boleto, aoMudar }: { boleto: BoletoView; aoMudar: () => void }) {
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_FIADO, `boleto-fiado-${boleto.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    if (!motivo.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga por que o boleto vai para o fiado." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/boletos/${boleto.id}/to-fiado`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`${rotuloDoBoleto(boleto)} foi para o fiado. O cliente voltou a dever.`);
    setOpen(false);
    setMotivo("");
    aoMudar();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Mandar para o fiado
        </Button>
      }
      title={`Mandar para o fiado: ${rotuloDoBoleto(boleto)}`}
      description="O boleto sai da carteira e a dívida volta para o Fiado do cliente."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Mandar para o fiado"
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
            placeholder="Ex: vencido e o cliente vai pagar no balcão"
          />
        )}
      </Field>
    </FormSheet>
  );
}
