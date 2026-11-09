"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch, apiPost } from "@/lib/client-api";
import { REGRA_DIA_UTIL_PADRAO } from "@/lib/emporio/cartao";
import { lerNumeroBr } from "@/lib/numero-br";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = [
  "name",
  "business_day_rule",
  "refunds_mdr_on_cancel",
  "auto_anticipation_enabled",
  "auto_anticipation_pct_month",
  "auto_anticipation_business_days",
  "auto_anticipation_since",
] as const;
type Campo = (typeof ORDEM)[number];

/** O que o painel precisa saber de uma adquirente que já existe. */
export type AdquirenteEditavel = {
  id: string;
  name: string;
  business_day_rule: "proximo_dia_util" | "dias_corridos";
  refunds_mdr_on_cancel: boolean;
  auto_anticipation_enabled: boolean;
  auto_anticipation_pct_month: number | null;
  auto_anticipation_business_days: number;
  auto_anticipation_since: string | null;
};

const paraCampo = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** Cria uma adquirente, ou edita a que vem em `adquirente` (Dono e Gerente geral). */
export function AdquirenteForm({ adquirente }: { adquirente?: AdquirenteEditavel }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `adquirente-${adquirente?.id ?? "nova"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState(adquirente?.name ?? "");
  const [regra, setRegra] = useState<string>(adquirente?.business_day_rule ?? REGRA_DIA_UTIL_PADRAO);
  const [devolve, setDevolve] = useState<string>(adquirente?.refunds_mdr_on_cancel === false ? "nao" : "sim");
  const [automatica, setAutomatica] = useState<string>(adquirente?.auto_anticipation_enabled ? "sim" : "nao");
  const [pct, setPct] = useState(paraCampo(adquirente?.auto_anticipation_pct_month ?? null));
  const [diasUteis, setDiasUteis] = useState(String(adquirente?.auto_anticipation_business_days ?? 1));
  const [desde, setDesde] = useState(adquirente?.auto_anticipation_since ?? "");

  function reabrir() {
    setNome(adquirente?.name ?? "");
    setRegra(adquirente?.business_day_rule ?? REGRA_DIA_UTIL_PADRAO);
    setDevolve(adquirente?.refunds_mdr_on_cancel === false ? "nao" : "sim");
    setAutomatica(adquirente?.auto_anticipation_enabled ? "sim" : "nao");
    setPct(paraCampo(adquirente?.auto_anticipation_pct_month ?? null));
    setDiasUteis(String(adquirente?.auto_anticipation_business_days ?? 1));
    setDesde(adquirente?.auto_anticipation_since ?? "");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const ligada = automatica === "sim";
    const pctN = lerNumeroBr(pct);
    const diasN = lerNumeroBr(diasUteis);
    if (nome.trim() === "") novos.name = "Dê um nome à adquirente.";
    if (ligada) {
      if (pctN === null || pctN <= 0) novos.auto_anticipation_pct_month = "Informe a taxa da antecipação, ao mês.";
      if (diasN === null || diasN < 0) novos.auto_anticipation_business_days = "Informe quantos dias úteis a antecipação leva para cair.";
      if (desde === "") novos.auto_anticipation_since = "Informe a data em que a antecipação automática começa.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    const corpo: Record<string, unknown> = {
      name: nome.trim(),
      business_day_rule: regra,
      refunds_mdr_on_cancel: devolve === "sim",
      auto_anticipation_enabled: ligada,
    };
    if (ligada) {
      corpo.auto_anticipation_pct_month = pctN;
      corpo.auto_anticipation_business_days = diasN;
      corpo.auto_anticipation_since = desde;
    }
    setLoading(true);
    const res = adquirente
      ? await apiPatch(`/api/v1/emporio/card-acquirers/${adquirente.id}`, corpo)
      : await apiPost("/api/v1/emporio/card-acquirers", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(adquirente ? "Adquirente atualizada." : "Adquirente cadastrada.");
    setOpen(false);
    if (!adquirente) reabrir();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        adquirente ? (
          <Button variant="outline" size="sm">
            Editar
          </Button>
        ) : (
          <Button>Nova adquirente</Button>
        )
      }
      title={adquirente ? "Editar adquirente" : "Nova adquirente"}
      description="A empresa da maquininha (Cielo, Stone, Rede, a máquina do banco). A taxa e o prazo ficam por adquirente."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reabrir();
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={adquirente ? "Salvar" : "Cadastrar adquirente"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <Field
        label="Regra de dia útil"
        id={err.idDe("business_day_rule")}
        error={err.erros.business_day_rule}
        hint="Como a adquirente conta o prazo: se a parcela cai num fim de semana ou feriado, vai para o próximo dia útil ou fica na data corrida."
      >
        {({ id, ...aria }) => (
          <Select
            value={regra}
            onValueChange={(v) => {
              setRegra(v);
              err.limparCampo("business_day_rule");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="proximo_dia_util">Próximo dia útil</SelectItem>
              <SelectItem value="dias_corridos">Dias corridos</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Devolve a taxa no cancelamento"
        id={err.idDe("refunds_mdr_on_cancel")}
        error={err.erros.refunds_mdr_on_cancel}
      >
        {({ id, ...aria }) => (
          <Select
            value={devolve}
            onValueChange={(v) => {
              setDevolve(v);
              err.limparCampo("refunds_mdr_on_cancel");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Sim, devolve</SelectItem>
              <SelectItem value="nao">Não, a taxa fica</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Antecipação automática"
        id={err.idDe("auto_anticipation_enabled")}
        error={err.erros.auto_anticipation_enabled}
        hint="Quando a adquirente já antecipa sozinha as vendas no crédito."
      >
        {({ id, ...aria }) => (
          <Select
            value={automatica}
            onValueChange={(v) => {
              setAutomatica(v);
              err.limparCampo("auto_anticipation_enabled");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Desligada</SelectItem>
              <SelectItem value="sim">Ligada</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {automatica === "sim" && (
        <>
          <Field
            label="Taxa da antecipação (% ao mês)"
            required
            id={err.idDe("auto_anticipation_pct_month")}
            error={err.erros.auto_anticipation_pct_month}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="% ao mês"
                value={pct}
                onValueChange={(v) => {
                  setPct(v);
                  err.limparCampo("auto_anticipation_pct_month");
                }}
              />
            )}
          </Field>

          <Field
            label="Dias úteis até cair"
            required
            id={err.idDe("auto_anticipation_business_days")}
            error={err.erros.auto_anticipation_business_days}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="dias úteis"
                value={diasUteis}
                onValueChange={(v) => {
                  setDiasUteis(v);
                  err.limparCampo("auto_anticipation_business_days");
                }}
              />
            )}
          </Field>

          <Field
            label="A partir de"
            required
            id={err.idDe("auto_anticipation_since")}
            error={err.erros.auto_anticipation_since}
            hint="Só as vendas desta data em diante nascem antecipadas."
          >
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  err.limparCampo("auto_anticipation_since");
                }}
              />
            )}
          </Field>
        </>
      )}
    </FormSheet>
  );
}

/** Arquivar e reativar não têm formulário: a recusa vai para o aviso. */
export function AdquirenteArquivarBotao({ id, arquivada }: { id: string; arquivada: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function alternar() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/card-acquirers/${id}`, { archived: !arquivada });
    setLoading(false);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(arquivada ? "Adquirente reativada." : "Adquirente arquivada.");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" disabled={loading} onClick={alternar}>
      {arquivada ? "Reativar" : "Arquivar"}
    </Button>
  );
}
