import Link from "next/link";
import { atalhosDePeriodo } from "@/lib/emporio/periodo";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 sm:px-3";
const CHIP_ATIVO = "border-primaria-tinta bg-primaria text-sobre-primaria";
const CHIP_INATIVO = "border-borda-forte bg-superficie text-texto hover:bg-superficie-afundada";

/** O endereço de `caminho` com o que a tela já filtra (`extras`, sem vazios) e o período. */
export function enderecoComPeriodo(caminho: string, extras: Record<string, string | undefined>, de: string, ate: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extras)) if (v) p.set(k, v);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  const s = p.toString();
  return s ? `${caminho}?${s}` : caminho;
}

/**
 * O seletor de período do Empório (frente A): Hoje, Esta semana, Este mês, Mês passado e Escolher.
 * Grava `de` e `ate` na URL e preserva o resto (`extras`: loja, ver, lugar...). É só link e um
 * formulário GET, então a página server relê sem JavaScript. `de` e `ate` vazios são "sem período":
 * `rotuloVazio` oferece a volta a esse estado (quando a tela tem um padrão ou aceita tudo).
 */
export function PeriodoFiltro({
  caminho,
  de,
  ate,
  extras = {},
  rotuloVazio,
}: {
  /** A rota da tela, sem query. */
  caminho: string;
  de: string;
  ate: string;
  extras?: Record<string, string | undefined>;
  rotuloVazio?: string;
}) {
  const atalhos = atalhosDePeriodo(hojeEmBrasilia());
  const doAtalho = atalhos.find((a) => a.de === de && a.ate === ate);
  const vazio = !de && !ate;
  const escolhendo = !doAtalho && !vazio;
  const idDe = `periodo-de-${caminho}`;
  const idAte = `periodo-ate-${caminho}`;

  return (
    <div className="space-y-3" role="group" aria-label="Período">
      <div className="flex flex-wrap gap-2">
        {rotuloVazio && (
          <Link
            href={enderecoComPeriodo(caminho, extras, "", "")}
            aria-current={vazio ? "true" : undefined}
            className={cn(CHIP, vazio ? CHIP_ATIVO : CHIP_INATIVO)}
          >
            {rotuloVazio}
          </Link>
        )}
        {atalhos.map((a) => (
          <Link
            key={a.id}
            href={enderecoComPeriodo(caminho, extras, a.de, a.ate)}
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
          Escolher
        </summary>
        <form method="get" action={caminho} className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {Object.entries(extras).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <div className="space-y-1">
            <Label htmlFor={idDe}>De</Label>
            <Input id={idDe} type="date" name="de" defaultValue={de} required={!rotuloVazio} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idAte}>Até</Label>
            <Input id={idAte} type="date" name="ate" defaultValue={ate} required={!rotuloVazio} />
          </div>
          <Button type="submit" variant="outline">
            Aplicar
          </Button>
        </form>
      </details>
    </div>
  );
}
