import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAMPO =
  "flex min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-1 text-base shadow-sm sm:h-9 sm:min-h-0 sm:text-sm";

/**
 * De, até e loja do Relatório de vendas. Formulário GET: a URL é o estado, e a
 * página server relê. Com uma loja só, ela é fixa e o seletor não aparece.
 */
export function RelatoriosFiltro({
  de,
  ate,
  loja,
  lojas,
}: {
  de: string;
  ate: string;
  loja: string;
  lojas: { id: string; name: string }[];
}) {
  return (
    <form method="get" action="/emporio/relatorios" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="rel-de">De</Label>
        <Input id="rel-de" type="date" name="de" defaultValue={de} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rel-ate">Até</Label>
        <Input id="rel-ate" type="date" name="ate" defaultValue={ate} required />
      </div>
      {lojas.length > 1 ? (
        <div className="space-y-1">
          <Label htmlFor="rel-loja">Loja</Label>
          <select id="rel-loja" name="loja" defaultValue={loja} className={CAMPO}>
            <option value="">Todas as minhas lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1">
          <Label>Loja</Label>
          <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-9">{lojas[0]?.name}</p>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Button type="submit" variant="outline">
          Ver relatório
        </Button>
        <Button asChild variant="ghost">
          <Link href="/emporio/relatorios">Mês atual</Link>
        </Button>
      </div>
    </form>
  );
}
