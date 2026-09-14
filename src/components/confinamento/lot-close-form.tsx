"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Encerrar um lote de confinamento, total ou parcial (§17 a §21 do documento
 * do cliente).
 *
 * Reusa a rota de encerramento de estadia (`POST /api/v1/herd/stays/:id/close`)
 * com formulário próprio: esta tela abre um painel por lote, e cada um precisa
 * de ids de campo isolados.
 *
 * Os destinos têm CHAVE própria, e não o tipo de movimento, porque desde
 * 14/09/2026 (dívida 2.8) três deles são `retorno_estadia` com complementos
 * diferentes: pasto, outra fazenda, outro confinamento e leilão. "Frigorífico"
 * não é destino à parte: é a venda, com o frigorífico como comprador.
 */

type ChaveDestino = "pasto" | "outra_fazenda" | "outro_confinamento" | "leilao" | "venda" | "morte" | "outro";

const DESTINOS: { chave: ChaveDestino; rotulo: string }[] = [
  { chave: "pasto", rotulo: "Voltaram para o pasto" },
  { chave: "outra_fazenda", rotulo: "Foram para outra fazenda" },
  { chave: "outro_confinamento", rotulo: "Foram para outro confinamento" },
  { chave: "leilao", rotulo: "Foram para leilão ou feira" },
  { chave: "venda", rotulo: "Vendidos (inclusive para frigorífico)" },
  { chave: "morte", rotulo: "Morreram" },
  { chave: "outro", rotulo: "Outro destino" },
];

// Os complementos usam o nome do campo NA API, que é o que a recusa do
// servidor traz em `field`. `pasture_outra` é só da tela: a lista de pastos
// dela já vem filtrada pela fazenda escolhida, e o servidor não tem como
// recusar pasto por ela.
const ORDEM = [
  ...DESTINOS.map((d) => d.chave),
  "quantity",
  "pasture_id",
  "property_id",
  "pasture_outra",
  "confinement_site_id",
  "event_name",
  "value",
  "contact_name",
  "organizer_name",
  "due_date",
  "reason",
] as const;
type Campo = (typeof ORDEM)[number];

type Opcao = { id: string; name: string };

