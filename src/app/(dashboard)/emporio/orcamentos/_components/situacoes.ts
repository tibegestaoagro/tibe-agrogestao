/** Fora do módulo "use client" para a página server poder ler o valor. */
export const SITUACOES_DO_ORCAMENTO: { valor: string; rotulo: string }[] = [
  { valor: "acompanhamento", rotulo: "Em acompanhamento" },
  { valor: "aberto", rotulo: "Em aberto" },
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "faturado", rotulo: "Faturados" },
  { valor: "todos", rotulo: "Todos" },
];
