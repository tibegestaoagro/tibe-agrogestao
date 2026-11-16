import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M119: endereço pelo CEP (Q337 a Q339, spec 2026-11-16-endereco-pelo-cep-design).
 * Roda: `npm run test:m119`
 *
 * Action e núcleo com `fetch` falso (nenhuma chamada de rede): ViaCEP ok, CEP inexistente (404),
 * ViaCEP fora (lança e demora) caindo na BrasilAPI, os dois fora (503), CEP inválido (422),
 * cache (segundo pedido não chama o serviço), campos vazios viram null e o limite de 60 por minuto.
 * Precisa do Redis (cache e limite): passe REDIS_URL local.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}
const j = (x: unknown) => JSON.stringify(x);

console.log("📮 M119: endereço pelo CEP (Q337 a Q339)\n");

async function main() {
  const { buscarCepAction } = await import("@/lib/actions/cep");
  const { getRedisConnection } = await import("@/lib/redis");
  const redis = getRedisConnection();

  // CEPs únicos por execução: o cache de 30 dias não pode contaminar a rodada seguinte.
  const base = String(Date.now()).slice(-7);
  const cep = (n: number) => `${n}${base}`;
  const stamp = Date.now().toString(36);
  const chaves: string[] = [];
  const usar = (n: number) => {
    const c = cep(n);
    chaves.push(`tibe:cep:${c}`);
    return c;
  };
  const usuarios: string[] = [];
  const ator = (rotulo: string) => {
    const id = `m119-${rotulo}-${stamp}`;
    usuarios.push(`tibe:login-attempts:cep:${id}`);
    return { id };
  };

  type Chamada = { url: string };
  function falso(
    resp: (url: string) => Promise<Response> | Response,
  ): { fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>; chamadas: Chamada[] } {
    const chamadas: Chamada[] = [];
    return {
      chamadas,
      fetch: async (url) => {
        chamadas.push({ url });
        return resp(url);
      },
    };
  }
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

  try {
    // 1. ViaCEP ok.
    {
      const c = usar(1);
      const f = falso(() => json({ cep: "x", logradouro: "Rua A", bairro: "Centro", localidade: "Goiânia", uf: "GO" }));
      const r = await buscarCepAction(ator("a"), `${c.slice(0, 5)}-${c.slice(5)}`, f.fetch);
      check("ViaCEP ok (aceita traço)", r.ok && r.data.street === "Rua A" && r.data.city === "Goiânia" && r.data.state === "GO" && r.data.district === "Centro" && r.data.cep === c, j(r));
      check("só o CEP sai na URL, só o ViaCEP é chamado", f.chamadas.length === 1 && f.chamadas[0].url === `https://viacep.com.br/ws/${c}/json/`, j(f.chamadas));

      // 6. Cache: o segundo pedido não chama o serviço.
      const f2 = falso(() => { throw new Error("não devia chamar"); });
      const r2 = await buscarCepAction(ator("a"), c, f2.fetch);
      check("segundo pedido vem do cache (fetch não chamado)", r2.ok && r2.data.street === "Rua A" && f2.chamadas.length === 0, j(r2));
    }

    // 2. ViaCEP {erro:true} -> 404, sem cair na BrasilAPI; inexistente também fica em cache.
    {
      const c = usar(2);
      const f = falso(() => json({ erro: true }));
      const r = await buscarCepAction(ator("b"), c, f.fetch);
      check("ViaCEP erro:true -> 404 NOT_FOUND", !r.ok && r.status === 404 && r.code === "NOT_FOUND" && r.message === "CEP não encontrado. Confira ou preencha o endereço à mão.", j(r));
      check("inexistente não consulta a BrasilAPI", f.chamadas.length === 1, j(f.chamadas));
      const f2 = falso(() => { throw new Error("não devia chamar"); });
      const r2 = await buscarCepAction(ator("b"), c, f2.fetch);
      check("inexistente também vem do cache", !r2.ok && r2.status === 404 && f2.chamadas.length === 0, j(r2));
      const ttl = await redis.ttl(`tibe:cep:${c}`);
      check("inexistente fica 1 dia no cache", ttl > 0 && ttl <= 86400, String(ttl));
    }

    // 3. ViaCEP lança -> BrasilAPI ok.
    {
      const c = usar(3);
      const f = falso((url) => {
        if (url.includes("viacep")) throw new Error("rede caiu");
        return json({ street: "Rua B", neighborhood: "Setor Sul", city: "Anápolis", state: "GO" });
      });
      const r = await buscarCepAction(ator("c"), c, f.fetch);
      check("ViaCEP fora -> BrasilAPI ok", r.ok && r.data.street === "Rua B" && r.data.district === "Setor Sul" && r.data.city === "Anápolis" && r.data.state === "GO", j(r));
      check("a BrasilAPI foi chamada com só o CEP", f.chamadas[1]?.url === `https://brasilapi.com.br/api/cep/v1/${c}`, j(f.chamadas));
      const ttl = await redis.ttl(`tibe:cep:${c}`);
      check("achado fica 30 dias no cache", ttl > 29 * 86400 && ttl <= 30 * 86400, String(ttl));
    }

    // 3b. ViaCEP demora além de 3 s -> BrasilAPI.
    {
      const c = usar(4);
      const f = falso((url) =>
        url.includes("viacep")
          ? new Promise<Response>(() => {})
          : json({ street: "Rua C", neighborhood: "B", city: "Rio Verde", state: "GO" }),
      );
      const t0 = Date.now();
      const r = await buscarCepAction(ator("d"), c, f.fetch);
      const dt = Date.now() - t0;
      check("ViaCEP que demora cai na BrasilAPI em cerca de 3 s", r.ok && r.data.city === "Rio Verde" && dt >= 2900 && dt < 5000, `${j(r)} ${dt}ms`);
    }

    // 3c. BrasilAPI 404 (ViaCEP fora) -> inexistente.
    {
      const c = usar(5);
      const f = falso((url) => (url.includes("viacep") ? json({}, 500) : json({ message: "nf" }, 404)));
      const r = await buscarCepAction(ator("e"), c, f.fetch);
      check("BrasilAPI 404 -> 404 NOT_FOUND", !r.ok && r.status === 404, j(r));
    }

    // 4. Os dois fora -> 503 e nada vai para o cache.
    {
      const c = usar(6);
      const f = falso(() => { throw new Error("fora"); });
      const r = await buscarCepAction(ator("f"), c, f.fetch);
      check("os dois fora -> 503 SERVICE_UNAVAILABLE", !r.ok && r.status === 503 && r.code === "SERVICE_UNAVAILABLE" && r.message === "Não deu para buscar o CEP agora. Preencha o endereço à mão.", j(r));
      check("falha de serviço não é guardada no cache", (await redis.get(`tibe:cep:${c}`)) === null);
    }

    // 5. CEP inválido -> 422 no campo cep, sem chamar nada.
    {
      const f = falso(() => { throw new Error("não devia chamar"); });
      const r = await buscarCepAction(ator("g"), "7490000", f.fetch);
      check("CEP de 7 dígitos -> 422 no campo cep", !r.ok && r.status === 422 && r.code === "VALIDATION_ERROR" && r.field === "cep" && r.message === "CEP inválido. Use os 8 números.", j(r));
      const r2 = await buscarCepAction(ator("g"), "abc", f.fetch);
      check("CEP sem números -> 422", !r2.ok && r2.status === 422);
      check("CEP inválido não chama o serviço", f.chamadas.length === 0);
    }

    // 7. Campos vazios viram null.
    {
      const c = usar(7);
      const f = falso(() => json({ logradouro: "", bairro: "  ", localidade: "Jussara", uf: "GO" }));
      const r = await buscarCepAction(ator("h"), c, f.fetch);
      check("campos vazios viram null", r.ok && r.data.street === null && r.data.district === null && r.data.city === "Jussara" && r.data.state === "GO", j(r));
    }

    // 8. Limite de 60 por usuário por minuto: o 61º dá 429; outro usuário não é afetado.
    {
      const c = usar(8);
      const f = falso(() => json({ logradouro: "Rua L", bairro: "B", localidade: "C", uf: "GO" }));
      const a = ator("limite");
      let primeiraRecusa = 0;
      for (let i = 1; i <= 61; i++) {
        const r = await buscarCepAction(a, c, f.fetch);
        if (!r.ok && !primeiraRecusa) {
          primeiraRecusa = i;
          check("recusa do limite é 429 RATE_LIMITED", r.status === 429 && r.code === "RATE_LIMITED", j(r));
        }
      }
      check("o 61º pedido é o primeiro a dar 429", primeiraRecusa === 61, String(primeiraRecusa));
      const outro = await buscarCepAction(ator("outro"), c, f.fetch);
      check("outro usuário não é afetado pelo limite", outro.ok, j(outro));
    }
  } finally {
    const todas = [...chaves, ...usuarios];
    if (todas.length) await redis.del(...todas);
    redis.disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M119 verde" : `\n❌ ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
