import { primeiroDia, somarMeses, textoDoMes, type MesCivil } from "@/lib/emporio/mes";

/**
 * Opções de mês para os seletores das telas de servidor. Fica fora dos
 * componentes client de propósito: o cálculo do mês de Brasília mora em
 * `@/lib/emporio`, e a tela recebe o resultado pronto.
 */
const NOME_DO_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export function rotuloDoMes(m: MesCivil): string {
  return NOME_DO_MES.format(primeiroDia(m));
}

/** Do mês `centro` menos `antes` até `centro` mais `depois`, em ordem cronológica. */
export function opcoesDeMes(centro: MesCivil, antes: number, depois: number): { valor: string; rotulo: string }[] {
  const lista: { valor: string; rotulo: string }[] = [];
  for (let n = -antes; n <= depois; n++) {
    const m = somarMeses(centro, n);
    lista.push({ valor: textoDoMes(m), rotulo: rotuloDoMes(m) });
  }
  return lista;
}

/** "AAAA-MM" como "MM/AAAA". */
export const mesBr = (aaaaMm: string) => aaaaMm.slice(0, 7).split("-").reverse().join("/");
