import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { precisaReporAction } from "@/lib/actions/emporio-estoque";
import { listarComprasAction } from "@/lib/actions/emporio-compras";
import { listarTransferenciasAction } from "@/lib/actions/emporio-transferencias";
import { listarVendasAction } from "@/lib/actions/emporio-vendas";
import { listarFiadoAction } from "@/lib/actions/emporio-caixa";
import { hasMinRole } from "@/lib/permissions";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { primeirosPassosAction, type PassoKey, type PassoView } from "@/lib/actions/emporio-primeiros-passos";
import { Badge } from "@/components/ui/badge";

const ROTULO_DO_PASSO: Record<PassoKey, string> = {
  preco: "Preço de venda",
  estoque_inicial: "Estoque inicial com custo",
  saldo_caixa: "Saldo inicial do caixa",
  taxa_cartao: "Taxa do cartão",
  despesa_fixa: "Despesa fixa",
  minimo_maximo: "Mínimo e máximo",
  conta_pix: "Conta PIX",
};

/** Meia-noite de hoje em Brasília (sem horário de verão desde 2019), como instante UTC. */
function inicioDoDiaEmBrasilia(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${ymd}T00:00:00-03:00`);
}

/**
 * Meu Empório: o início. Cartões, sem item novo no menu (Q59, Q71).
 *
 * `requireFeaturePage` devolve 404 quando o recurso não é visível para o
 * usuário, como se a rota não existisse.
 */
export default async function EmporioPage() {
  const user = await requireFeaturePage("emporio");
  const podeVender = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const lojas = await listarEstabelecimentosAction(db, user);
  const estabelecimentos = lojas.ok ? lojas.data.length : 0;
  const produtos = await db.emporioProduct.count({ where: { archived_at: null } });
  const repor = await precisaReporAction(db, user);
  const aRepor = repor.ok ? repor.data.length : 0;
  const pendentes = await listarComprasAction(db, user, { status: "pendente" });
  const comprasPendentes = pendentes.ok ? pendentes.data.length : 0;
  const emTransito = await listarTransferenciasAction(db, user, { status: "em_transito" });
  const transferenciasEmTransito = emTransito.ok ? emTransito.data.length : 0;
  const hoje = await listarVendasAction(db, user, { status: "concluida", de: inicioDoDiaEmBrasilia() });
  const vendasHoje = hoje.ok ? hoje.data.length : 0;
  const fiado = await listarFiadoAction(db, user);
  const clientesNoFiado = fiado.ok ? fiado.data.length : 0;
  const passos = ehAdmin ? await primeirosPassosAction(db, user) : null;
  // O aviso de loja sem Gestor (Q132) é recomendado e entra mesmo com os essenciais prontos.
  const pendenciasPorLoja = passos?.ok
    ? passos.data.establishments.filter((l) => l.sem_gestor || (!passos.data.complete && l.steps.some((s) => !s.done)))
    : [];
  const podeVerEquipe = pode(await papelDoEmporio(db, user), "conta");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-texto">Meu Empório</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Suas lojas e o catálogo de produtos que elas vendem.
        </p>
      </header>

      {pendenciasPorLoja.length > 0 && (
        <section className="space-y-4 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-texto">Primeiros passos</h2>
            <p className="mt-1 text-sm text-texto-secundario">
              O que falta para o resultado da loja sair confiável. Sem os essenciais, ele sai estimado.
            </p>
          </div>
          {pendenciasPorLoja.map((loja) => (
            <div key={loja.establishment_id} className="space-y-3">
              <h3 className="text-sm font-semibold text-texto">{loja.name}</h3>
              <ListaDePassos titulo="Essenciais" passos={loja.steps.filter((s) => s.essential)} />
              <ListaDePassos titulo="Recomendados" passos={loja.steps.filter((s) => !s.essential)} />
              {loja.sem_gestor && (
                <div>
                  <Link
                    href={loja.sem_gestor.href}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-texto hover:underline sm:min-h-0"
                  >
                    {loja.sem_gestor.message}
                  </Link>
                  <Badge variant="amber" className="ml-2">
                    Recomendado
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Cartao
          href="/emporio/estabelecimentos"
          titulo="Estabelecimentos"
          contagem={estabelecimentos}
          singular="estabelecimento"
          plural="estabelecimentos"
        />
        <Cartao
          href="/emporio/produtos"
          titulo="Produtos"
          contagem={produtos}
          singular="produto"
          plural="produtos"
        />
        <Cartao
          href="/emporio/estoque"
          titulo="Estoque"
          contagem={aRepor}
          singular="produto precisa repor"
          plural="produtos precisam repor"
        />
        <Cartao
          href="/emporio/compras"
          titulo="Compras"
          contagem={comprasPendentes}
          singular="compra a receber"
          plural="compras a receber"
        />
        <Cartao
          href="/emporio/transferencias"
          titulo="Transferências"
          contagem={transferenciasEmTransito}
          singular="transferência em trânsito"
          plural="transferências em trânsito"
        />
        {podeVender && <CartaoTexto href="/emporio/vender" titulo="Vender" texto="Abrir o balcão e registrar uma venda" />}
        <Cartao
          href="/emporio/vendas"
          titulo="Vendas"
          contagem={vendasHoje}
          singular="venda hoje"
          plural="vendas hoje"
        />
        <Cartao
          href="/emporio/fiado"
          titulo="Fiado"
          contagem={clientesNoFiado}
          singular="cliente com fiado em aberto"
          plural="clientes com fiado em aberto"
        />
        <CartaoTexto href="/emporio/caixa" titulo="Caixa" texto="Saldo das gavetas e das contas, e os movimentos" />
        {podeVerEquipe && (
          <CartaoTexto href="/emporio/equipe" titulo="Equipe" texto="Quem trabalha nas lojas e o que cada um pode fazer" />
        )}
        {ehAdmin && (
          <CartaoTexto href="/emporio/resultado" titulo="Resultado" texto="Quanto cada loja ganhou no mês e o ponto de equilíbrio" />
        )}
        {ehAdmin && (
          <CartaoTexto href="/emporio/despesas" titulo="Despesas" texto="Contas a pagar, despesas fixas e o Vendeu, Pagou" />
        )}
      </div>
    </div>
  );
}

function ListaDePassos({ titulo, passos }: { titulo: string; passos: PassoView[] }) {
  if (passos.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">{titulo}</p>
      <ul className="mt-1 divide-y divide-borda">
        {passos.map((p) => (
          <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link
                href={p.href}
                className="inline-flex min-h-11 items-center text-sm font-medium text-texto hover:underline sm:min-h-0"
              >
                {ROTULO_DO_PASSO[p.key]}
              </Link>
              {p.detail && <p className="text-xs text-texto-discreto">{p.detail}</p>}
            </div>
            <Badge variant={p.done ? "green" : "amber"}>{p.done ? "Feito" : "Pendente"}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartaoTexto({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-borda bg-superficie p-5 shadow-sm hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
    >
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <p className="mt-1 text-sm text-texto-secundario">{texto}</p>
    </Link>
  );
}

function Cartao({
  href,
  titulo,
  contagem,
  singular,
  plural,
}: {
  href: string;
  titulo: string;
  contagem: number;
  singular: string;
  plural: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-borda bg-superficie p-5 shadow-sm hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
    >
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <p className="mt-1 text-sm text-texto-secundario">
        {contagem} {contagem === 1 ? singular : plural}
      </p>
    </Link>
  );
}
