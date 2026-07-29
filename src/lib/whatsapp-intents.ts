import type { ModuleKey } from "@/lib/permissions";
import type { ProfileType } from "@/lib/tenant-context";

/** Intenções suportadas no MVP (spec 3.4). */
export const INTENTS = [
  "cadastrar_animal",
  "registrar_peso",
  "registrar_vacina",
  "registrar_previsao_vacina",
  "registrar_movimento",
  "cadastrar_servico_ordem",
  "consultar_saldo",
  "consultar_animal",
  "consultar_cliente",
  "gerar_relatorio",
  "registrar_lancamento_financeiro",
  "ajuda",
  "resumo",
  "ambigua",
] as const;

export type Intent = (typeof INTENTS)[number];

export function isIntent(value: unknown): value is Intent {
  return typeof value === "string" && (INTENTS as readonly string[]).includes(value);
}

/** Regra de acesso (módulo/ação/perfil) por intenção: checada antes de executar. */
export const INTENT_ACCESS: Record<
  Intent,
  { module: ModuleKey | null; action: "read" | "write"; profile?: ProfileType }
> = {
  cadastrar_animal: { module: "rebanho", action: "write", profile: "fazenda" },
  registrar_peso: { module: "rebanho", action: "write", profile: "fazenda" },
  registrar_vacina: { module: "rebanho", action: "write", profile: "fazenda" },
  registrar_previsao_vacina: {
    module: "financeiro",
    action: "write",
    profile: "fazenda",
  },
  registrar_movimento: { module: "rebanho", action: "write", profile: "fazenda" },
  cadastrar_servico_ordem: { module: "prestador", action: "write", profile: "prestador" },
  consultar_saldo: { module: "financeiro", action: "read" },
  consultar_animal: { module: "rebanho", action: "read", profile: "fazenda" },
  consultar_cliente: { module: "prestador", action: "read", profile: "prestador" },
  gerar_relatorio: { module: null, action: "read" }, // módulo varia por parameters.tipo
  registrar_lancamento_financeiro: { module: "financeiro", action: "write" },
  ajuda: { module: null, action: "read" },
  resumo: { module: null, action: "read" },
  ambigua: { module: null, action: "read" },
};

/** Valor acima do qual uma ação financeira relevante exige confirmação (spec 3.6). */
export const CONFIRMATION_THRESHOLD = 5000;
