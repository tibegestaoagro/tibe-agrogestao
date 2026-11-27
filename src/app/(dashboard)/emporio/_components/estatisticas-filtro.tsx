"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// O mesmo estilo dos chips do PeriodoFiltro: a tela nova não destoa das outras.
const CHIP =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 sm:px-3";
const CHIP_ATIVO = "border-primaria-tinta bg-primaria text-sobre-primaria";
const CHIP_INATIVO = "border-borda-forte bg-superficie text-texto hover:bg-superficie-afundada";

const TODAS = "__todas__";
const CAMINHO = "/emporio/estatisticas";

function endereco(parametros: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${CAMINHO}?${s}` : CAMINHO;
}

/**
 * O filtro do topo das Estatísticas: atalhos de período, "Escolher datas" e a loja. Vive na URL
 * (a página server relê) e preserva a aba e o que ela guarda (`manter`: a janela do fluxo, a curva ABC).
 * `atalhos` vem pronto do servidor, porque o dia de Brasília não se calcula no navegador.
 */
export function EstatisticasFiltro({
  aba,
  de,
  ate,
  loja,
  lojas,
  atalhos,
  invalido,
  manter = {},
}: {
  aba: string;
  de: string;
  ate: string;
  /** A loja escolhida; vazio é "Todas as minhas lojas". */
  loja: string;
  /** As lojas ao alcance de quem olha. O seletor só aparece com mais de uma. */
  lojas: { id: string; name: string }[];
  atalhos: { id: string; rotulo: string; de: string; ate: string }[];
  invalido: boolean;
  manter?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const doAtalho = atalhos.find((a) => a.de === de && a.ate === ate);
  const escolhendo = !doAtalho;
  const base = { aba, loja: loja || undefined, ...manter };

  return (
    <div className="space-y-3" role="group" aria-label="Período e loja">
      <div className="flex flex-wrap items-center gap-2">
        {atalhos.map((a) => (
          <Link
            key={a.id}
            href={endereco({ ...base, de: a.de, ate: a.ate })}
            aria-current={doAtalho?.id === a.id ? "true" : undefined}
            className={cn(CHIP, doAtalho?.id === a.id ? CHIP_ATIVO : CHIP_INATIVO)}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      <details open={escolhendo} className="group">
        <summary
          className={cn(CHIP, "cursor-pointer list-none", escolhendo ? CHIP_ATIVO : CHIP_INATIVO, "[&::-webkit-details-marker]:hidden")}
        >
          Escolher datas
        </summary>
        <form method="get" action={CAMINHO} className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="aba" value={aba} />
          {loja && <input type="hidden" name="loja" value={loja} />}
          {Object.entries(manter).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <div className="space-y-1">
            <Label htmlFor="estatisticas-de">De</Label>
            <Input id="estatisticas-de" type="date" name="de" defaultValue={de} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="estatisticas-ate">Até</Label>
            <Input id="estatisticas-ate" type="date" name="ate" defaultValue={ate} required />
          </div>
          <Button type="submit" variant="outline">
            Aplicar
          </Button>
        </form>
      </details>

      {lojas.length > 1 && (
        <div className="sm:max-w-xs">
          <Select
            value={loja || TODAS}
            onValueChange={(v) => router.push(endereco({ ...base, loja: v === TODAS ? undefined : v, de, ate }))}
          >
            <SelectTrigger aria-label="Loja">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as minhas lojas</SelectItem>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {invalido && (
        <p role="status" className="text-sm text-texto-secundario">
          Período inválido. Mostrando este mês.
        </p>
      )}
    </div>
  );
}
