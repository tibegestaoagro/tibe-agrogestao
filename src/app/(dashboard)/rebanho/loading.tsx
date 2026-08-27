import { Carregando } from "@/components/ui/carregando";

/**
 * O que aparece enquanto a página de Rebanho busca posições e histórico.
 *
 * A página é Server Component e faz três consultas antes de renderizar. Sem
 * este arquivo, o Next segura a navegação inteira até elas voltarem: no 3G do
 * interior, o produtor toca em "Rebanho" e fica olhando a tela anterior, sem
 * sinal de que algo está acontecendo, e toca de novo.
 *
 * As alturas imitam o que vem: uma faixa de cartões de resumo, depois a lista
 * de movimentações.
 */
export default function CarregandoRebanho() {
  return (
    <div className="space-y-6 p-4">
      <Carregando linhas={2} />
      <Carregando linhas={6} />
    </div>
  );
}
