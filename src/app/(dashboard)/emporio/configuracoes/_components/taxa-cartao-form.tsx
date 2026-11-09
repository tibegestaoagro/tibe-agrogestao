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
import { BANDEIRAS, ROTULO_DA_BANDEIRA } from "@/lib/emporio/cartao";
import { lerNumeroBr } from "@/lib/numero-br";
import type { TaxaView } from "@/lib/actions/emporio-cartoes";
import { paraCampo } from "../../_components/formato";
import { CARTAO_ROTULO } from "../../_components/venda-rotulos";

/** Ordem VISUAL, com os nomes que a API usa. */
const ORDEM = [
  "establishment_id",
  "acquirer_id",
  "brand",
  "kind",
  "installments_from",
  "installments_to",
  "fee_pct",
  "fee_fixed",
  "days",
  "bank_account_id",
  "valid_from",
  "valid_to",
] as const;
type Campo = (typeof ORDEM)[number];

export type ModoDaTaxa = "nova" | "editar" | "vigencia";

type Opcao = { id: string; name: string };

const TITULO: Record<ModoDaTaxa, string> = {
  nova: "Nova taxa de cartão",
  editar: "Editar taxa de cartão",
  vigencia: "Nova vigência da taxa",
};

/**
 * Uma linha da tabela de taxas. O mesmo painel faz três coisas: cria a linha
 * (`nova`), corrige uma que nenhuma venda usou (`editar`, PATCH) e abre a
 * vigência seguinte de uma que já vale (`vigencia`, POST renew: o servidor
 * encerra a antiga na véspera). Há um painel por linha e por modo: o prefixo
 * leva os dois.
 */
