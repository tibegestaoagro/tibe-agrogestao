/** Normaliza telefone para comparação: mantém apenas dígitos. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
