import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { resultadoDaLojaAction } from "@/lib/actions/emporio-resultado";
import { lerMes, mesAtualEmBrasilia, textoDoMes } from "@/lib/emporio/mes";
import { EmptyState } from "@/components/ui/empty-state";
import { ResultadoFiltro } from "../_components/resultado-filtro";
import { ResultadoMes } from "../_components/resultado-mes";
import { opcoesDeMes } from "../_components/meses";

/**
 * Resultado da Loja (F4a): vendas, custo, "Vendeu, Pagou", perdas e fixas num
 * mês, o ponto de equilíbrio e o acompanhamento do mês. Só OWNER e ADMIN.
 */
export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; mes?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  if (!hasMinRole(user.role, "ADMIN")) notFound();
  const { loja: lojaDaUrl = "", mes: mesDaUrl = "" } = await searchParams;

  const db = await getTenantDb();
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];

  const atual = mesAtualEmBrasilia();
  const mes = lerMes(mesDaUrl) ?? atual;
  const mesTexto = textoDoMes(mes);
  const meses = opcoesDeMes(atual, 12, 0);
  // Um mês fora da janela (link antigo) continua escolhível, no começo da lista.
  if (!meses.some((m) => m.valor === mesTexto)) meses.unshift(...opcoesDeMes(mes, 0, 0));

  const lojaValida = lojas.some((l) => l.id === lojaDaUrl);
  const loja = lojaValida ? lojaDaUrl : (lojas[0]?.id ?? "");
  const resultado = loja ? await resultadoDaLojaAction(db, user, { establishment_id: loja, month: mesTexto }) : null;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Resultado da loja</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Quanto a loja ganhou no mês, depois de tirar o custo, o que sai de cada venda, as perdas e as despesas fixas.
        </p>
      </header>

      {lojas.length === 0 ? (
        <EmptyState titulo="Nenhuma loja disponível">Cadastre uma loja em Estabelecimentos para ver o resultado.</EmptyState>
      ) : (
        <>
          <ResultadoFiltro lojas={lojas} loja={loja} lojaVeioDaUrl={lojaValida} mes={mesTexto} meses={meses} />
          {resultado && resultado.ok ? (
            <ResultadoMes r={resultado.data} />
          ) : (
            <EmptyState titulo="Não foi possível calcular o resultado">
              {resultado ? resultado.message : "Escolha uma loja."}
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
