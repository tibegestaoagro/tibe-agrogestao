"use client";

import { useState } from "react";
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
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { descreverQuantidade, findUnit, recusaPorFracao, disponiveis } from "@/lib/stock/units";
import { lerNumeroBr } from "@/lib/numero-br";

/**
 * Usar e ajustar (§10.3 e §10.6), no mesmo painel.
 *
 * São duas rotas diferentes de propósito (o ajuste pede o saldo REAL contado,
 * não a diferença), mas uma pergunta só na cabeça do produtor: "quanto tem
 * aqui agora?". Separar em dois botões o obrigaria a saber, antes de clicar,
 * qual dos dois conceitos ele está prestes a usar.
 *
 * O saldo disponível aparece assim que o produto é escolhido: sem isso, quem
 * tenta tirar mais do que tem só descobre depois de enviar, e o §10.7 diz
 * "revise a quantidade informada" para alguém que não sabe qual é o teto.
 */

type Produto = {
  id: string;
  name: string;
  unit: string;
  saldo_por_fazenda: { property_id: string; quantity: number }[];
};
type Fazenda = { id: string; name: string };

/**
 * Os campos na ordem visual, com o nome que a API usa.
 *
 * `quantity` serve aos DOIS gestos: no uso é quanto saiu, no ajuste é o saldo
 * contado. São rotas diferentes (`quantity` e `corrected_balance`), mas o
 * campo na tela é um só, e é nele que as duas recusas precisam aparecer.
 */
const ORDEM = ["product_id", "property_id", "quantity", "purpose"] as const;
type Campo = (typeof ORDEM)[number];

export default function StockMovementForm({
  products,
  properties,
  defaultPropertyId,
}: {
  products: Produto[];
  properties: Fazenda[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [acao, setAcao] = useState<"utilizacao" | "ajuste">("utilizacao");
  const [productId, setProductId] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [purpose, setPurpose] = useState("");

  const produto = products.find((p) => p.id === productId);
  const unidade = produto ? findUnit(produto.unit) : null;
  const saldo =
    produto?.saldo_por_fazenda.find((s) => s.property_id === propertyId)?.quantity ?? 0;

  function reset() {
    setAcao("utilizacao");
    setProductId("");
    setQuantity("");
    setPurpose("");
    err.limparTudo();
  }

  /** Reprova um campo só, move o foco para ele e para por aqui. */
  function reprovar(campo: Campo, mensagem: string) {
    err.setGlobal(null);
    err.reprovar({ [campo]: mensagem } as Partial<Record<Campo, string>>);
  }

  async function submit() {
    if (!productId) return reprovar("product_id", "Escolha o produto.");
    if (!propertyId) return reprovar("property_id", "Escolha a fazenda.");

    // `Number("")` é 0, e 0 é finito: sem esta linha, clicar em "Corrigir
    // saldo" com o campo VAZIO mandava `corrected_balance: 0` e zerava o
    // estoque do produto com um clique, sem confirmação e sem como desfazer
    // (movimentação avulsa não tem cancelamento).
    if (!quantity.trim()) {
      return reprovar(
        "quantity",
        acao === "utilizacao" ? "Informe quanto você usou." : "Informe quanto tem de verdade.",
      );
    }
    /**
     * `lerNumeroBr`, nao `Number`: "1.500" e como o produtor escreve mil e
     * quinhentos, e `Number` devolvia 1,5. Num campo que SOBRESCREVE o saldo
     * com um clique, e sem cancelamento de movimentacao avulsa, o erro de mil
     * vezes so seria descoberto contando o galpao de novo.
     *
     * A correcao foi feita antes no WhatsApp e esqueceu a tela, que e a outra
     * borda do mesmo campo. Por isso a funcao mudou de casa: agora e modulo
     * puro, e os dois lados leem igual.
     */
    const numero = lerNumeroBr(quantity);
    if (numero == null) return reprovar("quantity", "Não entendi a quantidade.");
    if (acao === "utilizacao" && numero <= 0) {
      return reprovar("quantity", "A quantidade precisa ser maior que zero.");
    }
    if (acao === "ajuste" && numero < 0) {
      return reprovar("quantity", "O saldo contado não pode ser negativo.");
    }
    // A MESMA funcao do servidor e do WhatsApp: a tela dizia "sem quantidade
    // quebrada" e o servidor "que nao aceita quantidade quebrada", duas
    // redacoes para a mesma regra.
    const recusa = produto ? recusaPorFracao(produto.name, numero, produto.unit) : null;
    if (recusa) return reprovar("quantity", recusa);
    // §10.7 conferido aqui também, e não só no servidor: quem está com o
    // produto na mão merece saber o teto antes de enviar.
    if (acao === "utilizacao" && numero > saldo) {
      return reprovar(
        "quantity",
        `Existem apenas ${descreverQuantidade(saldo, produto!.unit)} ${disponiveis(saldo)}. Revise a quantidade informada.`,
      );
    }

    err.limparTudo();
    setLoading(true);
    const res =
      acao === "utilizacao"
        ? await apiPost("/api/v1/stock/movements", {
            product_id: productId,
            property_id: propertyId,
            movement_type: "utilizacao",
            quantity: numero,
            purpose: purpose.trim() || null,
          })
        : await apiPost("/api/v1/stock/adjust", {
            product_id: productId,
            property_id: propertyId,
            corrected_balance: numero,
            reason: purpose.trim() || null,
          });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Usar ou corrigir</Button>}
      title={acao === "utilizacao" ? "Usar do estoque" : "Corrigir o estoque"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel={acao === "utilizacao" ? "Registrar uso" : "Corrigir saldo"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="flex gap-2">
        <Button
          type="button"
          variant={acao === "utilizacao" ? "default" : "outline"}
          className="flex-1"
          onClick={() => {
            setAcao("utilizacao");
            setQuantity("");
            err.limparTudo();
          }}
        >
          Usei
        </Button>
        <Button
          type="button"
          variant={acao === "ajuste" ? "default" : "outline"}
          className="flex-1"
          onClick={() => {
            setAcao("ajuste");
            setQuantity("");
            err.limparTudo();
          }}
        >
          Contei e está diferente
        </Button>
      </div>

      <Field label="Produto" required id="product_id" error={err.erros.product_id}>
        {({ id, ...aria }) => (
          <Select
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              err.limparCampo("product_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o produto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {properties.length > 1 && (
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
                <SelectValue />
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
      )}

      {produto && (
        <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
          Tem hoje: <strong>{descreverQuantidade(saldo, produto.unit)}</strong>
        </p>
      )}

      <Field
        label={acao === "utilizacao" ? "Quanto você usou" : "Quanto tem de verdade"}
        required
        id="quantity"
        error={err.erros.quantity}
        hint={
          acao === "ajuste"
            ? "Informe o que você contou. A diferença o sistema calcula sozinho."
            : undefined
        }
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              err.limparCampo("quantity");
            }}
            placeholder={unidade ? `Em ${unidade.plural}` : ""}
          />
        )}
      </Field>

      <Field
        label={acao === "utilizacao" ? "Para quê (opcional)" : "Motivo (opcional)"}
        id="purpose"
        error={err.erros.purpose}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={
              acao === "utilizacao" ? "Sal para o lote do curral" : "Contagem do galpão"
            }
          />
        )}
      </Field>
    </FormSheet>
  );
}
