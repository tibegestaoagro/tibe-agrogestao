import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSignupStateAction } from "@/lib/actions/signup-flow";
import { readSignupId } from "@/lib/signup-cookie";
import VerifyCodeForm from "@/components/signup/verify-code-form";

export const metadata: Metadata = {
  title: "Confirmar email",
  description: "Confirme seu email para concluir a criação da conta no Tibé.",
};

/** Etapa 3 do cadastro verificado (Módulo 19). */
export default async function ConfirmarEmailPage() {
  const signupId = readSignupId();
  if (!signupId) redirect("/criar-conta");

  const state = await getSignupStateAction(signupId);
  if (!state.ok) redirect("/criar-conta");
  // Ordem é obrigatória: o WhatsApp vem antes, e o servidor recusa o contrário.
  if (!state.data.whatsapp_verified) redirect("/criar-conta/whatsapp");

  return (
    <main className="min-h-screen bg-tibe-light px-4 py-12">
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-3xl font-bold text-tibe-dark">
            Tibé
          </Link>
          <p className="mt-1 text-sm text-gray-500">Etapa 3 de 3: confirmar email</p>
        </div>

        <div className="mb-4 rounded-md bg-tibe-light px-3 py-2 text-sm text-tibe-dark">
          WhatsApp confirmado. Falta só o email para criarmos sua conta.
        </div>

        <VerifyCodeForm
          channel="email"
          destinationMasked={state.data.email_masked}
          allowEditAfterSeconds={state.data.allow_edit_after_seconds}
        />

        <p className="mt-6 text-center text-sm text-gray-500">
          Errou o email?{" "}
          <span className="text-gray-500">
            Use a opção de corrigir acima: seu WhatsApp continua confirmado.
          </span>
        </p>
      </div>
    </main>
  );
}
