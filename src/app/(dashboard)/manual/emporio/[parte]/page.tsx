import { notFound } from "next/navigation";
import { AnteriorEProximo } from "../../_components/anterior-e-proximo";
import { CONTEUDOS } from "../../_conteudo/conteudos";
import { PARTES_DO_EMPORIO } from "../../_conteudo/indice";

export function generateStaticParams() {
  return PARTES_DO_EMPORIO.map((p) => ({ parte: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ parte: string }> }) {
  const { parte } = await params;
  const p = PARTES_DO_EMPORIO.find((x) => x.slug === parte);
  return { title: p ? `${p.titulo} | Manual` : "Manual" };
}

export default async function ParteDoManualPage({ params }: { params: Promise<{ parte: string }> }) {
  const { parte } = await params;
  const meta = PARTES_DO_EMPORIO.find((p) => p.slug === parte);
  const Conteudo = CONTEUDOS[parte];
  if (!meta || !Conteudo) notFound();

  return (
    <article className="space-y-4">
      <header>
        <p className="text-sm text-texto-discreto">{meta.grupo}</p>
        <h1 className="text-2xl font-semibold text-texto">{meta.titulo}</h1>
      </header>
      <div className="space-y-4 leading-relaxed text-texto">
        <Conteudo />
      </div>
      <AnteriorEProximo slug={parte} />
    </article>
  );
}
