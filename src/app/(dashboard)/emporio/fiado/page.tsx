import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { lerLojaDoTopo } from "@/lib/emporio/loja-do-topo-servidor";
import { listarFiadoAction, viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { paraCaixasDaLoja } from "../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { FiadoPorCliente } from "../_components/fiado-por-cliente";
import { idDoClientePadrao } from "../_components/cliente-padrao";

export default async function FiadoPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const user = await requireFeaturePage("emporio");

  const db = await getTenantDb();
  // F6b: receber fiado é do Vendedor da loja para cima.
  const papel = await papelDoEmporio(db, user);
  const { lojas: todasAsLojas, loja } = await lerLojaDoTopo(db, user, (await searchParams).loja);
  const [fiadoRes, padraoId] = await Promise.all([
    listarFiadoAction(db, user, { establishment_id: loja || undefined }),
    idDoClientePadrao(db),
  ]);
  const lojas = loja ? todasAsLojas.filter((l) => l.id === loja) : todasAsLojas;
  const clientes = fiadoRes.ok ? fiadoRes.data : [];
  const caixas = paraCaixasDaLoja(await viewsDosCaixas(db, lojas.map((l) => l.id)));

  return (
    <div className="space-y-6">
      <CabecalhoDaTela titulo="Fiado" ajuda="O que cada cliente ainda deve.">
        O recebimento abate das vendas mais antigas primeiro.
      </CabecalhoDaTela>

      <FiadoPorCliente
        clientes={clientes}
        ver={null}
        hoje={hojeEmBrasilia()}
        padraoId={padraoId}
        lojas={lojas}
        caixas={caixas}
        usuarioId={user.id}
        soPix={false}
        podeReceber={pode(papel, "vendedor_da_loja")}
        podeMudarData={pode(papel, "dinheiro")}
      />
    </div>
  );
}
