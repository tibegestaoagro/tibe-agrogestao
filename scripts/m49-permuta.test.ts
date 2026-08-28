import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import type { TenantPrismaClient } from "@/lib/prisma";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Módulo 31, missão 4: permuta.
 *
 * A frase do cliente que esta suíte protege é o §12.6: "a permuta deverá ser
 * registrada como uma única negociação. O produtor não deverá precisar criar
 * manualmente uma venda e depois uma compra."
 *
 * Roda: `npm run test:m49`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean; userId?: string } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
    user_id: opts.userId,
  };
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M49 ${stamp}`, document: `M49${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m49-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) =>
    posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M49" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto A", area_hectares: 10 }),
    });

    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "macho_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "femea_13_24",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("1. A forma dos movimentos novos, antes de qualquer permuta");
    {
      // A ARMADILHA DA MISSÃO 3, que custou uma rodada: um tipo de movimento
      // novo que não entra nas listas de forma cai no ramo de `ajuste`, que
      // exige exatamente UMA das pontas. A action devolveria `ok` e o
      // movimento ficaria gravado com a forma errada.
      const posicaoBoi = {
        category_id: "macho_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente" as const,
        owner: "proprio" as const,
      };
      const posicaoFemea = {
        category_id: "femea_13_24",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente" as const,
        owner: "proprio" as const,
      };

      // ⚠️ AS DUAS CONFERÊNCIAS QUE DISCRIMINAM, e não as óbvias.
      //
      // Um tipo fora das listas de forma cai no ramo de `ajuste`, que recusa
      // as DUAS pontas juntas. Por isso "recusa quando vem com as duas" passa
      // igual antes e depois da correção: é uma asserção que não distingue
      // nada, o mesmo erro de teste que este projeto já pagou.
      //
      // A diferença real está na ponta que FALTA. Sob `ajuste`, uma
      // `permuta_entrada` com só a ORIGEM é aceita, e aí ela TIRA cabeças do
      // rebanho em vez de acrescentar: uma entrada que subtrai, gravada em
      // silêncio.
      const entradaSemDestino = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 1,
        from: posicaoBoi,
      });
      check(
        "permuta_entrada exige o DESTINO: sem ele, seria uma entrada que subtrai",
        !entradaSemDestino.ok,
        entradaSemDestino.ok ? "aceitou entrada sem destino" : entradaSemDestino.code,
      );

      const saidaSemOrigem = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 1,
        to: posicaoFemea,
      });
      check(
        "permuta_saida exige a ORIGEM: sem ela, seria uma saída que soma",
        !saidaSemOrigem.ok,
        saidaSemOrigem.ok ? "aceitou saída sem origem" : saidaSemOrigem.code,
      );

      const entradaComOrigem = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 1,
        from: posicaoBoi,
        to: posicaoFemea,
      });
      check(
        "e nenhuma das duas aceita as duas pontas",
        !entradaComOrigem.ok,
        entradaComOrigem.ok ? "aceitou as duas pontas" : entradaComOrigem.code,
      );

      const saidaOk = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 2,
        from: posicaoBoi,
      });
      check("saída com só a origem passa", saidaOk.ok, saidaOk.ok ? "" : saidaOk.message);
      check(
        "e tira as 2 cabeças do rebanho",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === 298,
        String(soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" }))),
      );

      const entradaOk = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 5,
        to: posicaoFemea,
      });
      check("entrada com só o destino passa", entradaOk.ok, entradaOk.ok ? "" : entradaOk.message);
      check(
        "e ACRESCENTA 5 cabeças, em vez de tirar",
        soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" })) === 305,
        String(soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" }))),
      );
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0 ? `\n✅ M49: permuta, 0 falhas.` : `\n❌ M49: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M49 quebrou:", erro);
    process.exit(1);
  });
