"use client";

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
import { UFS, formatarCep, formatarDocumento, normalizarCnpj } from "@/lib/contatos/cadastro";

/**
 * Os campos do cadastro PF/PJ do contato, compartilhados pelo balcão do Empório
 * e por Contatos. Não tem estado de envio nem hook de erro: quem monta o painel
 * guarda os valores, escreve o `ORDEM` com TODOS os campos que isto renderiza
 * (na ordem visual abaixo) e passa `erros`/`idDe`. Os ids dos `Field` são os
 * nomes da API, para a recusa do servidor cair embaixo do campo certo.
 *
 * A ordem visual: person_kind, name, document, phone, birth_date (PF) ou
 * responsible_name (PJ), state_registration, o endereço (zip, street, number,
 * complement, district, city, state) e o endereço de entrega (os mesmos, com
 * `delivery_`).
 */

export type CampoCadastro =
  | "person_kind"
  | "name"
  | "document"
  | "phone"
  | "birth_date"
  | "responsible_name"
  | "state_registration"
  | "address_zip"
  | "address_street"
  | "address_number"
  | "address_complement"
  | "address_district"
  | "city"
  | "address_state"
  | "delivery_zip"
  | "delivery_street"
  | "delivery_number"
  | "delivery_complement"
  | "delivery_district"
  | "delivery_city"
  | "delivery_state";

/** Tudo como texto: é o que os controles seguram. `person_kind` é "", "pf" ou "pj". */
export type ValoresCadastro = Record<CampoCadastro, string>;

export const CADASTRO_VAZIO: ValoresCadastro = {
  person_kind: "",
  name: "",
  document: "",
  phone: "",
  birth_date: "",
  responsible_name: "",
  state_registration: "",
  address_zip: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_district: "",
  city: "",
  address_state: "",
  delivery_zip: "",
  delivery_street: "",
  delivery_number: "",
  delivery_complement: "",
  delivery_district: "",
  delivery_city: "",
  delivery_state: "",
};

const CAMPOS = Object.keys(CADASTRO_VAZIO) as CampoCadastro[];

/** O que a API devolve de um contato (`ContactView`), só os campos do cadastro. */
export type ContatoDoCadastro = { [K in CampoCadastro]?: string | null };

/** Valores iniciais do formulário a partir do contato guardado: documento e CEP já com máscara. */
export function valoresDoContato(c: ContatoDoCadastro): ValoresCadastro {
  const v = { ...CADASTRO_VAZIO };
  for (const k of CAMPOS) v[k] = c[k] ?? "";
  v.document = formatarDocumento(v.document);
  v.address_zip = formatarCep(v.address_zip);
  v.delivery_zip = formatarCep(v.delivery_zip);
  v.birth_date = v.birth_date.slice(0, 10);
  return v;
}

