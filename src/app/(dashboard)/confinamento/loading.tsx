import { Carregando } from "@/components/ui/carregando";

/**
 * O que aparece enquanto a página de Confinamento busca sites, lotes,
 * resumos e o feed de movimentações. Mesmo motivo do `loading.tsx` de
 * Rebanho: sem isto, o Next segura a navegação inteira até tudo voltar.
 */
export default function CarregandoConfinamento() {
  return (
    <div className="space-y-6 p-4">
      <Carregando linhas={2} />
      <Carregando linhas={4} />
      <Carregando linhas={4} />
    </div>
  );
}
