import { fail, ok, type ActionResult } from "@/lib/actions/types";
import { consultarCep, normalizarCep, type EnderecoDoCep, type FetchCep } from "@/lib/contatos/cep";
import { registrarFalha } from "@/lib/rate-limit";

/**
 * Q337 a Q339: busca o endereço de um CEP. É leitura de dado público, sem banco do tenant:
 * por isso não recebe `db`. O limite é por usuário (60 por minuto), contra uso da rota como proxy.
 */
const LIMITE_POR_MINUTO = 60;
const JANELA_SEG = 60;

export async function buscarCepAction(
  ator: { id: string },
  cep: string,
  fetchImpl?: FetchCep,
): Promise<ActionResult<EnderecoDoCep>> {
  const limpo = normalizarCep(cep);
  if (!limpo) return fail("VALIDATION_ERROR", "CEP inválido. Use os 8 números.", 422, "cep");

  // Redis fora não pode travar o cadastro: sem contador, libera.
  let excedeu = false;
  try {
    const n = await registrarFalha("cep", ator.id, LIMITE_POR_MINUTO, JANELA_SEG);
    excedeu = n > LIMITE_POR_MINUTO;
  } catch {
    excedeu = false;
  }
  if (excedeu) {
    return fail("RATE_LIMITED", "Muitas buscas de CEP. Espere um minuto e tente de novo.", 429);
  }

  const r = await consultarCep(limpo, fetchImpl);
  if (r.tipo === "achado") return ok(r.endereco);
  if (r.tipo === "inexistente") {
    return fail("NOT_FOUND", "CEP não encontrado. Confira ou preencha o endereço à mão.", 404);
  }
  return fail(
    "SERVICE_UNAVAILABLE",
    "Não deu para buscar o CEP agora. Preencha o endereço à mão.",
    503,
  );
}
