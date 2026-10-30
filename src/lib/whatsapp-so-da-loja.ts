import type { TenantPrismaClient } from "@/lib/prisma";
import { papelDoEmporio } from "@/lib/emporio/papel";

/**
 * Q120 (Módulo 39, F6b): quem é só da loja não usa o agente do WhatsApp. O
 * Empório não está no WhatsApp (Q10) e o resto da conta não é dele. O papel é
 * relido do banco a cada chamada, nunca aceito do caller.
 *
 * Chamada pelos dois caminhos do agente: `executarIntencao` (execute-action e
 * turno) e `executarTurno`, que recusa antes de gastar uma classificação.
 */
export const FRASE_SO_DA_LOJA = "O Empório ainda não está no WhatsApp. Use o Tibé pelo navegador.";

export async function ehSoDaLoja(db: TenantPrismaClient, userId: string): Promise<boolean> {
  return (await papelDoEmporio(db, { id: userId })).soDaLoja;
}
