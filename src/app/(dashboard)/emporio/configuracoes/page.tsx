import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { listarEstabelecimentosAction, type EstablishmentView } from "@/lib/actions/emporio-catalogo";
import { EmptyState } from "@/components/ui/empty-state";
import { listarCaixasAction } from "@/lib/actions/emporio-turno";
import { EstabelecimentoForm } from "../_components/estabelecimento-form";
import { NovoCaixaBotao } from "../_components/novo-caixa-botao";
import { ConfiguracoesForm } from "./_components/configuracoes-form";
import { LogoForm } from "./_components/logo-form";

function enderecoDaLoja(l: EstablishmentView): string {
  const cidade = [l.city, l.state].filter(Boolean).join("/");
  const cep = l.zip && l.zip.length === 8 ? `${l.zip.slice(0, 5)}-${l.zip.slice(5)}` : l.zip;
  return [l.address, cidade, cep].filter(Boolean).join(", ");
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-texto-secundario">{rotulo}</dt>
      <dd className="text-sm text-texto">{valor || "Não informado"}</dd>
    </div>
  );
}

/**
 * Configurações do Meu Empório (entrega 1): o que sai no papel da venda.
 * Impressão e logo são da conta (Dono e Gerente geral): o Gestor vê e não edita.
 * O cabeçalho de cada loja é do Gestor da loja para cima.
 */
export default async function ConfiguracoesPage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/configuracoes")) redirect("/emporio");
  const podeEditarConta = pode(papel, "conta");

  const [cfgRes, lojasRes, usuarios] = await Promise.all([
    lerConfiguracoesAction(db, user),
    listarEstabelecimentosAction(db, user),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cfg = cfgRes.ok ? cfgRes.data : null;
  const lojas = lojasRes.ok ? lojasRes.data : [];
  const caixasPorLoja = new Map(
    await Promise.all(
      lojas.map(async (l) => {
        const r = await listarCaixasAction(db, user, l.id);
        return [l.id, r.ok ? r.data : []] as const;
      }),
    ),
  );

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Configurações</h1>
        <p className="mt-1 text-sm text-texto-secundario">O que aparece no papel da venda.</p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Impressão e orçamento</h2>
          {podeEditarConta && cfg && <ConfiguracoesForm configuracoes={cfg} />}
        </div>
        {cfg ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Linha rotulo="Validade do orçamento" valor={`${cfg.quote_validity_days} dias`} />
              <Linha rotulo="Largura da bobina" valor={`${cfg.receipt_width} mm`} />
              <Linha rotulo="Rodapé do orçamento" valor={cfg.quote_footer} />
              <Linha rotulo="Rodapé da venda" valor={cfg.sale_footer} />
            </dl>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-texto">Logo</h3>
              {podeEditarConta ? (
                <LogoForm temLogo={cfg.has_logo} versao={cfg.logo_updated_at} />
              ) : cfg.has_logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/emporio/settings/logo?v=${encodeURIComponent(cfg.logo_updated_at ?? "")}`}
                  alt="Logo da loja"
                  className="max-h-24 max-w-48 rounded-lg border border-borda bg-superficie p-2"
                />
              ) : (
                <p className="text-sm text-texto-secundario">Nenhum logo enviado.</p>
              )}
            </div>
            {!podeEditarConta && (
              <p className="text-sm text-texto-secundario">
                Só o dono ou o gerente geral muda a impressão e o logo.
              </p>
            )}
          </>
        ) : (
          <EmptyState titulo="Não consegui ler as configurações">Recarregue a página.</EmptyState>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-texto">Cabeçalho das lojas</h2>
        {lojas.length === 0 ? (
          <EmptyState titulo="Nenhuma loja cadastrada">Cadastre a primeira loja em Lojas.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {lojas.map((l) => (
              <article key={l.id} className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium text-texto">{l.name}</h3>
                  {pode(papel, "gestor_da_loja", l.id) && (
                    <EstabelecimentoForm loja={l} usuarios={usuarios} podeLiberarNegativo={podeEditarConta} />
                  )}
                </div>
                <dl className="space-y-2">
                  <Linha rotulo="CNPJ" valor={l.document} />
                  <Linha rotulo="Endereço" valor={enderecoDaLoja(l)} />
                  <Linha rotulo="Telefone" valor={l.phone} />
                  <Linha rotulo="WhatsApp" valor={l.whatsapp} />
                </dl>
                <div className="space-y-2 border-t border-borda pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-texto">Caixas</h4>
                    {pode(papel, "gestor_da_loja", l.id) && <NovoCaixaBotao lojaId={l.id} lojaNome={l.name} />}
                  </div>
                  <ul className="space-y-1">
                    {(caixasPorLoja.get(l.id) ?? []).map((c) => (
                      <li key={c.id} className="flex justify-between gap-2 text-sm text-texto">
                        <span>{c.nome}</span>
                        <span className="text-texto-secundario">
                          {c.turno_aberto ? `Aberto por ${c.turno_aberto.aberto_por.name}` : "Fechado"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
