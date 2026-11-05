"use client";

import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { rotuloDoCaixaAberto, type CaixaDaLoja } from "./caixas-da-loja";

/**
 * O controle do campo "Caixa" dos painéis que mexem em dinheiro. O `<Field>`
 * fica no painel (o `id` é o nome do campo na API, `cash_register_id`); aqui
 * só o miolo. Com um caixa aberto o servidor resolve sozinho, então o painel
 * só mostra o campo com mais de um aberto, com nenhum (aviso e atalho para o
 * Caixa) ou quando o servidor acabou de recusar.
 */
export function CaixaDaOperacao({
  id,
  aria,
  abertos,
  valor,
  aoMudar,
}: {
  id: string;
  aria: Record<string, string | boolean | undefined>;
  abertos: CaixaDaLoja[];
  valor: string;
  aoMudar: (v: string) => void;
}) {
  if (abertos.length === 0) {
    return (
      <p id={id} tabIndex={-1} {...aria} className="text-sm text-texto-secundario">
        Nenhum caixa aberto nesta loja.{" "}
        <Link href="/emporio/caixa" className="font-medium text-texto-marca hover:underline">
          Abrir o caixa
        </Link>
      </p>
    );
  }
  return (
    <Select value={valor} onValueChange={aoMudar}>
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Escolha o caixa" />
      </SelectTrigger>
      <SelectContent>
        {abertos.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {rotuloDoCaixaAberto(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
