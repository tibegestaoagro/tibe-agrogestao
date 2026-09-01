/**
 * Dias e janelas de período no fuso do produtor (Área Leite, §11).
 *
 * O servidor da Vercel roda em UTC, e o produtor não. "Produção de hoje"
 * calculada em UTC muda de dia às 21h para quem está em Mato Grosso: a lição é
 * a mesma que `confinement.ts` e `financial-reports.ts` já carregam, e por isso
 * a constante do fuso se repete nos três em vez de virar import de um deles.
 *
 * Este arquivo não toca em Prisma de propósito: são funções puras de calendário,
 * e é isso que permite testá-las sem banco.
 */

export const FUSO_PRODUTOR = "America/Sao_Paulo";

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_PRODUTOR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** O dia de calendário do produtor, como "AAAA-MM-DD". */
export function diaDoProdutor(instante: Date): string {
  const p = PARTES.formatToParts(instante);
  const pega = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "00";
  return `${pega("year")}-${pega("month")}-${pega("day")}`;
}

/**
 * Quanto o fuso do produtor está adiantado em relação ao UTC, NAQUELE instante.
 *
 * Depende do instante porque horário de verão existe: o Brasil não tem desde
 * 2019, mas o dado histórico do produtor pode ser anterior, e uma constante de
 * -3h erraria uma hora em registro de 2018. Calcular custa uma formatação.
 */
function deslocamentoMs(instante: Date): number {
  const p = PARTES.formatToParts(instante);
  const n = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  // `hour` com hour12:false devolve 24 na meia-noite em alguns runtimes.
  const hora = n("hour") % 24;
  const comoUTC = Date.UTC(n("year"), n("month") - 1, n("day"), hora, n("minute"), n("second"));
  return comoUTC - instante.getTime();
}

/**
 * O instante UTC da meia-noite local de um dia "AAAA-MM-DD".
 *
 * Duas passadas porque o deslocamento é medido NUM instante, e o instante certo
 * é justamente o que se quer descobrir. A primeira chuta, a segunda corrige.
 */
export function inicioDoDia(diaISO: string): Date {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  const chute = Date.UTC(ano, mes - 1, dia);
  let instante = chute - deslocamentoMs(new Date(chute));
  instante = chute - deslocamentoMs(new Date(instante));
  return new Date(instante);
}

/** O primeiro instante do dia SEGUINTE: use como limite exclusivo (`lt`). */
export function fimDoDia(diaISO: string): Date {
  return inicioDoDia(somarDias(diaISO, 1));
}

/** Soma dias a um "AAAA-MM-DD", devolvendo outro "AAAA-MM-DD". */
export function somarDias(diaISO: string, dias: number): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

/** Todos os dias de `de` até `ate`, inclusive nas duas pontas. */
export function diasEntre(de: string, ate: string): string[] {
  const saida: string[] = [];
  let atual = de;
  // Teto de segurança: dois anos. Nenhuma janela do §11 chega perto, e um
  // parâmetro invertido não pode virar laço infinito numa rota.
  for (let i = 0; atual <= ate && i < 800; i++) {
    saida.push(atual);
    atual = somarDias(atual, 1);
  }
  return saida;
}

export type Janela = {
  chave: JanelaChave;
  rotulo: string;
  /** Primeiro dia, inclusive. */
  de: string;
  /** Último dia, inclusive. */
  ate: string;
};

export type JanelaChave =
  | "hoje"
  | "ontem"
  | "semana"
  | "mes"
  | "mes_anterior"
  | "ano";

/**
 * As seis janelas do §11, ancoradas no dia de HOJE para o produtor.
 *
 * Duas escolhas registradas, porque o §11 não define nenhuma das duas:
 *
 * - **"Semana" são os últimos sete dias corridos**, incluindo hoje, e não a
 *   semana do calendário. É o que responde "minha produção caiu?" numa
 *   quarta-feira; a semana de calendário compararia três dias contra sete.
 * - **As janelas em curso terminam HOJE**, não no fim do mês. "Produção do
 *   mês" no dia 5 é a soma de cinco dias, e a média diária divide por cinco.
 *   Dividir por 30 mostraria um terço da média real todo começo de mês.
 */
export function janelasDoPeriodo(agora: Date): Janela[] {
  const hoje = diaDoProdutor(agora);
  const [ano, mes] = hoje.split("-").map(Number);
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const mesAnterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;

  return [
    { chave: "hoje", rotulo: "Hoje", de: hoje, ate: hoje },
    { chave: "ontem", rotulo: "Ontem", de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { chave: "semana", rotulo: "Últimos 7 dias", de: somarDias(hoje, -6), ate: hoje },
    { chave: "mes", rotulo: "Este mês", de: primeiroDoMes, ate: hoje },
    {
      chave: "mes_anterior",
      rotulo: "Mês anterior",
      de: `${mesAnterior}-01`,
      ate: somarDias(primeiroDoMes, -1),
    },
    { chave: "ano", rotulo: "Acumulado no ano", de: `${ano}-01-01`, ate: hoje },
  ];
}
