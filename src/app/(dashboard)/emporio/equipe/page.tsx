import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarEquipeAction } from "@/lib/actions/emporio-equipe";
import { EMPORIO_SEATS } from "@/lib/seats";
import { EMPORIO_KEYS, papelDoEmporio, pode } from "@/lib/emporio/papel";
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
import { EquipeForm } from "./_components/equipe-form";
import { FUNCAO_ROTULO } from "./_components/funcao";
import { EquipeTirarBotao } from "./_components/equipe-tirar-botao";
import { EquipeReativarBotao } from "./_components/equipe-reativar-botao";

const ROTULO_DA_CHAVE = new Map<string, string>(EMPORIO_KEYS.map((k) => [k.id, k.label]));

/**
 * A Equipe do Empório (F6b, Q118): quem trabalha nas lojas e o que cada um
 * pode. Só o Dono e o Gerente geral; quem não pode volta ao início do Empório.
 */
export default async function EquipePage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!pode(papel, "conta")) redirect("/emporio");

  const res = await listarEquipeAction(db, user);
  const equipe = res.ok ? res.data : null;
  const lojas = equipe?.establishments ?? [];
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));
  const chaves = EMPORIO_KEYS.map((k) => ({ id: k.id, label: k.label }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Equipe</h1>
          {equipe && (
            <p className={`text-sm ${equipe.seats.has_room ? "text-texto-discreto" : "text-atencao-tinta"}`}>
              {equipe.seats.used} de {equipe.seats.limit} na equipe do Empório
              {!equipe.seats.has_room && ": desative alguém da equipe para cadastrar outra pessoa"}
            </p>
          )}
        </div>
        {equipe && <EquipeForm lojas={lojas} chaves={chaves} />}
      </header>

      <p className="text-sm text-texto-secundario">
        <strong className="font-medium text-texto">Gerente geral</strong> cuida de tudo do Empório, em todas as lojas.{" "}
        <strong className="font-medium text-texto">Gestor</strong> comanda as lojas dele e resolve diferença de
        transferência. <strong className="font-medium text-texto">Vendedor</strong> vende no balcão e só faz o que
        você liberar nas chaves. <strong className="font-medium text-texto">Caixa</strong> recebe o pagamento, recebe
        fiado e opera o caixa nas lojas dele, sem chaves; não abre produtos, estoque, compras, transferências nem a lista
        de orçamentos. O <strong className="font-medium text-texto">Dono</strong> é quem abriu a conta.
      </p>
      <p className="text-sm text-texto-secundario">
        A equipe do Empório é separada dos usuários do Tibé: cabe até {EMPORIO_SEATS} pessoas ativas e não
        ocupa assento do plano. Todos da equipe, o Gerente geral inclusive, veem só o Empório: não abrem a fazenda nem o
        Financeiro. Quem precisa da fazenda ganha outra conta em Configurações &gt; Usuários. Desativar guarda
        a função, as lojas e as chaves, e Reativar devolve a pessoa como estava.
      </p>

      {!equipe ? (
        <EmptyState titulo="Não consegui carregar a equipe">{res.ok ? "" : res.message}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Lojas</TableHead>
              <TableHead>Chaves</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipe.users.map((u) => {
              const dono = u.role === "OWNER";
              const funcao = u.emporio_role;
              // O servidor recusa: o Dono nunca se altera aqui, e o Gerente geral não mexe em administrador.
              const podeEditar = !dono && !(papel.papel === "gerente_geral" && u.role === "ADMIN");
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-texto">
                    {u.name}
                    {u.id === user.id && <span className="ml-1 text-xs text-texto-discreto">(você)</span>}
                    <span className="block text-xs font-normal text-texto-secundario">{u.email}</span>
                  </TableCell>
                  <TableCell>
                    {dono ? (
                      <Badge variant="green">Dono</Badge>
                    ) : funcao ? (
                      <Badge variant="green">{FUNCAO_ROTULO[funcao]}</Badge>
                    ) : (
                      <Badge variant="gray">Sem função</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dono || funcao === "gerente_geral" || funcao === "financeiro"
                      ? "Todas"
                      : funcao
                        ? u.establishment_ids.map((i) => nomeDaLoja.get(i) ?? "Loja arquivada").join(", ") || "Nenhuma"
                        : "Nenhuma"}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {funcao === "vendedor"
                      ? u.emporio_keys.map((k) => ROTULO_DA_CHAVE.get(k) ?? k).join(", ") || "Nenhuma"
                      : "Não se aplica"}
                  </TableCell>
                  <TableCell>
                    {podeEditar && (
                      <div className="flex flex-wrap gap-2">
                        <EquipeForm
                          lojas={lojas}
                          chaves={chaves}
                          membro={{
                            id: u.id,
                            name: u.name,
                            emporio_role: funcao,
                            establishment_ids: u.establishment_ids,
                            emporio_keys: u.emporio_keys,
                          }}
                        />
                        {funcao && <EquipeTirarBotao userId={u.id} nome={u.name} />}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {equipe && equipe.inactive_users.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-texto">Desativados</h2>
          <p className="text-sm text-texto-secundario">
            Não entram no Tibé e não ocupam vaga na equipe. Reativar devolve a pessoa com a função, as lojas e as chaves
            que tinha, se a equipe tiver vaga.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Lojas</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipe.inactive_users.map((u) => {
                const funcao = u.emporio_role;
                const podeReativar = !(papel.papel === "gerente_geral" && u.role === "ADMIN");
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-texto">
                      {u.name}
                      <span className="block text-xs font-normal text-texto-secundario">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      {funcao && <Badge variant="gray">{FUNCAO_ROTULO[funcao]}</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {funcao === "gerente_geral" || funcao === "financeiro"
                        ? "Todas"
                        : u.establishment_ids.map((i) => nomeDaLoja.get(i) ?? "Loja arquivada").join(", ") || "Nenhuma"}
                    </TableCell>
                    <TableCell>
                      {podeReativar ? (
                        <EquipeReativarBotao userId={u.id} nome={u.name} />
                      ) : (
                        <span className="text-xs text-texto-discreto">Só o dono reativa</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
