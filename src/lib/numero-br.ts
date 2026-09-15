/**
 * O número como o brasileiro escreve, seja ele dinheiro ou quantidade.
 *
 * Módulo PURO, sem nenhuma dependência: é isso que permite a mesma leitura no
 * servidor, no handler de WhatsApp e dentro de um componente de navegador.
 *
 * NASCEU DE UM ERRO DE MIL VEZES, duas vezes. Primeiro no dinheiro, em que
 * `Number("60.000")` devolvia 60 e uma compra de sessenta mil virava sessenta
 * reais. Corrigido lá, o mesmo erro reapareceu na QUANTIDADE do WhatsApp
 * ("2.000 kg de ração" virava 2 quilos). Corrigido também, um revisor
 * independente mostrou que a TELA continuava com `Number` cru: contar 1.500 kg
 * no galpão e digitar "1.500" no ajuste gravava 1,5 kg, sobrescrevendo o saldo
 * com um clique e sem como desfazer.
 *
 * A lição, que é o motivo deste arquivo existir separado: enquanto a função
 * certa morava dentro do módulo do WhatsApp, a tela não tinha como usá-la, e
 * "a outra borda do mesmo campo" ficava para trás a cada correção.
 *
 * Aceita número puro, "60000", "60.000", "60.000,50", "60000.50", "2,5",
 * "60 mil" e "1,5 milhão".
 */
export function lerNumeroBr(bruto: unknown): number | null {
  if (typeof bruto === "number" && Number.isFinite(bruto)) return bruto;
  if (typeof bruto !== "string" || bruto.trim() === "") return null;

  const texto = bruto.trim().toLowerCase().replace(/r\$\s*/i, "").trim();

  /**
   * "60 mil" é como o produtor fala, e é o que o prompt manda o classificador
   * repassar. Sem isto, a frase-bandeira do §18.1 ("comprei 20 bezerros do
   * João por 60 mil") chegava com o valor ilegível e o assistente perguntava
   * "por quanto você comprou?" logo depois de o produtor ter dito quanto.
   * Pego pelo banco de provas contra produção, minutos depois do deploy.
   */
  const multiplicador = /milh(ao|ão|oes|ões)/.test(texto)
    ? 1_000_000
    : /\bmil\b/.test(texto)
      ? 1_000
      : 1;
  const semPalavra =
    multiplicador === 1 ? texto : texto.replace(/milh(ao|ão|oes|ões)|\bmil\b/, "").trim();

  // Vírgula presente: formato brasileiro, ponto é milhar.
  // Sem vírgula: ponto SÓ é decimal quando sobram 1 ou 2 casas no fim, ou
  // quando a parte inteira é zero ou vazia ("0.125" nunca é cento e vinte e cinco).
  const normalizado = semPalavra.includes(",")
    ? semPalavra.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(semPalavra) || /^0?\./.test(semPalavra)
      ? semPalavra
      : semPalavra.replace(/\./g, "");

  // "mil" sozinho, sem número na frente, é mil.
  if (normalizado === "" && multiplicador > 1) return multiplicador;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n * multiplicador : null;
}

/**
 * O dinheiro como o brasileiro LÊ: "R$ 60.000,50", nunca "R$ 60000.50".
 *
 * É a volta do caminho que `lerNumeroBr` faz na ida, e nasceu do mesmo tipo de
 * achado: contra o agente de produção, "anota uma despesa de 500 reais com
 * diesel" respondia "Entendi: R$ 500.00". Ponto decimal e sem separador de
 * milhar é o formato de OUTRO país, e em valor grande ("R$ 60000.00") o
 * produtor precisa contar os zeros com o dedo para saber quanto é.
 *
 * Cinco handlers já tinham esta função copiada, palavra por palavra, cada um
 * com o seu `reais()` privado, enquanto outros quinze pontos seguiam com
 * `toFixed(2)`. Aqui é o mesmo motivo do arquivo inteiro: enquanto a função
 * certa mora dentro de um módulo, quem está fora não a usa.
 */
export function reaisBr(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
