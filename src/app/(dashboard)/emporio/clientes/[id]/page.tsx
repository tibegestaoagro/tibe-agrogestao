import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lerClienteAction, type ClienteFichaView } from "@/lib/actions/emporio-clientes";
import { formatarCep, formatarDocumento, formatarTelefone } from "@/lib/contatos/cadastro";
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
import { ClienteForm } from "../../_components/cliente-form";
import { ClienteArquivarBotao } from "../_components/cliente-arquivar-botao";
import { numeroBr } from "../../_components/formato";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

const SITUACAO_VENDA: Record<
  ClienteFichaView["vendas"][number]["situacao"],
  { rotulo: string; variante: "green" | "gray" | "amber" | "blue" }
> = {
  ativa: { rotulo: "Ativa", variante: "green" },
  cancelada: { rotulo: "Cancelada", variante: "gray" },
  trocada: { rotulo: "Trocada", variante: "blue" },
  devolvida: { rotulo: "Devolvida", variante: "amber" },
};

const SITUACAO_ORCAMENTO: Record<
  ClienteFichaView["orcamentos"][number]["situacao"],
  { rotulo: string; variante: "green" | "gray" | "amber" }
> = {
  aberto: { rotulo: "Aberto", variante: "amber" },
  vencido: { rotulo: "Vencido", variante: "gray" },
  faturado: { rotulo: "Faturado", variante: "green" },
};

const FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
  cheque: "Cheque",
  fiado: "Fiado",
  troca: "Troca",
};

function linhaEndereco(
  rua: string | null,
  numero: string | null,
  complemento: string | null,
  bairro: string | null,
  cidade: string | null,
  uf: string | null,
  cep: string | null,
): string | null {
  const partes = [
    [rua, numero].filter(Boolean).join(", "),
    complemento,
    bairro,
    [cidade, uf].filter(Boolean).join("/"),
    cep ? formatarCep(cep) : null,
  ].filter((p): p is string => !!p);
  return partes.length ? partes.join(" · ") : null;
}