/** O corpo da API: vazio vira `null` (no PATCH, `null` limpa o campo). */
export function corpoDoCadastro(v: ValoresCadastro): Record<CampoCadastro, string | null> {
  const corpo = {} as Record<CampoCadastro, string | null>;
  for (const k of CAMPOS) corpo[k] = v[k].trim() || null;
  return corpo;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Máscara de exibição enquanto digita: o servidor guarda sem pontuação. O CNPJ aceita
 * letra (o alfanumérico da Receita) e sai em maiúscula; o CPF continua só números.
 */
export function mascararDocumento(valor: string, kind: string): string {
  if (kind === "pj") {
    return normalizarCnpj(valor)
      .slice(0, 14)
      .replace(/^(\w{2})(\w)/, "$1.$2")
      .replace(/^(\w{2})\.(\w{3})(\w)/, "$1.$2.$3")
      .replace(/\.(\w{3})(\w)/, ".$1/$2")
      .replace(/(\w{4})(\w)/, "$1-$2");
  }
  if (/[a-z]/i.test(valor)) return valor;
  const d = soDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function mascararCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function mascararTelefone(valor: string): string {
  let d = soDigitos(valor);
  // Telefone guardado com o código do país ("+55 38 99999-0000"): o 55 sai só da
  // exibição, para a edição não cortar o número no meio.
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const SEM_UF = "__sem_uf__";

type Props = {
  valores: ValoresCadastro;
  /** Em todo onChange: grave o valor E chame `limparCampo(campo)` do hook de erros. */
  aoMudar: (campo: CampoCadastro, valor: string) => void;
  erros: Partial<Record<CampoCadastro, string>>;
  idDe: (campo: CampoCadastro) => string;
  /**
   * Cliente do Empório: marca o que `faltaNoCadastro` exige (tipo, nome e telefone; na PJ,
   * também o CNPJ e o endereço principal). Contatos: só o nome.
   */
  obrigatorios: boolean;
};

function CampoTexto({
  campo,
  rotulo,
  required,
  hint,
  placeholder,
  inputMode,
  mascara,
  p,
}: {
  campo: CampoCadastro;
  rotulo: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  inputMode?: "numeric" | "tel" | "text";
  mascara?: (valor: string) => string;
  p: Props;
}) {
  return (
    <Field label={rotulo} required={required} hint={hint} id={p.idDe(campo)} error={p.erros[campo]}>
      {({ id, ...aria }) => (
        <Input
          id={id}
          {...aria}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          value={p.valores[campo]}
          onChange={(e) => p.aoMudar(campo, mascara ? mascara(e.target.value) : e.target.value)}
        />
      )}
    </Field>
  );
}

function CampoUf({
  campo,
  rotulo,
  required,
  p,
}: {
  campo: "address_state" | "delivery_state";
  rotulo: string;
  required?: boolean;
  p: Props;
}) {
  return (
    <Field label={rotulo} required={required} id={p.idDe(campo)} error={p.erros[campo]}>
      {({ id, ...aria }) => (
        <Select
          value={p.valores[campo] || SEM_UF}
          onValueChange={(v) => p.aoMudar(campo, v === SEM_UF ? "" : v)}
        >
          <SelectTrigger id={id} {...aria}>
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
  );
}

export function CamposDoCadastro(props: Props) {
  const { valores, aoMudar, erros, idDe, obrigatorios } = props;
  const kind = valores.person_kind;
  const pf = kind === "pf";
  const pj = kind === "pj";
  const enderecoObrigatorio = obrigatorios && pj;

  function usarMesmoEndereco() {
    aoMudar("delivery_zip", valores.address_zip);
    aoMudar("delivery_street", valores.address_street);
    aoMudar("delivery_number", valores.address_number);
    aoMudar("delivery_complement", valores.address_complement);
    aoMudar("delivery_district", valores.address_district);
    aoMudar("delivery_city", valores.city);
    aoMudar("delivery_state", valores.address_state);
  }

  function escolherTipo(novo: "pf" | "pj") {
    // Sem obrigatoriedade (Contatos), tocar de novo no tipo escolhido desfaz a escolha.
    aoMudar("person_kind", kind === novo && !obrigatorios ? "" : novo);
    // Trocar de PF para PJ (ou o contrário) limpa o documento: o CNPJ guardado seria
    // recusado como CPF inválido, sem a pessoa entender por quê. Tocar no mesmo tipo mantém.
    if (kind !== novo && valores.document) aoMudar("document", "");
  }

  return (
    <>
      <Field
        label="Tipo de pessoa"
        required={obrigatorios}
        id={idDe("person_kind")}
        error={erros.person_kind}
        hint={obrigatorios ? undefined : "Opcional, mas necessário para informar CPF ou CNPJ."}
      >
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} role="group" {...aria} className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={pf ? "default" : "outline"}
              aria-pressed={pf}
              onClick={() => escolherTipo("pf")}
            >
              Pessoa física
            </Button>
            <Button
              type="button"
              variant={pj ? "default" : "outline"}
              aria-pressed={pj}
              onClick={() => escolherTipo("pj")}
            >
              Pessoa jurídica
            </Button>
          </div>
        )}
      </Field>

      <CampoTexto
        campo="name"
        rotulo={pj ? "Nome da empresa" : "Nome"}
        required
        placeholder={pj ? "Ex: Agropecuária Boa Safra" : "Ex: João da Ponte"}
        p={props}
      />
      <CampoTexto
        campo="document"
        rotulo={pj ? "CNPJ" : "CPF"}
        required={obrigatorios && pj}
        hint={obrigatorios && pj ? undefined : "Opcional."}
        inputMode={pj ? "text" : "numeric"}
        mascara={(v) => mascararDocumento(v, kind)}
        p={props}
      />
      <CampoTexto
        campo="phone"
        rotulo="Telefone"
        required={obrigatorios}
        hint={obrigatorios ? undefined : "Opcional."}
        inputMode="numeric"
        placeholder="(38) 99999-0000"
        mascara={mascararTelefone}
        p={props}
      />

      {!pj && (
        <Field label="Data de nascimento" id={idDe("birth_date")} error={erros.birth_date} hint="Opcional.">
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={valores.birth_date}
              onChange={(e) => aoMudar("birth_date", e.target.value)}
            />
          )}
        </Field>
      )}
      {pj && <CampoTexto campo="responsible_name" rotulo="Nome do responsável" hint="Opcional." p={props} />}

      <CampoTexto
        campo="state_registration"
        rotulo="Inscrição estadual"
        hint="Opcional. Só números (de 8 a 14) ou ISENTO."
        p={props}
      />

      <section className="space-y-3 rounded-lg border border-borda p-3" aria-label="Endereço">
        <h3 className="text-sm font-semibold text-texto">
          {pf ? "Endereço residencial" : pj ? "Endereço da empresa" : "Endereço"}
        </h3>
        <CampoTexto campo="address_zip" rotulo="CEP" required={enderecoObrigatorio} inputMode="numeric" mascara={mascararCep} placeholder="00000-000" p={props} />
        <CampoTexto campo="address_street" rotulo="Rua" required={enderecoObrigatorio} p={props} />
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto campo="address_number" rotulo="Número" required={enderecoObrigatorio} p={props} />
          <CampoTexto campo="address_complement" rotulo="Complemento" p={props} />
        </div>
        <CampoTexto campo="address_district" rotulo="Bairro" required={enderecoObrigatorio} p={props} />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <CampoTexto campo="city" rotulo="Município" required={enderecoObrigatorio} p={props} />
          <CampoUf campo="address_state" rotulo="UF" required={enderecoObrigatorio} p={props} />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-borda p-3" aria-label="Endereço de entrega">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-texto">Endereço de entrega</h3>
          <Button type="button" variant="outline" size="sm" onClick={usarMesmoEndereco}>
            Usar o mesmo endereço
          </Button>
        </div>
        <CampoTexto campo="delivery_zip" rotulo="CEP de entrega" inputMode="numeric" mascara={mascararCep} placeholder="00000-000" p={props} />
        <CampoTexto campo="delivery_street" rotulo="Rua de entrega" p={props} />
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto campo="delivery_number" rotulo="Número de entrega" p={props} />
          <CampoTexto campo="delivery_complement" rotulo="Complemento de entrega" p={props} />
        </div>
        <CampoTexto campo="delivery_district" rotulo="Bairro de entrega" p={props} />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <CampoTexto campo="delivery_city" rotulo="Município de entrega" p={props} />
          <CampoUf campo="delivery_state" rotulo="UF de entrega" p={props} />
        </div>
      </section>
    </>
  );
}
