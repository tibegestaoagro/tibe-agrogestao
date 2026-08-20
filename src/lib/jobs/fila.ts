/**
 * O nome da fila e a chave que decide quem executa a rotina diária.
 *
 * Fica num arquivo próprio porque tanto a rota de cron quanto o worker
 * precisam dos dois, e um nome de fila divergente entre produtor e consumidor
 * é o tipo de erro que não dá mensagem: a rota enfileira, o worker fica
 * esperando em outra fila, e ninguém percebe até o alerta não chegar.
 */

export const FILA_DE_ROTINA = "tibe-alerts";

/**
 * Só existe worker quando alguém declara que existe.
 *
 * Não dá para detectar isso sozinho de forma confiável (o worker pode estar
 * de pé e o Redis responder mesmo assim), e errar para o lado do "tem worker"
 * é o pior caso: a rota enfileiraria, ninguém consumiria, e o sistema pararia
 * de gerar alerta em silêncio. Por isso o padrão é NÃO ter, e ligar é um ato
 * deliberado de quem provisionou o processo.
 */
export function temWorkerDedicado(): boolean {
  return process.env.ROTINA_COM_WORKER === "1";
}
