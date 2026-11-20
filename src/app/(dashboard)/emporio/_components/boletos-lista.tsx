"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
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
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { JANELA_DA_BAIXA_DIAS } from "@/lib/emporio/data-da-baixa";
import type { BoletoView } from "@/lib/actions/emporio-caixa";
import { BOLETO_SITUACAO_ROTULO } from "./venda-rotulos";
import { diaDeHoje } from "./venda-estado";
import { NomeDoCliente, VendaLink } from "./amarras";
import { noRecorte } from "./recorte";

const FILTROS = ["aberto", "vencido", "pago", "no_fiado"] as const;
type Filtro = (typeof FILTROS)[number];
const FILTRO_ROTULO: Record<Filtro, string> = {
  aberto: "Abertos",
  vencido: "Vencidos",
  pago: "Pagos",
  no_fiado: "No fiado",
};

/** A lista vazia no singular: "Nenhum boleto aberto", e não "abertos". */
const VAZIO_ROTULO: Record<Filtro, string> = {
  aberto: "Nenhum boleto aberto",
  vencido: "Nenhum boleto vencido",
  pago: "Nenhum boleto pago",
  no_fiado: "Nenhum boleto no fiado",
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
  recorte,
  padraoId = null,
}: {
  /** Frente A: o cartão do A receber ativo (`?ver=`) recorta os boletos abertos e vencidos pelo vencimento. */
  recorte?: { ver: "vencido" | "hoje" | "a_vencer"; hoje: string } | null;
  /** O cliente padrão, que não vira link. */
  padraoId?: string | null;
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

  const aparece =
    recorte && (filtro === "aberto" || filtro === "vencido")
      ? linhas.filter((b) => noRecorte(recorte.ver, recorte.hoje, b.due_on))
      : linhas;
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
      ) : aparece.length === 0 ? (
        <EmptyState titulo={VAZIO_ROTULO[filtro]}>
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
            {aparece.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium text-texto">
                  <NomeDoCliente id={b.customer_id} nome={b.customer_name} padraoId={padraoId} />
                </TableCell>
                <TableCell>
                  <VendaLink id={b.sale_id} numero={b.sale_number} />
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
                <TableCell>
                  {reaisBr(b.amount)}
                  {b.status === "pago" && b.paid_amount !== null && b.difference !== null && b.difference !== 0 && (
                    <span className="block text-xs text-texto-secundario">
                      {`pago ${reaisBr(b.paid_amount)} (${b.difference > 0 ? "juros" : "desconto"} ${reaisBr(Math.abs(b.difference))})`}
                    </span>
                  )}
                </TableCell>
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
                      <BoletoPago boleto={b} contas={contas} podeMudarData={podeAgir(b.establishment_id)} podeAgendar={ehDinheiro} aoMudar={depoisDaAcao} />
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

const ORDEM_PAGO = ["bank_account_id", "paid_amount", "paid_on"] as const;

/** O valor do boleto como o campo de dinheiro o escreve: "1.234,56", sem o "R$". */
const valorNoCampo = (valor: number) => reaisBr(valor).replace(/[^\d,.]/g, "");

function BoletoPago({
  boleto,
  contas,
  podeMudarData,
  podeAgendar,
  aoMudar,
}: {
  boleto: BoletoView;
  /** Só quem vê o dinheiro da conta inteira (`ehDinheiro`) agenda para o futuro; o Gestor só registra o que já caiu. */
  podeAgendar: boolean;
  /** O Gestor da loja do boleto sempre escolheu a data: quem vê o botão já pode (o servidor confere de novo). */
  podeMudarData: boolean;
  contas: { id: string; name: string }[];
  aoMudar: () => void;
}) {
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_PAGO, `boleto-pago-${boleto.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conta, setConta] = useState("");
  const [pagoEm, setPagoEm] = useState("");
  const [valorPago, setValorPago] = useState(valorNoCampo(boleto.amount));
  const hoje = diaDeHoje();

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM_PAGO)[number], string>> = {};
    if (!conta) novos.bank_account_id = "Escolha a conta onde o boleto foi pago.";
    const pago = lerNumeroBr(valorPago);
    if (pago === null || pago <= 0) novos.paid_amount = "Informe o valor que o banco recebeu, maior que zero.";
    const dia = pagoEm || hoje;
    if (Object.keys(novos).length > 0 || pago === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/boletos/${boleto.id}/pay`, {
      bank_account_id: conta,
      paid_amount: pago,
      ...(podeMudarData ? { paid_on: dia } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`${rotuloDoBoleto(boleto)} pago: o dinheiro entrou na conta.`);
    setOpen(false);
    setConta("");
    setPagoEm("");
    setValorPago(valorNoCampo(boleto.amount));
    aoMudar();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Boleto pago</Button>}
      title={`Boleto pago: ${rotuloDoBoleto(boleto)}`}
      description={`O valor pago entra como saldo na conta que você escolher (o boleto é de ${reaisBr(boleto.amount)}). Confirme só depois de ver o dinheiro no extrato.`}
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
      <Field
        label="Valor pago (R$)"
        required
        id={err.idDe("paid_amount")}
        error={err.erros.paid_amount}
        hint="Se o banco cobrou juros ou deu desconto, digite o que entrou de verdade. A diferença vai para o Resultado."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={valorPago}
            onValueChange={(v) => {
              setValorPago(v);
              err.limparCampo("paid_amount");
            }}
          />
        )}
      </Field>
      {podeMudarData && (
        <Field
          label="Data em que caiu"
          id={err.idDe("paid_on")}
          error={err.erros.paid_on}
          hint={
            podeAgendar
              ? `Para o extrato bater com o do banco. Data futura fica em Agendados. Até ${JANELA_DA_BAIXA_DIAS} dias para trás ou para frente.`
              : `Para o extrato bater com o do banco. Até ${JANELA_DA_BAIXA_DIAS} dias para trás.`
          }
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              max={podeAgendar ? undefined : hoje}
              value={pagoEm || hoje}
              onChange={(e) => {
                setPagoEm(e.target.value);
                err.limparCampo("paid_on");
              }}
            />
          )}
        </Field>
      )}
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
