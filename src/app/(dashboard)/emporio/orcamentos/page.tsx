import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarOrcamentosAction } from "@/lib/actions/emporio-orcamentos";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { NomeDoCliente, VendaLink } from "../_components/amarras";
import { idDoClientePadrao } from "../_components/cliente-padrao";
import { Paginacao } from "../_components/paginacao";
import { OrcamentosFiltro } from "./_components/orcamentos-filtro";
import { TAMANHOS_DE_PAGINA } from "../_components/paginacao-opcoes";
import { SITUACOES_DO_ORCAMENTO } from "./_components/situacoes";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
// `valid_until` é uma data sem hora: lida em UTC, para não recuar um dia.
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

type Situacao = "acompanhamento" | "aberto" | "vencido" | "faturado" | "cancelado" | "todos";

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{
    loja?: string;
    situacao?: string;
    q?: string;
    pagina?: string;
    por_pagina?: string;
    ordem?: string;
  }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja = "", situacao = "", q = "", pagina = "", por_pagina = "", ordem: ordemUrl = "" } = await searchParams;
  const porPagina = TAMANHOS_DE_PAGINA.find((n) => String(n) === por_pagina) ?? 20;
  const ordem: "asc" | "desc" = ordemUrl === "asc" ? "asc" : "desc";
  const paginaPedida = /^\d+$/.test(pagina) && Number(pagina) >= 1 ? Math.min(Number(pagina), 1_000_000) : 1;
  const filtro: Situacao = SITUACOES_DO_ORCAMENTO.some((s) => s.valor === situacao)
    ? (situacao as Situacao)
    : "acompanhamento";

  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!pode(papel, "fora_do_caixa")) redirect("/emporio");
  const podeVender = pode(papel, "vendedor_da_loja");
  const padraoId = await idDoClientePadrao(db);

  const [lojasRes, res] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarOrcamentosAction(db, user, {
      establishment_id: loja || undefined,
      q: q.trim() || undefined,
      situacao: filtro,
      page: paginaPedida,
      per_page: porPagina,
      order: ordem,
    }),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const orcamentos = res.ok ? res.data.linhas : [];
  const filtrado = filtro !== "acompanhamento" || !!loja || !!q.trim();

  function hrefDe(n: number): string {
    const p = new URLSearchParams();
    if (loja) p.set("loja", loja);
    if (filtro !== "acompanhamento") p.set("situacao", filtro);
    if (q.trim()) p.set("q", q.trim());
    if (porPagina !== 20) p.set("por_pagina", String(porPagina));
    if (ordem !== "desc") p.set("ordem", ordem);
    if (n > 1) p.set("pagina", String(n));
    const texto = p.toString();
    return texto ? `/emporio/orcamentos?${texto}` : "/emporio/orcamentos";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Orçamentos</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            O que foi orçado e ainda pode virar venda, com o preço combinado dentro da validade.
          </p>
        </div>
        {podeVender && (
          <Button asChild>
            <Link href="/emporio/vender">Vender</Link>
          </Button>
        )}
      </header>

      <OrcamentosFiltro lojas={lojas} loja={loja} situacao={filtro} q={q} porPagina={porPagina} ordem={ordem} />

      {!res.ok ? (
        <p className="rounded-lg bg-superficie-afundada px-4 py-3 text-sm text-texto-secundario">{res.message}</p>
      ) : orcamentos.length === 0 ? (
        <EmptyState titulo="Nenhum orçamento encontrado">
          {filtrado ? "Mude o filtro ou a busca para ver outros." : "Os orçamentos salvos no balcão aparecem aqui."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>
                <span className="sr-only">Abrir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orcamentos.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium text-texto">{o.numero}</TableCell>
                <TableCell className="font-medium text-texto">
                  <NomeDoCliente id={o.customer_id} nome={o.cliente} padraoId={padraoId} />
                  <span className="block text-xs font-normal text-texto-secundario">{o.loja}</span>
                </TableCell>
                <TableCell>{o.telefone ?? "-"}</TableCell>
                <TableCell>{reaisBr(o.valor)}</TableCell>
                <TableCell>{DATA_HORA.format(new Date(o.criado_em))}</TableCell>
                <TableCell>{DATA.format(new Date(o.valid_until))}</TableCell>
                <TableCell>
                  <SituacaoDoOrcamento situacao={o.situacao} vendaId={o.venda_id} vendaNumero={o.venda_numero} />
                </TableCell>
                <TableCell>{o.vendedor ?? "-"}</TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/emporio/orcamentos/${o.id}`}>Ver</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {res.ok && orcamentos.length > 0 && (
        <Paginacao page={res.data.page} perPage={res.data.per_page} total={res.data.total} hrefDe={hrefDe} />
      )}
    </div>
  );
}

function SituacaoDoOrcamento({
  situacao,
  vendaId,
  vendaNumero,
}: {
  situacao: "aberto" | "vencido" | "faturado" | "cancelado";
  vendaId: string | null;
  vendaNumero: string | null;
}) {
  if (situacao === "cancelado") return <Badge variant="red">Cancelado</Badge>;
  if (situacao === "faturado") {
    return (
      <Badge variant="green">
        Faturado
        {vendaNumero && (
          <>
            {" ("}
            <VendaLink id={vendaId} numero={Number(vendaNumero)} minusculo />
            {")"}
          </>
        )}
      </Badge>
    );
  }
  return situacao === "vencido" ? <Badge variant="amber">Vencido</Badge> : <Badge variant="blue">Aberto</Badge>;
}
