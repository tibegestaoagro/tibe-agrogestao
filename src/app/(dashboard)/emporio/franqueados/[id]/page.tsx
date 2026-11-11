import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lerFranqueadoAction } from "@/lib/actions/emporio-franqueados";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { formatarTelefone } from "@/lib/emporio/telefone";
import { dataBr, hojeEmBrasilia } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { FranqueadoForm } from "../_components/franqueado-form";
import { FranqueadoArquivarBotao } from "../_components/franqueado-arquivar-botao";
import { PagarCreditoForm } from "../_components/pagar-credito-form";

export default async function FranqueadoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;
  const db = await getTenantDb();
  const res = await lerFranqueadoAction(db, user, id);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="space-y-6">
        <Link href="/emporio/franqueados" className="text-sm text-texto-secundario hover:text-texto">
          Franqueados
        </Link>
        <EmptyState titulo="Não foi possível abrir o franqueado">{res.message}</EmptyState>
      </div>
    );
  }
  const f = res.data;
  const papel = await papelDoEmporio(db, user);
  const podeEditar = pode(papel, "chave:lancar_compra") && !f.archived_at;
  const podeArquivar = pode(papel, "gestor_da_loja");
  const podePagar = pode(papel, "dinheiro");

  // Como na tela de contas a pagar: a gaveta é da loja, e só o gestor dela paga por ali.
  const podeGaveta = pode(papel, "gestor_da_loja");
  let origens: { valor: string; rotulo: string }[] = [];
  let caixas: ReturnType<typeof paraCaixasDaLoja> = [];
  if (podePagar) {
    const caixaRes = await lerCaixaAction(db, user);
    const caixa = caixaRes.ok ? caixaRes.data : { drawers: [], accounts: [] };
    caixas = podeGaveta ? paraCaixasDaLoja(caixa.drawers.flatMap((d) => d.registers)) : [];
    origens = [
      ...(podeGaveta
        ? caixa.drawers.map((d) => ({ valor: `loja:${d.establishment_id}`, rotulo: `Gaveta: ${d.name} (${reaisBr(d.balance)})` }))
        : []),
      ...caixa.accounts.map((a) => ({ valor: `conta:${a.bank_account_id}`, rotulo: `Conta: ${a.name} (${reaisBr(a.balance)})` })),
    ];
  }

  const origemDoPagamento = (p: (typeof f.statement)[number]) => {
    const de = p.paid_from;
    if (!de) return "-";
    if (de.establishment_name) return `Gaveta: ${de.establishment_name}`;
    if (de.bank_account_name) return `Conta: ${de.bank_account_name}`;
    return "-";
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/emporio/franqueados" className="text-sm text-texto-secundario hover:text-texto">
            Franqueados
          </Link>
          <h1 className="break-words text-2xl font-semibold text-texto">{f.name}</h1>
          {f.archived_at && (
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="gray">Arquivado</Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {podePagar && (
            <PagarCreditoForm
              franqueadoId={f.id}
              saldo={f.balance}
              origens={origens}
              caixas={caixas}
              usuarioId={user.id}
              hoje={hojeEmBrasilia()}
            />
          )}
          {podeEditar && (
            <FranqueadoForm
              modo="editar"
              id={f.id}
              inicial={{ name: f.name, phone: f.phone, document: f.document, notes: f.notes }}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              }
            />
          )}
          {podeArquivar && <FranqueadoArquivarBotao id={f.id} arquivado={!!f.archived_at} />}
        </div>
      </header>

      <section className="rounded-lg border border-borda p-4" aria-label="Saldo">
        <p className="text-xs text-texto-secundario">Crédito a pagar ao franqueado</p>
        <p className={`text-3xl font-semibold ${f.balance < 0 ? "text-perigo-tinta" : "text-texto"}`}>{reaisBr(f.balance)}</p>
        {f.balance < 0 && (
          <p className="mt-1 text-sm text-perigo-tinta">
            O franqueado recebeu a mais do que tinha de crédito (por exemplo, uma venda foi cancelada depois de paga).
          </p>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border border-borda p-4 text-sm sm:grid-cols-2" aria-label="Dados">
        <p>
          <span className="block text-xs text-texto-secundario">Telefone</span>
          {formatarTelefone(f.phone)}
        </p>
        <p>
          <span className="block text-xs text-texto-secundario">CPF/CNPJ</span>
          {f.document ?? "-"}
        </p>
        <p className="sm:col-span-2">
          <span className="block text-xs text-texto-secundario">Observação</span>
          {f.notes ?? "-"}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Extrato</h2>
        {f.statement.length === 0 ? (
          <EmptyState titulo="Nenhum movimento ainda">O crédito das vendas e os pagamentos aparecem aqui.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Movimento</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.statement.map((l) => (
                <TableRow key={l.kind === "credito" ? `c-${l.sale_id}` : `p-${l.payment_id}`}>
                  <TableCell>{dataBr(l.date)}</TableCell>
                  <TableCell>
                    <Badge variant={l.kind === "credito" ? "green" : "blue"}>
                      {l.kind === "credito" ? "Crédito" : "Pagamento"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {l.kind === "credito" ? (
                      <Link href={`/emporio/vendas/${l.sale_id}`} className="text-texto-marca hover:underline">
                        Venda {l.sale_number}
                      </Link>
                    ) : (
                      <>
                        {origemDoPagamento(l)}
                        {l.notes ? `: ${l.notes}` : ""}
                      </>
                    )}
                  </TableCell>
                  <TableCell className={l.kind === "pagamento" ? "text-texto-secundario" : undefined}>
                    {l.kind === "pagamento" ? `- ${reaisBr(l.amount)}` : reaisBr(l.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
