import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarHistoricoAction, type HistoricoLinha } from "@/lib/actions/emporio-historico";
import { ACOES_DO_HISTORICO } from "@/lib/emporio/historico";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";

const CAMPO =
  "flex min-h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-1 text-base shadow-sm sm:h-9 sm:min-h-0 sm:text-sm";

type Params = {
  user_id?: string;
  establishment_id?: string;
  de?: string;
  ate?: string;
  action?: string;
  cursor?: string;
};

/** Grupos do seletor de ação: a área é a parte da chave antes do ponto. */
const AREAS: Record<string, string> = {
  estabelecimento: "Estabelecimentos",
  vinculos: "Estabelecimentos",
  produto: "Produtos",
  apresentacao: "Produtos",
  preco: "Produtos",
  compra: "Compras",
  estoque: "Estoque",
  transferencia: "Transferências",
  producao: "Produção",
  venda: "Vendas",
  fiado: "Vendas",
  caixa: "Caixa",
  cheque: "Caixa",
  cartao: "Caixa",
  conta_bancaria: "Caixa",
  despesa: "Despesas",
  primeiros_passos: "Outros",
  equipe: "Equipe",
};

function gruposDeAcoes(): { area: string; acoes: { chave: string; rotulo: string }[] }[] {
  const mapa = new Map<string, { chave: string; rotulo: string }[]>();
  for (const [chave, rotulo] of Object.entries(ACOES_DO_HISTORICO)) {
    const area = AREAS[chave.split(".")[0]] ?? "Outros";
    mapa.set(area, [...(mapa.get(area) ?? []), { chave, rotulo }]);
  }
  return [...mapa].map(([area, acoes]) => ({ area, acoes }));
}

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function valorEmTexto(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Histórico do Empório (F6b, Q134): quem fez o quê, do mais novo para o mais
 * antigo. Dono e Gerente geral veem tudo; o Gestor, as lojas dele. Para o
 * Vendedor a action recusa e a página some (404).
 */
export default async function HistoricoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireFeaturePage("emporio");
  const p = await searchParams;
  const db = await getTenantDb();

  const res = await listarHistoricoAction(db, user, {
    user_id: p.user_id,
    establishment_id: p.establishment_id,
    de: p.de,
    ate: p.ate,
    action: p.action,
    cursor: p.cursor,
  });
  if (!res.ok && res.status === 403) notFound();

  const [lojasRes, pessoas] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const grupos = gruposDeAcoes();

  const filtros = new URLSearchParams();
  for (const k of ["user_id", "establishment_id", "de", "ate", "action"] as const) {
    if (p[k]) filtros.set(k, p[k]);
  }
  const filtrando = filtros.size > 0;
  const linkMaisAntigos = (cursor: string) => {
    const q = new URLSearchParams(filtros);
    q.set("cursor", cursor);
    return `/emporio/historico?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Histórico</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Tudo o que foi feito no Empório, do mais novo para o mais antigo.
        </p>
      </header>

      <form method="get" action="/emporio/historico" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="hist-user">Pessoa</Label>
          <select id="hist-user" name="user_id" defaultValue={p.user_id ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {pessoas.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hist-loja">Loja</Label>
          <select id="hist-loja" name="establishment_id" defaultValue={p.establishment_id ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hist-action">Tipo de ação</Label>
          <select id="hist-action" name="action" defaultValue={p.action ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {grupos.map((g) => (
              <optgroup key={g.area} label={g.area}>
                {g.acoes.map((a) => (
                  <option key={a.chave} value={a.chave}>
                    {a.rotulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hist-de">De</Label>
          <Input id="hist-de" type="date" name="de" defaultValue={p.de ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hist-ate">Até</Label>
          <Input id="hist-ate" type="date" name="ate" defaultValue={p.ate ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          {filtrando && (
            <Button asChild variant="ghost">
              <Link href="/emporio/historico">Limpar</Link>
            </Button>
          )}
        </div>
      </form>

      {!res.ok ? (
        <EmptyState titulo="Não foi possível carregar o histórico">{res.message}</EmptyState>
      ) : res.data.items.length === 0 ? (
        <EmptyState titulo="Nada registrado com esses filtros.">
          {filtrando ? "Tente ampliar o período ou tirar algum filtro." : "As ações feitas no Empório aparecem aqui."}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {res.data.items.map((l) => (
              <LinhaDoHistorico key={l.id} l={l} />
            ))}
          </ul>
          {res.data.next_cursor && (
            <div>
              <Button asChild variant="outline">
                <Link href={linkMaisAntigos(res.data.next_cursor)}>Ver mais antigos</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LinhaDoHistorico({ l }: { l: HistoricoLinha }) {
  const quando = formatoDataHora.format(new Date(l.created_at));
  return (
    <li className="space-y-1 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-secundario">
        <time dateTime={l.created_at}>{quando}</time>
        <span>{l.user_name ?? "Alguém"}</span>
        {l.establishment_name && <span>{l.establishment_name}</span>}
      </div>
      <p className="text-sm text-texto">
        {l.summary}
        {l.link && (
          <>
            {" "}
            <Link href={l.link} className="font-medium text-texto-marca hover:underline">
              ver
            </Link>
          </>
        )}
      </p>
      {l.changes && l.changes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-texto-secundario">O que mudou</summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-texto">
            {l.changes.map((c, i) => (
              <li key={i}>
                {c.campo}: {valorEmTexto(c.antes)} → {valorEmTexto(c.depois)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
