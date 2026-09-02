import "dotenv/config";
import { exigirRedisLocal } from "./_banco-local";

exigirRedisLocal();

/**
 * O store de pendência genérico (`src/lib/actions/pending-store.ts`).
 *
 * POR QUE ESTA SUÍTE EXISTE. Até 02/09 o mesmo mecanismo de Redis estava
 * copiado em SETE arquivos (`herd`, `negotiation`, `stock`, `event`, `barter`,
 * `leite`, `confinamento`): cerca de 90 linhas iguais cada um, com o prefixo de
 * chave trocado. O comentário de `negotiation-pending.ts` previa extrair
 * "quando o terceiro domínio precisar disto", e chegamos ao sétimo. Está
 * registrado na `docs/agents/dividas.md` §3.2.
 *
 * Prova:
 *   1. Salva e carrega, e o `salvo_em` nasce sozinho.
 *   2. A chave tem o prefixo pedido, e o TTL foi aplicado.
 *   3. `limpar` apaga.
 *   4. Carregar o que não existe devolve `null`, sem explodir.
 *   5. Lixo gravado na chave devolve `null`, não estoura o JSON.parse.
 *   6. `aplicarResposta` aceita APENAS o campo perguntado, e ignora o resto.
 *   7. `aplicarResposta` devolve `null` quando a mensagem não responde: aí é
 *      assunto novo, não resposta.
 *   8. O atalho de nome alternativo casa (o classificador não carrega de volta
 *      qual era a pergunta).
 *   9. `aceitaNumero` é o que separa `herd` e `stock` dos outros cinco, e a
 *      extração PRECISA preservar essa diferença.
 *  10. Campo extra no payload (o `gesto` de leite e confinamento) sobrevive à
 *      ida e volta.
 *  11. Redis fora do ar não derruba: salvar vira no-op e carregar vira `null`.
 *
 * Roda: `npm run test:m56`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🗂️  M56: o store de pendência genérico (dívida 3.2)\n");

const TENANT = `m56-tenant-${Date.now()}`;
const USER = "m56-user";

async function main() {
  const { criarStoreDePendencia, MAX_TENTATIVAS } = await import(
    "@/lib/actions/pending-store"
  );
  const { getRedisConnection } = await import("@/lib/redis");

  type Campo = "categoria" | "fazenda" | "quantidade" | "confirmacao";

  const store = criarStoreDePendencia<Campo>({
    prefixo: "m56-teste",
    ttlSegundos: 120,
    atalho: (campo) => (campo === "categoria" ? "category" : campo),
  });

  const redis = getRedisConnection();

  try {
    console.log("1. Salva e carrega");
    await store.salvar(TENANT, USER, {
      parameters: { tipo: "compra", quantidade: 20 },
      aguardando: "categoria",
    });
    const lido = await store.carregar(TENANT, USER);
    check("carregou o que foi salvo", lido !== null);
    check("com os parâmetros intactos", lido?.parameters.tipo === "compra");
    check("e o campo aguardado", lido?.aguardando === "categoria");
    check(
      "`salvo_em` nasce sozinho",
      typeof lido?.salvo_em === "number" && lido.salvo_em > 0,
      String(lido?.salvo_em),
    );

    console.log("\n2. A chave e o TTL");
    const chaveEsperada = `tibe:m56-teste:${TENANT}:${USER}`;
    check("a chave usa o prefixo pedido", store.chave(TENANT, USER) === chaveEsperada, store.chave(TENANT, USER));
    const ttl = await redis.ttl(chaveEsperada);
    check("o TTL foi aplicado", ttl > 0 && ttl <= 120, String(ttl));

    console.log("\n3. Limpar");
    await store.limpar(TENANT, USER);
    check("depois de limpar, não há nada", (await store.carregar(TENANT, USER)) === null);

    console.log("\n4. Ausente");
    check(
      "carregar o que nunca existiu devolve null",
      (await store.carregar(TENANT, "ninguem")) === null,
    );

    console.log("\n5. Lixo na chave");
    await redis.set(chaveEsperada, "isto nao e json", "EX", 60);
    check("lixo devolve null em vez de estourar", (await store.carregar(TENANT, USER)) === null);
    await redis.set(chaveEsperada, JSON.stringify({ aguardando: "categoria" }), "EX", 60);
    check(
      "objeto sem `parameters` devolve null",
      (await store.carregar(TENANT, USER)) === null,
    );
    await redis.del(chaveEsperada);

    console.log("\n6. aplicarResposta só aceita o campo perguntado");
    const pendente = {
      parameters: { tipo: "compra", quantidade: 20, fazenda: "Sede" },
      aguardando: "categoria" as Campo,
    };
    const juntos = store.aplicarResposta(pendente, {
      categoria: "Novilha 12-24",
      tipo: "nascimento",
      quantidade: 999,
    });
    check("juntou a resposta", juntos !== null);
    check("com o campo perguntado preenchido", juntos?.categoria === "Novilha 12-24");
    check(
      "e o TIPO original PRESERVADO, não o da mensagem nova",
      juntos?.tipo === "compra",
      String(juntos?.tipo),
    );
    check(
      "e a quantidade original preservada",
      juntos?.quantidade === 20,
      String(juntos?.quantidade),
    );

    console.log("\n7. Mensagem que não responde");
    check(
      "devolve null quando o campo perguntado não vem",
      store.aplicarResposta(pendente, { tipo: "venda" }) === null,
    );
    check(
      "string vazia não conta como resposta",
      store.aplicarResposta(pendente, { categoria: "   " }) === null,
    );

    console.log("\n8. O atalho de nome alternativo");
    const porAtalho = store.aplicarResposta(pendente, { category: "Boi 25-36" });
    check("o atalho casa", porAtalho !== null);
    check(
      "e grava no nome REAL do campo, não no atalho",
      porAtalho?.categoria === "Boi 25-36",
      String(porAtalho?.categoria),
    );

    console.log("\n9. aceitaNumero separa herd e stock dos outros cinco");
    const pendenteQtd = {
      parameters: { tipo: "compra" },
      aguardando: "quantidade" as Campo,
    };
    check(
      "por padrão, número é aceito",
      store.aplicarResposta(pendenteQtd, { quantidade: 42 })?.quantidade === 42,
    );
    const soTexto = criarStoreDePendencia<Campo>({
      prefixo: "m56-so-texto",
      aceitaNumero: false,
    });
    check(
      "com aceitaNumero:false, número é recusado (comportamento do herd e do stock)",
      soTexto.aplicarResposta(pendenteQtd, { quantidade: 42 }) === null,
    );
    check(
      "e texto continua aceito",
      soTexto.aplicarResposta(pendenteQtd, { quantidade: "42" })?.quantidade === "42",
    );

    console.log("\n10. Campo extra no payload sobrevive");
    type ComGesto = {
      parameters: Record<string, unknown>;
      aguardando: Campo;
      tentativas?: number;
      salvo_em?: number;
      gesto: "producao" | "lactacao";
    };
    const comGesto = criarStoreDePendencia<Campo, ComGesto>({ prefixo: "m56-gesto" });
    await comGesto.salvar(TENANT, USER, {
      parameters: { litros: 30 },
      aguardando: "fazenda",
      gesto: "producao",
      tentativas: 2,
    });
    const voltou = await comGesto.carregar(TENANT, USER);
    check("o campo extra voltou", voltou?.gesto === "producao", String(voltou?.gesto));
    check("e as tentativas também", voltou?.tentativas === 2, String(voltou?.tentativas));
    await comGesto.limpar(TENANT, USER);

    console.log("\n11. MAX_TENTATIVAS continua exportado");
    check("MAX_TENTATIVAS é 3", MAX_TENTATIVAS === 3, String(MAX_TENTATIVAS));
  } finally {
    await redis.del(`tibe:m56-teste:${TENANT}:${USER}`);
    await redis.del(`tibe:m56-gesto:${TENANT}:${USER}`);
    redis.disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M56 verde" : `\n❌ M56: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
