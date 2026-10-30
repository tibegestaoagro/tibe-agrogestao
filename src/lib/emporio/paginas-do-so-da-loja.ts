/**
 * Meu Empório, F6b (Q120): o que quem é "só da loja" (Gestor, Vendedor, Gerente
 * geral com "Só da loja") pode abrir no painel.
 *
 * A lista é do que é PERMITIDO, não do que é proibido: página nova da fazenda
 * nasce fechada para ele sem que ninguém precise lembrar. Função pura, sem
 * banco nem sessão, para o layout, o menu e os testes usarem a mesma decisão.
 */

/** Caminho exato ou qualquer coisa abaixo dele. */
const PERMITIDAS = [
  "/emporio",
  "/meu-dia",
  "/contatos",
  "/calculadoras",
  "/configuracoes/perfil",
  "/configuracoes/senha",
] as const;

/** Para onde o layout manda quem tentou abrir uma página fechada. */
export const DESTINO_DO_SO_DA_LOJA = "/emporio";

/**
 * Caminho vazio é tratado como fechado aqui; o layout nem chama esta função
 * sem caminho (o proxy sempre manda o cabeçalho), para não girar em laço.
 */
export function paginaPermitidaAoSoDaLoja(caminho: string): boolean {
  const limpo = caminho.split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (!limpo) return false;
  return PERMITIDAS.some((p) => limpo === p || limpo.startsWith(`${p}/`));
}
