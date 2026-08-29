"use client";

import { useMemo, useState } from "react";
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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * "Comprei gado" e "Vendi gado" (§3.1 e §3.2) num formulário só.
 *
 * Importa `@/lib/herd/categories` (módulo puro) e NUNCA uma action, que
 * arrastaria Prisma para o bundle do navegador.
 *
 * O documento é insistente sobre não parecer sistema contábil (§2), então a
 * ordem das perguntas segue a da conversa do produtor: o que, quanto, de quem,
 * já pagou. Peso, arroba e valor por cabeça ficam de fora desta versão porque o
 * §6.2 os marca como opcionais e diz, no fim do parágrafo, que o sistema não
 * deve exigi-los quando o produtor informar apenas o valor total.
 */

type Property = { id: string; name: string };
type Contact = { id: string; name: string };

type Parcela = { due_date: string; amount: string };
type Custo = { descricao: string; amount: string };

/**
 * Os campos, na ordem visual, com o nome que a API usa.
 *
 * `amount` cobre o valor do negócio E a soma das parcelas: as duas recusas
 * pertencem ao mesmo número, e o produtor corrige as duas no mesmo lugar.
 */
const ORDEM = [
  "type",
  "category_id",
  "quantity",
  "amount",
  "occurred_at",
  "property_id",
  "contact_name",
  "due_date",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Soma meses SEM pular para o mês seguinte.
 *
 * `setMonth` faz 31/01 + 1 virar 03/03, porque fevereiro não tem 31 dias, e a
 * parcela de fevereiro apareceria em março. É a mesma regra de `somarMeses` no
 * handler de WhatsApp: as duas telas parcelam o mesmo negócio, então dois
 * cálculos diferentes dariam datas diferentes para a mesma compra.
 */
function emMeses(base: string, meses: number) {
  const d = new Date(`${base}T12:00:00`);
  const alvo = d.getMonth() + meses;
  const ultimoDiaDoMesDestino = new Date(d.getFullYear(), alvo + 1, 0).getDate();
  const resultado = new Date(
    d.getFullYear(),
    alvo,
    Math.min(d.getDate(), ultimoDiaDoMesDestino),
    12,
    0,
    0,
  );
  const mm = String(resultado.getMonth() + 1).padStart(2, "0");
  const dd = String(resultado.getDate()).padStart(2, "0");
  return `${resultado.getFullYear()}-${mm}-${dd}`;
}

export default function NegotiationForm({
  properties,
  contacts,
  defaultPropertyId,
}: {
  properties: Property[];
  contacts: Contact[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [type, setType] = useState<"compra_gado" | "venda_gado">("compra_gado");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  // Texto livre, nao id: quem digita um nome novo cadastra o contato junto
  // com o negocio (§5). Ver o comentario do campo, abaixo.
  const [contactName, setContactName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [pago, setPago] = useState(true);
  // §6.3 e §7.3: quando não foi pago, o vencimento é o PRIMEIRO dado pedido,
  // e as parcelas são o condicional ("quando houver"). Sem este campo, quem
  // marcava "Ainda não" sem parcelar criava uma conta vencendo hoje, e o
  // alerta de atraso disparava no mesmo dia da compra.
  const [vencimento, setVencimento] = useState(hoje());
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [custos, setCustos] = useState<Custo[]>([]);
  const [notes, setNotes] = useState("");

  const compra = type === "compra_gado";
  const valorNumero = lerValorDoCampo(amount) ?? 0;

  const somaParcelas = useMemo(
    () => parcelas.reduce((s, p) => s + (lerValorDoCampo(p.amount) ?? 0), 0),
    [parcelas],
  );
  const somaCustos = useMemo(
    () => custos.reduce((s, c) => s + (lerValorDoCampo(c.amount) ?? 0), 0),
    [custos],
  );
  // §14: a soma tem que fechar. Mostrado ANTES de enviar, para o produtor
  // corrigir sem levar erro do servidor na cara.
  const parcelasFecham = parcelas.length === 0 || Math.round(somaParcelas * 100) === Math.round(valorNumero * 100);

  function reset() {
    setType("compra_gado");
    setContactName("");
    setCategoryId("");
    setQuantity("");
    setAmount("");
    setOccurredAt(hoje());
    setPago(true);
    setVencimento(hoje());
    setParcelas([]);
    setCustos([]);
    setNotes("");
    err.limparTudo();
  }

  function parcelar(n: number) {
    if (!valorNumero || n < 1) return;
    // A última parcela absorve o centavo que sobra da divisão, senão a soma
    // não fecha e o servidor recusa (§14).
    const base = Math.floor((valorNumero * 100) / n) / 100;
    const novas: Parcela[] = Array.from({ length: n }, (_, i) => ({
      due_date: emMeses(occurredAt, i + 1),
      amount: String(i === n - 1 ? Number((valorNumero - base * (n - 1)).toFixed(2)) : base),
    }));
    setParcelas(novas);
    setPago(false);
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity) ?? 0;
    // Cada recusa vai para o SEU campo, e não mais para um rodapé único: o
    // produtor não tinha como saber qual dos oito campos estava errado.
    const novos: Partial<Record<Campo, string>> = {};
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!categoryId) novos.category_id = "Escolha a categoria dos animais.";
    if (!Number.isInteger(qtd) || qtd <= 0) {
      novos.quantity = "Informe uma quantidade inteira maior que zero.";
    }
    if (valorNumero <= 0) novos.amount = "Informe o valor total do negócio.";
    if (!parcelasFecham) {
      novos.amount = `A soma das parcelas (${moeda(somaParcelas)}) não fecha com o valor do negócio (${moeda(valorNumero)}).`;
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/negotiations", {
      type,
      property_id: propertyId,
      contact_name: contactName.trim() || null,
      itens: [{ category_id: categoryId, quantity: qtd }],
      amount: valorNumero,
      occurred_at: new Date(`${occurredAt}T12:00:00`).toISOString(),
      pago,
      due_date: pago || parcelas.length > 0 ? null : new Date(`${vencimento}T12:00:00`).toISOString(),
      parcelas: pago
        ? []
        : parcelas.map((p) => ({
            due_date: new Date(`${p.due_date}T12:00:00`).toISOString(),
            amount: lerValorDoCampo(p.amount) ?? 0,
          })),
      custos: custos
        .filter((c) => c.descricao.trim() && (lerValorDoCampo(c.amount) ?? 0) > 0)
        .map((c) => ({ descricao: c.descricao.trim(), amount: lerValorDoCampo(c.amount) ?? 0 })),
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Registrar negócio</Button>}
      title="Registrar negócio de gado"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Registrar negócio"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que aconteceu" id="type">
        {({ id, ...aria }) => (
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compra_gado">Comprei gado</SelectItem>
              <SelectItem value="venda_gado">Vendi gado</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria" required id="category_id" error={err.erros.category_id}>
          {({ id, ...aria }) => (
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v);
                err.limparCampo("category_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {HERD_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Quantidade" required id="quantity" error={err.erros.quantity}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="cabeças"
              value={quantity}
              onValueChange={(v) => {
                setQuantity(v);
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor total (R$)" required id="amount" error={err.erros.amount}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              value={amount}
              onValueChange={(v) => {
                setAmount(v);
                err.limparCampo("amount");
              }}
            />
          )}
        </Field>
        <Field label="Data" id="occurred_at">
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Fazenda" required id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              err.limparCampo("property_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a fazenda" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

          {/*
            §5: "cadastro simples e rápido", sem CPF, endereço nem dados
            bancários. Campo de TEXTO com sugestões, não um seletor do que já
            existe: com o seletor, um tenant novo não tinha caminho nenhum para
            cadastrar o primeiro contato (o campo nem aparecia com a lista
            vazia), e "Com quem negociei?" é a terceira pergunta do §2.

            O nome digitado vai como `contact_name` e a action resolve ou cria
            DENTRO da transação, com busca exata: nome já existente reaproveita
            o contato, nome novo cria com só o nome (§4, não é obrigado a
            classificar), e uma recusa por saldo não deixa contato órfão.
          */}
      <Field
        label={compra ? "Vendedor (opcional)" : "Comprador (opcional)"}
        hint="Pode digitar um nome novo: eu cadastro junto com o negócio."
        id="contact_name"
        error={err.erros.contact_name}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            list="neg-contatos"
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              err.limparCampo("contact_name");
            }}
            placeholder="Nome de quem você negociou"
          />
        )}
      </Field>
      <datalist id="neg-contatos">
        {contacts.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <div className="rounded-md border border-borda p-3">
            <p className="text-sm font-medium text-texto-secundario">
              {compra ? "O pagamento já foi feito?" : "O valor já foi recebido?"}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={pago ? "default" : "outline"}
                onClick={() => {
                  setPago(true);
                  setParcelas([]);
                }}
              >
                Sim
              </Button>
              <Button
                type="button"
                variant={!pago ? "default" : "outline"}
                onClick={() => setPago(false)}
              >
                Ainda não
              </Button>
            </div>

            {!pago && (
              <div className="mt-3 space-y-2">
                {parcelas.length === 0 && (
                  <Field label="Vence em" id="due_date">
                    {({ id, ...aria }) => (
                      <Input
                        id={id}
                        {...aria}
                        type="date"
                        value={vencimento}
                        onChange={(e) => setVencimento(e.target.value)}
                      />
                    )}
                  </Field>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-texto-secundario">Dividir em:</span>
                  {[1, 2, 3, 6, 12].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => parcelar(n)}
                      className="rounded border border-borda px-2 py-1 text-sm text-texto-secundario hover:border-tibe-primary"
                    >
                      {n}x
                    </button>
                  ))}
                </div>

                {parcelas.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-sm text-texto-discreto">{i + 1}.</span>
                    <Input
                      type="date"
                      value={p.due_date}
                      onChange={(e) => {
                        const novas = [...parcelas];
                        novas[i] = { ...novas[i], due_date: e.target.value };
                        setParcelas(novas);
                      }}
                    />
                    <MoneyInput
                      hideEcho
                      aria-label={`Valor da parcela ${i + 1}`}
                      value={p.amount}
                      onValueChange={(v) => {
                        const novas = [...parcelas];
                        novas[i] = { ...novas[i], amount: v };
                        setParcelas(novas);
                        err.limparCampo("amount");
                      }}
                    />
                  </div>
                ))}

                {parcelas.length > 0 && (
                  <p
                    className={
                      parcelasFecham
                        ? "text-sm text-texto-secundario"
                        : "text-sm text-perigo-tinta"
                    }
                  >
                    Soma das parcelas: R$ {moeda(somaParcelas)}
                    {!parcelasFecham && " (precisa fechar com o valor do negócio)"}
                  </p>
                )}
              </div>
            )}
          </div>

      <div className="rounded-md border border-borda p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-texto-secundario">Frete, comissão, taxas</p>
              <button
                type="button"
                onClick={() => setCustos([...custos, { descricao: "", amount: "" }])}
                className="text-sm text-acento-tinta underline"
              >
                Adicionar
              </button>
            </div>
            {custos.map((c, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <Input
                  placeholder="Ex: Comissão"
                  value={c.descricao}
                  onChange={(e) => {
                    const novos = [...custos];
                    novos[i] = { ...novos[i], descricao: e.target.value };
                    setCustos(novos);
                  }}
                />
                <MoneyInput
                  hideEcho
                  aria-label={`Valor do custo ${i + 1}`}
                  placeholder="0,00"
                  value={c.amount}
                  onValueChange={(v) => {
                    const novos = [...custos];
                    novos[i] = { ...novos[i], amount: v };
                    setCustos(novos);
                  }}
                />
              </div>
            ))}
            {somaCustos > 0 && valorNumero > 0 && (
              <p className="mt-2 text-sm text-texto-secundario">
                {compra
                  ? `Custo total da compra: ${moeda(valorNumero + somaCustos)}`
                  : `Valor líquido da venda: ${moeda(valorNumero - somaCustos)}`}
              </p>
            )}
      </div>

      <Field label="Observação (opcional)" id="notes">
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
