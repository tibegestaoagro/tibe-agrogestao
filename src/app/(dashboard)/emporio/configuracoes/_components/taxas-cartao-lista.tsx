"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAviso } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client-api";
import { ROTULO_DA_BANDEIRA } from "@/lib/emporio/cartao";
import { reaisBr } from "@/lib/numero-br";
import type { TaxaView } from "@/lib/actions/emporio-cartoes";
import { pctBr } from "../../_components/formato";
import { CARTAO_ROTULO } from "../../_components/venda-rotulos";
import { TaxaCartaoForm } from "./taxa-cartao-form";

type Opcao = { id: string; name: string };

const TODAS = "todas";

/** "AAAA-MM-DD" como "DD/MM/AAAA", sem passar por fuso. */
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** O dia de hoje em Brasília, "AAAA-MM-DD", para saber o que já encerrou. */
function hojeIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function faixa(t: TaxaView): string {
  return t.installments_from === t.installments_to
    ? `${t.installments_from}x`
    : `${t.installments_from} a ${t.installments_to}x`;
}

function vigencia(t: TaxaView): string {
  return t.valid_to ? `${dataBr(t.valid_from)} até ${dataBr(t.valid_to)}` : `desde ${dataBr(t.valid_from)}`;
}

function descricaoDaTaxa(t: TaxaView, loja: string): string {
  return `${loja}, ${t.acquirer_name}, ${ROTULO_DA_BANDEIRA[t.brand]}, ${(CARTAO_ROTULO[t.kind] ?? t.kind).toLowerCase()}, ${faixa(t)}`;
}

