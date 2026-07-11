import "dotenv/config";
import { encryptConfig, decryptConfig } from "@/lib/crypto-config";
import { prisma } from "@/lib/prisma";
import {
  upsertProviderConfigAction,
  activateProviderAction,
  maskCredentials,
} from "@/lib/actions/platform-whatsapp-config";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { POST as sendMessageRoute } from "@/app/api/internal/whatsapp/send-message/route";

/**
 * Testes do provider WhatsApp configurável (spec 2026-07-11): criptografia,
 * upsert/ativação de config, despacho de envio.
 * Roda: `npm run test:m7` (DATABASE_URL do Docker local).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🔒 M7 — Provider WhatsApp configurável\n");

  // ── crypto-config ────────────────────────────────────────────
  const original = { base_url: "https://evo.example.com", api_key: "chave-secreta-123", instance: "tibe" };
  const encrypted = encryptConfig(original);
  assert(typeof encrypted === "string" && encrypted.split(".").length === 3, "encryptConfig devolve formato iv.ciphertext.authTag");
  assert(!encrypted.includes("chave-secreta-123"), "ciphertext não contém o valor em claro");

  const roundtrip = decryptConfig<typeof original>(encrypted);
  assert(roundtrip.api_key === original.api_key && roundtrip.instance === original.instance, "roundtrip encrypt→decrypt preserva o objeto");

  let tamperFailed = false;
  try {
    const [iv, ct, tag] = encrypted.split(".");
    decryptConfig(`${iv}.${ct.slice(0, -2)}xx.${tag}`);
  } catch {
    tamperFailed = true;
  }
  assert(tamperFailed, "payload adulterado é rejeitado (GCM auth tag)");

  // ── actions de config ────────────────────────────────────────
  await prisma.whatsAppProviderConfig.deleteMany({});

  const up1 = await upsertProviderConfigAction({
    provider: "evolution",
    credentials: { base_url: "https://evo.example.com", api_key: "evo-key-9876", instance: "tibe" },
  });
  assert(up1.ok, "upsert de config Evolution funciona");

  const row = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  assert(!!row && !row.credentials_encrypted.includes("evo-key-9876"), "credencial no banco não está em claro");
  assert(!!row && row.active === false, "config recém-criada nasce inativa");

  const actMissing = await activateProviderAction("meta_cloud_api");
  assert(!actMissing.ok && actMissing.status === 404, "ativar provider sem config é rejeitado (404)");

  const act1 = await activateProviderAction("evolution");
  assert(act1.ok, "ativar Evolution funciona");

  await upsertProviderConfigAction({
    provider: "meta_cloud_api",
    credentials: { access_token: "meta-token-4321", phone_number_id: "5511999" },
  });
  await activateProviderAction("meta_cloud_api");

  const all = await prisma.whatsAppProviderConfig.findMany({ orderBy: { provider: "asc" } });
  const evo = all.find((c) => c.provider === "evolution");
  const meta = all.find((c) => c.provider === "meta_cloud_api");
  assert(!!evo && evo.active === false, "ativar Meta desativa Evolution (invariante de 1 ativo)");
  assert(!!meta && meta.active === true, "Meta fica ativa");

  const masked = maskCredentials({ api_key: "evo-key-9876", pin: "12" });
  assert(masked.api_key === "•••• 9876", "maskCredentials preserva só os últimos 4");
  assert(masked.pin === "••••", "valor curto é totalmente mascarado");

  // ── whatsapp-send ────────────────────────────────────────────
  await prisma.whatsAppProviderConfig.deleteMany({});

  const noProvider = await sendWhatsAppMessage("+5511999990000", "olá");
  assert(!noProvider.ok && noProvider.code === "NO_PROVIDER_ACTIVE", "envio sem provider ativo devolve NO_PROVIDER_ACTIVE");

  // Evolution apontando para porta fechada: precisa devolver PROVIDER_ERROR
  // sem lançar exceção (o fetch falha na conexão).
  await upsertProviderConfigAction({
    provider: "evolution",
    credentials: { base_url: "http://127.0.0.1:9", api_key: "x", instance: "t" },
  });
  await activateProviderAction("evolution");
  const unreachable = await sendWhatsAppMessage("+5511999990000", "olá");
  assert(!unreachable.ok && unreachable.code === "PROVIDER_ERROR", "provider inalcançável vira PROVIDER_ERROR, sem exceção");

  // ── rota interna send-message ────────────────────────────────
  process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-secret";

  const noAuth = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+5511999990000", text: "oi" }),
    }),
  );
  assert(noAuth.status === 401, "send-message sem x-internal-secret devolve 401");

  const badBody = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({ to: "+5511999990000" }),
    }),
  );
  assert(badBody.status === 422, "send-message sem text devolve 422");

  const provErr = await sendMessageRoute(
    new Request("http://test/api/internal/whatsapp/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({ to: "+5511999990000", text: "oi" }),
    }),
  );
  assert(provErr.status === 502, "falha do provider vira 502 PROVIDER_ERROR na rota");

  await prisma.whatsAppProviderConfig.deleteMany({});

  console.log(failures === 0 ? "\n✅ M7: 0 falhas." : `\n❌ M7: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
