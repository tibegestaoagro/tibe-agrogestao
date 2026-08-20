import Link from "next/link";
import { Suspense } from "react";
import UtmCapture from "@/components/public/utm-capture";

export default function PublicNav() {
  return (
    <header className="border-b border-gray-100">
      {/* Captura UTM de qualquer entrada pelo site (Módulo 6): sem UI própria. */}
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold text-tibe-dark">
          Tibé
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/planos" className="text-gray-600 hover:text-tibe-dark">Planos</Link>
          <Link href="/faq" className="text-gray-600 hover:text-tibe-dark">FAQ</Link>
          <Link href="/login" className="font-medium text-primaria-tinta hover:text-tibe-dark">Entrar</Link>
        </nav>
      </div>
    </header>
  );
}
