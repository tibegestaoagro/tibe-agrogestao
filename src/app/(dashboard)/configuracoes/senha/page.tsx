import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/tenant-context";
import ChangeOwnPasswordForm from "./change-own-password-form";

/**
 * Configurações → Minha senha (Módulo 19). Sem gate de papel de propósito:
 * trocar a própria senha não é privilégio de Owner/Admin, todo usuário precisa
 * conseguir chegar aqui.
 */
export default async function TrocarMinhaSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Minha senha</h1>
        <p className="text-sm text-gray-500">
          Você está alterando a senha de <strong>{user.email}</strong>.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <ChangeOwnPasswordForm />
      </div>
    </div>
  );
}
