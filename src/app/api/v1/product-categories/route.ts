import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/product-categories  as categorias de produto (Módulo 31, §9.1)
 *
 * Semeia as 15 categorias do documento no primeiro acesso do tenant e devolve
 * a lista. Semear na LEITURA, e não na migração, faz tenant novo e antigo
 * receberem o mesmo tratamento sem tocar em dado de produção; `ensure` é
 * idempotente e barato (um `count` quando já existem).
 *
 * Só leitura: criar categoria própria não está no §9.1 e não foi pedido.
 *
 * O guard usa o módulo "rebanho" pelo mesmo motivo de Minha Fazenda: o PRD §5.2
 * não define um `ModuleKey` para Estoque, e as negociações que alimentam o
 * estoque já vivem sob essa chave. Um recorte próprio criaria a situação de
 * alguém poder comprar um produto e não poder ver onde ele foi parar.
 */
async function GETHandler() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  /**
   * A semeadura só acontece para quem PODE escrever.
   *
   * Esta é uma rota de leitura que grava, e isso tem duas consequências que
   * escaparam na primeira versão: um VISUALIZADOR criava 15 linhas só de abrir
   * a tela, e um tenant em `read_only` por atraso de pagamento também, furando
   * a promessa de que naquele estado nada é gravado. A segunda chamada ao
   * `guard` reusa a régua de cobrança que já existe, em vez de reimplementá-la
   * aqui; quando ela recusa, a resposta é a lista como está (vazia, no caso),
   * nunca um erro: quem só quer ler continua lendo.
   */
  const podeEscrever = await guard("rebanho", "write", { profile: "fazenda" });
  const criadas = "error" in podeEscrever ? 0 : await ensureProductCategories(g.db);
  const categorias = await listProductCategories(g.db);

  return apiOk(categorias, { seeded: criadas });
}

export const GET = withApi(GETHandler);
