import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Avaliação do agente, Fase 3 (Módulo do agente WhatsApp).
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m69`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("1. Medidor de custo");
  {
    const os = await import("node:os");
    const path = await import("node:path");
    const { custoDaChamada, criarMedidor, OrcamentoEsgotado } = await import("./avaliacao/medidor");
    check("1M de entrada sem cache no gpt-4o-mini custa US$ 0,15", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 0 }) - 0.15) < 1e-9);
    check("entrada em cache cobra o preço de cache", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) - 0.075) < 1e-9);
    check("saída do gpt-5.6-terra custa US$ 12 por milhão", Math.abs(custoDaChamada("gpt-5.6-terra", { completion_tokens: 1_000_000 }) - 12) < 1e-9);
    check("cached_tokens maior que prompt_tokens nunca gera custo negativo", custoDaChamada("gpt-4o-mini", { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) >= 0);
    let semPreco = false;
    try { custoDaChamada("modelo-inexistente", {}); } catch { semPreco = true; }
    check("modelo sem preço recusa em vez de contar zero", semPreco);

    const arquivo = path.join(os.tmpdir(), `gasto-m69-${Date.now()}.json`);
    try {
      fs.writeFileSync(arquivo, JSON.stringify({ total_usd: 29.99 }));
      let enviadas = 0;
      const medidor = criarMedidor({
        arquivo,
        enviar: async () => {
          enviadas += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      await medidor.transporte({ model: "gpt-5.6-terra" });
      check("chamada abaixo do teto passa e soma o custo", enviadas === 1 && Math.abs(medidor.gastoTotal() - 30.19) < 1e-6, String(medidor.gastoTotal()));
      let parou = false;
      try { await medidor.transporte({ model: "gpt-5.6-terra" }); } catch (e) { parou = e instanceof OrcamentoEsgotado; }
      check("no teto, a chamada seguinte nem sai", parou && enviadas === 1);
      check("o gasto fica gravado no arquivo", JSON.parse(fs.readFileSync(arquivo, "utf8")).total_usd > 30);

      let naoEnviouComModeloInvalido = true;
      let enviadas2 = 0;
      const medidor2 = criarMedidor({
        arquivo: path.join(os.tmpdir(), `gasto-m69-2-${Date.now()}.json`),
        enviar: async () => {
          enviadas2 += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      try { await medidor2.transporte({ model: "modelo-inexistente" }); } catch { naoEnviouComModeloInvalido = enviadas2 === 0; }
      check("medidor recusa modelo sem preço antes de enviar", naoEnviouComModeloInvalido);
    } finally {
      fs.rmSync(arquivo, { force: true });
    }
  }

  console.log("\n2. Casos, partição e pontuação");
  {
    const { validarCasos, particao } = await import("./avaliacao/casos");
    const { pontuarMensagem, agregar, aprovar, compararCampo } = await import("./avaliacao/pontuar");
    const { buscarIntencao } = await import("@/lib/agente/intencoes");
    const hoje = new Date(2026, 8, 15, 12);

    check("caso válido passa", validarCasos([{ id: "p-1", autor: "produtor", tipo: "mensagem", texto: "quantos animais eu tenho", esperado: [{ intent: "consultar_rebanho" }] }]).length === 0);
    check("intenção inexistente é recusada", validarCasos([{ id: "p-2", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "vender_fazenda" }] }]).length === 1);
    check("intenção legada é recusada", validarCasos([{ id: "p-3", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "registrar_lote_animal" }] }]).length === 1);
    check("campo que a intenção não declara é recusado", validarCasos([{ id: "p-4", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "consultar_rebanho", campos: { valor: 10 } }] }]).length === 1);
    check("id repetido é recusado", validarCasos([
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "a", esperado: [{ intent: "ajuda" }] },
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "b", esperado: [{ intent: "ajuda" }] },
    ]).length === 1);
    check("conversa com grava inválido é recusada", validarCasos([{ id: "c-1", autor: "conversa", tipo: "conversa", passos: [{ texto: "a", grava: "talvez" }, { texto: "b", grava: "nao" }] }]).length === 1);
    check("partição é estável", particao("p-1") === particao("p-1"));
    const ids = Array.from({ length: 1000 }, (_, i) => `caso-${i}`);
    const noAjuste = ids.filter((id) => particao(id) === "ajuste").length;
    check("partição fica perto de 70/30", noAjuste > 640 && noAjuste < 760, String(noAjuste));

    const negocio = buscarIntencao("registrar_negocio_gado")!;
    const campo = (nome: string) => negocio.campos.find((c) => c.nome === nome)!;
    check("60 mil casa com 60000", compararCampo(campo("valor"), 60000, "60 mil", hoje));
    check("texto com preposição casa", compararCampo(campo("contato"), "João", "do João", hoje));
    check("dia 10 casa com 10/09/2026", compararCampo(campo("vencimento"), "dia 10", "10/09/2026", hoje));
    check("itens comparados item a item", compararCampo(campo("itens"), [{ categoria: "bezerro", quantidade: 20 }], [{ categoria: "bezerros", quantidade: "20" }], hoje));
    check("numero ilegivel dos dois lados nao e acerto", compararCampo(campo("valor"), "abc", "xyz", hoje) === false);
    check("texto esperado vazio nunca acerta", compararCampo(campo("contato"), "", "João", hoje) === false);

    const caso = { id: "p-9", autor: "produtor" as const, tipo: "mensagem" as const, texto: "comprei 20 bezerros do João por 60 mil, pago dia 10", esperado: [{ intent: "registrar_negocio_gado", campos: { tipo: "compra", valor: 60000, vencimento: "dia 10" } }] };
    const certa = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: "60 mil", vencimento: "dia 10" } }], hoje);
    check("classificação certa pontua tudo", certa.pedidos_certos === 1 && certa.pedidos_total === 1 && certa.campos_certos === 3 && certa.campos_total === 3, JSON.stringify(certa));
    const cortada = pontuarMensagem(caso, [
      { intent: "registrar_negocio_gado", parameters: { tipo: "compra" } },
      { intent: "ambigua", parameters: {} },
    ], hoje);
    check("ação cortada em dois pedidos é erro e perde os campos", cortada.pedidos_certos === 1 && cortada.pedidos_total === 2 && cortada.campos_certos === 1 && cortada.erros.some((e) => e.startsWith("pedido a mais")), JSON.stringify(cortada));
    const inventada = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: 60000, vencimento: "dia 10", parcelas: 3 } }], hoje);
    check("número inventado conta como campo errado", inventada.campos_total === 4 && inventada.campos_certos === 3 && inventada.erros.includes("número inventado: parcelas"), JSON.stringify(inventada));

    const m = agregar([certa, cortada]);
    check("agrega intenção geral", Math.abs(m.intencao_geral - 2 / 3) < 1e-9, String(m.intencao_geral));
    check("gravação indevida reprova mesmo com nota cheia", aprovar(agregar([certa]), 1).aprovado === false);
    check("nota cheia sem gravação indevida aprova", aprovar(agregar([certa]), 0).aprovado === true);
    check("agregar sem mensagens nao gera NaN", agregar([]).intencao_geral === 0 && agregar([]).campos === 1);
    check("sem mensagens reprova", aprovar(agregar([]), 0).aprovado === false);
  }

  console.log("\n3. Fazenda de avaliação");
  {
    const { montarFazenda, contarLinhasDeNegocio, descreverFazenda, descreverCatalogo } = await import("./avaliacao/fazenda");
    const fazenda = await montarFazenda(`m69-${Date.now()}`);
    try {
      const { db } = fazenda;
      check("duas fazendas", (await db.property.count()) === 2);
      check("quatro pastos", (await db.pasture.count()) === 4);
      check("produto Sal mineral existe", (await db.product.count({ where: { name: "Sal mineral" } })) === 1);
      check("contato do WhatsApp já existe (não é primeiro contato)", (await db.whatsAppContact.count()) === 1);
      const antes = await contarLinhasDeNegocio(db);
      await db.shoppingItem.create({ data: (await import("@/lib/prisma")).scoped({ description: "Teste M69" }) as never });
      check("uma linha de negócio nova é contada", (await contarLinhasDeNegocio(db)) === antes + 1);
      check("briefing da fazenda cita o Pasto da Baixada", descreverFazenda().includes("Pasto da Baixada"));
      check("catálogo cita registrar_negocio_gado e não cita exemplos", descreverCatalogo().includes("registrar_negocio_gado") && !descreverCatalogo().includes("(§"));
    } finally {
      await fazenda.limpar();
    }

    // A próxima tarefa monta uma fazenda por conversa: duas montagens na
    // mesma janela de milissegundo não podem colidir em nenhum campo único
    // (Tenant.document, User.email).
    const [fazendaA, fazendaB] = await Promise.all([montarFazenda("dupla-a"), montarFazenda("dupla-b")]);
    try {
      check("duas montagens simultâneas não colidem", fazendaA.tenantId !== fazendaB.tenantId);
      check("cada uma tem sua própria fazenda", (await fazendaA.db.property.count()) === 2 && (await fazendaB.db.property.count()) === 2);
    } finally {
      await Promise.all([fazendaA.limpar(), fazendaB.limpar()]);
    }
  }

  if (falhas === 0) console.log("\n✅ Todos os testes passaram");
  else console.log(`\n❌ ${falhas} testes falharam`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro ao rodar testes:", e);
  process.exit(1);
});
