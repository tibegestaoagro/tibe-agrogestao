import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { vendedoresDaLoja } from "@/lib/emporio/vendedores";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerOrcamentoAction, type OrcamentoView } from "@/lib/actions/emporio-orcamentos";
import { lerVendaAction, type VendaView } from "@/lib/actions/emporio-vendas";
import { buscarClientesAction } from "@/lib/actions/emporio-clientes";
import { consumidorFinalEscolhido, type ClienteEscolhido } from "@/lib/emporio/cliente-escolhido";
import { EmptyState } from "@/components/ui/empty-state";
import { Balcao } from "../_components/balcao";
import { carregarCatalogoDeVenda } from "../_components/catalogo-venda";

/**
 * O balcão (Q87): abre direto na venda. Quem só consulta (VISUALIZADOR) não
 * vende, então vê o aviso em vez de um formulário que o servidor recusaria.
 *
 * `?orcamento=<id>` (entrega 4) abre a Venda com o orçamento carregado para
 * faturar. Orçamento que a pessoa não pode ver (ou que não existe) é ignorado:
 * o balcão abre vazio, como sem o parâmetro.
 *
 * `?editar_orcamento=<id>` (Q285) e `?orcamento_base=<id>` (Q286) abrem o balcão no modo Orçamento,
 * preenchido com o orçamento, para editá-lo (PATCH) ou fazer outro a partir dele (POST).
 *
 * `?editar=<id>` (Q249) abre o balcão preenchido com a venda, para salvar a substituição.
 * Venda que não existe, já cancelada, ou que a pessoa não pode substituir (só o gestor da
 * loja): o balcão abre normal, com um aviso curto.
 */
export default async function VenderPage({
  searchParams,
}: {
  searchParams: Promise<{
    orcamento?: string | string[];
    editar?: string | string[];
    editar_orcamento?: string | string[];
    orcamento_base?: string | string[];
  }>;
}) {
  const user = await requireFeaturePage("emporio");
  const {
    orcamento: orcamentoParam,
    editar: editarParam,
    editar_orcamento: editarOrcamentoParam,
    orcamento_base: orcamentoBaseParam,
  } = await searchParams;
  const editarId = typeof editarParam === "string" ? editarParam : "";
  const editarOrcamentoId = typeof editarOrcamentoParam === "string" ? editarOrcamentoParam : "";
  const orcamentoBaseId = typeof orcamentoBaseParam === "string" ? orcamentoBaseParam : "";
  const orcamentoId = typeof orcamentoParam === "string" ? orcamentoParam : "";

  const db = await getTenantDb();
  const podeVender = pode(await papelDoEmporio(db, user), "vendedor_da_loja");
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];

  const catalogo =
    podeVender && lojas.length > 0 ? await carregarCatalogoDeVenda(db, lojas.map((l) => l.id)) : null;

  // Quem pode ser o vendedor, por loja: a lista nasce no servidor (a regra é uma só, em `vendedoresDaLoja`).
  const vendedoresPorLoja: Record<string, { id: string; name: string }[]> = {};
  if (podeVender) {
    for (const l of lojas) vendedoresPorLoja[l.id] = await vendedoresDaLoja(db, l.id);
  }
  const ehCaixa = (await papelDoEmporio(db, user)).papel === "caixa";

  const lido = podeVender && orcamentoId ? await lerOrcamentoAction(db, user, orcamentoId) : null;
  const orcamentoCancelado = lido?.ok && lido.data.situacao === "cancelado";
  const orcamentoInicial =
    lido?.ok && !orcamentoCancelado && lojas.some((l) => l.id === lido.data.establishment_id) ? lido.data : null;

  // Editar um orçamento (Q285) ou fazer outro a partir dele (Q286): o balcão abre no modo Orçamento, preenchido.
  let refazer: { orcamento: OrcamentoView; tipo: "editar" | "base" } | null = null;
  let avisoDoOrcamento: string | null = orcamentoCancelado ? "Orçamento cancelado: não pode ser faturado." : null;
  const refazerId = editarOrcamentoId || orcamentoBaseId;
  if (podeVender && refazerId && !editarId && !orcamentoId) {
    const lida = await lerOrcamentoAction(db, user, refazerId);
    const q = lida.ok ? lida.data : null;
    if (!q) avisoDoOrcamento = "Orçamento não encontrado: o balcão abriu em branco.";
    else if (!lojas.some((l) => l.id === q.establishment_id)) {
      avisoDoOrcamento = "A loja deste orçamento não está disponível: o balcão abriu em branco.";
    } else if (editarOrcamentoId && q.situacao !== "aberto" && q.situacao !== "vencido") {
      avisoDoOrcamento =
        q.situacao === "faturado"
          ? "Orçamento faturado não se edita: use Novo orçamento a partir deste. O balcão abriu em branco."
          : "Orçamento cancelado não se edita. O balcão abriu em branco.";
    } else {
      refazer = { orcamento: q, tipo: editarOrcamentoId ? "editar" : "base" };
    }
  }

  let edicao: { venda: VendaView; cliente: ClienteEscolhido | null } | null = null;
  let avisoDaEdicao: string | null = null;
  if (podeVender && editarId) {
    const lida = await lerVendaAction(db, user, editarId);
    const venda = lida.ok ? lida.data : null;
    if (!venda) avisoDaEdicao = "Venda não encontrada: o balcão abriu em branco.";
    else if (venda.status !== "concluida") avisoDaEdicao = "Só se edita venda concluída: o balcão abriu em branco.";
    else if (!pode(await papelDoEmporio(db, user), "gestor_da_loja", venda.establishment_id)) {
      avisoDaEdicao = "Editar uma venda é do gestor da loja: o balcão abriu em branco.";
    } else if (!lojas.some((l) => l.id === venda.establishment_id)) {
      avisoDaEdicao = "A loja desta venda não está disponível: o balcão abriu em branco.";
    } else {
      // O cadastro completo do cliente (a entrega confere endereço sobre ele); sem cadastro achado, só o nome.
      const busca = venda.customer_id ? await buscarClientesAction(db, user, { id: venda.customer_id }) : null;
      const achado = busca?.ok ? (busca.data.itens[0] ?? null) : null;
      const cliente =
        achado ??
        (venda.customer_id
          ? consumidorFinalEscolhido({ id: venda.customer_id, name: venda.customer_name ?? "Cliente" })
          : null);
      edicao = { venda, cliente };
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Vender</h1>
      </header>

      {avisoDaEdicao && (
        <p role="status" className="rounded-lg bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          {avisoDaEdicao}
        </p>
      )}

      {avisoDoOrcamento && (
        <p role="status" className="rounded-lg bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          {avisoDoOrcamento}
        </p>
      )}

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
          // Outro orçamento na URL é outro atendimento: o balcão nasce de novo com ele.
          key={
            edicao?.venda.id ??
            (refazer ? `${refazer.tipo}-${refazer.orcamento.id}` : (orcamentoInicial?.id ?? "balcao"))
          }
          refazer={refazer}
          lojas={lojas}
          produtos={catalogo.produtos}
          precos={catalogo.precos}
          consumidorFinal={catalogo.consumidorFinal}
          usuarioId={user.id}
          vendedoresPorLoja={vendedoresPorLoja}
          ehCaixa={ehCaixa}
          orcamentoInicial={orcamentoInicial}
          edicao={edicao}
        />
      )}
    </div>
  );
}
