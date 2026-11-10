import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import {
  listarContasAPagarAction,
  listarDespesasFixasAction,
  listarRegrasVariaveisAction,
} from "@/lib/actions/emporio-despesas";
import { mesAtualEmBrasilia, textoDoMes } from "@/lib/emporio/mes";
import { ehCriterioAutomatico } from "@/lib/emporio/rateio";
import { normalizar } from "@/lib/emporio/vendeu-pagou";
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
import { ContasAPagar } from "../_components/contas-a-pagar";
import { ContaAvulsaForm } from "../_components/conta-avulsa-form";
import { paraCaixasDaLoja } from "../_components/caixas-da-loja";
import { DespesaFixaAcoes } from "../_components/despesa-fixa-acoes";
import { DespesaFixaForm } from "../_components/despesa-fixa-form";
import { RegraVariavelArquivar } from "../_components/regra-variavel-arquivar";
import { RegraVariavelForm } from "../_components/regra-variavel-form";
import { numeroBr, pctBr } from "../_components/formato";
import { mesBr, opcoesDeMes } from "../_components/meses";
import { FORMA_ROTULO, RATEIO_ROTULO, TIPO_REGRA_ROTULO } from "../_components/venda-rotulos";

/** Hoje em Brasília como "AAAA-MM-DD". */
const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Despesas do Meu Empório (F4a): contas a pagar, despesas fixas e as regras do
 * "Vendeu, Pagou". Só OWNER e ADMIN; quem tem vínculo vê as lojas dele.
 */
