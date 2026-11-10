"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import type { FornecedorEscolhido } from "@/lib/actions/emporio-fornecedores";
import { EscolherFornecedor } from "./escolher-fornecedor";
import { CaixaDaOperacao } from "./caixa-da-operacao";
import { abertosDaLoja, caixaInicial, type CaixaDaLoja } from "./caixas-da-loja";
import type { OrigemDoDinheiro } from "./pagar-contas-form";

const ORDEM = [
  "establishment_id",
  "description",
  "amount",
  "due_date",
  "status",
  "emporio_supplier_id",
  "emporio_other_name",
  "paid_at",
  "from",
  "cash_register_id",
] as const;
type Campo = (typeof ORDEM)[number];
export function ContaAvulsaForm({ lojas, origens, caixas, usuarioId, hoje }: {
  lojas: {
    id: string;
    name: string;
  }[];
  origens: OrigemDoDinheiro[];
  caixas: CaixaDaLoja[];
  usuarioId: string;
  hoje: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "avulsa");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : "");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hoje);
  const [status, setStatus] = useState("pending");
  const [destinatario, setDestinatario] = useState("nenhum");
  const [fornecedor, setFornecedor] = useState<FornecedorEscolhido | null>(null);
  const [outros, setOutros] = useState("");
  const [data, setData] = useState(hoje);
  const [origem, setOrigem] = useState("");
  const [caixa, setCaixa] = useState("");
  const paga = status === "paid";
  const gaveta = origem.startsWith("loja:");
  const abertos = abertosDaLoja(caixas, loja);
  const caixaEscolhido = abertos.some((c) => c.id === caixa) ? caixa : caixaInicial(abertos, usuarioId);
  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const amount = lerValorDoCampo(valor);
    if (!loja)
      novos.establishment_id = "Escolha a loja.";
    if (!descricao.trim())
      novos.description = "Informe a descrição.";
    if (amount === null || amount <= 0)
      novos.amount = "Informe um valor positivo válido.";
    if (!vencimento)
      novos.due_date = "Informe o vencimento.";
    if (destinatario === "fornecedor" && !fornecedor)
      novos.emporio_supplier_id = "Escolha o fornecedor.";
    if (destinatario === "outros" && !outros.trim())
      novos.emporio_other_name = "Informe o nome de Outros.";
    if (paga && !data)
      novos.paid_at = "Informe a data do pagamento.";
    if (paga && !origem)
      novos.from = "Diga de onde sai o dinheiro.";
    if (paga && gaveta && !caixaEscolhido)
      novos.cash_register_id = "Escolha um caixa com turno aberto nesta loja.";
    if (Object.keys(novos).length) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setPending(true);
    const [tipo, id] = origem.split(":");
    const res = await apiPost<{
      payment: {
        waiting_approval?: boolean;
      } | null;
    }>("/api/v1/emporio/payables", {
      establishment_id: loja, description: descricao.trim(), amount,
      due_date: `${vencimento}T12:00:00-03:00`, status,
      emporio_supplier_id: destinatario === "fornecedor" ? fornecedor?.id : null,
      emporio_other_name: destinatario === "outros" ? outros.trim() : null,
      ...(paga ? {
        // Hoje registra o instante atual. Outro dia preserva o dia em Brasília.
        paid_at: data === hoje ? new Date().toISOString() : `${data}T12:00:00-03:00`,
        from: tipo === "loja" ? { establishment_id: id } : { bank_account_id: id },
        cash_register_id: gaveta ? caixaEscolhido : null,
      } : {}),
    });
    setPending(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(
      res.data?.payment?.waiting_approval
        ? "Conta criada pendente. O pagamento ficou aguardando aprovação do Dono ou do Gerente geral."
        : paga ? "Conta criada e paga." : "Conta criada.",
    );
    setOpen(false);
    setDescricao("");
    setValor("");
    setStatus("pending");
    setDestinatario("nenhum");
    setFornecedor(null);
    setOutros("");
    setOrigem("");
    setCaixa("");
    router.refresh();
  }
  return <FormSheet

    trigger={<Button>Adicionar conta</Button>}

    title="Adicionar conta"

    description="Cadastre uma conta avulsa da loja. Ela não altera o Resultado da Loja."

    open={open}

    onOpenChange={(o) => {
      setOpen(o);
      if (o)
        setData(hoje);
      else
        err.limparTudo();
    }}

    onSubmit={submit}

    submitLabel="Adicionar conta"

    pending={pending}

    error={err.global}

    focarCampoId={err.focarCampoId}

    tentativa={err.tentativa}>
    <Field

      label="Loja"

      required

      id={err.idDe("establishment_id")}

      error={err.erros.establishment_id}>
      {({ id, ...aria }) => <Select
        value={loja}
        onValueChange={(v) => {
          setLoja(v);
          setOrigem("");
          setCaixa("");
          err.limparCampo("establishment_id");
          err.limparCampo("from");
          err.limparCampo("cash_register_id");
        }}>
        <SelectTrigger
          id={id}
          {...aria}>
          <SelectValue placeholder="Escolha a loja" />
        </SelectTrigger>
        <SelectContent>
          {lojas.map((l) => <SelectItem
            key={l.id}
            value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>}
    </Field>
    <Field

      label="Descrição"

      required

      id={err.idDe("description")}

      error={err.erros.description}>
      {({ id, ...aria }) => <Input

        id={id}

        {...aria}

        maxLength={200}

        value={descricao}

        onChange={(e) => {
          setDescricao(e.target.value);
          err.limparCampo("description");
        }} />}
    </Field>
    <Field

      label="Valor"

      required

      id={err.idDe("amount")}

      error={err.erros.amount}>
      {({ id, ...aria }) => <MoneyInput

        id={id}

        {...aria}

        value={valor}

        onValueChange={(v) => {
          setValor(v);
          err.limparCampo("amount");
        }} />}
    </Field>
    <Field

      label="Vencimento"

      required

      id={err.idDe("due_date")}

      error={err.erros.due_date}>
      {({ id, ...aria }) => <Input

        id={id}

        {...aria}

        type="date"

        value={vencimento}

        onChange={(e) => {
          setVencimento(e.target.value);
          err.limparCampo("due_date");
        }} />}
    </Field>
    <Field

      label="Status"

      required

      id={err.idDe("status")}

      error={err.erros.status}>
      {({ id, ...aria }) => <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          err.limparCampo("status");
          err.limparCampo("from");
          err.limparCampo("paid_at");
          err.limparCampo("cash_register_id");
        }}>
        <SelectTrigger
          id={id}
          {...aria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="paid">Paga</SelectItem>
        </SelectContent>
      </Select>}
    </Field>
    <Field
      label="Destinatário"
      id="avulsa-destinatario">
      {({ id, ...aria }) => <Select
        value={destinatario}
        onValueChange={(v) => {
          setDestinatario(v);
          err.limparCampo("emporio_supplier_id");
          err.limparCampo("emporio_other_name");
        }}>
        <SelectTrigger
          id={id}
          {...aria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhum">Nenhum</SelectItem>
          <SelectItem value="fornecedor">Fornecedor</SelectItem>
          <SelectItem value="outros">Outros</SelectItem>
        </SelectContent>
      </Select>}
    </Field>
    {destinatario === "fornecedor" && <Field

      label="Fornecedor"

      required

      id={err.idDe("emporio_supplier_id")}

      error={err.erros.emporio_supplier_id}>
      {(campo) => <EscolherFornecedor

        campo={campo}

        valor={fornecedor}

        permitirCadastro={false}

        onEscolher={(f) => {
          setFornecedor(f);
          err.limparCampo("emporio_supplier_id");
        }} />}
    </Field>}
    {destinatario === "outros" && <Field

      label="Nome de Outros"

      required

      id={err.idDe("emporio_other_name")}

      error={err.erros.emporio_other_name}>
      {({ id, ...aria }) => <Input

        id={id}

        {...aria}

        maxLength={200}

        value={outros}

        onChange={(e) => {
          setOutros(e.target.value);
          err.limparCampo("emporio_other_name");
        }} />}
    </Field>}
    {paga && <>
      <Field

        label="Data do pagamento"

        required

        id={err.idDe("paid_at")}

        error={err.erros.paid_at}>
        {({ id, ...aria }) => <Input

          id={id}

          {...aria}

          type="date"

          max={hoje}

          value={data}

          onChange={(e) => {
            setData(e.target.value);
            err.limparCampo("paid_at");
          }} />}
      </Field>
      <Field

        label="De onde sai o dinheiro"

        required

        id={err.idDe("from")}

        error={err.erros.from}>
        {({ id, ...aria }) => <Select
          value={origem}
          onValueChange={(v) => {
            setOrigem(v);
            err.limparCampo("from");
            err.limparCampo("cash_register_id");
          }}>
          <SelectTrigger
            id={id}
            {...aria}>
            <SelectValue placeholder="Escolha a gaveta ou a conta" />
          </SelectTrigger>
          <SelectContent>
            {origens.filter((o) => !o.valor.startsWith("loja:") || o.valor === `loja:${loja}`).map((o) => <SelectItem
              key={o.valor}
              value={o.valor}>{o.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>}
      </Field>
      {gaveta && (abertos.length !== 1 || !!err.erros.cash_register_id) && <Field

        label="Caixa de onde sai o dinheiro"

        required

        id={err.idDe("cash_register_id")}

        error={err.erros.cash_register_id}>
        {({ id, ...aria }) => <CaixaDaOperacao

          id={id}

          aria={aria}

          abertos={abertos}

          valor={caixaEscolhido}

          aoMudar={(v) => {
            setCaixa(v);
            err.limparCampo("cash_register_id");
          }} />}
      </Field>}
      <p className="text-sm text-texto-secundario">Se o pagamento precisar de aprovação, a conta ficará pendente até o Dono ou o Gerente geral aprovar.</p>
    </>}
  </FormSheet>;
}