export function TaxaCartaoForm({
  modo,
  taxa,
  lojas,
  adquirentes,
  contas,
}: {
  modo: ModoDaTaxa;
  taxa?: TaxaView;
  lojas: Opcao[];
  adquirentes: Opcao[];
  contas: Opcao[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `taxa-${taxa?.id ?? "nova"}-${modo}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const inicial = () => ({
    loja: taxa?.establishment_id ?? (lojas.length === 1 ? lojas[0].id : ""),
    adquirente: taxa?.acquirer_id ?? (adquirentes.length === 1 ? adquirentes[0].id : ""),
    bandeira: taxa?.brand ?? "",
    forma: taxa?.kind ?? "",
    de: taxa ? String(taxa.installments_from) : "1",
    ate: taxa ? String(taxa.installments_to) : "1",
    pct: taxa ? paraCampo(taxa.fee_pct) : "",
    fixa: taxa && taxa.fee_fixed > 0 ? paraCampo(taxa.fee_fixed) : "",
    dias: taxa ? String(taxa.days) : "",
    conta: taxa?.bank_account_id ?? "",
    desde: modo === "editar" && taxa ? taxa.valid_from : "",
    ate_dia: modo === "editar" && taxa?.valid_to ? taxa.valid_to : "",
  });
  const [v, setV] = useState(inicial);

  function mudar<K extends keyof ReturnType<typeof inicial>>(chave: K, valor: ReturnType<typeof inicial>[K], campo: Campo) {
    setV((atual) => ({ ...atual, [chave]: valor }));
    err.limparCampo(campo);
  }

  // Débito e crédito à vista são sempre uma parcela só.
  const faixaTravada = v.forma === "debito" || v.forma === "credito_vista";
  const fixaLojaEAdquirente = modo !== "nova";
  const fixaBandeiraEForma = modo === "vigencia";

  function escolherForma(forma: string) {
    setV((atual) =>
      forma === "debito" || forma === "credito_vista" ? { ...atual, forma, de: "1", ate: "1" } : { ...atual, forma },
    );
    err.limparCampo("kind");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!v.loja) novos.establishment_id = "Escolha a loja.";
    if (!v.adquirente) novos.acquirer_id = "Escolha a adquirente.";
    if (!v.bandeira) novos.brand = "Escolha a bandeira.";
    if (!v.forma) novos.kind = "Escolha a modalidade: débito, crédito à vista ou crédito parcelado.";
    const de = lerNumeroBr(v.de);
    const ate = lerNumeroBr(v.ate);
    if (de === null || !Number.isInteger(de) || de < 1) novos.installments_from = "A primeira parcela da faixa é um número inteiro, a partir de 1.";
    if (ate === null || !Number.isInteger(ate) || ate < 1) novos.installments_to = "A última parcela da faixa é um número inteiro, a partir de 1.";
    else if (de !== null && ate < de) novos.installments_to = "A última parcela não pode ser menor que a primeira.";
    const pct = lerNumeroBr(v.pct);
    if (pct === null || pct < 0 || pct > 100) novos.fee_pct = "A taxa deve ficar entre 0% e 100%.";
    const fixa = v.fixa.trim() === "" ? 0 : lerNumeroBr(v.fixa);
    if (fixa === null || fixa < 0) novos.fee_fixed = "Digite o valor fixo em reais, ou deixe vazio.";
    const prazo = lerNumeroBr(v.dias);
    if (prazo === null || !Number.isInteger(prazo) || prazo < 0 || prazo > 120) {
      novos.days = "O prazo deve ser um número inteiro de dias, de 0 a 120.";
    }
    if (!v.conta) novos.bank_account_id = "Escolha a conta que recebe o cartão.";
    if (!v.desde) novos.valid_from = "Informe a data em que a taxa começa a valer.";
    if (modo !== "vigencia" && v.ate_dia && v.desde && v.ate_dia < v.desde) {
      novos.valid_to = "A taxa não pode acabar antes de começar.";
    }
    if (Object.keys(novos).length > 0 || pct === null || prazo === null || fixa === null || de === null || ate === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    let res;
    if (modo === "nova") {
      res = await apiPost("/api/v1/emporio/card-fee-rates", {
        establishment_id: v.loja,
        acquirer_id: v.adquirente,
        brand: v.bandeira,
        kind: v.forma,
        installments_from: de,
        installments_to: ate,
        fee_pct: pct,
        fee_fixed: fixa,
        days: prazo,
        bank_account_id: v.conta,
        valid_from: v.desde,
        valid_to: v.ate_dia || null,
      });
    } else if (modo === "editar" && taxa) {
      res = await apiPatch(`/api/v1/emporio/card-fee-rates/${taxa.id}`, {
        brand: v.bandeira,
        kind: v.forma,
        installments_from: de,
        installments_to: ate,
        fee_pct: pct,
        fee_fixed: fixa,
        days: prazo,
        bank_account_id: v.conta,
        valid_from: v.desde,
        valid_to: v.ate_dia || null,
      });
    } else if (taxa) {
      res = await apiPost(`/api/v1/emporio/card-fee-rates/${taxa.id}/renew`, {
        valid_from: v.desde,
        installments_from: de,
        installments_to: ate,
        fee_pct: pct,
        fee_fixed: fixa,
        days: prazo,
        bank_account_id: v.conta,
      });
    } else {
      setLoading(false);
      return;
    }
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(modo === "nova" ? "Taxa cadastrada." : modo === "editar" ? "Taxa atualizada." : "Nova vigência criada.");
    setOpen(false);
    if (modo === "nova") setV(inicial());
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        modo === "nova" ? (
          <Button>Nova taxa</Button>
        ) : (
          <Button variant="outline" size="sm">
            {modo === "editar" ? "Editar" : "Nova vigência"}
          </Button>
        )
      }
      title={TITULO[modo]}
      description={
        modo === "vigencia"
          ? "A taxa atual termina na véspera da data escolhida, e a nova vale a partir dela. As vendas já feitas guardam a taxa que valia."
          : "Vale para as vendas novas daquela loja, adquirente e bandeira. As vendas já feitas guardam a taxa que valia na hora."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(inicial());
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={modo === "vigencia" ? "Criar vigência" : "Salvar taxa"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Loja" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select value={v.loja} disabled={fixaLojaEAdquirente} onValueChange={(x) => mudar("loja", x, "establishment_id")}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a loja" />
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

      <Field label="Adquirente" required id={err.idDe("acquirer_id")} error={err.erros.acquirer_id}>
        {({ id, ...aria }) => (
          <Select
            value={v.adquirente}
            disabled={fixaLojaEAdquirente}
            onValueChange={(x) => mudar("adquirente", x, "acquirer_id")}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a adquirente" />
            </SelectTrigger>
            <SelectContent>
              {adquirentes.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Bandeira"
        required
        id={err.idDe("brand")}
        error={err.erros.brand}
        hint="Qualquer bandeira vale para as que não têm taxa própria."
      >
        {({ id, ...aria }) => (
          <Select value={v.bandeira} disabled={fixaBandeiraEForma} onValueChange={(x) => mudar("bandeira", x, "brand")}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a bandeira" />
            </SelectTrigger>
            <SelectContent>
              {[...BANDEIRAS, "qualquer" as const].map((b) => (
                <SelectItem key={b} value={b}>
                  {ROTULO_DA_BANDEIRA[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Modalidade" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select value={v.forma} disabled={fixaBandeiraEForma} onValueChange={escolherForma}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a modalidade" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CARTAO_ROTULO).map(([k, nome]) => (
                <SelectItem key={k} value={k}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Da parcela"
        required
        id={err.idDe("installments_from")}
        error={err.erros.installments_from}
        hint={faixaTravada ? "Débito e crédito à vista são sempre 1 parcela." : undefined}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="x"
            disabled={faixaTravada}
            value={v.de}
            onValueChange={(x) => mudar("de", x, "installments_from")}
          />
        )}
      </Field>

      <Field label="Até a parcela" required id={err.idDe("installments_to")} error={err.erros.installments_to}>
        {({ id, ...aria }) => (
          <div className="space-y-2">
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="x"
              disabled={faixaTravada}
              value={v.ate}
              onValueChange={(x) => mudar("ate", x, "installments_to")}
            />
            {!faixaTravada && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mudar("ate", v.de, "installments_to")}
              >
                Parcela única (até = da parcela)
              </Button>
            )}
          </div>
        )}
      </Field>

      <Field label="Taxa (%)" required id={err.idDe("fee_pct")} error={err.erros.fee_pct} hint="Ex: 3,5 para 3,5%.">
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="%"
            value={v.pct}
            onValueChange={(x) => mudar("pct", x, "fee_pct")}
          />
        )}
      </Field>

      <Field
        label="Taxa fixa por venda (R$)"
        id={err.idDe("fee_fixed")}
        error={err.erros.fee_fixed}
        hint="Opcional. Um valor em reais cobrado além da porcentagem."
      >
        {({ id, ...aria }) => (
          <MoneyInput id={id} {...aria} value={v.fixa} onValueChange={(x) => mudar("fixa", x, "fee_fixed")} />
        )}
      </Field>

      <Field
        label="Prazo para cair (dias)"
        required
        id={err.idDe("days")}
        error={err.erros.days}
        hint="Dias entre a venda e a primeira parcela. As seguintes caem de 30 em 30 dias."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="dias"
            value={v.dias}
            onValueChange={(x) => mudar("dias", x, "days")}
          />
        )}
      </Field>

      <Field label="Conta que recebe" required id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
        {({ id, ...aria }) => (
          <Select value={v.conta} onValueChange={(x) => mudar("conta", x, "bank_account_id")}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a conta" />
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
        label={modo === "vigencia" ? "A partir de" : "Vale a partir de"}
        required
        id={err.idDe("valid_from")}
        error={err.erros.valid_from}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={v.desde}
            onChange={(e) => mudar("desde", e.target.value, "valid_from")}
          />
        )}
      </Field>

      {modo !== "vigencia" && (
        <Field
          label="Vale até"
          id={err.idDe("valid_to")}
          error={err.erros.valid_to}
          hint="Opcional. Vazio, a taxa vale até você abrir outra vigência."
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={v.ate_dia}
              onChange={(e) => mudar("ate_dia", e.target.value, "valid_to")}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}
