import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { toBrazilPhoneDigits } from "@/lib/phone";

/**
 * Converte os telefones JÁ GRAVADOS para a forma canônica (55 + DDD + 9 + oito
 * dígitos), depois que `toBrazilPhoneDigits` passou a completar o nono dígito
 * (18/09/2026). Sem isto, um celular antigo salvo com 12 dígitos continuaria
 * sem casar, porque o reconhecimento agora compara na forma canônica.
 *
 * Roda uma vez, e fica no repositório como registro do que foi feito.
 *
 *   npx tsx scripts/converter-telefones.ts            # SÓ LISTA, não grava nada
 *   npx tsx scripts/converter-telefones.ts --gravar   # grava, e confere lendo de volta
 *
 * Só mexe nos dois campos que decidem QUEM está falando com o agente:
 * `User.phone` e `WhatsAppContact.phone`.
 *
 * ⚠️ Para com erro se a conversão fizer dois registros virarem o mesmo número.
 * Em `User`, a busca por telefone é cross-tenant e usa o primeiro que achar:
 * duas pessoas com o mesmo número canônico fariam o agente escrever numa delas
 * por sorteio. Em `WhatsAppContact`, a chave única é (tenant, telefone), e a
 * conversão estouraria no meio. Nos dois casos, a decisão é de uma pessoa, não
 * do script.
 */

const GRAVAR = process.argv.includes("--gravar");

type Mudanca = { id: string; antes: string; depois: string; onde: string };

async function main() {
  console.log(GRAVAR ? "MODO GRAVAÇÃO\n" : "MODO LEITURA (nada será gravado)\n");

  const usuarios = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, name: true, active: true, tenant: { select: { name: true } } },
  });
  const contatos = await prisma.whatsAppContact.findMany({
    select: { id: true, phone: true, tenant_id: true, tenant: { select: { name: true } } },
  });

  const mudUsuarios: Mudanca[] = [];
  for (const u of usuarios) {
    const depois = toBrazilPhoneDigits(u.phone!);
    if (depois !== u.phone) {
      mudUsuarios.push({ id: u.id, antes: u.phone!, depois, onde: `${u.name} (${u.tenant.name})${u.active ? "" : " [inativo]"}` });
    }
  }
  const mudContatos: Mudanca[] = [];
  for (const c of contatos) {
    const depois = toBrazilPhoneDigits(c.phone);
    if (depois !== c.phone) {
      mudContatos.push({ id: c.id, antes: c.phone, depois, onde: c.tenant.name });
    }
  }

  // Colisão em User: o número canônico final repetido entre DUAS pessoas.
  const finalUsuario = new Map<string, string[]>();
  for (const u of usuarios) {
    const canonico = toBrazilPhoneDigits(u.phone!);
    finalUsuario.set(canonico, [...(finalUsuario.get(canonico) ?? []), `${u.name} (${u.tenant.name})`]);
  }
  const colisoesUsuario = [...finalUsuario.entries()].filter(([, quem]) => quem.length > 1);

  // Colisão em WhatsAppContact: o mesmo número canônico DUAS vezes no mesmo tenant.
  const finalContato = new Map<string, number>();
  for (const c of contatos) {
    const chave = `${c.tenant_id}|${toBrazilPhoneDigits(c.phone)}`;
    finalContato.set(chave, (finalContato.get(chave) ?? 0) + 1);
  }
  const colisoesContato = [...finalContato.entries()].filter(([, n]) => n > 1);

  console.log(`Usuários com telefone: ${usuarios.length} | mudam: ${mudUsuarios.length}`);
  for (const m of mudUsuarios) console.log(`  ${m.antes} -> ${m.depois}  ${m.onde}`);
  console.log(`\nContatos de WhatsApp: ${contatos.length} | mudam: ${mudContatos.length}`);
  for (const m of mudContatos) console.log(`  ${m.antes} -> ${m.depois}  tenant: ${m.onde}`);

  if (colisoesUsuario.length > 0 || colisoesContato.length > 0) {
    console.log("\n⚠️ COLISÕES: a conversão faria registros diferentes virarem o mesmo número.");
    for (const [numero, quem] of colisoesUsuario) console.log(`  usuário ${numero}: ${quem.join(" | ")}`);
    for (const [chave, n] of colisoesContato) console.log(`  contato ${chave}: ${n} registros`);
    console.log("\nNada gravado. Resolva as colisões e rode de novo.");
    process.exit(1);
  }
  console.log("\nSem colisões.");

  if (!GRAVAR) {
    console.log("Modo leitura: nada gravado. Rode com --gravar para aplicar.");
    process.exit(0);
  }

  await prisma.$transaction([
    ...mudUsuarios.map((m) => prisma.user.update({ where: { id: m.id }, data: { phone: m.depois } })),
    ...mudContatos.map((m) => prisma.whatsAppContact.update({ where: { id: m.id }, data: { phone: m.depois } })),
  ]);

  // Confere lendo de volta, em vez de confiar no que o update devolveu.
  const sobrou = [
    ...(await prisma.user.findMany({ where: { phone: { not: null } }, select: { phone: true } }))
      .filter((u) => toBrazilPhoneDigits(u.phone!) !== u.phone),
    ...(await prisma.whatsAppContact.findMany({ select: { phone: true } }))
      .filter((c) => toBrazilPhoneDigits(c.phone) !== c.phone),
  ];
  console.log(`\nGravado. Registros ainda fora da forma canônica: ${sobrou.length}`);
  process.exit(sobrou.length === 0 ? 0 : 1);
}

main();
