"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store, ChevronDown, Check } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { useDropdown } from "@/components/ui/use-dropdown";
import { useAviso } from "@/components/ui/toast";
import { escolherLojaDoTopo } from "@/lib/emporio/loja-do-topo";

export type LojaOpcao = { id: string; name: string };

const PARAMS_DA_LOJA = ["loja", "establishment_id", "pagina"];

/**
 * O "Loja: Todas" do topo do Empório. A escolha vai para um cookie (rota
 * `/api/v1/emporio/loja-do-topo`) e as telas que filtram por loja a leem no
 * servidor. A loja da URL vence a do cookie: o Histórico usa `establishment_id`
 * no lugar de `loja`.
 */
function Seletor({ lojas, lojaDoCookie }: { lojas: LojaOpcao[]; lojaDoCookie: string }) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const aviso = useAviso();

  const nomeDoParam = pathname.replace(/\/+$/, "") === "/emporio/historico" ? "establishment_id" : "loja";
  const loja = escolherLojaDoTopo({
    daUrl: params.get(nomeDoParam) ?? undefined,
    doCookie: lojaDoCookie,
    lojas,
  });
  const nome = lojas.find((l) => l.id === loja)?.name;
  const rotulo = nome ? `Loja: ${nome}` : "Loja: Todas";
  const ordenadas = [...lojas].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  /** A recusa avisa: sem isso o botão mostraria a loja nova com os números da antiga. */
  async function escolher(id: string | null) {
    setOpen(false);
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/loja-do-topo", { establishment_id: id });
    setLoading(false);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    if (PARAMS_DA_LOJA.some((p) => params.has(p))) {
      const resto = new URLSearchParams(params.toString());
      for (const p of PARAMS_DA_LOJA) resto.delete(p);
      const qs = resto.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    router.refresh();
  }

  const itemClasse =
    "flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-texto-secundario hover:bg-superficie-afundada sm:min-h-9";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto-secundario transition hover:border-primaria focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria disabled:opacity-60 sm:min-h-0"
      >
        <Store className="h-4 w-4 text-primaria-tinta" />
        <span className="max-w-[10rem] truncate font-medium">{rotulo}</span>
        <ChevronDown className="h-4 w-4 text-texto-discreto" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-borda bg-superficie py-1 shadow-lg">
          <button type="button" onClick={() => escolher(null)} className={itemClasse}>
            Todas as lojas
            {!loja && <Check className="h-4 w-4 text-primaria-tinta" />}
          </button>
          <div className="my-1 border-t border-borda" />
          {ordenadas.map((l) => (
            <button key={l.id} type="button" onClick={() => escolher(l.id)} className={itemClasse}>
              <span className="truncate">{l.name}</span>
              {loja === l.id && <Check className="h-4 w-4 shrink-0 text-primaria-tinta" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LojaDoTopoSeletor(props: { lojas: LojaOpcao[]; lojaDoCookie: string }) {
  // useSearchParams exige Suspense no Next.
  return (
    <Suspense fallback={null}>
      <Seletor {...props} />
    </Suspense>
  );
}
