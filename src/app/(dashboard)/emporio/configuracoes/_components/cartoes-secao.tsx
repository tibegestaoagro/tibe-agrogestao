import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { AdquirenteView, TaxaView } from "@/lib/actions/emporio-cartoes";
import { AdquirenteArquivarBotao, AdquirenteForm } from "./adquirente-form";
import { TaxasCartaoLista } from "./taxas-cartao-lista";

/**
 * "Cartões: adquirentes e taxas" (Q250 a Q253, Q258). As adquirentes são da
 * conta: Dono e Gerente geral criam, renomeiam e arquivam. As taxas são por
 * loja: quem gere a loja mexe nas dela. Os outros só leem.
 */
export function CartoesSecao({
  adquirentes,
  taxas,
  lojas,
  lojasQueGere,
  contas,
  podeEditarConta,
}: {
  adquirentes: AdquirenteView[];
  taxas: TaxaView[];
  lojas: { id: string; name: string }[];
  lojasQueGere: string[];
  contas: { id: string; name: string }[];
  podeEditarConta: boolean;
}) {
  const ativas = adquirentes.filter((a) => !a.archived_at).map((a) => ({ id: a.id, name: a.name }));

  return (
    <section id="cartoes" className="scroll-mt-4 space-y-4">
      <h2 className="text-lg font-semibold text-texto">Cartões: adquirentes e taxas</h2>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-texto">Adquirentes</h3>
          {podeEditarConta && <AdquirenteForm />}
        </div>
        {adquirentes.length === 0 ? (
          <EmptyState titulo="Nenhuma adquirente cadastrada">
            Cadastre a empresa da maquininha (Cielo, Stone, Rede) para definir as taxas.
            {!podeEditarConta && " Só o dono ou o gerente geral cadastra."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {adquirentes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-texto">{a.name}</span>
                  <Badge variant={a.archived_at ? "gray" : "green"}>{a.archived_at ? "Arquivada" : "Ativa"}</Badge>
                  <span className="text-sm text-texto-secundario">
                    {a.rates_count === 1 ? "1 taxa" : `${a.rates_count} taxas`}
                  </span>
                </div>
                {podeEditarConta && (
                  <div className="flex flex-wrap gap-2">
                    <AdquirenteForm adquirente={{ id: a.id, name: a.name }} />
                    <AdquirenteArquivarBotao id={a.id} arquivada={!!a.archived_at} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-texto">Taxas por loja</h3>
        <TaxasCartaoLista
          taxas={taxas}
          lojas={lojas}
          lojasQueGere={lojasQueGere}
          adquirentes={ativas}
          contas={contas}
        />
      </div>
    </section>
  );
}
