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
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { UNIDADE_BASE_SUFIXO } from "./formato";

/**
 * "Nova compra" (F2a, Q38, Q61 a Q63, Q70).
 *
 * A `operation_key` nasce com o painel e só troca depois de uma compra gravada:
 * reenviar depois de uma falha de rede devolve a mesma compra em vez de duplicar.
 */

export type ProdutoParaCompra = {
  id: string;
  name: string;
  base_unit: string;
  apresentacoes: { id: string; name: string }[];
};

type Kind = "a_vista" | "a_prazo" | "parcelada";

type ItemLinha = { key: number; produto: string; apresentacao: string; qtd: string; total: string };
type ParcelaLinha = { key: number; valor: string; vencimento: string };

// Ordem visual, de cima para baixo.
const ORDEM = [
  "establishment_id",
  "contact_id",
  "purchased_at",
  "items",
  "freight",
  "payment",
  "due_date",
  "down_payment",
  "installments",
] as const;
type Campo = (typeof ORDEM)[number];

const NENHUM = "__nenhum__";
const BASE = "__base__";

const KIND_ROTULO: Record<Kind, string> = {
  a_vista: "À vista",
  a_prazo: "A prazo",
  parcelada: "Parcelada",
};

const centavos = (v: number) => Math.round(v * 100);

