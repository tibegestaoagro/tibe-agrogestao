"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client-api";
import type { ContaView } from "@/lib/actions/emporio-caixa";

const ORDEM = ["name", "bank", "document", "beneficiary", "receives_pix", "establishment_ids"] as const;
type Campo = (typeof ORDEM)[number];

const TODAS = "todas";
const ESCOLHIDAS = "escolhidas";
/** Q318: conta de cartão ou caixa interno, fora da lista do PIX. */
const NENHUMA = "nenhuma";
const valeDa = (conta?: ContaView) =>
  !conta ? TODAS : !conta.receives_pix ? NENHUMA : conta.pix_all_establishments ? TODAS : ESCOLHIDAS;
const classeCaixa = "h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria";

/**
 * Máscara 00.000.000/0000-00 enquanto digita, aceitando letras nos 12 primeiros (CNPJ alfanumérico da
 * Receita, como o fornecedor aceita); o servidor limpa a pontuação e confere.
 */
function mascararCnpj(valor: string): string {
  const c = valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
  const partes = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
  const separadores = [".", ".", "/", "-"];
  return partes.reduce((s, p, i) => (p ? s + (i > 0 ? separadores[i - 1] : "") + p : s), "");
}

/**
 * Conta bancária do Empório (OWNER, ADMIN e Financeiro): é onde o PIX cai.
 * Sem `conta` cadastra; com `conta` edita (um painel por linha da tabela).
 */
export function ContaForm({ conta, lojas }: { conta?: ContaView; lojas: { id: string; name: string }[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, conta ? `conta-${conta.id}` : "conta-nova");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState(conta?.name ?? "");
  const [banco, setBanco] = useState(conta?.bank ?? "");
  const [cnpj, setCnpj] = useState(mascararCnpj(conta?.document ?? ""));
  const [favorecido, setFavorecido] = useState(conta?.beneficiary ?? "");
  const [vale, setVale] = useState(valeDa(conta));
  const [lojasSel, setLojasSel] = useState<string[]>(conta?.pix_available_establishment_ids ?? []);

  function carregar() {
    setNome(conta?.name ?? "");
    setBanco(conta?.bank ?? "");
    setCnpj(mascararCnpj(conta?.document ?? ""));
    setFavorecido(conta?.beneficiary ?? "");
    setVale(valeDa(conta));
    setLojasSel(conta?.pix_available_establishment_ids ?? []);
  }

  function alternar(id: string, ligado: boolean) {
    setLojasSel((a) => (ligado ? [...a, id] : a.filter((x) => x !== id)));
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!nome.trim()) novos.name = "Dê um identificador à conta.";
    if (cnpj.trim() && cnpj.replace(/[^0-9A-Z]/g, "").length !== 14) novos.document = "O CNPJ tem 14 caracteres.";
    if (vale === ESCOLHIDAS && lojasSel.length === 0) novos.establishment_ids = "Marque pelo menos uma loja.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: nome.trim(),
      bank: banco.trim() || null,
      document: cnpj.trim() || null,
      beneficiary: favorecido.trim() || null,
      receives_pix: vale !== NENHUMA,
      ...(vale !== NENHUMA ? { pix_all_establishments: vale === TODAS } : {}),
      ...(vale === ESCOLHIDAS ? { establishment_ids: lojasSel } : {}),
    };
    const res = conta
      ? await apiPatch(`/api/v1/emporio/bank-accounts/${conta.id}`, corpo)
      : await apiPost("/api/v1/emporio/bank-accounts", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(conta ? "Conta atualizada." : "Conta cadastrada.");
    setOpen(false);
    if (!conta) carregar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={conta ? <Button variant="outline" size="sm">Editar</Button> : <Button>Nova conta</Button>}
      title={conta ? `Editar ${conta.name}` : "Nova conta bancária"}
      description="Só o identificador é obrigatório. CNPJ e favorecido ajudam o caixa a conferir a conta no lançamento."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && conta) carregar();
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={conta ? "Salvar" : "Cadastrar conta"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Identificador" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Ex: PIX AGROMAX MOC"
          />
        )}
      </Field>
      <Field label="Banco" id={err.idDe("bank")} error={err.erros.bank} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={banco}
            onChange={(e) => {
              setBanco(e.target.value);
              err.limparCampo("bank");
            }}
          />
        )}
      </Field>
      <Field label="CNPJ" id={err.idDe("document")} error={err.erros.document} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            autoCapitalize="characters"
            value={cnpj}
            onChange={(e) => {
              setCnpj(mascararCnpj(e.target.value));
              err.limparCampo("document");
            }}
            placeholder="00.000.000/0000-00"
          />
        )}
      </Field>
      <Field label="Favorecido" id={err.idDe("beneficiary")} error={err.erros.beneficiary} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={favorecido}
            onChange={(e) => {
              setFavorecido(e.target.value);
              err.limparCampo("beneficiary");
            }}
          />
        )}
      </Field>
      <Field label="Disponível para PIX em" id={err.idDe("receives_pix")} error={err.erros.receives_pix}>
        {({ id, ...aria }) => (
          <Select
            value={vale}
            onValueChange={(v) => {
              setVale(v);
              err.limparCampo("receives_pix");
              err.limparCampo("establishment_ids");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as lojas</SelectItem>
              <SelectItem value={ESCOLHIDAS}>Lojas escolhidas</SelectItem>
              <SelectItem value={NENHUMA}>Não recebe PIX</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      {vale === ESCOLHIDAS && (
        <Field label="Lojas" required id={err.idDe("establishment_ids")} error={err.erros.establishment_ids}>
          {({ id, ...aria }) => (
            <div id={id} {...aria} tabIndex={-1} className="space-y-2">
              {lojas.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-texto">
                  <input
                    type="checkbox"
                    checked={lojasSel.includes(l.id)}
                    onChange={(e) => {
                      alternar(l.id, e.target.checked);
                      err.limparCampo("establishment_ids");
                    }}
                    className={classeCaixa}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          )}
        </Field>
      )}
    </FormSheet>
  );
}
