/** Normaliza telefone para comparação: mantém apenas dígitos. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Garante o DDI do Brasil (55) em telefones sem código de país — o produto
 * hoje prioriza o Brasil, e o bot do WhatsApp (resolve-contact) casa contato
 * por dígitos exatos, então um número salvo sem "55" nunca bate com o que a
 * Meta/Evolution manda. Números que já têm DDI (12/13 dígitos começando com
 * 55) ou fora do padrão DDD+número (10/11 dígitos) ficam como estão.
 */
export function toBrazilPhoneDigits(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
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
