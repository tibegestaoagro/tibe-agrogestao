"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/**
 * Os filtros do §19. A fazenda não está aqui: ela já vem do seletor global da
 * página, e um segundo seletor brigaria com ele.
 *
 * A situação é a mesma palavra da coluna da lista, mas sem o lado do negócio:
 * "A pagar" e "A receber" são o mesmo estado ("em aberto") visto de cada lado.
 */

const ALL = "__all__";

export default function NegotiationFilters({
  contacts,
  tipos,
}: {
  contacts: { id: string; name: string }[];
  tipos: { value: string; label: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParams(mudancas: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor && valor !== ALL) params.set(chave, valor);
      else params.delete(chave);
    }
    router.push(`/negociacoes?${params.toString()}`);
  }

  const periodo = sp.get("periodo") ?? ALL;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={periodo}
        onValueChange={(v) => setParams({ periodo: v, ...(v === "personalizado" ? {} : { de: null, ate: null }) })}
      >
        <SelectTrigger className="w-44" aria-label="Período"><SelectValue placeholder="Período" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Qualquer data</SelectItem>
          <SelectItem value="hoje">Hoje</SelectItem>
          <SelectItem value="semana">Esta semana</SelectItem>
          <SelectItem value="mes">Este mês</SelectItem>
          <SelectItem value="ano">Este ano</SelectItem>
          <SelectItem value="personalizado">Escolher datas</SelectItem>
        </SelectContent>
      </Select>
      {periodo === "personalizado" && (
        <>
          <Input
            type="date"
            aria-label="De"
            className="w-40"
            defaultValue={sp.get("de") ?? ""}
            onChange={(e) => setParams({ de: e.target.value || null })}
          />
          <Input
            type="date"
            aria-label="Até"
            className="w-40"
            defaultValue={sp.get("ate") ?? ""}
            onChange={(e) => setParams({ ate: e.target.value || null })}
          />
        </>
      )}
      <Select value={sp.get("tipo") ?? ALL} onValueChange={(v) => setParams({ tipo: v })}>
        <SelectTrigger className="w-48" aria-label="Tipo de negociação"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os tipos</SelectItem>
          {tipos.map((t) => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {contacts.length > 0 && (
        <Select value={sp.get("contato") ?? ALL} onValueChange={(v) => setParams({ contato: v })}>
          <SelectTrigger className="w-48" aria-label="Contato"><SelectValue placeholder="Contato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os contatos</SelectItem>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={sp.get("situacao") ?? ALL} onValueChange={(v) => setParams({ situacao: v })}>
        <SelectTrigger className="w-52" aria-label="Situação"><SelectValue placeholder="Situação" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as situações</SelectItem>
          <SelectItem value="confirmada">Em aberto</SelectItem>
          <SelectItem value="vencida">Vencida</SelectItem>
          <SelectItem value="parcialmente_paga">Parcialmente paga ou recebida</SelectItem>
          <SelectItem value="paga">Quitada ou recebida</SelectItem>
          <SelectItem value="sem_valor">Sem dinheiro envolvido</SelectItem>
          <SelectItem value="cancelada">Cancelada</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
