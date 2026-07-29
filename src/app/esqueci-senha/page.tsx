import Link from "next/link";
import RequestCodeForm from "./request-code-form";

/**
 * Recuperação de senha, etapa 1 (spec 2026-07-29): pedir o código. Fora do
 * fluxo de sessão por natureza (usuário não está logado), mesmo padrão de
 * /trocar-senha e /escolher-plano: página standalone, sem passar por
 * (dashboard) nem (auth).
 */
export default function EsqueciSenhaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-tibe-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-tibe-dark">Esqueci minha senha</h1>
        <p className="mt-2 text-gray-600">
          Informe seu email e escolha por onde quer receber o código de recuperação.
        </p>
        <div className="mt-6">
          <RequestCodeForm />
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/login" className="text-tibe-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
