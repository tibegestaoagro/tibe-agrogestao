import type {
  AReceberPorIdadeView,
  APagarPorVencimentoView,
  PosicaoPorLugarView,
} from "@/lib/actions/emporio-relatorios-financeiro";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const ddmm = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
const ROTULO_DO_LUGAR = { gaveta: "Gaveta", gerencia: "Com a gerência", conta: "Conta" } as const;

/** O período dos relatórios: um formulário de GET. Vazio, cada bloco usa o seu padrão. */
export function RelatoriosPeriodo({ loja, de, ate }: { loja: string; de: string; ate: string }) {
  return (
    <form method="get" className="grid gap-3 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {loja && <input type="hidden" name="loja" value={loja} />}
      <label className="space-y-1 text-sm font-medium text-texto">
        De
        <Input type="date" name="de" defaultValue={de} />
      </label>
      <label className="space-y-1 text-sm font-medium text-texto">
        Até
        <Input type="date" name="ate" defaultValue={ate} />
      </label>
      <Button type="submit" variant="outline">
        Ver relatórios
      </Button>
    </form>
  );
}

const FAIXAS = [
  { chave: "em_dia", rotulo: "Em dia" },
  { chave: "1-15", rotulo: "1 a 15" },
  { chave: "16-30", rotulo: "16 a 30" },
  { chave: "30+", rotulo: "Mais de 30" },
] as const;

export function AReceberPorIdadeBloco({ r }: { r: AReceberPorIdadeView }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">A receber por idade</h2>
      <p className="text-sm text-texto-secundario">Retrato de hoje: quem deve e há quantos dias venceu.</p>
      {r.customers.length === 0 ? (
        <EmptyState titulo="Ninguém deve">Não há fiado nem parcela em aberto.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              {FAIXAS.map((f) => (
                <TableHead key={f.chave}>{f.rotulo}</TableHead>
              ))}
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.customers.map((c) => (
              <TableRow key={c.customer_id}>
                <TableCell>{c.customer_name}</TableCell>
                {FAIXAS.map((f) => (
                  <TableCell key={f.chave} className="whitespace-nowrap">
                    {reaisBr(c[f.chave])}
                  </TableCell>
                ))}
                <TableCell className="whitespace-nowrap font-semibold">{reaisBr(c.total)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              {FAIXAS.map((f) => (
                <TableCell key={f.chave} className="whitespace-nowrap">
                  {reaisBr(r.totals[f.chave])}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap">{reaisBr(r.totals.total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export function APagarPorVencimentoBloco({ r }: { r: APagarPorVencimentoView }) {
  const semConta = r.weeks.every((s) => s.items.length === 0);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">A pagar por vencimento</h2>
      <p className="text-sm text-texto-secundario">
        Contas pendentes que vencem de {ddmm(r.de)} a {ddmm(r.ate)}: {reaisBr(r.total)}
        {r.overdue_total > 0 ? `, das quais ${reaisBr(r.overdue_total)} já venceram` : ""}.
      </p>
      {semConta ? (
        <EmptyState titulo="Nada a pagar no período">Nenhuma conta pendente vence nestas datas.</EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Contas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.weeks.map((s) => (
                <TableRow key={s.de}>
                  <TableCell className="whitespace-nowrap">
                    de {ddmm(s.de)} a {ddmm(s.ate)}{" "}
                    {s.overdue && <Badge variant="red">Vencido</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{reaisBr(s.total)}</TableCell>
                  <TableCell className="text-sm text-texto-secundario">
                    {s.items.length === 0 ? "Nenhuma" : s.items.map((i) => `${i.name} ${reaisBr(i.total)}`).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <h3 className="text-sm font-semibold text-texto">Por nome</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Vencido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.by_name.map((n) => (
                <TableRow key={n.name}>
                  <TableCell>{n.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{reaisBr(n.total)}</TableCell>
                  <TableCell className="whitespace-nowrap">{reaisBr(n.overdue_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  );
}

export function PosicaoPorLugarBloco({ r }: { r: PosicaoPorLugarView }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Posição de caixa por lugar</h2>
      <p className="text-sm text-texto-secundario">
        Saldo de hoje e o que entrou e saiu de {ddmm(r.de)} a {ddmm(r.ate)}. Total em caixa: {reaisBr(r.total_balance)}.
      </p>
      {r.places.length === 0 ? (
        <EmptyState titulo="Nenhum lugar com dinheiro ainda">Gavetas, gerências e contas bancárias aparecem aqui.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lugar</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Entradas</TableHead>
              <TableHead>Saídas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.places.map((p) => (
              <TableRow key={`${p.kind}:${p.id}`}>
                <TableCell>
                  {p.name}
                  <span className="block text-xs text-texto-secundario">{ROTULO_DO_LUGAR[p.kind]}</span>
                  {p.period.by_origin.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-texto-secundario">
                      {p.period.by_origin.map((o) => (
                        <li key={o.origin}>
                          {o.label}: entrou {reaisBr(o.entradas)}, saiu {reaisBr(o.saidas)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top font-semibold">{reaisBr(p.balance)}</TableCell>
                <TableCell className="whitespace-nowrap align-top">{reaisBr(p.period.entradas)}</TableCell>
                <TableCell className="whitespace-nowrap align-top">{reaisBr(p.period.saidas)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
