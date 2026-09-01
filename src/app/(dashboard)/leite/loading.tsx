import { Carregando } from "@/components/ui/carregando";

/**
 * O que aparece enquanto a página do Leite busca o resumo, o histórico e os
 * lotes. Mesmo motivo do `loading.tsx` de Rebanho e Confinamento: sem isto, o
 * Next segura a navegação inteira até tudo voltar.
 */
export default function CarregandoLeite() {
  return (
    <div className="space-y-6 p-4">
      <Carregando linhas={2} />
      <Carregando linhas={3} />
      <Carregando linhas={4} />
    </div>
  );
}
