import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSignupStateAction } from "@/lib/actions/signup-flow";
import { readSignupId } from "@/lib/signup-cookie";
import VerifyCodeForm from "@/components/signup/verify-code-form";

export const metadata: Metadata = {
  title: "Confirmar WhatsApp",
  description: "Confirme seu WhatsApp para continuar a criação da conta no Tibé.",
};

/** Etapa 2 do cadastro verificado (Módulo 19). */
export default async function ConfirmarWhatsappPage() {
  const signupId = await readSignupId();
  if (!signupId) redirect("/criar-conta");

  const state = await getSignupStateAction(signupId);
  if (!state.ok) redirect("/criar-conta");
  if (state.data.whatsapp_verified) redirect("/criar-conta/email");

  return (
    <main className="min-h-screen bg-tibe-light px-4 py-12">
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-3xl font-bold text-tibe-dark">
            Tibé
          </Link>
          <p className="mt-1 text-sm text-gray-500">Etapa 2 de 3: confirmar WhatsApp</p>
        </div>

        <VerifyCodeForm
          channel="whatsapp"
          destinationMasked={state.data.phone_masked}
          allowEditAfterSeconds={state.data.allow_edit_after_seconds}
        />

        <p className="mt-6 text-center text-sm text-gray-500">
          Preencheu algo errado?{" "}
          <Link href="/criar-conta" className="text-primaria-tinta hover:underline">
            Voltar ao formulário
          </Link>
        </p>
      </div>
    </main>
  );
}
