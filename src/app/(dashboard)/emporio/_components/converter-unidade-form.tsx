"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Carregando } from "@/components/ui/carregando";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { numeroBr, textoConteudo, UNIDADE_BASE_ROTULO, UNIDADE_BASE_SUFIXO, CONTEUDO_UNIDADE_SUFIXO } from "./formato";

/**
 * "Converter para quilo" (Q320 a Q322). A prévia vem do servidor e o `POST` manda
 * o mesmo `content_qty` dela: se o conteúdo do produto mudar entre a prévia e o
 * clique, o servidor recusa em vez de converter com outro número.
 *
 * Não há campo editável, então a recusa vai para o rodapé do painel.
 */

type Previa = {
  product_id: string;
  name: string;
  from_unit: string;
  to_unit: string;
  content_qty: number;
  stores: {
    establishment_id: string;
    name: string;
    balance_before: number;
    balance_after: number;
    average_cost_before: number | null;
    average_cost_after: number | null;
  }[];
  reference_cost_before: number | null;
  reference_cost_after: number | null;
  presentations: {
    id: string;
    name: string;
    sealed: boolean;
    archived: boolean;
    base_qty_before: number;
    base_qty_after: number;
    check: boolean;
  }[];
};

const ORDEM = [] as const;

const DESTINO_ROTULO: Record<string, string> = { quilograma: "quilo", litro: "litro", unidade: "unidade" };

function dinheiro(n: number | null): string {
  return n == null ? "-" : reaisBr(n);
}

export function ConverterUnidadeForm({
  produtoId,
  baseUnit,
  conteudoUnit,
}: {
  produtoId: string;
  baseUnit: string;
  conteudoUnit: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "converter");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);

  const destino = DESTINO_ROTULO[conteudoUnit] ?? conteudoUnit;
  const origem = (UNIDADE_BASE_ROTULO[baseUnit] ?? baseUnit).toLowerCase();
  const sufixoOrigem = UNIDADE_BASE_SUFIXO[baseUnit] ?? baseUnit;
  const sufixoDestino = CONTEUDO_UNIDADE_SUFIXO[conteudoUnit] ?? conteudoUnit;

  async function carregar() {
    setLendo(true);
    setPrevia(null);
    const res = await apiGet<Previa>(`/api/v1/emporio/products/${produtoId}/convert-unit`);
    setLendo(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setPrevia(res.data);
  }

  async function submit() {
    if (!previa) return;
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/products/${produtoId}/convert-unit`, {
      content_qty: previa.content_qty,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(`Produto convertido para ${destino}.`);
    setOpen(false);
    router.refresh();
  }

  const confira = previa?.presentations.filter((a) => a.check) ?? [];

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Converter para {destino}
        </Button>
      }
      title={`Converter para ${destino}`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          err.limparTudo();
          void carregar();
        } else {
          setPrevia(null);
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Converter"
      pending={loading || lendo || !previa}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {lendo && <Carregando linhas={3} />}

      {previa && (
        <div className="space-y-5">
          <p className="text-sm text-texto">
            1 {origem} = {textoConteudo(previa.content_qty, conteudoUnit)}. O estoque, o custo e o histórico passam a
            ser em {destino}. Não dá para desfazer.
          </p>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-texto">Estoque e custo por loja</h3>
            {previa.stores.length === 0 ? (
              <p className="text-sm text-texto-secundario">Nenhuma loja com movimento deste produto.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Saldo antes</TableHead>
                    <TableHead>Saldo depois</TableHead>
                    <TableHead>Custo médio antes</TableHead>
                    <TableHead>Custo médio depois</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.stores.map((l) => (
                    <TableRow key={l.establishment_id}>
                      <TableCell className="font-medium text-texto">{l.name}</TableCell>
                      <TableCell>
                        {numeroBr(l.balance_before)} {sufixoOrigem}
                      </TableCell>
                      <TableCell>
                        {numeroBr(l.balance_after)} {sufixoDestino}
                      </TableCell>
                      <TableCell>{dinheiro(l.average_cost_before)}</TableCell>
                      <TableCell>{dinheiro(l.average_cost_after)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {(previa.reference_cost_before != null || previa.reference_cost_after != null) && (
            <p className="text-sm text-texto">
              Custo de referência: {dinheiro(previa.reference_cost_before)} por {origem} passa a{" "}
              {dinheiro(previa.reference_cost_after)} por {destino}.
            </p>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-texto">Apresentações</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apresentação</TableHead>
                  <TableHead>Antes</TableHead>
                  <TableHead>Depois</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previa.presentations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-texto">
                      {a.name}
                      {a.archived && (
                        <Badge variant="gray" className="ml-2">
                          Arquivada
                        </Badge>
                      )}
                      {a.check && (
                        <Badge variant="amber" className="ml-2">
                          confira
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {numeroBr(a.base_qty_before)} {sufixoOrigem}
                    </TableCell>
                    <TableCell>
                      {numeroBr(a.base_qty_after)} {sufixoDestino}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {confira.length > 0 && (
              <p className="text-xs text-texto-secundario">
                O valor não fecha em múltiplo de 50 g: confira se a fração estava certa.
              </p>
            )}
          </div>
        </div>
      )}
    </FormSheet>
  );
}
