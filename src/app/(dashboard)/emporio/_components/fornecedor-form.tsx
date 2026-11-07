"use client";

import { useEffect, useState } from "react";
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
import { apiGet, apiPatch, apiPost } from "@/lib/client-api";
import type { FornecedorView } from "@/lib/actions/emporio-fornecedores";
import { UFS, formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
import { mascararCep, mascararDocumento, mascararTelefone } from "@/components/contatos/campos-do-cadastro";

// Ordem VISUAL. Só entra o que a tela renderiza em algum momento.
const ORDEM = [
  "kind",
  "property_id",
  "person_kind",
  "name",
  "document",
  "phone",
  "state_registration",
  "address_zip",
  "address_street",
  "address_number",
  "address_complement",
  "address_district",
  "city",
  "address_state",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

type Tipo = "propriedade" | "externo";

type Valores = {
  person_kind: string;
  name: string;
  document: string;
  phone: string;
  state_registration: string;
  address_zip: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_district: string;
  city: string;
  address_state: string;
  notes: string;
};

const VAZIO: Valores = {
  person_kind: "",
  name: "",
  document: "",
  phone: "",
  state_registration: "",
  address_zip: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_district: "",
  city: "",
  address_state: "",
  notes: "",
};

type FornecedorGuardado = { kind: Tipo } & { [K in keyof Valores]?: string | null };

const SEM_UF = "__sem_uf__";

/**
 * Cadastro do fornecedor do Empório. O tipo vem primeiro: "Propriedade do dono" pede só a
 * propriedade e a observação (o nome é o dela); "Fornecedor de fora" pede o cadastro, e só o nome
 * é obrigatório. Campo que some não é cobrado. Na edição o tipo não muda, e o de propriedade só
 * edita a observação.
 */
export function FornecedorForm({
  modo,
  id,
  trigger,
  open,
  onOpenChange,
  inicial,
  onSalvo,
}: {
  modo: "novo" | "editar";
  id?: string;
  /** Sem ele, o botão padrão; `null`, nenhum (o painel é aberto por `open`). */
  trigger?: React.ReactNode;
  /** Com `open` e `onOpenChange`, quem chama controla o painel (a escolha do fornecedor na Compra). */
  open?: boolean;
  onOpenChange?: (a: boolean) => void;
  /** Só no `novo`: o que a busca já digitou (o nome, ou o telefone). */
  inicial?: { name?: string; phone?: string };
  /** Sem ele (nas telas de Fornecedores), o formulário só relê a página ao salvar. */
  onSalvo?: (f: FornecedorView) => void;
}) {
  const router = useRouter();
  const editar = modo === "editar";
  const err = useErrosDeFormulario(ORDEM, editar ? `fornecedor-${id}` : "fornecedor-novo");
  const [abertoProprio, setAbertoProprio] = useState(false);
  const aberto = open ?? abertoProprio;
  const [loading, setLoading] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falhouCarga, setFalhouCarga] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("externo");
  const [propriedade, setPropriedade] = useState("");
  const [opcoes, setOpcoes] = useState<{ id: string; name: string }[]>([]);
  const [valores, setValores] = useState<Valores>(VAZIO);

  function mudar(campo: keyof Valores, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    err.limparCampo(campo);
  }

  // O painel abre pelo gatilho ou por quem chama (`open`): o preparo é o mesmo, feito no
  // render quando `aberto` muda, e a leitura (o cadastro ou as propriedades) no efeito abaixo.
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    err.limparTudo();
    setFalhouCarga(false);
    setTipo("externo");
    setPropriedade("");
    setValores(
      aberto && !editar && inicial
        ? { ...VAZIO, name: inicial.name ?? "", phone: mascararTelefone(inicial.phone ?? "") }
        : VAZIO,
    );
    setCarregando(aberto);
  }

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void (async () => {
      if (editar) {
        const res = await apiGet<FornecedorGuardado>(`/api/v1/emporio/suppliers/${id}`);
        if (!vivo) return;
        setCarregando(false);
        if (!res.ok) {
          setFalhouCarga(true);
          err.setGlobal(res.message);
          return;
        }
        const f = res.data;
        const v = { ...VAZIO };
        for (const k of Object.keys(VAZIO) as (keyof Valores)[]) v[k] = f[k] ?? "";
        v.document = formatarDocumento(v.document);
        v.address_zip = formatarCep(v.address_zip);
        setTipo(f.kind);
        setValores((atual) => ({ ...atual, ...v }));
        return;
      }
      const res = await apiGet<{ id: string; name: string }[]>("/api/v1/emporio/suppliers/property-options");
      if (!vivo) return;
      setCarregando(false);
      if (res.ok) setOpcoes(res.data);
      else err.setGlobal(res.message);
    })();
    return () => {
      vivo = false;
    };
    // Só a abertura relê: `err` é lido no momento da carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, editar, id]);

  function mudarAberto(o: boolean) {
    if (onOpenChange) onOpenChange(o);
    if (open === undefined) setAbertoProprio(o);
  }

  async function submit() {
    // Sem o cadastro carregado o formulário está vazio, e salvar apagaria o que está guardado.
    if (editar && falhouCarga) {
      err.setGlobal("Não foi possível carregar o cadastro. Feche e abra de novo.");
      return;
    }
    const novos: Partial<Record<Campo, string>> = {};
    if (tipo === "propriedade" && !editar && !propriedade) novos.property_id = "Escolha a propriedade.";
    if (tipo === "externo" && !valores.name.trim()) novos.name = "Informe o nome do fornecedor.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const notes = valores.notes.trim() || null;
    let corpo: Record<string, string | null>;
    if (tipo === "propriedade") {
      corpo = editar ? { notes } : { kind: "propriedade", property_id: propriedade, notes };
    } else {
      corpo = { notes };
      for (const k of Object.keys(VAZIO) as (keyof Valores)[]) if (k !== "notes") corpo[k] = valores[k].trim() || null;
      if (!editar) corpo.kind = "externo";
    }
    const res = editar
      ? await apiPatch<FornecedorView>(`/api/v1/emporio/suppliers/${id}`, corpo)
      : await apiPost<FornecedorView>("/api/v1/emporio/suppliers", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    if (onSalvo) onSalvo(res.data);
    else router.refresh();
    mudarAberto(false);
  }

  function texto(
    campo: keyof Valores,
    rotulo: string,
    extra: { mascara?: (v: string) => string; inputMode?: "numeric" | "text"; hint?: string; placeholder?: string } = {},
  ) {
    return (
      <Field label={rotulo} required={campo === "name"} hint={extra.hint} id={err.idDe(campo)} error={err.erros[campo]}>
        {({ id: fid, ...aria }) => (
          <Input
            id={fid}
            {...aria}
            inputMode={extra.inputMode}
            placeholder={extra.placeholder}
            autoComplete="off"
            value={valores[campo]}
            onChange={(e) => mudar(campo, extra.mascara ? extra.mascara(e.target.value) : e.target.value)}
          />
        )}
      </Field>
    );
  }

  const pj = valores.person_kind === "pj";

  return (
    <FormSheet
      trigger={
        trigger ?? (
          <Button type="button" variant="outline" size="sm">
            Novo fornecedor
          </Button>
        )
      }
      title={editar ? "Editar fornecedor" : "Novo fornecedor"}
      description={
        tipo === "propriedade"
          ? "A propriedade do dono entra nas compras só com o custo, sem conta a pagar."
          : "Só o nome é obrigatório. Preencha o resto se quiser."
      }
      open={aberto}
      onOpenChange={mudarAberto}
      onSubmit={submit}
      submitLabel={editar ? "Salvar fornecedor" : "Cadastrar fornecedor"}
      pending={loading || carregando}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {!editar && (
        <Field label="Tipo de fornecedor" id={err.idDe("kind")} error={err.erros.kind}>
          {({ id: fid, ...aria }) => (
            <div id={fid} tabIndex={-1} role="group" {...aria} className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={tipo === "propriedade" ? "default" : "outline"}
                aria-pressed={tipo === "propriedade"}
                onClick={() => {
                  setTipo("propriedade");
                  err.limparCampo("kind");
                }}
              >
                Propriedade do dono
              </Button>
              <Button
                type="button"
                variant={tipo === "externo" ? "default" : "outline"}
                aria-pressed={tipo === "externo"}
                onClick={() => {
                  setTipo("externo");
                  err.limparCampo("kind");
                }}
              >
                Fornecedor de fora
              </Button>
            </div>
          )}
        </Field>
      )}

      {tipo === "propriedade" ? (
        <>
          {!editar && (
            <Field
              label="Propriedade"
              required
              id={err.idDe("property_id")}
              error={err.erros.property_id}
              hint={opcoes.length === 0 && !carregando ? "Todas as propriedades já são fornecedores." : undefined}
            >
              {({ id: fid, ...aria }) => (
                <Select
                  value={propriedade}
                  onValueChange={(v) => {
                    setPropriedade(v);
                    err.limparCampo("property_id");
                  }}
                >
                  <SelectTrigger id={fid} {...aria}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
        </>
      ) : (
        <>
          <Field label="Tipo de pessoa" id={err.idDe("person_kind")} error={err.erros.person_kind} hint="Opcional, mas necessário para informar CPF ou CNPJ.">
            {({ id: fid, ...aria }) => (
              <div id={fid} tabIndex={-1} role="group" {...aria} className="grid grid-cols-2 gap-2">
                {(["pf", "pj"] as const).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant={valores.person_kind === k ? "default" : "outline"}
                    aria-pressed={valores.person_kind === k}
                    onClick={() => {
                      const igual = valores.person_kind === k;
                      mudar("person_kind", igual ? "" : k);
                      // Trocar PF por PJ limpa o documento: o CNPJ seria recusado como CPF.
                      if (!igual && valores.document) mudar("document", "");
                    }}
                  >
                    {k === "pf" ? "Pessoa física" : "Pessoa jurídica"}
                  </Button>
                ))}
              </div>
            )}
          </Field>
          {texto("name", pj ? "Nome da empresa" : "Nome", { placeholder: "Ex: Agropecuária Boa Safra" })}
          {texto("document", pj ? "CNPJ" : "CPF", {
            hint: "Opcional.",
            inputMode: pj ? "text" : "numeric",
            mascara: (v) => mascararDocumento(v, valores.person_kind),
          })}
          {texto("phone", "Telefone", { hint: "Opcional.", inputMode: "numeric", placeholder: "(38) 99999-0000", mascara: mascararTelefone })}
          {texto("state_registration", "Inscrição estadual", { hint: "Opcional. Só números (de 8 a 14) ou ISENTO." })}

          <section className="space-y-3 rounded-lg border border-borda p-3" aria-label="Endereço">
            <h3 className="text-sm font-semibold text-texto">Endereço</h3>
            {texto("address_zip", "CEP", { inputMode: "numeric", mascara: mascararCep, placeholder: "00000-000" })}
            {texto("address_street", "Rua")}
            <div className="grid grid-cols-2 gap-3">
              {texto("address_number", "Número")}
              {texto("address_complement", "Complemento")}
            </div>
            {texto("address_district", "Bairro")}
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              {texto("city", "Município")}
              <Field label="UF" id={err.idDe("address_state")} error={err.erros.address_state}>
                {({ id: fid, ...aria }) => (
                  <Select
                    value={valores.address_state || SEM_UF}
                    onValueChange={(v) => mudar("address_state", v === SEM_UF ? "" : v)}
                  >
                    <SelectTrigger id={fid} {...aria}>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_UF}>Não informar</SelectItem>
                      {UFS.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          </section>
        </>
      )}

      {texto("notes", "Observação", { hint: "Opcional." })}
    </FormSheet>
  );
}
