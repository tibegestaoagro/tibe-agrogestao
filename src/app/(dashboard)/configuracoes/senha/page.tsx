import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import ChangeOwnPasswordForm from "./change-own-password-form";
import { EmporioPinForm } from "./emporio-pin-form";

/**
 * Configurações → Minha senha (Módulo 19). Sem gate de papel de propósito:
 * trocar a própria senha não é privilégio de Owner/Admin, todo usuário precisa
 * conseguir chegar aqui.
 */
export default async function TrocarMinhaSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // O PIN é de quem autoriza desconto em loja: Dono, Gerente geral e Gestor.
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  const podeTerPin = pode(papel, "gestor_da_loja");
  const dono = podeTerPin
    ? await db.user.findFirst({ where: { id: user.id }, select: { emporio_auth_pin_hash: true } })
    : null;
  const temPin = dono?.emporio_auth_pin_hash != null;

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-texto">Minha senha</h1>
        <p className="text-sm text-texto-discreto">
          Você está alterando a senha de <strong>{user.email}</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-borda bg-superficie p-5">
        <ChangeOwnPasswordForm />
      </div>

      {podeTerPin && (
        <div className="space-y-3 rounded-lg border border-borda bg-superficie p-5">
          <div>
            <h2 className="text-base font-semibold text-texto">PIN de autorização do Empório</h2>
            <p className="text-sm text-texto-discreto">
              O PIN libera desconto acima do limite da loja no balcão. Não é a sua senha de entrada.
            </p>
            <p className="mt-1 text-sm text-texto-secundario">
              {temPin ? "Você já tem um PIN cadastrado." : "Você ainda não cadastrou um PIN."}
            </p>
          </div>
          <EmporioPinForm temPin={temPin} />
        </div>
      )}
    </div>
  );
}
