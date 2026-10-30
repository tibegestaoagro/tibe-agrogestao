import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarContasAction, listarRegrasCartaoAction, lerCaixaAction } from "@/lib/actions/emporio-caixa";
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
import { ChequeAcoes } from "../_components/cheque-acoes";
import { ConferirGavetaForm } from "../_components/conferir-gaveta-form";
import { RegraCartaoForm } from "../_components/regra-cartao-form";
import { RegraCartaoRemover } from "../_components/regra-cartao-remover";
import { TransferirCaixaForm, type PontaOpcao } from "../_components/transferir-caixa-form";
import { pctBr } from "../_components/formato";
import { CARTAO_ROTULO, CHEQUE_SITUACAO_ROTULO, ORIGEM_CAIXA_ROTULO } from "../_components/venda-rotulos";

/** Data de calendário "AAAA-MM-DD" como "DD/MM/AAAA", sem passar por fuso. */
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function CaixaPage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  // F6b: cada botão decide pelo papel do Empório, a mesma regra que o servidor aplica.
  const papel = await papelDoEmporio(db, user);
  const ehConta = pode(papel, "conta");
  const ehGestor = pode(papel, "gestor_da_loja");
  const podeEscrever = pode(papel, "vendedor_da_loja");

  const [caixaRes, contasRes, regrasRes, contasDoBanco, implantados] = await Promise.all([
    lerCaixaAction(db, user),
    ehGestor ? listarContasAction(db, user, { incluir_arquivadas: true }) : Promise.resolve(null),
    ehGestor ? listarRegrasCartaoAction(db, user) : Promise.resolve(null),
    // Depositar cheque e levar a gaveta ao banco são do Vendedor com a chave, que não lista contas
    // pela action (é do Gestor para cima): aqui só id e nome, para escolher o destino.
    db.bankAccount.findMany({
      where: { archived_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.cashMovement.findMany({
      where: { origin: "implantacao" },
      select: { establishment_id: true, bank_account_id: true },
    }),
  ]);
  const caixa = caixaRes.ok
    ? caixaRes.data
    : { drawers: [], accounts: [], card_receivables: [], checks: [], movements: [] };
  const regras = regrasRes && regrasRes.ok ? regrasRes.data : [];
  const lojasDasRegras = caixa.drawers
    .filter((d) => pode(papel, "gestor_da_loja", d.establishment_id))
    .map((d) => ({ id: d.establishment_id, name: d.name }));
  const aReceberDaConta = new Map(caixa.accounts.map((a) => [a.bank_account_id, a.to_receive]));
  const totalAReceber = caixa.card_receivables.reduce((s, p) => s + Math.round(p.net_amount * 100), 0) / 100;
  const nomeDaLojaCheque = (id: string) => caixa.drawers.find((d) => d.establishment_id === id)?.name ?? "Loja";

  const origens: PontaOpcao[] = [
    ...caixa.drawers
      .filter((d) => pode(papel, "chave:transferir_caixa", d.establishment_id))
      .map((d) => ({
        valor: `loja:${d.establishment_id}`,
        rotulo: `Gaveta: ${d.name} (${reaisBr(d.balance)})`,
      })),
    ...(ehConta
      ? caixa.accounts.map((a) => ({ valor: `conta:${a.bank_account_id}`, rotulo: `Conta: ${a.name} (${reaisBr(a.balance)})` }))
      : []),
  ];
  const destinos: PontaOpcao[] = [
    ...caixa.drawers.map((d) => ({ valor: `loja:${d.establishment_id}`, rotulo: `Gaveta: ${d.name}` })),
    ...contasDoBanco.map((c) => ({ valor: `conta:${c.id}`, rotulo: `Conta: ${c.name}` })),
  ];
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
                  {d.last_count && (
                    <p className="text-sm text-texto-secundario">
                      Última conferência: {DATA_HORA.format(new Date(d.last_count.counted_at))}
                    </p>
                  )}
                  {ehGestor && (
                    <p className="text-sm text-texto-secundario">
                      Conta PIX: {pix ? pix.name : "nenhuma definida"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {podeEscrever && !lojaComSaldoInicial.has(d.establishment_id) && (
                      <SaldoInicialForm tipo="loja" destinoId={d.establishment_id} destinoNome={d.name} />
                    )}
                    {pode(papel, "gestor_da_loja", d.establishment_id) && contasAtivas.length > 0 && (
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

      {ehGestor && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-texto">Contas bancárias</h2>
            {ehConta && <ContaForm />}
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
                  <TableHead>A receber do cartão</TableHead>
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
                    <TableCell>{reaisBr(aReceberDaConta.get(c.id) ?? 0)}</TableCell>
                    <TableCell className="text-sm">
                      {c.pix_establishment_ids.length === 0
                        ? "-"
                        : c.pix_establishment_ids.map((id) => nomeDaLoja.get(id) ?? "Loja").join(", ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {ehConta && !c.archived_at && !contaComSaldoInicial.has(c.id) && (
                          <SaldoInicialForm tipo="conta" destinoId={c.id} destinoNome={c.name} />
                        )}
                        {ehConta && <ContaArquivarBotao contaId={c.id} arquivada={!!c.archived_at} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {ehGestor && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">A receber do cartão</h2>
          {caixa.card_receivables.length === 0 ? (
            <EmptyState titulo="Nada a receber do cartão">
              As parcelas das vendas no cartão que ainda não caíram aparecem aqui, por data.
            </EmptyState>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cai em</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Venda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {caixa.card_receivables.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{dataBr(p.expected_on)}</TableCell>
                      <TableCell>{p.bank_account_name}</TableCell>
                      <TableCell>
                        {p.installment}/{p.installments}
                      </TableCell>
                      <TableCell>{reaisBr(p.net_amount)}</TableCell>
                      <TableCell>
                        <Link href={`/emporio/vendas/${p.sale_id}`} className="font-medium text-texto-marca hover:underline">
                          Ver a venda
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-texto">
                Total a receber: <strong>{reaisBr(totalAReceber)}</strong>
              </p>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Cheques</h2>
        {caixa.checks.length === 0 ? (
          <EmptyState titulo="Nenhum cheque na carteira">
            Os cheques recebidos e ainda não compensados aparecem aqui.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cheque</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Bom para</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caixa.checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-texto">
                    nº {c.number}
                    <span className="block text-xs font-normal text-texto-secundario">
                      {c.bank}, {nomeDaLojaCheque(c.establishment_id)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.contact_name}
                    <Link href={`/emporio/vendas/${c.sale_id}`} className="block text-xs font-medium text-texto-marca hover:underline">
                      Ver a venda
                    </Link>
                  </TableCell>
                  <TableCell>{dataBr(c.good_for)}</TableCell>
                  <TableCell>{reaisBr(c.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "depositado" ? "blue" : "amber"}>
                      {CHEQUE_SITUACAO_ROTULO[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ChequeAcoes
                      chequeId={c.id}
                      numero={c.number}
                      situacao={c.status}
                      contas={contasDoBanco}
                      podeDepositar={pode(papel, "chave:depositar_cheque", c.establishment_id)}
                      ehAdmin={pode(papel, "gestor_da_loja", c.establishment_id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {podeEscrever && origens.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-texto">Transferir entre caixas</h2>
            <TransferirCaixaForm origens={origens} destinos={destinos} />
          </div>
          <p className="text-sm text-texto-secundario">
            Leve o dinheiro da gaveta ao banco, ou de uma loja para outra. Não vira receita nem despesa.
          </p>
        </section>
      )}

      {podeEscrever && caixa.drawers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Conferir gaveta</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {caixa.drawers.map((d) => (
              <div key={d.establishment_id} className="space-y-2 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-texto">{d.name}</h3>
                    <p className="text-sm text-texto-secundario">Esperado: {reaisBr(d.balance)}</p>
                  </div>
                  <ConferirGavetaForm
                    lojaId={d.establishment_id}
                    lojaNome={d.name}
                    esperadoCent={Math.round(d.balance * 100)}
                  />
                </div>
                {d.last_count ? (
                  <p className="text-sm text-texto-secundario">
                    Última conferência, {DATA_HORA.format(new Date(d.last_count.counted_at))}: contado{" "}
                    {reaisBr(d.last_count.counted)}
                    {d.last_count.difference === 0
                      ? ", bateu."
                      : `, ${d.last_count.difference > 0 ? "sobra" : "falta"} de ${reaisBr(Math.abs(d.last_count.difference))}${d.last_count.justification ? ` (${d.last_count.justification})` : ""}.`}
                  </p>
                ) : (
                  <p className="text-sm text-texto-secundario">Nunca conferida.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {ehGestor && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-texto">Taxas de cartão</h2>
            {lojasDasRegras.length > 0 && contasAtivas.length > 0 && (
              <RegraCartaoForm
                lojas={lojasDasRegras}
                contas={contasAtivas.map((c) => ({ id: c.id, name: c.name }))}
              />
            )}
          </div>
          {contasAtivas.length === 0 && (
            <p className="text-sm text-texto-secundario">Cadastre uma conta bancária para poder definir as taxas.</p>
          )}
          {regras.length === 0 ? (
            <EmptyState titulo="Nenhuma taxa cadastrada">
              Sem a taxa da loja para a forma, o balcão não deixa vender no cartão.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regras.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-texto">{r.establishment_name}</TableCell>
                    <TableCell>{CARTAO_ROTULO[r.kind] ?? r.kind}</TableCell>
                    <TableCell>{pctBr(r.fee_pct)}</TableCell>
                    <TableCell>{r.days} dias</TableCell>
                    <TableCell>{r.bank_account_name ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <RegraCartaoForm
                          lojas={lojasDasRegras}
                          contas={contasAtivas.map((c) => ({ id: c.id, name: c.name }))}
                          regra={r}
                        />
                        <RegraCartaoRemover
                          regraId={r.id}
                          descricao={`${r.establishment_name}, ${(CARTAO_ROTULO[r.kind] ?? r.kind).toLowerCase()}`}
                        />
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
