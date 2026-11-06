/**
 * O que é obrigatório no cadastro do cliente do Empório, por tipo e para entrega.
 * Função pura, sem banco: o cadastro e (no plano 3) o pedido para entrega usam a mesma regra.
 * "Vazio" é nulo ou só espaço.
 */
import { fail, type ActionResult } from "@/lib/actions/types";
import { CONSUMIDOR_FINAL } from "@/lib/contatos/cadastro";

type Txt = string | null | undefined;

export type EnderecoDoPedido = {
  zip: string | null; street: string | null; number: string | null; complement: string | null;
  district: string | null; city: string | null; state: string | null;
};
export type ClienteParaConferir = {
  name: string | null; person_kind: "pf" | "pj" | null; phone: string | null; document: string | null;
  address_zip: string | null; address_street: string | null; address_number: string | null;
  address_complement: string | null; address_district: string | null; city: string | null; address_state: string | null;
  delivery_zip?: string | null; delivery_street?: string | null; delivery_number?: string | null;
  delivery_complement?: string | null; delivery_district?: string | null; delivery_city?: string | null; delivery_state?: string | null;
  system_key?: string | null;
};
export type Falta = { field: string; message: string };

const vazio = (v: Txt): boolean => v == null || v.trim() === "";
const limpo = (v: Txt): string | null => (vazio(v) ? null : (v as string).trim());

export function ehConsumidorFinal(c: { system_key?: string | null }): boolean {
  return c.system_key === CONSUMIDOR_FINAL.system_key;
}

const CAMPOS_ENDERECO = [
  ["zip", "o CEP"], ["street", "a rua"], ["number", "o número"], ["district", "o bairro"], ["city", "a cidade"], ["state", "a UF"],
] as const;

/** Mensagem do campo que falta: "Escolha a UF ..." para a UF, "Informe ..." para o resto. */
function mensagemDoEndereco(chave: (typeof CAMPOS_ENDERECO)[number][0], rotulo: string, qual: "principal" | "de entrega"): string {
  return chave === "state" ? `Escolha ${rotulo} do endereço ${qual}.` : `Informe ${rotulo} do endereço ${qual}.`;
}

export function enderecoCompleto(e: EnderecoDoPedido | null): boolean {
  if (!e) return false;
  return CAMPOS_ENDERECO.every(([k]) => !vazio(e[k]));
}

export function enderecoPrincipalDe(c: ClienteParaConferir): EnderecoDoPedido {
  return {
    zip: limpo(c.address_zip), street: limpo(c.address_street), number: limpo(c.address_number),
    complement: limpo(c.address_complement), district: limpo(c.address_district), city: limpo(c.city),
    state: limpo(c.address_state),
  };
}

export function enderecoDeEntregaDe(c: ClienteParaConferir): EnderecoDoPedido | null {
  const e: EnderecoDoPedido = {
    zip: limpo(c.delivery_zip), street: limpo(c.delivery_street), number: limpo(c.delivery_number),
    complement: limpo(c.delivery_complement), district: limpo(c.delivery_district), city: limpo(c.delivery_city),
    state: limpo(c.delivery_state),
  };
  return Object.values(e).every((v) => v === null) ? null : e;
}

const CAMPO_DO_PRINCIPAL = {
  zip: "address_zip", street: "address_street", number: "address_number", district: "address_district",
  city: "city", state: "address_state",
} as const;

export function faltaNoCadastro(c: ClienteParaConferir): Falta | null {
  if (ehConsumidorFinal(c)) return null;
  if (c.person_kind !== "pf" && c.person_kind !== "pj") {
    return { field: "person_kind", message: "Escolha pessoa física ou jurídica." };
  }
  if (vazio(c.name)) {
    return { field: "name", message: c.person_kind === "pf" ? "Informe o nome do cliente." : "Informe o nome da empresa." };
  }
  if (vazio(c.phone)) return { field: "phone", message: "Informe o telefone." };
  if (c.person_kind === "pj") {
    if (vazio(c.document)) return { field: "document", message: "Informe o CNPJ." };
    const principal = enderecoPrincipalDe(c);
    for (const [k, rotulo] of CAMPOS_ENDERECO) {
      if (vazio(principal[k])) return { field: CAMPO_DO_PRINCIPAL[k], message: mensagemDoEndereco(k, rotulo, "principal") };
    }
  }
  return null;
}

export function faltaParaEntrega(c: ClienteParaConferir, endereco: EnderecoDoPedido | null): Falta | null {
  if (ehConsumidorFinal(c)) {
    return { field: "customer_id", message: "Pedido para entrega precisa do cliente de verdade, não do Consumidor final." };
  }
  const cadastro = faltaNoCadastro(c);
  if (cadastro) return cadastro;
  if (c.person_kind === "pf" && vazio(c.document)) {
    return { field: "document", message: "Para entrega, informe o CPF do cliente." };
  }
  for (const [k, rotulo] of CAMPOS_ENDERECO) {
    if (vazio(endereco?.[k])) return { field: `delivery_${k}`, message: mensagemDoEndereco(k, rotulo, "de entrega") };
  }
  return null;
}

export function recusaDocumentoRepetido(
  quem: "cliente" | "fornecedor",
  r: { name: string; archived: boolean },
  documento: string,
): ActionResult<never> {
  const tipo = /^\d{11}$/.test(documento) ? "CPF" : "CNPJ";
  const artigo = quem === "cliente" ? "um cliente" : "um fornecedor";
  const onde = quem === "cliente" ? "Clientes" : "Fornecedores";
  const arquivado = r.archived ? ` Ele está arquivado: desarquive em ${onde}.` : "";
  return fail("DUPLICATE_DOCUMENT", `Já existe ${artigo} com esse ${tipo}: ${r.name}.${arquivado}`, 409, "document");
}
