import { redirect } from "next/navigation";
import NewPasswordForm from "./new-password-form";

/** Recuperação de senha, etapa 3 (spec 2026-07-29): definir a nova senha. */
export default function NovaSenhaPage({
  searchParams,
}: {
  searchParams: { rid?: string };
}) {
  const resetId = searchParams.rid;
  if (!resetId) redirect("/esqueci-senha");

  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Defina sua nova senha</h1>
        <p className="mt-2 text-gray-600">
          Mínimo 8 caracteres, com letra maiúscula, número e símbolo.
        </p>
        <div className="mt-6">
          <NewPasswordForm resetId={resetId} />
        </div>
      </div>
    </main>
  );
}
