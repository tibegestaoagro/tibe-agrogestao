import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta no Tibé e comece a usar agora: teste grátis, sem cartão.",
};

export default function CriarContaPage() {
  return (
    <main className="min-h-screen bg-tibe-light px-4 py-12">
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-3xl font-bold text-tibe-dark">
            Tibé
          </Link>
          <p className="mt-1 text-sm text-gray-500">Criar conta</p>
        </div>
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-gray-500">
          Já tem conta?{" "}
          <Link href="/login" className="text-tibe-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
