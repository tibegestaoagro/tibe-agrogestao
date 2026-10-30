import Link from "next/link";
import { IndiceDoCapitulo } from "../_components/indice-do-capitulo";

export default function EmporioManualLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/manual" className="text-sm text-texto-secundario hover:text-texto print:hidden">
        Manual do Tibé
      </Link>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] print:block">
        <div className="print:hidden">
          <IndiceDoCapitulo />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
