/**
 * A regra do "pedido para entrega" do Empório, em função pura (sem banco).
 * Orçamento, venda, mudança depois de fechada e romaneio chamam esta mesma regra.
 * Nenhum identificador usa "entrega" sozinha: é o malote do turno em outra parte do sistema.
 */
import { fail, ok, type ActionResult } from "@/lib/actions/types";
import { conferirCadastro, formatarCep } from "@/lib/contatos/cadastro";
import {
  ehConsumidorFinal, enderecoDeEntregaDe, enderecoPrincipalDe, faltaNoCadastro, faltaNoEnderecoDeEntrega, faltaParaEntrega,
  type ClienteParaConferir, type EnderecoDoPedido,
} from "@/lib/emporio/cliente-cadastro";

export type EscolhaDoEndereco = "principal" | "cadastro_entrega" | "outro";

export type PedidoParaEntregaInput = {
  for_delivery?: boolean | null; delivery_address_kind?: string | null;
  delivery_zip?: string | null; delivery_street?: string | null; delivery_number?: string | null;
  delivery_complement?: string | null; delivery_district?: string | null; delivery_city?: string | null; delivery_state?: string | null;
};

export type PedidoParaEntregaColunas = {
  for_delivery: boolean; delivery_address_kind: EscolhaDoEndereco | null;
  delivery_zip: string | null; delivery_street: string | null; delivery_number: string | null; delivery_complement: string | null;
  delivery_district: string | null; delivery_city: string | null; delivery_state: string | null;
};

export type FaltaNoCliente = { code: "VALIDATION_ERROR" | "DELIVERY_CUSTOMER_INCOMPLETE"; field: "customer_id"; message: string };

export const RETIRADA: PedidoParaEntregaColunas = {
  for_delivery: false, delivery_address_kind: null,
  delivery_zip: null, delivery_street: null, delivery_number: null, delivery_complement: null,
  delivery_district: null, delivery_city: null, delivery_state: null,
};

const ESCOLHAS: readonly string[] = ["principal", "cadastro_entrega", "outro"];

const MSG_ESCOLHA = "Escolha o endereço de entrega.";
const MSG_SEM_ENDERECO_DE_ENTREGA =
  "Este cliente não tem endereço de entrega no cadastro. Escolha o endereço principal ou outro endereço.";
const MSG_PRINCIPAL_INCOMPLETO =
  "O endereço principal do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço.";
const MSG_ENTREGA_INCOMPLETA =
  "O endereço de entrega do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço.";

/** A recusa do cliente sai em `customer_id`: o balcão não tem campo de CPF, o aviso fica embaixo do cliente. */
export function faltaNoClienteParaEntrega(c: ClienteParaConferir, soConsumidorFinal = false): FaltaNoCliente | null {
  if (ehConsumidorFinal(c)) {
    return {
      code: "VALIDATION_ERROR", field: "customer_id",
      message: "Pedido para entrega precisa do cliente de verdade, não do Consumidor final.",
    };
  }
  if (soConsumidorFinal) return null;
  const cadastro = faltaNoCadastro(c);
  if (cadastro) {
    return {
      code: "DELIVERY_CUSTOMER_INCOMPLETE", field: "customer_id",
      message: `Para entrega, complete o cadastro do cliente: ${cadastro.message}`,
    };
  }
  if (c.person_kind === "pf" && (c.document == null || c.document.trim() === "")) {
    return { code: "DELIVERY_CUSTOMER_INCOMPLETE", field: "customer_id", message: "Para entrega, informe o CPF do cliente." };
  }
  return null;
}

const VAZIO: EnderecoDoPedido = { zip: null, street: null, number: null, complement: null, district: null, city: null, state: null };

/**
 * O que falta para o orçamento virar venda, em frases curtas, pelas mesmas funções que a venda usa.
 * Lista vazia: pode faturar. O endereço do `principal` e do `cadastro_entrega` é o do cadastro de agora.
 */
export function pendenciasParaVenda(c: ClienteParaConferir, pedido: PedidoParaEntregaColunas): string[] {
  const out: string[] = [];
  const cadastro = faltaNoCadastro(c);
  if (cadastro) {
    out.push(
      cadastro.field === "person_kind" ? "Tipo do cliente (pessoa física ou jurídica)"
        : cadastro.field === "document" ? "CNPJ"
        : cadastro.field === "name" ? "Nome do cliente"
        : cadastro.field === "phone" ? "Telefone do cliente"
        : "Endereço principal",
    );
  }
  if (!pedido.for_delivery) return out;
  if (c.person_kind === "pf" && (c.document == null || c.document.trim() === "")) out.push("CPF do cliente");
  let endereco: EnderecoDoPedido | null = null;
  if (pedido.delivery_address_kind === "principal") endereco = enderecoPrincipalDe(c);
  else if (pedido.delivery_address_kind === "cadastro_entrega") endereco = enderecoDeEntregaDe(c);
  else if (pedido.delivery_address_kind === "outro") endereco = enderecoDasColunas(pedido);
  if (faltaNoEnderecoDeEntrega(endereco)) out.push("Endereço de entrega");
  return out;
}

