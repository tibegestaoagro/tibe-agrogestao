import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { EmptyState } from "@/components/ui/empty-state";
import { Balcao } from "../_components/balcao";
import { carregarCatalogoDeVenda } from "../_components/catalogo-venda";

/**
 * O balcão (Q87): abre direto na venda. Quem só consulta (VISUALIZADOR) não
 * vende, então vê o aviso em vez de um formulário que o servidor recusaria.
 */
export default async function VenderPage() {
  const user = await requireFeaturePage("emporio");
  const podeVender = hasMinRole(user.role, "OPERADOR");

  const db = await getTenantDb();
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];

  const catalogo =
    podeVender && lojas.length > 0 ? await carregarCatalogoDeVenda(db, lojas.map((l) => l.id)) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Vender</h1>
      </header>

      {!podeVender ? (
        <EmptyState titulo="Seu perfil só consulta o Empório">
          Peça ao dono ou a um administrador para liberar a venda.
        </EmptyState>
      ) : lojas.length === 0 || !catalogo ? (
        <EmptyState
          titulo="Nenhuma loja disponível"
          acao={
            <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Estabelecimentos
            </Link>
          }
        >
          Cadastre uma loja (ou peça para ser vinculado a uma) para começar a vender.
        </EmptyState>
      ) : catalogo.produtos.every((p) => p.apresentacoes.length === 0) ? (
        <EmptyState
          titulo="Nenhum produto à venda"
          acao={
            <Link href="/emporio/produtos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Produtos
            </Link>
          }
        >
          Cadastre um produto com ao menos uma apresentação para poder vendê-lo.
        </EmptyState>
      ) : (
        <Balcao
          lojas={lojas}
          produtos={catalogo.produtos}
          precos={catalogo.precos}
          contatos={catalogo.contatos}
        />
      )}
    </div>
  );
}
