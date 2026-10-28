"use client";

import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { MOTIVO_PERDA_ROTULO, numeroBr } from "./formato";
import { cent } from "./venda-estado";

/**
 * Escolha dos itens devolvidos, usada na devolução e na troca. Só campos: o
 * envio é de quem usa. A quantidade aceita vírgula e o motivo de perda vem da
 * lista fixa do estoque (mesma de `MOTIVOS_DE_PERDA`).
 */

export type ItemDevolvivel = {
  id: string;
  product_name: string;
  presentation_name: string;
  unit_price: number;
  returnable_qty: number;
};

const VOLTA = "__volta__";

export type EscolhaDevolucao = { qtds: Record<string, string>; avarias: Record<string, string> };

export type DevolvidosMontados =
  | { ok: true; itens: { sale_item_id: string; quantity: number; loss_reason: string | null }[]; totalCent: number }
  | { ok: false; erro: string };

/** Lê a escolha da tela e confere o que dá para conferir sem o servidor. */
export function montarDevolvidos(itens: ItemDevolvivel[], escolha: EscolhaDevolucao): DevolvidosMontados {
  const saida: { sale_item_id: string; quantity: number; loss_reason: string | null }[] = [];
  let total = 0;
  for (const i of itens) {
    const bruto = escolha.qtds[i.id] ?? "";
    if (bruto.trim() === "") continue;
    const q = lerNumeroBr(bruto);
    if (q === null || q <= 0) return { ok: false, erro: `A quantidade de "${i.product_name}" não está certa.` };
    if (q > i.returnable_qty + 1e-9) {
      return {
        ok: false,
        erro: `"${i.product_name}": só dá para devolver ${numeroBr(i.returnable_qty)}.`,
      };
    }
    const motivo = escolha.avarias[i.id];
    saida.push({ sale_item_id: i.id, quantity: q, loss_reason: motivo && motivo !== VOLTA ? motivo : null });
    total += cent(q * i.unit_price);
  }
  if (saida.length === 0) return { ok: false, erro: "Informe a quantidade de ao menos um item." };
  return { ok: true, itens: saida, totalCent: total };
}

export function DevolucaoItens({
  itens,
  escolha,
  aoMudar,
}: {
  itens: ItemDevolvivel[];
  escolha: EscolhaDevolucao;
  aoMudar: (nova: EscolhaDevolucao) => void;
}) {
  return (
    <div className="space-y-3">
      {itens.map((i) => {
        const q = escolha.qtds[i.id] ?? "";
        return (
          <div key={i.id} className="space-y-2 rounded-lg border border-borda p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-medium text-texto">
                {i.product_name} <span className="text-sm font-normal text-texto-secundario">({i.presentation_name})</span>
              </p>
              <p className="text-xs text-texto-secundario">
                Pode devolver {numeroBr(i.returnable_qty)} a {reaisBr(i.unit_price)}
              </p>
            </div>
            <MoneyInput
              kind="quantidade"
              hideEcho
              aria-label={`Quantidade devolvida de ${i.product_name}`}
              placeholder="Quantidade a devolver"
              value={q}
              onValueChange={(valor) => aoMudar({ ...escolha, qtds: { ...escolha.qtds, [i.id]: valor } })}
            />
            {q.trim() !== "" && (
              <Select
                value={escolha.avarias[i.id] || VOLTA}
                onValueChange={(valor) => aoMudar({ ...escolha, avarias: { ...escolha.avarias, [i.id]: valor } })}
              >
                <SelectTrigger aria-label={`Estado do que volta de ${i.product_name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VOLTA}>Volta ao estoque</SelectItem>
                  {Object.entries(MOTIVO_PERDA_ROTULO).map(([chave, rotulo]) => (
                    <SelectItem key={chave} value={chave}>
                      Avariado: {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}
