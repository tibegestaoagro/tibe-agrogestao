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

const PAGINA_MAXIMA = 10000;

/** A página que vira `skip` no banco: inteiro seguro de 1 a 10000. `1e20` ou `Infinity` estourariam o Prisma; o resto vira 1. */
export function paginaValida(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isSafeInteger(n) && n >= 1 && n <= PAGINA_MAXIMA ? n : 1;
}

export function lerTermo(q: string | null | undefined): TermoDeBusca {
  const texto = (q ?? "").trim();
  if (!texto) return { modo: "vazio" };
  if (!/\p{L}/u.test(texto)) {
    const digitos = texto.replace(/\D/g, "");
    if (digitos === "") return { modo: "vazio" };
    if (digitos.length < 3) return { modo: "poucos_digitos" };
    const telefone = digitos.length >= 10 ? (telefoneLocal(digitos) ?? digitos) : digitos;
    // "(34) 9987", "(34)9987" ou "+55 34 9987": o DDD (e o DDI) digitado com máscara e o resto pela metade.
    // O telefone guardado não tem DDD nem DDI, então o pedaço que vale é o que vem depois deles.
    const m = digitos.length >= 5 && digitos.length < 10 ? /^(\+?\s*55\s*)?(?:\(?\d{2}\)?[\s-]|\(\d{2}\))/.exec(texto) : null;
    const semDdd = m ? digitos.slice((m[1] ? 2 : 0) + 2) : "";
    return semDdd.length >= 3 ? { modo: "digitos", digitos, telefone, semDdd } : { modo: "digitos", digitos, telefone };
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
