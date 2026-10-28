import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { listarContasAction, lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ContaForm } from "../_components/conta-form";
import { ContaArquivarBotao } from "../_components/conta-arquivar-botao";
import { PixLojaForm } from "../_components/pix-loja-form";
import { SaldoInicialForm } from "../_components/saldo-inicial-form";
import { ORIGEM_CAIXA_ROTULO } from "../_components/venda-rotulos";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function CaixaPage() {
  const user = await requireFeaturePage("emporio");
  const podeEscrever = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const [caixaRes, contasRes, implantados] = await Promise.all([
    lerCaixaAction(db, user),
    ehAdmin ? listarContasAction(db, user, { incluir_arquivadas: true }) : Promise.resolve(null),
    db.cashMovement.findMany({
      where: { origin: "implantacao" },
      select: { establishment_id: true, bank_account_id: true },
    }),
  ]);
  const caixa = caixaRes.ok ? caixaRes.data : { drawers: [], accounts: [], movements: [] };
  const contas = contasRes && contasRes.ok ? contasRes.data : [];
  const contasAtivas = contas.filter((c) => !c.archived_at);

  const lojaComSaldoInicial = new Set(implantados.flatMap((m) => (m.establishment_id ? [m.establishment_id] : [])));
  const contaComSaldoInicial = new Set(implantados.flatMap((m) => (m.bank_account_id ? [m.bank_account_id] : [])));
  const nomeDaLoja = new Map(caixa.drawers.map((d) => [d.establishment_id, d.name]));
  const nomeDaConta = new Map(contas.map((c) => [c.id, c.name]));
  const contaPixDaLoja = (lojaId: string) => contas.find((c) => c.pix_establishment_ids.includes(lojaId)) ?? null;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Caixa</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O saldo é sempre a soma dos movimentos: dinheiro na gaveta de cada loja e PIX nas contas.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Gaveta de cada loja</h2>
        {caixa.drawers.length === 0 ? (
          <EmptyState titulo="Nenhuma loja disponível">
            Cadastre uma loja em Estabelecimentos para ter uma gaveta.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {caixa.drawers.map((d) => {
              const pix = contaPixDaLoja(d.establishment_id);
              return (
                <div key={d.establishment_id} className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
                  <div>
                    <h3 className="text-base font-semibold text-texto">{d.name}</h3>
                    <p className="text-2xl font-semibold text-texto">{reaisBr(d.balance)}</p>
                  </div>
                  {ehAdmin && (
                    <p className="text-sm text-texto-secundario">
                      Conta PIX: {pix ? pix.name : "nenhuma definida"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {podeEscrever && !lojaComSaldoInicial.has(d.establishment_id) && (
                      <SaldoInicialForm tipo="loja" destinoId={d.establishment_id} destinoNome={d.name} />
                    )}
                    {ehAdmin && contasAtivas.length > 0 && (
                      <PixLojaForm
                        lojaId={d.establishment_id}
                        lojaNome={d.name}
                        contas={contasAtivas.map((c) => ({ id: c.id, name: c.name }))}
                        atual={pix && !pix.archived_at ? pix.id : null}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {ehAdmin && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-texto">Contas bancárias</h2>
            <ContaForm />
          </div>
          {contas.length === 0 ? (
            <EmptyState titulo="Nenhuma conta cadastrada">
              Cadastre uma conta para receber PIX e defina qual loja usa qual.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>PIX de</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-texto">
                      {c.name}
                      {c.bank && <span className="block text-xs font-normal text-texto-secundario">{c.bank}</span>}
                      {c.archived_at && (
                        <Badge variant="gray" className="mt-1">
                          Arquivada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{reaisBr(c.balance)}</TableCell>
                    <TableCell className="text-sm">
                      {c.pix_establishment_ids.length === 0
                        ? "-"
                        : c.pix_establishment_ids.map((id) => nomeDaLoja.get(id) ?? "Loja").join(", ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {!c.archived_at && !contaComSaldoInicial.has(c.id) && (
                          <SaldoInicialForm tipo="conta" destinoId={c.id} destinoNome={c.name} />
                        )}
                        <ContaArquivarBotao contaId={c.id} arquivada={!!c.archived_at} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Movimentos</h2>
        {caixa.movements.length === 0 ? (
          <EmptyState titulo="Nenhum movimento ainda">
            Vendas, recebimentos de fiado e devoluções aparecem aqui.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Onde</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caixa.movements.map((m) => {
                const onde = m.establishment_id
                  ? `Gaveta: ${nomeDaLoja.get(m.establishment_id) ?? "loja"}`
                  : m.bank_account_id
                    ? `Conta: ${nomeDaConta.get(m.bank_account_id) ?? "conta"}`
                    : "-";
                const entrada = m.direction === "entrada";
                return (
                  <TableRow key={m.id}>
                    <TableCell>{DATA_HORA.format(new Date(m.occurred_at))}</TableCell>
                    <TableCell>{onde}</TableCell>
                    <TableCell>
                      {m.sale_id ? (
                        <Link href={`/emporio/vendas/${m.sale_id}`} className="font-medium text-texto-marca hover:underline">
                          {ORIGEM_CAIXA_ROTULO[m.origin] ?? m.origin}
                        </Link>
                      ) : (
                        (ORIGEM_CAIXA_ROTULO[m.origin] ?? m.origin)
                      )}
                    </TableCell>
                    <TableCell className={entrada ? "text-sucesso-tinta" : "text-perigo-tinta"}>
                      {entrada ? "+" : "-"} {reaisBr(m.amount)}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">{m.notes ?? "-"}</TableCell>
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
