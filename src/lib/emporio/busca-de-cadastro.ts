import type { Prisma } from "@/generated/prisma/client";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import { normalizarCnpj } from "@/lib/contatos/cadastro";
import { telefoneLocal } from "@/lib/emporio/telefone";

/**
 * O termo que o balcão digita para achar cliente ou fornecedor, lido uma vez. Puro:
 * o servidor monta o filtro e a tela decide o aviso de "poucos dígitos" pelo mesmo modo.
 */
export type TermoDeBusca =
  | { modo: "vazio" }
  | { modo: "poucos_digitos" }
  | { modo: "digitos"; digitos: string; telefone: string; semDdd?: string }
  | { modo: "nome"; nome: string; documento: string | null };

export type ResultadoDaBusca<T> = { itens: T[]; total: number; pagina: number; por_pagina: number; poucos_digitos: boolean };

export function lerTermo(q: string | null | undefined): TermoDeBusca {
  const texto = (q ?? "").trim();
  if (!texto) return { modo: "vazio" };
  if (!/\p{L}/u.test(texto)) {
    const digitos = texto.replace(/\D/g, "");
    if (digitos === "") return { modo: "vazio" };
    if (digitos.length < 3) return { modo: "poucos_digitos" };
    const telefone = digitos.length >= 10 ? (telefoneLocal(digitos) ?? digitos) : digitos;
    // "(34) 9987": o DDD digitado com máscara e o resto pela metade. O telefone guardado não tem DDD,
    // então o pedaço que vale é o que vem depois dele.
    const comDddMascarado = digitos.length >= 5 && digitos.length < 10 && /^\+?\s*(55\s*)?\(?\d{2}\)?[\s-]/.test(texto);
    return comDddMascarado
      ? { modo: "digitos", digitos, telefone, semDdd: digitos.slice(2) }
      : { modo: "digitos", digitos, telefone };
  }
  const nome = normalizarTermo(texto);
  const semEspaco = !/\s/.test(texto);
  const documento = semEspaco && /\d/.test(texto) && texto.length >= 3 ? normalizarCnpj(texto) : null;
  return { modo: "nome", nome, documento };
}

type OndeDaBusca = Prisma.EmporioCustomerWhereInput & Prisma.EmporioSupplierWhereInput;

/** O `contains` do Prisma não escapa: `%` e `_` do termo viravam curinga do LIKE ("_é" achava "zé"). */
const literal = (s: string): string => s.replace(/[\\%_]/g, "\\$&");

function onde(t: TermoDeBusca): OndeDaBusca {
  if (t.modo === "digitos") {
    const porTelefone = [{ phone_busca: { contains: t.telefone } }, ...(t.semDdd ? [{ phone_busca: { contains: t.semDdd } }] : [])];
    return { OR: [{ document: { contains: t.digitos } }, ...porTelefone] };
  }
  if (t.modo === "nome") {
    const porNome = { name_busca: { contains: literal(t.nome) } };
    return t.documento ? { OR: [porNome, { document: { contains: literal(t.documento) } }] } : porNome;
  }
  return {};
}

/** Filtro do cliente. `{}` no vazio; não chamar em "poucos_digitos" (a action responde vazio antes). */
export function ondeBuscaCliente(t: TermoDeBusca): Prisma.EmporioCustomerWhereInput {
  return onde(t);
}

export function ondeBuscaFornecedor(t: TermoDeBusca): Prisma.EmporioSupplierWhereInput {
  return onde(t);
}
