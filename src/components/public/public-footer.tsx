import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="border-t border-borda">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-texto-discreto">
        <span>© {new Date().getFullYear()} Tibé: Pleno Digital</span>
        <div className="flex flex-wrap gap-5">
          <Link href="/planos" className="hover:text-texto-marca">Planos</Link>
          <Link href="/faq" className="hover:text-texto-marca">FAQ</Link>
          <Link href="/politicas/privacidade" className="hover:text-texto-marca">Privacidade</Link>
          <Link href="/politicas/termos" className="hover:text-texto-marca">Termos</Link>
          <Link href="/docs" className="hover:text-texto-marca">Documentação</Link>
        </div>
      </div>
    </footer>
  );
}