export default async function DespesasPage() {
  const user = await requireFeaturePage("emporio");

  const db = await getTenantDb();
  // F6b: as despesas da loja são do Gestor da loja para cima; o Vendedor volta ao início.
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/despesas")) redirect("/emporio");
  // O Financeiro paga só pela conta bancária: a gaveta é da loja.
  const podeGaveta = pode(papel, "gestor_da_loja");
  // Os critérios automáticos da despesa fixa são de quem vê todas as lojas (o servidor recusa os demais).
  const podeAutomatico = papel.lojas === null;
  const [lojasRes, contasRes, fixasRes, regrasRes, caixaRes, produtosDb] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarContasAPagarAction(db, user, { status: "pending" }),
    listarDespesasFixasAction(db, user),
    listarRegrasVariaveisAction(db, user),
    lerCaixaAction(db, user),
    db.emporioProduct.findMany({
      select: {
        id: true,
        archived_at: true,
        product: { select: { name: true } },
        presentations: { where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const contas = contasRes.ok ? contasRes.data : [];
  const fixas = fixasRes.ok ? fixasRes.data : [];
  const regras = regrasRes.ok ? regrasRes.data : [];
  const caixa = caixaRes.ok ? caixaRes.data : { drawers: [], accounts: [] };
  const caixasDaLoja = caixaRes.ok ? paraCaixasDaLoja(caixaRes.data.drawers.flatMap((d) => d.registers)) : [];

  const todosProdutos = produtosDb.map((p) => ({ id: p.id, name: p.product.name, presentations: p.presentations, arquivado: !!p.archived_at }));
  const produtosAtivos = todosProdutos.filter((p) => !p.arquivado).map(({ arquivado: _a, ...p }) => p);
  // Q292: os nomes de apresentação distintos (sem caixa, acento e espaço), com em quantos produtos aparecem.
  const grupos = new Map<string, { grafias: Map<string, number>; produtos: Set<string> }>();
  for (const p of produtosAtivos) {
    for (const a of p.presentations) {
      const chave = normalizar(a.name);
      if (!chave) continue;
      const g = grupos.get(chave) ?? { grafias: new Map<string, number>(), produtos: new Set<string>() };
      const grafia = a.name.trim();
      g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1);
      g.produtos.add(p.id);
      grupos.set(chave, g);
    }
  }
  const nomesDeApresentacao = [...grupos.values()]
    .map((g) => ({
      nome: [...g.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0],
      produtos: g.produtos.size,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeDoProduto = new Map(todosProdutos.map((p) => [p.id, p.name]));
  const nomeDaApresentacao = new Map(todosProdutos.flatMap((p) => p.presentations.map((a) => [a.id, a.name] as const)));

  const origens = [
    ...(podeGaveta
      ? caixa.drawers.map((d) => ({ valor: `loja:${d.establishment_id}`, rotulo: `Gaveta: ${d.name} (${reaisBr(d.balance)})` }))
      : []),
    ...caixa.accounts.map((a) => ({ valor: `conta:${a.bank_account_id}`, rotulo: `Conta: ${a.name} (${reaisBr(a.balance)})` })),
  ];

  const atual = mesAtualEmBrasilia();
  const mesesDeInicio = opcoesDeMes(atual, 3, 11);
  const hoje = hojeEmBrasilia();

  function condicoes(r: (typeof regras)[number]): string {
    const partes: string[] = [];
    if (r.payment_kind) partes.push(`pagando em ${(FORMA_ROTULO[r.payment_kind] ?? r.payment_kind).toLowerCase()}`);
    if (r.emporio_product_id) partes.push(`produto ${nomeDoProduto.get(r.emporio_product_id) ?? "?"}`);
    if (r.presentation_id) partes.push(`apresentação ${nomeDaApresentacao.get(r.presentation_id) ?? "?"}`);
    if (r.presentation_name) partes.push(`Apresentação ${r.presentation_name} (qualquer produto)`);
    return partes.length === 0 ? "Vale para toda venda da loja" : `Só ${partes.join(", ")}`;
  }

  function valorDaRegra(r: (typeof regras)[number]): string {
    if (r.kind === "percentual") return pctBr(r.value);
    if (r.kind === "fixo_por_venda") return `${reaisBr(r.value)} por venda`;
    if (r.kind === "por_unidade") return `${reaisBr(r.value)} por unidade`;
    const embalagem = r.packaging_emporio_product_id ? nomeDoProduto.get(r.packaging_emporio_product_id) : null;
    return `${numeroBr(r.value)} de ${embalagem ?? "embalagem"} por unidade`;
  }

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Despesas</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O que a loja paga: as contas a pagar, as despesas fixas de todo mês e o que sai de cada venda.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Contas a pagar</h2>
          <ContaAvulsaForm lojas={lojas} origens={origens} caixas={caixasDaLoja} usuarioId={user.id} hoje={hoje} />
        </div>
        <p className="text-sm text-texto-secundario">
          Pague por aqui: o pagamento tira o dinheiro da gaveta da loja ou da conta bancária.
        </p>
        {contas.length === 0 ? (
          <EmptyState titulo="Nenhuma conta a pagar">
            Adicione uma conta avulsa. As contas avulsas, do &quot;Vendeu, Pagou&quot;, das despesas fixas, dos fretes e das compras a prazo aparecem aqui até serem pagas.
          </EmptyState>
        ) : (
          <ContasAPagar
            contas={contas}
            origens={origens}
            hoje={hoje}
            caixas={caixasDaLoja}
            usuarioId={user.id}
            podeGaveta={podeGaveta}
            podeAdiarECancelar={pode(papel, "dinheiro")}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Despesas fixas</h2>
          {lojas.length > 0 && (
            <DespesaFixaForm podeAutomatico={podeAutomatico} lojas={lojas} mesesDeInicio={mesesDeInicio} mesAtual={textoDoMes(atual)} />
          )}
        </div>
        <p className="text-sm text-texto-secundario">
          Aluguel, contador, internet: cada uma gera a conta a pagar dos próximos 12 meses, dividida entre as lojas.
        </p>
        {fixas.length === 0 ? (
          <EmptyState titulo="Nenhuma despesa fixa">Cadastre as despesas que se repetem todo mês.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Despesa</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Rateio</TableHead>
                <TableHead>Gerada até</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fixas.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-texto">
                    {d.name}
                    <span className="block text-xs font-normal text-texto-secundario">
                      Vence todo dia {d.due_day}
                      {d.category !== d.name ? `, ${d.category}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>{reaisBr(d.amount)}</TableCell>
                  <TableCell className="text-sm">
                    <span className="block text-xs text-texto-secundario">{RATEIO_ROTULO[d.split_kind]}</span>
                    {d.splits.map((s) => (
                      <span key={s.establishment_id} className="block">
                        {s.establishment_name}: {d.split_kind === "percentual" ? pctBr(s.value) : reaisBr(s.value)}
                      </span>
                    ))}
                    {d.avisos.map((a) => (
                      <span key={a} role="status" className="mt-1 block text-xs text-texto-secundario">
                        {a}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell>
                    {d.generated_until ? mesBr(d.generated_until) : "-"}
                    {d.needs_renewal && !ehCriterioAutomatico(d.split_kind) && (
                      <Badge variant="amber" className="ml-2">
                        Renovar
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <DespesaFixaForm
                        podeAutomatico={podeAutomatico}
                        lojas={lojas}
                        mesesDeInicio={mesesDeInicio}
                        mesAtual={textoDoMes(atual)}
                        despesa={{
                          id: d.id,
                          name: d.name,
                          category: d.category,
                          amount: d.amount,
                          due_day: d.due_day,
                          split_kind: d.split_kind,
                          splits: d.splits.map((s) => ({ establishment_id: s.establishment_id, value: s.value })),
                          base_label: d.base_label,
                          avisos: d.avisos,
                        }}
                      />
                      <DespesaFixaAcoes
                        despesaId={d.id}
                        nome={d.name}
                        podeRenovar={d.needs_renewal && !ehCriterioAutomatico(d.split_kind)}
                        automatica={ehCriterioAutomatico(d.split_kind)}
                        mesAtual={textoDoMes(atual)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-texto">Vendeu, Pagou</h2>
          {lojas.length > 0 && <RegraVariavelForm lojas={lojas} produtos={produtosAtivos} nomesDeApresentacao={nomesDeApresentacao} />}
        </div>
        <p className="text-sm text-texto-secundario">
          O que sai de cada venda: comissão, entrega, sacola. A taxa de cartão já entra sozinha, pela taxa cadastrada no
          Caixa.
        </p>
        {regras.length === 0 ? (
          <EmptyState titulo="Nenhuma regra cadastrada">
            Sem regras, a venda não gera despesa além da taxa de cartão.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Cálculo</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-texto">
                    {r.name}
                    <span className="block text-xs font-normal text-texto-secundario">{condicoes(r)}</span>
                  </TableCell>
                  <TableCell>{r.establishment_name}</TableCell>
                  <TableCell className="text-sm">
                    <span className="block text-xs text-texto-secundario">{TIPO_REGRA_ROTULO[r.kind] ?? r.kind}</span>
                    {valorDaRegra(r)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <RegraVariavelForm lojas={lojas} produtos={produtosAtivos} nomesDeApresentacao={nomesDeApresentacao} regra={r} />
                      <RegraVariavelArquivar regraId={r.id} nome={r.name} />
                    </div>
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
