import "dotenv/config";
import { getInstanceStatus, createInstance, connectInstance, setInstanceWebhook } from "@/lib/evolution-client";

/**
 * Testes do cliente Evolution (spec 2026-07-24): contra credenciais
 * inválidas/inalcançáveis (não bate na Evolution real de produção pra não
 * arriscar desconectar um número em uso).
 * Roda: `npm run test:m9`
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
  console.log("🔒 M9: Evolution client (QR)\n");

  const badCreds = {
    base_url: "http://127.0.0.1:9",
    api_key: "x",
    instance: "inexistente",
    n8n_webhook_url: "https://n8n.example.com/webhook/inexistente",
  };

  const status = await getInstanceStatus(badCreds);
  assert(status.state === "close" || status.state === "not_found", "getInstanceStatus com host inalcançável não lança, devolve state degradado");

  const created = await createInstance(badCreds);
  assert(created.qrcode_base64 === null, "createInstance com host inalcançável não lança, qrcode null");

  const connected = await connectInstance(badCreds);
  assert(connected.qrcode_base64 === null, "connectInstance com host inalcançável não lança, qrcode null");

  const webhook = await setInstanceWebhook(badCreds);
  assert(webhook.ok === false, "setInstanceWebhook com host inalcançável não lança, devolve ok:false");

  console.log(failures === 0 ? "\n✅ M9: 0 falhas." : `\n❌ M9: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