/** Remove (linha que nenhuma venda usou) ou encerra (linha em uso). Sem formulário: a recusa vai para o aviso. */
function TaxaRemoverBotao({ taxa, descricao }: { taxa: TaxaView; descricao: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function executar() {
    const res = await apiDelete(`/api/v1/emporio/card-fee-rates/${taxa.id}${taxa.in_use ? "?encerrar=1" : ""}`);
    if (res.ok) {
      aviso.sucesso(taxa.in_use ? "Taxa encerrada." : "Taxa removida.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          {taxa.in_use ? "Encerrar" : "Remover"}
        </Button>
      }
      titulo={taxa.in_use ? "Encerrar taxa de cartão" : "Remover taxa de cartão"}
      descricao={
        taxa.in_use
          ? `${descricao}: já teve venda, então a taxa não se apaga. Ela deixa de valer a partir de hoje, e as vendas já feitas guardam a taxa que valia.`
          : `${descricao}: sem a taxa, a loja não vende nessa combinação até cadastrar de novo.`
      }
      rotuloConfirmar={taxa.in_use ? "Encerrar taxa" : "Remover taxa"}
      aoConfirmar={executar}
    />
  );
}

/**
 * As taxas por loja, agrupadas por adquirente e modalidade (Q250 a Q253).
 * Quem gere a loja mexe nas linhas dela; os outros só leem.
 */
export function TaxasCartaoLista({
  taxas,
  lojas,
  lojasQueGere,
  adquirentes,
  contas,
}: {
  taxas: TaxaView[];
  lojas: Opcao[];
  /** Ids das lojas em que quem lê pode escrever. */
  lojasQueGere: string[];
  /** Só as adquirentes ativas: as que uma linha nova pode usar. */
  adquirentes: Opcao[];
  contas: Opcao[];
}) {
  const [lojaFiltro, setLojaFiltro] = useState(TODAS);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const hoje = hojeIso();
  const nomeDaLoja = (id: string) => lojas.find((l) => l.id === id)?.name ?? "Loja";
  const gere = new Set(lojasQueGere);
  const lojasParaNova = lojas.filter((l) => gere.has(l.id));

  const encerrada = (t: TaxaView) => t.valid_to !== null && t.valid_to < hoje;
  const doFiltro = taxas.filter((t) => lojaFiltro === TODAS || t.establishment_id === lojaFiltro);
  const visiveis = doFiltro.filter((t) => mostrarEncerradas || !encerrada(t));
  const escondidas = doFiltro.length - visiveis.length;

  // adquirente, depois modalidade; dentro, loja, bandeira, faixa e começo da vigência.
  const grupos = new Map<string, { adquirente: string; kind: string; linhas: TaxaView[] }>();
  for (const t of visiveis) {
    const chave = `${t.acquirer_id}|${t.kind}`;
    const g = grupos.get(chave) ?? { adquirente: t.acquirer_name, kind: t.kind, linhas: [] };
    g.linhas.push(t);
    grupos.set(chave, g);
  }
  const ordemKind = Object.keys(CARTAO_ROTULO);
  const listaDeGrupos = [...grupos.values()].sort(
    (a, b) => a.adquirente.localeCompare(b.adquirente, "pt-BR") || ordemKind.indexOf(a.kind) - ordemKind.indexOf(b.kind),
  );
  for (const g of listaDeGrupos) {
    g.linhas.sort(
      (a, b) =>
        nomeDaLoja(a.establishment_id).localeCompare(nomeDaLoja(b.establishment_id), "pt-BR") ||
        a.brand.localeCompare(b.brand) ||
        a.installments_from - b.installments_from ||
        a.valid_from.localeCompare(b.valid_from),
    );
  }

  const podeCriar = lojasParaNova.length > 0 && adquirentes.length > 0 && contas.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
              <SelectTrigger aria-label="Filtrar por loja">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as lojas</SelectItem>
                {lojas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              type="checkbox"
              checked={mostrarEncerradas}
              onChange={(e) => setMostrarEncerradas(e.target.checked)}
            />
            Mostrar encerradas
          </label>
        </div>
        {podeCriar && <TaxaCartaoForm modo="nova" lojas={lojasParaNova} adquirentes={adquirentes} contas={contas} />}
      </div>

      {lojasParaNova.length > 0 && adquirentes.length === 0 && (
        <p className="text-sm text-texto-secundario">Cadastre uma adquirente para poder definir as taxas.</p>
      )}
      {lojasParaNova.length > 0 && contas.length === 0 && (
        <p className="text-sm text-texto-secundario">Cadastre uma conta bancária no Caixa para poder definir as taxas.</p>
      )}

      {listaDeGrupos.length === 0 ? (
        <EmptyState titulo="Nenhuma taxa cadastrada">
          Sem a taxa da loja para a adquirente, a bandeira e a modalidade, o balcão não deixa vender no cartão.
          {escondidas > 0 && ` Há ${escondidas} encerrada${escondidas > 1 ? "s" : ""}: marque "Mostrar encerradas".`}
        </EmptyState>
      ) : (
        listaDeGrupos.map((g) => (
          <div key={`${g.adquirente}|${g.kind}`} className="space-y-2">
            <h4 className="text-sm font-medium text-texto">
              {g.adquirente}: {CARTAO_ROTULO[g.kind] ?? g.kind}
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.linhas.map((t) => {
                  const loja = nomeDaLoja(t.establishment_id);
                  const mexe = gere.has(t.establishment_id) && !encerrada(t);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-texto">{loja}</TableCell>
                      <TableCell>{ROTULO_DA_BANDEIRA[t.brand]}</TableCell>
                      <TableCell>{faixa(t)}</TableCell>
                      <TableCell>
                        {pctBr(t.fee_pct)}
                        {t.fee_fixed > 0 && ` + ${reaisBr(t.fee_fixed)}`}
                      </TableCell>
                      <TableCell>{t.days} dias</TableCell>
                      <TableCell>{t.bank_account_name ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{vigencia(t)}</span>
                          {t.in_use && <Badge variant="blue">em uso</Badge>}
                          {encerrada(t) && <Badge variant="gray">encerrada</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {mexe && (
                          <div className="flex flex-wrap gap-2">
                            <TaxaCartaoForm
                              modo="vigencia"
                              taxa={t}
                              lojas={lojasParaNova}
                              adquirentes={adquirentes}
                              contas={contas}
                            />
                            {!t.in_use && (
                              <TaxaCartaoForm
                                modo="editar"
                                taxa={t}
                                lojas={lojasParaNova}
                                adquirentes={adquirentes}
                                contas={contas}
                              />
                            )}
                            <TaxaRemoverBotao taxa={t} descricao={descricaoDaTaxa(t, loja)} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
}