function hoje(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** "2026-01-31" + 1 mês = "2026-02-28": o dia encolhe para caber no mês. */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

const paraIso = (data: string) => new Date(`${data}T12:00:00`).toISOString();

const centavosParaCampo = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function CompraForm({
  lojas,
  fornecedores,
  produtos,
}: {
  lojas: { id: string; name: string }[];
  fornecedores: { id: string; name: string }[];
  produtos: ProdutoParaCompra[];
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "compra");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<string | null>(null);
  const contador = useRef(1);
  const proximo = () => {
    contador.current += 1;
    return contador.current;
  };

  const novoItem = (): ItemLinha => ({ key: proximo(), produto: "", apresentacao: BASE, qtd: "", total: "" });
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : "");
  const [fornecedor, setFornecedor] = useState("");
  const [data, setData] = useState(hoje);
  const [recebida, setRecebida] = useState(true);
  const [itens, setItens] = useState<ItemLinha[]>(() => [{ key: 1, produto: "", apresentacao: BASE, qtd: "", total: "" }]);
  const [frete, setFrete] = useState("");
  const [forma, setForma] = useState<Kind>("a_vista");
  const [vencimento, setVencimento] = useState("");
  const [entrada, setEntrada] = useState("");
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([]);
  const [nParcelas, setNParcelas] = useState("2");
  const [primeiroVenc, setPrimeiroVenc] = useState("");

  function reiniciar() {
    setLoja(lojas.length === 1 ? lojas[0].id : "");
    setFornecedor("");
    setData(hoje());
    setRecebida(true);
    setItens([novoItem()]);
    setFrete("");
    setForma("a_vista");
    setVencimento("");
    setEntrada("");
    setParcelas([]);
    setNParcelas("2");
    setPrimeiroVenc("");
    err.limparTudo();
  }

  // Totais em centavos, para o "falta fechar" não herdar erro de ponto flutuante.
  const totalItens = itens.reduce((s, i) => {
    const v = lerNumeroBr(i.total);
    return s + (v === null || v < 0 ? 0 : centavos(v));
  }, 0);
  const valorFrete = lerNumeroBr(frete);
  const totalFrete = valorFrete === null || valorFrete < 0 ? 0 : centavos(valorFrete);
  const total = totalItens + totalFrete;
  const valorEntrada = lerNumeroBr(entrada);
  const totalEntrada = valorEntrada === null || valorEntrada < 0 ? 0 : centavos(valorEntrada);
  const somaParcelas = parcelas.reduce((s, p) => {
    const v = lerNumeroBr(p.valor);
    return s + (v === null || v <= 0 ? 0 : centavos(v));
  }, 0);
  const falta = total - totalEntrada - somaParcelas;

  function atualizarItem(key: number, parte: Partial<ItemLinha>) {
    setItens((lista) => lista.map((i) => (i.key === key ? { ...i, ...parte } : i)));
    err.limparCampo("items");
  }

  function atualizarParcela(key: number, parte: Partial<ParcelaLinha>) {
    setParcelas((lista) => lista.map((p) => (p.key === key ? { ...p, ...parte } : p)));
    err.limparCampo("installments");
  }

  function dividir() {
    const n = Number(nParcelas.trim());
    if (!Number.isInteger(n) || n < 1 || n > 60 || !primeiroVenc) {
      err.setGlobal(null);
      err.reprovar({ installments: "Diga em quantas parcelas e o primeiro vencimento." });
      return;
    }
    const restante = total - totalEntrada;
    if (restante <= 0) {
      err.setGlobal(null);
      err.reprovar({ installments: "Não há valor a dividir: confira os itens, o frete e a entrada." });
      return;
    }
    const base = Math.floor(restante / n);
    setParcelas(
      Array.from({ length: n }, (_, i) => ({
        key: proximo(),
        valor: centavosParaCampo(i === n - 1 ? restante - base * (n - 1) : base),
        vencimento: somarMeses(primeiroVenc, i),
      })),
    );
    err.limparCampo("installments");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!loja) novos.establishment_id = "Escolha a loja que comprou.";
    if (!data) novos.purchased_at = "Informe a data da compra.";

    const itensApi: { emporio_product_id: string; presentation_id: string | null; quantity: number; item_total: number }[] = [];
    for (const i of itens) {
      const q = lerNumeroBr(i.qtd);
      const t = lerNumeroBr(i.total);
      if (!i.produto || q === null || q <= 0 || t === null || t < 0) {
        novos.items = "Cada item precisa de produto, quantidade maior que zero e valor.";
        break;
      }
      itensApi.push({
        emporio_product_id: i.produto,
        presentation_id: i.apresentacao === BASE ? null : i.apresentacao,
        quantity: q,
        item_total: t,
      });
    }

    if (frete.trim() !== "" && (valorFrete === null || valorFrete < 0)) {
      novos.freight = "Não consegui ler esse valor.";
    }

    // Campo que some da tela não é cobrado: o vencimento só existe a prazo.
    if (forma === "a_prazo" && !vencimento) novos.due_date = "Informe quando a conta vence.";
    if (forma === "parcelada") {
      if (entrada.trim() !== "" && (valorEntrada === null || valorEntrada < 0)) {
        novos.down_payment = "Não consegui ler esse valor.";
      }
      const incompleta = parcelas.some((p) => {
        const v = lerNumeroBr(p.valor);
        return v === null || v <= 0 || !p.vencimento;
      });
      if (parcelas.length === 0) novos.installments = "Informe as parcelas.";
      else if (incompleta) novos.installments = "Cada parcela precisa de valor maior que zero e vencimento.";
      else if (!novos.items && !novos.freight && !novos.down_payment && falta !== 0) {
        novos.installments = `As parcelas não fecham o total: ${falta > 0 ? "faltam" : "sobram"} ${reaisBr(Math.abs(falta) / 100)}.`;
      }
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/purchases", {
      operation_key: (chave.current ??= crypto.randomUUID()),
      establishment_id: loja,
      contact_id: fornecedor || null,
      purchased_at: paraIso(data),
      received: recebida,
      freight: valorFrete,
      items: itensApi,
      payment: {
        kind: forma,
        due_date: forma === "a_prazo" ? paraIso(vencimento) : null,
        down_payment: forma === "parcelada" ? valorEntrada : null,
        installments:
          forma === "parcelada"
            ? parcelas.map((p) => ({ amount: lerNumeroBr(p.valor) as number, due_date: paraIso(p.vencimento) }))
            : null,
      },
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Nova compra</Button>}
      title="Nova compra"
      description="A mercadoria entra no estoque quando a compra é recebida."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Depois de uma falha o rascunho fica, para a pessoa corrigir e reenviar com a mesma chave.
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar compra"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={loja}
            onValueChange={(v) => {
              setLoja(v);
              err.limparCampo("establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Fornecedor" id={err.idDe("contact_id")} error={err.erros.contact_id} hint="Opcional. Vem dos Contatos.">
        {({ id, ...aria }) => (
          <Select
            value={fornecedor || NENHUM}
            onValueChange={(v) => {
              setFornecedor(v === NENHUM ? "" : v);
              err.limparCampo("contact_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Não informar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>Não informar</SelectItem>
              {fornecedores.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Data da compra" required id={err.idDe("purchased_at")} error={err.erros.purchased_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("purchased_at");
            }}
          />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm text-texto">
        <input
          type="checkbox"
          checked={recebida}
          onChange={(e) => setRecebida(e.target.checked)}
          className="size-4 rounded border-borda-forte"
        />
        Já recebi a mercadoria
      </label>

      <Field label="Itens" required id={err.idDe("items")} error={err.erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            {itens.map((item, n) => {
              const prod = produtos.find((p) => p.id === item.produto);
              const sufixo = prod ? (UNIDADE_BASE_SUFIXO[prod.base_unit] ?? prod.base_unit) : "";
              return (
                <div key={item.key} className="space-y-2 rounded-lg border border-borda p-3">
                  <Select
                    value={item.produto}
                    onValueChange={(v) => atualizarItem(item.key, { produto: v, apresentacao: BASE })}
                  >
                    <SelectTrigger aria-label={`Produto do item ${n + 1}`}>
                      <SelectValue placeholder="Produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {prod && prod.apresentacoes.length > 0 && (
                    <Select
                      value={item.apresentacao}
                      onValueChange={(v) => atualizarItem(item.key, { apresentacao: v })}
                    >
                      <SelectTrigger aria-label={`Apresentação do item ${n + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BASE}>Em {sufixo} (unidade-base)</SelectItem>
                        {prod.apresentacoes.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <MoneyInput
                      kind="quantidade"
                      unit={item.apresentacao === BASE ? sufixo : "emb."}
                      aria-label={`Quantidade do item ${n + 1}`}
                      placeholder="Quantidade"
                      value={item.qtd}
                      onValueChange={(v) => atualizarItem(item.key, { qtd: v })}
                    />
                    <MoneyInput
                      aria-label={`Valor total do item ${n + 1}`}
                      placeholder="Valor total (R$)"
                      value={item.total}
                      onValueChange={(v) => atualizarItem(item.key, { total: v })}
                    />
                  </div>

                  {itens.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setItens((l) => l.filter((x) => x.key !== item.key));
                        err.limparCampo("items");
                      }}
                    >
                      Remover item
                    </Button>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, novoItem()])}>
              Adicionar item
            </Button>
          </div>
        )}
      </Field>

      <Field label="Frete (R$)" id={err.idDe("freight")} error={err.erros.freight} hint="Rateado entre os itens pelo valor.">
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={frete}
            onValueChange={(v) => {
              setFrete(v);
              err.limparCampo("freight");
            }}
          />
        )}
      </Field>

      <p className="rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto">
        Total da compra: <strong>{reaisBr(total / 100)}</strong>{" "}
        <span className="text-texto-secundario">
          (itens {reaisBr(totalItens / 100)} + frete {reaisBr(totalFrete / 100)})
        </span>
      </p>

      <Field label="Forma de pagamento" required id={err.idDe("payment")} error={err.erros.payment}>
        {({ id, ...aria }) => (
          <Select
            value={forma}
            onValueChange={(v) => {
              setForma(v as Kind);
              err.limparCampo("payment");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_ROTULO) as Kind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_ROTULO[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {forma === "a_prazo" && (
        <Field label="Vencimento" required id={err.idDe("due_date")} error={err.erros.due_date}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={vencimento}
              onChange={(e) => {
                setVencimento(e.target.value);
                err.limparCampo("due_date");
              }}
            />
          )}
        </Field>
      )}

      {forma === "parcelada" && (
        <>
          <Field
            label="Entrada (R$)"
            id={err.idDe("down_payment")}
            error={err.erros.down_payment}
            hint="Opcional. A entrada é paga na hora."
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                value={entrada}
                onValueChange={(v) => {
                  setEntrada(v);
                  err.limparCampo("down_payment");
                }}
              />
            )}
          </Field>

          <Field label="Parcelas" required id={err.idDe("installments")} error={err.erros.installments}>
            {({ id, ...aria }) => (
              <div id={id} tabIndex={-1} {...aria} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    inputMode="numeric"
                    aria-label="Número de parcelas"
                    placeholder="Quantas parcelas"
                    value={nParcelas}
                    onChange={(e) => setNParcelas(e.target.value)}
                  />
                  <Input
                    type="date"
                    aria-label="Primeiro vencimento"
                    value={primeiroVenc}
                    onChange={(e) => setPrimeiroVenc(e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={dividir}>
                  Dividir o restante em parcelas mensais
                </Button>

                {parcelas.map((p, n) => (
                  <div key={p.key} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    <MoneyInput
                      aria-label={`Valor da parcela ${n + 1}`}
                      value={p.valor}
                      onValueChange={(v) => atualizarParcela(p.key, { valor: v })}
                      hideEcho
                    />
                    <Input
                      type="date"
                      aria-label={`Vencimento da parcela ${n + 1}`}
                      value={p.vencimento}
                      onChange={(e) => atualizarParcela(p.key, { vencimento: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover parcela ${n + 1}`}
                      onClick={() => {
                        setParcelas((l) => l.filter((x) => x.key !== p.key));
                        err.limparCampo("installments");
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setParcelas((l) => [...l, { key: proximo(), valor: "", vencimento: "" }])}
                >
                  Adicionar parcela
                </Button>

                <p className="text-sm text-texto-secundario">
                  {falta === 0
                    ? "As parcelas fecham o total."
                    : falta > 0
                      ? `Falta fechar ${reaisBr(falta / 100)}.`
                      : `As parcelas passam ${reaisBr(-falta / 100)} do total.`}
                </p>
              </div>
            )}
          </Field>
        </>
      )}
    </FormSheet>
  );
}
