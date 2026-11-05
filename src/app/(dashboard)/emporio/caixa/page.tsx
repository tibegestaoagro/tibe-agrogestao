import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarContasAction, listarRegrasCartaoAction, lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { listarEntregasAction } from "@/lib/actions/emporio-turno";
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
import { ContaForm } from "../_components/conta-form";
import { ContaArquivarBotao } from "../_components/conta-arquivar-botao";
import { PixLojaForm } from "../_components/pix-loja-form";
import { SaldoInicialForm } from "../_components/saldo-inicial-form";
import { ChequeAcoes } from "../_components/cheque-acoes";
import { ConferirGavetaForm } from "../_components/conferir-gaveta-form";
import { AbrirTurnoForm } from "../_components/abrir-turno-form";
import { SangriaForm } from "../_components/sangria-form";
import { EncerrarTurnoForm } from "../_components/encerrar-turno-form";
import { ConfirmarEntregaForm } from "../_components/confirmar-entrega-form";
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

  const [caixaRes, contasRes, regrasRes, contasDoBanco, implantados, comTurno, entregasRes] = await Promise.all([
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
      select: { bank_account_id: true, cash_register_id: true, manager_establishment_id: true },
    }),
    // O saldo inicial de um caixa só vale antes do primeiro turno: quem já teve turno não o recebe.
    ehGestor ? db.cashSession.findMany({ select: { cash_register_id: true }, distinct: ["cash_register_id"] }) : Promise.resolve([]),
    ehGestor ? listarEntregasAction(db, user, { status: "pending" }) : Promise.resolve(null),
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

  // A gaveta não transfere mais: o lugar da loja é a gerência (só o Gestor dela enxerga o saldo).
  const origens: PontaOpcao[] = [
    ...caixa.drawers
      .filter((d) => d.manager_balance !== null && pode(papel, "gestor_da_loja", d.establishment_id))
      .map((d) => ({
        valor: `gerencia:${d.establishment_id}`,
        rotulo: `Com a gerência: ${d.name} (${reaisBr(d.manager_balance ?? 0)})`,
      })),
    ...(ehConta
      ? caixa.accounts.map((a) => ({ valor: `conta:${a.bank_account_id}`, rotulo: `Conta: ${a.name} (${reaisBr(a.balance)})` }))
      : []),
  ];
  const destinos: PontaOpcao[] = [
    ...caixa.drawers
      .filter((d) => d.manager_balance !== null)
      .map((d) => ({ valor: `gerencia:${d.establishment_id}`, rotulo: `Com a gerência: ${d.name}` })),
    ...contasDoBanco.map((c) => ({ valor: `conta:${c.id}`, rotulo: `Conta: ${c.name}` })),
  ];
  const contas = contasRes && contasRes.ok ? contasRes.data : [];
  const contasAtivas = contas.filter((c) => !c.archived_at);

  const caixaComSaldoInicial = new Set(implantados.flatMap((m) => (m.cash_register_id ? [m.cash_register_id] : [])));
  const gerenciaComSaldoInicial = new Set(implantados.flatMap((m) => (m.manager_establishment_id ? [m.manager_establishment_id] : [])));
  const caixaComTurno = new Set(comTurno.map((s) => s.cash_register_id));
  const entregas = (entregasRes && entregasRes.ok ? entregasRes.data : []).filter((e) =>
    pode(papel, "gestor_da_loja", e.establishment_id),
  );
  const contaComSaldoInicial = new Set(implantados.flatMap((m) => (m.bank_account_id ? [m.bank_account_id] : [])));
  const nomeDaLoja = new Map(caixa.drawers.map((d) => [d.establishment_id, d.name]));
  const nomeDoCaixa = new Map(caixa.drawers.flatMap((d) => d.registers.map((r) => [r.id, `${r.nome}, ${d.name}`] as const)));
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
          O saldo é sempre a soma dos movimentos: dinheiro em cada caixa, com a gerência de cada loja e PIX nas contas.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Caixas de cada loja</h2>
        {caixa.drawers.length === 0 ? (
          <EmptyState titulo="Nenhuma loja disponível">
            Cadastre uma loja em Estabelecimentos para ter caixas.
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {caixa.drawers.map((d) => {
              const pix = contaPixDaLoja(d.establishment_id);
              const gestorDaLoja = pode(papel, "gestor_da_loja", d.establishment_id);
              const trabalhaNaLoja = pode(papel, "vendedor_da_loja", d.establishment_id);
              return (
                <div key={d.establishment_id} className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
                  <div>
                    <h3 className="text-base font-semibold text-texto">{d.name}</h3>
                    <p className="text-2xl font-semibold text-texto">{reaisBr(d.balance)}</p>
                    <p className="text-xs text-texto-secundario">Soma dos caixas</p>
                  </div>

                  <ul className="divide-y divide-borda rounded-md border border-borda">
                    {d.registers.map((r) => {
                      const turno = r.turno_aberto;
                      return (
                        <li key={r.id} className="space-y-2 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-texto">
                                {r.nome} <span className="font-normal text-texto-secundario">({reaisBr(r.saldo)})</span>
                              </p>
                              <p className="text-sm text-texto-secundario">
                                {turno
                                  ? `Aberto por ${turno.aberto_por.name} desde ${DATA_HORA.format(new Date(turno.aberto_em))}`
                                  : "Fechado"}
                              </p>
                            </div>
                            <Badge variant={turno ? "green" : "gray"}>{turno ? "Aberto" : "Fechado"}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {trabalhaNaLoja && !turno && (
                              <AbrirTurnoForm caixaId={r.id} caixaNome={r.nome} saldoCent={Math.round(r.saldo * 100)} />
                            )}
                            {trabalhaNaLoja && turno && (
                              <>
                                <SangriaForm
                                  turnoId={turno.id}
                                  caixaId={r.id}
                                  caixaNome={r.nome}
                                  saldoCent={Math.round(r.saldo * 100)}
                                />
                                <ConferirGavetaForm
                                  caixaId={r.id}
                                  caixaNome={r.nome}
                                  esperadoCent={Math.round(r.saldo * 100)}
                                />
                                <EncerrarTurnoForm
                                  turnoId={turno.id}
                                  caixaId={r.id}
                                  caixaNome={r.nome}
                                  esperadoCent={Math.round(r.saldo * 100)}
                                />
                              </>
                            )}
                            {gestorDaLoja && !turno && !caixaComTurno.has(r.id) && !caixaComSaldoInicial.has(r.id) && (
                              <SaldoInicialForm tipo="caixa" destinoId={r.id} destinoNome={`${r.nome}, ${d.name}`} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {d.manager_balance !== null && (
                    <p className="text-sm text-texto">
                      Com a gerência: <strong>{reaisBr(d.manager_balance)}</strong>
                    </p>
                  )}
                  {d.last_count && (
                    <p className="text-sm text-texto-secundario">
                      Última conferência: {DATA_HORA.format(new Date(d.last_count.counted_at))}
                      {d.last_count.difference === 0
                        ? ", bateu."
                        : `, ${d.last_count.difference > 0 ? "sobra" : "falta"} de ${reaisBr(Math.abs(d.last_count.difference))}${d.last_count.justification ? ` (${d.last_count.justification})` : ""}.`}
                    </p>
                  )}
                  {ehGestor && (
                    <p className="text-sm text-texto-secundario">
                      Conta PIX: {pix ? pix.name : "nenhuma definida"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {gestorDaLoja && d.manager_balance !== null && !gerenciaComSaldoInicial.has(d.establishment_id) && (
                      <SaldoInicialForm tipo="gerencia" destinoId={d.establishment_id} destinoNome={`Com a gerência, ${d.name}`} />
                    )}
                    {gestorDaLoja && contasAtivas.length > 0 && (
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
            <h2 className="text-lg font-semibold text-texto">Transferir dinheiro</h2>
            <TransferirCaixaForm origens={origens} destinos={destinos} />
          </div>
          <p className="text-sm text-texto-secundario">
            Leve o dinheiro da gerência ao banco, ou de uma loja para outra. A gaveta chega à gerência pela sangria ou
            pelo malote. Não vira receita nem despesa.
          </p>
        </section>
      )}

      {ehGestor && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Aguardando o gerente</h2>
          {entregas.length === 0 ? (
            <EmptyState titulo="Nenhuma entrega aguardando">
              As sangrias e os malotes dos caixas aparecem aqui até você confirmar o que recebeu.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Feita em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregas.map((e) => {
                  const rotulo = `${e.kind === "malote" ? "Malote" : "Sangria"} do Caixa ${e.register_number}, ${e.establishment_name}`;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium text-texto">
                        {rotulo}
                        {e.notes && <span className="block text-xs font-normal text-texto-secundario">{e.notes}</span>}
                      </TableCell>
                      <TableCell>{reaisBr(e.amount)}</TableCell>
                      <TableCell>{DATA_HORA.format(new Date(e.created_at))}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <ConfirmarEntregaForm
                            entregaId={e.id}
                            descricao={rotulo}
                            valorCent={Math.round(e.amount * 100)}
                          />
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={`/emporio/imprimir/turno/${e.cash_session_id}?formato=a4`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Relatório do turno
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
                const onde = m.cash_register_id
                  ? `Caixa: ${nomeDoCaixa.get(m.cash_register_id) ?? "caixa"}`
                  : m.manager_establishment_id
                    ? `Com a gerência: ${nomeDaLoja.get(m.manager_establishment_id) ?? "loja"}`
                    : m.establishment_id
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