function colunasDe(escolha: EscolhaDoEndereco, e: EnderecoDoPedido): PedidoParaEntregaColunas {
  return {
    for_delivery: true, delivery_address_kind: escolha,
    delivery_zip: e.zip, delivery_street: e.street, delivery_number: e.number, delivery_complement: e.complement,
    delivery_district: e.district, delivery_city: e.city, delivery_state: e.state,
  };
}

const texto = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function resolverPedidoParaEntrega(
  c: ClienteParaConferir,
  input: PedidoParaEntregaInput,
  /** "orcamento": o cliente não precisa de CPF/CNPJ nem de endereço principal (só o endereço de entrega conta). */
  modo: "venda" | "orcamento" = "venda",
): ActionResult<PedidoParaEntregaColunas> {
  if (input.for_delivery !== true) return ok({ ...RETIRADA });

  const orcamento = modo === "orcamento";
  const faltaCliente = faltaNoClienteParaEntrega(c, orcamento);
  if (faltaCliente) return fail(faltaCliente.code, faltaCliente.message, 422, faltaCliente.field);

  const escolha = input.delivery_address_kind;
  if (typeof escolha !== "string" || !ESCOLHAS.includes(escolha)) {
    // O orçamento guarda a marca sem o endereço: a venda cobra a escolha (Q336).
    if (orcamento && (escolha == null || escolha === "")) {
      return ok({ ...RETIRADA, for_delivery: true });
    }
    return fail("VALIDATION_ERROR", MSG_ESCOLHA, 422, "delivery_address_kind");
  }

  let endereco: EnderecoDoPedido | null;
  if (escolha === "principal") {
    endereco = enderecoPrincipalDe(c);
  } else if (escolha === "cadastro_entrega") {
    endereco = enderecoDeEntregaDe(c);
  } else {
    const conferido = conferirCadastro({
      delivery_zip: texto(input.delivery_zip), delivery_street: texto(input.delivery_street),
      delivery_number: texto(input.delivery_number), delivery_complement: texto(input.delivery_complement),
      delivery_district: texto(input.delivery_district), delivery_city: texto(input.delivery_city),
      delivery_state: texto(input.delivery_state),
    });
    if (!conferido.ok) return fail("VALIDATION_ERROR", conferido.message, 422, conferido.field);
    const d = conferido.dados;
    endereco = {
      zip: d.delivery_zip ?? null, street: d.delivery_street ?? null, number: d.delivery_number ?? null,
      complement: d.delivery_complement ?? null, district: d.delivery_district ?? null,
      city: d.delivery_city ?? null, state: d.delivery_state ?? null,
    };
  }

  // No orçamento o endereço incompleto é guardado como está: a venda recusa, e a visão lista a pendência.
  if (orcamento) return ok(colunasDe(escolha as EscolhaDoEndereco, endereco ?? VAZIO));
  const falta = faltaParaEntrega(c, endereco);
  if (falta) {
    if (escolha === "outro") return fail("VALIDATION_ERROR", falta.message, 422, falta.field);
    // Nas outras duas escolhas os campos delivery_* não aparecem na tela: a recusa fica na escolha.
    const message = escolha === "principal"
      ? MSG_PRINCIPAL_INCOMPLETO
      : endereco === null ? MSG_SEM_ENDERECO_DE_ENTREGA : MSG_ENTREGA_INCOMPLETA;
    return fail("VALIDATION_ERROR", message, 422, "delivery_address_kind");
  }
  return ok(colunasDe(escolha as EscolhaDoEndereco, endereco as EnderecoDoPedido));
}

/** O que o orçamento deixa para a venda: no `outro`, o endereço; nas outras escolhas, o cadastro de agora. */
export function entradaHerdadaDoOrcamento(q: PedidoParaEntregaColunas): PedidoParaEntregaInput {
  if (!q.for_delivery) return { for_delivery: false };
  if (q.delivery_address_kind !== "outro") {
    return { for_delivery: true, delivery_address_kind: q.delivery_address_kind };
  }
  return {
    for_delivery: true, delivery_address_kind: "outro",
    delivery_zip: q.delivery_zip, delivery_street: q.delivery_street, delivery_number: q.delivery_number,
    delivery_complement: q.delivery_complement, delivery_district: q.delivery_district,
    delivery_city: q.delivery_city, delivery_state: q.delivery_state,
  };
}

export function enderecoDasColunas(r: PedidoParaEntregaColunas): EnderecoDoPedido | null {
  if (!r.for_delivery) return null;
  return {
    zip: r.delivery_zip, street: r.delivery_street, number: r.delivery_number, complement: r.delivery_complement,
    district: r.delivery_district, city: r.delivery_city, state: r.delivery_state,
  };
}

export function linhaDoEndereco(e: EnderecoDoPedido | null): string | null {
  if (!e) return null;
  const cidade = [e.city, e.state].filter((p): p is string => !!p).join("/");
  const partes = [e.street, e.number, e.complement, e.district, cidade, e.zip ? `CEP ${formatarCep(e.zip)}` : null];
  return partes.filter((p): p is string => !!p && p.trim() !== "").join(", ");
}
