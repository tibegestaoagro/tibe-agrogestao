import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import { maskCredentials } from "@/lib/actions/platform-whatsapp-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import { getInstanceStatus } from "@/lib/evolution-client";
import WhatsAppProviderCard from "@/components/platform/whatsapp-provider-card";

/**
 * Config de provider WhatsApp (spec 2026-07-11) — só master_admin.
 * Decripta + mascara no servidor; o client nunca recebe credencial íntegra.
 */
export default async function WhatsAppConfigPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  const configs = await prisma.whatsAppProviderConfig.findMany();
  const byProvider = new Map(configs.map((c) => [c.provider, c]));

  const providers = ["evolution", "meta_cloud_api"] as const;

  const cards = await Promise.all(
    providers.map(async (p) => {
      const config = byProvider.get(p);
      let connectionState: "open" | "connecting" | "close" | "not_found" | null = null;
      if (p === "evolution" && config) {
        const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
        connectionState = (await getInstanceStatus(creds)).state;
      }
      return {
        provider: p,
        configured: !!config,
        active: config?.active ?? false,
        credentialsMasked: config
          ? maskCredentials(decryptConfig<Record<string, string>>(config.credentials_encrypted))
          : null,
        connectionState,
      };
    }),
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
        <p className="mt-1 text-sm text-gray-400">
          Provider usado pelo Tibé para ENVIAR mensagens (o recebimento continua no N8N).
          Trocar de provider aqui não exige alterar o workflow do N8N.
        </p>
      </div>

      {cards.map((c) => (
        <WhatsAppProviderCard key={c.provider} {...c} />
      ))}
    </div>
  );
}
