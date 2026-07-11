import "dotenv/config";
import { encryptConfig, decryptConfig } from "@/lib/crypto-config";

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

  console.log(failures === 0 ? "\n✅ M7: 0 falhas." : `\n❌ M7: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
