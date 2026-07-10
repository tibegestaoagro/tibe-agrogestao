import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="border-t border-gray-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-gray-500">
        <span>© {new Date().getFullYear()} Tibé — Pleno Digital</span>
        <div className="flex flex-wrap gap-5">
          <Link href="/planos" className="hover:text-tibe-dark">Planos</Link>
          <Link href="/faq" className="hover:text-tibe-dark">FAQ</Link>
          <Link href="/politicas/privacidade" className="hover:text-tibe-dark">Privacidade</Link>
          <Link href="/politicas/termos" className="hover:text-tibe-dark">Termos</Link>
          <Link href="/docs" className="hover:text-tibe-dark">Documentação</Link>
        </div>
      </div>
    </footer>
  );
}
