"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ORIGENS_DA_VENDA, ROTULO_DA_ORIGEM } from "@/lib/emporio/frete";

const TODAS = "__todas__";

const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: "concluida", rotulo: "Concluída" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

/** Filtro da lista de vendas: vive na URL, e a página server relê. */
export function VendasFiltro({
  lojas,
  loja,
  situacao,
  origem,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  situacao: string;
  origem: string;
}) {
  const router = useRouter();

  function ir(novaLoja: string, novaSituacao: string, novaOrigem: string) {
    const q = new URLSearchParams();
    if (novaLoja) q.set("loja", novaLoja);
    if (novaSituacao) q.set("situacao", novaSituacao);
    if (novaOrigem) q.set("origin", novaOrigem);
    const texto = q.toString();
    router.push(texto ? `/emporio/vendas?${texto}` : "/emporio/vendas");
  }

  return (
    <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-3">
      <Select value={loja || TODAS} onValueChange={(v) => ir(v === TODAS ? "" : v, situacao, origem)}>
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

      <Select value={situacao || TODAS} onValueChange={(v) => ir(loja, v === TODAS ? "" : v, origem)}>
        <SelectTrigger aria-label="Filtrar por situação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as situações</SelectItem>
          {SITUACOES.map((s) => (
            <SelectItem key={s.valor} value={s.valor}>
              {s.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={origem || TODAS} onValueChange={(v) => ir(loja, situacao, v === TODAS ? "" : v)}>
        <SelectTrigger aria-label="Filtrar por origem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as origens</SelectItem>
          {ORIGENS_DA_VENDA.map((o) => (
            <SelectItem key={o} value={o}>
              {ROTULO_DA_ORIGEM[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
