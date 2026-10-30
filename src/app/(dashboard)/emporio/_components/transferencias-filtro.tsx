"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const TODAS = "__todas__";

const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: "em_transito", rotulo: "Em trânsito" },
  { valor: "aguardando_gestor", rotulo: "Aguardando o Gestor" },
  { valor: "recebida", rotulo: "Recebida" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

/** Filtro da lista de transferências: vive na URL, e a página server relê. */
export function TransferenciasFiltro({
  lojas,
  loja,
  situacao,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  situacao: string;
}) {
  const router = useRouter();

  function ir(novaLoja: string, novaSituacao: string) {
    const q = new URLSearchParams();
    if (novaLoja) q.set("loja", novaLoja);
    if (novaSituacao) q.set("situacao", novaSituacao);
    const texto = q.toString();
    router.push(texto ? `/emporio/transferencias?${texto}` : "/emporio/transferencias");
  }

  return (
    <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
      <Select value={loja || TODAS} onValueChange={(v) => ir(v === TODAS ? "" : v, situacao)}>
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

      <Select value={situacao || TODAS} onValueChange={(v) => ir(loja, v === TODAS ? "" : v)}>
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
    </div>
  );
}
