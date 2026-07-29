import { redirect } from "next/navigation";
import VerifyCodeForm from "./verify-code-form";

/** Recuperação de senha, etapa 2 (spec 2026-07-29): validar o código de 6 dígitos. */
export default function VerificarCodigoPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = searchParams.email;
  if (!email) redirect("/esqueci-senha");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Digite o código</h1>
        <p className="mt-2 text-gray-600">
          Enviamos um código de 6 dígitos. Ele expira em 10 minutos.
        </p>
        <div className="mt-6">
          <VerifyCodeForm email={email} />
        </div>
      </div>
    </main>
  );
}