export default function LotCloseForm({
  stayId,
  saldoAberto,
  descricao,
  propertyId,
  properties,
  pastures,
  sites,
}: {
  stayId: string;
  saldoAberto: number;
  descricao: string;
  /** Fazenda deste lote: os pastos de "voltaram para o pasto" são dela (§18). */
  propertyId: string;
  properties: Opcao[];
  pastures: (Opcao & { property_id: string })[];
  /** Confinamentos ativos, sem o deste lote. */
  sites: Opcao[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `encerrar-${stayId}`);

  const [valores, setValores] = useState<Partial<Record<ChaveDestino, string>>>({});
  const [pastureId, setPastureId] = useState("");
  const [outraFazenda, setOutraFazenda] = useState("");
  const [pastoOutra, setPastoOutra] = useState("");
  const [siteId, setSiteId] = useState("");
  const [evento, setEvento] = useState("");
  const [organizador, setOrganizador] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [comprador, setComprador] = useState("");
  const [recebido, setRecebido] = useState(false);
  const [vencimento, setVencimento] = useState("");
  const [motivo, setMotivo] = useState("");

  const qtd = (chave: ChaveDestino) => lerValorDoCampo(valores[chave] ?? "") ?? 0;
  const informado = useMemo(
    () => DESTINOS.reduce((soma, d) => soma + (lerValorDoCampo(valores[d.chave] ?? "") ?? 0), 0),
    [valores],
  );
  const falta = saldoAberto - informado;
  const outrasFazendas = properties.filter((p) => p.id !== propertyId);
  const destinosVisiveis = DESTINOS.filter(
    (d) =>
      (d.chave !== "outra_fazenda" || outrasFazendas.length > 0) &&
      (d.chave !== "outro_confinamento" || sites.length > 0),
  );

  function limpar() {
    setValores({});
    setPastureId("");
    setOutraFazenda("");
    setPastoOutra("");
    setSiteId("");
    setEvento("");
    setOrganizador("");
    setValorVenda("");
    setComprador("");
    setRecebido(false);
    setVencimento("");
    setMotivo("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    // Somar mais do que está no lote é recusado (pelo servidor também); somar
    // menos deixa o lote aberto com o restante (§20).
    if (falta < 0) {
      novos.quantity = `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão no lote.`;
    }
    // Cada complemento só é cobrado quando o destino dele tem cabeças: campo
    // que não está na tela não pode receber o foco da recusa.
    if (qtd("outra_fazenda") > 0 && !outraFazenda) novos.property_id = "Escolha a fazenda.";
    if (qtd("outro_confinamento") > 0 && !siteId) novos.confinement_site_id = "Escolha o confinamento.";
    if (qtd("leilao") > 0 && !evento.trim()) novos.event_name = "Informe o nome do leilão ou da feira.";
    const valor = lerValorDoCampo(valorVenda);
    if (qtd("venda") > 0 && valor != null && valor > 0 && !recebido && !vencimento) {
      novos.due_date = "Informe quando vai receber.";
    }
    if (qtd("outro") > 0 && !motivo.trim()) novos.reason = "Diga para onde os animais foram.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    const destinos = [
      { movement_type: "retorno_estadia", quantity: qtd("pasto"), pasture_id: pastureId || null },
      {
        movement_type: "retorno_estadia",
        quantity: qtd("outra_fazenda"),
        property_id: outraFazenda || null,
        pasture_id: pastoOutra || null,
      },
      { movement_type: "retorno_estadia", quantity: qtd("outro_confinamento"), confinement_site_id: siteId || null },
      {
        movement_type: "retorno_estadia",
        quantity: qtd("leilao"),
        evento: { event_name: evento.trim(), organizer_name: organizador.trim() || null },
      },
      {
        movement_type: "venda",
        quantity: qtd("venda"),
        value: valor,
        contact_name: comprador.trim() || null,
        pago: recebido,
        due_date: !recebido && vencimento ? new Date(`${vencimento}T12:00:00`).toISOString() : null,
      },
      { movement_type: "morte", quantity: qtd("morte") },
      { movement_type: "ajuste", quantity: qtd("outro"), reason: motivo.trim() || null },
    ].filter((d) => d.quantity > 0);

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string; encerrada: boolean; saldo_aberto: number }>(
      `/api/v1/herd/stays/${stayId}/close`,
      { destinos },
    );
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    aviso.sucesso(
      res.data.encerrada
        ? "Lote encerrado."
        : `Encerramento parcial registrado. Ainda restam ${res.data.saldo_aberto.toLocaleString("pt-BR")} cabeças no lote.`,
    );
    setOpen(false);
    limpar();
    router.refresh();
  }

  const selecao = (
    campo: Campo,
    label: string,
    valor: string,
    mudar: (v: string) => void,
    opcoes: Opcao[],
    placeholder: string,
    opts: { required?: boolean; hint?: string } = {},
  ) => (
    <Field label={label} required={opts.required} hint={opts.hint} id={err.idDe(campo)} error={err.erros[campo]}>
      {({ id, ...aria }) => (
        <Select
          value={valor}
          onValueChange={(v) => {
            mudar(v);
            err.limparCampo(campo);
          }}
        >
          <SelectTrigger id={id} {...aria}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );

  const texto = (
    campo: Campo,
    label: string,
    valor: string,
    mudar: (v: string) => void,
    opts: { required?: boolean; hint?: string } = {},
  ) => (
    <Field label={label} required={opts.required} hint={opts.hint} id={err.idDe(campo)} error={err.erros[campo]}>
      {({ id, ...aria }) => (
        <Input
          id={id}
          {...aria}
          value={valor}
          onChange={(e) => {
            mudar(e.target.value);
            err.limparCampo(campo);
          }}
        />
      )}
    </Field>
  );

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Encerrar
        </Button>
      }
      title="Encerrar lote"
      description={descricao}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Encerrar"
      submitPendingLabel="Encerrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        Estão no lote{" "}
        <span className="tabular-nums font-medium text-texto">{saldoAberto.toLocaleString("pt-BR")}</span>{" "}
        {saldoAberto === 1 ? "cabeça" : "cabeças"}. Diga para onde cada uma foi.
      </p>

      {destinosVisiveis.map((destino, indice) => (
        <div key={destino.chave} className="space-y-3">
          {/* A recusa de quantidade do `closeStay` vem com `field: "quantity"`,
              que não é o id de nenhum destino: o primeiro campo a carrega. */}
          <Field
            label={destino.rotulo}
            id={err.idDe(destino.chave)}
            error={err.erros[destino.chave] ?? (indice === 0 ? err.erros.quantity : undefined)}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="cabeças"
                value={valores[destino.chave] ?? ""}
                onValueChange={(v) => {
                  setValores((atuais) => ({ ...atuais, [destino.chave]: v }));
                  err.limparCampo("quantity");
                }}
              />
            )}
          </Field>

          {destino.chave === "pasto" && qtd("pasto") > 0 &&
            selecao(
              "pasture_id",
              "Pasto de destino",
              pastureId,
              setPastureId,
              pastures.filter((p) => p.property_id === propertyId),
              "Sem pasto informado",
              { hint: "Opcional." },
            )}

          {destino.chave === "outra_fazenda" && qtd("outra_fazenda") > 0 && (
            <>
              {selecao(
                "property_id",
                "Fazenda de destino",
                outraFazenda,
                (v) => {
                  setOutraFazenda(v);
                  setPastoOutra("");
                },
                outrasFazendas,
                "Escolha a fazenda",
                { required: true },
              )}
              {outraFazenda &&
                selecao(
                  "pasture_outra",
                  "Pasto na fazenda de destino",
                  pastoOutra,
                  setPastoOutra,
                  pastures.filter((p) => p.property_id === outraFazenda),
                  "Sem pasto informado",
                  { hint: "Opcional." },
                )}
            </>
          )}

          {destino.chave === "outro_confinamento" && qtd("outro_confinamento") > 0 &&
            selecao("confinement_site_id", "Confinamento de destino", siteId, setSiteId, sites, "Escolha o confinamento", {
              required: true,
              hint: "Um lote novo abre lá, e a contagem de dias recomeça.",
            })}

          {destino.chave === "leilao" && qtd("leilao") > 0 && (
            <>
              {texto("event_name", "Nome do leilão ou da feira", evento, setEvento, { required: true })}
              {texto("organizer_name", "Leiloeira ou organizador", organizador, setOrganizador, {
                hint: "Opcional. A venda só vira receita quando você encerrar a remessa em Negociações.",
              })}
            </>
          )}

          {destino.chave === "venda" && qtd("venda") > 0 && (
            <>
              <Field label="Valor da venda" hint="Vira a receita da negociação." id={err.idDe("value")} error={err.erros.value}>
                {({ id, ...aria }) => (
                  <MoneyInput
                    id={id}
                    {...aria}
                    value={valorVenda}
                    onValueChange={(v) => {
                      setValorVenda(v);
                      err.limparCampo("value");
                    }}
                  />
                )}
              </Field>
              {texto("contact_name", "Comprador", comprador, setComprador, {
                hint: "Opcional. O frigorífico ou quem comprou.",
              })}
              <div className="space-y-1">
                <p className="text-sm font-medium text-texto">Você já recebeu?</p>
                <div className="flex gap-2">
                  {(
                    [
                      [false, "Vou receber"],
                      [true, "Recebi"],
                    ] as const
                  ).map(([v, rotulo]) => (
                    <Button
                      key={String(v)}
                      type="button"
                      variant={recebido === v ? "default" : "outline"}
                      onClick={() => {
                        setRecebido(v);
                        if (v) {
                          setVencimento("");
                          err.limparCampo("due_date");
                        }
                      }}
                    >
                      {rotulo}
                    </Button>
                  ))}
                </div>
              </div>
              {!recebido && (
                <Field label="Data prevista de recebimento" id={err.idDe("due_date")} error={err.erros.due_date}>
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
            </>
          )}

          {destino.chave === "outro" && qtd("outro") > 0 &&
            texto("reason", "Para onde foram", motivo, setMotivo, {
              required: true,
              hint: "Saem do rebanho. Exemplo: doados ao vizinho.",
            })}
        </div>
      ))}

      <p
        className={
          falta < 0
            ? "text-sm text-perigo-tinta"
            : falta === 0
              ? "text-sm font-medium text-sucesso-tinta"
              : "text-sm text-texto-secundario"
        }
      >
        {falta === 0
          ? "A conta fecha: os destinos somam tudo que está no lote."
          : falta > 0
            ? `Encerramento parcial: ${falta.toLocaleString("pt-BR")} cabeças continuam no lote depois de salvar.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que há no lote.`}
      </p>
    </FormSheet>
  );
}
