/** Formata CPF/CNPJ (dígitos) para exibição, identificando o tipo pela quantidade de dígitos. */
export function formatDocument(document: string): { formatted: string; label: "CPF" | "CNPJ" | "Documento" } {
  const digits = document.replace(/\D/g, "");
  if (digits.length === 11) {
    return {
      formatted: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`,
      label: "CPF",
    };
  }
  if (digits.length === 14) {
    return {
      formatted: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`,
      label: "CNPJ",
    };
  }
  return { formatted: document, label: "Documento" };
}
