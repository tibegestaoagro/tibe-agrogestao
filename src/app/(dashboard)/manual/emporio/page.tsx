import Link from "next/link";
import { Printer } from "lucide-react";
import { BuscaDePartes } from "../_components/busca-de-partes";
import { GUIA_DO_VENDEDOR } from "../_conteudo/indice";

export const metadata = { title: "Manual: Meu Empório" };

export default function ManualEmporioPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-texto">Meu Empório</h1>
        <p className="mt-1 text-texto-secundario">
          Como cuidar das suas lojas no Tibé: produtos, estoque, balcão, caixa e resultado. Comece pela sua função, ou
          ache a tarefa que você quer fazer.
        </p>
      </header>
      <BuscaDePartes />
      <Link
        href={GUIA_DO_VENDEDOR.href}
        className="flex items-center gap-3 rounded-lg border border-borda bg-superficie p-4 hover:border-borda-forte"
      >
        <Printer className="h-5 w-5 shrink-0 text-texto-discreto" aria-hidden="true" />
        <span>
          <span className="block font-medium text-texto">{GUIA_DO_VENDEDOR.titulo}</span>
          <span className="block text-sm text-texto-secundario">{GUIA_DO_VENDEDOR.resumo}</span>
        </span>
      </Link>
    </div>
  );
}
