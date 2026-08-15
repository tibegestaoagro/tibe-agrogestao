"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/client-api";
import { descreverQuantidade, findUnit, recusaPorFracao } from "@/lib/stock/units";
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!productId) return setError("Escolha o produto.");
    if (!propertyId) return setError("Escolha a fazenda.");

    // `Number("")` é 0, e 0 é finito: sem esta linha, clicar em "Corrigir
    // saldo" com o campo VAZIO mandava `corrected_balance: 0` e zerava o
    // estoque do produto com um clique, sem confirmação e sem como desfazer
    // (movimentação avulsa não tem cancelamento).
    if (!quantity.trim()) {
      return setError(
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
    if (numero == null) return setError("Não entendi a quantidade.");
    if (acao === "utilizacao" && numero <= 0) {
      return setError("A quantidade precisa ser maior que zero.");
    }
    if (acao === "ajuste" && numero < 0) {
      return setError("O saldo contado não pode ser negativo.");
    }
    // A MESMA funcao do servidor e do WhatsApp: a tela dizia "sem quantidade
    // quebrada" e o servidor "que nao aceita quantidade quebrada", duas
    // redacoes para a mesma regra.
    const recusa = produto ? recusaPorFracao(produto.name, numero, produto.unit) : null;
    if (recusa) return setError(recusa);
    // §10.7 conferido aqui também, e não só no servidor: quem está com o
    // produto na mão merece saber o teto antes de enviar.
    if (acao === "utilizacao" && numero > saldo) {
      return setError(
        `Existem apenas ${descreverQuantidade(saldo, produto!.unit)} disponíveis. Revise a quantidade informada.`,
      );
    }

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

    if (!res.ok) return setError(res.message);
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">Usar ou corrigir</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{acao === "utilizacao" ? "Usar do estoque" : "Corrigir o estoque"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={acao === "utilizacao" ? "default" : "outline"}
              className="flex-1"
              onClick={() => {
                setAcao("utilizacao");
                setQuantity("");
                setError(null);
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
                setError(null);
              }}
            >
              Contei e está diferente
            </Button>
          </div>

          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
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
          </div>

          {properties.length > 1 && (
            <div>
              <Label>Fazenda</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
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
            </div>
          )}

          {produto && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Tem hoje: <strong>{descreverQuantidade(saldo, produto.unit)}</strong>
            </p>
          )}

          <div>
            <Label htmlFor="estoque-qtd">
              {acao === "utilizacao" ? "Quanto você usou" : "Quanto tem de verdade"}
            </Label>
            <Input
              id="estoque-qtd"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={unidade ? `Em ${unidade.plural}` : ""}
            />
            {acao === "ajuste" && (
              <p className="mt-1 text-xs text-gray-500">
                Informe o que você contou. A diferença o sistema calcula sozinho.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="estoque-motivo">
              {acao === "utilizacao" ? "Para quê (opcional)" : "Motivo (opcional)"}
            </Label>
            <Input
              id="estoque-motivo"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={acao === "utilizacao" ? "Sal para o lote do curral" : "Contagem do galpão"}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : acao === "utilizacao" ? "Registrar uso" : "Corrigir saldo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