export default async function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;
  const db = await getTenantDb();
  const res = await lerClienteAction(db, user, id);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="space-y-6">
        <Link href="/emporio/clientes" className="text-sm text-texto-secundario hover:text-texto">
          Clientes
        </Link>
        <EmptyState titulo="Não foi possível abrir o cliente">{res.message}</EmptyState>
      </div>
    );
  }
  const c = res.data;
  const papel = await papelDoEmporio(db, user);
  const podeArquivar = pode(papel, "gestor_da_loja") && !c.fixed;

  const principal = linhaEndereco(c.address_street, c.address_number, c.address_complement, c.address_district, c.city, c.address_state, c.address_zip);
  const entrega = linhaEndereco(c.delivery_street, c.delivery_number, c.delivery_complement, c.delivery_district, c.delivery_city, c.delivery_state, c.delivery_zip);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/emporio/clientes" className="text-sm text-texto-secundario hover:text-texto">
            Clientes
          </Link>
          <h1 className="break-words text-2xl font-semibold text-texto">{c.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {c.fixed && <Badge variant="blue">Cliente padrão</Badge>}
            {c.incomplete && <Badge variant="amber">Cadastro incompleto</Badge>}
            {c.archived && <Badge variant="gray">Arquivado</Badge>}
          </div>
        </div>
        {!c.fixed && (
          <div className="flex flex-wrap gap-2">
            {/* A action recusa editar o arquivado: o botão só volta depois de desarquivar. */}
            {!c.archived && (
              <ClienteForm
                modo="completar"
                contatoId={c.id}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    Editar
                  </Button>
                }
              />
            )}
            {podeArquivar && <ClienteArquivarBotao id={c.id} arquivado={c.archived} />}
          </div>
        )}
      </header>

      <section className="grid gap-3 rounded-lg border border-borda p-4 text-sm sm:grid-cols-2" aria-label="Dados">
        <p>
          <span className="block text-xs text-texto-secundario">Tipo</span>
          {c.person_kind === "pj" ? "Pessoa jurídica" : c.person_kind === "pf" ? "Pessoa física" : "Não informado"}
        </p>
        <p>
          <span className="block text-xs text-texto-secundario">{c.person_kind === "pj" ? "CNPJ" : "CPF"}</span>
          {c.document ? formatarDocumento(c.document) : "sem CPF/CNPJ"}
        </p>
        <p>
          <span className="block text-xs text-texto-secundario">Telefone</span>
          {c.phone ? formatarTelefone(c.phone) : "-"}
        </p>
        {c.person_kind === "pj" && c.responsible_name && (
          <p>
            <span className="block text-xs text-texto-secundario">Responsável</span>
            {c.responsible_name}
          </p>
        )}
        {c.state_registration && (
          <p>
            <span className="block text-xs text-texto-secundario">Inscrição estadual</span>
            {c.state_registration}
          </p>
        )}
        {c.birth_date && (
          <p>
            <span className="block text-xs text-texto-secundario">Nascimento</span>
            {c.birth_date.split("-").reverse().join("/")}
          </p>
        )}
        <p className="sm:col-span-2">
          <span className="block text-xs text-texto-secundario">Endereço</span>
          {principal ?? "-"}
        </p>
        <p className="sm:col-span-2">
          <span className="block text-xs text-texto-secundario">Endereço de entrega</span>
          {entrega ?? "-"}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo">
        <div className="rounded-lg border border-borda p-4">
          <p className="text-xs text-texto-secundario">Total comprado</p>
          <p className="text-xl font-semibold text-texto">{reaisBr(c.resumo.total_comprado)}</p>
        </div>
        <div className="rounded-lg border border-borda p-4">
          <p className="text-xs text-texto-secundario">Última compra</p>
          <p className="text-xl font-semibold text-texto">
            {c.resumo.ultima_compra_em ? DATA.format(new Date(c.resumo.ultima_compra_em)) : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-borda p-4">
          <p className="text-xs text-texto-secundario">Vendas ativas</p>
          <p className="text-xl font-semibold text-texto">{c.resumo.vendas_ativas}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Vendas</h2>
        {c.vendas.length === 0 ? (
          <EmptyState titulo="Nenhuma venda ainda">As compras deste cliente aparecem aqui.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.vendas.map((v) => {
                const s = SITUACAO_VENDA[v.situacao];
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Link href={`/emporio/vendas/${v.id}`} className="font-medium text-texto-marca hover:underline">
                        {v.numero}
                      </Link>
                    </TableCell>
                    <TableCell>{DATA.format(new Date(v.sold_at))}</TableCell>
                    <TableCell>{v.loja}</TableCell>
                    <TableCell className="text-sm">
                      {v.itens.map((i, n) => (
                        <span key={n} className="block">
                          {numeroBr(i.quantity)} x {i.produto}
                          {i.apresentacao ? ` (${i.apresentacao})` : ""}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell>{reaisBr(v.total)}</TableCell>
                    <TableCell>{v.formas.map((f) => FORMA[f] ?? f).join(", ") || "-"}</TableCell>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Orçamentos</h2>
        {c.orcamentos.length === 0 ? (
          <EmptyState titulo="Nenhum orçamento">Os orçamentos deste cliente aparecem aqui.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orçamento</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.orcamentos.map((q) => {
                const s = SITUACAO_ORCAMENTO[q.situacao];
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link href={`/emporio/orcamentos/${q.id}`} className="font-medium text-texto-marca hover:underline">
                        {q.numero}
                      </Link>
                    </TableCell>
                    <TableCell>{DATA.format(new Date(q.created_at))}</TableCell>
                    <TableCell>{q.loja}</TableCell>
                    <TableCell>{reaisBr(q.valor)}</TableCell>
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
    </div>
  );
}
