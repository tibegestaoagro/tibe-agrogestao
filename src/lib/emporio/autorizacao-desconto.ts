import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meu Empório: autorização de desconto. O gestor digita o PIN, o servidor confere e devolve este
 * token curto, que a venda leva junto. Vale para uma loja, um solicitante e um teto de percentual.
 */

export type PayloadAutorizacao = {
  establishment_id: string;
  authorizer_user_id: string;
  requester_user_id: string;
  max_pct: number;
  /** A marca do PIN que emitiu (`marcaDoPin`): trocar ou apagar o PIN derruba a autorização. Sem ela, a venda recusa. */
  pin_fp?: string;
  /** ms desde a epoch. */
  exp: number;
};

/** Os 16 primeiros hex do sha256 do hash do PIN: identifica o PIN sem expor o hash. */
export function marcaDoPin(pinHash: string): string {
  return createHash("sha256").update(pinHash).digest("hex").slice(0, 16);
}

const VALIDADE_PADRAO_MS = 15 * 60_000;

/** Chave derivada, para o segredo do NextAuth nunca assinar dois usos diferentes com a mesma chave. */
function chave(): Buffer {
  const segredo = process.env.NEXTAUTH_SECRET;
  if (!segredo) throw new Error("NEXTAUTH_SECRET não configurado: necessário para assinar a autorização de desconto.");
  return createHmac("sha256", segredo).update("emporio-autorizacao-desconto").digest();
}

export function assinarAutorizacao(
  p: Omit<PayloadAutorizacao, "exp">,
  agora: number = Date.now(),
  validadeMs: number = VALIDADE_PADRAO_MS,
): string {
  const completo: PayloadAutorizacao = { ...p, exp: agora + validadeMs };
  const b64 = Buffer.from(JSON.stringify(completo)).toString("base64url");
  const sig = createHmac("sha256", chave()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function conferirAutorizacao(token: string, agora: number = Date.now()): PayloadAutorizacao | null {
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [b64, sig] = partes;
  if (!b64 || !sig) return null;
  const esperado = createHmac("sha256", chave()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as PayloadAutorizacao;
    if (typeof p.exp !== "number" || p.exp < agora) return null;
    return p;
  } catch {
    return null;
  }
}
