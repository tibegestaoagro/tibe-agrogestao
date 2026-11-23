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
import { creditoDaDevolucaoCent } from "@/lib/emporio/rateio-impresso";
import { MOTIVO_PERDA_ROTULO, numeroBr } from "./formato";

/**
 * Escolha dos itens devolvidos, usada na devolução e na troca. Só campos: o
 * envio é de quem usa. A quantidade aceita vírgula e o motivo de perda vem da
 * lista fixa do estoque (mesma de `MOTIVOS_DE_PERDA`).
 */

export type ItemDevolvivel = {
  id: string;
  product_name: string;
  presentation_name: string;
  /** O preço unitário, antes do desconto no total: só informa. Quem manda no valor a devolver é `total_cent`. */
  unit_price: number;
  returnable_qty: number;
  /** O que o item pagou de fato (`total`, já com o desconto no total), em centavos. */
  total_cent: number;
  /** A quantidade vendida do item. */
  sold_qty: number;
  /** O que as devoluções anteriores já reembolsaram do item, com a mesma conta do servidor, em centavos. */
  ja_reembolsado_cent: number;
  /** Q379: a parte do crédito do franqueado que cabe no item (rateio do papel), em centavos. 0 sem crédito. */
  parte_credito_cent: number;
  /** A quantidade que as devoluções anteriores já levaram do item. */
  devolvida_qty: number;
};

const arred3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * O valor a devolver de uma quantidade do item (Escolha 7): proporcional ao que ele PAGOU, não quantidade vezes
 * preço (com desconto no total, isso devolveria a mais). Na última fração, o que sobra fecha a conta, como no
 * servidor.
 */
export function valorDevolvidoCent(i: ItemDevolvivel, quantidade: number): number {
  const q = arred3(quantidade);
  if (q === arred3(i.returnable_qty)) return Math.max(0, i.total_cent - i.ja_reembolsado_cent);
  return Math.round((i.total_cent * q) / i.sold_qty);
}

const VOLTA = "__volta__";

export type EscolhaDevolucao = { qtds: Record<string, string>; avarias: Record<string, string> };

export type DevolvidosMontados =
  | {
      ok: true;
      itens: { sale_item_id: string; quantity: number; loss_reason: string | null }[];
      /** O valor dos itens. O cliente recebe `totalCent + creditoCent`. */
      totalCent: number;
      /** Q379: a parte do crédito do franqueado que volta junto, pela mesma conta do servidor. */
      creditoCent: number;
    }
  | { ok: false; erro: string };

/** Lê a escolha da tela e confere o que dá para conferir sem o servidor. */
export function montarDevolvidos(itens: ItemDevolvivel[], escolha: EscolhaDevolucao): DevolvidosMontados {
  const saida: { sale_item_id: string; quantity: number; loss_reason: string | null }[] = [];
  let total = 0;
  let credito = 0;
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
    total += valorDevolvidoCent(i, q);
    credito += creditoDaDevolucaoCent(i.parte_credito_cent, i.sold_qty, i.devolvida_qty, q);
  }
  if (saida.length === 0) return { ok: false, erro: "Informe a quantidade de ao menos um item." };
  return { ok: true, itens: saida, totalCent: total, creditoCent: credito };
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
                Pode devolver {numeroBr(i.returnable_qty)} (o item foi pago {reaisBr(i.total_cent / 100)})
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
