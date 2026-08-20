"use client";

import { useMemo, useState } from "react";
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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/client-api";
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * Registrar movimentação (Módulo 30).
 *
 * Importa `@/lib/herd/categories` (módulo puro, sem Prisma) e NUNCA
 * `@/lib/actions/herd-ledger`, que arrastaria o Prisma para o bundle do
 * navegador: mesma armadilha já documentada para `@/lib/permissions`.
 *
 * A fase 1 sempre envia `situation: "presente"` e `owner: "proprio"`. Os
 * outros valores desses dois eixos existem no banco desde já, mas só ganham
 * fluxo próprio na fase 2 (leilão, boitel, confinamento, pasto de terceiro).
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };

type Shape = "entrada" | "saida" | "transferencia" | "ajuste";

const TYPES: { id: string; label: string; shape: Shape; group: string }[] = [
  { id: "saldo_inicial", label: "Saldo inicial", shape: "entrada", group: "Entradas" },
  { id: "nascimento", label: "Nascimento", shape: "entrada", group: "Entradas" },
  { id: "compra", label: "Compra", shape: "entrada", group: "Entradas" },
  { id: "venda", label: "Venda", shape: "saida", group: "Saídas" },
  { id: "morte", label: "Morte", shape: "saida", group: "Saídas" },
  { id: "transferencia_pasto", label: "Mudar de pasto", shape: "transferencia", group: "Movimentações" },
  { id: "transferencia_fazenda", label: "Mudar de fazenda", shape: "transferencia", group: "Movimentações" },
  { id: "mudanca_categoria", label: "Mudar de categoria", shape: "transferencia", group: "Movimentações" },
  { id: "ajuste", label: "Ajuste de saldo", shape: "ajuste", group: "Correção" },
];

const WITH_VALUE = new Set(["compra", "venda"]);

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementForm({
  properties,
  pastures,
  defaultPropertyId,
}: {
  properties: Property[];
  pastures: Pasture[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [ajusteDirection, setAjusteDirection] = useState<"aumentar" | "diminuir">("aumentar");

  const primeiraFazenda = defaultPropertyId ?? properties[0]?.id ?? "";
  const [fromCategory, setFromCategory] = useState("");
  const [fromProperty, setFromProperty] = useState(primeiraFazenda);
  const [fromPasture, setFromPasture] = useState("");
  const [toCategory, setToCategory] = useState("");
  const [toProperty, setToProperty] = useState(primeiraFazenda);
  const [toPasture, setToPasture] = useState("");

  const shape = useMemo(() => TYPES.find((t) => t.id === type)?.shape ?? null, [type]);
  const precisaOrigem = shape === "saida" || shape === "transferencia" || (shape === "ajuste" && ajusteDirection === "diminuir");
  const precisaDestino = shape === "entrada" || shape === "transferencia" || (shape === "ajuste" && ajusteDirection === "aumentar");

  const pastosDaOrigem = pastures.filter((p) => p.property_id === fromProperty);
  const pastosDoDestino = pastures.filter((p) => p.property_id === toProperty);

  function reset() {
    setType("");
    setQuantity("1");
    setValue("");
    setOccurredAt(hoje());
    setReason("");
    setNotes("");
    setAjusteDirection("aumentar");
    setFromCategory("");
    setFromPasture("");
    setToCategory("");
    setToPasture("");
    setError(null);
  }

  function posicao(category: string, property: string, pasture: string) {
    return {
      category_id: category,
      property_id: property,
      pasture_id: pasture || null,
      situation: "presente" as const,
      owner: "proprio" as const,
    };
  }

  async function submit() {
    setError(null);
    const qtd = lerValorDoCampo(quantity) ?? 0;
    if (!type) return setError("Escolha o tipo de movimentação.");
    if (!Number.isInteger(qtd) || qtd <= 0) return setError("Informe uma quantidade inteira maior que zero.");
    if (precisaOrigem && (!fromCategory || !fromProperty)) {
      return setError("Informe a categoria e a fazenda de origem.");
    }
    if (precisaDestino && (!toCategory || !toProperty)) {
      return setError("Informe a categoria e a fazenda de destino.");
    }

    setLoading(true);
    const res = await apiPost("/api/v1/herd/movements", {
      movement_type: type,
      quantity: qtd,
      from: precisaOrigem ? posicao(fromCategory, fromProperty, fromPasture) : null,
      to: precisaDestino ? posicao(toCategory, toProperty, toPasture) : null,
      value: WITH_VALUE.has(type) ? lerValorDoCampo(value) : null,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : null,
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  const blocoPosicao = (
    titulo: string,
    category: string,
    setCategory: (v: string) => void,
    property: string,
    setProperty: (v: string) => void,
    pasture: string,
    setPasture: (v: string) => void,
    pastosDisponiveis: Pasture[],
  ) => (
    <div className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <div>
        <Label>Categoria</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha a categoria" />
          </SelectTrigger>
          <SelectContent>
            {HERD_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Fazenda</Label>
        <Select
          value={property}
          onValueChange={(v) => {
            setProperty(v);
            setPasture("");
          }}
        >
          <SelectTrigger>
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
      </div>
      {pastosDisponiveis.length > 0 && (
        <div>
          <Label>Pasto (opcional)</Label>
          <Select value={pasture} onValueChange={setPasture}>
            <SelectTrigger>
              <SelectValue placeholder="Sem pasto informado" />
            </SelectTrigger>
            <SelectContent>
              {pastosDisponiveis.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button>Registrar movimentação</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Registrar movimentação</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <Label>O que aconteceu</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.group}: {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shape === "ajuste" && (
            <div>
              <Label>O ajuste</Label>
              <Select
                value={ajusteDirection}
                onValueChange={(v) => setAjusteDirection(v as "aumentar" | "diminuir")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aumentar">Aumenta o saldo</SelectItem>
                  <SelectItem value="diminuir">Diminui o saldo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="mov-qtd">Quantidade de cabeças</Label>
            <MoneyInput
              id="mov-qtd"
              kind="quantidade"
              unit="cabeças"
              value={quantity}
              onValueChange={setQuantity}
            />
          </div>

          {precisaOrigem &&
            blocoPosicao(
              shape === "transferencia" ? "De onde sai" : "De onde",
              fromCategory,
              setFromCategory,
              fromProperty,
              setFromProperty,
              fromPasture,
              setFromPasture,
              pastosDaOrigem,
            )}

          {precisaDestino &&
            blocoPosicao(
              shape === "transferencia" ? "Para onde vai" : "Onde entra",
              toCategory,
              setToCategory,
              toProperty,
              setToProperty,
              toPasture,
              setToPasture,
              pastosDoDestino,
            )}

          {type && WITH_VALUE.has(type) && (
            <div>
              <Label htmlFor="mov-valor">
                Valor total em R$ (opcional, gera lançamento no Financeiro)
              </Label>
              <MoneyInput
                id="mov-valor"
                value={value}
                onValueChange={setValue}
              />
            </div>
          )}

          <div>
            <Label htmlFor="mov-data">Data</Label>
            <Input
              id="mov-data"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="mov-motivo">Motivo (opcional)</Label>
            <Input
              id="mov-motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: contagem física"
            />
          </div>

          <div>
            <Label htmlFor="mov-obs">Observação (opcional)</Label>
            <Input
              id="mov-obs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Registrando..." : "Registrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
