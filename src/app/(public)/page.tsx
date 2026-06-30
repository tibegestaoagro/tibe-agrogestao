import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-tibe-light">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl font-bold text-tibe-dark">Tibé</h1>
        <p className="mt-4 text-lg text-tibe-primary">
          Gestão agropecuária: rebanho, lavoura, prestação de serviço e
          financeiro — com agente de IA no WhatsApp.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/login"
            className="rounded-md bg-tibe-primary px-6 py-3 font-medium text-white transition hover:bg-tibe-dark"
          >
            Entrar
          </Link>
          <Link
            href="/planos"
            className="rounded-md border border-tibe-primary px-6 py-3 font-medium text-tibe-primary transition hover:bg-white"
          >
            Ver planos
          </Link>
        </div>
      </div>
    </main>
  );
}
