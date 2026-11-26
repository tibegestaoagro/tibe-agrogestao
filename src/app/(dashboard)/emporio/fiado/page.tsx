import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/datas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarFiadoAction, viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { paraCaixasDaLoja } from "../_components/caixas-da-loja";
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { FiadoPorCliente } from "../_components/fiado-por-cliente";
import { idDoClientePadrao } from "../_components/cliente-padrao";

export default async function FiadoPage() {
  const user = await requireFeaturePage("emporio");

  const db = await getTenantDb();
  // F6b: receber fiado é do Vendedor da loja para cima.
  const papel = await papelDoEmporio(db, user);
  const [lojasRes, fiadoRes, padraoId] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarFiadoAction(db, user),
    idDoClientePadrao(db),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
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
