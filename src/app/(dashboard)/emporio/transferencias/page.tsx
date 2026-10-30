import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lacradoEfetivo, listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarTransferenciasAction } from "@/lib/actions/emporio-transferencias";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TransferenciaForm } from "../_components/transferencia-form";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { ReceberTransferenciaForm, CancelarTransferenciaForm, ResolverDiferencaForm } from "../_components/transferencia-acoes";
import { TransferenciasFiltro } from "../_components/transferencias-filtro";
import { UNIDADE_BASE_SUFIXO, numeroBr } from "../_components/formato";

const SITUACAO: Record<string, { rotulo: string; variante: "amber" | "green" | "gray" }> = {
  em_transito: { rotulo: "Em trânsito", variante: "amber" },
  aguardando_gestor: { rotulo: "Aguardando o Gestor", variante: "amber" },
  recebida: { rotulo: "Recebida", variante: "green" },
  cancelada: { rotulo: "Cancelada", variante: "gray" },
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Parada: em trânsito há mais de 2 dias (Q33), o mesmo corte do Meu Dia. */
const DIAS_PARADA = 2;

function diasEmTransito(enviadaEm: string): number {
  return Math.floor((Date.now() - new Date(enviadaEm).getTime()) / (24 * 60 * 60 * 1000));
}

function textoDias(dias: number): string {
  if (dias <= 0) return "enviada hoje";
  return dias === 1 ? "há 1 dia em trânsito" : `há ${dias} dias em trânsito`;
}

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; situacao?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja = "", situacao = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  // F6b: receber e cancelar são do Vendedor da loja para cima; enviar é do Gestor da origem.
  const podeEscrever = pode(papel, "vendedor_da_loja");
  const podeEnviar = pode(papel, "gestor_da_loja");
  const filtroSituacao =
    situacao === "em_transito" || situacao === "aguardando_gestor" || situacao === "recebida" || situacao === "cancelada" ? situacao : undefined;

  const [lojasRes, transfRes, todasLojas, produtos] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarTransferenciasAction(db, user, { establishment_id: loja || undefined, status: filtroSituacao }),
    // O destino é qualquer loja da conta, mesmo as que o usuário não enxerga.
    podeEnviar
      ? db.establishment.findMany({
          where: { archived_at: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    podeEnviar
      ? db.emporioProduct.findMany({
          where: { archived_at: null },
          select: {
            id: true,
            base_unit: true,
            track_sealed: true,
            product: { select: { name: true } },
            presentations: {
              where: { archived_at: null },
              select: { id: true, name: true, base_qty: true, archived_at: true, is_sealed_package: true },
              orderBy: { name: "asc" },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const idsVisiveis = new Set(lojas.map((l) => l.id));
  const origensDoEnvio = podeEnviar ? lojas.filter((l) => pode(papel, "gestor_da_loja", l.id)) : [];
  const transferencias = transfRes.ok ? transfRes.data : [];

  const produtosForm = produtos
    .map((p) => ({
      id: p.id,
      name: p.product.name,
      base_unit: p.base_unit,
      separa: lacradoEfetivo(p),
      fechadas: p.presentations.filter((a) => a.is_sealed_package).map((a) => ({ id: a.id, name: a.name })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Transferências</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Mercadoria que vai de uma loja para outra. Sai da origem no envio e entra no destino no recebimento.
          </p>
        </div>
        {origensDoEnvio.length > 0 && todasLojas.length > 1 && (
          <TransferenciaForm origens={origensDoEnvio} destinos={todasLojas} produtos={produtosForm} />
        )}
      </header>

      <TransferenciasFiltro lojas={lojas} loja={loja} situacao={filtroSituacao ?? ""} />

      {lojas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma loja cadastrada"
          acao={
            <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Estabelecimentos
            </Link>
          }
        >
          Cadastre as lojas para transferir mercadoria entre elas.
        </EmptyState>
      ) : transferencias.length === 0 ? (
        <EmptyState titulo="Nenhuma transferência encontrada">
          {filtroSituacao || loja ? "Mude o filtro para ver outras." : "Envie a primeira transferência entre lojas."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Situação</TableHead>
              {podeEscrever && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {transferencias.map((t) => {
              const s = SITUACAO[t.status];
              const dias = t.status === "em_transito" ? diasEmTransito(t.sent_at) : 0;
              const parada = t.status === "em_transito" && dias > DIAS_PARADA;
              const podeReceber = podeEscrever && t.status === "em_transito" && idsVisiveis.has(t.destination_establishment_id);
              const podeResolver =
                t.status === "aguardando_gestor" && pode(papel, "gestor_da_loja", t.destination_establishment_id);
              const podeCancelar =
                podeEscrever &&
                t.status === "em_transito" &&
                (t.sent_by_user_id === user.id || pode(papel, "gestor_da_loja", t.origin_establishment_id));
              return (
                <TableRow key={t.id}>
                  <TableCell>{DATA.format(new Date(t.sent_at))}</TableCell>
                  <TableCell className="font-medium text-texto">{t.origin_name}</TableCell>
                  <TableCell className="font-medium text-texto">{t.destination_name}</TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {t.items
                      .map((i) => {
                        const sufixo = UNIDADE_BASE_SUFIXO[i.base_unit] ?? i.base_unit;
                        const enviado = `${numeroBr(i.sent_qty)} ${sufixo} de ${i.product_name}${i.presentation_name ? ` (lacrado, ${i.presentation_name})` : ""}`;
                        if ((t.status !== "recebida" && t.status !== "aguardando_gestor") || i.received_qty === null || i.received_qty === i.sent_qty) {
                          return enviado;
                        }
                        return `${enviado}; chegaram ${numeroBr(i.received_qty)} ${sufixo}`;
                      })
                      .join("; ")}
                    {t.notes && <span className="block text-xs text-texto-secundario">{t.notes}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.variante}>{s.rotulo}</Badge>
                    {t.status === "em_transito" && (
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-texto-secundario">
                        {textoDias(dias)}
                        {parada && <Badge variant="red">parada</Badge>}
                      </span>
                    )}
                    {t.status === "aguardando_gestor" && (
                      <span className="mt-1 block text-xs text-texto-secundario">
                        {podeResolver
                          ? "Chegou com diferença: resolva."
                          : "Chegou com diferença: o Gestor da loja vai resolver."}
                      </span>
                    )}
                    {t.resolution && t.resolution_reason && (
                      <span className="block text-xs text-texto-secundario">
                        {t.resolution === "perda_no_caminho" ? "Perda no caminho" : "Não foi enviada"}:{" "}
                        {t.resolution_reason}
                      </span>
                    )}
                    {t.canceled_reason && (
                      <span className="block text-xs text-texto-secundario">{t.canceled_reason}</span>
                    )}
                  </TableCell>
                  {podeEscrever && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {podeReceber && (
                          <ReceberTransferenciaForm
                            transferenciaId={t.id}
                            origem={t.origin_name}
                            podeResolver={pode(papel, "gestor_da_loja", t.destination_establishment_id)}
                            itens={t.items.map((i) => ({
                              id: i.id,
                              product_name: i.product_name,
                              base_unit: i.base_unit,
                              presentation_name: i.presentation_name,
                              sent_qty: i.sent_qty,
                            }))}
                          />
                        )}
                        {podeResolver && (
                          <ResolverDiferencaForm
                            transferenciaId={t.id}
                            origem={t.origin_name}
                            itens={t.items
                              .filter((i) => i.received_qty !== null && i.received_qty < i.sent_qty)
                              .map((i) => ({
                                id: i.id,
                                product_name: i.product_name,
                                base_unit: i.base_unit,
                                sent_qty: i.sent_qty,
                                received_qty: i.received_qty ?? 0,
                              }))}
                          />
                        )}
                        {podeCancelar && <CancelarTransferenciaForm transferenciaId={t.id} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
