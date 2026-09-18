/** Normaliza telefone para comparação: mantém apenas dígitos. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

const PRIMEIRO_DIGITO_CELULAR_ANTIGO = new Set(["6", "7", "8", "9"]);

/**
 * Garante a forma canônica de um celular brasileiro: 55 + DDD + 9 dígitos.
 * Completa o DDI quando falta, e completa o nono dígito quando falta: conta
 * de WhatsApp criada antes da mudança do nono dígito ainda manda o número
 * antigo, de 12 dígitos, e o bot (resolve-contact) casa contato por dígitos
 * exatos, então precisa comparar na mesma forma em que o número foi salvo.
 *
 * Fixo NUNCA ganha o 9: só completa quando o primeiro dígito depois do DDD é
 * 6, 7, 8 ou 9 (celular antigo); fixo começa com 2 a 5. Número de 11 dígitos
 * sem DDI só é tratado como celular brasileiro se já vier com o 9 (senão pode
 * ser estrangeiro, que também tem 11 dígitos, ex.: EUA com código de país).
 */
export function toBrazilPhoneDigits(phone: string): string {
  const digits = normalizePhone(phone);

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    if (digits.length === 13) return digits; // já tem o 9
    const ddd = digits.slice(2, 4);
    const numero = digits.slice(4);
    if (PRIMEIRO_DIGITO_CELULAR_ANTIGO.has(numero[0])) return `55${ddd}9${numero}`;
    return digits; // fixo: fica com 12 dígitos
  }

  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const numero = digits.slice(2);
    if (PRIMEIRO_DIGITO_CELULAR_ANTIGO.has(numero[0])) return `55${ddd}9${numero}`;
    return `55${digits}`;
  }

  if (digits.length === 11 && digits[2] === "9") return `55${digits}`;

  return digits;
}

/** Formata dígitos de telefone BR para exibição: +55 (DD) NNNNN-NNNN. */
export function formatBrazilPhone(phone: string): string {
  const digits = normalizePhone(phone);
  const hasDdi = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  const local = hasDdi ? digits.slice(2) : digits;
  const prefix = hasDdi ? "+55 " : "";
  if (local.length === 11) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}
