"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reaisBr } from "@/lib/numero-br";
import type { ItemDeEtiqueta, LojaDeEtiqueta } from "../_dados";

type Formato = "a4" | "rolo";

const COPIAS_MAXIMAS = 999;

const CAMPO_SELECT =
  "flex min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-1 text-base shadow-sm sm:h-9 sm:min-h-0 sm:text-sm";

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function soDigitos(t: string, max: number): string {
  return t.replace(/\D/g, "").slice(0, max);
}

/** Escolha das etiquetas: o que imprimir, em que loja e em que formato. A impressão é outra página. */
export function EtiquetasEscolha({
  lojas,
  itens,
  formatoPadrao,
  posicoesDaFolha,
}: {
  lojas: LojaDeEtiqueta[];
  itens: ItemDeEtiqueta[];
  formatoPadrao: Formato;
  /** Colunas x linhas da folha A4 configurada. */
  posicoesDaFolha: number;
}) {
  const [lojaId, setLojaId] = useState(lojas[0]?.id ?? "");
  const [formato, setFormato] = useState<Formato>(formatoPadrao);
  const [busca, setBusca] = useState("");
  // Apresentação marcada -> texto das cópias (só dígitos).
  const [copias, setCopias] = useState<Record<string, string>>({});
  const [inicio, setInicio] = useState("1");

  const comPreco = useMemo(() => itens.filter((i) => i.precos[lojaId] !== undefined), [itens, lojaId]);
  const filtrados = useMemo(() => {
    const t = semAcento(busca.trim());
    if (!t) return itens;
    return itens.filter((i) => semAcento(`${i.produto} ${i.apresentacao}`).includes(t));
  }, [itens, busca]);

  // Marcações de outra loja que perderam o preço deixam de valer.
  const validos = comPreco.filter((i) => copias[i.id] !== undefined);
  const marcaveisFiltrados = filtrados.filter((i) => i.precos[lojaId] !== undefined);
  const todasMarcadas = marcaveisFiltrados.length > 0 && marcaveisFiltrados.every((i) => copias[i.id] !== undefined);

  function alternar(id: string, marcar: boolean) {
    setCopias((atual) => {
      const novo = { ...atual };
      if (marcar) novo[id] = novo[id] ?? "1";
      else delete novo[id];
      return novo;
    });
  }

  function selecionarTodas() {
    setCopias((atual) => {
      const novo = { ...atual };
      for (const i of marcaveisFiltrados) {
        if (todasMarcadas) delete novo[i.id];
        else novo[i.id] = novo[i.id] ?? "1";
      }
      return novo;
    });
  }

  const inicioNumero = Math.min(Math.max(Number(inicio) || 1, 1), Math.max(posicoesDaFolha, 1));
  const params = new URLSearchParams({
    loja: lojaId,
    formato,
    itens: validos.map((i) => `${i.id}:${Math.min(Math.max(Number(copias[i.id]) || 1, 1), COPIAS_MAXIMAS)}`).join(","),
  });
  if (formato === "a4") params.set("inicio", String(inicioNumero));
  const totalEtiquetas = validos.reduce(
    (s, i) => s + Math.min(Math.max(Number(copias[i.id]) || 1, 1), COPIAS_MAXIMAS),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="etq-loja">Loja (o preço é o dela)</Label>
          <select id="etq-loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)} className={CAMPO_SELECT}>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="etq-formato">Formato</Label>
          <select
            id="etq-formato"
            value={formato}
            onChange={(e) => setFormato(e.target.value === "rolo" ? "rolo" : "a4")}
            className={CAMPO_SELECT}
          >
            <option value="a4">Folha A4</option>
            <option value="rolo">Rolo</option>
          </select>
        </div>
        {formato === "a4" && (
          <div className="space-y-1">
            <Label htmlFor="etq-inicio">Começar na etiqueta nº (1 a {posicoesDaFolha})</Label>
            <Input
              id="etq-inicio"
              inputMode="numeric"
              autoComplete="off"
              value={inicio}
              onChange={(e) => setInicio(soDigitos(e.target.value, 3))}
              onBlur={() => setInicio(String(inicioNumero))}
            />
          </div>
        )}
      </div>

      {comPreco.length === 0 ? (
        <EmptyState titulo="Nenhum produto com preço nesta loja">
          Defina o preço das apresentações nesta loja para poder imprimir as etiquetas.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 sm:w-72">
              <Label htmlFor="etq-busca">Buscar</Label>
              <Input
                id="etq-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do produto ou da apresentação"
              />
            </div>
            <Button type="button" variant="outline" onClick={selecionarTodas} disabled={marcaveisFiltrados.length === 0}>
              {todasMarcadas ? "Desmarcar todas" : "Selecionar todas"}
            </Button>
          </div>

          {filtrados.length === 0 ? (
            <EmptyState titulo="Nenhum produto encontrado">Nenhum produto bate com a busca.</EmptyState>
          ) : (
            <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
              {filtrados.map((i) => {
                const preco = i.precos[lojaId];
                const semPreco = preco === undefined;
                const marcada = copias[i.id] !== undefined;
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={marcada && !semPreco}
                        disabled={semPreco}
                        onChange={(e) => alternar(i.id, e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className={semPreco ? "text-texto-discreto" : "font-medium text-texto"}>{i.produto}</span>
                        <span className="text-texto-secundario"> · {i.apresentacao}</span>
                        {semPreco ? (
                          <Badge variant="gray" className="ml-2">
                            sem preço
                          </Badge>
                        ) : (
                          <span className="ml-2 text-texto-secundario">{reaisBr(preco)}</span>
                        )}
                        {!i.barcode && (
                          <Badge variant="gray" className="ml-2">
                            sem código
                          </Badge>
                        )}
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`etq-copias-${i.id}`} className="text-xs text-texto-secundario">
                        Cópias
                      </Label>
                      <Input
                        id={`etq-copias-${i.id}`}
                        inputMode="numeric"
                        autoComplete="off"
                        className="w-20"
                        disabled={!marcada || semPreco}
                        value={marcada && !semPreco ? copias[i.id] : ""}
                        onChange={(e) => setCopias((atual) => ({ ...atual, [i.id]: soDigitos(e.target.value, 3) }))}
                        onBlur={() =>
                          setCopias((atual) => ({
                            ...atual,
                            [i.id]: String(Math.min(Math.max(Number(atual[i.id]) || 1, 1), COPIAS_MAXIMAS)),
                          }))
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {validos.length === 0 ? (
              <Button type="button" disabled>
                <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                Imprimir etiquetas
              </Button>
            ) : (
              <Button asChild>
                <a href={`/emporio/imprimir/etiquetas?${params.toString()}`} target="_blank" rel="noopener">
                  <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                  Imprimir etiquetas
                </a>
              </Button>
            )}
            <span className="text-sm text-texto-secundario">
              {totalEtiquetas === 0
                ? "Marque as apresentações que quer imprimir."
                : `${totalEtiquetas} ${totalEtiquetas === 1 ? "etiqueta" : "etiquetas"}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
