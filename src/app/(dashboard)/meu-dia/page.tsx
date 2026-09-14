import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfiles, getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import { Badge } from "@/components/ui/badge";
import TaskForm from "@/components/meu-dia/task-form";
import TaskActions from "@/components/meu-dia/task-actions";
import {
  classificar,
  lerItensDoDia,
  resumoDaFazenda,
  type ItemDoDia,
} from "@/lib/actions/meu-dia";
import { reaisBr } from "@/lib/numero-br";

/**
 * Meu Dia (Módulo 38): "o produtor não procura o que precisa fazer; o TIBÉ
 * mostra o que merece sua atenção" (§3).
 *
 * ⚠️ **A regra de ouro (§62) decide o que entra aqui:** isso exige atenção ou
 * ação do produtor AGORA? Se não, não ocupa a tela. É ela que impede o Meu Dia
 * de virar o feed do §51 ou o painel de ERP do §52: sem gráfico, sem
 * indicador técnico, sem tabela extensa. Gráfico mora no `/dashboard`.
 */

/**
 * A saudação pela hora de SÃO PAULO, e não a do servidor.
 *
 * O `/dashboard` usa `new Date().getHours()`, que na Vercel é UTC: às 9h da
 * manhã na fazenda o servidor marca meio-dia, e o produtor lê "Boa tarde"
 * antes do café. Aqui a hora vem do fuso da fazenda.
 */
function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(agora),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** "amanhã", "quinta", "dia 22": como o produtor fala do dia, e não "2026-09-22". */
function quando(item: ItemDoDia): string | null {
  if (item.dias === null || item.data === null) return null;
  if (item.dias === 1) return "amanhã";
  if (item.dias > 1 && item.dias < 7) return DIA_DA_SEMANA.format(item.data);
  if (item.dias >= 7) return `dia ${DATA_CURTA.format(item.data)}`;
  return null;
}

function atraso(item: ItemDoDia): string | null {
  if (item.dias === null || item.dias >= 0) return null;
  const n = Math.abs(item.dias);
  if (item.origem === "tarefa") return n === 1 ? "atrasada desde ontem" : `atrasada há ${n} dias`;
  return n === 1 ? "venceu ontem" : `vencida há ${n} dias`;
}

function LinhaDoDia({ item, podeEscrever }: { item: ItemDoDia; podeEscrever: boolean }) {
  const detalhes = [item.horario, quando(item), item.fazenda].filter(Boolean).join(" · ");
  const vencido = atraso(item);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.task_id ? (
            <p className="font-medium text-texto">{item.titulo}</p>
          ) : (
            <Link href={item.href} className="font-medium text-texto hover:underline">
              {item.titulo}
            </Link>
          )}
          {item.urgente && item.origem === "tarefa" && <Badge variant="red">Urgente</Badge>}
          {vencido && <Badge variant="amber">{vencido}</Badge>}
        </div>
        {(detalhes || item.valor !== null) && (
          <p className="text-sm text-texto-secundario">
            {[item.valor !== null ? reaisBr(item.valor) : null, detalhes || null].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {item.task_id && podeEscrever && (
        <TaskActions taskId={item.task_id} temData={item.dias !== null} />
      )}
    </li>
  );
}

function Secao({
  titulo,
  itens,
  vazio,
  podeEscrever,
}: {
  titulo: string;
  itens: ItemDoDia[];
  vazio?: string;
  podeEscrever: boolean;
}) {
  /* Seção vazia some, a não ser que diga algo útil: "nada atrasado" é notícia,
     uma caixa vazia de Próximos dias não é (§62). */
  if (itens.length === 0 && !vazio) return null;

  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-sm text-texto-discreto">{vazio}</p>
      ) : (
        <ul className="mt-1 divide-y divide-borda">
          {itens.map((item) => (
            <LinhaDoDia key={item.chave} item={item} podeEscrever={podeEscrever} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MeuDiaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const podeEscrever = canWrite(user.role, "tarefas");
  const db = await getTenantDb();
  const profiles = await getActiveProfiles();
  const temFazenda = profiles.includes("fazenda");
  const propertyId = temFazenda ? await getActivePropertyId(db) : null;

  const [itens, resumo, workers, properties] = await Promise.all([
    lerItensDoDia(db, { property_id: propertyId }),
    resumoDaFazenda(db, { property_id: propertyId, temFazenda }),
    db.worker.findMany({ where: { status: "ativo" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.property.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const dia = classificar(itens);
  const primeiroNome = user.name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-texto">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}.
        </h1>
        {podeEscrever && <TaskForm workers={workers} properties={properties} />}
      </div>

      <Secao titulo="Atenção" itens={dia.atencao} podeEscrever={podeEscrever} />
      <Secao
        titulo="Hoje"
        itens={dia.hoje}
        vazio="Nada marcado para hoje."
        podeEscrever={podeEscrever}
      />
      <Secao titulo="Próximos dias" itens={dia.proximos} podeEscrever={podeEscrever} />
      <Secao titulo="Sem data" itens={dia.semData} podeEscrever={podeEscrever} />

      <section className="rounded-lg border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">Sua fazenda</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {resumo.rebanhoProprio !== null && (
            <div>
              <dt className="text-texto-secundario">Rebanho próprio</dt>
              <dd className="font-medium text-texto">{resumo.rebanhoProprio} animais</dd>
            </div>
          )}
          <div>
            <dt className="text-texto-secundario">A receber</dt>
            <dd className="font-medium text-texto">{reaisBr(resumo.aReceber)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">A pagar</dt>
            <dd className="font-medium text-texto">{reaisBr(resumo.aPagar)}</dd>
          </div>
          {resumo.leiteHoje !== null && (
            <div>
              <dt className="text-texto-secundario">Leite hoje</dt>
              <dd className="font-medium text-texto">{resumo.leiteHoje.toLocaleString("pt-BR")} litros</dd>
            </div>
          )}
          {resumo.confinados !== null && (
            <div>
              <dt className="text-texto-secundario">Confinados</dt>
              <dd className="font-medium text-texto">{resumo.confinados} animais</dd>
            </div>
          )}
        </dl>

        {/* §14: a Lista de Compra NÃO aparece inteira, só o acesso a ela. */}
        {resumo.listaDeCompra > 0 && (
          <Link
            href="/lista-de-compra"
            className="mt-3 inline-flex min-h-11 items-center text-sm text-primaria-tinta hover:underline sm:min-h-0"
          >
            {resumo.comprasUrgentes > 0
              ? `Você tem ${resumo.comprasUrgentes} ${resumo.comprasUrgentes === 1 ? "compra urgente" : "compras urgentes"} na Lista de Compra`
              : `Você tem ${resumo.listaDeCompra} ${resumo.listaDeCompra === 1 ? "item" : "itens"} na Lista de Compra`}
          </Link>
        )}
      </section>
    </div>
  );
}
