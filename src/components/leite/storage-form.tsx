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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/**
 * Os três gestos de ENTRADA e transferência do leite (§14, §16 e §19).
 *
 * Um painel só, com o gesto escolhido por botão, porque os três respondem à
 * mesma pergunta ("quantos litros, e para onde?") e compartilham data e
 * observação. A retirada (§21) fica de fora deste painel de propósito: ela
 * tem uma composição por dono, que é uma tela de outra natureza.
 *
 * ⚠️ Nenhum dos três mexe em dinheiro. O §17 é literal em que enviar ao ponto
 * de coleta não gera receita, e a descrição do painel diz isso ao produtor,
 * porque é justamente onde ele espera que gere.
 */

type Site = { id: string; name: string; type: "proprio" | "terceiro" };
type Owner = { id: string; name: string };

type Gesto = "armazenar" | "transferir" | "receber";

const ORDEM = [
  "site_id",
  "from_site_id",
  "to_site_id",
  "owner_id",
  "liters",
  "occurred_at",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const GESTOS: { valor: Gesto; botao: string; titulo: string; descricao: string }[] = [
  {
    valor: "armazenar",
    botao: "Guardar no tanque",
    titulo: "Guardar leite no tanque",
    descricao: "O leite da ordenha entra no tanque. Guardar não é vender.",
  },
  {
    valor: "transferir",
    botao: "Levar ao ponto de coleta",
    titulo: "Levar leite ao ponto de coleta",
    descricao: "O leite continua seu, só muda de lugar. Isso não gera receita.",
  },
  {
    valor: "receber",
    botao: "Receber de terceiro",
    titulo: "Receber leite de outro produtor",
    descricao: "Entra no volume do tanque e continua sendo do dono, não vira produção sua.",
  },
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function StorageForm({
  sites,
  owners,
  gestoInicial = "armazenar",
}: {
  sites: Site[];
  owners: Owner[];
  gestoInicial?: Gesto;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "guardar");

  const [gesto, setGesto] = useState<Gesto>(gestoInicial);
  const [siteId, setSiteId] = useState("");
  const [toSiteId, setToSiteId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [liters, setLiters] = useState("");
  const [data, setData] = useState(hoje());
  const [notes, setNotes] = useState("");

  const tanques = sites.filter((s) => s.type === "proprio");
  const pontos = sites.filter((s) => s.type === "terceiro");
  const escolhido = GESTOS.find((g) => g.valor === gesto) ?? GESTOS[0];

  function limpar() {
    setGesto(gestoInicial);
    setSiteId("");
    setToSiteId("");
    setOwnerId("");
    setLiters("");
    setData(hoje());
    setNotes("");
    err.limparTudo();
  }

  function trocarGesto(novo: Gesto) {
    setGesto(novo);
    // Campos que somem do DOM não podem carregar valor: a recusa cairia num
    // campo invisível. Mesma armadilha do `order-form`, em ui.md.
    setToSiteId("");
    setOwnerId("");
    err.limparCampo("to_site_id");
    err.limparCampo("owner_id");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const campoDoLocal: Campo = gesto === "transferir" ? "from_site_id" : "site_id";

    if (!siteId) novos[campoDoLocal] = "Escolha o tanque.";
    if (gesto === "transferir" && !toSiteId) {
      novos.to_site_id = "Escolha o ponto de coleta.";
    }
    if (gesto === "receber" && !ownerId) novos.owner_id = "Escolha o produtor.";

    const litros = lerValorDoCampo(liters);
    if (litros === null || litros <= 0) {
      novos.liters = "Informe quantos litros.";
    }
    if (!data) novos.occurred_at = "Informe a data.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const quando = new Date(`${data}T12:00:00`).toISOString();
    const corpo =
      gesto === "transferir"
        ? { gesto, from_site_id: siteId, to_site_id: toSiteId, liters: litros, occurred_at: quando }
        : gesto === "receber"
          ? { gesto, site_id: siteId, owner_id: ownerId, liters: litros, occurred_at: quando }
          : { gesto, site_id: siteId, liters: litros, occurred_at: quando };

    const res = await apiPost("/api/v1/milk/storage", {
      ...corpo,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Movimentar leite</Button>}
      title={escolhido.titulo}
      description={escolhido.descricao}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">O que aconteceu?</p>
        <div className="flex flex-wrap gap-2">
          {GESTOS.map((g) => (
            <Button
              key={g.valor}
              type="button"
              variant={gesto === g.valor ? "default" : "outline"}
              onClick={() => trocarGesto(g.valor)}
            >
              {g.botao}
            </Button>
          ))}
        </div>
      </div>

      <Field
        label={gesto === "transferir" ? "Tanque de origem" : "Tanque"}
        required
        id={gesto === "transferir" ? "guardar-from_site_id" : "guardar-site_id"}
        error={gesto === "transferir" ? err.erros.from_site_id : err.erros.site_id}
      >
        {({ id, ...aria }) => (
          <Select
            value={siteId}
            onValueChange={(v) => {
              setSiteId(v);
              err.limparCampo(gesto === "transferir" ? "from_site_id" : "site_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o tanque" />
            </SelectTrigger>
            <SelectContent>
              {tanques.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {gesto === "transferir" && (
        <Field
          label="Ponto de coleta"
          required
          id="guardar-to_site_id"
          error={err.erros.to_site_id}
          hint="O leite continua seu depois da entrega."
        >
          {({ id, ...aria }) => (
            <Select
              value={toSiteId}
              onValueChange={(v) => {
                setToSiteId(v);
                err.limparCampo("to_site_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha o ponto de coleta" />
              </SelectTrigger>
              <SelectContent>
                {pontos.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {gesto === "receber" && (
        <Field
          label="De quem é o leite"
          required
          id="guardar-owner_id"
          error={err.erros.owner_id}
          hint="Escolha da lista de contatos. O nome vira o dono de um saldo, então digitar solto partiria o leite dele em dois."
        >
          {({ id, ...aria }) => (
            <Select
              value={ownerId}
              onValueChange={(v) => {
                setOwnerId(v);
                err.limparCampo("owner_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha o produtor" />
              </SelectTrigger>
              <SelectContent>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Litros" required id="guardar-liters" error={err.erros.liters}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="L"
            value={liters}
            onValueChange={(v) => {
              setLiters(v);
              err.limparCampo("liters");
            }}
          />
        )}
      </Field>

      <Field label="Data" required id="guardar-occurred_at" error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      <Field label="Observação" id="guardar-notes" error={err.erros.notes} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
