/**
 * Conferência pura do cadastro do contato (PF/PJ). Sem banco e sem Zod: serve à rota,
 * ao cliente e ao fornecedor do Empório e ao agente do WhatsApp.
 */

export const UFS: readonly string[] = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const CONSUMIDOR_FINAL = { system_key: "consumidor_final", name: "Consumidor final" } as const;

type Txt = string | null;

export type CadastroDoContato = {
  name?: Txt;
  person_kind?: "pf" | "pj" | null;
  document?: Txt;
  phone?: Txt;
  state_registration?: Txt;
  birth_date?: Txt; // YYYY-MM-DD
  responsible_name?: Txt;
  address_zip?: Txt;
  address_street?: Txt;
  address_number?: Txt;
  address_complement?: Txt;
  address_district?: Txt;
  city?: Txt;
  address_state?: Txt;
  delivery_zip?: Txt;
  delivery_street?: Txt;
  delivery_number?: Txt;
  delivery_complement?: Txt;
  delivery_district?: Txt;
  delivery_city?: Txt;
  delivery_state?: Txt;
};

export type ResultadoCadastro =
  | { ok: true; dados: CadastroDoContato }
  | { ok: false; field: string; message: string };

const soDigitos = (s: string) => s.replace(/\D/g, "");

function digitoVerificador(base: number[], pesos: number[]): number {
  const soma = base.reduce((acc, d, i) => acc + d * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  const n = digitos.split("").map(Number);
  const d1 = digitoVerificador(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return n[9] === d1 && n[10] === d2;
}

/** CNPJ sem pontuação e em maiúscula: o alfanumérico tem letra nas 12 primeiras posições. */
export const normalizarCnpj = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

/**
 * Aceita o CNPJ numérico e o alfanumérico da Receita (IN RFB 2.229/2024): 12 posições de
 * número ou letra maiúscula e 2 dígitos verificadores numéricos. Cada posição vale o código
 * ASCII menos 48 (0 a 9 valem 0 a 9, A vale 17); o cálculo e os pesos são os de sempre.
 */
export function cnpjValido(valor: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(valor) || /^(.)\1{13}$/.test(valor)) return false;
  const n = valor.split("").map((c) => c.charCodeAt(0) - 48);
  const d1 = digitoVerificador(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return n[12] === d1 && n[13] === d2;
}

export function formatarDocumento(d: string | null): string {
  if (!d) return "";
  if (/^\d{11}$/.test(d)) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^[0-9A-Z]{12}\d{2}$/.test(d)) return d.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  return d;
}

export function formatarCep(d: string | null): string {
  if (!d) return "";
  return /^\d{8}$/.test(d) ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : d;
}

export function cadastroIncompleto(c: {
  name: string;
  person_kind: string | null;
  document: string | null;
  phone: string | null;
  system_key: string | null;
}): boolean {
  if (c.system_key) return false;
  return !c.person_kind || !c.document || !c.phone;
}

/** Hoje em Brasília, como YYYY-MM-DD (o aniversariante de hoje não está no futuro). */
function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, me - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d;
}

const CAMPOS_TEXTO = [
  "name", "phone", "responsible_name", "address_street", "address_number", "address_complement",
  "address_district", "city", "delivery_street", "delivery_number", "delivery_complement",
  "delivery_district", "delivery_city",
] as const;

const erro = (field: string, message: string): ResultadoCadastro => ({ ok: false, field, message });

/**
 * Só o FORMATO dos campos presentes (CPF/CNPJ, CEP, UF, inscrição, nascimento).
 * O que é obrigatório no cliente do Empório é de `faltaNoCadastro`
 * (`src/lib/emporio/cliente-cadastro.ts`); em Contatos, nada é.
 */
export function conferirCadastro(input: CadastroDoContato): ResultadoCadastro {
  const tem = (k: keyof CadastroDoContato) => k in input;
  const dados: Record<string, string | null> = {};
  const limpo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

  for (const k of CAMPOS_TEXTO) if (tem(k)) dados[k] = limpo(input[k]);

  const kind: "pf" | "pj" | null = input.person_kind === "pf" || input.person_kind === "pj" ? input.person_kind : null;
  if (tem("person_kind")) dados.person_kind = kind;

  if (tem("document")) {
    const bruto = limpo(input.document);
    if (bruto === null) {
      dados.document = null;
    } else {
      if (!kind) return erro("person_kind", "Escolha pessoa física ou jurídica para informar o documento.");
      if (kind === "pf") {
        const dig = soDigitos(bruto);
        if (!cpfValido(dig)) return erro("document", "CPF inválido. Confira os 11 números.");
        dados.document = dig;
      } else {
        const cnpj = normalizarCnpj(bruto);
        if (!cnpjValido(cnpj)) return erro("document", "CNPJ inválido. Confira os 14 caracteres.");
        dados.document = cnpj;
      }
    }
  }

  if (tem("state_registration")) {
    const bruto = limpo(input.state_registration);
    if (bruto === null) {
      dados.state_registration = null;
    } else if (bruto.toUpperCase() === "ISENTO") {
      dados.state_registration = "ISENTO";
    } else {
      const dig = soDigitos(bruto);
      if (dig.length < 8 || dig.length > 14) {
        return erro("state_registration", "Inscrição estadual: use só números (de 8 a 14) ou ISENTO.");
      }
      dados.state_registration = dig;
    }
  }

  for (const k of ["address_zip", "delivery_zip"] as const) {
    if (!tem(k)) continue;
    const bruto = limpo(input[k]);
    if (bruto === null) {
      dados[k] = null;
      continue;
    }
    const dig = soDigitos(bruto);
    if (dig.length !== 8) return erro(k, "CEP inválido. Use os 8 números.");
    dados[k] = dig;
  }

  for (const k of ["address_state", "delivery_state"] as const) {
    if (!tem(k)) continue;
    const bruto = limpo(input[k]);
    if (bruto === null) {
      dados[k] = null;
      continue;
    }
    const uf = bruto.toUpperCase();
    if (!UFS.includes(uf)) return erro(k, "Escolha a UF da lista.");
    dados[k] = uf;
  }

  if (tem("birth_date") && kind !== "pj") {
    const bruto = limpo(input.birth_date);
    if (bruto === null) {
      dados.birth_date = null;
    } else {
      if (!dataValida(bruto)) return erro("birth_date", "Data de nascimento inválida. Use o formato AAAA-MM-DD.");
      if (bruto > hojeEmBrasilia()) return erro("birth_date", "A data de nascimento não pode ser no futuro.");
      dados.birth_date = bruto;
    }
  }

  // Dado do outro tipo não fica: nascimento é só de PF, responsável é só de PJ.
  if (kind === "pj" && tem("birth_date")) dados.birth_date = null;
  if (kind === "pf" && tem("responsible_name")) dados.responsible_name = null;

  return { ok: true, dados: dados as CadastroDoContato };
}
