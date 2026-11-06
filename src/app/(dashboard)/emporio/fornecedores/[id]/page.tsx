import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lerFornecedorAction } from "@/lib/actions/emporio-fornecedores";
import { listarComprasAction } from "@/lib/actions/emporio-compras";
import { formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
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
import { FornecedorForm } from "../../_components/fornecedor-form";
import { FornecedorArquivarBotao } from "../_components/fornecedor-arquivar-botao";
import { UNIDADE_BASE_SUFIXO, numeroBr } from "../../_components/formato";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const FORMA: Record<string, string> = {
  a_vista: "À vista",
  a_prazo: "A prazo",
  parcelada: "Parcelada",
};

const SITUACAO: Record<string, { rotulo: string; variante: "amber" | "green" | "gray" }> = {
  pendente: { rotulo: "Pendente", variante: "amber" },
  recebida: { rotulo: "Recebida", variante: "green" },
  cancelada: { rotulo: "Cancelada", variante: "gray" },
};

export default async function FornecedorFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;
  const db = await getTenantDb();
  const res = await lerFornecedorAction(db, user, id);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="space-y-6">
        <Link href="/emporio/fornecedores" className="text-sm text-texto-secundario hover:text-texto">
          Fornecedores
        </Link>
        <EmptyState titulo="Não foi possível abrir o fornecedor">{res.message}</EmptyState>
      </div>
    );
  }
  const f = res.data;
  const papel = await papelDoEmporio(db, user);
  const podeEditar = pode(papel, "chave:lancar_compra") && !f.archived;
  const podeArquivar = pode(papel, "gestor_da_loja");
  // O Caixa não vê compras: a ficha mostra o cadastro e deixa o histórico de fora.
  const veCompras = papel.papel !== "caixa";
  const comprasRes = veCompras ? await listarComprasAction(db, user, { supplier_id: id, limit: 20 }) : null;
  const compras = comprasRes?.ok ? comprasRes.data : [];

  const endereco = [
    [f.address_street, f.address_number].filter(Boolean).join(", "),
    f.address_complement,
    f.address_district,
    [f.city, f.address_state].filter(Boolean).join("/"),
    f.address_zip ? formatarCep(f.address_zip) : null,
  ]
    .filter((p): p is string => !!p)
    .join(" · ");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/emporio/fornecedores" className="text-sm text-texto-secundario hover:text-texto">
            Fornecedores
          </Link>
          <h1 className="break-words text-2xl font-semibold text-texto">{f.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="blue">{f.kind === "propriedade" ? "Propriedade" : "De fora"}</Badge>
            {f.archived && <Badge variant="gray">Arquivado</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEditar && (
            <FornecedorForm
              modo="editar"
              id={f.id}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              }
            />
          )}
          {podeArquivar && <FornecedorArquivarBotao id={f.id} arquivado={f.archived} />}
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-borda p-4 text-sm sm:grid-cols-2" aria-label="Dados">
        {f.kind === "propriedade" ? (
          <p className="sm:col-span-2">
            <span className="block text-xs text-texto-secundario">Compra</span>
            Propriedade do dono: a compra entra só com o custo, sem conta a pagar.
          </p>
        ) : (
          <>
            <p>
              <span className="block text-xs text-texto-secundario">Tipo de pessoa</span>
              {f.person_kind === "pj" ? "Pessoa jurídica" : f.person_kind === "pf" ? "Pessoa física" : "Não informado"}
            </p>
            <p>
              <span className="block text-xs text-texto-secundario">{f.person_kind === "pj" ? "CNPJ" : "CPF"}</span>
              {f.document ? formatarDocumento(f.document) : "-"}
            </p>
            <p>
              <span className="block text-xs text-texto-secundario">Telefone</span>
              {f.phone ?? "-"}
            </p>
            <p>
              <span className="block text-xs text-texto-secundario">Inscrição estadual</span>
              {f.state_registration ?? "-"}
            </p>
            <p className="sm:col-span-2">
              <span className="block text-xs text-texto-secundario">Endereço</span>
              {endereco || "-"}
            </p>
          </>
        )}
        <p className="sm:col-span-2">
          <span className="block text-xs text-texto-secundario">Observação</span>
          {f.notes ?? "-"}
        </p>
      </section>

      {veCompras && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Últimas compras</h2>
          {compras.length === 0 ? (
            <EmptyState titulo="Nenhuma compra ainda">As compras deste fornecedor aparecem aqui.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((c) => {
                  const s = SITUACAO[c.status];
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{DATA.format(new Date(c.purchased_at))}</TableCell>
                      <TableCell className="font-medium text-texto">{c.establishment_name}</TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {c.items
                          .map((i) => {
                            const sufixo = UNIDADE_BASE_SUFIXO[i.base_unit] ?? i.base_unit;
                            return i.presentation_name
                              ? `${numeroBr(i.quantity)} × ${i.presentation_name} de ${i.product_name}`
                              : `${numeroBr(i.quantity)} ${sufixo} de ${i.product_name}`;
                          })
                          .join("; ")}
                      </TableCell>
                      <TableCell>{reaisBr(c.total)}</TableCell>
                      <TableCell>
                        {c.payment_kind ? (FORMA[c.payment_kind] ?? c.payment_kind) : "Só custo (propriedade)"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.variante}>{s.rotulo}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
