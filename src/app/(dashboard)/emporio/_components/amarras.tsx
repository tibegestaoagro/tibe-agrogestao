import Link from "next/link";
import { cn } from "@/lib/utils";
import { numeroDaVenda } from "./formato";

const LINK = "font-medium text-texto-marca hover:underline";

/**
 * O nome do cliente como link para a ficha (frente A). Sem id, ou com o cliente padrão
 * ("Consumidor final", cuja ficha não diz nada), fica texto. `padraoId` vem da página server
 * (`idDoClientePadrao`); client component que recebe a lista a repassa por prop.
 */
export function NomeDoCliente({
  id,
  nome,
  padraoId,
  className,
}: {
  id: string | null | undefined;
  nome: string | null | undefined;
  padraoId?: string | null;
  className?: string;
}) {
  if (!nome) return <>-</>;
  if (!id || id === padraoId) return <>{nome}</>;
  return (
    <Link href={`/emporio/clientes/${id}`} className={cn(LINK, className)}>
      {nome}
    </Link>
  );
}

/** O nome do fornecedor como link para a ficha, quando a conta tem fornecedor cadastrado. */
export function NomeDoFornecedor({
  id,
  nome,
  className,
}: {
  id: string | null | undefined;
  nome: string | null | undefined;
  className?: string;
}) {
  if (!nome) return <>-</>;
  if (!id) return <>{nome}</>;
  return (
    <Link href={`/emporio/fornecedores/${id}`} className={cn(LINK, className)}>
      {nome}
    </Link>
  );
}

/** "Venda nº 000123" (ou "Venda nº 000123 (2/3)" com `parcela`) como link para a venda. */
export function VendaLink({
  id,
  numero,
  parcela,
  className,
  minusculo = false,
}: {
  id: string | null | undefined;
  numero: number | null | undefined;
  /** "2/3": a parcela do cartão. */
  parcela?: string;
  className?: string;
  /** "venda nº" no meio de uma frase. */
  minusculo?: boolean;
}) {
  if (!id || numero === null || numero === undefined) return null;
  const texto = `${minusculo ? "venda" : "Venda"} nº ${numeroDaVenda(numero)}${parcela ? ` (${parcela})` : ""}`;
  return (
    <Link href={`/emporio/vendas/${id}`} className={cn(LINK, className)}>
      {texto}
    </Link>
  );
}
